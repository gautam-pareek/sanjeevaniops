"""
Configuration management for SanjeevaniOps backend.
Loads settings from environment variables with sensible defaults.
"""

from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    """Application settings with environment variable support."""
    
    # Application metadata
    app_name: str = "SanjeevaniOps"
    app_version: str = "0.1.0"
    
    # API settings
    api_v1_prefix: str = "/api/v1"
    
    # Database settings
    database_url: str = "sqlite:///./sanjeevaniops.db"
    
    # Docker settings
    docker_socket: str = "unix://var/run/docker.sock"
    
    # System operator (default user for API operations)
    default_operator: str = "system"

    # Change ollama_model to switch AI models
    # gemma4:e2b requires 5.4GB — too large for 4GB VRAM
    # phi3:mini is 2.3GB — fits in 4GB VRAM with room to spare
    ollama_model: str = "phi3:mini"
    ollama_base_url: str = "http://localhost:11434"
    ollama_timeout: int = 120

    # Crash events older than this are automatically deleted (default: 24 hours)
    crash_event_retention_minutes: int = 1440

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


# Global settings instance
settings = Settings()