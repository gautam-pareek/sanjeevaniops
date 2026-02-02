"""
FastAPI dependency injection functions.
Provides reusable dependencies for request handling.
"""

from typing import Annotated
from fastapi import Header, HTTPException, status
import sqlite3

from backend.core.database import get_db_connection


def get_current_operator(
    x_operator: Annotated[str | None, Header()] = None
) -> str:
    """
    Extract operator identity from request headers.
    Falls back to 'system' if not provided.
    
    In production, this would integrate with authentication.
    """
    if x_operator:
        return x_operator
    return "system"


# Type aliases for dependency injection
DbConnection = Annotated[sqlite3.Connection, get_db_connection]
CurrentOperator = Annotated[str, get_current_operator]