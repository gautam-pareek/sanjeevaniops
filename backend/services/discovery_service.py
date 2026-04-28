"""
Discovery service — orchestrates endpoint auto-crawl.

On registration (or manual trigger), launches a background thread that:
  1. Crawls the app's base HTTP URL
  2. Persists discovered URLs to discovered_endpoints table

Exclusion/inclusion of individual endpoints is also handled here.
"""

import logging
import threading
from typing import Dict, Any, List, Optional

from backend.core.database import db
from backend.repositories.discovery_repository import DiscoveryRepository
from backend.exceptions.custom_exceptions import ApplicationNotFoundException

logger = logging.getLogger(__name__)


class DiscoveryService:
    """Service for automatic endpoint discovery."""

    def __init__(self, discovery_repo: Optional[DiscoveryRepository] = None) -> None:
        self._repo = discovery_repo or DiscoveryRepository()

    # ------------------------------------------------------------------ #
    # Public: trigger crawl                                                #
    # ------------------------------------------------------------------ #

    def trigger_crawl(self, app_id: str, base_url: str) -> None:
        """
        Start a background crawl for the given app.
        Returns immediately — discovery happens asynchronously.
        """
        t = threading.Thread(
            target=self._crawl_and_save,
            args=(app_id, base_url),
            daemon=True,
        )
        t.start()
        logger.info("[DISCOVERY] crawl scheduled app=%s url=%s", app_id, base_url)

    # ------------------------------------------------------------------ #
    # Public: list / exclude / include                                     #
    # ------------------------------------------------------------------ #

    def list_endpoints(self, app_id: str) -> List[Dict[str, Any]]:
        """Return all discovered endpoints (active + excluded) for an app."""
        with db.get_connection() as conn:
            return self._repo.list_endpoints(conn, app_id)

    def set_endpoint_status(
        self, endpoint_id: str, status: str, operator: str
    ) -> Dict[str, Any]:
        """
        Set an endpoint status to 'active' or 'excluded'.

        Raises:
            ValueError: If endpoint not found.
        """
        with db.get_connection() as conn:
            result = self._repo.set_status(conn, endpoint_id, status, operator)
            if result is None:
                raise ValueError(f"Endpoint {endpoint_id!r} not found")
            return result

    # ------------------------------------------------------------------ #
    # Internal                                                             #
    # ------------------------------------------------------------------ #

    def _crawl_and_save(self, app_id: str, base_url: str) -> None:
        try:
            from monitoring.link_crawler import crawl
            from backend.core.config import settings

            max_pages = getattr(settings, "crawl_max_pages", 50)
            timeout = getattr(settings, "crawl_timeout_seconds", 5)

            urls = crawl(base_url, max_pages=max_pages, timeout=timeout)

            if not urls:
                logger.info("[DISCOVERY] no URLs found app=%s", app_id)
                return

            with db.get_connection() as conn:
                inserted = self._repo.upsert_endpoints(conn, app_id, urls)

            logger.info(
                "[DISCOVERY] app=%s total=%d new=%d", app_id, len(urls), inserted
            )
        except Exception as exc:
            logger.error("[DISCOVERY] crawl failed app=%s error=%s", app_id, exc)
