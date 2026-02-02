"""
Custom exceptions for SanjeevaniOps application.
Provides domain-specific error handling.
"""

from fastapi import HTTPException, status


class ApplicationNotFoundException(HTTPException):
    """Application not found in database."""
    def __init__(self, app_id: str):
        super().__init__(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Application not found: {app_id}"
        )


class ApplicationNameConflictException(HTTPException):
    """Application name already exists."""
    def __init__(self, name: str):
        super().__init__(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Application name already exists: {name}"
        )


class ContainerNameConflictException(HTTPException):
    """Container already registered."""
    def __init__(self, container_name: str):
        super().__init__(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Container already registered: {container_name}"
        )


class ContainerNotFoundException(HTTPException):
    """Docker container not found."""
    def __init__(self, container_name: str):
        super().__init__(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Docker container not found: {container_name}"
        )


class OptimisticLockException(HTTPException):
    """Version conflict during update (optimistic locking)."""
    def __init__(self, app_id: str, expected_version: int, actual_version: int):
        super().__init__(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Version conflict for application {app_id}. "
                f"Expected version {expected_version}, but current version is {actual_version}. "
                f"Please refresh and try again."
            )
        )


class DockerDaemonUnavailableException(HTTPException):
    """Docker daemon is not accessible."""
    def __init__(self):
        super().__init__(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Docker daemon is unavailable. Please ensure Docker is running."
        )