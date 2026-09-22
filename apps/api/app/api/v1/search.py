"""Public. Transaction-relative nearby-agent search. Returns only the six phrases, a distance,
a freshness line and a maps URL — never a word, a range or a number tied to an agent."""

from __future__ import annotations

from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Header
from pydantic import BaseModel, Field, StringConstraints
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Agent
from app.db.session import get_session
from app.schemas.public.common import PublicModel
from app.services import usage
from app.services.phrasing import (
    AREA_POINTS,
    PUBLIC_TEXT,
    TRANSACTION_LABELS,
    amount_label,
    freshness_of,
    freshness_text,
    haversine_m,
    normalise_tx,
    now_utc,
    public_outcome,
)

router = APIRouter(prefix="/search", tags=["search"])

TIER = {"likely": 0, "limited": 1, "expired": 2, "not_set": 3, "closed": 4, "hidden": 5}
FRESH_TIER = {"fresh": 0, "aging": 1, "may_have_changed": 2, "expired": 3}


class SearchRequest(BaseModel):
    transaction: Literal["cash_out", "withdraw", "deposit", "send"]
    amount_sle: int | None = Field(default=None, ge=1, le=10_000_000)
    # Free text from the customer: trimmed, never empty, never longer than a street name.
    area: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=60)] = (
        "Lumley"
    )
    lat: float | None = None
    lng: float | None = None
    radius_m: int = Field(default=2000, ge=200, le=20_000)


class AgentResult(PublicModel):
    id: str
    name: str
    area: str
    distance_m: int
    outcome: str
    outcome_text: str
    freshness: str
    freshness_text: str
    why: str | None = None
    note: str | None = None
    directions_url: str
    can_call: bool


class QueryEcho(PublicModel):
    transaction: str
    transaction_label: str
    amount_sle: int | None
    amount_label: str | None
    area: str
    radius_m: int


class SearchResponse(PublicModel):
    query: QueryEcho
    recommended: list[AgentResult]
    closer_not_serving: list[AgentResult]
    results: list[AgentResult]
    total: int
    generated_at: str
    banner: str | None = None


def to_result(a: Agent, tx: str, amount: int | None, dist: int, now) -> AgentResult:
    out = public_outcome(a, tx, amount, now)
    return AgentResult(
        id=a.ref.replace("Agent ", "af-"),
        name=a.shop_name,
        area=a.street,
        distance_m=dist,
        outcome=out,
        outcome_text=PUBLIC_TEXT[out],
        freshness=freshness_of(a.declared_at, now),
        freshness_text=freshness_text(a.declared_at, now),
        directions_url=f"https://www.google.com/maps/dir/?api=1&destination={round(a.lat, 3)},{round(a.lng, 3)}",  # noqa: E501
        can_call=bool(a.phone_visible and a.phone),
    )


def origin_for(req: SearchRequest) -> tuple[float, float]:
    if req.lat is not None and req.lng is not None:
        # Blunt to ~110 m before use; the precise point is never stored or logged.
        return round(req.lat, 3), round(req.lng, 3)
    return AREA_POINTS.get(req.area, AREA_POINTS["Freetown"])


@router.post("", response_model=SearchResponse, summary="Rank nearby agents for one request")
async def search(
    req: SearchRequest,
    db: AsyncSession = Depends(get_session),
    x_client: str | None = Header(default=None),
) -> SearchResponse:
    now = now_utc()
    tx = normalise_tx(req.transaction)
    olat, olng = origin_for(req)
    agents = (await db.execute(select(Agent))).scalars().all()
    scored = []
    for a in agents:
        dist = haversine_m(olat, olng, a.lat, a.lng)
        if dist > req.radius_m and a.area != req.area:
            continue
        scored.append(to_result(a, tx, req.amount_sle, dist, now))
    scored.sort(key=lambda r: (TIER[r.outcome], FRESH_TIER[r.freshness], r.distance_m, r.id))

    likely = [r for r in scored if r.outcome == "likely"]
    recommended = []
    for i, r in enumerate(likely[:2]):
        r.why = (
            f"Nearest agent that can likely handle {amount_label(req.amount_sle) or 'your request'} right now."  # noqa: E501
            if i == 0
            else "Also likely able, a little further."
        )
        recommended.append(r)
    rec_ids = {r.id for r in recommended}
    top = recommended[0] if recommended else None
    closer = []
    if top:
        for r in sorted(
            (x for x in scored if x.id not in rec_ids and x.distance_m < top.distance_m),
            key=lambda x: x.distance_m,
        ):
            r.note = (
                f"May not cover {amount_label(req.amount_sle) or 'this request'} — worth asking if you are passing."  # noqa: E501
                if r.outcome == "limited"
                else "Status too old to rely on — worth asking if you are passing."
                if r.outcome == "expired"
                else "Closed right now."
                if r.outcome == "closed"
                else "Not available for this request."
            )
            closer.append(r)
    closer_ids = {r.id for r in closer}
    rest = [r for r in scored if r.id not in rec_ids and r.id not in closer_ids]
    nothing_fresh = bool(scored) and all(r.freshness == "expired" for r in scored)

    await usage.record(db, "search", "customer", x_client or "anonymous")
    await db.commit()

    return SearchResponse(
        query=QueryEcho(
            transaction=tx,
            transaction_label=TRANSACTION_LABELS[tx],
            amount_sle=req.amount_sle,
            amount_label=amount_label(req.amount_sle),
            area=req.area,
            radius_m=req.radius_m,
        ),
        recommended=recommended,
        closer_not_serving=closer,
        results=rest[: max(0, 10 - len(recommended) - len(closer))],
        total=len(scored),
        generated_at=now.isoformat(),
        banner="All nearby statuses are older than 4 hours — ask before you go."
        if nothing_fresh
        else None,
    )
