# SanjeevaniOps - Application Registration API

Local-first, explainable application reliability and recovery system.

## Feature 2: Application Registration API

This implementation provides the complete Application Registration API as specified in the design document.

### Architecture

- **FastAPI**: REST API framework
- **SQLite**: Local-first database with explicit SQL
- **Pydantic**: Request/response validation
- **Docker SDK**: Read-only container inspection

### Key Features

✅ Explicit application registration (no auto-discovery)
✅ Comprehensive health check configuration (HTTP, TCP, Exec, Docker Native)
✅ Recovery policy management
✅ Optimistic locking for concurrent updates
✅ Soft-delete pattern
✅ Immutable audit history
✅ Container existence verification
✅ Validation-first approach

### Installation
```bash
# Install dependencies
pip install -r requirements.txt

# Run database migrations (automatic on startup)
# Or manually:
sqlite3 sanjeevaniops.db < migrations/001_initial_schema.sql
```

### Running the API
```bash
# Development mode
python backend/api/main.py

# Production mode
uvicorn backend.api.main:app --host 0.0.0.0 --port 8000
```

### API Documentation

Once running, visit:
- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

### Project Structure
```
backend/
├── api/
│   ├── main.py              # FastAPI application
│   ├── dependencies.py      # Dependency injection
│   └── v1/
│       ├── applications.py  # Application endpoints
│       └── models/          # Request/response models
├── core/
│   ├── config.py            # Configuration
│   └── database.py          # Database management
├── services/
│   ├── application_service.py   # Business logic orchestration
│   ├── docker_service.py        # Docker inspection
│   └── validation_service.py   # Validation logic
├── repositories/
│   ├── application_repository.py  # Application data access
│   └── container_cache_repository.py  # Container cache
└── exceptions/
    └── custom_exceptions.py  # Domain exceptions

migrations/
└── 001_initial_schema.sql   # Database schema
```

### Design Principles

**Explicit over Implicit**: No auto-discovery, all registrations are manual
**Validation First**: Comprehensive validation before persistence
**Audit Trail**: Immutable history of all changes
**Optimistic Locking**: Version-based concurrency control
**Human-in-the-Loop**: Operator identity tracked for all operations
**Safety**: Read-only Docker operations, no autonomous execution

### Example Usage
```python
# Register an application
POST /api/v1/applications
{
  "name": "my-web-app",
  "container_name": "web-app-container",
  "health_check": {
    "type": "http",
    "interval_seconds": 30,
    "config": {
      "url": "http://localhost:8080/health",
      "method": "GET",
      "expected_status_codes": [200]
    }
  },
  "recovery_policy": {
    "enabled": true,
    "max_restart_attempts": 3,
    "allowed_actions": ["container_restart"]
  },
  "metadata": {
    "environment": "production",
    "criticality": "high"
  }
}
```

### System Constraints

❌ No cloud providers
❌ No Kubernetes
❌ No autonomous AI execution
❌ No AI-driven code modification
✅ Local-first
✅ Human-controlled
✅ Explainable

### Next Steps

This implementation provides the foundation for:
- Feature 3: Health Check Monitoring (not yet implemented)
- Feature 4: Recovery Engine (not yet implemented)
- Feature 5: AI Log Analysis (not yet implemented)

### License

Internal use only - SanjeevaniOps