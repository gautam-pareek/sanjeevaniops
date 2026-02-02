"""
Application Registration API endpoints.
FastAPI routes for application CRUD operations.
"""

from fastapi import APIRouter, Query, status, Depends
from typing import Optional
import sqlite3

from backend.api.dependencies import get_db_connection, get_current_operator
from backend.api.v1.models.requests import (
    ApplicationRegistrationRequest,
    ApplicationUpdateRequest
)
from backend.api.v1.models.responses import (
    ApplicationResponse,
    PaginatedApplicationList,
    ValidationReport,
    ContainerVerificationReport,
    HistoryEntry,
    PaginatedHistoryList
)
from backend.services.application_service import ApplicationService
from backend.services.docker_service import DockerService
from backend.services.validation_service import ValidationService
from backend.repositories.application_repository import ApplicationRepository
from backend.repositories.container_cache_repository import ContainerCacheRepository


router = APIRouter(prefix="/applications", tags=["applications"])


def get_application_service() -> ApplicationService:
    """Dependency to create ApplicationService with all dependencies."""
    docker_service = DockerService()
    return ApplicationService(
        app_repo=ApplicationRepository(),
        cache_repo=ContainerCacheRepository(),
        docker_service=docker_service,
        validation_service=ValidationService(docker_service)
    )


@router.post(
    "",
    response_model=ApplicationResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register new application",
    description="Register a new application for monitoring and recovery"
)
def register_application(
    request: ApplicationRegistrationRequest,
    conn: sqlite3.Connection = Depends(get_db_connection),
    operator: str = Depends(get_current_operator),
    service: ApplicationService = Depends(get_application_service)
):
    """Register a new application."""
    return service.register_application(conn, request, operator)

@router.get(
    "",
    response_model=PaginatedApplicationList,
    summary="List applications",
    description="List all registered applications with pagination and filtering"
)
def list_applications(
    status_filter: Optional[str] = Query(
        "active",
        alias="status",
        description="Filter by status: active, inactive, or all"
    ),
    limit: int = Query(50, ge=1, le=200, description="Number of results per page"),
    offset: int = Query(0, ge=0, description="Number of results to skip"),
    conn: sqlite3.Connection = Depends(get_db_connection),
    service: ApplicationService = Depends(get_application_service)
) -> PaginatedApplicationList:
    """List applications with pagination."""
    applications, total = service.list_applications(
        conn, status_filter, limit, offset
    )
    
    return PaginatedApplicationList(
        applications=applications,
        total=total,
        limit=limit,
        offset=offset
    )


@router.get(
    "/{app_id}",
    response_model=ApplicationResponse,
    summary="Get application details",
    description="Retrieve detailed information about a specific application"
)
def get_application(
    app_id: str,
    conn: sqlite3.Connection = Depends(get_db_connection),
    service: ApplicationService = Depends(get_application_service)
) -> ApplicationResponse:
    """Get application by ID."""
    return service.get_application(conn, app_id)


@router.put(
    "/{app_id}",
    response_model=ApplicationResponse,
    summary="Update application",
    description="Update application configuration with optimistic locking"
)
def update_application(
    app_id: str,
    request: ApplicationUpdateRequest,
 conn: sqlite3.Connection = Depends(get_db_connection),
operator: str = Depends(get_current_operator),
    service: ApplicationService = Depends(get_application_service)
) -> ApplicationResponse:
    """Update application configuration."""
    return service.update_application(conn, app_id, request, operator)


@router.delete(
    "/{app_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete application",
    description="Soft-delete an application (stops monitoring)"
)
def delete_application(
    app_id: str,
    reason: Optional[str] = Query(None, max_length=500),
    conn: sqlite3.Connection = Depends(get_db_connection),
    operator: str = Depends(get_current_operator),
    service: ApplicationService = Depends(get_application_service)
) -> None:
    """Soft delete application."""
    service.delete_application(conn, app_id, operator, reason)


@router.post(
    "/{app_id}/reactivate",
    response_model=ApplicationResponse,
    summary="Reactivate application",
    description="Reactivate a previously deleted application"
)
def reactivate_application(
    app_id: str,
    conn: sqlite3.Connection = Depends(get_db_connection),
    operator: str = Depends(get_current_operator),
    service: ApplicationService = Depends(get_application_service)
) -> ApplicationResponse:
    """Reactivate deleted application."""
    return service.reactivate_application(conn, app_id, operator)


@router.post(
    "/validate",
    response_model=ValidationReport,
    summary="Validate registration",
    description="Validate application registration without persisting (dry-run)"
)
def validate_registration(
    request: ApplicationRegistrationRequest,
    service: ApplicationService = Depends(get_application_service)
) -> ValidationReport:
    """Validate registration request without creating application."""
    return service.validation_service.validate_registration(request)


@router.get(
    "/{app_id}/verify-container",
    response_model=ContainerVerificationReport,
    summary="Verify container",
    description="Verify that the application's container still exists"
)
def verify_container(
    app_id: str,
    conn: sqlite3.Connection = Depends(get_db_connection),
    service: ApplicationService = Depends(get_application_service)
) -> ContainerVerificationReport:
    """Verify container existence."""
    return service.verify_container(conn, app_id)


@router.get(
    "/{app_id}/history",
    response_model=PaginatedHistoryList,
    summary="Get application history",
    description="Retrieve change history for an application"
)
def get_application_history(
    app_id: str,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    conn: sqlite3.Connection = Depends(get_db_connection),
    service: ApplicationService = Depends(get_application_service)
) -> PaginatedHistoryList:
    """Get application change history."""
    history, total = service.app_repo.get_application_history(
        conn, app_id, limit, offset
    )
    
    history_entries = [
        HistoryEntry(
            history_id=entry['history_id'],
            app_id=entry['app_id'],
            version=entry['version'],
            snapshot=entry['snapshot'],
            change_type=entry['change_type'],
            changed_at=entry['changed_at'],
            changed_by=entry['changed_by'],
            change_reason=entry['change_reason']
        )
        for entry in history
    ]
    
    return PaginatedHistoryList(
        history=history_entries,
        total=total,
        limit=limit,
        offset=offset
    )