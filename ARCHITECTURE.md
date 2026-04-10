# SanjeevaniOps — Architecture

---

## High-Level Component Map

```
┌─────────────────────────────────────────────────────────────┐
│                        Dashboard                             │
│              (Vanilla HTML/CSS/JS, no build step)            │
│   Views: Dashboard | Applications | App Detail | Register    │
│          | AI Engine (Operations Center) | Settings          │
│   Components: HealthHistoryTable, CrashEventsPanel,          │
│               SubCheckResults, HealthStatusBadge,            │
│               RecoveryPlaybook, RecoveryHistoryPanel,        │
│               AI Chat, Batch Analysis                        │
└────────────────────────┬────────────────────────────────────┘
                         │ HTTP fetch API
┌────────────────────────▼────────────────────────────────────┐
│                     FastAPI Backend                          │
│                  (localhost:8000)                            │
│  /api/v1/applications    /health    /crash-events            │
│  /ai/status    /ai/models    /ai/model    /ai/chat            │
│  /{event_id}/analyze    /{event_id}/restart                  │
│  /{app_id}/recovery-actions                                  │
└──────┬───────────────────────────────┬───────────────────────┘
       │                               │
┌──────▼──────────┐          ┌─────────▼──────────┐
│  SQLite Database │          │  Monitoring Engine  │
│                  │          │  (APScheduler)      │
│  Tables:         │◄─────────│                     │
│  applications    │          │  monitor_scheduler  │
│  app_history     │          │  monitor_service    │
│  health_results  │          │  health_checker     │
│  app_health_     │          └─────────┬──────────┘
│    status        │                    │
│  crash_events    │          ┌─────────▼──────────┐
│  recovery_actions│          │   Docker SDK        │
└──────────────────┘          │                     │
                              │  container status   │
┌─────────────────────────────┤  container logs     │
│  AI Engine                  │  restart count      │
│  Ollama — any local model   └────────────────────┘
│  - Deterministic playbook
│  - Structured fix steps
│  - Root cause + severity
│  - Scoped DevOps chat
│  - Batch analysis
│  - Continue in Chat
│  - Runtime model switching
│  Local only, no API keys
└─────────────────────────────┘
```

---

## Layer Breakdown

### Dashboard

- Pure vanilla JS — no React, no build step, open as file
- Hash routing: `#dashboard`, `#applications`, `#register`, `#ai-engine`, `#settings`
- `api.js` — all HTTP calls, includes crash events, AI chat, AI status, restart, recovery-actions
- `app.js` — routing, views, AppState, AI Operations Center view, batch analysis, AI chat handler, Continue-in-Chat auto-send, recovery history rendering
- `components.js` — ApplicationCard, HealthHistoryTable, CrashEventsPanel (re-runnable analysis + Recovery Playbook panel + restart button + Continue in Chat), RecoveryHistoryPanel, SubCheckResults, HealthCheckDisplay
- `forms.js` — 4-step registration wizard with enhanced HTTP config, `collectCurrentStepValues()` before step navigation

### FastAPI Backend

- `main.py` — startup: runs migrations 001-005, starts scheduler, syncs jobs
- `applications.py` — CRUD
- `health.py` — health checks, pause/resume, crash events (with live log refresh), AI analysis endpoint, restart endpoint, recovery actions history, AI chat, AI status
- `models/requests.py` — HttpHealthCheckConfig with 6 detection fields
- `models/health_responses.py` — SubCheckResultResponse, CrashEventResponse

### SQLite Database

- Single local file: `sanjeevaniops.db`
- All schema via numbered migration files
- Idempotent migrations — each statement runs individually
- `check_same_thread=False` for FastAPI thread pool

### AI Engine

#### Architecture
- `ai_engine/ai_service.py` — Ollama HTTP client; `model` field is mutable at runtime
- Default model: set via `OLLAMA_MODEL` env var or `settings.ollama_model` in `backend/core/config.py`
- **Runtime model switching**: `GET /ai/models` returns all locally installed models; `POST /ai/model` changes the active model in-process — no restart needed
- Dashboard AI Engine tab queries `/ai/models` on load and renders a dropdown selector; changing it calls `/ai/model`

#### Crash Analysis — What Is Deterministic vs AI

| Part | How it's built |
|------|---------------|
| `crash_reason` | Deterministic — from sub-check failure messages |
| `severity` | Deterministic — from failure patterns (5xx=high, crash-loop=critical, etc.) |
| `category` | Deterministic — from failure type |
| `playbook_steps` | Deterministic — mapped from sub-check failure patterns |
| `files_to_check` | Deterministic — mapped from failure type |
| `diagnostic_commands` | Deterministic — always docker logs + inspect + stats |
| `fix_steps` | AI — structured JSON from phi3:mini |
| `commands` | AI (or falls back to diagnostic_commands) |
| `quick_check` | AI |

#### Prompt Structure
```
Health Check Sub-Checks (PRIMARY)
  - [PASS/FAIL] sub-check name: message
  - [PASS/FAIL] ...

Recent container logs (SUPPLEMENTARY — last 100 lines, live-fetched)

Rules → prioritize sub-check evidence
JSON output format → last
```

#### Live Log Refresh
- Every call to `list_crash_events` or `get_crash_event` fetches fresh logs from Docker
- Batched by container name — one Docker call per unique container, not per event
- DB record is updated with fresh logs so subsequent loads are fast
- On analyze: fresh logs also passed to AI as supplementary context

#### Scoped Chat
- System prompt restricts responses to DevOps/container topics only
- Non-related questions get polite refusal
- **Continue in Chat**: Crash analysis context passed via sessionStorage to AI Engine chat, auto-sent as first message

#### Batch Analysis
- AI Operations Center can analyze all pending crash events in sequence with progress bar

### Monitoring Engine

```
Registration
    │
    └─► scheduler.add_app(app_id, interval)   ← called immediately on registration
            │
            ▼
    APScheduler job fires every N seconds
            │
            ▼
    monitor_service.run_check_for_app(app_id)
            │
            ├─► Is app active AND not paused (with paused_by set)?
            │       No → skip
            │
            ├─► Read prev_status from DB  ← BEFORE any writes
            │
            ├─► Is container running?
            │       No → immediately unhealthy, capture crash event if transition
            │
            ├─► health_checker.run_check(type, config, container)
            │       HTTP: status + response time + keywords + restart count
            │             + additional endpoints (each scans body too)
            │             + JSON validation
            │       TCP: port connectivity
            │       Exec: command exit code
            │       Docker Native: HEALTHCHECK status
            │
            ├─► insert_result (with sub_checks serialized into check_config)
            │
            ├─► Apply hysteresis (failure/success thresholds)
            │
            ├─► upsert_status
            │
            └─► If status just flipped healthy→unhealthy:
                    _capture_crash_event()
                        │
                        ├─► Pull last 100 lines of Docker logs
                        ├─► Get container status + exit code
                        └─► insert_crash_event()
                    _maybe_auto_restart()
                        │
                        ├─► Check recovery_policy_config.enabled
                        ├─► Count prior auto-restarts since first_failure_at
                        ├─► If under max_attempts: threading.Timer(delay, _do_restart)
                        └─► Log to recovery_actions as 'auto-recovery'
```

### Health Checker — 6 Sub-Checks (HTTP)

| Check | What It Catches |
|-------|----------------|
| HTTP Status Code | Site completely down (4xx/5xx) |
| Response Time | Slow server (>3s warn, >5s critical configurable) |
| Body Keywords | Error pages showing as 200 (searches for "error", "exception" etc) |
| Restart Count | Crash-looping container (count increased since last check) |
| Additional Endpoints | Specific routes broken — each also scans body for errors |
| JSON Validation | Backend API returning non-JSON when JSON expected |

### Crash Event Lifecycle

```
healthy → unhealthy transition
    │
    └─► _capture_crash_event()
            ├─► Pull Docker logs (100 lines)
            ├─► Store container_status, exit_code, captured_at
            └─► insert_crash_event() [once per transition — dedup by result_id]

User views crash events panel
    └─► list_crash_events()
            └─► _enrich_events_with_fresh_logs()
                    ├─► Fetch live Docker logs per unique container
                    ├─► Update crash_events.container_logs in DB
                    └─► Return events with current logs

User clicks Analyze / Re-Analyze
    └─► analyze_crash_event()
            ├─► Build crash_reason, severity, category, playbook (deterministic)
            ├─► _fetch_fresh_logs() → fresh Docker logs
            ├─► Call AI with sub-checks + logs
            └─► update_crash_event_analysis() → stores analysis + refreshes logs

User clicks Restart Container
    └─► POST /{event_id}/restart
            ├─► docker_service.restart_container(container_name)
            ├─► recovery_repo.create_action() → audit log
            └─► Return {success, message, warning: "temporary fix only"}
```

### Recovery Actions

- **Manual restart**: Human clicks "Restart Container" → POST /{event_id}/restart → amber UI + confirmation modal
- **Auto-recovery**: If `recovery_policy_config.enabled = true`, `_maybe_auto_restart()` fires after every unhealthy transition via `threading.Timer`
  - Delay = `restart_delay_seconds × backoff_multiplier^attempt` (e.g. 30s → 45s → 67s)
  - Attempt counter scoped to current failure episode via `first_failure_at` timestamp — resets on recovery
  - Logged as `requested_by = 'auto-recovery'` in recovery_actions table
- Both paths write to `recovery_actions`: action_id, app_id, event_id, container_name, action_type, requested_by, requested_at, status, result_message, executed_at
- `RecoveryHistoryPanel` in dashboard renders the full audit table per app

---

## Data Model (Key Tables)

### applications
- `app_id`, `name`, `container_name`, `status`
- `health_check_config` (JSON), `recovery_policy_config` (JSON), `metadata` (JSON)
- `monitoring_paused` (DEFAULT 0), `paused_by`, `pause_reason`
- `version` (optimistic locking), `deleted_at` (soft delete)

### health_check_results
- `result_id`, `app_id`, `status`, `check_type`
- `check_config` (JSON — includes `sub_checks` array when HTTP)
- `response_time_ms`, `error_message`, `checked_at`

### app_health_status
- `app_id`, `current_status`, `consecutive_failures`, `consecutive_successes`
- `last_result_id`, `first_failure_at`, `last_checked_at`

### crash_events
- `event_id`, `app_id`, `triggered_by_result_id`
- `container_name`, `container_logs` (refreshed on every view), `container_status`, `exit_code`
- `captured_at`, `ai_analysis` (JSON), `ai_analyzed_at`

### recovery_actions
- `action_id`, `app_id`, `event_id` (linked crash event)
- `container_name`, `action_type` (default: restart)
- `requested_by`, `requested_at`, `status` (executed|failed)
- `result_message`, `executed_at`

---

## AI Responsibilities vs Restrictions

| AI CAN | AI CANNOT |
|--------|-----------|
| Generate structured fix steps | Execute any command |
| Explain crash cause from evidence | Modify code autonomously |
| Suggest files to inspect | Restart containers automatically |
| Provide diagnostic commands | Access external APIs |
| Chat about DevOps topics | Answer non-DevOps questions |
| Batch-analyze events | Make decisions without human |
| Cross-reference health sub-checks | Determine crash_reason/severity/playbook (deterministic only) |

---

## Security Model

- All Docker operations are read-only in monitoring (inspect, logs, stats)
- Container restart is write — only executed on explicit human POST request
- No network calls outside localhost (Ollama is local)
- SQLite file is local
- No authentication (single-user local tool)
- AI chat is topic-scoped — refuses non-DevOps queries
- `monitoring_paused` only respected when `paused_by` is also set
