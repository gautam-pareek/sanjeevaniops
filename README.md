# SanjeevaniOps

> Local-first, explainable application reliability and recovery system.

---

## What is SanjeevaniOps?

SanjeevaniOps monitors your Docker-based applications locally — no cloud, no SaaS, no paid APIs. It detects failures, explains causes, and (with your approval) recovers services. You stay in control at every step.

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
| Application Registration API | ✅ Complete | Register and manage Docker apps |
| Web Dashboard | ✅ Complete | Dark-themed UI for full management |
| Health Check Monitoring | ✅ Complete | HTTP, TCP, Exec, Docker Native checks |
| Recovery Execution Engine | 🔜 Next | Safe, human-approved container recovery |
| AI Log Analysis | 🔜 Planned | Local LLaMA-powered root cause analysis |

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
| AI Engine (planned) | Local LLaMA 3.1 |
| Automation (planned) | n8n |

---

## Installation

### Prerequisites
- Python 3.10+
- Docker (running)
- pip

### Setup

```bash
# Clone the repo
git clone https://github.com/gautam-pareek/sanjeevaniops.git
cd sanjeevaniops

# Install dependencies
pip install -r requirements.txt
```

---

## Running

### Start the Backend

```bash
# Development (with auto-reload)
python -m backend.api.main

# Production
uvicorn backend.api.main:app --host 0.0.0.0 --port 8000
```

On startup you will see:
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

---

## Health Check Types

| Type | Description |
|------|-------------|
| `http` | HTTP/HTTPS request — checks status code |
| `tcp` | TCP port connectivity check |
| `exec` | Runs a command inside the container — checks exit code |
| `docker_native` | Reads Docker's own HEALTHCHECK status |

### Health Status Values

| Status | Meaning |
|--------|---------|
| `healthy` | Passing checks, within success threshold |
| `unhealthy` | Failure threshold reached — needs attention |
| `unknown` | Not yet checked since registration |
| `error` | Check could not execute (Docker unavailable, etc.) |

---

## Project Structure

```
sanjeevaniops/
├── backend/
│   ├── api/
│   │   ├── main.py                  # FastAPI app, startup, routing
│   │   ├── dependencies.py          # Dependency injection
│   │   └── v1/
│   │       ├── applications.py      # Application CRUD endpoints
│   │       ├── health.py            # Health check endpoints
│   │       └── models/              # Request/response models
│   ├── core/
│   │   ├── config.py                # Settings
│   │   └── database.py              # SQLite connection management
│   ├── services/
│   │   ├── application_service.py   # Application business logic
│   │   ├── docker_service.py        # Docker inspection (read-only)
│   │   └── validation_service.py    # Registration validation
│   ├── repositories/
│   │   ├── application_repository.py
│   │   ├── container_cache_repository.py
│   │   └── health_repository.py     # Health check data access
│   └── exceptions/
│       └── custom_exceptions.py
├── monitoring/
│   ├── health_checker.py            # Executes health checks
│   ├── monitor_service.py           # Orchestrates checks + state
│   └── monitor_scheduler.py        # APScheduler background jobs
├── dashboard/
│   ├── index.html                   # Entry point
│   ├── app.js                       # Routing + views
│   ├── api.js                       # API client
│   ├── components.js                # Reusable UI components
│   ├── forms.js                     # Registration wizard
│   ├── utils.js                     # Helpers
│   └── styles.css                   # Design system
├── migrations/
│   ├── 001_initial_schema.sql       # Applications + audit tables
│   └── 002_health_check_monitoring.sql  # Health check tables
├── docs/
├── ai_engine/                       # Planned: LLaMA log analysis
├── automation/                      # Planned: n8n workflows
├── requirements.txt
├── PROJECT_STATE.md
├── ARCHITECTURE.md
└── SYSTEM_PROMPT.md
```

---

## Example: Register an Application

```json
POST /api/v1/applications
{
  "name": "my-web-app",
  "container_name": "web-app-container",
  "health_check": {
    "type": "http",
    "interval_seconds": 30,
    "timeout_seconds": 5,
    "failure_threshold": 3,
    "success_threshold": 1,
    "config": {
      "url": "http://localhost:8080/health",
      "method": "GET",
      "expected_status_codes": [200]
    }
  },
  "recovery_policy": {
    "enabled": true,
    "max_restart_attempts": 3,
    "restart_delay_seconds": 60,
    "allowed_actions": ["container_restart"]
  },
  "metadata": {
    "environment": "production",
    "criticality": "high"
  }
}
```

---

## Design Principles

**Explicit over Implicit** — No auto-discovery. All registrations are manual.  
**Validation First** — Comprehensive validation before any persistence.  
**Audit Trail** — Immutable history of every change.  
**Optimistic Locking** — Version-based concurrency control.  
**Human-in-the-Loop** — Operator identity tracked for all operations.  
**Safety** — Read-only Docker operations. No autonomous execution.  
**Hysteresis** — Health status only changes after threshold is met, preventing flapping.  

---

## License

Internal use only — SanjeevaniOps
