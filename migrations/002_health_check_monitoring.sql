-- Migration 002: Health Check Monitoring Engine
-- SanjeevaniOps - Local-first reliability system

-- Table: health_check_results
-- Immutable log of every health check execution
CREATE TABLE IF NOT EXISTS health_check_results (
    result_id TEXT PRIMARY KEY,
    app_id TEXT NOT NULL,

    -- Check outcome
    status TEXT NOT NULL CHECK(status IN ('healthy', 'unhealthy', 'timeout', 'error')),
    response_time_ms INTEGER,          -- NULL if check never connected
    error_message TEXT,                -- NULL on success

    -- Snapshot of what was checked (in case config changes later)
    check_type TEXT NOT NULL,
    check_config TEXT NOT NULL,        -- JSON snapshot of config used

    checked_at TEXT NOT NULL,

    FOREIGN KEY (app_id) REFERENCES applications(app_id)
);

CREATE INDEX IF NOT EXISTS idx_health_results_app_id
    ON health_check_results(app_id);

CREATE INDEX IF NOT EXISTS idx_health_results_checked_at
    ON health_check_results(checked_at);

CREATE INDEX IF NOT EXISTS idx_health_results_app_checked
    ON health_check_results(app_id, checked_at DESC);


-- Table: app_health_status
-- Current health state for each application (one row per app)
CREATE TABLE IF NOT EXISTS app_health_status (
    app_id TEXT PRIMARY KEY,

    -- Current state
    current_status TEXT NOT NULL CHECK(current_status IN ('healthy', 'unhealthy', 'unknown', 'error')),
    consecutive_failures INTEGER NOT NULL DEFAULT 0,
    consecutive_successes INTEGER NOT NULL DEFAULT 0,

    -- Last check info
    last_checked_at TEXT,
    last_result_id TEXT,

    -- Timestamps
    status_changed_at TEXT NOT NULL,
    first_failure_at TEXT,             -- When the current failure streak started

    FOREIGN KEY (app_id) REFERENCES applications(app_id),
    FOREIGN KEY (last_result_id) REFERENCES health_check_results(result_id)
);

CREATE INDEX IF NOT EXISTS idx_app_health_status_status
    ON app_health_status(current_status);
