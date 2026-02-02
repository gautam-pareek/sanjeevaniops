"""
Response models for Application Registration API.
Defines all API response structures.
"""

from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime

from backend.api.v1.models.enums import (
    ApplicationStatus,
    ChangeType,
    HealthCheckType,
    Environment,
    Criticality
)


# ============================================================================
# Sub-models for Responses
# ============================================================================

class RegistrationInfo(BaseModel):
    """Registration and update metadata."""
    registered_at: datetime
    registered_by: str
    last_updated_at: datetime
    last_updated_by: str
    version: int


class ContainerInfo(BaseModel):
    """Container information from Docker."""
    image: str
    status: str
    created_at: datetime


class ContainerVerification(BaseModel):
    """Container existence verification result."""
    exists: bool
    running: bool
    has_native_healthcheck: bool


class ValidationError(BaseModel):
    """Individual validation error."""
    field: str
    code: str
    message: str


class ValidationWarning(BaseModel):
    """Individual validation warning."""
    field: str
    code: str
    message: str
    recommendation: str


# ============================================================================
# Main Response Models
# ============================================================================

class ApplicationResponse(BaseModel):
    """Complete application details response."""
    app_id: str
    name: str
    description: Optional[str]
    container_name: str
    container_id: str
    status: ApplicationStatus
    health_check: Dict[str, Any]
    recovery_policy: Dict[str, Any]
    metadata: Dict[str, Any]
    registration_info: RegistrationInfo
    container_info: ContainerInfo


class PaginatedApplicationList(BaseModel):
    """Paginated list of applications."""
    applications: List[ApplicationResponse]
    total: int
    limit: int
    offset: int


class ValidationReport(BaseModel):
    """Validation result report."""
    valid: bool
    errors: List[ValidationError]
    warnings: List[ValidationWarning]
    container_verification: ContainerVerification


class HealthCheckTestResult(BaseModel):
    """Health check test execution result."""
    success: bool
    message: str
    execution_time_ms: float
    details: Dict[str, Any]


class ContainerVerificationReport(BaseModel):
    """Container verification report."""
    app_id: str
    container_name: str
    container_id: str
    verification: ContainerVerification
    message: str


class HistoryEntry(BaseModel):
    """Single history entry."""
    history_id: str
    app_id: str
    version: int
    snapshot: Dict[str, Any]
    change_type: ChangeType
    changed_at: datetime
    changed_by: str
    change_reason: Optional[str]


class PaginatedHistoryList(BaseModel):
    """Paginated application history."""
    history: List[HistoryEntry]
    total: int
    limit: int
    offset: int