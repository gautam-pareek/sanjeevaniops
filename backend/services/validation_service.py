"""
Validation service for application registration.
Performs business logic validation beyond Pydantic schema validation.
"""

from typing import List, Dict, Any

from backend.api.v1.models.requests import ApplicationRegistrationRequest
from backend.api.v1.models.responses import (
    ValidationReport,
    ValidationError,
    ValidationWarning,
    ContainerVerification
)
from backend.api.v1.models.enums import HealthCheckType
from backend.services.docker_service import DockerService


class ValidationService:
    """Service for application registration validation."""
    
    def __init__(self, docker_service: DockerService):
        """Initialize with Docker service dependency."""
        self.docker_service = docker_service
    
    def validate_registration(
        self,
        request: ApplicationRegistrationRequest
    ) -> ValidationReport:
        """
        Validate application registration request.
        
        Performs:
        - Container existence verification
        - Health check configuration validation
        - Port exposure validation
        - Docker native healthcheck verification
        """
        errors: List[ValidationError] = []
        warnings: List[ValidationWarning] = []
        
        # Verify container exists
        container_info = self.docker_service.get_container_by_name(request.container_name)
        
        container_verification = ContainerVerification(
            exists=container_info is not None,
            running=False,
            has_native_healthcheck=False
        )
        
        if not container_info:
            errors.append(ValidationError(
                field="container_name",
                code="CONTAINER_NOT_FOUND",
                message=f"Container '{request.container_name}' not found in Docker"
            ))
            # Cannot proceed with further validation
            return ValidationReport(
                valid=len(errors) == 0,
                errors=errors,
                warnings=warnings,
                container_verification=container_verification
            )
        
        # Update verification info
        container_verification.running = container_info['status'].lower() == 'running'
        
        # Verify container_id if provided
        if request.container_id:
            if request.container_id != container_info['container_id']:
                errors.append(ValidationError(
                    field="container_id",
                    code="CONTAINER_ID_MISMATCH",
                    message=(
                        f"Provided container_id '{request.container_id}' does not match "
                        f"actual container_id '{container_info['container_id']}'"
                    )
                ))
        
        # Warn if container is not running
        if not container_verification.running:
            warnings.append(ValidationWarning(
                field="container_name",
                code="CONTAINER_NOT_RUNNING",
                message=f"Container '{request.container_name}' is not currently running",
                recommendation="Start the container before enabling health checks"
            ))
        
        # Validate health check type-specific requirements
        self._validate_health_check(
            request.health_check,
            request.container_name,
            errors,
            warnings,
            container_verification
        )
        
        # Validate recovery policy
        self._validate_recovery_policy(request.recovery_policy, warnings)
        
        return ValidationReport(
            valid=len(errors) == 0,
            errors=errors,
            warnings=warnings,
            container_verification=container_verification
        )
    
    def _validate_health_check(
        self,
        health_check: Any,
        container_name: str,
        errors: List[ValidationError],
        warnings: List[ValidationWarning],
        verification: ContainerVerification
    ):
        """Validate health check configuration."""
        
        if health_check.type == HealthCheckType.DOCKER_NATIVE:
            # Verify container has native healthcheck
            has_healthcheck = self.docker_service.container_has_healthcheck(container_name)
            verification.has_native_healthcheck = has_healthcheck
            
            if not has_healthcheck:
                errors.append(ValidationError(
                    field="health_check.type",
                    code="NO_NATIVE_HEALTHCHECK",
                    message=(
                        f"Container '{container_name}' does not have a native HEALTHCHECK defined. "
                        "Use a different health check type or add HEALTHCHECK to the container image."
                    )
                ))
        
        elif health_check.type == HealthCheckType.HTTP:
            # Validate HTTP health check
            config = health_check.config
            url = config.get('url', '')
            
            # Check if URL is localhost/127.0.0.1 (common misconfiguration)
            if 'localhost' in url or '127.0.0.1' in url:
                warnings.append(ValidationWarning(
                    field="health_check.config.url",
                    code="LOCALHOST_URL",
                    message="Health check URL uses localhost",
                    recommendation=(
                        "Ensure the URL is reachable from the host. "
                        "Use the container's network address or exposed port."
                    )
                ))
        
        elif health_check.type == HealthCheckType.TCP:
            # Validate TCP health check port exposure
            config = health_check.config
            port = config.get('port')
            
            try:
                ports = self.docker_service.get_container_ports(container_name)
                port_exposed = any(
                    f"{port}/tcp" in port_key for port_key in ports.keys()
                )
                
                if not port_exposed:
                    warnings.append(ValidationWarning(
                        field="health_check.config.port",
                        code="PORT_NOT_EXPOSED",
                        message=f"Port {port} may not be exposed by container",
                        recommendation="Verify the container exposes this port"
                    ))
            except Exception:
                # Don't fail validation if port check fails
                pass
        
        elif health_check.type == HealthCheckType.EXEC:
            # Warn about exec health checks
            warnings.append(ValidationWarning(
                field="health_check.type",
                code="EXEC_HEALTH_CHECK",
                message="Exec health checks execute commands inside containers",
                recommendation="Ensure the command is safe and has minimal side effects"
            ))
    
    def _validate_recovery_policy(
        self,
        recovery_policy: Any,
        warnings: List[ValidationWarning]
    ):
        """Validate recovery policy configuration."""
        
        if recovery_policy.enabled and not recovery_policy.allowed_actions:
            warnings.append(ValidationWarning(
                field="recovery_policy.allowed_actions",
                code="NO_ACTIONS_CONFIGURED",
                message="Recovery policy enabled but no actions configured",
                recommendation="Add at least one action to allowed_actions or disable recovery"
            ))
        
        if recovery_policy.max_restart_attempts == 0 and recovery_policy.enabled:
            warnings.append(ValidationWarning(
                field="recovery_policy.max_restart_attempts",
                code="NO_RESTART_ATTEMPTS",
                message="Recovery enabled with 0 max_restart_attempts",
                recommendation="Increase max_restart_attempts or disable recovery"
            ))