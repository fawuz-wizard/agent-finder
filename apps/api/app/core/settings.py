"""Application settings. Every value comes from the environment (or .env);
nothing is hardcoded here."""

from __future__ import annotations

from functools import lru_cache
from typing import Annotated, Literal

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=(".env", "../../.env"), extra="ignore")

    app_env: Literal["development", "staging", "production", "test"] = "development"
    app_name: str = "agent-finder-api"
    app_version: str = "0.1.0"
    log_level: str = "INFO"

    # SQLite by default so the pilot runs on any laptop or a single Render dyno with a disk;
    # set DATABASE_URL=postgresql+asyncpg://... for Supabase/Postgres.
    database_url: str = Field(default="sqlite+aiosqlite:///./agentfinder.db")
    operator_adapter: Literal["fake", "none"] = "fake"
    # Demo dealer, demo agents, PIN 1234 everywhere. Unset means: yes on a laptop or in tests,
    # never in production, where the first boot must not plant demo PINs in a real database.
    seed_on_start: bool | None = None

    # Comma-separated in the environment; NoDecode stops pydantic-settings JSON-parsing it first.
    # Unset means the local dev servers in development, and a startup failure in production:
    # an API nobody can call from the browser is a misconfiguration, not a safe default.
    cors_origins: Annotated[list[str] | None, NoDecode] = None

    auth_mode: Literal["demo", "otp"] = "demo"
    supabase_url: str | None = None
    supabase_anon_key: str | None = None
    supabase_service_role_key: str | None = None
    supabase_jwt_secret: str | None = None

    app_timezone: str = "Africa/Freetown"

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split_origins(cls, value: object) -> object:
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value

    @model_validator(mode="after")
    def _defaults_by_environment(self) -> Settings:
        if self.seed_on_start is None:
            self.seed_on_start = self.app_env != "production"
        if self.cors_origins is None:
            if self.app_env == "production":
                raise ValueError(
                    "CORS_ORIGINS must be set in production: a comma-separated list of the "
                    "browser origins allowed to call the API, e.g. https://agentfinder.example"
                )
            self.cors_origins = ["http://localhost:5173", "http://127.0.0.1:5173"]
        return self

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()
