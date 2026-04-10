# SanjeevaniOps — Project State

Last updated: 2026-04-10 (Session 7)

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
- **Live log refresh** — every time crash events are loaded, fresh logs are fetched from Docker and the DB record is updated. No stale logs.
- API: GET `/crash-events`, GET `/crash-events/{event_id}`

### Feature 5: AI Log Analysis (Ollama) ✅
- Local Ollama with `phi3:mini` model (~2.3GB, fits in 4GB VRAM)
- Model is configurable via `settings.ollama_model` in `backend/core/config.py`
- **Crash analysis**: Cross-references health check sub-check results (primary) + live Docker logs (supplementary) → returns crash_reason, severity, category, playbook_steps, files_to_check, commands, quick_check (JSON)
- **Health-check-first prompt**: AI sees triggering health check's sub-check PASS/FAIL details and fresh container logs — prevents hallucination
- **Re-runnable**: "Analyze with AI" button stays visible as "Re-Analyze" after first analysis; previous crash_reason passed as context to model
- **Continue in Chat**: Button on AI insight panel stores context in sessionStorage, navigates to AI Engine, auto-sends the crash context to the AI chat for follow-up discussion
- **AI Operations Center**: Dedicated dashboard tab with metrics cards, severity distribution bars, failure category breakdown, batch analysis with progress bar
- **Scoped AI Chat**: Chat assistant that only answers DevOps/container/monitoring questions; politely refuses unrelated queries
- **AI Status endpoint**: `GET /ai/status` — checks Ollama availability and model status
- **Dynamic model selection**: `GET /ai/models` returns all locally installed Ollama models; `POST /ai/model` switches the active model at runtime — no server restart or config edit needed. Dashboard AI Engine tab shows a dropdown with all installed models.
- Endpoints: `POST /{event_id}/analyze`, `GET /ai/status`, `GET /ai/models`, `POST /ai/model`, `POST /ai/chat`

### Feature 6: Recovery Actions ✅
- **Deterministic Recovery Playbook**: Built from sub-check failure patterns with zero AI involvement — identifies root cause pattern (404, 5xx, body keywords, crash-loop, slow response, bad JSON, broken redirect) and maps to numbered fix steps + files to inspect
- **Broken Redirect Detection**: Live HTTP probe on analysis — detects 302→404 chains, points playbook to `nginx.conf` not missing file
- **AI Structured Fix Steps**: When Ollama is available, AI adds structured `fix_steps`, `commands`, and `quick_check` fields on top of the deterministic playbook
- **AI Offline Indicator**: Yellow banner in both Recovery Playbook panel and AI Engine page when Ollama is not running — includes `ollama serve` command
- **Recovery Playbook UI**: Full panel on crash event with numbered steps ①②③, clickable file badges (copy-to-clipboard), monospace command blocks (click-to-copy), quick verify command
- **Continue in Chat (enriched)**: Passes full playbook steps + files to inspect + severity into AI chat context — AI reasons from evidence not from guessing
- **Container Restart (manual)**: Amber-colored "Restart Container" button with confirmation modal labelled as "temporary relief only"
- **Auto-Recovery Engine**: If `recovery_policy.enabled` is true, monitoring engine auto-restarts the container after failure — respects `max_restart_attempts`, `restart_delay_seconds`, and `backoff_multiplier`; resets attempt counter when app recovers
- **Audit Trail**: Every restart (manual or auto) logged to `recovery_actions` table with `requested_by` operator or `auto-recovery`
- **Recovery History Panel**: Audit table visible in app detail page below crash events
- Migration: `005_recovery_actions.sql`
- Endpoints: `POST /{event_id}/restart`, `GET /{app_id}/recovery-actions`

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
| Crash event logs always showing stale data | `list_crash_events` and `get_crash_event` now fetch live Docker logs on every call and update the DB record |
| AI never received container logs | `get_fix_suggestion` now accepts `container_logs` param; fresh logs passed on every analyze call |
| Debug print spam in monitoring | Replaced all `print([DEBUG]/[STEP-N]/[SKIP])` with proper `logger` calls |
| Recovery playbook wrong for broken redirects | Live-probe in `analyze_crash_event` detects 302→4xx chain; routes to nginx.conf not missing file |
| `requests.Response` 404 falsy breaks probe | Changed `if _probe and` → `if _probe is not None and` |
| Dashboard flickering on every navigation | `showLoading` now only fires the dark overlay on first page load; route transitions are direct |
| Continue in Chat missing playbook context | Chat context now includes playbook steps, files, severity — AI reasons from full evidence |
| AI Engine page silent when Ollama offline | Yellow offline banner added with `ollama serve` instructions |
| Recovery policy never executed | `_maybe_auto_restart()` added to `monitor_service` — fires after unhealthy transition, respects backoff + max attempts |
| AI Engine status badge stuck on "Online" after Ollama stops | AI Engine page now polls `/ai/status` every 20 s; updates badge and offline banner in-place without page reload |
| "Analyze with AI" button misleading when AI offline | Button label changes to "Analyze (No AI)" / "Re-Analyze (No AI)" when Ollama unavailable; tooltip explains deterministic-only mode |
| Engine shows Offline when user has a different Ollama model | `is_available()` now auto-selects first locally installed model when configured model not found — any Ollama model works immediately |
| Offline banner hardcoded `ollama pull phi3:mini` | Banner now shows generic examples (`phi3:mini`, `llama3.2:1b`) — not tied to configured default |
| App detail view unaware of AI status | `renderApplicationDetailView` now fetches AI status and passes `aiAvailable` flag to `CrashEventsPanel` |

---

## Migrations

| File | Status | Description |
|------|--------|-------------|
| 001_initial_schema.sql | ✅ Applied | Applications, audit history, container cache |
| 002_health_check_monitoring.sql | ✅ Applied | Health check results, app health status |
| 003_monitoring_pause.sql | ✅ Applied | monitoring_paused, paused_at, paused_by, pause_reason |
| 004_crash_events.sql | ✅ Applied | crash_events table with ai_analysis, ai_analyzed_at |
| 005_recovery_actions.sql | ✅ Applied | recovery_actions audit log table |

---

## In Progress / Next

All planned features are complete. The project is in verification/testing phase.

---

## Test Sites

| Site | Container | Port | Broken Route | How Detected |
|------|-----------|------|-------------|--------------|
| testsite | testsite-container | 8085 | /settings.html | 404 status |
| testsite2 (ShopEasy) | testsite2-container | 8086 | /checkout.html | Body keywords (200 but contains error text) |
| testsite3 (DevShop) | testsite3-container | 8087 | /checkout | Broken redirect — 302→/chekout.html (typo)→404 |

---

## AI Model

| Setting | Value |
|---------|-------|
| Default model | `phi3:mini` (override via `OLLAMA_MODEL` env var) |
| Runtime selection | Dashboard AI Engine tab — dropdown shows all installed models, switch with one click |
| List installed | `ollama list` or `GET /api/v1/applications/ai/models` |
| Small options | `llama3.2:1b` (1.3 GB), `gemma2:2b` (1.6 GB), `phi3:mini` (2.3 GB) |
| Config | `backend/core/config.py` → `ollama_model` (startup default only) |

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

External: Ollama (must be installed separately — pull any model with `ollama pull <model>`)
