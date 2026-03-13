"""
Response models for Health Check Monitoring API.
"""

from pydantic import BaseModel
from typing import List, Optional, Dict, Any


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
