# SanjeevaniOps

> **Local-first, explainable application reliability and recovery system for Docker containers.**

Named after the *Sanjeevani* herb from Hindu mythology — the herb that revives the dead.
**SanjeevaniOps revives crashed applications.**

![Python](https://img.shields.io/badge/Python-3.10+-3776AB?style=flat-square&logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-009688?style=flat-square&logo=fastapi&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-SDK-2496ED?style=flat-square&logo=docker&logoColor=white)
![Ollama](https://img.shields.io/badge/AI-Ollama%20local%20models-black?style=flat-square)
![SQLite](https://img.shields.io/badge/Database-SQLite-003B57?style=flat-square&logo=sqlite&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)

---

## What Problem Does It Solve?

Applications crash and developers often don't know **what crashed, why, or how to fix it**.

SanjeevaniOps monitors your local Docker containers, detects failures the moment they happen, captures logs automatically, and uses a **local AI** to explain what went wrong and suggest a step-by-step recovery playbook — with a human-approved restart so nothing happens without your say-so.

---

## Core Principles

- **Detect failures, do not guess** — monitoring is deterministic, not speculative
- **Explain causes, do not hallucinate** — crash reason and playbook are built from real health check evidence, not AI imagination
- **Never act autonomously — humans approve all recovery actions**
- **No cloud, no paid APIs, no Kubernetes** — runs entirely on your laptop

---

## Features

| Feature | Status | Description |
|---------|--------|-------------|
| Application Registration | ✅ Complete | Register and manage Docker apps with full CRUD |
| Web Dashboard | ✅ Complete | Warm light-themed UI, zero build step |
| Health Check Monitoring | ✅ Complete | HTTP, TCP, Exec, Docker Native + pause/resume |
| Enhanced HTTP Checks | ✅ Complete | 6 sub-checks: status, response time, keywords, restart count, endpoints, JSON |
| Log Collection & Crash Events | ✅ Complete | Auto-capture Docker logs on crash, live-refreshed on every view |
| AI Log Analysis | ✅ Complete | Health-check-aware root cause analysis (re-runnable) |
| Recovery Playbook | ✅ Complete | Deterministic step-by-step fix guide from sub-check failure patterns |
| AI Operations Center | ✅ Complete | Dashboard tab: metrics, batch analysis, scoped AI chat |
| Recovery Actions | ✅ Complete | Human-approved container restart with full audit trail |
| Auto-Recovery Engine | ✅ Complete | Policy-driven auto-restart with exponential backoff + attempt limiting |
| Broken Redirect Detection | ✅ Complete | Detects 302→404 chains — playbook routes to nginx.conf, not missing file |

---

## Stack

| Layer | Technology |
|-------|------------|
| Backend API | FastAPI + Uvicorn |
| Database | SQLite (local-first) |
| Validation | Pydantic v2 |
| Container Integration | Docker SDK |
| Health Scheduler | APScheduler |
| Frontend | Vanilla HTML/CSS/JS (zero build step) |
| AI Engine | Ollama — any locally installed model, selectable from dashboard |

---

## Installation

### Prerequisites

- Python 3.10+
- Docker Desktop (running)
- Ollama (for AI features)

### Step 1: Clone & Install Python Dependencies

```bash
git clone https://github.com/gautam-pareek/sanjeevaniops.git
cd sanjeevaniops
pip install -r requirements.txt
```

### Step 2: Install Ollama (for AI Features)

Download and install Ollama from [https://ollama.com/download](https://ollama.com/download)

```bash
# Pull any model that fits your hardware — examples:
ollama pull phi3:mini       # 2.3 GB — good for 4 GB VRAM
ollama pull llama3.2:1b     # 1.3 GB — smallest, fastest
ollama pull gemma2:2b       # 1.6 GB — alternative small model
```

Run `ollama list` to see what you already have. The dashboard's **AI Engine** tab shows all installed models and lets you switch between them at runtime — no config file editing needed.

> **Any model works.** When you open the AI Engine tab, SanjeevaniOps automatically switches to the first locally installed model if the default (`phi3:mini`) is not found. Your selection is saved to `.env` and persists across restarts — no config editing needed.

### Step 3: Build Test Sites (Optional — for Demo)

```powershell
docker build -t testsite ./testsite
docker run -d --name testsite-container -p 8085:80 testsite

docker build -t testsite2 ./testsite2
docker run -d --name testsite2-container -p 8086:80 testsite2

docker build -t testsite3 ./testsite3
docker run -d --name testsite3-container -p 8087:80 testsite3
```

The three test sites simulate different failure modes:

| Site | Port | Failure Mode | How Detected |
|------|------|-------------|--------------|
| testsite | 8085 | `/settings.html` → 404 | HTTP status code |
| testsite2 (ShopEasy) | 8086 | `/checkout.html` returns 200 with "500 error" in body | Body keyword scan |
| testsite3 (DevShop) | 8087 | `/checkout` → 302 → `/chekout.html` (typo) → 404 | Broken redirect chain |

---

## Running

```bash
# 1. Make sure Docker Desktop is running

# 2. Start Ollama (in a separate terminal)
ollama serve

# 3. Start SanjeevaniOps
python -m uvicorn backend.api.main:app --host 0.0.0.0 --port 8000
```

Open `dashboard/index.html` in your browser. **No build step needed.**

- Dashboard: open `dashboard/index.html` directly
- Swagger UI: [http://localhost:8000/docs](http://localhost:8000/docs)

---

## How It Works

### Health Monitoring

Every registered app gets its own background monitoring job. When a check fails past the configured threshold, a **crash event** is automatically created with:
- Last 100 lines of Docker container logs (live-refreshed on every view)
- Container status and exit code
- Triggering health check details and sub-check results

### AI-Powered Crash Analysis

Click **"Analyze with AI"** on any crash event. The system:
1. Builds crash reason, severity, and playbook **deterministically** from sub-check failure patterns — no AI involved, no hallucination possible
2. Passes sub-check data (primary) + fresh container logs (supplementary) to the AI
3. AI returns structured fix steps, files to inspect, diagnostic commands, and a quick-verify command

Analysis is **re-runnable** — each re-run fetches the latest logs and passes previous analysis as context.

### Recovery Playbook

Every analyzed crash event gets a **Recovery Playbook** panel:

```
┌─────────────────────────────────────────────────────┐
│  Root Cause                              [SEVERITY] │
│  Health check failed — HTTP 404 on /settings.html   │
├─────────────────────────────────────────────────────┤
│  Recovery Playbook                    [Copy Steps]  │
│  ① Verify the path exists in nginx/server config    │
│  ② Check static file or route handler at that path  │
│  ③ docker logs testsite-container --tail 100        │
│                                                     │
│  Files to inspect:                                  │
│    [nginx.conf]  [routes/]  [app.js]                │
│                                                     │
│  Run these commands:                                │
│    docker logs testsite-container --tail 100        │
│    docker inspect testsite-container                │
│                                                     │
│  Quick verify: curl -I http://localhost:8085/       │
├─────────────────────────────────────────────────────┤
│  [Continue in Chat]                                 │
│  [Restart Container] ← temporary relief only        │
└─────────────────────────────────────────────────────┘
```

### Recovery Actions

Two recovery paths are available:

**Manual restart** — The restart button is amber-coloured and labelled as **temporary relief only**. A confirmation modal reminds the operator that the crash will recur unless the root cause is fixed. Every restart is logged to an audit trail with operator identity and timestamp.

**Auto-recovery** — When `recovery_policy.enabled = true` on a registered app, the monitoring engine automatically restarts the container after an unhealthy transition using a configurable policy:
- `restart_delay_seconds` — initial delay before first restart (default: 30s)
- `backoff_multiplier` — delay multiplier on each subsequent attempt (default: 1.5×)
- `max_restart_attempts` — cap per failure episode (default: 3)

The attempt counter resets when the app recovers, so a new failure episode gets the full budget again. All auto-restarts are logged as `requested_by = 'auto-recovery'` in the same audit table.

### Broken Redirect Detection

SanjeevaniOps detects broken redirect chains — not just missing files. If a monitored endpoint returns a 302 and the final destination returns 404, the sub-check records the full chain (e.g. `/checkout → 302 → /chekout.html → 404`). The playbook correctly points to the **nginx config**, not to a missing file, because the file path is a symptom of a misconfigured redirect.

### Continue in Chat

Click **"Continue in Chat"** after an analysis to jump to the AI Engine tab. The crash context — including root cause, severity, recovery playbook steps, and files to inspect — is automatically sent to the scoped AI chat assistant so it can reason from evidence rather than guessing.

---

## API Reference

### Applications

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v1/applications` | Register |
| `GET` | `/api/v1/applications` | List |
| `GET` | `/api/v1/applications/{app_id}` | Get |
| `PUT` | `/api/v1/applications/{app_id}` | Update |
| `DELETE` | `/api/v1/applications/{app_id}` | Soft delete |
| `POST` | `/api/v1/applications/{app_id}/reactivate` | Reactivate |
| `GET` | `/api/v1/applications/{app_id}/history` | Change history |

### Health Monitoring

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v1/applications/{app_id}/health/status` | Current status |
| `GET` | `/api/v1/applications/{app_id}/health/history` | Check history |
| `POST` | `/api/v1/applications/{app_id}/health/check` | Manual trigger |
| `GET` | `/api/v1/applications/monitoring/summary` | All-apps overview |
| `POST` | `/api/v1/applications/{app_id}/monitoring/pause` | Pause monitoring |
| `POST` | `/api/v1/applications/{app_id}/monitoring/resume` | Resume monitoring |
| `GET` | `/api/v1/applications/{app_id}/crash-events` | List crash events (live logs) |
| `GET` | `/api/v1/applications/{app_id}/crash-events/{event_id}` | Crash event detail |

### AI Engine

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v1/applications/{app_id}/crash-events/{event_id}/analyze` | Analyze crash event |
| `GET` | `/api/v1/applications/ai/status` | Check Ollama availability |
| `GET` | `/api/v1/applications/ai/models` | List locally installed Ollama models |
| `POST` | `/api/v1/applications/ai/model` | Switch active model at runtime |
| `POST` | `/api/v1/applications/ai/chat` | Scoped AI chat assistant |

### Recovery Actions

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v1/applications/{app_id}/crash-events/{event_id}/restart` | Restart container (human-approved) |
| `GET` | `/api/v1/applications/{app_id}/recovery-actions` | Recovery audit log |

---

## Health Check Types

| Type | Detects |
|------|---------|
| `http` | Status code, response time, error keywords in body, restart count, extra endpoints, JSON validity |
| `tcp` | Port connectivity |
| `exec` | Command exit code inside container |
| `docker_native` | Docker HEALTHCHECK status |

### Enhanced HTTP Sub-Checks

Every HTTP check runs 6 sub-checks:

| Sub-check | Catches |
|-----------|---------|
| Status Code | Site down (4xx/5xx) |
| Response Time | Slow server (configurable warn/critical thresholds) |
| Body Keywords | Error pages returning 200 — searches for "error", "exception" etc |
| Restart Count | Crash-looping container |
| Additional Endpoints | Specific routes broken — body scanned for errors too; redirect chains detected |
| JSON Validation | Non-JSON response when JSON expected |

Broken redirect chains (e.g. 302 → 404) are recorded with the full hop sequence and routed to a nginx-config playbook, not a file-missing playbook.

---

## AI Operations Center

The **AI Engine** tab in the dashboard provides:

- **Engine status** — live-polled every 20 seconds; badge updates the moment Ollama starts or stops; offline message distinguishes "Ollama down" from "model not installed" and names what IS available
- **Model selector** — dropdown lists every locally installed Ollama model; switch with one click, takes effect immediately (no restart needed)
- **Aggregate metrics** — total crash events, analyses complete, pending, critical/high count
- **Severity distribution** and failure category breakdown
- **Batch Analysis** — analyze all unanalyzed crash events with one click and progress tracking
- **AI Chat** — scoped assistant for Docker, health checks, crash diagnosis (politely refuses unrelated questions)

---

## Project Structure

```
sanjeevaniops/
├── backend/
│   ├── api/
│   │   ├── main.py
│   │   └── v1/
│   │       ├── applications.py
│   │       ├── health.py
│   │       └── models/
│   ├── core/
│   │   ├── config.py          ← ollama_model setting here
│   │   └── database.py
│   ├── services/
│   │   ├── application_service.py
│   │   ├── docker_service.py
│   │   └── validation_service.py
│   ├── repositories/
│   │   ├── application_repository.py
│   │   ├── health_repository.py
│   │   ├── container_cache_repository.py
│   │   └── recovery_repository.py
│   └── exceptions/
├── monitoring/
│   ├── health_checker.py
│   ├── monitor_service.py
│   └── monitor_scheduler.py
├── ai_engine/
│   ├── __init__.py
│   └── ai_service.py
├── dashboard/
│   ├── index.html
│   ├── app.js
│   ├── api.js
│   ├── components.js
│   ├── forms.js
│   └── styles.css
├── migrations/
│   ├── 001_initial_schema.sql
│   ├── 002_health_check_monitoring.sql
│   ├── 003_monitoring_pause.sql
│   ├── 004_crash_events.sql
│   └── 005_recovery_actions.sql
├── testsite/           ← demo: 404 on /settings.html
├── testsite2/          ← demo: body keyword failure (200 but "500 error" text)
├── testsite3/          ← demo: broken redirect /checkout → 302 → /chekout.html → 404
└── requirements.txt
```

---

## Migrations

| File | Description |
|------|-------------|
| `001_initial_schema.sql` | Applications, audit history, container cache |
| `002_health_check_monitoring.sql` | Health check results, app health status |
| `003_monitoring_pause.sql` | Pause/resume per app |
| `004_crash_events.sql` | Crash events with Docker logs + AI analysis fields |
| `005_recovery_actions.sql` | Recovery actions audit log |

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

External: **Ollama** (installed separately — pull any model with `ollama pull <model>`)

---

## Author

**Gautam Pareek** — Built as a portfolio project demonstrating local-first DevOps tooling, AI-assisted observability, and human-in-the-loop automation.
