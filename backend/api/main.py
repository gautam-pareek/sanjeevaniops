"""
FastAPI application entry point.
Initializes the API server and registers routes.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from backend.core.config import settings
from backend.core.database import db
from backend.api.v1 import applications


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Lifespan event handler for startup and shutdown.
    Initializes database schema on startup.
    """
    # Startup: Run migrations
    try:
        db.execute_migration("migrations/001_initial_schema.sql")
        print("Database initialized successfully")
    except Exception as e:
        print(f"Database initialization failed: {e}")
        raise
    
    yield
    
    # Shutdown: Cleanup (if needed)
    print("Shutting down SanjeevaniOps API")


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="Local-first application reliability and recovery system",
    lifespan=lifespan
)

# CORS middleware for web dashboard
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register API routers
app.include_router(
    applications.router,
    prefix=settings.api_v1_prefix
)


@app.get("/")
def root():
    """Root endpoint - API health check."""
    return {
        "name": settings.app_name,
        "version": settings.app_version,
        "status": "operational"
    }


@app.get("/health")
def health_check():
    """Health check endpoint."""
    return {"status": "healthy"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "backend.api.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True
    )