"""FastAPI application factory."""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.health import router as health_router
from app.api.v1.router import api_v1
from app.core.errors import register_error_handlers
from app.core.logging import configure_logging, get_logger
from app.core.middleware import RequestIdMiddleware, SecurityHeadersMiddleware
from app.core.settings import Settings, get_settings
from app.db import models  # noqa: F401  (register tables)
from app.db.base import Base
from app.db.session import dispose_engine, get_engine
from app.seed import seed_if_empty

log = get_logger("app")

DESCRIPTION = (
    "Agent Finder — a real-time mobile-money agent service availability network for "
    "Sierra Leone. Customers find an agent who can likely handle a specific transaction; "
    "agents share availability without ever exposing balances. Public endpoints never "
    "return capacity categories or thresholds."
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings: Settings = app.state.settings
    log.info("startup", extra={"extra": {"env": settings.app_env, "auth_mode": settings.auth_mode}})
    async with get_engine().begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    if settings.seed_on_start:
        await seed_if_empty()
    yield
    await dispose_engine()
    log.info("shutdown")


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    configure_logging(settings.log_level)

    app = FastAPI(
        title="Agent Finder API",
        version=settings.app_version,
        description=DESCRIPTION,
        lifespan=lifespan,
        docs_url=None if settings.is_production else "/docs",
        redoc_url=None,
        openapi_url=None if settings.is_production else "/openapi.json",
    )
    app.state.settings = settings

    # Middleware order: outermost first. Request id must wrap everything so logs carry it.
    app.add_middleware(SecurityHeadersMiddleware, hsts=settings.is_production)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "X-Request-ID", "X-Client"],
        expose_headers=["X-Request-ID"],
    )
    app.add_middleware(RequestIdMiddleware)

    register_error_handlers(app)
    app.include_router(health_router)
    app.include_router(api_v1)
    return app


app = create_app()
