"""
Discovery API routes.
Handles auto-crawl trigger and endpoint inclusion/exclusion.
"""

from fastapi import APIRouter, HTTPException, Query
from typing import List, Dict, Any

from backend.core.config import settings
from backend.core.database import db
from backend.repositories.application_repository import ApplicationRepository
from backend.repositories.discovery_repository import DiscoveryRepository
from backend.services.discovery_service import DiscoveryService

router = APIRouter(tags=["discovery"])

_app_repo = ApplicationRepository()
_discovery_service = DiscoveryService()


def _require_app(app_id: str) -> Dict[str, Any]:
    """Raise 404 if the app does not exist."""
    with db.get_connection() as conn:
        app = _app_repo.get_application(conn, app_id)
    if not app:
        raise HTTPException(status_code=404, detail=f"Application {app_id!r} not found")
    return app


def _base_url_from_app(app: Dict[str, Any]) -> str:
    """Extract the HTTP base URL from the app's health_check_config."""
    hc = app.get("health_check_config", {})
    if hc.get("type") != "http":
        raise HTTPException(
            status_code=400,
            detail="Auto-discovery is only supported for HTTP health check type",
        )
    url: str = hc.get("config", {}).get("url", "")
    if not url:
        raise HTTPException(status_code=400, detail="App has no configured HTTP URL")
    # Use scheme + netloc as the crawl root
    import urllib.parse
    parsed = urllib.parse.urlparse(url)
    return f"{parsed.scheme}://{parsed.netloc}"


# ── Routes ────────────────────────────────────────────────────────────────────

@router.post("/applications/{app_id}/discover", status_code=202)
def trigger_discovery(app_id: str):
    """
    Trigger a background crawl to discover endpoints for the given app.
    Returns 202 immediately — crawl runs asynchronously.
    """
    app = _require_app(app_id)
    base_url = _base_url_from_app(app)
    _discovery_service.trigger_crawl(app_id, base_url)
    return {"message": "Discovery crawl started", "app_id": app_id, "base_url": base_url}


@router.get("/applications/{app_id}/discovered-endpoints")
def list_discovered_endpoints(app_id: str):
    """
    List all discovered endpoints for an app (active + excluded).
    """
    _require_app(app_id)
    endpoints = _discovery_service.list_endpoints(app_id)
    return {"app_id": app_id, "endpoints": endpoints, "total": len(endpoints)}


@router.put("/applications/{app_id}/discovered-endpoints/{endpoint_id}/exclude")
def exclude_endpoint(app_id: str, endpoint_id: str, operator: str = Query(default="system")):
    """
    Mark a discovered endpoint as excluded so it is skipped during health checks.
    """
    _require_app(app_id)
    try:
        updated = _discovery_service.set_endpoint_status(endpoint_id, "excluded", operator)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return updated


@router.put("/applications/{app_id}/discovered-endpoints/{endpoint_id}/include")
def include_endpoint(app_id: str, endpoint_id: str, operator: str = Query(default="system")):
    """
    Re-activate a previously excluded endpoint.
    """
    _require_app(app_id)
    try:
        updated = _discovery_service.set_endpoint_status(endpoint_id, "active", operator)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return updated
