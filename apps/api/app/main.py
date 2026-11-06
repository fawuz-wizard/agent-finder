"""FastAPI application factory."""

from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager, suppress

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from uvicorn.middleware.proxy_headers import ProxyHeadersMiddleware

from app.api.health import router as health_router
from app.api.v1.router import api_v1
from app.core.auth import wrap_legacy_hashes
from app.core.errors import register_error_handlers
from app.core.limits import prune_forever
from app.core.logging import configure_logging, get_logger
from app.core.middleware import RequestIdMiddleware, SecurityHeadersMiddleware
from app.core.monitoring import init_monitoring
from app.core.settings import Settings, get_settings
from app.db import models  # noqa: F401  (register tables)
from app.db.migrate import migrate
from app.db.session import dispose_engine, get_session_factory
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
    await migrate()
    if settings.seed_on_start:
        await seed_if_empty()
    async with get_session_factory()() as db:
        await wrap_legacy_hashes(db)
    pruner = asyncio.create_task(prune_forever(get_session_factory()))
    yield
    # Stopped and waited for before the engine closes, so no prune is left mid-query.
    pruner.cancel()
    with suppress(asyncio.CancelledError):
        await pruner
    await dispose_engine()
    log.info("shutdown")


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    configure_logging(settings.log_level)
    init_monitoring(settings)

    app = FastAPI(
        title="Agent Finder API",
        version=settings.app_version,
        description=DESCRIPTION,
        lifespan=lifespan,
        docs_url=None if settings.is_live else "/docs",
        redoc_url=None,
        openapi_url=None if settings.is_live else "/openapi.json",
    )
    app.state.settings = settings

    # Middleware order: outermost first. Request id must wrap everything so logs carry it.
    app.add_middleware(SecurityHeadersMiddleware, hsts=settings.is_live)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "X-Request-ID", "X-Client", "X-File-Name"],
        expose_headers=["X-Request-ID"],
    )
    app.add_middleware(RequestIdMiddleware)
    # Outermost: behind the load balancer, the client's own address comes from
    # X-Forwarded-For, believed only when the request arrives from FORWARDED_ALLOW_IPS.
    # Without it every phone would share the balancer's address and its limits.
    app.add_middleware(ProxyHeadersMiddleware, trusted_hosts=settings.forwarded_allow_ips or [])

    register_error_handlers(app)
    app.include_router(health_router)
    app.include_router(api_v1)
    return app


app = create_app()
