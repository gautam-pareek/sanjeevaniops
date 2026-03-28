# SanjeevaniOps — AI Agent System Prompt

Read this entire file before writing any code or making any suggestions.

---

## What Is This Project

SanjeevaniOps is a **final semester college project** — a local-first Docker application reliability
and recovery platform. Named after the Sanjeevani herb from Hindu mythology that revives the dead.

**Problem:** Applications crash. Developers don't know what crashed, why, or how to fix it fast.
SanjeevaniOps monitors local Docker containers, detects crashes, captures logs, analyzes them with
a local AI, and tells you exactly what went wrong.

---

## Hard Constraints

❌ No cloud providers (AWS, GCP, Azure)
❌ No Kubernetes
❌ No paid APIs or SaaS tools
❌ No autonomous AI execution
❌ No external LLM APIs (OpenAI, Anthropic etc.)
✅ Local-first — everything runs on developer's machine
✅ Human-controlled — no action without approval
✅ Explainable — every decision logged and visible
✅ Local LLM only — Ollama (LLaMA 3.1)

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend API | FastAPI + Uvicorn |
| Database | SQLite (local, explicit SQL migrations) |
| Validation | Pydantic v2 |
| Container Integration | Docker SDK (read-only) |
| Health Scheduler | APScheduler |
| Frontend | Vanilla HTML/CSS/JS (zero build step) |
| AI Engine (planned) | Ollama — LLaMA 3.1 (local only) |

---

## Branch Strategy

- `backend-dev` — all Python/migration/API changes
- `frontend-dev` — all dashboard/JS/CSS changes
- `main` — stable, merged from both branches
- Never commit directly to main
- PowerShell: always use `--force` on branch pushes:
  `git push origin backend-dev --force`
  `git push origin frontend-dev --force`

---

## Developer Workflow

1. Claude generates files and presents them for download
2. Developer copies files manually into the project
3. Developer tests locally
4. Developer commits to correct branch and pushes with --force
5. Merge to main when stable

---

## Current Project State

### ✅ Feature 1: Project Setup
- Repo structure, migrations, config, database layer

### ✅ Feature 2: Application Registration API
- Full CRUD for Docker app registration
- Health check config storage (HTTP, TCP, Exec, Docker Native)
- Recovery policy storage
- Optimistic locking, soft-delete, immutable audit history
- Container verification via Docker SDK (read-only)
- `scheduler.add_app()` called immediately after registration — monitoring starts without restart

### ✅ Dashboard UI
- Dark-themed vanilla JS/HTML/CSS — zero build step
- Full CRUD, 4-step registration wizard, history view
- Container verification, search/filter
- Open `dashboard/index.html` in browser — no build needed

### ✅ Feature 3: Health Check Monitoring Engine
- APScheduler background jobs — one per registered app
- All 4 check types: HTTP, TCP, Exec, Docker Native
- Hysteresis: status only changes after failure_threshold/success_threshold met
- Pause/Resume monitoring per app
- Container exited → immediately unhealthy (bypasses threshold)
- Dashboard: health badges, health panel, history table, Run Check Now

### ✅ Feature 3 Extension: Enhanced HTTP Health Checks
Six detection methods on every HTTP check:
1. HTTP status code
2. Response time (warn_response_time_ms / critical_response_time_ms)
3. Error keywords in response body (catches error pages returning 200)
4. Container restart count detection (crash-looping)
5. Additional endpoint reachability — each endpoint ALSO scans body for errors
6. API JSON validation (expect_json flag)

Sub-checks stored in check_config JSON, returned in health history API.
Dashboard health history table shows per-sub-check ✅/❌ breakdown.

### ✅ Feature 4: Log Collection & Crash Events
- On status transition to unhealthy: Docker logs captured automatically
- Stored in `crash_events` table (migration 004)
- Linked to triggering health check result
- Dashboard: Crash Events panel in app detail view with full log output
- Only fires on FIRST transition (healthy→unhealthy), not on repeated failures
- `prev_status` read BEFORE upsert to correctly detect transition

### 🔜 Feature 5: AI Log Analysis (Ollama)
- Send crash event logs to local Ollama (LLaMA 3.1)
- Get back: crash reason + suggested fix
- Store in `ai_analysis` field on crash_events table
- Display as "AI Insight" panel in app detail view
- Add `ollama` to requirements.txt

### 🔜 Feature 6: Recovery Actions
- Manual one-click recovery from dashboard
- Human approval required — never automatic
- Log all actions with operator identity

---

## Known Bugs Fixed (Do Not Reintroduce)

1. **SQLite threading** — `check_same_thread=False` in database.py
2. **Route conflict** — summary endpoint is `/monitoring/summary` not `/health/summary`
3. **Idempotent migrations** — each SQL statement runs individually, duplicate errors skipped
4. **Stale health status** — frontend overrides DB "healthy" when container not running
5. **Docker graceful degradation** — API stays up when Docker daemon is down
6. **Container exited = immediate unhealthy** — no threshold wait
7. **Monitoring badge** — only shown when container running AND not paused
8. **datetime serialization** — `json.dumps(snapshot, default=str)` in application_repository.py
9. **max_length on List field** — use `@field_validator` not `Field(max_length=)` for lists
10. **monitoring_paused NULL** — INSERT explicitly sets `monitoring_paused=0`; paused check requires `paused_by` to be set
11. **prev_status read order** — read BEFORE upsert_status in monitor_service.py
12. **Scheduler not picking up new apps** — application_service.py calls `scheduler.add_app()` after registration
13. **Additional endpoints body scan** — endpoint checks scan response body for errors even when status 200
14. **Sub-checks not persisted** — `monitor_service.py` must pass `sub_checks=result.sub_checks` to `insert_result()` at both call sites
15. **Dashboard missing enhanced HTTP fields** — `HealthCheckDisplay.renderTypeSpecific()` must render additional_endpoints, error_keywords, response thresholds, expect_json
16. **Registration wizard losing form values** — `forms.js` additional_endpoints textarea and error_keywords input use `oninput` (not `onchange`); `collectCurrentStepValues()` called before `nextStep()` and `submit()`

---

## File Structure

```
sanjeevaniops/
├── backend/
│   ├── api/
│   │   ├── main.py                    # FastAPI app, runs migrations 001-004, starts scheduler
│   │   ├── dependencies.py
│   │   └── v1/
│   │       ├── applications.py        # CRUD endpoints
│   │       ├── health.py              # Health + pause/resume + crash events endpoints
│   │       └── models/
│   │           ├── requests.py        # HttpHealthCheckConfig with 6 detection fields
│   │           ├── responses.py
│   │           ├── health_responses.py  # SubCheckResultResponse, CrashEventResponse
│   │           └── enums.py
│   ├── core/
│   │   ├── config.py
│   │   └── database.py
│   ├── services/
│   │   ├── application_service.py     # calls scheduler.add_app() after registration
│   │   ├── docker_service.py
│   │   └── validation_service.py
│   ├── repositories/
│   │   ├── application_repository.py  # monitoring_paused=0 on INSERT, json.dumps default=str
│   │   ├── container_cache_repository.py
│   │   └── health_repository.py       # insert_result accepts sub_checks, crash event methods
│   └── exceptions/
│       └── custom_exceptions.py
├── monitoring/
│   ├── health_checker.py              # 6 HTTP checks, endpoint body scanning
│   ├── monitor_service.py             # prev_status before upsert, crash event capture
│   └── monitor_scheduler.py          # APScheduler, per-app jobs
├── dashboard/
│   ├── index.html
│   ├── app.js                         # fetches crash events, CrashEventsPanel
│   ├── api.js                         # getCrashEvents, getCrashEvent methods
│   ├── components.js                  # SubCheckResults rendering, CrashEventsPanel
│   ├── forms.js                       # 4-step registration wizard, collectCurrentStepValues()
│   ├── utils.js
│   └── styles.css
├── migrations/
│   ├── 001_initial_schema.sql
│   ├── 002_health_check_monitoring.sql
│   ├── 003_monitoring_pause.sql
│   └── 004_crash_events.sql
├── testsite/                          # 3-page test site (nginx), port 8085
├── testsite2/                         # ShopEasy fake ecommerce (nginx), port 8086
├── ai_engine/                         # planned: Ollama integration
├── automation/                        # planned: n8n workflows
├── requirements.txt
├── DOCKER_SETUP_GUIDE.md
├── PROJECT_STATE.md
├── ARCHITECTURE.md
├── SYSTEM_PROMPT.md
└── README.md
```

---

## API Endpoints

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
| GET | `/api/v1/applications/{app_id}/crash-events` | List crash events |
| GET | `/api/v1/applications/{app_id}/crash-events/{event_id}` | Crash event detail |

---

## Running

```bash
pip install -r requirements.txt
python -m backend.api.main
# Open dashboard/index.html in browser
# Swagger: http://localhost:8000/docs
```

---

## Test Sites

### testsite (port 8085)
```powershell
docker build -t testsite ./testsite
docker run -d --name testsite-container -p 8085:80 testsite
```
- `/` — healthy
- `/help.html` — healthy
- `/settings.html` — 404 (file deleted from container)

### testsite2 / ShopEasy (port 8086)
```powershell
docker build -t testsite2 ./testsite2
docker run -d --name testsite2-container -p 8086:80 testsite2
```
- `/` — healthy
- `/products.html` — healthy
- `/cart.html` — healthy
- `/checkout.html` — returns 200 but body contains "500 Internal Server Error" + stack trace

Register testsite2 with additional_endpoints: `/checkout.html` — keyword detection catches it without deleting any files.

---

## Design Decisions

- Hysteresis: health status only flips after threshold met
- Container exited = immediate unhealthy (no threshold)
- Human-in-the-loop: monitoring records only, never acts autonomously
- Scheduler: one APScheduler job per app, respects inactive + paused
- Badge: "Monitoring" / "Unmonitored" / "⏸ Paused"
- Crash events: only on first healthy→unhealthy transition
- Endpoint body scanning: always on, catches disguised error pages
