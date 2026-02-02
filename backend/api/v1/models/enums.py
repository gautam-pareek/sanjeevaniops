"""
Enumeration types for API models.
Defines all allowed values for enum fields.
"""

from enum import Enum


class HealthCheckType(str, Enum):
    """Health check execution types."""
    HTTP = "http"
    TCP = "tcp"
    EXEC = "exec"
    DOCKER_NATIVE = "docker_native"


class HttpMethod(str, Enum):
    """HTTP methods for health checks."""
    GET = "GET"
    POST = "POST"
    HEAD = "HEAD"


class ApplicationStatus(str, Enum):
    """Application lifecycle status."""
    ACTIVE = "active"
    INACTIVE = "inactive"


class Environment(str, Enum):
    """Deployment environment."""
    DEVELOPMENT = "development"
    STAGING = "staging"
    PRODUCTION = "production"


class Criticality(str, Enum):
    """Application criticality level."""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class RecoveryAction(str, Enum):
    """Allowed automated recovery actions."""
    CONTAINER_RESTART = "container_restart"


class ChangeType(str, Enum):
    """Types of application changes for audit history."""
    CREATED = "created"
    UPDATED = "updated"
    DELETED = "deleted"
    REACTIVATED = "reactivated"