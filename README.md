# SanjeevaniOps

> Local-first, explainable application reliability and recovery system for Docker containers.

Named after the Sanjeevani herb from Hindu mythology — the herb that revives the dead.
SanjeevaniOps revives crashed applications.

---

## What Problem Does It Solve?

Applications and websites crash constantly — traffic overload, broken routes, API failures,
memory leaks, container crashes. Developers often don't know:
- **What** crashed
- **Why** it crashed
- **How** to fix it fast

SanjeevaniOps monitors your local Docker containers, detects crashes the moment they happen,
analyzes logs using a local AI, and tells you exactly what went wrong and how to fix it.

---

## Core Principles

- **Detect failures, do not guess**
- **Explain causes, do not hallucinate**
- **Automate only safe, reversible actions**
- **Escalate to humans on repeated failure**
- **AI is reasoning-only, never executing**

## Hard Constraints

❌ No cloud providers  
❌ No Kubernetes  
❌ No autonomous AI execution  
❌ No paid APIs or SaaS tools  
✅ Local-first  
✅ Human-controlled  
✅ Explainable  

---

## Features

| Feature | Status | Description |
|---------|--------|-------------|
| Application Registration | ✅ Complete | Register and manage Docker apps |
| Web Dashboard | ✅ Complete | Dark-themed UI for full management |
| Health Check Monitoring | ✅ Complete | HTTP, TCP, Exec, Docker Native + pause/resume |
| Enhanced Health Checks | 🔄 In Progress | Response time, keywords, endpoints, API, restart count |
| Log Collection | 🔜 Next | Auto-capture Docker logs on crash |
| AI Log Analysis | 🔜 Planned | Local LLaMA-powered root cause analysis |
| Recovery Actions | 🔜 Planned | Human-approved container restart |

---

## Stack

| Layer | Technology |
|-------|-----------|
| Backend API | FastAPI + Uvicorn |
| Database | SQLite (local-first, explicit SQL) |
| Validation | Pydantic v2 |
| Container Integration | Docker SDK (read-only) |
| Health Check Scheduler | APScheduler |
| Frontend | Vanilla HTML/CSS/JS (zero build step) |
| AI Engine (planned) | Ollama — LLaMA 3.1 (local only) |

---

## Installation

### Prerequisites
- Python 3.10+
- Docker (running)
- pip

### Setup

```bash
git clone https://github.com/gautam-pareek/sanjeevaniops.git
cd sanjeevaniops
pip install -r requirements.txt
```

---

## Running

### Start the Backend

```bash
python -m backend.api.main
```

On startup:
```
Database initialized successfully
Health check scheduler started — monitoring X application(s)
```

### Open the Dashboard

1. Navigate to the `dashboard/` folder
2. Open `index.html` in any modern browser
3. No build step required

### API Docs

- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

---

## API Reference

### Applications

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v1/applications` | Register new application |
| `GET` | `/api/v1/applications` | List applications |
| `GET` | `/api/v1/applications/{app_id}` | Get application details |
| `PUT` | `/api/v1/applications/{app_id}` | Update application |
| `DELETE` | `/api/v1/applications/{app_id}` | Soft delete application |
| `POST` | `/api/v1/applications/{app_id}/reactivate` | Reactivate deleted app |
| `POST` | `/api/v1/applications/validate` | Validate registration (dry-run) |
| `GET` | `/api/v1/applications/{app_id}/verify-container` | Verify container exists |
| `GET` | `/api/v1/applications/{app_id}/history` | Get change history |

### Health Check Monitoring

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v1/applications/{app_id}/health/status` | Current health status |
| `GET` | `/api/v1/applications/{app_id}/health/history` | Paginated check history |
| `POST` | `/api/v1/applications/{app_id}/health/check` | Trigger manual check |
| `GET` | `/api/v1/applications/monitoring/summary` | All-apps health overview |
| `POST` | `/api/v1/applications/{app_id}/monitoring/pause` | Pause monitoring |
| `POST` | `/api/v1/applications/{app_id}/monitoring/resume` | Resume monitoring |

---

## Health Check Types

| Type | Description |
|------|-------------|
| `http` | HTTP/HTTPS — checks status code, response time, keywords in body |
| `tcp` | TCP port connectivity |
| `exec` | Runs a command inside the container — checks exit code |
| `docker_native` | Reads Docker's own HEALTHCHECK status |

### Health Status Values

| Status | Meaning |
|--------|---------|
| `healthy` | Passing checks within success threshold |
| `unhealthy` | Failure threshold reached — needs attention |
| `unknown` | Not yet checked since registration |
| `error` | Check could not execute (Docker unavailable etc.) |

### Dashboard Badge Logic

| Situation | Display |
|-----------|---------|
| Container running, monitoring active | `Monitoring` + `Healthy/Unhealthy` |
| Container not running | `Unhealthy` only |
| Monitoring manually paused | `⏸ Paused` only |

---

## Project Structure

```
sanjeevaniops/
├── backend/
│   ├── api/
│   │   ├── main.py                    # FastAPI app, startup, routing
│   │   ├── dependencies.py
│   │   └── v1/
│   │       ├── applications.py        # CRUD endpoints
│   │       ├── health.py              # Health + pause/resume endpoints
│   │       └── models/                # Pydantic request/response models
│   ├── core/
│   │   ├── config.py
│   │   └── database.py                # SQLite, idempotent migrations
│   ├── services/
│   │   ├── application_service.py
│   │   ├── docker_service.py          # Read-only, graceful degradation
│   │   └── validation_service.py
│   ├── repositories/
│   │   ├── application_repository.py
│   │   ├── container_cache_repository.py
│   │   └── health_repository.py
│   └── exceptions/
│       └── custom_exceptions.py
├── monitoring/
│   ├── health_checker.py              # Executes health checks
│   ├── monitor_service.py             # Orchestrates checks + state
│   └── monitor_scheduler.py          # APScheduler background jobs
├── dashboard/
│   ├── index.html
│   ├── app.js
│   ├── api.js
│   ├── components.js
│   ├── forms.js
│   ├── utils.js
│   └── styles.css
├── migrations/
│   ├── 001_initial_schema.sql
│   ├── 002_health_check_monitoring.sql
│   └── 003_monitoring_pause.sql
├── ai_engine/                         # Planned: Ollama integration
├── automation/                        # Planned: n8n workflows
├── requirements.txt
├── PROJECT_STATE.md
├── ARCHITECTURE.md
└── SYSTEM_PROMPT.md
```

---

## Design Decisions

**Explicit over Implicit** — No auto-discovery. All registrations are manual.  
**Validation First** — Comprehensive validation before any persistence.  
**Audit Trail** — Immutable history of every change.  
**Optimistic Locking** — Version-based concurrency control.  
**Human-in-the-Loop** — Operator identity tracked for all operations.  
**Safety** — Read-only Docker operations. No autonomous execution.  
**Hysteresis** — Health status only changes after threshold is met, preventing flapping.  
**Container Exited = Immediate Unhealthy** — No waiting for HTTP failure threshold.  

---

## License

Internal use only — SanjeevaniOps
