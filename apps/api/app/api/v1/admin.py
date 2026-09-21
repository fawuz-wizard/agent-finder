"""Admin-only operations views; break-glass reads are audited."""

from __future__ import annotations

from fastapi import APIRouter

router = APIRouter(prefix="/admin", tags=["admin"])

# Endpoints are added in later stages. The router exists now so the API surface is stable.
