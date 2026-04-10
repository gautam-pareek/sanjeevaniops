"""
Health check repository.
Data access layer for health check results and application health status.
"""

import sqlite3
import uuid
import json
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional, Tuple


class HealthRepository:
    """Repository for health check results and app health status."""

    # ------------------------------------------------------------------
    # Health Check Results
    # ------------------------------------------------------------------

    def insert_result(
        self,
        conn: sqlite3.Connection,
        app_id: str,
        status: str,
        check_type: str,
        check_config: Dict[str, Any],
        response_time_ms: Optional[int] = None,
        error_message: Optional[str] = None,
        sub_checks: Optional[list] = None,
    ) -> str:
        """
        Insert a new health check result.

        Returns:
            result_id of the inserted row
        """
        result_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()

        # Serialize sub_checks into check_config for storage
        config_with_sub = dict(check_config)
        if sub_checks:
            config_with_sub["sub_checks"] = [
                {"name": sc.name, "passed": sc.passed, "message": sc.message}
                for sc in sub_checks
            ]

        conn.execute(
            """
            INSERT INTO health_check_results
                (result_id, app_id, status, response_time_ms, error_message,
                 check_type, check_config, checked_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                result_id,
                app_id,
                status,
                response_time_ms,
                error_message,
                check_type,
                json.dumps(config_with_sub),
                now,
            ),
        )
        return result_id

    def get_result(
        self, conn: sqlite3.Connection, result_id: str
    ) -> Optional[Dict[str, Any]]:
        """Get a single health check result by ID."""
        row = conn.execute(
            "SELECT * FROM health_check_results WHERE result_id = ?", (result_id,)
        ).fetchone()
        return self._row_to_result(row) if row else None

    def list_results(
        self,
        conn: sqlite3.Connection,
        app_id: str,
        limit: int = 50,
        offset: int = 0,
        status_filter: Optional[str] = None,
    ) -> Tuple[List[Dict[str, Any]], int]:
        """
        List health check results for an application, newest first.

        Returns:
            (results, total_count)
        """
        base_where = "WHERE app_id = ?"
        params: list = [app_id]

        if status_filter:
            base_where += " AND status = ?"
            params.append(status_filter)

        total = conn.execute(
            f"SELECT COUNT(*) FROM health_check_results {base_where}", params
        ).fetchone()[0]

        rows = conn.execute(
            f"""
            SELECT * FROM health_check_results
            {base_where}
            ORDER BY checked_at DESC
            LIMIT ? OFFSET ?
            """,
            params + [limit, offset],
        ).fetchall()

        return [self._row_to_result(r) for r in rows], total

    # ------------------------------------------------------------------
    # App Health Status
    # ------------------------------------------------------------------

    def get_status(
        self, conn: sqlite3.Connection, app_id: str
    ) -> Optional[Dict[str, Any]]:
        """Get current health status for an application."""
        row = conn.execute(
            "SELECT * FROM app_health_status WHERE app_id = ?", (app_id,)
        ).fetchone()
        return self._row_to_status(row) if row else None

    def upsert_status(
        self,
        conn: sqlite3.Connection,
        app_id: str,
        current_status: str,
        consecutive_failures: int,
        consecutive_successes: int,
        last_result_id: str,
        first_failure_at: Optional[str],
    ) -> None:
        """
        Insert or update the health status for an application.
        Called after every check execution.
        """
        now = datetime.now(timezone.utc).isoformat()

        existing = self.get_status(conn, app_id)

        if existing is None:
            conn.execute(
                """
                INSERT INTO app_health_status
                    (app_id, current_status, consecutive_failures, consecutive_successes,
                     last_checked_at, last_result_id, status_changed_at, first_failure_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    app_id,
                    current_status,
                    consecutive_failures,
                    consecutive_successes,
                    now,
                    last_result_id,
                    now,
                    first_failure_at,
                ),
            )
        else:
            # Only update status_changed_at when status actually changes
            status_changed_at = (
                now
                if existing["current_status"] != current_status
                else existing["status_changed_at"]
            )
            conn.execute(
                """
                UPDATE app_health_status SET
                    current_status = ?,
                    consecutive_failures = ?,
                    consecutive_successes = ?,
                    last_checked_at = ?,
                    last_result_id = ?,
                    status_changed_at = ?,
                    first_failure_at = ?
                WHERE app_id = ?
                """,
                (
                    current_status,
                    consecutive_failures,
                    consecutive_successes,
                    now,
                    last_result_id,
                    status_changed_at,
                    first_failure_at,
                    app_id,
                ),
            )

    def delete_status(self, conn: sqlite3.Connection, app_id: str) -> None:
        """Remove health status entry (e.g., when app is deleted)."""
        conn.execute("DELETE FROM app_health_status WHERE app_id = ?", (app_id,))

    def list_all_statuses(
        self, conn: sqlite3.Connection
    ) -> List[Dict[str, Any]]:
        """List health status for all applications."""
        rows = conn.execute(
            "SELECT * FROM app_health_status ORDER BY last_checked_at DESC"
        ).fetchall()
        return [self._row_to_status(r) for r in rows]

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _row_to_result(self, row: sqlite3.Row) -> Dict[str, Any]:
        d = dict(row)
        d["check_config"] = json.loads(d["check_config"])
        return d

    def _row_to_status(self, row: sqlite3.Row) -> Dict[str, Any]:
        return dict(row)
    # ------------------------------------------------------------------
    # Crash Events
    # ------------------------------------------------------------------

    def insert_crash_event(
        self,
        conn,
        app_id: str,
        container_name: str,
        triggered_by_result_id: str,
        container_logs: str,
        container_status: str,
        exit_code=None,
    ) -> str:
        import uuid
        from datetime import datetime, timezone
        event_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()
        conn.execute(
            """
            INSERT INTO crash_events
                (event_id, app_id, triggered_by_result_id, container_name,
                 container_logs, container_status, exit_code, captured_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (event_id, app_id, triggered_by_result_id, container_name,
             container_logs, container_status, exit_code, now),
        )
        return event_id

    def list_crash_events(
        self, conn, app_id: str, limit: int = 20
    ) -> list:
        rows = conn.execute(
            """
            SELECT * FROM crash_events
            WHERE app_id = ?
            ORDER BY captured_at DESC
            LIMIT ?
            """,
            (app_id, limit),
        ).fetchall()
        return [dict(r) for r in rows]

    def get_crash_event(self, conn, event_id: str):
        row = conn.execute(
            "SELECT * FROM crash_events WHERE event_id = ?", (event_id,)
        ).fetchone()
        return dict(row) if row else None

    def update_crash_event_analysis(
        self, conn, event_id: str, ai_analysis: str, container_logs: str = None
    ) -> None:
        """Store AI analysis result on a crash event. Optionally refreshes container_logs."""
        from datetime import datetime, timezone
        now = datetime.now(timezone.utc).isoformat()
        if container_logs is not None:
            conn.execute(
                "UPDATE crash_events SET ai_analysis = ?, ai_analyzed_at = ?, container_logs = ? WHERE event_id = ?",
                (ai_analysis, now, container_logs, event_id),
            )
        else:
            conn.execute(
                "UPDATE crash_events SET ai_analysis = ?, ai_analyzed_at = ? WHERE event_id = ?",
                (ai_analysis, now, event_id),
            )

    def crash_event_exists_for_result(self, conn, result_id: str) -> bool:
        row = conn.execute(
            "SELECT 1 FROM crash_events WHERE triggered_by_result_id = ?",
            (result_id,)
        ).fetchone()
        return row is not None

    def delete_old_crash_events(self, conn, retention_minutes: int) -> int:
        """Delete crash events older than retention_minutes. Returns count deleted."""
        cutoff = datetime.now(timezone.utc).timestamp() - (retention_minutes * 60)
        cutoff_iso = datetime.fromtimestamp(cutoff, tz=timezone.utc).isoformat()
        result = conn.execute(
            "DELETE FROM crash_events WHERE captured_at < ?",
            (cutoff_iso,)
        )
        return result.rowcount
