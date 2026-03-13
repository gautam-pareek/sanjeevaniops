# SanjeevaniOps — AI Agent System Prompt

This file is the authoritative context document for AI coding agents working on this project.
Read this entire file before writing any code or making any suggestions.

---

## What Is This Project

SanjeevaniOps is a **final semester college project** — a local-first Docker application reliability
and recovery platform. The name comes from the Sanjeevani herb in Hindu mythology that revives the dead.
The goal is to revive crashed applications.

**Problem statement:** Applications and websites crash due to many reasons — traffic overload,
broken routes, API failures, memory leaks, container crashes. Developers need a tool that:
1. Constantly monitors their Docker apps
2. Detects crashes and diagnoses WHY they happened
3. Uses a local AI to analyze logs and suggest fixes
4. Reduces downtime with human-approved recovery actions

---

## Hard Constraints (Non-Negotiable)

❌ No cloud providers (AWS, GCP, Azure)
❌ No Kubernetes
❌ No paid APIs or SaaS tools
❌ No autonomous AI execution
❌ No AI-driven code modification
❌ No external LLM APIs (OpenAI, Anthropic, etc.)
✅ Local-first — everything runs on the developer's machine
✅ Human-controlled — no action taken without approval
✅ Explainable — every decision is logged and visible
✅ Local LLM only — Ollama (LLaMA 3.1) for AI analysis

---

## Target User

Final semester college project — demo audience is professors and peers.
Apps being monitored are simple local Docker containers (nginx, Flask, Node etc.)
running on a Windows/Mac/Linux development machine.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend API | FastAPI + Uvicorn |
| Database | SQLite (local, explicit SQL migrations) |
| Validation | Pydantic v2 |
| Container Integration | Docker SDK (read-only inspect only) |
| Health Scheduler | APScheduler |
| Frontend | Vanilla HTML/CSS/JS — zero build step |
| AI Engine | Ollama (LLaMA 3.1) — local only |
| Automation | Planned: n8n |

---

## Branch Strategy

- `backend-dev` — all Python/migration/API changes
- `frontend-dev` — all dashboard/JS/CSS changes
- `main` — stable, merged from both branches
- Never commit directly to main
- PowerShell users: put all `git add` args on ONE line (no backslash continuation)

---

## Developer Workflow

1. Claude generates files locally and presents them for download
2. Developer copies files manually into the project
3. Developer tests locally
4. Developer commits to correct branch and pushes
5. Merge to main when both branches are stable

---

## Current Project State

### ✅ Feature 1: Project Setup
- Repo structure, migrations, config, database layer

### ✅ Feature 2: Application Registration API
- Full CRUD for Docker application registration
- Health check config storage (HTTP, TCP, Exec, Docker Native types)
- Recovery policy storage
- Optimistic locking, soft-delete, immutable audit history
- Container verification via Docker SDK (read-only)

### ✅ Dashboard UI
- Dark-themed vanilla JS/HTML/CSS (zero build step)
- Full CRUD, registration wizard, history view, container verification
- Open `dashboard/index.html` in browser — no build needed

### ✅ Feature 3: Health Check Monitoring Engine
- Executes actual health checks on schedule (APScheduler)
- All 4 check types: HTTP, TCP, Exec, Docker Native
- Hysteresis: status only changes after failure_threshold/success_threshold met
- Results stored in `health_check_results` table
- Current state in `app_health_status` table
- Pause/Resume monitoring per app (with reason)
- Container exited → immediately marked unhealthy (no waiting for threshold)
- Dashboard: health badges, health panel, history table, Run Check Now button
- Dashboard: Pause/Resume buttons, Paused indicator
- Dashboard badge logic:
  - Container running + monitoring active → shows "Monitoring" badge
  - Container not running → shows "Unhealthy" only, no "Monitoring" badge
  - Monitoring manually paused → shows "⏸ Paused" only
- Stat cards: "Monitoring" / "Unmonitored" (not Active/Inactive)

### 🔄 Feature 3 Extension: Enhanced Health Checks (IN PROGRESS)
Adding 5 more check types beyond basic HTTP status code:
1. ✅ HTTP Status Code (already built)
2. 🔄 Response Time threshold (warn >3s, critical >5s)
3. 🔄 Keyword detection in response body (catches error pages returning 200)
4. 🔄 Container restart count increase detection
5. 🔄 Multi-endpoint reachability (check multiple URLs of same app)
6. 🔄 API connectivity + JSON validation

### 🔜 Feature 4: Log Collection & Crash Events
- When container goes unhealthy, pull Docker logs automatically
- Store as crash event in `crash_events` table
- New migration: 004_crash_events.sql
- Link crash event to the health check result that triggered it

### 🔜 Feature 5: AI Log Analysis (Ollama)
- Send crash event logs to local Ollama (LLaMA 3.1)
- Get back: crash reason + suggested fix
- Display in dashboard detail view as "AI Insight" panel
- Notification shown in application detail page when new analysis available

### 🔜 Feature 6: Recovery Actions
- Manual one-click recovery from dashboard (container restart, etc.)
- Human approval required — never automatic
- Log all recovery actions with operator identity

---

## File Structure

```
sanjeevaniops/
├── backend/
│   ├── api/
│   │   ├── main.py                    # FastAPI app, runs migrations, starts scheduler
│   │   ├── dependencies.py
│   │   └── v1/
│   │       ├── applications.py        # CRUD endpoints
│   │       ├── health.py              # Health + pause/resume endpoints
│   │       └── models/
│   │           ├── requests.py
│   │           ├── responses.py
│   │           ├── health_responses.py
│   │           └── enums.py
│   ├── core/
│   │   ├── config.py
│   │   └── database.py                # check_same_thread=False, idempotent migrations
│   ├── services/
│   │   ├── application_service.py
│   │   ├── docker_service.py          # graceful degradation when Docker unavailable
│   │   └── validation_service.py
│   ├── repositories/
│   │   ├── application_repository.py  # includes set_monitoring_paused()
│   │   ├── container_cache_repository.py
│   │   └── health_repository.py
│   └── exceptions/
│       └── custom_exceptions.py
├── monitoring/
│   ├── __init__.py
│   ├── health_checker.py              # executes HTTP/TCP/Exec/DockerNative checks
│   ├── monitor_service.py             # skips inactive+paused, container-exited=unhealthy
│   └── monitor_scheduler.py          # APScheduler, per-app jobs
├── dashboard/
│   ├── index.html
│   ├── app.js                         # routing, views, badge logic
│   ├── api.js                         # API client (uses /monitoring/summary)
│   ├── components.js                  # ApplicationCard, HealthStatusBadge
│   ├── forms.js
│   ├── utils.js
│   └── styles.css
├── migrations/
│   ├── 001_initial_schema.sql
│   ├── 002_health_check_monitoring.sql
│   └── 003_monitoring_pause.sql
├── ai_engine/                         # planned: Ollama integration
├── automation/                        # planned: n8n workflows
├── docs/
├── requirements.txt
├── PROJECT_STATE.md
├── ARCHITECTURE.md
├── SYSTEM_PROMPT.md
└── README.md
```

---

## API Endpoints (Current)

### Applications
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/applications` | Register |
| GET | `/api/v1/applications` | List |
| GET | `/api/v1/applications/{app_id}` | Get |
| PUT | `/api/v1/applications/{app_id}` | Update |
| DELETE | `/api/v1/applications/{app_id}` | Soft delete |
| POST | `/api/v1/applications/{app_id}/reactivate` | Reactivate |
| POST | `/api/v1/applications/validate` | Dry-run validate |
| GET | `/api/v1/applications/{app_id}/verify-container` | Verify container |
| GET | `/api/v1/applications/{app_id}/history` | Change history |

### Health Monitoring
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/applications/{app_id}/health/status` | Current status |
| GET | `/api/v1/applications/{app_id}/health/history` | Check history |
| POST | `/api/v1/applications/{app_id}/health/check` | Manual trigger |
| GET | `/api/v1/applications/monitoring/summary` | All-apps overview |
| POST | `/api/v1/applications/{app_id}/monitoring/pause` | Pause checks |
| POST | `/api/v1/applications/{app_id}/monitoring/resume` | Resume checks |

---

## Known Issues Fixed (Do Not Reintroduce)

1. **SQLite threading** — `check_same_thread=False` in `database.py` — FastAPI uses thread pools
2. **Route conflict** — `/applications/health/summary` clashed with `/{app_id}/...` — renamed to `/monitoring/summary`
3. **Idempotent migrations** — `execute_migration()` runs statements one by one and skips `duplicate column name` / `already exists` errors
4. **Stale health status** — frontend overrides DB "healthy" to "unhealthy" when container is not running
5. **Docker graceful degradation** — `DockerService._available` flag — API stays up when Docker daemon is down

---

## Requirements

```
fastapi>=0.115.0
uvicorn[standard]>=0.27.0
pydantic>=2.10.6
pydantic-settings>=2.7.1
docker>=7.0.0
python-dateutil>=2.8.2
apscheduler>=3.10.4
requests>=2.31.0
```
Will add: `ollama` when Feature 5 is implemented.

---

## Running

```bash
pip install -r requirements.txt
python -m backend.api.main
# Open dashboard/index.html in browser
# Swagger: http://localhost:8000/docs
```

---

## Design Decisions Made

- **Hysteresis in health status:** status only flips after consecutive_failures >= failure_threshold
- **Container exited = immediately unhealthy:** no waiting for threshold
- **Human-in-the-loop:** monitoring records and reports only — never acts autonomously
- **Scheduler:** one APScheduler job per app, respects both `status=inactive` and `monitoring_paused=True`
- **AppState.healthMap** in dashboard: fetched once per list view, passed to each card
- **Badge labels:** "Monitoring" (not "Active"), "Unmonitored" (not "Inactive")
- **AI notifications:** shown in application detail view only, not as system alerts
