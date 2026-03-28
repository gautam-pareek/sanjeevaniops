"""
Repository for application operations.
Handles all database operations for the applications table.
"""

import sqlite3
import json
import uuid
from datetime import datetime
from typing import Optional, List, Dict, Any, Tuple

from backend.api.v1.models.enums import ApplicationStatus, ChangeType
from backend.exceptions.custom_exceptions import (
    ApplicationNotFoundException,
    ApplicationNameConflictException,
    ContainerNameConflictException,
    OptimisticLockException
)


class ApplicationRepository:
    """Repository for applications table operations."""
    
    def create_application(
        self,
        conn: sqlite3.Connection,
        name: str,
        description: Optional[str],
        container_name: str,
        container_id: str,
        health_check_config: Dict[str, Any],
        recovery_policy_config: Dict[str, Any],
        metadata: Dict[str, Any],
        operator: str
    ) -> str:
        """
        Create a new application registration.
        
        Returns:
            app_id of created application
        
        Raises:
            ApplicationNameConflictException: If name already exists
            ContainerNameConflictException: If container already registered
        """
        
        # Check for name conflict (among active applications)
        if self._name_exists(conn, name):
            raise ApplicationNameConflictException(name)
        
        # Check for container conflict (among active applications)
        if self._container_registered(conn, container_name):
            raise ContainerNameConflictException(container_name)
        
        app_id = str(uuid.uuid4())
        now = datetime.now().isoformat()
        
        conn.execute("""
            INSERT INTO applications (
                app_id, name, description, container_name, container_id,
                status, health_check_config, recovery_policy_config, metadata,
                registered_at, registered_by, last_updated_at, last_updated_by,
                version, deleted_at, monitoring_paused
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            app_id, name, description, container_name, container_id,
            ApplicationStatus.ACTIVE.value,
            json.dumps(health_check_config),
            json.dumps(recovery_policy_config),
            json.dumps(metadata),
            now, operator, now, operator,
            1, None, 0
        ))
        
        # Record in history
        self._record_history(
            conn, app_id, 1, ChangeType.CREATED, operator, None,
            self._get_application_snapshot(conn, app_id)
        )
        
        return app_id
    
    def get_application(
        self,
        conn: sqlite3.Connection,
        app_id: str,
        include_deleted: bool = False
    ) -> Optional[Dict[str, Any]]:
        """
        Get application by ID.
        
        Returns:
            Application data dict or None if not found
        """
        
        query = """
            SELECT app_id, name, description, container_name, container_id,
                   status, health_check_config, recovery_policy_config, metadata,
                   registered_at, registered_by, last_updated_at, last_updated_by,
                   version, deleted_at, monitoring_paused, paused_at, paused_by, pause_reason
            FROM applications
            WHERE app_id = ?
        """
        
        if not include_deleted:
            query += " AND deleted_at IS NULL"
        
        cursor = conn.execute(query, (app_id,))
        row = cursor.fetchone()
        
        if not row:
            return None
        
        return self._row_to_dict(row)
    
    def list_applications(
        self,
        conn: sqlite3.Connection,
        status: Optional[str] = None,
        limit: int = 50,
        offset: int = 0
    ) -> Tuple[List[Dict[str, Any]], int]:
        """
        List applications with pagination.
        
        Returns:
            Tuple of (applications list, total count)
        """
        
        # Build query
        where_clauses = ["deleted_at IS NULL"]
        params: List[Any] = []
        
        if status and status != "all":
            where_clauses.append("status = ?")
            params.append(status)
        
        where_sql = " AND ".join(where_clauses)
        
        # Get total count
        count_cursor = conn.execute(
            f"SELECT COUNT(*) as count FROM applications WHERE {where_sql}",
            params
        )
        total = count_cursor.fetchone()['count']
        
        # Get paginated results
        query = f"""
            SELECT app_id, name, description, container_name, container_id,
                   status, health_check_config, recovery_policy_config, metadata,
                   registered_at, registered_by, last_updated_at, last_updated_by,
                   version, deleted_at, monitoring_paused, paused_at, paused_by, pause_reason
            FROM applications
            WHERE {where_sql}
            ORDER BY registered_at DESC
            LIMIT ? OFFSET ?
        """
        
        cursor = conn.execute(query, params + [limit, offset])
        applications = [self._row_to_dict(row) for row in cursor.fetchall()]
        
        return applications, total
    
    def update_application(
        self,
        conn: sqlite3.Connection,
        app_id: str,
        expected_version: int,
        health_check_config: Optional[Dict[str, Any]],
        recovery_policy_config: Optional[Dict[str, Any]],
        metadata: Optional[Dict[str, Any]],
        description: Optional[str],
        operator: str,
        change_reason: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Update application with optimistic locking.
        
        Returns:
            Updated application data
        
        Raises:
            ApplicationNotFoundException: If application not found
            OptimisticLockException: If version mismatch
        """
        
        # Get current application
        current = self.get_application(conn, app_id)
        if not current:
            raise ApplicationNotFoundException(app_id)
        
        # Check version for optimistic locking
        if current['version'] != expected_version:
            raise OptimisticLockException(app_id, expected_version, current['version'])
        
        # Build update query dynamically based on provided fields
        updates = []
        params = []
        
        if description is not None:
            updates.append("description = ?")
            params.append(description)
        
        if health_check_config is not None:
            updates.append("health_check_config = ?")
            params.append(json.dumps(health_check_config))
        
        if recovery_policy_config is not None:
            updates.append("recovery_policy_config = ?")
            params.append(json.dumps(recovery_policy_config))
        
        if metadata is not None:
            updates.append("metadata = ?")
            params.append(json.dumps(metadata))
        
        # Always update these fields
        now = datetime.now().isoformat()
        new_version = current['version'] + 1
        
        updates.extend([
            "last_updated_at = ?",
            "last_updated_by = ?",
            "version = ?"
        ])
        params.extend([now, operator, new_version])
        
        # Add WHERE clause parameters
        params.extend([app_id, expected_version])
        
        query = f"""
            UPDATE applications
            SET {', '.join(updates)}
            WHERE app_id = ? AND version = ?
        """
        
        cursor = conn.execute(query, params)
        
        if cursor.rowcount == 0:
            # Version changed between our check and update
            current = self.get_application(conn, app_id)
            raise OptimisticLockException(app_id, expected_version, current['version'])
        
        # Record in history
        self._record_history(
            conn, app_id, new_version, ChangeType.UPDATED, operator, change_reason,
            self._get_application_snapshot(conn, app_id)
        )
        
        return self.get_application(conn, app_id)
    
    def soft_delete_application(
        self,
        conn: sqlite3.Connection,
        app_id: str,
        operator: str,
        reason: Optional[str] = None
    ) -> None:
        """
        Soft delete application (mark as inactive and set deleted_at).
        
        Raises:
            ApplicationNotFoundException: If application not found
        """
        
        current = self.get_application(conn, app_id)
        if not current:
            raise ApplicationNotFoundException(app_id)
        
        now = datetime.now().isoformat()
        new_version = current['version'] + 1
        
        conn.execute("""
            UPDATE applications
            SET status = ?,
                deleted_at = ?,
                last_updated_at = ?,
                last_updated_by = ?,
                version = ?
            WHERE app_id = ?
        """, (
            ApplicationStatus.INACTIVE.value,
            now, now, operator, new_version,
            app_id
        ))
        
        # Record in history
        self._record_history(
            conn, app_id, new_version, ChangeType.DELETED, operator, reason,
            self._get_application_snapshot(conn, app_id)
        )
    
    def reactivate_application(
        self,
        conn: sqlite3.Connection,
        app_id: str,
        operator: str
    ) -> Dict[str, Any]:
        """
        Reactivate a soft-deleted application.
        
        Returns:
            Reactivated application data
        
        Raises:
            ApplicationNotFoundException: If application not found
        """
        
        current = self.get_application(conn, app_id, include_deleted=True)
        if not current:
            raise ApplicationNotFoundException(app_id)
        
        now = datetime.now().isoformat()
        new_version = current['version'] + 1
        
        conn.execute("""
            UPDATE applications
            SET status = ?,
                deleted_at = NULL,
                last_updated_at = ?,
                last_updated_by = ?,
                version = ?
            WHERE app_id = ?
        """, (
            ApplicationStatus.ACTIVE.value,
            now, operator, new_version,
            app_id
        ))
        
        # Record in history
        self._record_history(
            conn, app_id, new_version, ChangeType.REACTIVATED, operator, None,
            self._get_application_snapshot(conn, app_id)
        )
        
        return self.get_application(conn, app_id)
    
    def get_application_history(
        self,
        conn: sqlite3.Connection,
        app_id: str,
        limit: int = 50,
        offset: int = 0
    ) -> Tuple[List[Dict[str, Any]], int]:
        """
        Get application change history with pagination.
        
        Returns:
            Tuple of (history entries, total count)
        """
        
        # Get total count
        count_cursor = conn.execute(
            "SELECT COUNT(*) as count FROM application_history WHERE app_id = ?",
            (app_id,)
        )
        total = count_cursor.fetchone()['count']
        
        # Get paginated history
        cursor = conn.execute("""
            SELECT history_id, app_id, version, snapshot, change_type,
                   changed_at, changed_by, change_reason
            FROM application_history
            WHERE app_id = ?
            ORDER BY version DESC
            LIMIT ? OFFSET ?
        """, (app_id, limit, offset))
        
        history = []
        for row in cursor.fetchall():
            history.append({
                'history_id': row['history_id'],
                'app_id': row['app_id'],
                'version': row['version'],
                'snapshot': json.loads(row['snapshot']),
                'change_type': row['change_type'],
                'changed_at': datetime.fromisoformat(row['changed_at']),
                'changed_by': row['changed_by'],
                'change_reason': row['change_reason']
            })
        
        return history, total
    
    def set_monitoring_paused(
        self,
        conn: sqlite3.Connection,
        app_id: str,
        paused: bool,
        operator: str,
        reason: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Pause or resume health check monitoring for an application.

        Returns:
            Updated application data
        Raises:
            ApplicationNotFoundException: If application not found
        """
        current = self.get_application(conn, app_id)
        if not current:
            raise ApplicationNotFoundException(app_id)

        now = datetime.now().isoformat()

        if paused:
            conn.execute("""
                UPDATE applications
                SET monitoring_paused = 1,
                    paused_at = ?,
                    paused_by = ?,
                    pause_reason = ?,
                    last_updated_at = ?,
                    last_updated_by = ?
                WHERE app_id = ?
            """, (now, operator, reason, now, operator, app_id))
        else:
            conn.execute("""
                UPDATE applications
                SET monitoring_paused = 0,
                    paused_at = NULL,
                    paused_by = NULL,
                    pause_reason = NULL,
                    last_updated_at = ?,
                    last_updated_by = ?
                WHERE app_id = ?
            """, (now, operator, app_id))

        return self.get_application(conn, app_id)

    def _name_exists(self, conn: sqlite3.Connection, name: str) -> bool:
        """Check if application name exists among active applications."""
        cursor = conn.execute(
            "SELECT 1 FROM applications WHERE name = ? AND deleted_at IS NULL",
            (name,)
        )
        return cursor.fetchone() is not None
    
    def _container_registered(self, conn: sqlite3.Connection, container_name: str) -> bool:
        """Check if container is already registered among active applications."""
        cursor = conn.execute(
            "SELECT 1 FROM applications WHERE container_name = ? AND deleted_at IS NULL",
            (container_name,)
        )
        return cursor.fetchone() is not None
    
    def _get_application_snapshot(
        self,
        conn: sqlite3.Connection,
        app_id: str
    ) -> Dict[str, Any]:
        """Get full application snapshot for history."""
        app = self.get_application(conn, app_id, include_deleted=True)
        return app if app else {}
    
    def _record_history(
        self,
        conn: sqlite3.Connection,
        app_id: str,
        version: int,
        change_type: ChangeType,
        changed_by: str,
        change_reason: Optional[str],
        snapshot: Dict[str, Any]
    ) -> None:
        """Record application change in history."""
        
        history_id = str(uuid.uuid4())
        changed_at = datetime.now().isoformat()
        
        conn.execute("""
            INSERT INTO application_history (
                history_id, app_id, version, snapshot, change_type,
                changed_at, changed_by, change_reason
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            history_id, app_id, version, json.dumps(snapshot, default=str),
            change_type.value, changed_at, changed_by, change_reason
        ))
    
    def _row_to_dict(self, row: sqlite3.Row) -> Dict[str, Any]:
        """Convert database row to dictionary."""
        return {
            'app_id': row['app_id'],
            'name': row['name'],
            'description': row['description'],
            'container_name': row['container_name'],
            'container_id': row['container_id'],
            'status': row['status'],
            'health_check_config': json.loads(row['health_check_config']),
            'recovery_policy_config': json.loads(row['recovery_policy_config']),
            'metadata': json.loads(row['metadata']),
            'registered_at': datetime.fromisoformat(row['registered_at']),
            'registered_by': row['registered_by'],
            'last_updated_at': datetime.fromisoformat(row['last_updated_at']),
            'last_updated_by': row['last_updated_by'],
            'version': row['version'],
            'deleted_at': datetime.fromisoformat(row['deleted_at']) if row['deleted_at'] else None,
            'monitoring_paused': bool(row['monitoring_paused']),
            'paused_at': datetime.fromisoformat(row['paused_at']) if row['paused_at'] else None,
            'paused_by': row['paused_by'],
            'pause_reason': row['pause_reason']
        }