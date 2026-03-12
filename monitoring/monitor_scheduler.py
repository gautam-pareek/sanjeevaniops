"""
Monitor scheduler.
Manages background health check jobs for all active applications.

Uses APScheduler (BackgroundScheduler) to run each app's health check
on its configured interval. Jobs are isolated per app — one app's
slow check does not delay others.

Lifecycle:
  - start()  called on FastAPI startup
  - stop()   called on FastAPI shutdown
  - sync_jobs() called to add/update/remove jobs when apps change
"""

import logging
from typing import Dict, Any, List

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.jobstores.memory import MemoryJobStore
from apscheduler.executors.pool import ThreadPoolExecutor

from monitoring.monitor_service import MonitorService

logger = logging.getLogger(__name__)

# Job ID prefix — makes jobs easy to identify and remove
_JOB_PREFIX = "healthcheck_"


class MonitorScheduler:
    """
    Manages scheduled health check jobs for all active applications.
    Thread-safe: APScheduler handles its own locking.
    """

    def __init__(self):
        self._service = MonitorService()
        self._scheduler = BackgroundScheduler(
            jobstores={"default": MemoryJobStore()},
            executors={
                # Each job runs in its own thread — up to 20 concurrent checks
                "default": ThreadPoolExecutor(max_workers=20)
            },
            job_defaults={
                "coalesce": True,       # Skip missed runs rather than stacking up
                "max_instances": 1,     # Never run the same app's check twice at once
                "misfire_grace_time": 30,
            },
        )

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    def start(self) -> None:
        """Start the scheduler. Called on application startup."""
        self._scheduler.start()
        logger.info("MonitorScheduler started")

    def stop(self) -> None:
        """Gracefully stop the scheduler. Called on application shutdown."""
        self._scheduler.shutdown(wait=False)
        logger.info("MonitorScheduler stopped")

    # ------------------------------------------------------------------
    # Job management
    # ------------------------------------------------------------------

    def sync_jobs(self, applications: List[Dict[str, Any]]) -> None:
        """
        Synchronise scheduled jobs with the current list of active applications.

        - Adds jobs for apps that are not yet scheduled
        - Updates intervals if an app's config has changed
        - Removes jobs for apps that are no longer active

        Args:
            applications: List of application dicts from ApplicationRepository
        """
        active_app_ids = set()

        for app in applications:
            if app["status"] != "active":
                continue

            app_id = app["app_id"]
            active_app_ids.add(app_id)
            interval = app["health_check_config"].get("interval_seconds", 30)

            job_id = f"{_JOB_PREFIX}{app_id}"
            existing_job = self._scheduler.get_job(job_id)

            if existing_job is None:
                self._add_job(app_id, interval, job_id)
            else:
                # Check if interval has changed
                current_interval = existing_job.trigger.interval.total_seconds()
                if current_interval != interval:
                    logger.info(
                        "Updating health check interval for app %s: %ds -> %ds",
                        app_id,
                        int(current_interval),
                        interval,
                    )
                    self._scheduler.reschedule_job(
                        job_id,
                        trigger="interval",
                        seconds=interval,
                    )

        # Remove jobs for apps that are no longer active
        for job in self._scheduler.get_jobs():
            if not job.id.startswith(_JOB_PREFIX):
                continue
            app_id = job.id[len(_JOB_PREFIX):]
            if app_id not in active_app_ids:
                logger.info("Removing health check job for app %s", app_id)
                self._scheduler.remove_job(job.id)

    def add_app(self, app_id: str, interval_seconds: int) -> None:
        """
        Schedule health checks for a newly registered application.
        Called immediately after successful app registration.
        """
        job_id = f"{_JOB_PREFIX}{app_id}"
        if self._scheduler.get_job(job_id) is None:
            self._add_job(app_id, interval_seconds, job_id)

    def remove_app(self, app_id: str) -> None:
        """
        Remove health check job for a deleted or deactivated application.
        """
        job_id = f"{_JOB_PREFIX}{app_id}"
        if self._scheduler.get_job(job_id):
            self._scheduler.remove_job(job_id)
            logger.info("Removed health check job for app %s", app_id)

    def trigger_now(self, app_id: str) -> None:
        """
        Run a health check for an app immediately (on-demand).
        Used by the manual check API endpoint.
        Does not affect the scheduled interval.
        """
        logger.info("Manual health check triggered for app %s", app_id)
        # Run directly in a thread to avoid blocking the API
        import threading
        t = threading.Thread(
            target=self._service.run_check_for_app,
            args=(app_id,),
            daemon=True,
            name=f"manual-check-{app_id}",
        )
        t.start()

    def get_scheduled_app_ids(self) -> List[str]:
        """Return list of app IDs currently being monitored."""
        return [
            job.id[len(_JOB_PREFIX):]
            for job in self._scheduler.get_jobs()
            if job.id.startswith(_JOB_PREFIX)
        ]

    # ------------------------------------------------------------------
    # Internal
    # ------------------------------------------------------------------

    def _add_job(self, app_id: str, interval_seconds: int, job_id: str) -> None:
        self._scheduler.add_job(
            func=self._service.run_check_for_app,
            trigger="interval",
            seconds=interval_seconds,
            id=job_id,
            args=[app_id],
            name=f"Health check: {app_id}",
        )
        logger.info(
            "Scheduled health check for app %s every %ds", app_id, interval_seconds
        )


# Global scheduler instance — imported by main.py
scheduler = MonitorScheduler()
