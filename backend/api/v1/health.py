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
from backend.exceptions.custom_exceptions import ApplicationNotFoundException

router = APIRouter(prefix="/applications", tags=["health"])

_health_repo = HealthRepository()
_app_repo = ApplicationRepository()


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
    # Ensure app exists
    app = _app_repo.get_application(conn, app_id)
    if not app:
        raise ApplicationNotFoundException(app_id)

    health_status = _health_repo.get_status(conn, app_id)

    if health_status is None:
        # App exists but has never been checked yet
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
    # Ensure app exists
    app = _app_repo.get_application(conn, app_id)
    if not app:
        raise ApplicationNotFoundException(app_id)

    # Validate status filter
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

    # Import here to avoid circular imports at module load
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

    return CrashEventResponse(**event)


# ============================================================================
# AI Log Analysis
# ============================================================================

@router.post(
    "/{app_id}/crash-events/{event_id}/analyze",
    summary="Analyze crash event with AI",
    description="Send crash event logs to local Ollama LLM for root-cause analysis and suggested fixes.",
)
def analyze_crash_event(
    app_id: str,
    event_id: str,
    conn: sqlite3.Connection = Depends(get_db_connection),
):
    """Analyze a crash event's Docker logs using local Ollama AI."""
    app = _app_repo.get_application(conn, app_id)
    if not app:
        raise ApplicationNotFoundException(app_id)

    event = _health_repo.get_crash_event(conn, event_id)
    if not event or event["app_id"] != app_id:
        raise HTTPException(status_code=404, detail="Crash event not found")

    # Import AI service
    from ai_engine.ai_service import ai_service

    if not ai_service.is_available():
        raise HTTPException(
            status_code=503,
            detail="Ollama is not running or model is not installed. Run: ollama pull llama3.2:1b",
        )

    # Extract previous analysis context if re-analyzing
    previous_summary = None
    if event.get("ai_analysis"):
        try:
            prev = json.loads(event["ai_analysis"]) if isinstance(event["ai_analysis"], str) else event["ai_analysis"]
            previous_summary = prev.get("crash_reason", "")
        except (json.JSONDecodeError, TypeError):
            pass

    # ── Build crash_reason DETERMINISTICALLY from health check sub-checks ──
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

    # Build factual crash_reason from failed sub-checks (NO AI)
    if failed_checks:
        failure_descriptions = [f"{sc.get('name', '?')}: {sc.get('message', 'failed')}" for sc in failed_checks]
        crash_reason = "Health check failed — " + "; ".join(failure_descriptions)
    elif trigger_error:
        crash_reason = f"Health check reported: {trigger_error}"
    else:
        crash_reason = "Container became unhealthy (no specific sub-check data available)"

    # Determine severity from sub-check failures (NO AI)
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

    # ── Use AI ONLY for suggested_fix (the part that benefits from reasoning) ──
    suggested_fix = "Review the failing health checks and fix the underlying issue."
    health_context = "\n".join(
        f"  [{('PASS' if sc.get('passed') else 'FAIL')}] {sc.get('name','?')}: {sc.get('message','')}"
        for sc in all_sub_checks
    ) if all_sub_checks else None

    ai_fix = ai_service.get_fix_suggestion(
        container_name=event.get("container_name", "unknown"),
        crash_reason=crash_reason,
        health_context=health_context,
    )
    if ai_fix:
        suggested_fix = ai_fix

    analysis = {
        "crash_reason": crash_reason,
        "suggested_fix": suggested_fix,
        "severity": severity,
        "category": category,
        "success": True,
        "analyzed_at": datetime.now(timezone.utc).isoformat(),
        "model_used": ai_service.model,
    }

    if analysis.get("success"):
        # Persist to DB
        _health_repo.update_crash_event_analysis(
            conn, event_id, json.dumps(analysis)
        )

    return {
        "event_id": event_id,
        "analysis": analysis,
    }


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
        "message": "AI engine ready" if available else "Ollama not running or model not installed. Run: ollama pull llama3.2:1b",
    }


from pydantic import BaseModel


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
            "response": "AI engine is offline. Make sure Ollama is running and llama3.2:1b model is pulled.",
        }

    result = ai_service.chat(message=body.message, context=body.context or "")
    return result

