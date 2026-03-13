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
        """Initialize Docker client."""
        try:
            self.client = docker.from_env()
            # Test connection
            self.client.ping()
        except DockerException as e:
            print(f"Docker initialization failed: {e}")
            raise DockerDaemonUnavailableException()
    
    def get_container_by_name(self, container_name: str) -> Optional[Dict[str, Any]]:
        """
        Get container information by name.
        
        Returns:
            Container info dict or None if not found
        """
        try:
            container = self.client.containers.get(container_name)
            return self._extract_container_info(container)
        except NotFound:
            return None
        except DockerException:
            raise DockerDaemonUnavailableException()
    
    def get_container_by_id(self, container_id: str) -> Optional[Dict[str, Any]]:
        """
        Get container information by ID.
        
        Returns:
            Container info dict or None if not found
        """
        try:
            container = self.client.containers.get(container_id)
            return self._extract_container_info(container)
        except NotFound:
            return None
        except DockerException:
            raise DockerDaemonUnavailableException()
    
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
        try:
            container = self.client.containers.get(container_name)
            inspect_data = container.attrs
            
            # Check if image or container has healthcheck defined
            health_config = inspect_data.get('Config', {}).get('Healthcheck')
            return health_config is not None
        except NotFound:
            return False
        except DockerException:
            raise DockerDaemonUnavailableException()
    
    def get_container_ports(self, container_name: str) -> Dict[str, Any]:
        """Get exposed and published ports for container."""
        try:
            container = self.client.containers.get(container_name)
            return container.attrs.get('NetworkSettings', {}).get('Ports', {})
        except NotFound:
            raise ContainerNotFoundException(container_name)
        except DockerException:
            raise DockerDaemonUnavailableException()
    
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