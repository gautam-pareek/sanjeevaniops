-- Migration 005: Recovery Actions
-- Stores audit log of every container restart triggered from the dashboard

CREATE TABLE IF NOT EXISTS recovery_actions (
    action_id       TEXT PRIMARY KEY,
    app_id          TEXT NOT NULL,
    event_id        TEXT,                          -- linked crash event (nullable)
    container_name  TEXT NOT NULL,
    action_type     TEXT NOT NULL DEFAULT 'restart',
    requested_by    TEXT NOT NULL,
    requested_at    TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'executed', -- executed | failed
    result_message  TEXT,
    executed_at     TEXT
);
