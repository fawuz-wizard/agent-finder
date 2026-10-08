"""Public. Transaction-relative nearby-agent search. Returns only the six phrases, a distance,
a freshness line and a maps URL — never a word, a range or a number tied to an agent."""

from __future__ import annotations

import json
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Header
from pydantic import BaseModel, Field, StringConstraints
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.settings import get_settings
from app.db.models import Agent, OutcomeReport, SearchImpression
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

TIER = {
    "likely": 0,
    "unknown": 1,
    "limited": 2,
    "expired": 3,
    "not_set": 4,
    "closed": 5,
    "hidden": 6,
}
FRESH_TIER = {"fresh": 0, "aging": 1, "may_have_changed": 2, "expired": 3}
FALLBACK_RADIUS_M = 20_000


class SearchRequest(BaseModel):
    transaction: Literal["cash_out", "withdraw", "deposit", "send"]
    amount_sle: int | None = Field(default=None, ge=1, le=10_000_000)
    # Free text from the customer: trimmed, never empty, never longer than a street name.
    area: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=60)] = (
        "Lumley"
    )
    lat: float | None = None
    lng: float | None = None
    radius_m: int = Field(default=500, ge=500, le=500)


class Point(PublicModel):
    """A coarse point (~110 m): the agent's business point, or the origin the distance was
    measured from. Never a customer's precise location."""

    lat: float
    lng: float


class AgentResult(PublicModel):
    id: str
    name: str
    area: str
    # Coarse business point, so the app can draw the way there without leaving.
    lat: float
    lng: float
    distance_m: int
    outcome: str
    outcome_text: str
    freshness: str
    freshness_text: str
    why: str | None = None
    note: str | None = None
    directions_url: str
    can_call: bool
    rating_average: float | None = None
    rating_count: int = 0


class QueryEcho(PublicModel):
    transaction: str
    transaction_label: str
    amount_sle: int | None
    amount_label: str | None
    area: str
    radius_m: int
    # Where the distances were measured from: the blunted device point or the area centre.
    origin: Point


class SearchResponse(PublicModel):
    query: QueryEcho
    recommended: list[AgentResult]
    closer_not_serving: list[AgentResult]
    results: list[AgentResult]
    further_away: list[AgentResult] = Field(default_factory=list)
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
        lat=round(a.lat, 3),
        lng=round(a.lng, 3),
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


async def rating_summaries(
    db: AsyncSession, refs: list[str]
) -> dict[str, tuple[float | None, int]]:
    if not refs:
        return {}
    rows = await db.execute(
        select(
            OutcomeReport.agent_ref,
            func.avg(OutcomeReport.rating),
            func.count(OutcomeReport.rating),
        )
        .where(OutcomeReport.agent_ref.in_(refs), OutcomeReport.rating.is_not(None))
        .group_by(OutcomeReport.agent_ref)
    )
    # Suppress sparse ratings so one submission cannot define an agent's public score.
    return {
        ref: (round(float(avg), 1), int(count)) if count >= 3 else (None, 0)
        for ref, avg, count in rows
    }


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
        if dist > FALLBACK_RADIUS_M:
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

    # Keep the 500 m core separate from the wider fallback zone. Every visible open
    # core agent can appear in Nearest; farther options are returned only when no core
    # agent is a likely match, and are capped at two.
    open_visible = [r for r in scored if r.outcome not in ("closed", "hidden")]
    core_all = [r for r in open_visible if r.distance_m <= req.radius_m]
    core_nearest = sorted(core_all, key=lambda r: (r.distance_m, r.id))[:10]
    likely = [r for r in core_all if r.outcome == "likely"]
    likely.sort(
        key=lambda r: (
            -prob.get(r.id, 0.0),
            rank.get(r.id, 0),
            FRESH_TIER[r.freshness],
            r.distance_m,
            r.id,
        )
    )
    recommended = []
    for i, r in enumerate(likely[:2]):
        r.why = (
            f"Strong activity match for {amount_label(req.amount_sle) or 'your request'}; availability may change."  # noqa: E501
            if i == 0
            else "Another strong activity match nearby."
        )
        recommended.append(r)
    results = likely[2:10]
    closer = [r for r in core_nearest if r.outcome != "likely"]
    further_away = []
    if not likely:
        further_away = sorted(
            (r for r in open_visible if r.distance_m > req.radius_m),
            key=lambda r: (
                TIER[r.outcome],
                -prob.get(r.id, 0.0),
                FRESH_TIER[r.freshness],
                r.distance_m,
                r.id,
            ),
        )[:2]
    response_agents = {r.id: r for r in [*recommended, *results, *closer, *further_away]}
    ratings = await rating_summaries(
        db, [r.id.replace("af-", "Agent ") for r in response_agents.values()]
    )
    for r in response_agents.values():
        r.rating_average, r.rating_count = ratings.get(r.id.replace("af-", "Agent "), (None, 0))
    nothing_fresh = bool(open_visible) and all(r.freshness == "expired" for r in open_visible)

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
            origin=Point(lat=olat, lng=olng),
        ),
        recommended=recommended,
        closer_not_serving=closer,
        results=results,
        further_away=further_away,
        total=len(core_all) + len(further_away),
        generated_at=now.isoformat(),
        banner="All nearby statuses are older than 4 hours — ask before you go."
        if nothing_fresh
        else None,
    )
