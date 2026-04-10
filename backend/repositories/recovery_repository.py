"""
Recovery Actions Repository.
Data access layer for container restart audit log.
"""

import sqlite3
import uuid
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional


class RecoveryRepository:
    """Repository for recovery action audit log."""

    def create_action(
        self,
        conn: sqlite3.Connection,
        app_id: str,
        container_name: str,
        requested_by: str,
        status: str,
        result_message: Optional[str] = None,
        event_id: Optional[str] = None,
        action_type: str = "restart",
    ) -> str:
        """
        Insert a new recovery action record.
        Returns the action_id of the inserted row.
        """
        action_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()

        conn.execute(
            """
            INSERT INTO recovery_actions
                (action_id, app_id, event_id, container_name, action_type,
                 requested_by, requested_at, status, result_message, executed_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                action_id,
                app_id,
                event_id,
                container_name,
                action_type,
                requested_by,
                now,
                status,
                result_message,
                now,
            ),
        )
        return action_id

    def count_auto_restarts_since(
        self,
        conn: sqlite3.Connection,
        app_id: str,
        since_iso: str,
    ) -> int:
        """Count automatic restarts for an app since a given ISO timestamp."""
        row = conn.execute(
            """
            SELECT COUNT(*) FROM recovery_actions
            WHERE app_id = ?
              AND requested_by = 'auto-recovery'
              AND requested_at >= ?
            """,
            (app_id, since_iso),
        ).fetchone()
        return row[0] if row else 0

    def list_actions(
        self,
        conn: sqlite3.Connection,
        app_id: str,
        limit: int = 20,
    ) -> List[Dict[str, Any]]:
        """List recovery actions for an application, newest first."""
        rows = conn.execute(
            """
            SELECT * FROM recovery_actions
            WHERE app_id = ?
            ORDER BY requested_at DESC
            LIMIT ?
            """,
            (app_id, limit),
        ).fetchall()
        return [dict(r) for r in rows]
