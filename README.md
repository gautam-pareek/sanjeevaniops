# SanjeevaniOps

> Local-first, explainable application reliability and recovery system for Docker containers.

Named after the Sanjeevani herb from Hindu mythology — the herb that revives the dead.
SanjeevaniOps revives crashed applications.

---

## What Problem Does It Solve?

Applications crash and developers often don't know what crashed, why, or how to fix it.
SanjeevaniOps monitors your local Docker containers, detects failures the moment they happen,
captures logs automatically, and uses a local AI to explain what went wrong and suggest fixes.

---

## Core Principles

- **Detect failures, do not guess**
- **Explain causes, do not hallucinate**
- **Never act autonomously — humans approve all actions**
- **No cloud, no paid APIs, no Kubernetes**

---

## Features

| Feature | Status | Description |
|---------|--------|-------------|
| Application Registration | ✅ Complete | Register and manage Docker apps |
| Web Dashboard | ✅ Complete | Warm light-themed UI, zero build step |
| Health Check Monitoring | ✅ Complete | HTTP, TCP, Exec, Docker Native + pause/resume |
| Enhanced HTTP Checks | ✅ Complete | Response time, keywords, endpoints, restart count, JSON |
| Log Collection & Crash Events | ✅ Complete | Auto-capture Docker logs on crash |
| AI Log Analysis | ✅ Complete | Health-check-aware root cause analysis (re-runnable) |
| AI Operations Center | ✅ Complete | Dashboard tab with metrics, batch analysis, scoped AI chat |
| Recovery Actions | 🔜 Planned | Human-approved container restart |

---

## Stack

| Layer | Technology |
|-------|------------|
| Backend API | FastAPI + Uvicorn |
| Database | SQLite (local-first) |
| Validation | Pydantic v2 |
| Container Integration | Docker SDK (read-only) |
| Health Scheduler | APScheduler |
| Frontend | Vanilla HTML/CSS/JS (zero build step) |
| AI Engine | Ollama — LLaMA 3.2 1B (local, ~1.3GB) |

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
# Pull the AI model (~1.3GB download, runs on 4GB RAM)
ollama pull llama3.2:1b
```

### Step 3: Build Test Sites (Optional — for Demo)

```powershell
docker build -t testsite ./testsite
docker run -d --name testsite-container -p 8085:80 testsite

docker build -t testsite2 ./testsite2
docker run -d --name testsite2-container -p 8086:80 testsite2
```

---

## Running

```bash
# 1. Make sure Docker Desktop is running

# 2. Start Ollama (in a separate terminal)
ollama serve

# 3. Start SanjeevaniOps
python -m backend.api.main
```

Open `dashboard/index.html` in browser. No build step needed.

- Swagger UI: http://localhost:8000/docs

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
| `POST` | `/api/v1/applications/{app_id}/monitoring/pause` | Pause |
| `POST` | `/api/v1/applications/{app_id}/monitoring/resume` | Resume |
| `GET` | `/api/v1/applications/{app_id}/crash-events` | Crash events list |
| `GET` | `/api/v1/applications/{app_id}/crash-events/{event_id}` | Crash event detail |

### AI Engine
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v1/applications/{app_id}/crash-events/{event_id}/analyze` | AI crash analysis (uses health checks + logs) |
| `GET` | `/api/v1/applications/ai/status` | Check Ollama availability |
| `POST` | `/api/v1/applications/ai/chat` | Scoped AI chat assistant |

---

## Health Check Types

| Type | Detects |
|------|---------| 
| `http` | Status code, response time, error keywords in body, restart count, extra endpoints, JSON |
| `tcp` | Port connectivity |
| `exec` | Command exit code inside container |
| `docker_native` | Docker HEALTHCHECK status |

### Enhanced HTTP Detection

Every HTTP check runs 6 sub-checks:

| Sub-check | Catches |
|-----------|---------|
| Status Code | Site down (4xx/5xx) |
| Response Time | Slow server (configurable warn/critical thresholds) |
| Body Keywords | Error pages returning 200 — searches for "error", "exception" etc |
| Restart Count | Crash-looping container |
| Additional Endpoints | Specific routes broken — body scanned for errors too |
| JSON Validation | Non-JSON response when JSON expected |

---

## AI Engine

### Crash Log Analysis
When a crash event is captured, click **"Analyze with AI"** in the crash events panel. The AI cross-references:
1. **Health check sub-check results** (PRIMARY) — what the monitoring engine actually detected (404 status, body keywords, response time, etc.)
2. **Container logs** (supplementary) — raw Docker output for additional context

Returns:
- **Crash Reason** — based on health check evidence
- **Suggested Fix** — actionable steps to resolve
- **Severity** — low / medium / high / critical
- **Category** — configuration / dependency / resource / network / application_bug

Analysis is **re-runnable** — each re-analysis includes previous context for continuity.

### Continue in Chat
After analysis, click **"Continue in Chat"** to jump to the AI Engine tab. The crash context is automatically sent to the AI chat, which provides detailed step-by-step debugging instructions.

### AI Operations Center
The **AI Engine** tab in the dashboard provides:
- Engine status (online/offline), model info
- Aggregate metrics: total crash events, analyses complete, pending, critical/high count
- Severity distribution chart and failure category breakdown
- **Batch Analysis** — analyze all unanalyzed crash events with one click and progress tracking
- **AI Chat** — ask questions about Docker, containers, health checks, crash diagnostics

### Scoped Chat
The AI chat assistant **only responds to DevOps/monitoring topics**. Non-related questions receive a polite refusal. Topics covered:
- Container crash diagnosis and exit codes
- Docker & Nginx troubleshooting
- Health check configuration help
- Log interpretation and debugging steps

---

## Crash Events

When an app transitions from healthy to unhealthy, SanjeevaniOps automatically:
1. Captures the last 100 lines of Docker container logs
2. Records container status and exit code
3. Stores as a crash event linked to the triggering health check
4. Displays in the dashboard detail view
5. Available for AI analysis (on-demand, re-runnable, health-check-aware)

---

## Test Sites

Two included test Docker sites for demo purposes:

### testsite (port 8085) — simple 3-page site
```powershell
docker build -t testsite ./testsite
docker run -d --name testsite-container -p 8085:80 testsite
```
Register with URL `http://localhost:8085/`, additional endpoint `/settings.html`

### testsite2 / ShopEasy (port 8086) — fake ecommerce
```powershell
docker build -t testsite2 ./testsite2
docker run -d --name testsite2-container -p 8086:80 testsite2
```
Register with URL `http://localhost:8086/`, additional endpoint `/checkout.html`
Checkout page returns 200 but contains a 500 error — caught by body keyword detection.

---

## Migrations

| File | Description |
|------|-------------|
| `001_initial_schema.sql` | Applications, audit history, container cache |
| `002_health_check_monitoring.sql` | Health check results, app health status |
| `003_monitoring_pause.sql` | Pause/resume per app |
| `004_crash_events.sql` | Crash events with Docker logs + AI analysis fields |

---

## Bugs Fixed

18 bugs fixed across the project lifecycle. Key fixes include:
- SQLite threading, route conflicts, idempotent migrations
- Stale health status overrides, Docker graceful degradation
- Sub-checks now persisted in health history
- Dashboard displays all enhanced HTTP config fields
- AI analysis made re-runnable with health check cross-referencing
- AI prompt restructured to prevent hallucination (health checks first)

See `PROJECT_STATE.md` for the full bug table.

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
│   ├── services/
│   ├── repositories/
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
│   └── 004_crash_events.sql
├── testsite/
├── testsite2/
├── automation/
└── requirements.txt
```
