"""Public. Transaction-relative nearby-agent search. Returns only the six phrases, a distance,
a freshness line and a maps URL — never a word, a range or a number tied to an agent."""

from __future__ import annotations

import json
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Header
from pydantic import BaseModel, Field, StringConstraints
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.settings import get_settings
from app.db.models import Agent, SearchImpression
from app.db.session import get_session
from app.schemas.public.common import PublicModel
from app.services import usage
from app.services.ledger import ledgers_for
from app.services.phrasing import (
    AREA_POINTS,
    NETWORK_RANGES,
    PUBLIC_TEXT,
    TRANSACTION_LABELS,
    age_minutes,
    amount_band,
    amount_label,
    capacity_updated_at,
    freshness_of,
    freshness_text,
    haversine_m,
    normalise_tx,
    now_utc,
    public_outcome,
)
from app.services.ranker import current_model, features, probability
from app.services.trust import RANK_TIER, trust_for

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


def to_result(a: Agent, tx: str, amount: int | None, dist: int, now, ledger=None) -> AgentResult:
    out = public_outcome(a, tx, amount, now, ledger)
    updated = capacity_updated_at(a, ledger, now)
    source = ledger.feed_source if ledger is not None and ledger.live else None
    return AgentResult(
        id=a.ref.replace("Agent ", "af-"),
        name=a.shop_name,
        area=a.street,
        distance_m=dist,
        outcome=out,
        outcome_text=PUBLIC_TEXT[out],
        freshness=freshness_of(updated, now),
        freshness_text=freshness_text(updated, now, source),
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
    ledgers = await ledgers_for(db, agents, now)
    trust = await trust_for(db, agents, now)
    # Dealer-facing only: among agents who are all "likely", the one whose word has held up
    # goes first. It reorders; it never hides, and it never reaches the payload.
    rank = {a.ref.replace("Agent ", "af-"): RANK_TIER[trust[a.ref].label] for a in agents}
    by_activity = get_settings().ranker == "activity"
    model = await current_model(db) if by_activity else None
    scored = []
    prob: dict[str, float] = {}
    feats: dict[str, dict[str, float]] = {}
    for a in agents:
        dist = haversine_m(olat, olng, a.lat, a.lng)
        if dist > req.radius_m and a.area != req.area:
            continue
        ledger = ledgers.get(a.ref)
        r = to_result(a, tx, req.amount_sle, dist, now, ledger)
        scored.append(r)
        if model is not None and ledger is not None:
            t = trust[a.ref]
            side = ledger.side(tx)
            f = features(
                ceiling=side.ceiling(NETWORK_RANGES),
                amount=req.amount_sle,
                live=ledger.live,
                feed_age_min=ledger.feed_age_min,
                tx_last_hour=ledger.tx_last_hour,
                failed_today=ledger.failed_for_float_today if ledger.live else ledger.events,
                freshness_min=age_minutes(capacity_updated_at(a, ledger, now), now),
                distance_m=dist,
                trust_visits=t.visits,
                trust_matched=t.matched,
            )
            feats[r.id] = f
            prob[r.id] = probability(f, model.weights)
    if model is not None:
        # The phrase still gates: only "likely" agents are recommended. Within a phrase, the
        # order is the probability a visit succeeds, computed from activity, not from words.
        scored.sort(key=lambda r: (TIER[r.outcome], -prob.get(r.id, 0.0), r.distance_m, r.id))
    else:
        scored.sort(
            key=lambda r: (
                TIER[r.outcome],
                rank.get(r.id, 0),
                FRESH_TIER[r.freshness],
                r.distance_m,
                r.id,
            )
        )
    if model is not None:
        for r in scored[:10]:
            if r.id in feats:
                db.add(
                    SearchImpression(
                        at=now,
                        client_key=(x_client or "")[:64] or None,
                        agent_ref=r.id.replace("af-", "Agent "),
                        transaction=tx,
                        amount_band=amount_band(req.amount_sle),
                        features_json=json.dumps(feats[r.id]),
                        outcome_shown=r.outcome,
                        probability=prob[r.id],
                    )
                )
        await db.commit()

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
