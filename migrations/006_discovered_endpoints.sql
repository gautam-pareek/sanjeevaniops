-- Migration 006: Discovered endpoints for auto-crawl feature
-- Stores URLs found by crawling a registered app's base URL.
-- Each endpoint can be excluded (won't be health-checked) without deletion.

CREATE TABLE IF NOT EXISTS discovered_endpoints (
    endpoint_id   TEXT PRIMARY KEY,
    app_id        TEXT NOT NULL,
    url           TEXT NOT NULL,
    status        TEXT NOT NULL DEFAULT 'active'
                  CHECK(status IN ('active', 'excluded')),
    discovered_at TEXT NOT NULL,
    last_seen_at  TEXT NOT NULL,
    excluded_at   TEXT,
    excluded_by   TEXT,
    FOREIGN KEY (app_id) REFERENCES applications(app_id)
);

-- One row per app+url combination
CREATE UNIQUE INDEX IF NOT EXISTS idx_discovered_app_url
    ON discovered_endpoints(app_id, url);

CREATE INDEX IF NOT EXISTS idx_discovered_app_status
    ON discovered_endpoints(app_id, status);
