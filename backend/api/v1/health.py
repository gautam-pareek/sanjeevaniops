"""
Health Check Monitoring API endpoints.
FastAPI routes for health status and history.
"""

from fastapi import APIRouter, Query, status, Depends, HTTPException
from typing import Optional
import sqlite3

from backend.api.dependencies import get_db_connection, get_current_operator
from backend.api.v1.models.health_responses import (
    AppHealthStatusResponse,
    PaginatedHealthHistory,
    HealthCheckResultResponse,
    ManualCheckResponse,
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

    return PaginatedHealthHistory(
        results=[HealthCheckResultResponse(**r) for r in results],
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
