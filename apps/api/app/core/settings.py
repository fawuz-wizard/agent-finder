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
    # set DATABASE_URL=postgresql+asyncpg://... for PostgreSQL.
    database_url: str = Field(default="sqlite+aiosqlite:///./agentfinder.db")
    operator_adapter: Literal["fake", "none"] = "fake"
    # When on, the operator's activity feed (position, last transaction) is the truth behind
    # every phrase and the agent is never asked to refresh capacity. Off for the pilot with
    # real agents, on for the demo build; on for real once the Orange Money feed is connected.
    operator_feed: bool = False
    # "week" (the default): the 7-day rule in services/week_rule.py: active days, the size
    # (cash out and cash in together), customer reports; never 100, 95 at best. Agents and
    # aggregators read it in words, never as a figure. "activity": the success probability
    # the older ranker computes (position or ledger, recency, failures, trust, distance).
    # "rules": the fixed order.
    # "learned": the customer still reads the 7-day rule's percentage, while weights learned
    # from real visits on the same 7-day facts order the agents (scripts.train_ranker says
    # when they beat the rule).
    ranker: Literal["activity", "rules", "week", "learned"] = "week"
    # The fixture network (one dealer, demo agents, PIN 1234) exists for the test suite. Unset
    # means: only in tests. A laptop or a server starts empty and is filled by the Orange import
    # (scripts/import_orange.py) or by registering agents in the app.
    seed_on_start: bool | None = None

    # Comma-separated in the environment; NoDecode stops pydantic-settings JSON-parsing it first.
    # Unset means the local dev servers in development, and a startup failure in production:
    # an API nobody can call from the browser is a misconfiguration, not a safe default.
    cors_origins: Annotated[list[str] | None, NoDecode] = None

    auth_mode: Literal["demo", "otp"] = "demo"

    # Error tracking (Sentry). Unset means off: nothing leaves the server. When set, only the
    # error, the route and the release are sent, never a body, header, query or person.
    sentry_dsn: str | None = None

    app_timezone: str = "Africa/Freetown"

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split_origins(cls, value: object) -> object:
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value

    # Key for the one-way code kept of a customer's number (HMAC-SHA256). Without a secret
    # key, the 10^8 possible numbers could be tried in seconds against a leaked database.
    customer_hash_key: str = Field(default="")

    # A secret mixed into every PIN hash (HMAC before PBKDF2). PINs are 4 to 6 digits, so a
    # salted hash alone falls in seconds to anyone holding a copy of the database or a backup;
    # with the pepper, kept only in the host's secret store, the copy is useless on its own.
    pin_pepper: str = Field(default="")

    # The load balancer's addresses (comma-separated IPs or CIDR ranges, e.g. 10.0.0.0/16).
    # Only a request from one of these may say, in X-Forwarded-For, who the real client is.
    # Unset: nobody is trusted and the direct peer is the client (a laptop, the tests).
    forwarded_allow_ips: Annotated[list[str] | None, NoDecode] = None

    @field_validator("forwarded_allow_ips", mode="before")
    @classmethod
    def _split_proxies(cls, value: object) -> object:
        if isinstance(value, str):
            return [item.strip() for item in value.split(",") if item.strip()] or None
        return value

    @model_validator(mode="after")
    def _defaults_by_environment(self) -> Settings:
        if self.seed_on_start is None:
            self.seed_on_start = self.app_env == "test"
        if self.cors_origins is None:
            if self.app_env == "production":
                raise ValueError(
                    "CORS_ORIGINS must be set in production: a comma-separated list of the "
                    "browser origins allowed to call the API, e.g. https://agentfinder.example"
                )
            # The web app's dev servers: 5173 customer, 5174 agent app (live), 5175 and 5177
            # the mock builds, 5176 and 5178 the LAN and phone-tunnel instances.
            hosts = ("localhost", "127.0.0.1")
            dev = [f"http://{h}:{port}" for port in range(5173, 5179) for h in hosts]
            self.cors_origins = [
                *dev,
                # The Android APK serves the same web build from these origins (Capacitor):
                # https://localhost normally, http://localhost for a hotspot demo build.
                "https://localhost",
                "http://localhost",
                "capacitor://localhost",
            ]
        if self.app_env in ("staging", "production"):
            self._refuse_unsafe_live_settings()
        return self

    def _refuse_unsafe_live_settings(self) -> None:
        """A live server (staging or production) refuses to start on a setting that would
        leave it open. Each message names the setting, never its value."""
        env = self.app_env
        if len(self.customer_hash_key) < 32:
            raise ValueError(
                f"CUSTOMER_HASH_KEY must be set in {env}: 32 or more random characters."
            )
        if len(self.pin_pepper) < 32:
            raise ValueError(f"PIN_PEPPER must be set in {env}: 32 or more random characters.")
        if self.seed_on_start:
            raise ValueError(
                f"SEED_ON_START must be false in {env}: the demo accounts' PINs are public."
            )
        if env == "production":
            if not self.forwarded_allow_ips:
                raise ValueError(
                    "FORWARDED_ALLOW_IPS must be set in production: the load balancer's address "
                    "range, so limits see each client's own address."
                )
            if "*" in self.forwarded_allow_ips:
                raise ValueError("FORWARDED_ALLOW_IPS must name the load balancer, not '*'.")
            # The Android app serves the web build from https://localhost (Capacitor), so that
            # one origin is allowed; a plain-http or wildcard origin is not.
            for origin in self.cors_origins or []:
                if origin == "*" or origin.startswith("http://"):
                    raise ValueError(
                        "CORS_ORIGINS in production may list only https:// origins "
                        "(and capacitor://localhost for the Android app)."
                    )

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()
