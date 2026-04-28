"""
Repository for discovered endpoints.
All DB operations for the discovered_endpoints table.
"""

import json
import sqlite3
import uuid
from datetime import datetime
from typing import Dict, Any, List, Optional


class DiscoveryRepository:
    """Repository for discovered_endpoints table operations."""

    def upsert_endpoints(
        self,
        conn: sqlite3.Connection,
        app_id: str,
        urls: List[str],
    ) -> int:
        """
        Insert new discovered URLs for an app. Already-known URLs get their
        last_seen_at refreshed. Excluded URLs are not re-activated.

        Returns:
            Number of new URLs inserted.
        """
        now = datetime.now().isoformat()
        inserted = 0

        for url in urls:
            # Try insert; on conflict (same app_id + url) just update last_seen_at
            cursor = conn.execute(
                """
                INSERT INTO discovered_endpoints
                    (endpoint_id, app_id, url, status, discovered_at, last_seen_at)
                VALUES (?, ?, ?, 'active', ?, ?)
                ON CONFLICT(app_id, url) DO UPDATE
                    SET last_seen_at = excluded.last_seen_at
                """,
                (str(uuid.uuid4()), app_id, url, now, now),
            )
            if cursor.rowcount == 1:
                inserted += 1

        return inserted

    def get_active_endpoints(
        self,
        conn: sqlite3.Connection,
        app_id: str,
    ) -> List[str]:
        """Return URLs for an app that are currently active (not excluded)."""
        cursor = conn.execute(
            """
            SELECT url FROM discovered_endpoints
            WHERE app_id = ? AND status = 'active'
            ORDER BY discovered_at ASC
            """,
            (app_id,),
        )
        return [row["url"] for row in cursor.fetchall()]

    def list_endpoints(
        self,
        conn: sqlite3.Connection,
        app_id: str,
    ) -> List[Dict[str, Any]]:
        """Return all endpoints (active + excluded) for an app."""
        cursor = conn.execute(
            """
            SELECT endpoint_id, app_id, url, status,
                   discovered_at, last_seen_at, excluded_at, excluded_by
            FROM discovered_endpoints
            WHERE app_id = ?
            ORDER BY discovered_at ASC
            """,
            (app_id,),
        )
        return [self._row_to_dict(row) for row in cursor.fetchall()]

    def set_status(
        self,
        conn: sqlite3.Connection,
        endpoint_id: str,
        status: str,
        operator: str,
    ) -> Optional[Dict[str, Any]]:
        """
        Set status of an endpoint to 'active' or 'excluded'.

        Returns:
            Updated endpoint dict, or None if endpoint_id not found.
        """
        now = datetime.now().isoformat()
        if status == "excluded":
            conn.execute(
                """
                UPDATE discovered_endpoints
                SET status = 'excluded', excluded_at = ?, excluded_by = ?
                WHERE endpoint_id = ?
                """,
                (now, operator, endpoint_id),
            )
        else:
            conn.execute(
                """
                UPDATE discovered_endpoints
                SET status = 'active', excluded_at = NULL, excluded_by = NULL
                WHERE endpoint_id = ?
                """,
                (endpoint_id,),
            )

        cursor = conn.execute(
            """
            SELECT endpoint_id, app_id, url, status,
                   discovered_at, last_seen_at, excluded_at, excluded_by
            FROM discovered_endpoints
            WHERE endpoint_id = ?
            """,
            (endpoint_id,),
        )
        row = cursor.fetchone()
        return self._row_to_dict(row) if row else None

    def delete_for_app(self, conn: sqlite3.Connection, app_id: str) -> None:
        """Delete all discovered endpoints for an app (e.g. on app deletion)."""
        conn.execute(
            "DELETE FROM discovered_endpoints WHERE app_id = ?",
            (app_id,),
        )

    def _row_to_dict(self, row: sqlite3.Row) -> Dict[str, Any]:
        return {
            "endpoint_id": row["endpoint_id"],
            "app_id": row["app_id"],
            "url": row["url"],
            "status": row["status"],
            "discovered_at": row["discovered_at"],
            "last_seen_at": row["last_seen_at"],
            "excluded_at": row["excluded_at"],
            "excluded_by": row["excluded_by"],
        }
