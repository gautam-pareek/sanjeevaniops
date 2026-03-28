"""
Response models for Health Check Monitoring API.
"""

from pydantic import BaseModel
from typing import List, Optional, Dict, Any


class SubCheckResultResponse(BaseModel):
    """Result of a single sub-check."""
    name: str
    passed: bool
    message: str


class HealthCheckResultResponse(BaseModel):
    """Single health check result."""
    result_id: str
    app_id: str
    status: str
    response_time_ms: Optional[int]
    error_message: Optional[str]
    check_type: str
    check_config: Dict[str, Any]
    checked_at: str
    sub_checks: Optional[List[SubCheckResultResponse]] = None


class AppHealthStatusResponse(BaseModel):
    """Current health status of an application."""
    app_id: str
    current_status: str                 # healthy | unhealthy | unknown | error
    consecutive_failures: int
    consecutive_successes: int
    last_checked_at: Optional[str]
    last_result_id: Optional[str]
    status_changed_at: str
    first_failure_at: Optional[str]


class PaginatedHealthHistory(BaseModel):
    """Paginated health check result history."""
    results: List[HealthCheckResultResponse]
    total: int
    limit: int
    offset: int


class ManualCheckResponse(BaseModel):
    """Response to a manual health check trigger."""
    app_id: str
    message: str
    triggered: bool

class CrashEventResponse(BaseModel):
    """A single crash event with captured Docker logs."""
    event_id: str
    app_id: str
    container_name: str
    triggered_by_result_id: Optional[str]
    container_logs: Optional[str]
    container_status: Optional[str]
    exit_code: Optional[int]
    captured_at: str
    ai_analysis: Optional[str]
    ai_analyzed_at: Optional[str]


class CrashEventsListResponse(BaseModel):
    events: List[CrashEventResponse]
    total: int
