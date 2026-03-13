# SanjeevaniOps — Architecture

---

## Architecture Style

- **Modular** — each concern is isolated (API, monitoring, AI, automation)
- **Local-first** — no cloud, no external services, runs entirely on developer's machine
- **Human-in-the-loop** — no autonomous actions, all recovery requires approval
- **Event-driven** — health check failures trigger log collection → AI analysis → notification

---

## High-Level Component Map

```
┌─────────────────────────────────────────────────────────────┐
│                        Dashboard                             │
│              (Vanilla HTML/CSS/JS, no build step)            │
│   Views: Dashboard | Applications | Detail | Register        │
└────────────────────────┬────────────────────────────────────┘
                         │ HTTP (fetch API)
┌────────────────────────▼────────────────────────────────────┐
│                     FastAPI Backend                          │
│                  (localhost:8000)                            │
│  /api/v1/applications  │  /api/v1/applications/{id}/health  │
└──────┬────────────────────────────────┬─────────────────────┘
       │                                │
┌──────▼──────────┐           ┌─────────▼──────────┐
│  SQLite Database │           │  Monitoring Engine  │
│  (local file)    │           │  (APScheduler)      │
│                  │           │                     │
│  Tables:         │◄──────────│  health_checker.py  │
│  - applications  │           │  monitor_service.py │
│  - app_history   │           │  monitor_scheduler  │
│  - health_results│           └─────────┬──────────┘
│  - app_health_   │                     │
│    status        │           ┌─────────▼──────────┐
│  - crash_events  │           │   Docker SDK        │
│    (planned)     │           │   (read-only)       │
└──────────────────┘           │                     │
                               │  - container status │
┌─────────────────────────────┐│  - container logs   │
│  AI Engine (planned)        ││  - restart count    │
│  Ollama + LLaMA 3.1         │└────────────────────┘
│  - Log analysis             │
│  - Root cause explanation   │
│  - Fix suggestions          │
│  Local only, no API keys    │
└─────────────────────────────┘
```

---

## Layer Breakdown

### 1. Dashboard (Frontend)
- Pure vanilla JS — no React, no build step, opens as a file
- Hash-based routing (`#/`, `#/applications`, `#/applications/:id`)
- `api.js` — all HTTP calls to backend
- `app.js` — routing, view rendering, state management (AppState)
- `components.js` — reusable UI: ApplicationCard, HealthStatusBadge
- `forms.js` — 4-step registration wizard
- `styles.css` — CSS variables, dark theme, design system

### 2. FastAPI Backend
- `main.py` — startup: runs migrations, starts scheduler, mounts routers
- `applications.py` — CRUD endpoints
- `health.py` — health check + pause/resume endpoints
- `dependencies.py` — DB connection injection
- `models/` — Pydantic request/response models

### 3. SQLite Database
- Single local file: `sanjeevaniops.db`
- All schema managed via numbered migration files
- `database.py` runs migrations idempotently on startup
- `check_same_thread=False` — required for FastAPI thread pool

### 4. Monitoring Engine
- `monitor_scheduler.py` — APScheduler, one job per registered app
  - Respects `status=inactive` and `monitoring_paused=True`
  - Per-app configurable interval (default 30s)
- `monitor_service.py` — orchestrates a single check cycle:
  1. Check if container is running → if not, immediately unhealthy
  2. Execute health check via `health_checker.py`
  3. Apply hysteresis (failure/success thresholds)
  4. Persist result + update current status
- `health_checker.py` — pure check execution, no side effects:
  - HTTP: status code, response time, keyword in body
  - TCP: port connectivity
  - Exec: command inside container, check exit code
  - Docker Native: reads Docker's HEALTHCHECK status
  - Container restart count: detects crash-looping

### 5. Docker Service
- Read-only Docker SDK usage only
- `docker_service.py` — graceful degradation:
  - If Docker daemon is unavailable, sets `_available = False`
  - All methods return None/False gracefully
  - API stays up and functional

### 6. AI Engine (Planned — Feature 5)
- Local Ollama server running LLaMA 3.1
- Triggered when crash event is recorded
- Input: container logs + HTTP response + resource stats
- Output: crash reason + suggested fix (plain English)
- Stored in DB, displayed in dashboard detail view
- Zero external API calls

---

## Health Check Flow

```
APScheduler fires (every N seconds per app)
        │
        ▼
Is app active AND not paused?
        │ No → skip
        │ Yes
        ▼
Is container running?
        │ No → record "unhealthy: container exited", update status, return
        │ Yes
        ▼
Execute health check (HTTP/TCP/Exec/DockerNative)
        │
        ▼
Record result in health_check_results
        │
        ▼
Apply hysteresis:
  - If unhealthy: consecutive_failures++
    If consecutive_failures >= failure_threshold → set status = unhealthy
  - If healthy: consecutive_successes++
    If consecutive_successes >= success_threshold → set status = healthy
        │
        ▼
Update app_health_status
        │
        ▼ (Feature 4 — planned)
If status just flipped to unhealthy:
  Pull Docker logs → store as crash_event
        │
        ▼ (Feature 5 — planned)
Send logs to Ollama → store AI analysis
```

---

## Data Model (Key Tables)

### applications
- `app_id` (UUID), `name`, `container_name`, `status` (active/inactive)
- `health_check_config` (JSON), `recovery_policy` (JSON)
- `monitoring_paused`, `paused_at`, `paused_by`, `pause_reason`
- `version` (optimistic locking), `deleted_at` (soft delete)

### health_check_results
- `result_id`, `app_id`, `status`, `check_type`
- `response_time_ms`, `error_message`, `check_config` (JSON)
- `checked_at`

### app_health_status
- `app_id`, `current_status`, `consecutive_failures`, `consecutive_successes`
- `last_result_id`, `first_failure_at`, `last_checked_at`

### crash_events (planned — migration 004)
- `event_id`, `app_id`, `triggered_by_result_id`
- `container_logs` (text), `captured_at`
- `ai_analysis` (JSON: reason + fix suggestion)
- `ai_analyzed_at`

---

## AI Responsibilities vs Restrictions

| AI CAN | AI CANNOT |
|--------|-----------|
| Analyze logs | Execute any command |
| Explain crash cause | Modify code autonomously |
| Suggest fix steps | Restart containers automatically |
| Rate severity | Access external APIs |
| Summarize patterns | Make decisions without human |

---

## Security Model

- All Docker operations are **read-only** (inspect, logs, stats)
- No Docker exec unless explicitly configured by user
- No network calls outside localhost
- No file system access outside project directory
- SQLite file is local — no network database
- No authentication required (single-user local tool)
