-- Migration 004: Crash Events
-- Stores Docker log snapshots captured when an app transitions to unhealthy

CREATE TABLE IF NOT EXISTS crash_events (
    event_id TEXT PRIMARY KEY,
    app_id TEXT NOT NULL,
    triggered_by_result_id TEXT,
    container_name TEXT NOT NULL,
    container_logs TEXT,
    container_status TEXT,
    exit_code INTEGER,
    captured_at TEXT NOT NULL,
    ai_analysis TEXT,
    ai_analyzed_at TEXT,
    FOREIGN KEY (app_id) REFERENCES applications(app_id),
    FOREIGN KEY (triggered_by_result_id) REFERENCES health_check_results(result_id)
);

CREATE INDEX IF NOT EXISTS idx_crash_events_app_id ON crash_events(app_id);
CREATE INDEX IF NOT EXISTS idx_crash_events_captured_at ON crash_events(captured_at);
