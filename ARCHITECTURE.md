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
│               AI Chat, Batch Analysis                        │
└────────────────────────┬────────────────────────────────────┘
                         │ HTTP fetch API
┌────────────────────────▼────────────────────────────────────┐
│                     FastAPI Backend                          │
│                  (localhost:8000)                            │
│  /api/v1/applications    /health    /crash-events            │
│  /ai/status    /ai/chat    /{event_id}/analyze               │
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
└──────────────────┘          │   Docker SDK        │
                              │   (read-only)       │
┌─────────────────────────────┤                     │
│  AI Engine                  │  container status   │
│  Ollama + LLaMA 3.2 1B     │  container logs     │
│  - Crash log analysis       │  restart count      │
│  - Root cause + fix         └────────────────────┘
│  - Scoped DevOps chat       
│  - Batch analysis           
│  - Continue in Chat         
│  Local only, no API keys    
└─────────────────────────────┘
```

---

## Layer Breakdown

### Dashboard
- Pure vanilla JS — no React, no build step, open as file
- Hash routing: `#dashboard`, `#applications`, `#register`, `#ai-engine`, `#settings`
- `api.js` — all HTTP calls, includes crash events, AI chat, AI status methods
- `app.js` — routing, views, AppState, AI Operations Center view, batch analysis, AI chat handler, Continue-in-Chat auto-send
- `components.js` — ApplicationCard, HealthHistoryTable, CrashEventsPanel (with re-runnable AI analysis + Continue in Chat), SubCheckResults, HealthCheckDisplay
- `forms.js` — 4-step registration wizard with enhanced HTTP config, `collectCurrentStepValues()` before step navigation

### FastAPI Backend
- `main.py` — startup: runs migrations 001-004, starts scheduler, syncs jobs
- `applications.py` — CRUD
- `health.py` — health checks, pause/resume, crash events, AI analysis endpoint (with health check context), AI chat endpoint, AI status endpoint
- `models/requests.py` — HttpHealthCheckConfig with 6 detection fields
- `models/health_responses.py` — SubCheckResultResponse, CrashEventResponse

### SQLite Database
- Single local file: `sanjeevaniops.db`
- All schema via numbered migration files
- Idempotent migrations — each statement runs individually
- `check_same_thread=False` for FastAPI thread pool

### AI Engine

#### Architecture
- `ai_engine/ai_service.py` — Ollama HTTP client
- Model: `llama3.2:1b` (~1.3GB, runs on 4GB RAM laptops)

#### Crash Log Analysis
- **Health-check-first prompt**: Health check sub-check results (PASS/FAIL with messages) are injected as PRIMARY evidence; container logs are supplementary
- Structured JSON output: crash_reason, suggested_fix, severity, category
- **Re-runnable**: Previous analysis context passed on re-analyze
- **Cross-references**: Triggering health check result + last 5 unhealthy results fed to AI

#### Prompt Structure
```
Health Check Findings (PRIMARY) → placed first
  - Triggering check: sub-check [FAIL/PASS] details
  - Recent unhealthy checks: error messages
Container Logs (supplementary) → placed second
Rules → prioritize health check findings over logs
JSON output format → last
```

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
            │       sub_checks=result.sub_checks passed at both call sites
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

### Crash Event Capture

- Triggered only on first `healthy → unhealthy` transition
- `prev_status` read before `upsert_status` — critical ordering
- Pulls last 100 lines of Docker logs with timestamps
- Stores: logs, container_status, exit_code, captured_at
- AI analysis stored in `ai_analysis` JSON field, re-runnable with health check context
- `crash_event_exists_for_result()` prevents duplicates

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
- `container_name`, `container_logs`, `container_status`, `exit_code`
- `captured_at`, `ai_analysis` (JSON), `ai_analyzed_at`

---

## AI Responsibilities vs Restrictions

| AI CAN | AI CANNOT |
|--------|-----------|
| Analyze crash logs + health checks | Execute any command |
| Explain crash cause from evidence | Modify code autonomously |
| Suggest fix steps | Restart containers automatically |
| Rate severity | Access external APIs |
| Chat about DevOps topics | Answer non-DevOps questions |
| Batch-analyze events | Make decisions without human |
| Cross-reference health sub-checks | Hallucinate errors not in evidence |

---

## Security Model

- All Docker operations read-only (inspect, logs, stats)
- No network calls outside localhost (Ollama is local)
- SQLite file is local
- No authentication (single-user local tool)
- AI chat is topic-scoped — refuses non-DevOps queries
- monitoring_paused only respected when paused_by is also set
