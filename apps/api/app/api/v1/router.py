"""Versioned API root. Each resource gets its own module; adding one is one line here."""

from __future__ import annotations

from fastapi import APIRouter

from app.api.v1 import agent_app, agents, auth, dealer, float_requests, reports, search
from app.core.settings import get_settings
from app.schemas.public.common import ApiInfo

RESOURCES = [
    "search",
    "agents",
    "reports",
    "auth",
    "agent",
    "float-requests",
    "dealer",
    "actions",
    "financial",
    "audit",
]

api_v1 = APIRouter(prefix="/api/v1")


@api_v1.get("", response_model=ApiInfo, tags=["meta"], summary="API version information")
async def api_info() -> ApiInfo:
    settings = get_settings()
    return ApiInfo(name=settings.app_name, version="v1", docs="/docs", resources=RESOURCES)


api_v1.include_router(search.router)
api_v1.include_router(agents.router)
api_v1.include_router(agent_app.router)
api_v1.include_router(float_requests.router)
api_v1.include_router(dealer.router)
api_v1.include_router(reports.router)
api_v1.include_router(auth.router)
# admin.router is not mounted for the pilot; the admin surface returns after the competition.
