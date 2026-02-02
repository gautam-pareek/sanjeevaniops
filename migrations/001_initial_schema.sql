-- Migration 001: Initial schema for Application Registration API
-- SanjeevaniOps - Local-first reliability system

-- Table: applications
-- Stores registered applications with their health check and recovery configurations
CREATE TABLE IF NOT EXISTS applications (
    app_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    container_name TEXT NOT NULL,
    container_id TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('active', 'inactive')),
    
    -- Configuration stored as JSON
    health_check_config TEXT NOT NULL,
    recovery_policy_config TEXT NOT NULL,
    metadata TEXT NOT NULL,
    
    -- Audit fields
    registered_at TEXT NOT NULL,
    registered_by TEXT NOT NULL,
    last_updated_at TEXT NOT NULL,
    last_updated_by TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    
    -- Soft delete
    deleted_at TEXT
);

-- Indexes for applications table
CREATE INDEX IF NOT EXISTS idx_applications_status 
    ON applications(status);

CREATE INDEX IF NOT EXISTS idx_applications_container_name 
    ON applications(container_name);

CREATE INDEX IF NOT EXISTS idx_applications_deleted_at 
    ON applications(deleted_at);

-- Unique constraint: name must be unique among active (non-deleted) applications
CREATE UNIQUE INDEX IF NOT EXISTS idx_applications_name_active 
    ON applications(name) WHERE deleted_at IS NULL;

-- Table: application_history
-- Immutable audit trail of all application changes
CREATE TABLE IF NOT EXISTS application_history (
    history_id TEXT PRIMARY KEY,
    app_id TEXT NOT NULL,
    version INTEGER NOT NULL,
    
    -- Full snapshot of application state at this version
    snapshot TEXT NOT NULL,
    
    -- Change metadata
    change_type TEXT NOT NULL CHECK(change_type IN ('created', 'updated', 'deleted', 'reactivated')),
    changed_at TEXT NOT NULL,
    changed_by TEXT NOT NULL,
    change_reason TEXT,
    
    FOREIGN KEY (app_id) REFERENCES applications(app_id)
);

-- Indexes for application_history table
CREATE INDEX IF NOT EXISTS idx_application_history_app_id 
    ON application_history(app_id);

CREATE INDEX IF NOT EXISTS idx_application_history_changed_at 
    ON application_history(changed_at);

-- Table: container_cache
-- Cached Docker container information for quick lookups and verification
CREATE TABLE IF NOT EXISTS container_cache (
    container_id TEXT PRIMARY KEY,
    container_name TEXT NOT NULL,
    image TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    
    -- Cache metadata
    cached_at TEXT NOT NULL,
    
    -- Full Docker inspect output
    docker_inspect TEXT NOT NULL
);

-- Indexes for container_cache table
CREATE INDEX IF NOT EXISTS idx_container_cache_name 
    ON container_cache(container_name);

CREATE INDEX IF NOT EXISTS idx_container_cache_cached_at 
    ON container_cache(cached_at);