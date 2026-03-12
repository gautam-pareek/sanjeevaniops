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
from datetime import datetime, timezone
from typing import Dict, Any

from backend.core.database import db
from backend.repositories.health_repository import HealthRepository
from backend.repositories.application_repository import ApplicationRepository
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

    # ------------------------------------------------------------------
    # Public: called by the scheduler for each app
    # ------------------------------------------------------------------

    def run_check_for_app(self, app_id: str) -> None:
        """
        Execute a health check for the given application and persist the result.
        Designed to be called from a background scheduler thread.

        Never raises — all exceptions are caught and logged so the scheduler
        job does not die on individual app failures.
        """
        try:
            self._execute_and_persist(app_id)
        except Exception as e:
            logger.error(
                "Unhandled error in health check for app %s: %s",
                app_id,
                str(e),
                exc_info=True,
            )

    # ------------------------------------------------------------------
    # Internal: check execution and persistence
    # ------------------------------------------------------------------

    def _execute_and_persist(self, app_id: str) -> None:
        with db.get_connection() as conn:
            # Load application config
            app = self._app_repo.get_application(conn, app_id)
            if not app:
                logger.warning("Health check skipped — app %s not found", app_id)
                return

            if app["status"] != "active":
                logger.debug("Health check skipped — app %s is inactive", app_id)
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

            logger.debug(
                "Running %s health check for app %s (%s)",
                check_type,
                app_id,
                container_name,
            )

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
