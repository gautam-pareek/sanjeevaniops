"""
Docker service for container inspection and verification.
Interfaces with Docker daemon for read-only operations.
"""

import docker
from docker.errors import DockerException, NotFound
from typing import Dict, Any, Optional
from datetime import datetime

from backend.exceptions.custom_exceptions import (
    ContainerNotFoundException,
    DockerDaemonUnavailableException
)


class DockerService:
    """Service for Docker container inspection and verification."""
    
    def __init__(self):
        """Initialize Docker client. Fails gracefully if Docker is unavailable."""
        try:
            self.client = docker.from_env()
            self.client.ping()
            self._available = True
        except DockerException:
            self.client = None
            self._available = False

    def _check_available(self):
        """Raise if Docker daemon is not available."""
        if not self._available:
            raise DockerDaemonUnavailableException()
    
    def get_container_by_name(self, container_name: str) -> Optional[Dict[str, Any]]:
        """
        Get container information by name.
        Returns None if not found or Docker is unavailable.
        """
        if not self._available:
            return None
        try:
            container = self.client.containers.get(container_name)
            return self._extract_container_info(container)
        except NotFound:
            return None
        except DockerException:
            return None
    
    def get_container_by_id(self, container_id: str) -> Optional[Dict[str, Any]]:
        """
        Get container information by ID.
        Returns None if not found or Docker is unavailable.
        """
        if not self._available:
            return None
        try:
            container = self.client.containers.get(container_id)
            return self._extract_container_info(container)
        except NotFound:
            return None
        except DockerException:
            return None
    
    def is_docker_available(self) -> bool:
        """Check if Docker daemon is reachable."""
        return self._available

    def verify_container_exists(self, container_name: str) -> bool:
        """Check if container exists."""
        return self.get_container_by_name(container_name) is not None
    
    def verify_container_running(self, container_name: str) -> bool:
        """Check if container is running."""
        info = self.get_container_by_name(container_name)
        if info is None:
            return False
        return info['status'].lower() == 'running'
    
    def container_has_healthcheck(self, container_name: str) -> bool:
        """Check if container has native HEALTHCHECK defined."""
        if not self._available:
            return False
        try:
            container = self.client.containers.get(container_name)
            inspect_data = container.attrs
            health_config = inspect_data.get('Config', {}).get('Healthcheck')
            return health_config is not None
        except NotFound:
            return False
        except DockerException:
            return False
    
    def get_container_ports(self, container_name: str) -> Dict[str, Any]:
        """Get exposed and published ports for container."""
        if not self._available:
            return {}
        try:
            container = self.client.containers.get(container_name)
            return container.attrs.get('NetworkSettings', {}).get('Ports', {})
        except NotFound:
            raise ContainerNotFoundException(container_name)
        except DockerException:
            return {}
    
    def _extract_container_info(self, container) -> Dict[str, Any]:
        """Extract relevant container information."""
        attrs = container.attrs
        
        # Parse created timestamp
        created_str = attrs.get('Created', '')
        try:
            # Docker uses RFC3339 format
            created_at = datetime.fromisoformat(created_str.replace('Z', '+00:00'))
        except (ValueError, AttributeError):
            created_at = datetime.now()
        
        return {
            'container_id': container.id,
            'container_name': container.name,
            'image': attrs.get('Config', {}).get('Image', ''),
            'status': container.status,
            'created_at': created_at,
            'docker_inspect': attrs  # Full inspect output for caching
        }

    def restart_container(self, container_name: str) -> Dict[str, Any]:
        """
        Restart a container by name.
        Returns {success, message, restarted_at}.
        This is a WRITE operation — used only for operator-approved recovery actions.
        """
        if not self._available:
            return {
                "success": False,
                "message": "Docker daemon is not available.",
                "restarted_at": None,
            }
        try:
            container = self.client.containers.get(container_name)
            container.restart(timeout=10)
            now = datetime.now().isoformat()
            return {
                "success": True,
                "message": f"Container '{container_name}' restarted successfully.",
                "restarted_at": now,
            }
        except NotFound:
            return {
                "success": False,
                "message": f"Container '{container_name}' not found.",
                "restarted_at": None,
            }
        except DockerException as e:
            return {
                "success": False,
                "message": f"Docker error: {str(e)}",
                "restarted_at": None,
            }