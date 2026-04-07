# SanjeevaniOps

> **Local-first, explainable application reliability and recovery system for Docker containers.**

Named after the *Sanjeevani* herb from Hindu mythology — the herb that revives the dead.
**SanjeevaniOps revives crashed applications.**

![Python](https://img.shields.io/badge/Python-3.10+-3776AB?style=flat-square&logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-009688?style=flat-square&logo=fastapi&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-SDK-2496ED?style=flat-square&logo=docker&logoColor=white)
![Ollama](https://img.shields.io/badge/AI-Ollama%20LLaMA%203.2-black?style=flat-square)
![SQLite](https://img.shields.io/badge/Database-SQLite-003B57?style=flat-square&logo=sqlite&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)

---

## What Problem Does It Solve?

Applications crash and developers often don't know **what crashed, why, or how to fix it**.

SanjeevaniOps monitors your local Docker containers, detects failures the moment they happen, captures logs automatically, and uses a **local AI** to explain what went wrong and suggest fixes — with a human-approved recovery workflow so nothing restarts without your say-so.

---

## Core Principles

- **Detect failures, do not guess** — monitoring is deterministic, not speculative
- **Explain causes, do not hallucinate** — AI cross-references real health check evidence
- **Never act autonomously — humans approve all actions**
- **No cloud, no paid APIs, no Kubernetes** — runs entirely on your laptop

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
| Recovery Actions | ✅ Complete | AI-guided, human-approved intelligent container restart |

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

Open `dashboard/index.html` in your browser. **No build step needed.**

- Dashboard: open `dashboard/index.html` directly
- Swagger UI: [http://localhost:8000/docs](http://localhost:8000/docs)

---

## How It Works

### Health Monitoring

Every registered app gets its own background monitoring job. When a check fails past the configured threshold, a **crash event** is automatically created with:
- Last 100 lines of Docker container logs
- Container status and exit code
- Triggering health check details

### AI-Powered Crash Analysis

Click **"Analyze with AI"** on any crash event. The AI:
1. Reads the **health check sub-check results first** (what actually failed — status code, body keywords, response time, etc.)
2. Uses **Docker logs as supplementary context**
3. Returns a structured analysis: crash reason, suggested fix, severity, and failure category

Analysis is **re-runnable** — each re-run gets the previous analysis as context for continuity.

### Intelligent Recovery Workflow

After analysis, the **Recovery Actions** panel presents:
- Root cause summary
- Specific problematic files/configs identified
- Concrete step-by-step fix instructions

An operator reviews the AI's findings and **explicitly approves** the container restart. Every recovery action is logged with operator name and timestamp.

### Continue in Chat

Click **"Continue in Chat"** after an analysis to jump to the AI Engine tab. The crash context is automatically sent to the scoped AI chat assistant for deeper debugging conversation.

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
| `POST` | `/api/v1/applications/{app_id}/crash-events/{event_id}/analyze` | AI crash analysis |
| `GET` | `/api/v1/applications/ai/status` | Check Ollama availability |
| `POST` | `/api/v1/applications/ai/chat` | Scoped AI chat assistant |

### Recovery Actions

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v1/applications/{app_id}/crash-events/{event_id}/recover` | Approve & execute recovery |
| `GET` | `/api/v1/applications/{app_id}/recovery-history` | Recovery action log |

---

## Health Check Types

| Type | Detects |
|------|---------|
| `http` | Status code, response time, error keywords in body, restart count, extra endpoints, JSON |
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
| Additional Endpoints | Specific routes broken — body scanned for errors too |
| JSON Validation | Non-JSON response when JSON expected |

---

## AI Operations Center

The **AI Engine** tab in the dashboard provides:

- **Engine status** — Ollama online/offline, model info
- **Aggregate metrics** — total crash events, analyses complete, pending, critical/high count
- **Severity distribution** chart and failure category breakdown
- **Batch Analysis** — analyze all unanalyzed crash events with one click and progress tracking
- **AI Chat** — scoped assistant for Docker, health checks, crash diagnosis (politely refuses unrelated questions)

---

## Test Sites

Two included Docker test sites for demo purposes:

### testsite (port 8085) — simple 3-page site

```powershell
docker build -t testsite ./testsite
docker run -d --name testsite-container -p 8085:80 testsite
```

Register with URL `http://localhost:8085/`, additional endpoint `/settings.html`
→ `/settings.html` returns 404 — caught by status code check.

### testsite2 / ShopEasy (port 8086) — fake e-commerce

```powershell
docker build -t testsite2 ./testsite2
docker run -d --name testsite2-container -p 8086:80 testsite2
```

Register with URL `http://localhost:8086/`, additional endpoint `/checkout.html`
→ Checkout returns 200 but contains a 500 error — caught by body keyword detection.

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

---

## Migrations

| File | Description |
|------|-------------|
| `001_initial_schema.sql` | Applications, audit history, container cache |
| `002_health_check_monitoring.sql` | Health check results, app health status |
| `003_monitoring_pause.sql` | Pause/resume per app |
| `004_crash_events.sql` | Crash events with Docker logs + AI analysis fields |

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

External: **Ollama** (installed separately — `ollama pull llama3.2:1b`)

---

## Author

**Gautam Pareek** — Built as a portfolio project demonstrating local-first DevOps tooling, AI-assisted observability, and human-in-the-loop automation.
