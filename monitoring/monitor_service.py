"""
Monitor service.
Orchestrates health check execution for a single application:
  1. Runs the appropriate check via HealthChecker
  2. Persists the result to health_check_results
  3. Updates app_health_status (consecutive counts, status transitions)
  4. Logs human-readable events for observability

Human-in-the-loop constraint: this service ONLY records and reports.
It never triggers recovery actions. That is Feature 4's responsibility.
"""

import json
import logging
import threading
from datetime import datetime, timezone
from typing import Dict, Any

from backend.core.database import db
from backend.repositories.health_repository import HealthRepository
from backend.repositories.application_repository import ApplicationRepository
from backend.repositories.recovery_repository import RecoveryRepository
from backend.services.docker_service import DockerService
from monitoring.health_checker import HealthChecker, CheckResult

logger = logging.getLogger(__name__)


class MonitorService:
    """
    Runs health checks for registered applications and persists outcomes.
    One instance is shared across all scheduled jobs.
    """

    def __init__(self):
        self._checker = HealthChecker()
        self._health_repo = HealthRepository()
        self._app_repo = ApplicationRepository()
        self._recovery_repo = RecoveryRepository()
        self._docker = DockerService()

    # ------------------------------------------------------------------
    # Public: called by the scheduler for each app
    # ------------------------------------------------------------------

    def run_check_for_app(self, app_id: str, is_manual: bool = False) -> None:
        """
        Execute and persist a health check for a single app.
        is_manual: if True, bypasses the monitoring_paused check.
        """
        try:
            self._execute_and_persist(app_id, is_manual=is_manual)
        except Exception as e:
            logger.error("[HEALTH CHECK ERROR] app=%s error=%s", app_id, e, exc_info=True)

    # ------------------------------------------------------------------
    # Internal: check execution and persistence
    # ------------------------------------------------------------------

    def _execute_and_persist(self, app_id: str, is_manual: bool = False) -> None:
        with db.get_connection() as conn:
            app = self._app_repo.get_application(conn, app_id)
            if not app:
                return

            if app["status"] != "active":
                return

            # Manual checks bypass the "paused" flag
            if app.get("monitoring_paused") and app.get("paused_by") and not is_manual:
                logger.debug("Health check skipped — app %s is paused by %s", app_id, app.get("paused_by"))
                return

            hc_config: Dict[str, Any] = app["health_check_config"]
            check_type: str = hc_config["type"]
            timeout: int = hc_config.get("timeout_seconds", 5)
            failure_threshold: int = hc_config.get("failure_threshold", 3)
            success_threshold: int = hc_config.get("success_threshold", 1)
            container_name: str = app["container_name"]

            # Merge timeout into the inner config so the checker respects it
            inner_config = dict(hc_config.get("config", {}))
            inner_config["timeout_seconds"] = timeout

            # Check container state first — if not running, immediately unhealthy
            container_info = self._docker.get_container_by_name(container_name)
            if container_info is not None and container_info.get("status", "").lower() != "running":
                result = CheckResult(
                    status="unhealthy",
                    response_time_ms=None,
                    error_message=f"Container is {container_info.get('status', 'not running')} — expected running",
                )
                # Read previous status BEFORE updating
                current_status_row = self._health_repo.get_status(conn, app_id)
                prev_status = current_status_row["current_status"] if current_status_row else "unknown"
                consecutive_failures = (current_status_row["consecutive_failures"] if current_status_row else 0) + 1
                first_failure_at = (
                    current_status_row.get("first_failure_at") if current_status_row and current_status_row.get("first_failure_at")
                    else datetime.now(timezone.utc).isoformat()
                )

                # Persist result
                result_id = self._health_repo.insert_result(
                    conn=conn,
                    app_id=app_id,
                    status=result.status,
                    check_type=check_type,
                    check_config=inner_config,
                    response_time_ms=result.response_time_ms,
                    error_message=result.error_message,
                    sub_checks=result.sub_checks,
                )
                self._health_repo.upsert_status(
                    conn=conn,
                    app_id=app_id,
                    current_status="unhealthy",
                    consecutive_failures=consecutive_failures,
                    consecutive_successes=0,
                    last_result_id=result_id,
                    first_failure_at=first_failure_at,
                )
                # Capture crash event only on first transition to unhealthy
                if prev_status != "unhealthy":
                    self._capture_crash_event(conn, app_id, container_name, result_id)
                return

            # Execute check
            result: CheckResult = self._checker.run_check(
                check_type=check_type,
                config=inner_config,
                container_name=container_name,
            )

            # Persist result
            result_id = self._health_repo.insert_result(
                conn=conn,
                app_id=app_id,
                status=result.status,
                check_type=check_type,
                check_config=inner_config,
                response_time_ms=result.response_time_ms,
                error_message=result.error_message,
                sub_checks=result.sub_checks,
            )

            # Load current status to compute streak counters
            current_status_row = self._health_repo.get_status(conn, app_id)
            consecutive_failures = (
                current_status_row["consecutive_failures"] if current_status_row else 0
            )
            consecutive_successes = (
                current_status_row["consecutive_successes"] if current_status_row else 0
            )
            first_failure_at = (
                current_status_row.get("first_failure_at") if current_status_row else None
            )

            # Update streak counters
            if result.status == "healthy":
                consecutive_successes += 1
                consecutive_failures = 0
                first_failure_at = None
            else:
                consecutive_failures += 1
                consecutive_successes = 0
                if consecutive_failures == 1:
                    first_failure_at = datetime.now(timezone.utc).isoformat()

            # Determine new aggregate status
            new_status = self._compute_aggregate_status(
                result=result,
                consecutive_failures=consecutive_failures,
                consecutive_successes=consecutive_successes,
                failure_threshold=failure_threshold,
                success_threshold=success_threshold,
                previous_status=(
                    current_status_row["current_status"]
                    if current_status_row
                    else "unknown"
                ),
            )

            # Persist updated status
            self._health_repo.upsert_status(
                conn=conn,
                app_id=app_id,
                current_status=new_status,
                consecutive_failures=consecutive_failures,
                consecutive_successes=consecutive_successes,
                last_result_id=result_id,
                first_failure_at=first_failure_at,
            )

            # Capture crash event if status just flipped to unhealthy
            previous_status = current_status_row["current_status"] if current_status_row else "unknown"
            if new_status == "unhealthy" and previous_status != "unhealthy":
                event_id = self._capture_crash_event(conn, app_id, container_name, result_id)
                # Trigger auto-recovery if the app's policy enables it
                self._maybe_auto_restart(app, container_name, event_id, first_failure_at)
            elif new_status == "unhealthy":
                # Already unhealthy — check if a scheduled restart is still warranted
                # (e.g. first auto-restart didn't bring it back)
                self._maybe_auto_restart(app, container_name, None, first_failure_at)

            self._log_outcome(app_id, container_name, result, new_status, consecutive_failures)

    # ------------------------------------------------------------------
    # Status transition logic
    # ------------------------------------------------------------------

    def _compute_aggregate_status(
        self,
        result: CheckResult,
        consecutive_failures: int,
        consecutive_successes: int,
        failure_threshold: int,
        success_threshold: int,
        previous_status: str,
    ) -> str:
        """
        Compute the new aggregate health status.

        Rules:
        - A single check result does not immediately flip the status.
        - Status becomes 'unhealthy' only after consecutive_failures >= failure_threshold.
        - Status returns to 'healthy' only after consecutive_successes >= success_threshold.
        - While counts are building, status remains as it was (hysteresis).
        - 'error' results count as failures.
        - 'timeout' results count as failures.
        """
        if result.status == "healthy":
            if consecutive_successes >= success_threshold:
                return "healthy"
            # Not enough successes yet — keep previous status (or unknown if brand new)
            return previous_status if previous_status != "unknown" else "unhealthy"
        else:
            # Failure / timeout / error
            if consecutive_failures >= failure_threshold:
                return "unhealthy"
            # Not enough failures yet — keep previous status
            return previous_status if previous_status != "unknown" else "healthy"

    # ------------------------------------------------------------------
    # Logging
    # ------------------------------------------------------------------

    def _capture_crash_event(
        self, conn, app_id: str, container_name: str, result_id: str
    ) -> str | None:
        """Pull Docker logs and store as a crash event. Returns the event_id or None."""
        try:
            # Avoid duplicate crash events for the same result
            if self._health_repo.crash_event_exists_for_result(conn, result_id):
                return

            logs = ""
            container_status = "unknown"
            exit_code = None

            if self._docker._available:
                try:
                    import docker as docker_sdk
                    client = docker_sdk.from_env()
                    container = client.containers.get(container_name)
                    container_status = container.status
                    exit_code = container.attrs.get("State", {}).get("ExitCode")
                    # Get last 100 lines of logs
                    raw_logs = container.logs(tail=100, timestamps=True)
                    logs = raw_logs.decode("utf-8", errors="replace") if raw_logs else ""
                except Exception as docker_err:
                    logs = f"[Could not retrieve logs: {docker_err}]"
            else:
                logs = "[Docker unavailable — logs not captured]"

            event_id = self._health_repo.insert_crash_event(
                conn=conn,
                app_id=app_id,
                container_name=container_name,
                triggered_by_result_id=result_id,
                container_logs=logs,
                container_status=container_status,
                exit_code=exit_code,
            )
            logger.info(
                "[CRASH EVENT] app=%s container=%s event_id=%s — logs captured (%d chars)",
                app_id, container_name, event_id, len(logs),
            )
            return event_id
        except Exception as e:
            logger.error("Failed to capture crash event for app %s: %s", app_id, str(e))
        return None

    def _maybe_auto_restart(
        self,
        app: Dict[str, Any],
        container_name: str,
        event_id: str | None,
        first_failure_at: str | None,
    ) -> None:
        """
        Schedule a delayed container restart if the app's recovery policy allows it.
        Uses first_failure_at as the window for counting prior auto-restarts so the
        counter resets if the app recovers and fails again later.
        """
        policy = app.get("recovery_policy_config", {})
        if not policy.get("enabled"):
            return

        max_attempts = int(policy.get("max_restart_attempts", 3))
        base_delay = float(policy.get("restart_delay_seconds", 30))
        backoff = float(policy.get("backoff_multiplier", 1.5))
        app_id = app["app_id"]

        # Count how many auto-restarts have already been done in this failure episode
        since = first_failure_at or datetime.now(timezone.utc).isoformat()
        with db.get_connection() as conn:
            attempts_done = self._recovery_repo.count_auto_restarts_since(conn, app_id, since)

        if attempts_done >= max_attempts:
            logger.warning(
                "[AUTO-RECOVERY] app=%s exhausted max attempts (%d/%d) — manual intervention required",
                app_id, attempts_done, max_attempts,
            )
            return

        delay = base_delay * (backoff ** attempts_done)
        logger.info(
            "[AUTO-RECOVERY] app=%s scheduling restart in %.0fs (attempt %d/%d)",
            app_id, delay, attempts_done + 1, max_attempts,
        )

        def _do_restart():
            try:
                result = self._docker.restart_container(container_name)
                with db.get_connection() as conn:
                    self._recovery_repo.create_action(
                        conn=conn,
                        app_id=app_id,
                        container_name=container_name,
                        requested_by="auto-recovery",
                        status="executed" if result["success"] else "failed",
                        result_message=result["message"],
                        event_id=event_id,
                        action_type="restart",
                    )
                logger.info(
                    "[AUTO-RECOVERY] app=%s restart %s: %s",
                    app_id, "succeeded" if result["success"] else "failed", result["message"],
                )
            except Exception as exc:
                logger.error("[AUTO-RECOVERY] app=%s restart error: %s", app_id, exc)

        t = threading.Timer(delay, _do_restart)
        t.daemon = True
        t.start()

    def _log_outcome(
        self,
        app_id: str,
        container_name: str,
        result: CheckResult,
        aggregate_status: str,
        consecutive_failures: int,
    ) -> None:
        if result.status == "healthy":
            logger.info(
                "[HEALTHY] app=%s container=%s response_time=%sms",
                app_id,
                container_name,
                result.response_time_ms,
            )
        else:
            logger.warning(
                "[%s] app=%s container=%s failures=%d error=%s",
                result.status.upper(),
                app_id,
                container_name,
                consecutive_failures,
                result.error_message,
            )

            if aggregate_status == "unhealthy":
                logger.error(
                    "[STATUS CHANGE -> UNHEALTHY] app=%s container=%s — "
                    "failure threshold reached. Human review required.",
                    app_id,
                    container_name,
                )
