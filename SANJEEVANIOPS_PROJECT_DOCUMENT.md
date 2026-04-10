# SanjeevaniOps — Complete Project Document

> This document is a self-contained reference for generating presentations, reports, documentation, or demos.
> It covers the project's purpose, architecture, every feature, the technology stack, test scenarios, and design decisions.

---

## 1. Project Identity

**Name:** SanjeevaniOps

**Origin of Name:** Named after the *Sanjeevani* herb from Hindu mythology — the legendary herb that could revive the dead. SanjeevaniOps revives crashed Docker containers.

**One-line description:**
> A local-first, AI-assisted application reliability and recovery system for Docker containers — that detects failures, explains root causes, and guides operators through step-by-step recovery.

**Tagline:** *Detect. Diagnose. Recover.*

---

## 2. Problem Statement

When Docker-based applications fail in a local or staging environment, developers face three compounding problems:

1. **Discovery lag** — failures go unnoticed until a user reports them
2. **Diagnosis paralysis** — container logs are raw and hard to interpret under pressure
3. **Recovery guesswork** — operators restart containers hoping it helps, without understanding the root cause

SanjeevaniOps solves all three:
- Continuous health checks detect failures the moment they happen
- AI-assisted analysis explains what went wrong in plain language
- A deterministic recovery playbook tells the operator exactly what to fix — not just "restart and hope"

---

## 3. Core Design Philosophy

| Principle | What it means |
|-----------|---------------|
| **Detect, don't guess** | Health checks are rule-based and deterministic. No AI is involved in detecting a failure. |
| **Explain from evidence** | Root cause, severity, and recovery steps are built from real health check data — not AI imagination. |
| **Human in the loop** | No recovery action (restart) executes without a human approving it. Auto-recovery is opt-in and policy-governed. |
| **Local first** | Runs entirely on a developer's laptop. No cloud, no paid APIs, no Kubernetes. |
| **Zero dependencies for the dashboard** | The frontend is pure HTML/CSS/JavaScript — no build step, no npm, no bundler. |

---

## 4. Technology Stack

| Layer | Technology | Why |
|-------|------------|-----|
| Backend API | FastAPI + Uvicorn | Fast, async, Pydantic-native REST API |
| Database | SQLite | Local-first, zero-config, single file |
| Validation | Pydantic v2 | Schema enforcement at system boundaries |
| Container Integration | Docker SDK for Python | Read container state, logs, restart containers |
| Health Scheduler | APScheduler | Background jobs — one per monitored app |
| Frontend | Vanilla HTML/CSS/JavaScript | No build step, runs directly in browser |
| AI Engine | Ollama + configurable model | Local LLM — no API key, no cloud, no cost |

---

## 5. System Architecture

```
┌───────────────────────────────────────────────────────┐
│                   Web Dashboard                        │
│         (Vanilla JS/HTML/CSS — no build step)          │
│                                                        │
│  Pages: Dashboard · Applications · App Detail          │
│         Register · AI Engine · Settings                │
│                                                        │
│  Components: Health badges · Crash events panel        │
│  Recovery playbook · AI chat · Batch analysis          │
│  Recovery history · Sub-check results                  │
└──────────────────────┬────────────────────────────────┘
                       │ HTTP (fetch API)
┌──────────────────────▼────────────────────────────────┐
│                  FastAPI Backend                        │
│                  localhost:8000                         │
│                                                        │
│  /api/v1/applications  ·  /health/status               │
│  /crash-events  ·  /analyze  ·  /restart               │
│  /ai/status  ·  /ai/chat  ·  /recovery-actions         │
└──────┬─────────────────────────┬─────────────────────┘
       │                         │
┌──────▼──────────┐   ┌──────────▼──────────────────┐
│ SQLite Database  │   │     Monitoring Engine         │
│                  │   │     (APScheduler)             │
│ applications     │◄──│                               │
│ app_history      │   │  monitor_scheduler.py         │
│ health_results   │   │  monitor_service.py           │
│ app_health_status│   │  health_checker.py            │
│ crash_events     │   └──────────┬──────────────────┘
│ recovery_actions │              │
└──────────────────┘   ┌──────────▼──────────────────┐
                        │      Docker SDK               │
┌───────────────────┐   │  Container status · Logs      │
│  AI Engine         │   │  Restart count · Restart      │
│  (Ollama — local)  │   └──────────────────────────────┘
│                    │
│  Deterministic:    │
│  crash_reason      │
│  severity          │
│  playbook_steps    │
│  files_to_check    │
│                    │
│  AI-enhanced:      │
│  fix_steps         │
│  quick_check       │
│  chat assistant    │
└───────────────────┘
```

---

## 6. Feature Breakdown

### 6.1 Application Registration

Operators register Docker containers through a **4-step wizard**:

| Step | What is configured |
|------|--------------------|
| 1. Basic Info | App name, description, Docker container name |
| 2. Health Check | Type (HTTP/TCP/Exec/Docker Native), interval, thresholds, HTTP-specific config |
| 3. Recovery Policy | Auto-recovery on/off, max restarts, delay, backoff multiplier |
| 4. Metadata | Environment (dev/staging/prod), criticality, owner, team, tags |

On registration, the app is immediately added to the monitoring scheduler — no manual start needed.

The system supports **soft delete** (apps are deactivated, not destroyed), **optimistic locking** (version field prevents concurrent edits), and **immutable audit history** (every change is snapshotted to `app_history`).

---

### 6.2 Health Check Monitoring

The monitoring engine runs a background job for every registered app on a configurable interval (default: 30 seconds).

**Supported check types:**

| Type | What it checks |
|------|---------------|
| HTTP | Full 6-sub-check HTTP probe (see below) |
| TCP | Port connectivity |
| Exec | Command exit code inside container |
| Docker Native | Container's built-in HEALTHCHECK status |

**HTTP check — 6 sub-checks per run:**

| Sub-check | What it catches |
|-----------|----------------|
| HTTP Status Code | Site down (4xx / 5xx responses) |
| Response Time | Slow server — warn >3s, critical >5s (configurable) |
| Body Keywords | Error pages that return 200 (searches for "error", "exception", "traceback", etc.) |
| Restart Count | Crash-looping container (restart count increased since last check) |
| Additional Endpoints | Specific routes broken — each also scans the body for errors |
| JSON Validation | Backend API returning HTML instead of JSON |

Each sub-check passes or fails independently. Results are stored and displayed individually in the dashboard (✅/❌ per check with the message).

**Hysteresis (threshold logic):**
- Status only flips to `unhealthy` after N consecutive failures (`failure_threshold`, default 3)
- Status only returns to `healthy` after M consecutive successes (`success_threshold`, default 1)
- Prevents alert storms from transient blips

**Pause / Resume:**
Any monitored app can be paused (stops health checks without deleting the app) and resumed by an operator. Pause reason and operator name are recorded.

---

### 6.3 Crash Event Capture

When a health status transitions from `healthy` → `unhealthy` for the first time:

1. The last 100 lines of Docker logs are pulled from the container
2. Container status (running/exited/paused) and exit code are recorded
3. A `crash_event` record is created, linked to the triggering health check result

**Live log refresh:** Every time crash events are viewed, the system fetches fresh logs from Docker and updates the stored record. Operators always see current logs, not the logs from when the crash was first captured.

---

### 6.4 AI-Assisted Root Cause Analysis

Operators click "Analyze" on a crash event. The system:

**Deterministic layer (no AI, zero hallucination risk):**
- Reads the failing sub-checks from the triggering health check
- Maps failure patterns to structured steps:
  - HTTP 404 → checks if it's a broken redirect (live probe) → points to `nginx.conf` or missing file
  - HTTP 5xx → points to application logs and env config
  - Body keywords → points to the specific template/route file
  - Crash-loop → points to docker-compose resource limits
  - Broken redirect (302→404) → points to nginx redirect config, not the missing destination

**AI layer (Ollama, local):**
- Receives the sub-check evidence + fresh container logs as context
- Generates structured `fix_steps`, `quick_check` command, and diagnostic commands
- Temperature is kept low (0.1) to reduce creativity and improve accuracy

**Output displayed in Recovery Playbook panel:**
- Numbered steps ①②③ (deterministic)
- Files to inspect (clickable badges, click-to-copy)
- Diagnostic commands (monospace blocks, click-to-copy)
- Quick verify command
- AI offline indicator if Ollama is not running

Analysis can be re-run at any time ("Re-Analyze" button). Previous analysis is passed as context to avoid contradicting prior findings.

---

### 6.5 Recovery Actions

**Manual restart:**
- Operator clicks "Restart Container" (amber, prominent warning colour)
- Confirmation modal states: *"This is a temporary fix — the crash will recur unless you apply the playbook"*
- Restart executes via Docker SDK
- Logged to `recovery_actions` audit table

**Automatic recovery (policy-governed):**
- Configured per app during registration (Recovery Policy step)
- When `recovery_policy.enabled = true`, the monitoring engine schedules a restart automatically after an unhealthy transition
- Backoff: `delay = restart_delay_seconds × backoff_multiplier^attempt` (e.g. 30s → 45s → 67s)
- Attempt counter resets when the app recovers — a new failure episode starts fresh
- After `max_restart_attempts`, the engine stops and logs "manual intervention required"
- Auto-restarts appear in Recovery History as `requested_by: auto-recovery`

**What restarts fix vs. what they don't:**

| Auto-restart helps | Auto-restart does NOT help |
|-------------------|--------------------------|
| Container OOM killed / crashed | Broken nginx redirect (config issue) |
| Memory leak causing unresponsiveness | Static page with error keyword |
| Thread deadlock | Missing environment variable |
| Temporary dependency unavailability | Application code bug |
| File descriptor exhaustion | Corrupted database |

---

### 6.6 AI Operations Center

A dedicated dashboard tab for AI-related operations:

- **Engine status** — shows Ollama online/offline with model name
- **Offline banner** — if Ollama is not running, shows `ollama serve` and `ollama pull` commands
- **Metrics cards** — total crash events, analyses complete, pending, critical/high severity count
- **Severity distribution bars** — visual breakdown of critical/high/medium/low
- **Failure categories** — configuration, resource, application_bug, network, unknown
- **Batch analysis** — analyze all pending crash events in sequence with progress bar
- **Recent analyses timeline** — last 10 analyses with severity badges

---

### 6.7 AI Chat Assistant

A scoped conversational assistant available in the AI Engine tab.

- Answers only DevOps/container/monitoring questions
- Politely refuses unrelated queries ("I'm the SanjeevaniOps AI Assistant...")
- **Continue in Chat**: Crash event analysis can be sent to chat with one click — the full playbook (steps, files, severity) is pre-loaded as context so the AI reasons from evidence

---

## 7. Dashboard Structure

```
Hash-based routing (no server required):
  #dashboard        — stats overview, recent apps
  #applications     — full app list with filters and search
  #app/{id}         — app detail: health panel, history, crash events, recovery history
  #register         — 4-step registration wizard
  #ai-engine        — AI Operations Center + chat
  #settings         — operator name
```

**Frontend files:**
| File | Responsibility |
|------|---------------|
| `app.js` | Routing, views, AppState, AI Operations Center, chat handler |
| `components.js` | HealthStatusBadge, HealthHistoryTable, CrashEventsPanel, RecoveryHistoryPanel, ApplicationCard |
| `forms.js` | 4-step registration wizard |
| `api.js` | All HTTP calls to the backend |
| `styles.css` | Warm light theme, design tokens, component styles |

---

## 8. Data Model

### applications
| Column | Type | Notes |
|--------|------|-------|
| app_id | TEXT PK | UUID |
| name | TEXT | Display name |
| container_name | TEXT | Docker container name |
| status | TEXT | active / inactive |
| health_check_config | JSON | Type, interval, thresholds, HTTP config |
| recovery_policy_config | JSON | enabled, max_attempts, delay, backoff |
| metadata | JSON | environment, criticality, owner, team, tags |
| monitoring_paused | INTEGER | 0/1 |
| paused_by | TEXT | Operator name |
| version | INTEGER | Optimistic locking |
| deleted_at | TEXT | Soft delete timestamp |

### health_check_results
| Column | Notes |
|--------|-------|
| result_id | UUID |
| app_id | FK to applications |
| status | healthy / unhealthy / timeout / error |
| check_type | http / tcp / exec / docker_native |
| check_config | JSON — includes `sub_checks` array for HTTP |
| response_time_ms | Integer ms |
| error_message | Concatenated failed sub-check messages |

### app_health_status
| Column | Notes |
|--------|-------|
| app_id | FK (one row per app) |
| current_status | healthy / unhealthy / unknown |
| consecutive_failures | Counter |
| consecutive_successes | Counter |
| first_failure_at | ISO timestamp — used for auto-recovery scoping |
| last_checked_at | ISO timestamp |

### crash_events
| Column | Notes |
|--------|-------|
| event_id | UUID |
| app_id | FK |
| triggered_by_result_id | The health check result that caused the flip |
| container_logs | Last 100 lines — refreshed on every view |
| container_status | Docker container state at capture time |
| exit_code | Process exit code |
| ai_analysis | JSON — full analysis object |
| ai_analyzed_at | ISO timestamp |

### recovery_actions
| Column | Notes |
|--------|-------|
| action_id | UUID |
| app_id | FK |
| event_id | FK to crash event |
| container_name | Docker container name |
| action_type | restart |
| requested_by | Operator name or "auto-recovery" |
| status | executed / failed |
| result_message | Docker restart result |

---

## 9. API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/applications` | List all applications |
| POST | `/api/v1/applications` | Register new application |
| GET | `/api/v1/applications/{id}` | Get application detail |
| PUT | `/api/v1/applications/{id}` | Update application |
| DELETE | `/api/v1/applications/{id}` | Soft-delete application |
| GET | `/api/v1/applications/{id}/health/status` | Current health status |
| GET | `/api/v1/applications/{id}/health/history` | Paginated health check history |
| POST | `/api/v1/applications/{id}/health/check` | Trigger manual health check |
| GET | `/api/v1/applications/monitoring/summary` | Health summary for all apps |
| POST | `/api/v1/applications/{id}/monitoring/pause` | Pause monitoring |
| POST | `/api/v1/applications/{id}/monitoring/resume` | Resume monitoring |
| GET | `/api/v1/applications/{id}/crash-events` | List crash events |
| GET | `/api/v1/applications/{id}/crash-events/{eid}` | Single crash event detail |
| POST | `/api/v1/applications/{id}/crash-events/{eid}/analyze` | Run AI analysis |
| POST | `/api/v1/applications/{id}/crash-events/{eid}/restart` | Restart container |
| GET | `/api/v1/applications/{id}/recovery-actions` | Recovery action audit log |
| GET | `/api/v1/applications/ai/status` | Ollama availability check |
| POST | `/api/v1/applications/ai/chat` | AI chat message |

---

## 10. Test Scenarios (Built-in Demo Sites)

Three Docker-based test sites are included for demonstrating different failure detection scenarios:

### testsite — Simple 404
- **Container:** `testsite-container` (port 8085)
- **Scenario:** Route `/settings.html` does not exist
- **Detected by:** HTTP Status Code sub-check → 404
- **Playbook:** Points to nginx config and static file serving

### testsite2 — ShopEasy (Silent Error)
- **Container:** `testsite2-container` (port 8086)
- **Site:** Fake e-commerce store (ShopEasy)
- **Scenario:** `/checkout.html` returns 200 but page content contains the word "error"
- **Detected by:** Body Keywords sub-check — catches 200 responses that are actually error pages
- **Playbook:** Points to the specific HTML file to fix

### testsite3 — DevShop (Broken Redirect)
- **Container:** `testsite3-container` (port 8087)
- **Site:** Fake developer tools store (DevShop)
- **Scenario:** `/checkout` redirects via nginx `return 302` to `/chekout.html` (typo — missing 'c') which does not exist → 404
- **Detected by:** Additional Endpoints sub-check + live redirect-chain probe at analysis time
- **Playbook:** Correctly identifies it as a broken redirect, points to `nginx.conf`, not the missing destination file
- **nginx.conf extract:**
  ```nginx
  location = /checkout {
      return 302 http://$http_host/chekout.html;  # typo: chekout
  }
  ```

These three sites cover the three most common silent failure modes in web applications:
1. **Hard 404** — route missing entirely
2. **Soft error** — route exists but serves an error page with 200 status
3. **Broken redirect** — route redirects but the destination is wrong

---

## 11. AI Engine Design

### What is deterministic (no AI involved)

| Output | How it's built |
|--------|---------------|
| `crash_reason` | Assembled from sub-check failure messages |
| `severity` | Rule-mapped: crash-loop → critical, 5xx → high, redirect/404 → high, keyword → medium |
| `category` | Rule-mapped: configuration, resource, application_bug, network |
| `playbook_steps` | Pattern-matched from failure type with live redirect probing |
| `files_to_check` | Pattern-matched per failure type |
| `diagnostic_commands` | Always docker logs + inspect + stats |

### What AI adds

| Output | Source |
|--------|--------|
| `fix_steps` | Ollama — structured JSON, guided by sub-check evidence |
| `quick_check` | Ollama — a single curl/command to verify the fix |
| `commands` | Ollama (falls back to diagnostic_commands if unavailable) |
| Chat responses | Ollama — scoped to DevOps topics |

### Anti-hallucination measures

1. Sub-check evidence is passed as PRIMARY context before logs
2. Temperature set to 0.1 (near-deterministic)
3. Prompt instructs: "ONLY suggest actions based on the detected issue"
4. `crash_reason`, `severity`, `category`, and `playbook_steps` are built deterministically — AI cannot change these
5. Previous analysis passed as context on re-run to prevent contradictions
6. Live redirect probe detects broken redirects from actual HTTP responses, not AI inference

---

## 12. Running the Project

### Prerequisites
- Python 3.10+
- Docker Desktop (running)
- Ollama (optional — for AI features)

### Start

```bash
# Install dependencies
pip install -r requirements.txt

# Start the API server (runs migrations automatically)
python -m uvicorn backend.api.main:app --reload --host 127.0.0.1 --port 8000

# Open the dashboard (separate terminal or browser)
python serve_dashboard.py
# → opens http://localhost:8080
```

### AI Engine (optional)
```bash
# Install Ollama from https://ollama.com
ollama serve
ollama pull gemma4:e2b   # or phi3:mini — configurable in backend/core/config.py
```

### Start test sites
```bash
docker start testsite-container testsite2-container testsite3-container
```

---

## 13. Project Statistics

| Metric | Value |
|--------|-------|
| Backend language | Python 3.10+ |
| Frontend | Vanilla JS/HTML/CSS (zero dependencies) |
| Database migrations | 5 (001–005) |
| API endpoints | 18 |
| Health sub-checks (HTTP) | 6 |
| Dashboard pages | 6 |
| Test sites | 3 (covering 3 failure modes) |
| AI model size | ~2.3GB (phi3:mini) or configurable |
| External API dependencies | 0 |
| Cloud dependencies | 0 |

---

## 14. Key Design Decisions

**Why SQLite?**
Local-first tool. SQLite requires zero configuration, runs as a single file, and is sufficient for the monitoring load of a local dev environment. Easy to inspect, back up, or reset.

**Why vanilla JS?**
No build step means the dashboard can be opened directly from the filesystem. Zero npm dependency chain. Easier to understand, modify, and demo.

**Why local Ollama instead of OpenAI/Anthropic?**
No API keys, no costs, no data leaving the machine. Developers can use it offline. The model is configurable — operators can swap to a larger or faster model by changing one config value.

**Why deterministic playbook + AI fix steps, not AI-only?**
AI alone hallucinates — it might say "create the missing file" when the real problem is a nginx redirect typo. The deterministic layer provides reliable, evidence-based steps. AI adds narrative depth and shell commands on top. If AI is offline, the deterministic playbook still works fully.

**Why human-in-the-loop for restarts?**
A restart is a write operation. Autonomous restarts can mask problems (the container keeps crashing, keeps restarting, nobody notices the underlying bug). Auto-recovery is available but opt-in, limited by attempt count, and always logged.

---

## 15. Glossary

| Term | Definition |
|------|-----------|
| Health Check | A scheduled probe that tests if an application is responding correctly |
| Sub-check | One of 6 individual tests within an HTTP health check |
| Crash Event | A record created when an app transitions from healthy to unhealthy — includes logs |
| Recovery Playbook | A numbered list of fix steps built from sub-check failures |
| Hysteresis | Requiring N consecutive failures before marking unhealthy (avoids false alarms) |
| Auto-recovery | Policy-governed automatic container restart triggered by the monitoring engine |
| Backoff | Increasing delay between successive restart attempts |
| Broken redirect | A 3xx redirect that points to a URL that returns 4xx — caught by live probe |
| Soft delete | Marking an app as deleted without removing its data — allows reactivation |
| Optimistic locking | Version field that prevents two operators from overwriting each other's changes |
