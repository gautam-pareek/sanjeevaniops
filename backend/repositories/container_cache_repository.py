"""
Repository for container cache operations.
Manages cached Docker container information.
"""

import sqlite3
import json
from datetime import datetime
from typing import Optional, Dict, Any


class ContainerCacheRepository:
    """Repository for container_cache table operations."""
    
    def upsert_container(
        self,
        conn: sqlite3.Connection,
        container_id: str,
        container_name: str,
        image: str,
        status: str,
        created_at: datetime,
        docker_inspect: Dict[str, Any]
    ) -> None:
        """Insert or update container cache entry."""
        
        cached_at = datetime.now().isoformat()
        
        conn.execute("""
            INSERT INTO container_cache (
                container_id, container_name, image, status,
                created_at, cached_at, docker_inspect
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(container_id) DO UPDATE SET
                container_name = excluded.container_name,
                image = excluded.image,
                status = excluded.status,
                created_at = excluded.created_at,
                cached_at = excluded.cached_at,
                docker_inspect = excluded.docker_inspect
        """, (
            container_id,
            container_name,
            image,
            status,
            created_at.isoformat(),
            cached_at,
            json.dumps(docker_inspect)
        ))
    
    def get_container(
        self,
        conn: sqlite3.Connection,
        container_id: str
    ) -> Optional[Dict[str, Any]]:
        """Get cached container information."""
        
        cursor = conn.execute("""
            SELECT container_id, container_name, image, status,
                   created_at, cached_at, docker_inspect
            FROM container_cache
            WHERE container_id = ?
        """, (container_id,))
        
        row = cursor.fetchone()
        if not row:
            return None
        
        return {
            'container_id': row['container_id'],
            'container_name': row['container_name'],
            'image': row['image'],
            'status': row['status'],
            'created_at': datetime.fromisoformat(row['created_at']),
            'cached_at': datetime.fromisoformat(row['cached_at']),
            'docker_inspect': json.loads(row['docker_inspect'])
        }
    
    def get_container_by_name(
        self,
        conn: sqlite3.Connection,
        container_name: str
    ) -> Optional[Dict[str, Any]]:
        """Get cached container information by name."""
        
        cursor = conn.execute("""
            SELECT container_id, container_name, image, status,
                   created_at, cached_at, docker_inspect
            FROM container_cache
            WHERE container_name = ?
        """, (container_name,))
        
        row = cursor.fetchone()
        if not row:
            return None
        
        return {
            'container_id': row['container_id'],
            'container_name': row['container_name'],
            'image': row['image'],
            'status': row['status'],
            'created_at': datetime.fromisoformat(row['created_at']),
            'cached_at': datetime.fromisoformat(row['cached_at']),
            'docker_inspect': json.loads(row['docker_inspect'])
        }