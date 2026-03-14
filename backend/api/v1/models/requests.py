"""
Request models for Application Registration API.
Defines and validates all incoming request payloads.
"""

from pydantic import BaseModel, Field, field_validator, model_validator
from typing import Optional, Dict, Any, List
import re

from backend.api.v1.models.enums import (
    HealthCheckType,
    HttpMethod,
    Environment,
    Criticality,
    RecoveryAction
)


# ============================================================================
# Health Check Configuration Models
# ============================================================================

class HttpHealthCheckConfig(BaseModel):
    """HTTP health check configuration with enhanced detection."""
    url: str = Field(..., min_length=1, max_length=500)
    method: HttpMethod = HttpMethod.GET
    expected_status_codes: List[int] = Field(default=[200])
    headers: Optional[Dict[str, str]] = None
    follow_redirects: bool = False

    # Check 2: Response time thresholds (ms)
    warn_response_time_ms: int = Field(default=3000, ge=100, le=30000)
    critical_response_time_ms: int = Field(default=5000, ge=100, le=30000)

    # Check 3: Error keywords in response body
    error_keywords: Optional[List[str]] = Field(
        default=None,
        description="Keywords that indicate an error page. Defaults to common error strings."
    )

    # Check 5: Additional endpoints to verify
    additional_endpoints: Optional[List[str]] = Field(
        default=None,
        description="Extra URLs or paths to check reachability. e.g. ['/about', '/api/health']"
    )

    # Check 6: Expect valid JSON response
    expect_json: bool = Field(
        default=False,
        description="If True, response body must be valid JSON."
    )

    @field_validator('url')
    @classmethod
    def validate_url(cls, v: str) -> str:
        if not v.startswith(('http://', 'https://')):
            raise ValueError("URL must start with http:// or https://")
        return v

    @field_validator('expected_status_codes')
    @classmethod
    def validate_status_codes(cls, v: List[int]) -> List[int]:
        if not v:
            raise ValueError("At least one expected status code required")
        for code in v:
            if code < 100 or code > 599:
                raise ValueError(f"Invalid HTTP status code: {code}")
        return v

    @field_validator('additional_endpoints')
    @classmethod
    def validate_endpoints_length(cls, v):
        if v and len(v) > 5:
            raise ValueError("Maximum 5 additional endpoints allowed")
        return v

    @model_validator(mode='after')
    def validate_response_time_thresholds(self):
        if self.warn_response_time_ms >= self.critical_response_time_ms:
            raise ValueError("warn_response_time_ms must be less than critical_response_time_ms")
        return self


class TcpHealthCheckConfig(BaseModel):
    """TCP health check configuration."""
    port: int = Field(..., ge=1, le=65535)
    host: str = Field(default="localhost")


class ExecHealthCheckConfig(BaseModel):
    """Exec health check configuration."""
    command: str = Field(..., min_length=1, max_length=1000)
    expected_exit_code: int = Field(default=0)
    
    @field_validator('command')
    @classmethod
    def validate_command(cls, v: str) -> str:
        """Validate command for dangerous patterns."""
        # Block common shell injection patterns
        dangerous_patterns = [';', '&&', '||', '|', '`', '$(',  '$()', '${']
        for pattern in dangerous_patterns:
            if pattern in v:
                raise ValueError(
                    f"Command contains potentially dangerous pattern: {pattern}"
                )
        return v


class DockerNativeHealthCheckConfig(BaseModel):
    """Docker native health check configuration (no additional config needed)."""
    pass


class HealthCheckConfig(BaseModel):
    """Health check configuration with type-specific config."""
    type: HealthCheckType
    interval_seconds: int = Field(default=30, ge=10, le=3600)
    timeout_seconds: int = Field(default=5, ge=1, le=300)
    failure_threshold: int = Field(default=3, ge=1, le=10)
    success_threshold: int = Field(default=1, ge=1, le=5)
    config: Dict[str, Any] = Field(default_factory=dict)
    
    @model_validator(mode='after')
    def validate_timeout_less_than_interval(self):
        """Ensure timeout is less than interval."""
        if self.timeout_seconds >= self.interval_seconds:
            raise ValueError("timeout_seconds must be less than interval_seconds")
        return self
    
    @model_validator(mode='after')
    def validate_type_specific_config(self):
        """Validate config matches the health check type."""
        if self.type == HealthCheckType.HTTP:
            HttpHealthCheckConfig(**self.config)
        elif self.type == HealthCheckType.TCP:
            TcpHealthCheckConfig(**self.config)
        elif self.type == HealthCheckType.EXEC:
            ExecHealthCheckConfig(**self.config)
        elif self.type == HealthCheckType.DOCKER_NATIVE:
            DockerNativeHealthCheckConfig(**self.config)
        return self


# ============================================================================
# Recovery Policy Configuration Model
# ============================================================================

class RecoveryPolicyConfig(BaseModel):
    """Recovery policy configuration."""
    enabled: bool = Field(default=False)
    max_restart_attempts: int = Field(default=3, ge=0, le=10)
    restart_delay_seconds: int = Field(default=60, ge=10, le=3600)
    backoff_multiplier: float = Field(default=1.0, ge=1.0, le=3.0)
    escalation_threshold: int = Field(default=3, ge=1, le=10)
    allowed_actions: List[RecoveryAction] = Field(default_factory=list)


# ============================================================================
# Application Metadata Model
# ============================================================================

class ApplicationMetadata(BaseModel):
    """Application metadata."""
    owner: Optional[str] = Field(None, max_length=100)
    team: Optional[str] = Field(None, max_length=100)
    environment: Environment
    criticality: Criticality = Criticality.MEDIUM
    tags: List[str] = Field(default_factory=list, max_length=20)
    
    @field_validator('tags')
    @classmethod
    def validate_tags(cls, v: List[str]) -> List[str]:
        """Validate individual tags."""
        for tag in v:
            if len(tag) > 50:
                raise ValueError(f"Tag too long (max 50 chars): {tag}")
        return v


# ============================================================================
# Main Request Models
# ============================================================================

class ApplicationRegistrationRequest(BaseModel):
    """Request to register a new application."""
    name: str = Field(..., min_length=3, max_length=100)
    description: Optional[str] = Field(None, max_length=500)
    container_name: str = Field(..., min_length=1)
    container_id: Optional[str] = None
    health_check: HealthCheckConfig
    recovery_policy: RecoveryPolicyConfig
    metadata: ApplicationMetadata
    
    @field_validator('name')
    @classmethod
    def validate_name(cls, v: str) -> str:
        """Validate name format: alphanumeric, dash, underscore, must start with alphanumeric."""
        pattern = r'^[a-zA-Z0-9][a-zA-Z0-9_-]*$'
        if not re.match(pattern, v):
            raise ValueError(
                "Name must start with alphanumeric and contain only alphanumeric, "
                "dash, or underscore characters"
            )
        return v


class ApplicationUpdateRequest(BaseModel):
    """Request to update an existing application. All fields optional."""
    description: Optional[str] = Field(None, max_length=500)
    health_check: Optional[HealthCheckConfig] = None
    recovery_policy: Optional[RecoveryPolicyConfig] = None
    metadata: Optional[ApplicationMetadata] = None