"""Public agent detail, restated against the customer's own request."""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.search import AgentResult, Point, to_result
from app.core.errors import NotFoundError
from app.db.models import Agent
from app.db.session import get_session
from app.services.ledger import ledgers_for
from app.services.phrasing import (
    AREA_POINTS,
    TRANSACTION_LABELS,
    amount_label,
    haversine_m,
    normalise_tx,
    now_utc,
)

router = APIRouter(prefix="/agents", tags=["agents"])


class AgentDetail(AgentResult):
    request_label: str
    hours_text: str
    verified_label: str | None = None
    call_url: str | None = None
    # Where the distance was measured from, so the app can draw the way there.
    origin: Point


def ref_from_public_id(public_id: str) -> str:
    return public_id.replace("af-", "Agent ")


@router.get("/{public_id}", response_model=AgentDetail, summary="One agent, for one request")
async def agent_detail(
    public_id: str,
    transaction: Literal["cash_out", "withdraw", "deposit", "send"] | None = Query(default=None),
    amount_sle: int | None = Query(default=None, ge=1),
    lat: float | None = None,
    lng: float | None = None,
    db: AsyncSession = Depends(get_session),
) -> AgentDetail:
    a = (
        await db.execute(select(Agent).where(Agent.ref == ref_from_public_id(public_id)))
    ).scalar_one_or_none()
    if a is None:
        raise NotFoundError("We could not find that agent.")
    now = now_utc()
    tx = normalise_tx(transaction or "cash_out")
    olat, olng = (
        (round(lat, 3), round(lng, 3))
        if lat is not None and lng is not None
        else AREA_POINTS.get(a.area, AREA_POINTS["Freetown"])
    )
    ledger = (await ledgers_for(db, [a], now))[a.ref]
    base = to_result(a, tx, amount_sle, haversine_m(olat, olng, a.lat, a.lng), now, ledger)
    label = f"For {TRANSACTION_LABELS[tx]}" + (
        f" · {amount_label(amount_sle)}" if amount_sle else ""
    )
    return AgentDetail(
        **base.model_dump(),
        origin=Point(lat=olat, lng=olng),
        request_label=label,
        hours_text=a.hours_text,
        verified_label="Verified agent" if a.verified else None,
        call_url=f"tel:{a.phone}" if a.phone_visible and a.phone else None,
    )
