"""Admin-only operations views; break-glass reads are audited."""

from __future__ import annotations

from fastapi import APIRouter

router = APIRouter(prefix="/admin", tags=["admin"])

# Not mounted for the pilot (see router.py); the admin surface returns after the competition.
