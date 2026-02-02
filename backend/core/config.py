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
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


# Global settings instance
settings = Settings()