-- Migration 007: Version tracking columns
-- docker_image_version: tag parsed from the Docker image (e.g. "nginx:1.19" -> "1.19")
-- app_version:          version string returned by the app's configured /version endpoint

-- SQLite ALTER TABLE only supports ADD COLUMN, so two separate statements.
ALTER TABLE applications ADD COLUMN docker_image_version TEXT;
ALTER TABLE applications ADD COLUMN app_version TEXT;
