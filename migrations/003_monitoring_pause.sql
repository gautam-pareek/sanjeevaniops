-- Migration 003: Add monitoring pause/resume support
-- SanjeevaniOps - Local-first reliability system

ALTER TABLE applications ADD COLUMN monitoring_paused INTEGER NOT NULL DEFAULT 0;
ALTER TABLE applications ADD COLUMN paused_at TEXT;
ALTER TABLE applications ADD COLUMN paused_by TEXT;
ALTER TABLE applications ADD COLUMN pause_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_applications_monitoring_paused
    ON applications(monitoring_paused);
