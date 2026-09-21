from __future__ import annotations

from fastapi import APIRouter

from app.core.settings import get_settings
from app.schemas.public.common import HealthResponse

router = APIRouter(tags=["meta"])


@router.get("/health", response_model=HealthResponse, summary="Liveness check")
async def health() -> HealthResponse:
    settings = get_settings()
    return HealthResponse(
        status="ok",
        service=settings.app_name,
        version=settings.app_version,
        environment=settings.app_env,
    )
