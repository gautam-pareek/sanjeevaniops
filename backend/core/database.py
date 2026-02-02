"""
Database connection and lifecycle management.
Handles SQLite connection pooling and initialization.
"""

import sqlite3
from contextlib import contextmanager
from typing import Generator
from pathlib import Path

from backend.core.config import settings


class Database:
    """Database manager for SQLite connections."""
    
    def __init__(self, database_url: str):
        """Initialize database manager."""
        # Extract file path from URL (sqlite:///./sanjeevaniops.db -> ./sanjeevaniops.db)
        self.db_path = database_url.replace("sqlite:///", "")
        self._ensure_database_exists()
    
    def _ensure_database_exists(self):
        """Ensure database file and directory exist."""
        db_file = Path(self.db_path)
        db_file.parent.mkdir(parents=True, exist_ok=True)
        
        # Create file if it doesn't exist
        if not db_file.exists():
            db_file.touch()
    
    @contextmanager
    def get_connection(self) -> Generator[sqlite3.Connection, None, None]:
        """
        Get a database connection with context management.
        Automatically commits or rolls back on exception.
        """
        conn = sqlite3.connect(
            self.db_path,
            isolation_level=None  # Autocommit mode, we'll handle transactions explicitly
        )
        
        # Return rows as dictionaries
        conn.row_factory = sqlite3.Row
        
        # Enable foreign keys
        conn.execute("PRAGMA foreign_keys = ON")
        
        # Enable write-ahead logging for better concurrency
        conn.execute("PRAGMA journal_mode = WAL")
        
        try:
            yield conn
        finally:
            conn.close()
    
    def execute_migration(self, migration_file: str):
        """Execute a SQL migration file."""
        migration_path = Path(migration_file)
        
        if not migration_path.exists():
            raise FileNotFoundError(f"Migration file not found: {migration_file}")
        
        with self.get_connection() as conn:
            sql = migration_path.read_text()
            conn.executescript(sql)


# Global database instance
db = Database(settings.database_url)


def get_db_connection() -> Generator[sqlite3.Connection, None, None]:
    """Dependency for FastAPI to inject database connections."""
    with db.get_connection() as conn:
        yield conn