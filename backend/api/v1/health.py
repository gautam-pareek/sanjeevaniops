"""
Health Check Monitoring API endpoints.
FastAPI routes for health status and history.
"""

from fastapi import APIRouter, Query, status, Depends, HTTPException
from typing import Optional
import json
import sqlite3
from datetime import datetime, timezone

from backend.api.dependencies import get_db_connection, get_current_operator
from backend.api.v1.models.health_responses import (
    AppHealthStatusResponse,
    PaginatedHealthHistory,
    HealthCheckResultResponse,
    ManualCheckResponse,
    CrashEventResponse,
    CrashEventsListResponse,
)
from backend.repositories.health_repository import HealthRepository
from backend.repositories.application_repository import ApplicationRepository
from backend.repositories.recovery_repository import RecoveryRepository
from backend.exceptions.custom_exceptions import ApplicationNotFoundException

router = APIRouter(prefix="/applications", tags=["health"])

_health_repo = HealthRepository()
_app_repo = ApplicationRepository()
_recovery_repo = RecoveryRepository()


def _fetch_fresh_logs(container_name: str) -> Optional[str]:
    """Fetch the latest 100 log lines from a running container. Returns None on failure."""
    try:
        from backend.services.docker_service import DockerService
        svc = DockerService()
        if not svc._available:
            return None
        import docker as _docker_sdk
        client = _docker_sdk.from_env()
        container = client.containers.get(container_name)
        raw = container.logs(tail=100, timestamps=True)
        return raw.decode("utf-8", errors="replace") if raw else None
    except Exception:
        return None


def _enrich_events_with_fresh_logs(conn, events: list) -> list:
    """
    Replace container_logs on each crash event with live Docker logs.
    Batches by container name — one Docker call per unique container.
    Updates DB records so subsequent loads are fast.
    """
    # Build a map: container_name -> fresh_logs (fetch once per container)
    log_cache: dict = {}
    for e in events:
        name = e.get("container_name", "")
        if name and name not in log_cache:
            fresh = _fetch_fresh_logs(name)
            log_cache[name] = fresh  # may be None if container gone

    # Apply and persist
    for e in events:
        name = e.get("container_name", "")
        fresh = log_cache.get(name)
        if fresh:
            e["container_logs"] = fresh
            # Update DB so next page load reflects current logs without a Docker call
            try:
                conn.execute(
                    "UPDATE crash_events SET container_logs = ? WHERE event_id = ?",
                    (fresh, e["event_id"]),
                )
            except Exception:
                pass

    return events


# ============================================================================
# Current Health Status
# ============================================================================

@router.get(
    "/{app_id}/health/status",
    response_model=AppHealthStatusResponse,
    summary="Get current health status",
    description="Returns the current aggregated health status for an application.",
)
def get_health_status(
    app_id: str,
    conn: sqlite3.Connection = Depends(get_db_connection),
):
    """Get the current health status for an application."""
    app = _app_repo.get_application(conn, app_id)
    if not app:
        raise ApplicationNotFoundException(app_id)

    health_status = _health_repo.get_status(conn, app_id)

    if health_status is None:
        return AppHealthStatusResponse(
            app_id=app_id,
            current_status="unknown",
            consecutive_failures=0,
            consecutive_successes=0,
            last_checked_at=None,
            last_result_id=None,
            status_changed_at=app["registered_at"],
            first_failure_at=None,
        )

    return AppHealthStatusResponse(**health_status)


# ============================================================================
# Health Check History
# ============================================================================

@router.get(
    "/{app_id}/health/history",
    response_model=PaginatedHealthHistory,
    summary="Get health check history",
    description="Returns paginated health check results for an application, newest first.",
)
def get_health_history(
    app_id: str,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    status_filter: Optional[str] = Query(
        default=None,
        alias="status",
        description="Filter by result status: healthy | unhealthy | timeout | error",
    ),
    conn: sqlite3.Connection = Depends(get_db_connection),
):
    """Get paginated health check history for an application."""
    app = _app_repo.get_application(conn, app_id)
    if not app:
        raise ApplicationNotFoundException(app_id)

    valid_statuses = {"healthy", "unhealthy", "timeout", "error"}
    if status_filter and status_filter not in valid_statuses:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid status filter '{status_filter}'. Must be one of: {', '.join(valid_statuses)}",
        )

    results, total = _health_repo.list_results(
        conn=conn,
        app_id=app_id,
        limit=limit,
        offset=offset,
        status_filter=status_filter,
    )

    def _enrich_result(r):
        """Extract sub_checks from check_config JSON if present."""
        data = dict(r)
        try:
            config = json.loads(data.get("check_config", "{}")) if isinstance(data.get("check_config"), str) else data.get("check_config", {})
            sub_checks_raw = config.pop("sub_checks", None)
            data["check_config"] = config
            if sub_checks_raw:
                data["sub_checks"] = sub_checks_raw
        except Exception:
            pass
        return HealthCheckResultResponse(**data)

    return PaginatedHealthHistory(
        results=[_enrich_result(r) for r in results],
        total=total,
        limit=limit,
        offset=offset,
    )


# ============================================================================
# Manual Check Trigger
# ============================================================================

@router.post(
    "/{app_id}/health/check",
    response_model=ManualCheckResponse,
    summary="Trigger manual health check",
    description=(
        "Immediately trigger a health check for an application outside its normal schedule. "
        "The check runs asynchronously — poll /health/status for the result."
    ),
)
def trigger_manual_check(
    app_id: str,
    conn: sqlite3.Connection = Depends(get_db_connection),
):
    """Trigger an immediate, on-demand health check for an application."""
    app = _app_repo.get_application(conn, app_id)
    if not app:
        raise ApplicationNotFoundException(app_id)

    if app["status"] != "active":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Application {app_id} is not active. Only active applications can be checked.",
        )

    from monitoring.monitor_scheduler import scheduler
    scheduler.trigger_now(app_id)

    return ManualCheckResponse(
        app_id=app_id,
        message="Health check triggered. Poll /health/status for the result.",
        triggered=True,
    )


# ============================================================================
# All Apps Status Summary
# ============================================================================

@router.get(
    "/monitoring/summary",
    summary="Health status summary for all apps",
    description="Returns the current health status for every registered application.",
)
def get_all_health_statuses(
    conn: sqlite3.Connection = Depends(get_db_connection),
):
    """Get health status summary for all applications."""
    statuses = _health_repo.list_all_statuses(conn)
    return {
        "total": len(statuses),
        "statuses": statuses,
    }


# ============================================================================
# Monitoring Pause / Resume
# ============================================================================

from pydantic import BaseModel

class PauseRequest(BaseModel):
    reason: str | None = None

@router.post(
    "/{app_id}/monitoring/pause",
    summary="Pause health check monitoring",
    description="Stops health checks for this application without deleting it. Use resume to restart.",
)
def pause_monitoring(
    app_id: str,
    request: PauseRequest = PauseRequest(),
    conn: sqlite3.Connection = Depends(get_db_connection),
    operator: str = Depends(get_current_operator),
):
    """Pause health check monitoring for an application."""
    from backend.repositories.application_repository import ApplicationRepository
    from monitoring.monitor_scheduler import scheduler

    app_repo = ApplicationRepository()
    app = app_repo.get_application(conn, app_id)
    if not app:
        raise ApplicationNotFoundException(app_id)

    if app.get("monitoring_paused"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Monitoring is already paused for this application.",
        )

    app_repo.set_monitoring_paused(conn, app_id, paused=True, operator=operator, reason=request.reason)
    scheduler.remove_app(app_id)

    return {
        "app_id": app_id,
        "monitoring_paused": True,
        "paused_by": operator,
        "reason": request.reason,
        "message": "Health check monitoring paused. Use POST /monitoring/resume to restart.",
    }


@router.post(
    "/{app_id}/monitoring/resume",
    summary="Resume health check monitoring",
    description="Restarts health checks for a previously paused application.",
)
def resume_monitoring(
    app_id: str,
    conn: sqlite3.Connection = Depends(get_db_connection),
    operator: str = Depends(get_current_operator),
):
    """Resume health check monitoring for an application."""
    from backend.repositories.application_repository import ApplicationRepository
    from monitoring.monitor_scheduler import scheduler

    app_repo = ApplicationRepository()
    app = app_repo.get_application(conn, app_id)
    if not app:
        raise ApplicationNotFoundException(app_id)

    if not app.get("monitoring_paused"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Monitoring is not paused for this application.",
        )

    app_repo.set_monitoring_paused(conn, app_id, paused=False, operator=operator)
    interval = app["health_check_config"].get("interval_seconds", 30)
    scheduler.add_app(app_id, interval)

    return {
        "app_id": app_id,
        "monitoring_paused": False,
        "message": f"Health check monitoring resumed. Checks will run every {interval}s.",
    }


# ============================================================================
# Crash Events
# ============================================================================

@router.get(
    "/{app_id}/crash-events",
    response_model=CrashEventsListResponse,
    summary="List crash events",
    description="Returns captured crash events with Docker logs for an application.",
)
def list_crash_events(
    app_id: str,
    limit: int = Query(default=20, ge=1, le=100),
    conn: sqlite3.Connection = Depends(get_db_connection),
):
    app = _app_repo.get_application(conn, app_id)
    if not app:
        raise ApplicationNotFoundException(app_id)

    events = _health_repo.list_crash_events(conn, app_id, limit=limit)
    events = _enrich_events_with_fresh_logs(conn, events)
    return CrashEventsListResponse(
        events=[CrashEventResponse(**e) for e in events],
        total=len(events),
    )


@router.get(
    "/{app_id}/crash-events/{event_id}",
    response_model=CrashEventResponse,
    summary="Get crash event detail",
    description="Returns a single crash event including full Docker logs.",
)
def get_crash_event(
    app_id: str,
    event_id: str,
    conn: sqlite3.Connection = Depends(get_db_connection),
):
    app = _app_repo.get_application(conn, app_id)
    if not app:
        raise ApplicationNotFoundException(app_id)

    event = _health_repo.get_crash_event(conn, event_id)
    if not event or event["app_id"] != app_id:
        raise HTTPException(status_code=404, detail="Crash event not found")

    events = _enrich_events_with_fresh_logs(conn, [event])
    return CrashEventResponse(**events[0])


# ============================================================================
# AI Log Analysis + Recovery Playbook
# ============================================================================

@router.post(
    "/{app_id}/crash-events/{event_id}/analyze",
    summary="Analyze crash event with AI",
    description="Analyzes crash event using deterministic sub-check evidence + AI fix suggestions.",
)
def analyze_crash_event(
    app_id: str,
    event_id: str,
    conn: sqlite3.Connection = Depends(get_db_connection),
):
    """
    Analyze a crash event.

    crash_reason, severity, category, and playbook_steps are built DETERMINISTICALLY
    from health check sub-check failures — no hallucination possible.

    AI is only used for the natural-language fix narrative and structured fix_steps.
    """
    app = _app_repo.get_application(conn, app_id)
    if not app:
        raise ApplicationNotFoundException(app_id)

    event = _health_repo.get_crash_event(conn, event_id)
    if not event or event["app_id"] != app_id:
        raise HTTPException(status_code=404, detail="Crash event not found")

    from ai_engine.ai_service import ai_service

    # ── Extract previous analysis context if re-analyzing ────────────────────
    previous_summary = None
    if event.get("ai_analysis"):
        try:
            prev = json.loads(event["ai_analysis"]) if isinstance(event["ai_analysis"], str) else event["ai_analysis"]
            previous_summary = prev.get("crash_reason", "")
        except (json.JSONDecodeError, TypeError):
            pass

    # ── Build crash_reason DETERMINISTICALLY from health check sub-checks ────
    failed_checks = []
    all_sub_checks = []
    trigger_error = None
    trigger_result_id = event.get("triggered_by_result_id")

    if trigger_result_id:
        trigger_result = _health_repo.get_result(conn, trigger_result_id)
        if trigger_result:
            trigger_error = trigger_result.get("error_message")
            config = trigger_result.get("check_config")
            if isinstance(config, str):
                try:
                    config = json.loads(config)
                except json.JSONDecodeError:
                    config = {}
            if isinstance(config, dict) and "sub_checks" in config:
                all_sub_checks = config["sub_checks"]
                failed_checks = [sc for sc in all_sub_checks if not sc.get("passed")]

    # Build factual crash_reason (NO AI)
    if failed_checks:
        failure_descriptions = [f"{sc.get('name', '?')}: {sc.get('message', 'failed')}" for sc in failed_checks]
        crash_reason = "Health check failed — " + "; ".join(failure_descriptions)
    elif trigger_error:
        crash_reason = f"Health check reported: {trigger_error}"
    else:
        crash_reason = "Container became unhealthy (no specific sub-check data available)"

    # ── Determine severity + category (NO AI) ────────────────────────────────
    severity = "low"
    category = "unknown"
    failure_names = [sc.get("name", "").lower() for sc in failed_checks]
    failure_messages = " ".join(sc.get("message", "").lower() for sc in failed_checks)

    if any("status" in n for n in failure_names) and ("4" in failure_messages or "5" in failure_messages):
        severity = "high"
        category = "configuration"
    if any("keyword" in n or "body" in n for n in failure_names):
        severity = "medium"
        category = "application_bug"
    if any("restart" in n for n in failure_names):
        severity = "critical"
        category = "resource"
    if any("timeout" in n or "time" in n for n in failure_names) and "critical" in failure_messages:
        severity = "high"
        category = "resource"

    # ── Build Recovery Playbook (NO AI) ──────────────────────────────────────
    playbook_steps = []
    files_to_check = set()
    container_name = event.get("container_name", "<container>")

    for sc in failed_checks:
        name = sc.get("name", "").lower()
        msg  = sc.get("message", "")       # keep original case for URL extraction
        msg_lower = msg.lower()

        if "status" in name:
            if "404" in msg_lower:
                playbook_steps.append(
                    f"The URL returned HTTP 404 — verify the path exists in your server config (nginx/apache/express)"
                )
                playbook_steps.append(
                    "Check that the static file or route handler exists at the failing URL path"
                )
                files_to_check.update(["nginx.conf", "routes/", "app.js", "server.js"])
            elif any(x in msg_lower for x in ["500", "502", "503", "5"]):
                playbook_steps.append(
                    "The server is returning a 5xx error — check application error logs for the exception"
                )
                playbook_steps.append(
                    "Look for uncaught exceptions, missing environment variables, or failed DB connections"
                )
                files_to_check.update(["app.js", "server.js", ".env", "docker-compose.yml"])

        if "keyword" in name or "body" in name:
            playbook_steps.append(
                "The response body contains error text — grep app logs for the full exception stack trace"
            )
            playbook_steps.append(
                "Inspect the route handler or template file serving this URL and remove or handle the error condition"
            )
            files_to_check.update(["app.js", "server.js", "index.js", "controllers/"])

        if "restart" in name:
            playbook_steps.append(
                f"Container is crash-looping — run: docker events --filter container={container_name} --since 1h"
            )
            playbook_steps.append(
                "Check memory/CPU limits in docker-compose.yml — OOM kills cause restart loops"
            )
            playbook_steps.append(
                "Run: docker stats to see live resource usage"
            )
            files_to_check.update(["docker-compose.yml", ".env"])

        if ("time" in name or "response" in name) and "critical" in msg_lower:
            playbook_steps.append(
                "Response time is critically slow — profile DB queries and external HTTP calls"
            )
            playbook_steps.append(
                "Check connection pool settings and look for N+1 query problems in your data layer"
            )
            files_to_check.update(["database.js", "db.py", "config.py", "models/"])

        if "json" in name:
            playbook_steps.append(
                "API is not returning valid JSON — it may be returning an HTML error page"
            )
            playbook_steps.append(
                "Check the error handler middleware — it may be sending HTML for 4xx/5xx"
            )
            files_to_check.update(["api/", "handlers/", "middleware/", "controllers/"])

        if "endpoint" in name:
            # Extract the URL path from the message to identify the specific file
            import re as _re
            url_match = _re.search(r'https?://[^\s]+?(/[^\s\u2192]*)', msg)
            url_path = url_match.group(1).rstrip(" \t\r\n") if url_match else None
            # Derive the likely filename from the URL path (e.g. /checkout.html → checkout.html)
            specific_file = url_path.lstrip("/").split("?")[0] if url_path else None

            if url_path and "body contains error" in msg_lower:
                playbook_steps.append(
                    f"Endpoint {url_path} returns 200 but its response body contains error text"
                )
                playbook_steps.append(
                    f"Open '{specific_file}' inside the container and remove or fix the error content"
                )
                if specific_file:
                    files_to_check.add(specific_file)
            elif url_path and "broken redirect" in msg_lower:
                # Extract the redirect destination from the message
                # Message format: "{url} → {codes} → {final_url} → {status} (broken redirect)"
                import re as _re2
                dest_match = _re2.search(r'→\s*(https?://\S+)\s*→\s*\d+\s*\(broken redirect\)', msg)
                redirect_dest = dest_match.group(1) if dest_match else None
                playbook_steps.append(
                    f"Endpoint {url_path} redirects but the destination returns a 404"
                )
                if redirect_dest:
                    playbook_steps.append(
                        f"The redirect is pointing to '{redirect_dest}' which does not exist — "
                        f"fix the redirect target in your server config"
                    )
                else:
                    playbook_steps.append(
                        "Check your server's redirect rules — the redirect target URL has a typo or points to a missing path"
                    )
                playbook_steps.append(
                    "Open nginx.conf (or your reverse-proxy config) and correct the redirect destination path"
                )
                files_to_check.update(["nginx.conf", "nginx/default.conf", "nginx/conf.d/"])
            elif url_path and ("404" in msg_lower or "not found" in msg_lower):
                # Live-probe: old sub-check records lack redirect info.
                # Re-check the full URL from the message to detect broken redirects.
                _is_broken_redirect = False
                _redirect_dest = None
                try:
                    import requests as _req
                    _full_url_match = _re.search(r'https?://[^\s→]+', msg)
                    _probe_url = _full_url_match.group(0).rstrip(" \t\r\n→") if _full_url_match else None
                    _probe = _req.get(_probe_url, allow_redirects=True, timeout=3) if _probe_url else None
                    if _probe is not None and _probe.history and _probe.status_code >= 400:
                        _is_broken_redirect = True
                        _redirect_dest = _probe.url
                except Exception:
                    pass

                if _is_broken_redirect:
                    playbook_steps.append(
                        f"Endpoint {url_path} redirects but the destination returns a 404"
                    )
                    playbook_steps.append(
                        f"The redirect is pointing to '{_redirect_dest}' which does not exist — "
                        f"fix the redirect target in your server config"
                    )
                    playbook_steps.append(
                        "Open nginx.conf (or your reverse-proxy config) and correct the redirect destination path"
                    )
                    files_to_check.update(["nginx.conf", "nginx/default.conf", "nginx/conf.d/"])
                else:
                    playbook_steps.append(
                        f"Endpoint {url_path} returned 404 — the file or route does not exist"
                    )
                    playbook_steps.append(
                        f"Create or restore '{specific_file}' in your project and rebuild the container"
                    )
                    if specific_file:
                        files_to_check.add(specific_file)
            else:
                playbook_steps.append(
                    f"Endpoint check failed: {msg}"
                )
                playbook_steps.append("Check the route handler for that specific endpoint path")
            files_to_check.update(["routes/", "controllers/", "api/"])

    # Always add diagnostic commands
    diagnostic_commands = [
        f"docker logs {container_name} --tail 100",
        f"docker inspect {container_name} --format '{{{{.State}}}}'",
        f"docker stats {container_name} --no-stream",
    ]

    # ── Use AI ONLY for structured fix steps ─────────────────────────────────
    health_context = "\n".join(
        f"  [{'PASS' if sc.get('passed') else 'FAIL'}] {sc.get('name','?')}: {sc.get('message','')}"
        for sc in all_sub_checks
    ) if all_sub_checks else None

    # Fetch fresh container logs at analysis time
    fresh_logs = _fetch_fresh_logs(container_name) or event.get("container_logs")

    fix_dict = None
    ai_available = ai_service.is_available()
    suggested_fix = "Review the failing health checks and apply the playbook steps above."

    if ai_available:
        fix_dict = ai_service.get_fix_suggestion(
            container_name=container_name,
            crash_reason=crash_reason,
            health_context=health_context,
            container_logs=fresh_logs,
        )
        if fix_dict:
            # Extract plain-text suggested_fix from steps for backward compat
            steps = fix_dict.get("steps", [])
            if steps:
                suggested_fix = " → ".join(steps[:3])

    analysis = {
        "crash_reason": crash_reason,
        "suggested_fix": suggested_fix,
        "severity": severity,
        "category": category,
        # Recovery Playbook fields (deterministic)
        "playbook_steps": playbook_steps,
        "files_to_check": sorted(files_to_check),
        "diagnostic_commands": diagnostic_commands,
        # AI structured fix (may be None if AI unavailable)
        "fix_steps": fix_dict.get("steps", []) if fix_dict else [],
        "commands": fix_dict.get("commands", diagnostic_commands) if fix_dict else diagnostic_commands,
        "quick_check": fix_dict.get("quick_check", "") if fix_dict else "",
        "success": True,
        "analyzed_at": datetime.now(timezone.utc).isoformat(),
        "model_used": ai_service.model,
        "ai_available": ai_available,
    }

    # Persist to DB — also refresh stored logs so the panel shows current data
    _health_repo.update_crash_event_analysis(conn, event_id, json.dumps(analysis), container_logs=fresh_logs)

    return {
        "event_id": event_id,
        "analysis": analysis,
    }


# ============================================================================
# Container Restart (Temporary Relief)
# ============================================================================

class RestartRequest(BaseModel):
    pass  # No body needed — operator comes from header

@router.post(
    "/{app_id}/crash-events/{event_id}/restart",
    summary="Restart container (temporary relief)",
    description=(
        "Restarts the container associated with this crash event. "
        "This is a TEMPORARY measure — the crash will recur unless the root cause is fixed. "
        "Every restart is logged to the recovery_actions audit table."
    ),
)
def restart_container(
    app_id: str,
    event_id: str,
    conn: sqlite3.Connection = Depends(get_db_connection),
    operator: str = Depends(get_current_operator),
):
    """
    Restart the container linked to a crash event.
    Logs the action to recovery_actions for audit trail.
    """
    app = _app_repo.get_application(conn, app_id)
    if not app:
        raise ApplicationNotFoundException(app_id)

    event = _health_repo.get_crash_event(conn, event_id)
    if not event or event["app_id"] != app_id:
        raise HTTPException(status_code=404, detail="Crash event not found")

    container_name = event.get("container_name", "")
    if not container_name:
        raise HTTPException(status_code=400, detail="No container name associated with this crash event")

    # Perform the restart
    from backend.services.docker_service import DockerService
    docker_svc = DockerService()
    result = docker_svc.restart_container(container_name)

    # Log to recovery_actions regardless of success/failure
    action_id = _recovery_repo.create_action(
        conn=conn,
        app_id=app_id,
        container_name=container_name,
        requested_by=operator,
        status="executed" if result["success"] else "failed",
        result_message=result["message"],
        event_id=event_id,
        action_type="restart",
    )

    return {
        "action_id": action_id,
        "success": result["success"],
        "message": result["message"],
        "restarted_at": result.get("restarted_at"),
        "warning": (
            "Container restarted. This is a temporary fix — the crash will recur "
            "unless you address the root cause identified in the Recovery Playbook."
        ) if result["success"] else None,
    }


# ============================================================================
# Recovery Actions History
# ============================================================================

@router.get(
    "/{app_id}/recovery-actions",
    summary="List recovery actions",
    description="Returns the audit log of container restarts for an application.",
)
def list_recovery_actions(
    app_id: str,
    limit: int = Query(default=20, ge=1, le=100),
    conn: sqlite3.Connection = Depends(get_db_connection),
):
    """Get recovery action history for an application."""
    app = _app_repo.get_application(conn, app_id)
    if not app:
        raise ApplicationNotFoundException(app_id)

    actions = _recovery_repo.list_actions(conn, app_id, limit=limit)
    return {
        "app_id": app_id,
        "actions": actions,
        "total": len(actions),
    }


# ============================================================================
# AI Status + Chat
# ============================================================================

@router.get(
    "/ai/status",
    summary="Check AI engine availability",
    description="Returns whether Ollama is running and the required model is available.",
)
def get_ai_status():
    """Check if the AI analysis engine is available."""
    from ai_engine.ai_service import ai_service

    available = ai_service.is_available()
    return {
        "available": available,
        "model": ai_service.model,
        "ollama_url": ai_service.base_url,
        "message": "AI engine ready" if available else f"Ollama not running or model '{ai_service.model}' not installed. Run: ollama pull {ai_service.model}",
    }


class AIChatRequest(BaseModel):
    message: str
    context: Optional[str] = None


@router.post(
    "/ai/chat",
    summary="Chat with SanjeevaniOps AI Assistant",
    description="Send a message to the AI assistant. Only answers DevOps/monitoring questions.",
)
def ai_chat(body: AIChatRequest):
    """Chat with the scoped AI assistant."""
    from ai_engine.ai_service import ai_service

    if not ai_service.is_available():
        return {
            "success": False,
            "response": f"AI engine is offline. Make sure Ollama is running and '{ai_service.model}' model is pulled.",
        }

    result = ai_service.chat(message=body.message, context=body.context or "")
    return result
