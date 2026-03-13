"""
Application service layer.
Orchestrates business logic between repositories and API layer.
"""

import sqlite3
from typing import Dict, Any, List, Tuple, Optional

from backend.repositories.application_repository import ApplicationRepository
from backend.repositories.container_cache_repository import ContainerCacheRepository
from backend.services.docker_service import DockerService
from backend.services.validation_service import ValidationService
from backend.api.v1.models.requests import (
    ApplicationRegistrationRequest,
    ApplicationUpdateRequest
)
from backend.api.v1.models.responses import (
    ApplicationResponse,
    RegistrationInfo,
    ContainerInfo,
    ValidationReport,
    ContainerVerificationReport,
    ContainerVerification
)
from backend.exceptions.custom_exceptions import (
    ApplicationNotFoundException,
    ContainerNotFoundException
)


class ApplicationService:
    """Service for application registration business logic."""
    
    def __init__(
        self,
        app_repo: ApplicationRepository,
        cache_repo: ContainerCacheRepository,
        docker_service: DockerService,
        validation_service: ValidationService
    ):
        """Initialize with repository and service dependencies."""
        self.app_repo = app_repo
        self.cache_repo = cache_repo
        self.docker_service = docker_service
        self.validation_service = validation_service
    
    def register_application(
        self,
        conn: sqlite3.Connection,
        request: ApplicationRegistrationRequest,
        operator: str
    ) -> ApplicationResponse:
        """
        Register a new application.
        
        Steps:
        1. Validate registration
        2. Resolve container_id if not provided
        3. Cache container information
        4. Create application record
        5. Return response
        """
        
        # Validate registration
        validation = self.validation_service.validate_registration(request)
        if not validation.valid:
            # Validation errors should have been caught by Pydantic
            # But we double-check here for container existence
            raise ContainerNotFoundException(request.container_name)
        
        # Get container info from Docker
        container_info = self.docker_service.get_container_by_name(request.container_name)
        if not container_info:
            raise ContainerNotFoundException(request.container_name)
        
        # Use provided container_id or resolve from Docker
        container_id = request.container_id or container_info['container_id']
        
        # Cache container information
        self.cache_repo.upsert_container(
            conn,
            container_id=container_info['container_id'],
            container_name=container_info['container_name'],
            image=container_info['image'],
            status=container_info['status'],
            created_at=container_info['created_at'],
            docker_inspect=container_info['docker_inspect']
        )
        
        # Create application
        app_id = self.app_repo.create_application(
            conn,
            name=request.name,
            description=request.description,
            container_name=request.container_name,
            container_id=container_id,
            health_check_config=request.health_check.model_dump(),
            recovery_policy_config=request.recovery_policy.model_dump(),
            metadata=request.metadata.model_dump(),
            operator=operator
        )
        
        # Retrieve and return created application
        app_data = self.app_repo.get_application(conn, app_id)
        return self._build_application_response(app_data, container_info)
    
    def get_application(
        self,
        conn: sqlite3.Connection,
        app_id: str
    ) -> ApplicationResponse:
        """Get application by ID."""
        
        app_data = self.app_repo.get_application(conn, app_id)
        if not app_data:
            raise ApplicationNotFoundException(app_id)
        
        # Get fresh container info
        container_info = self.docker_service.get_container_by_id(app_data['container_id'])
        if not container_info:
            # Container no longer exists, use cached data
            container_info = self.cache_repo.get_container(conn, app_data['container_id'])
        
        return self._build_application_response(app_data, container_info)
    
    def list_applications(
        self,
        conn: sqlite3.Connection,
        status: Optional[str],
        limit: int,
        offset: int
    ) -> Tuple[List[ApplicationResponse], int]:
        """List applications with pagination."""
        
        applications, total = self.app_repo.list_applications(
            conn, status, limit, offset
        )
        
        responses = []
        for app_data in applications:
            # Get container info for each application
            container_info = self.docker_service.get_container_by_id(app_data['container_id'])
            if not container_info:
                container_info = self.cache_repo.get_container(conn, app_data['container_id'])
            
            responses.append(self._build_application_response(app_data, container_info))
        
        return responses, total
    
    def update_application(
        self,
        conn: sqlite3.Connection,
        app_id: str,
        request: ApplicationUpdateRequest,
        operator: str
    ) -> ApplicationResponse:
        """Update application configuration."""
        
        # Get current application for version check
        current = self.app_repo.get_application(conn, app_id)
        if not current:
            raise ApplicationNotFoundException(app_id)
        
        # Extract update fields
        health_check_config = request.health_check.model_dump() if request.health_check else None
        recovery_policy_config = request.recovery_policy.model_dump() if request.recovery_policy else None
        metadata_config = request.metadata.model_dump() if request.metadata else None
        
        # Update application
        updated_app = self.app_repo.update_application(
            conn,
            app_id=app_id,
            expected_version=current['version'],
            health_check_config=health_check_config,
            recovery_policy_config=recovery_policy_config,
            metadata=metadata_config,
            description=request.description,
            operator=operator
        )
        
        # Get container info
        container_info = self.docker_service.get_container_by_id(updated_app['container_id'])
        if not container_info:
            container_info = self.cache_repo.get_container(conn, updated_app['container_id'])
        
        return self._build_application_response(updated_app, container_info)
    
    def delete_application(
        self,
        conn: sqlite3.Connection,
        app_id: str,
        operator: str,
        reason: Optional[str]
    ) -> None:
        """Soft delete application."""
        self.app_repo.soft_delete_application(conn, app_id, operator, reason)
    
    def reactivate_application(
        self,
        conn: sqlite3.Connection,
        app_id: str,
        operator: str
    ) -> ApplicationResponse:
        """Reactivate soft-deleted application."""
        
        # Verify container still exists
        app_data = self.app_repo.get_application(conn, app_id, include_deleted=True)
        if not app_data:
            raise ApplicationNotFoundException(app_id)
        
        container_info = self.docker_service.get_container_by_id(app_data['container_id'])
        if not container_info:
            raise ContainerNotFoundException(app_data['container_name'])
        
        # Reactivate
        reactivated = self.app_repo.reactivate_application(conn, app_id, operator)
        
        return self._build_application_response(reactivated, container_info)
    
    def verify_container(
        self,
        conn: sqlite3.Connection,
        app_id: str
    ) -> ContainerVerificationReport:
        """Verify container still exists and is accessible."""
        
        app_data = self.app_repo.get_application(conn, app_id)
        if not app_data:
            raise ApplicationNotFoundException(app_id)
        
        container_info = self.docker_service.get_container_by_id(app_data['container_id'])
        
        verification = ContainerVerification(
            exists=container_info is not None,
            running=container_info['status'].lower() == 'running' if container_info else False,
            has_native_healthcheck=False
        )
        
        if container_info:
            verification.has_native_healthcheck = self.docker_service.container_has_healthcheck(
                app_data['container_name']
            )
        
        message = "Container verified successfully" if verification.exists else "Container not found"
        
        return ContainerVerificationReport(
            app_id=app_id,
            container_name=app_data['container_name'],
            container_id=app_data['container_id'],
            verification=verification,
            message=message
        )
    
    def _build_application_response(
        self,
        app_data: Dict[str, Any],
        container_info: Optional[Dict[str, Any]]
    ) -> ApplicationResponse:
        """Build ApplicationResponse from data."""
        
        # Default container info if not available (Docker down or container removed)
        if not container_info:
            container_info = {
                'image': 'unknown',
                'status': 'not running',
                'created_at': app_data['registered_at']
            }
        
        return ApplicationResponse(
            app_id=app_data['app_id'],
            name=app_data['name'],
            description=app_data['description'],
            container_name=app_data['container_name'],
            container_id=app_data['container_id'],
            status=app_data['status'],
            health_check=app_data['health_check_config'],
            recovery_policy=app_data['recovery_policy_config'],
            metadata=app_data['metadata'],
            registration_info=RegistrationInfo(
                registered_at=app_data['registered_at'],
                registered_by=app_data['registered_by'],
                last_updated_at=app_data['last_updated_at'],
                last_updated_by=app_data['last_updated_by'],
                version=app_data['version']
            ),
            container_info=ContainerInfo(
                image=container_info['image'],
                status=container_info['status'],
                created_at=container_info['created_at']
            )
        )