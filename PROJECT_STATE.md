# SanjeevaniOps — Project State

Last updated: 2026-03-28 (Session 3)

---

## Completed Features

### Feature 1: Project Setup ✅
- Repo, migrations, FastAPI config, database layer, branch strategy

### Feature 2: Application Registration API ✅
- Full CRUD, health check config, recovery policy, optimistic locking
- Soft-delete, immutable audit history, container verification
- `scheduler.add_app()` called on registration — monitoring starts immediately

### Dashboard UI ✅
- Warm light-themed vanilla JS/HTML/CSS, zero build step
- Registration wizard, CRUD, history, container verification
- Health badges, health panel, sub-checks display, crash events panel
- AI Engine tab (Operations Center) with metrics, severity charts, batch analysis, AI chat

### Feature 3: Health Check Monitoring ✅
- APScheduler background jobs, one per app
- HTTP, TCP, Exec, Docker Native check types
- Hysteresis (failure/success thresholds)
- Pause/Resume per app
- Container exited → immediate unhealthy

### Feature 3 Extension: Enhanced HTTP Checks ✅
All 6 sub-checks run on every HTTP health check:
1. HTTP status code
2. Response time threshold (warn/critical ms)
3. Error keywords in response body
4. Container restart count
5. Additional endpoint reachability + body scan
6. JSON response validation

Sub-checks stored in DB, displayed in dashboard with ✅/❌ per check.

### Feature 4: Log Collection & Crash Events ✅
- Crash event captured on first healthy→unhealthy transition
- Docker logs pulled and stored in `crash_events` table (migration 004)
- Dashboard crash events panel shows logs + container status + exit code
- API: GET `/crash-events`, GET `/crash-events/{event_id}`

### Feature 5: AI Log Analysis (Ollama) ✅
- Local Ollama with `llama3.2:1b` model (~1.3GB, runs on basic laptops)
- **Crash analysis**: Cross-references health check sub-check results (primary) + Docker logs (supplementary) → returns crash_reason, suggested_fix, severity, category (JSON)
- **Health-check-first prompt**: AI sees triggering health check's sub-check PASS/FAIL details and recent unhealthy checks BEFORE container logs — prevents hallucination
- **Re-runnable**: "Analyze with AI" button stays visible as "Re-Analyze" after first analysis; previous crash_reason passed as context to model
- **Continue in Chat**: Button on AI insight panel stores context in sessionStorage, navigates to AI Engine, auto-sends the crash context to the AI chat for follow-up discussion
- **AI Operations Center**: Dedicated dashboard tab with metrics cards, severity distribution bars, failure category breakdown, batch analysis with progress bar
- **Scoped AI Chat**: Chat assistant that only answers DevOps/container/monitoring questions; politely refuses unrelated queries
- **AI Status endpoint**: `GET /ai/status` — checks Ollama availability and model status
- Endpoints: `POST /{event_id}/analyze`, `GET /ai/status`, `POST /ai/chat`

---

## Bugs Fixed This Project

| Bug | Fix |
|-----|-----|
| SQLite threading crash | `check_same_thread=False` |
| Route conflict /health/summary | Renamed to /monitoring/summary |
| Duplicate migration statements | Per-statement idempotent execution |
| Stale healthy status on stopped container | Frontend override |
| Docker daemon down crashes API | DockerService graceful degradation |
| datetime not JSON serializable | `json.dumps(snapshot, default=str)` |
| max_length on List field (Pydantic v2) | Use `@field_validator` instead |
| New apps not monitored after registration | `scheduler.add_app()` in application_service |
| monitoring_paused NULL blocks new apps | Explicit `monitoring_paused=0` in INSERT + require `paused_by` |
| prev_status wrong after upsert | Read status BEFORE upsert_status call |
| Error pages returning 200 undetected | Endpoint body scanning in health_checker |
| Sub-checks not persisted in health history | `monitor_service.py` now passes `sub_checks=result.sub_checks` to `insert_result()` |
| Additional endpoints not displayed in detail view | `HealthCheckDisplay` in `components.js` expanded to show all enhanced HTTP fields |
| Registration wizard losing additional_endpoints/error_keywords | `forms.js`: switched `onchange` → `oninput`, added `collectCurrentStepValues()` before step navigation |
| AI Engine tab not loading | Fixed `updateHeader` → `updatePageHeader` function name in `app.js` |
| AI analysis one-shot only | Button now stays visible as "Re-Analyze", previous analysis passed as context |
| AI hallucinating crash reasons | Restructured prompt: health check sub-checks as PRIMARY evidence before container logs |
| Continue in Chat not passing context | Switched from inline onclick to sessionStorage + auto-send approach |

---

## Migrations

| File | Status | Description |
|------|--------|-------------|
| 001_initial_schema.sql | ✅ Applied | Applications, audit history, container cache |
| 002_health_check_monitoring.sql | ✅ Applied | Health check results, app health status |
| 003_monitoring_pause.sql | ✅ Applied | monitoring_paused, paused_at, paused_by, pause_reason |
| 004_crash_events.sql | ✅ Applied | crash_events table with ai_analysis, ai_analyzed_at |

---

## In Progress / Next

### Feature 6: Recovery Actions 🔜
- Manual one-click container restart from dashboard
- Human approval required
- Log all actions with operator + timestamp

---

## Test Sites

| Site | Container | Port | Broken Route | How Detected |
|------|-----------|------|-------------|--------------|
| testsite | testsite-container | 8085 | /settings.html | 404 status |
| testsite2 (ShopEasy) | testsite2-container | 8086 | /checkout.html | Body keywords (200 but contains error text) |

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
```

External: Ollama (must be installed separately with `ollama pull llama3.2:1b`)
