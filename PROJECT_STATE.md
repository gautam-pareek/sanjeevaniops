# SanjeevaniOps — Project State

Last updated: 2026-03-13

---

## Completed Features

### Feature 1: Project Setup ✅
- Repo structure, SQLite migrations, FastAPI config, database layer
- Branch strategy: `backend-dev`, `frontend-dev`, `main`

### Feature 2: Application Registration API ✅
- Full CRUD for Docker app registration
- Health check config storage (HTTP, TCP, Exec, Docker Native)
- Recovery policy definition and storage
- Optimistic locking, soft-delete, immutable audit history
- Container existence verification via Docker SDK (read-only)

### Dashboard UI ✅
- Dark-themed vanilla JS/HTML/CSS — zero build step
- Full CRUD, 4-step registration wizard, history view
- Container verification, search/filter
- Open `dashboard/index.html` in browser — no build needed

### Feature 3: Health Check Monitoring Engine ✅
- APScheduler background jobs — one per registered app
- All 4 check types executing: HTTP, TCP, Exec, Docker Native
- Hysteresis: status only changes after failure_threshold/success_threshold met
- Results stored in `health_check_results` table
- Current state tracked in `app_health_status` table
- Pause/Resume monitoring per app (with optional reason + operator)
- Container exited → immediately marked unhealthy (bypasses threshold)
- Dashboard health badges on app cards and detail view
- Health history table in detail view
- "Run Check Now" manual trigger button
- Pause/Resume buttons in detail view
- Badge logic: Monitoring / Unmonitored / ⏸ Paused
- Stat cards: "Monitoring" count / "Unmonitored" count / Healthy / Unhealthy

### Bug Fixes Applied ✅
- SQLite `check_same_thread=False` — fixes threading crash in FastAPI
- Idempotent migrations — `execute_migration()` skips duplicate column errors
- Route conflict fixed — `/monitoring/summary` (was `/health/summary`)
- Stale health status — frontend overrides DB "healthy" when container not running
- Docker graceful degradation — API stays up when Docker daemon is unavailable

---

## In Progress

### Feature 3 Extension: Enhanced Health Checks 🔄
Adding 5 more detection methods to `health_checker.py` and `HttpHealthCheckConfig`:

| # | Check | Status | Catches |
|---|-------|--------|---------|
| 1 | HTTP Status Code | ✅ Done | Site completely down |
| 2 | Response Time threshold | 🔄 Building | High traffic / slow server |
| 3 | Keyword in response body | 🔄 Building | Error pages returning 200 |
| 4 | Container restart count | 🔄 Building | Crash-looping container |
| 5 | Multi-endpoint reachability | 🔄 Building | Specific pages/routes broken |
| 6 | API connectivity + JSON validation | 🔄 Building | Backend API down |

Files to change:
- `monitoring/health_checker.py` — add new check logic + SubCheckResult
- `backend/api/v1/models/requests.py` — extend HttpHealthCheckConfig
- `dashboard/app.js` + `components.js` — display sub-check results

---

## Not Started

### Feature 4: Log Collection & Crash Events 🔜
- On unhealthy detection: pull Docker container logs automatically
- Store as crash event in new `crash_events` table
- New migration: `migrations/004_crash_events.sql`
- Link crash event to triggering health check result
- Show crash events in application detail view

### Feature 5: AI Log Analysis (Ollama) 🔜
- Send crash event logs to local Ollama (LLaMA 3.1)
- Prompt: analyze logs → return crash reason + suggested fix
- Store AI analysis result in DB
- Display as "AI Insight" panel in application detail view
- No external APIs — fully local
- Add `ollama` to requirements.txt

### Feature 6: Recovery Actions 🔜
- Manual one-click recovery from dashboard
- Actions: container restart, pull fresh image
- Human approval required before execution
- Log all actions with operator identity and timestamp
- Never autonomous — always requires a button click

---

## Migrations

| File | Status | Description |
|------|--------|-------------|
| `001_initial_schema.sql` | ✅ Applied | Applications, audit history, container cache |
| `002_health_check_monitoring.sql` | ✅ Applied | Health check results, app health status |
| `003_monitoring_pause.sql` | ✅ Applied | monitoring_paused, paused_at, paused_by, pause_reason |
| `004_crash_events.sql` | 🔜 Planned | crash_events table for log collection |

---

## Dependencies

```
fastapi>=0.115.0
uvicorn[standard]>=0.27.0
pydantic>=2.10.6
pydantic-settings>=2.7.1
docker>=7.0.0
python-dateutil>=2.8.2
apscheduler>=3.10.4
requests>=2.31.0
# planned: ollama (Feature 5)
```
