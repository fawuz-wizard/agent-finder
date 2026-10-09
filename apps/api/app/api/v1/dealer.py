"""Dealer-only. Counts, register, agent detail, signals, actions, and the audited financial
read. Every response here is behind a named permission; money is masked unless revealed."""

from __future__ import annotations

import csv
import io
from datetime import UTC, date, datetime, timedelta
from typing import Literal

from fastapi import APIRouter, Depends
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.agent_app import declaration_of, float_out
from app.core.auth import Principal, require_permission, require_role
from app.core.errors import AppError, NotFoundError
from app.db.models import (
    Action,
    Agent,
    AgentTransaction,
    AuditLog,
    AvailabilityEvent,
    FloatRequest,
    OutcomeReport,
    SearchImpression,
    UsageEvent,
)
from app.db.session import get_session
from app.integrations.operator.base import get_operator
from app.services import usage
from app.services.forecast import forecast_counts, forecasts_for
from app.services.ledger import ledgers_for
from app.services.phrasing import (
    CAPACITY_LABEL,
    NETWORK_RANGES,
    PRESENCE_LABEL,
    age_minutes,
    age_text,
    capacity_updated_at,
    freshness_of,
    is_open_now,
    now_utc,
)
from app.services.trust import trust_for

router = APIRouter(tags=["dealer"])


async def my_agents(db: AsyncSession, dealer_id: str) -> list[Agent]:
    return (
        (await db.execute(select(Agent).where(Agent.dealer_id == dealer_id).order_by(Agent.ref)))
        .scalars()
        .all()
    )


SNOOZE_FOR = timedelta(hours=4)


def _aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=UTC)


def mute_until(action: str, at: datetime) -> datetime:
    """Snooze hides a signal for four hours, resolve for the rest of that day."""
    if action == "snooze":
        return at + SNOOZE_FOR
    return at.replace(hour=23, minute=59, second=59, microsecond=0)


async def active_mutes(db: AsyncSession, refs: list[str], now: datetime) -> set[str]:
    """Signal ids hidden by a snooze or resolve row on the action log that is still running.
    Nothing expires silently: the row stays on the log, only its effect ends."""
    rows = (
        (
            await db.execute(
                select(Action).where(
                    Action.agent_ref.in_(refs),
                    Action.action.in_(("snooze", "resolve")),
                    Action.signal_id.is_not(None),
                    Action.at >= now - SNOOZE_FOR,
                )
            )
        )
        .scalars()
        .all()
    )
    return {
        x.signal_id
        for x in rows
        if x.signal_id and mute_until(x.action, _aware(x.at)) > now >= _aware(x.at)
    }


async def signals_for(
    db: AsyncSession, agents: list[Agent], now, *, include_muted: bool = False
) -> list[dict]:
    """Rules 1–3 of the nine, computed from real events. Sentence + evidence + next action.
    A signal the dealer snoozed or resolved is left out until its time is up."""
    out = []
    start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    muted: set[str] = set()
    if agents and not include_muted:
        muted = await active_mutes(db, [a.ref for a in agents], now)
    trust = await trust_for(db, agents, now)
    ledgers = await ledgers_for(db, agents, now)
    for a in agents:
        call_url = f"tel:{a.phone}" if a.phone else None
        live = ledgers[a.ref].live
        t = trust[a.ref]
        if t.label == "unreliable":
            out.append(
                {
                    "id": f"sig-trust-{a.ref}",
                    "agent_ref": a.ref,
                    "agent_name": a.shop_name,
                    "call_url": call_url,
                    "severity": "high",
                    "title": "Status keeps failing customers",
                    "sentence": f'{t.failed} of {t.visits} customers told "likely" in the last 14 days could not be served for lack of money.',  # noqa: E501
                    "evidence": [
                        {"at_text": "14 days", "text": f"{t.matched} matched", "tag": "matched"},
                        {"at_text": "14 days", "text": f"{t.failed} failed", "tag": "failed"},
                    ],
                    "explanation": "Customers are still sent here, but after agents whose word has held up. A call usually finds a cash problem or a habit.",  # noqa: E501
                }
            )
        reps = (
            (
                await db.execute(
                    select(OutcomeReport).where(
                        OutcomeReport.agent_ref == a.ref,
                        OutcomeReport.answer == "no",
                        OutcomeReport.at >= start,
                    )
                )
            )
            .scalars()
            .all()
        )
        likely_but_failed = [r for r in reps if r.outcome_at_report == "likely"]
        if len(likely_but_failed) >= 2:
            out.append(
                {
                    "id": f"sig-mismatch-{a.ref}",
                    "agent_ref": a.ref,
                    "agent_name": a.shop_name,
                    "call_url": call_url,
                    "severity": "high",
                    "title": "Says available, customers say otherwise",
                    "sentence": f"{len(likely_but_failed)} customers reported a failed visit today while the status said they could likely be served.",  # noqa: E501
                    "evidence": [
                        {
                            "at_text": r.at.strftime("%H:%M"),
                            "text": f"{(r.transaction or 'visit').replace('_', ' ')} {r.amount_band or ''}".strip(),  # noqa: E501
                            "tag": (r.reason_code or "could not complete").replace("_", " "),
                        }
                        for r in likely_but_failed[:4]
                    ],
                    "explanation": "The declaration may be higher than what is in the drawer. A nudge to update usually resolves it.",  # noqa: E501
                }
            )
        if a.presence == "hidden" and a.open_hour <= now.hour < a.close_hour:
            hides = (
                await db.execute(
                    select(func.count())
                    .select_from(AvailabilityEvent)
                    .where(
                        AvailabilityEvent.agent_ref == a.ref,
                        AvailabilityEvent.kind == "hide",
                        AvailabilityEvent.at >= now - timedelta(days=5),
                    )
                )
            ).scalar_one()
            out.append(
                {
                    "id": f"sig-hidden-{a.ref}",
                    "agent_ref": a.ref,
                    "agent_name": a.shop_name,
                    "call_url": call_url,
                    "severity": "medium",
                    "title": "Hidden during business hours",
                    "sentence": f"Hidden right now, during operating hours. {int(hides)} hide events in the last five days.",  # noqa: E501
                    "evidence": [{"at_text": "Now", "text": "hidden", "tag": "hidden"}],
                    "explanation": "Often a cash shortage. Check whether a float request is waiting.",  # noqa: E501
                }
            )
        updated = capacity_updated_at(a, ledgers[a.ref], now)
        if not live and freshness_of(updated, now) == "expired":
            mins = age_minutes(updated, now)
            out.append(
                {
                    "id": f"sig-stale-{a.ref}",
                    "agent_ref": a.ref,
                    "agent_name": a.shop_name,
                    "call_url": call_url,
                    "severity": "low",
                    "title": "Status expired",
                    "sentence": f"Last declaration {age_text(mins)}. Customers are not being sent to this agent.",  # noqa: E501
                    "evidence": [
                        {"at_text": age_text(mins), "text": "last declaration", "tag": "expired"}
                    ],
                    "explanation": None,
                }
            )
    return [s for s in out if s["id"] not in muted]


BUCKETS = ("active", "limited", "hidden", "closed")


def capacity_text(ledger) -> str:
    """What the evidence says this agent usually covers, per side. Dealer-facing; the
    words are gone from every screen, this is what replaces them."""
    if ledger is None:
        return "No record yet"
    parts = []
    for label, side in (("Cash", ledger.cash), ("Deposit", ledger.float)):
        if not side.known:
            parts.append(f"{label}: no record")
            continue
        c = side.ceiling(NETWORK_RANGES)
        parts.append(f"{label}: any amount" if c is None else f"{label} up to ~SLE {c:,}")
    return " · ".join(parts)


def bucket_of(a: Agent, now: datetime, ledger=None) -> str:
    """The one bucket an agent is in right now. The dashboard tiles count these and the
    register filters by them, from this single function, so the two can never disagree.
    With the operator feed live, the word and the freshness come from the feed."""
    live = ledger is not None and ledger.live
    word = ledger.cash.word if live else a.cash_out
    if a.presence == "hidden":
        return "hidden"
    if (
        a.lat is None
        or a.lng is None
        or not a.active
        or a.presence == "closed"
        or not is_open_now(a, now)
        or (not live and freshness_of(capacity_updated_at(a, ledger, now), now) == "expired")
    ):
        return "closed"
    if word in ("none", "small"):
        return "limited"
    return "active"


@router.get("/dealer/overview", summary="What is happening with all my agents")
async def overview(
    p: Principal = Depends(require_role("dealer")), db: AsyncSession = Depends(get_session)
) -> dict:
    now = now_utc()
    agents = await my_agents(db, p.subject)
    ledgers = await ledgers_for(db, agents, now)
    counts = {b: 0 for b in BUCKETS}
    for a in agents:
        counts[bucket_of(a, now, ledgers.get(a.ref))] += 1
    pending = (
        (
            await db.execute(
                select(FloatRequest)
                .where(FloatRequest.dealer_id == p.subject, FloatRequest.state == "pending")
                .order_by(FloatRequest.requested_at)
            )
        )
        .scalars()
        .all()
    )
    names = {a.ref: a.shop_name for a in agents}
    return {
        "dealer_name": p.name,
        "agent_count": len(agents),
        "counts": counts,
        "float_requests": [
            float_out(r, names.get(r.agent_ref, r.agent_ref), now).model_dump() for r in pending
        ],
        "signals": await signals_for(db, agents, now),
        "forecast_counts": forecast_counts(await forecasts_for(db, agents, now)),
    }


@router.get(
    "/dealer/forecast",
    summary="Who will probably run short of cash by tomorrow — a ranking with reasons, never a balance",  # noqa: E501
)
async def forecast(
    p: Principal = Depends(require_permission("VIEW_AGENT")),
    db: AsyncSession = Depends(get_session),
) -> list[dict]:
    now = now_utc()
    return await forecasts_for(db, await my_agents(db, p.subject), now)


@router.get("/dealer/agents", summary="Agent register")
async def agents_list(
    p: Principal = Depends(require_permission("VIEW_AGENT")),
    db: AsyncSession = Depends(get_session),
) -> list[dict]:
    now = now_utc()
    rows = []
    agents = await my_agents(db, p.subject)
    trust = await trust_for(db, agents, now)
    ledgers = await ledgers_for(db, agents, now)
    for a in agents:
        ledger = ledgers.get(a.ref)
        d = declaration_of(a, now, ledger)
        problems = (
            await db.execute(
                select(func.count())
                .select_from(OutcomeReport)
                .where(
                    OutcomeReport.agent_ref == a.ref,
                    OutcomeReport.answer == "no",
                    OutcomeReport.at >= now.replace(hour=0, minute=0, second=0, microsecond=0),
                )
            )
        ).scalar_one()
        rows.append(
            {
                "ref": a.ref,
                "name": a.shop_name,
                "area": a.street,
                "presence": a.presence,
                "presence_text": PRESENCE_LABEL[a.presence],
                "bucket": bucket_of(a, now, ledger),
                "declaration_text": f"{CAPACITY_LABEL.get(d.cash_out, '—')} / {CAPACITY_LABEL.get(d.deposit, '—')}",  # noqa: E501
                "capacity_text": capacity_text(ledger),
                "capacity_source": d.capacity_source,
                "freshness_text": age_text(d.age_min if d.age_min < 10**6 else None),
                "attention": int(problems) > 1
                or d.freshness == "expired"
                or a.presence == "hidden"
                or trust[a.ref].label == "unreliable",
                "reliability": trust[a.ref].as_dict(),
                "located": a.lat is not None and a.lng is not None,
                "active": a.active,
                "region": a.region,
                "city": a.city,
                "source": a.source,
            }
        )
    return rows


@router.get("/dealer/agents/{ref}", summary="One agent's day, money masked")
async def agent_detail(
    ref: str,
    p: Principal = Depends(require_permission("VIEW_AGENT")),
    db: AsyncSession = Depends(get_session),
) -> dict:
    now = now_utc()
    a = (
        await db.execute(select(Agent).where(Agent.ref == ref, Agent.dealer_id == p.subject))
    ).scalar_one_or_none()
    if a is None:
        raise NotFoundError("Not available.")
    start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    tx = await get_operator().transactions_today(a.ref)
    found = (
        await db.execute(
            select(func.count())
            .select_from(UsageEvent)
            .where(
                UsageEvent.kind == "directions",
                UsageEvent.agent_ref == a.ref,
                UsageEvent.at >= start,
            )
        )
    ).scalar_one()
    problems = (
        await db.execute(
            select(func.count())
            .select_from(OutcomeReport)
            .where(
                OutcomeReport.agent_ref == a.ref,
                OutcomeReport.answer == "no",
                OutcomeReport.at >= start,
            )
        )
    ).scalar_one()
    pending = (
        await db.execute(
            select(FloatRequest).where(
                FloatRequest.agent_ref == a.ref, FloatRequest.state == "pending"
            )
        )
    ).scalar_one_or_none()
    ev = (
        (
            await db.execute(
                select(AvailabilityEvent)
                .where(AvailabilityEvent.agent_ref == a.ref, AvailabilityEvent.at >= start)
                .order_by(AvailabilityEvent.at)
            )
        )
        .scalars()
        .all()
    )
    sigs = [s for s in await signals_for(db, [a], now)]
    trust = (await trust_for(db, [a], now))[a.ref]
    ledger = (await ledgers_for(db, [a], now))[a.ref]
    return {
        "ref": a.ref,
        "name": a.person_name,
        "shop_name": a.shop_name,
        "area": a.street,
        "declaration": declaration_of(a, now, ledger).model_dump(),
        "reliability": trust.as_dict(),
        "capacity_text": capacity_text(ledger),
        "usual": _usual_of(a),
        "evidence": {
            "cash": {"source": ledger.cash.evidence_source, "text": ledger.cash.evidence_text},
            "float": {"source": ledger.float.evidence_source, "text": ledger.float.evidence_text},
        },
        "today": {
            "transactions": tx.get("transactions"),
            "successful": tx.get("successful"),
            "found_you": int(found),
            "reported_problems": int(problems),
        },
        "pending_float": float_out(pending, a.shop_name, now).model_dump() if pending else None,
        "availability_today": [
            {
                "time_text": e.at.strftime("%H:%M"),
                "text": "Hidden"
                if e.kind == "hide"
                else f"{e.presence.capitalize()} · {CAPACITY_LABEL.get(e.cash_out or '', '—')} · {CAPACITY_LABEL.get(e.deposit or '', '—')}",  # noqa: E501
                "tone": "warning" if e.kind == "hide" else "neutral",
            }
            for e in ev
        ],
        "open_signals": len(sigs),
        "located": a.lat is not None and a.lng is not None,
        "active": a.active,
        "region": a.region,
        "city": a.city,
        "agent_code": a.agent_code,
        "source": a.source,
    }


class UsualBody(BaseModel):
    """The dealer's note: what this agent usually handles, until the operator's records
    replace it. Never shown to customers; it only sets what amounts read as likely."""

    usual_max_sle: int | None = Field(default=None, ge=0, le=10_000_000)
    usual_float_max_sle: int | None = Field(default=None, ge=0, le=10_000_000)
    usual_daily_transactions: int | None = Field(default=None, ge=0, le=10_000)


@router.put("/dealer/agents/{ref}/usual", summary="What this agent usually handles — my note")
async def set_usual(
    ref: str,
    body: UsualBody,
    p: Principal = Depends(require_permission("VIEW_AGENT")),
    db: AsyncSession = Depends(get_session),
) -> dict:
    a = (
        await db.execute(select(Agent).where(Agent.ref == ref, Agent.dealer_id == p.subject))
    ).scalar_one_or_none()
    if a is None:
        raise NotFoundError("Not available.")
    a.usual_max_sle = body.usual_max_sle
    a.usual_float_max_sle = body.usual_float_max_sle
    a.usual_daily_transactions = body.usual_daily_transactions
    db.add(
        Action(
            at=now_utc(),
            actor=p.name,
            agent_ref=a.ref,
            action="contact",
            note=f"{p.name} noted what {a.shop_name} usually handles",
        )
    )
    await db.commit()
    return _usual_of(a)


def _usual_of(a: Agent) -> dict:
    return {
        "usual_max_sle": a.usual_max_sle,
        "usual_float_max_sle": a.usual_float_max_sle,
        "usual_daily_transactions": a.usual_daily_transactions,
    }


class ActionBody(BaseModel):
    agent: str = Field(max_length=60)
    action: Literal["contact", "call", "nudge", "escalate", "snooze", "resolve"]
    # Required for snooze and resolve: the signal row this action takes off my queue.
    signal_id: str | None = Field(default=None, min_length=5, max_length=80)


PERM_FOR_ACTION = {
    "contact": "CONTACT_AGENT",
    "call": "CONTACT_AGENT",
    "nudge": "CONTACT_AGENT",
    "escalate": "ESCALATE_AGENT",
    "snooze": "CONTACT_AGENT",
    "resolve": "CONTACT_AGENT",
}

MUTE_ACTIONS = ("snooze", "resolve")


@router.post(
    "/actions",
    status_code=201,
    summary="Contact · Call · Nudge · Escalate · Snooze · Resolve — logged, never a status change",
)
async def act(
    body: ActionBody,
    p: Principal = Depends(require_role("dealer")),
    db: AsyncSession = Depends(get_session),
) -> dict:
    if not p.can(PERM_FOR_ACTION[body.action]):
        raise NotFoundError("Not available.")
    a = (
        await db.execute(select(Agent).where(Agent.ref == body.agent, Agent.dealer_id == p.subject))
    ).scalar_one_or_none()
    if a is None:
        raise NotFoundError("Not available.")
    now = now_utc()
    signal_id: str | None = None
    until: datetime | None = None
    if body.action in MUTE_ACTIONS:
        if not body.signal_id:
            raise AppError("Choose a signal to snooze or resolve.", code="signal_required")
        # Signal ids are "sig-<rule>-<agent ref>": it must be this agent's and still live.
        live = {s["id"]: s for s in await signals_for(db, [a], now)}
        sig = live.get(body.signal_id)
        if sig is None:
            raise NotFoundError("Not available.")
        signal_id = body.signal_id
        until = mute_until(body.action, now)
        note = (
            f'{p.name} snoozed "{sig["title"]}" for {a.shop_name} until {until.strftime("%H:%M")}'
            if body.action == "snooze"
            else f'{p.name} resolved "{sig["title"]}" for {a.shop_name} for today'
        )
    else:
        note = {
            "contact": f"{p.name} contacted {a.shop_name}",
            "call": f"{p.name} called {a.shop_name}",
            "nudge": f"{p.name} asked {a.shop_name} to update their status",
            "escalate": f"{p.name} escalated {a.shop_name} to the super distributor",
        }[body.action]
    row = Action(
        at=now, actor=p.name, agent_ref=a.ref, action=body.action, note=note, signal_id=signal_id
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return {
        "id": str(row.id),
        "action": body.action,
        "agent_ref": a.ref,
        "at": _aware(row.at).isoformat(),
        "note": note,
        "signal_id": signal_id,
        "until": until.isoformat() if until else None,
    }


@router.get("/actions", summary="Actions I have taken")
async def actions(
    agent: str | None = None,
    p: Principal = Depends(require_role("dealer")),
    db: AsyncSession = Depends(get_session),
) -> list[dict]:
    q = select(Action).where(Action.actor == p.name).order_by(Action.at.desc())
    if agent:
        q = q.where(Action.agent_ref == agent)
    return [
        {
            "id": str(x.id),
            "action": x.action,
            "agent_ref": x.agent_ref,
            "at": _aware(x.at).isoformat(),
            "note": x.note,
            "signal_id": x.signal_id,
        }
        for x in (await db.execute(q)).scalars().all()
    ]


class FinancialBody(BaseModel):
    field: Literal["balance", "float"]
    purpose: str = Field(min_length=3, max_length=160)


@router.post(
    "/financial/{ref}", summary="Reveal one operator-owned value for 60 seconds — audited first"
)
async def reveal(
    ref: str,
    body: FinancialBody,
    p: Principal = Depends(require_permission("VIEW_AGENT_FINANCIAL_DETAIL")),
    db: AsyncSession = Depends(get_session),
) -> dict:
    a = (
        await db.execute(select(Agent).where(Agent.ref == ref, Agent.dealer_id == p.subject))
    ).scalar_one_or_none()
    if a is None:
        raise NotFoundError("Not available.")
    # The audit row is committed BEFORE the value is fetched, so no read can happen unrecorded.
    db.add(
        AuditLog(
            actor=p.name,
            permission="VIEW_AGENT_FINANCIAL_DETAIL",
            agent_ref=a.ref,
            field=body.field,
            purpose=body.purpose.strip(),
        )
    )
    await db.commit()
    op = get_operator()
    v = await (op.balance(a.ref) if body.field == "balance" else op.float_position(a.ref))
    if v is None:
        raise AppError(
            "That value is not available for this agent.", code="not_connected", status_code=409
        )
    return v.model_dump()


@router.get("/audit", summary="My financial reveals — field and purpose, never the value")
async def audit(
    p: Principal = Depends(require_role("dealer")), db: AsyncSession = Depends(get_session)
) -> list[dict]:
    rows = (
        (
            await db.execute(
                select(AuditLog).where(AuditLog.actor == p.name).order_by(AuditLog.at.desc())
            )
        )
        .scalars()
        .all()
    )
    return [
        {
            "id": str(x.id),
            "at": x.at.isoformat(),
            "actor": x.actor,
            "agent_ref": x.agent_ref,
            "field": x.field,
            "purpose": x.purpose,
        }
        for x in rows
    ]


@router.get("/dealer/usage", summary="Pilot usage — how many real people have used this")
async def usage_summary(
    p: Principal = Depends(require_role("dealer")), db: AsyncSession = Depends(get_session)
) -> dict:
    return await usage.summary(db)


# ---- Registration: the dealer brings an agent onto the platform ----------------------------
#
# Registration never depends on Orange's file. A dealer registers any agent they work with —
# shop, person, agent number, a coarse location, hours, phone, the initial PIN and a note of
# what the agent usually handles. `verified` is the dealer's own statement that the agent was
# checked against Orange's records; it is the only thing that shows customers the badge. The
# words are not asked: what the agent can cover comes from the note, and later from history.

SL_LAT = (6.8, 10.1)
SL_LNG = (-13.5, -10.2)
TIME_RE = r"^(?:[01]\d|2[0-3]):[0-5]\d$"


class RegisterBody(BaseModel):
    # "Agent 101" or just "101"; left out, the next free number is assigned.
    ref: str | None = Field(default=None, max_length=20)
    person_name: str = Field(min_length=1, max_length=120)
    shop_name: str = Field(min_length=1, max_length=120)
    area: str = Field(min_length=1, max_length=80)
    street: str = Field(min_length=1, max_length=120)
    lat: float
    lng: float
    phone: str | None = Field(default=None, max_length=32, pattern=r"^\+?[0-9 ]{6,20}$")
    phone_visible: bool = False
    open_time: str = Field(default="07:00", pattern=TIME_RE)
    close_time: str = Field(default="20:00", pattern=TIME_RE)
    pin: str = Field(min_length=4, max_length=6, pattern=r"^[0-9]+$")
    usual_max_sle: int | None = Field(default=None, ge=0, le=10_000_000)
    usual_float_max_sle: int | None = Field(default=None, ge=0, le=10_000_000)
    usual_daily_transactions: int | None = Field(default=None, ge=0, le=10_000)
    # "I checked this agent against Orange's record." Shows customers the badge; nothing else.
    verified: bool = False


class EditBody(BaseModel):
    person_name: str | None = Field(default=None, min_length=1, max_length=120)
    shop_name: str | None = Field(default=None, min_length=1, max_length=120)
    area: str | None = Field(default=None, min_length=1, max_length=80)
    street: str | None = Field(default=None, min_length=1, max_length=120)
    lat: float | None = None
    lng: float | None = None
    phone: str | None = Field(default=None, max_length=32, pattern=r"^\+?[0-9 ]{6,20}$")
    phone_visible: bool | None = None
    open_time: str | None = Field(default=None, pattern=TIME_RE)
    close_time: str | None = Field(default=None, pattern=TIME_RE)
    verified: bool | None = None


class PinBody(BaseModel):
    pin: str = Field(min_length=4, max_length=6, pattern=r"^[0-9]+$")


def normalise_ref(raw: str) -> str:
    v = raw.strip()
    if v.lower().startswith("agent "):
        v = v[6:].strip()
    if not v.isdigit() or not 1 <= len(v) <= 6:
        raise AppError("The agent number must be digits, e.g. 101.", code="invalid_ref")
    return f"Agent {v.zfill(3)}"


def check_point(lat: float, lng: float) -> None:
    if not (SL_LAT[0] <= lat <= SL_LAT[1] and SL_LNG[0] <= lng <= SL_LNG[1]):
        raise AppError(
            "That location is outside Sierra Leone. Check the latitude and longitude.",
            code="invalid_location",
        )


def _hours(open_time: str, close_time: str) -> tuple[int, int]:
    from app.services.schedule import parse_hhmm

    o, c = parse_hhmm(open_time), parse_hhmm(close_time)
    if o >= c:
        raise AppError("Opening time must be before closing time.", code="invalid_hours")
    return o, c


async def next_free_ref(db: AsyncSession) -> str:
    refs = (await db.execute(select(Agent.ref))).scalars().all()
    numbers = [int(r[6:]) for r in refs if r.startswith("Agent ") and r[6:].isdigit()]
    # Pilot registrations start at 101, clear of the seeded 0xx numbers.
    return f"Agent {(max([*numbers, 100]) + 1):03d}"


def registered_out(a: Agent, now: datetime) -> dict:
    from app.services import schedule

    return {
        "ref": a.ref,
        "public_id": a.ref.replace("Agent ", "af-"),
        "person_name": a.person_name,
        "shop_name": a.shop_name,
        "area": a.area,
        "street": a.street,
        "lat": a.lat,
        "lng": a.lng,
        "located": a.lat is not None and a.lng is not None,
        "active": a.active,
        "region": a.region,
        "city": a.city,
        "agent_code": a.agent_code,
        "phone": a.phone,
        "phone_visible": a.phone_visible,
        "hours_text": schedule.hours_text(a, now),
        "verified": a.verified,
        "usual": _usual_of(a),
        "next_step": (
            "Give the agent their number and PIN. Customers see the shop once the agent signs "
            "in and sets Open."
        ),
    }


@router.post(
    "/dealer/agents",
    status_code=201,
    summary="Register an agent under me — any agent, whether or not Orange's file has them",
)
async def register_agent(
    body: RegisterBody,
    p: Principal = Depends(require_permission("MANAGE_AGENT")),
    db: AsyncSession = Depends(get_session),
) -> dict:
    from app.core.auth import hash_pin
    from app.services import schedule

    now = now_utc()
    check_point(body.lat, body.lng)
    o, c = _hours(body.open_time, body.close_time)
    ref = normalise_ref(body.ref) if body.ref else await next_free_ref(db)
    if (await db.execute(select(Agent.ref).where(Agent.ref == ref))).first():
        raise AppError(f"{ref} is already registered.", code="exists", status_code=409)
    a = Agent(
        ref=ref,
        dealer_id=p.subject,
        person_name=body.person_name.strip(),
        shop_name=body.shop_name.strip(),
        area=body.area.strip(),
        street=body.street.strip(),
        lat=round(body.lat, 5),
        lng=round(body.lng, 5),
        phone=body.phone.replace(" ", "") if body.phone else None,
        phone_visible=body.phone_visible,
        verified=body.verified,
        pin_hash=hash_pin(body.pin, ref),
        presence="open",
        open_hour=o // 60,
        close_hour=max(o // 60 + 1, c // 60),
        usual_max_sle=body.usual_max_sle,
        usual_float_max_sle=body.usual_float_max_sle,
        usual_daily_transactions=body.usual_daily_transactions,
        night_mode=True,
    )
    schedule.set_weekly(a, {d: [body.open_time, body.close_time] for d in schedule.DAYS})
    db.add(a)
    db.add(
        Action(
            at=now,
            actor=p.name,
            agent_ref=ref,
            action="register",
            note=f"{p.name} registered {a.shop_name} as {ref}"
            + (" · checked against Orange's record" if body.verified else ""),
        )
    )
    await usage.record(db, "register", "dealer", p.subject, ref)
    await db.commit()
    return registered_out(a, now)


@router.put("/dealer/agents/{ref}", summary="Correct an agent's record, location or hours")
async def edit_agent(
    ref: str,
    body: EditBody,
    p: Principal = Depends(require_permission("MANAGE_AGENT")),
    db: AsyncSession = Depends(get_session),
) -> dict:
    from app.services import schedule

    now = now_utc()
    a = (
        await db.execute(select(Agent).where(Agent.ref == ref, Agent.dealer_id == p.subject))
    ).scalar_one_or_none()
    if a is None:
        raise NotFoundError("Not available.")
    if (body.lat is None) != (body.lng is None):
        raise AppError("Give both latitude and longitude.", code="invalid_location")
    if body.lat is not None and body.lng is not None:
        check_point(body.lat, body.lng)
        a.lat, a.lng = round(body.lat, 5), round(body.lng, 5)
    if (body.open_time is None) != (body.close_time is None):
        raise AppError("Give both opening and closing time.", code="invalid_hours")
    if body.open_time and body.close_time:
        o, c = _hours(body.open_time, body.close_time)
        a.open_hour, a.close_hour = o // 60, max(o // 60 + 1, c // 60)
        schedule.set_weekly(a, {d: [body.open_time, body.close_time] for d in schedule.DAYS})
    for name in ("person_name", "shop_name", "area", "street"):
        v = getattr(body, name)
        if v is not None:
            setattr(a, name, v.strip())
    if body.phone is not None:
        a.phone = body.phone.replace(" ", "") or None
    if body.phone_visible is not None:
        a.phone_visible = body.phone_visible
    if body.verified is not None:
        a.verified = body.verified
    db.add(
        Action(
            at=now,
            actor=p.name,
            agent_ref=a.ref,
            action="register",
            note=f"{p.name} updated {a.shop_name}'s record",
        )
    )
    await db.commit()
    return registered_out(a, now)


@router.post("/dealer/agents/{ref}/pin", summary="Set a new PIN for an agent under me")
async def reset_pin(
    ref: str,
    body: PinBody,
    p: Principal = Depends(require_permission("MANAGE_AGENT")),
    db: AsyncSession = Depends(get_session),
) -> dict:
    from app.core.auth import hash_pin

    a = (
        await db.execute(select(Agent).where(Agent.ref == ref, Agent.dealer_id == p.subject))
    ).scalar_one_or_none()
    if a is None:
        raise NotFoundError("Not available.")
    a.pin_hash = hash_pin(body.pin, a.ref)
    db.add(
        Action(
            at=now_utc(),
            actor=p.name,
            agent_ref=a.ref,
            action="register",
            note=f"{p.name} set a new PIN for {a.shop_name}",
        )
    )
    await db.commit()
    return {"ref": a.ref, "pin_set": True}


# ---- Report and records: what the team studies, what Orange asked to export ------------------
#
# The Global Report of the Orange meeting, at the dealer's level for the pilot: one row per
# agent with status, location, region, activity today and reliability — never a balance. The
# records exports are the pilot's event tables for this dealer's agents, as CSV, with nothing
# that identifies a customer (no device keys, no free-text comments) and nothing financial.


def _csv(rows: list[dict], filename: str) -> Response:
    buf = io.StringIO()
    if rows:
        w = csv.DictWriter(buf, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)
    return Response(
        content=buf.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


async def report_rows(db: AsyncSession, p: Principal, now: datetime) -> list[dict]:
    agents = await my_agents(db, p.subject)
    trust = await trust_for(db, agents, now)
    ledgers = await ledgers_for(db, agents, now)
    start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    rows = []
    for a in agents:
        ledger = ledgers.get(a.ref)
        d = declaration_of(a, now, ledger)
        counts = await count_today(db, a.ref, start)
        rows.append(
            {
                "agent_ref": a.ref,
                "agent_code": a.agent_code or "",
                "shop_name": a.shop_name,
                "region": a.region or "",
                "city": a.city or "",
                "street": a.street,
                "located": a.lat is not None and a.lng is not None,
                "active_at_orange": a.active,
                "verified": a.verified,
                "source": a.source,
                "presence": a.presence,
                "bucket": bucket_of(a, now, ledger),
                "capacity": capacity_text(ledger),
                "status_age_min": d.age_min if d.age_min < 10**6 else "",
                "reliability": trust[a.ref].label,
                "found_you_today": counts["found"],
                "reported_problems_today": counts["problems"],
                "logged_transactions_today": counts["logged"],
                "orange_april_cash_in": a.orange_cash_in if a.orange_cash_in is not None else "",
                "orange_april_cash_out": a.orange_cash_out if a.orange_cash_out is not None else "",
                "orange_april_tx_count": a.orange_tx_count if a.orange_tx_count is not None else "",
            }
        )
    return rows


async def count_today(db: AsyncSession, ref: str, start: datetime) -> dict[str, int]:
    found = (
        await db.execute(
            select(func.count())
            .select_from(UsageEvent)
            .where(
                UsageEvent.kind == "directions", UsageEvent.agent_ref == ref, UsageEvent.at >= start
            )
        )
    ).scalar_one()
    problems = (
        await db.execute(
            select(func.count())
            .select_from(OutcomeReport)
            .where(
                OutcomeReport.agent_ref == ref,
                OutcomeReport.answer == "no",
                OutcomeReport.at >= start,
            )
        )
    ).scalar_one()
    logged = (
        await db.execute(
            select(func.count())
            .select_from(AgentTransaction)
            .where(AgentTransaction.agent_ref == ref, AgentTransaction.at >= start)
        )
    ).scalar_one()
    return {"found": int(found), "problems": int(problems), "logged": int(logged)}


@router.get(
    "/dealer/report",
    summary="The Global Report for my agents — status, location, activity, never money",
)
async def dealer_report(
    p: Principal = Depends(require_permission("VIEW_AGENT")),
    db: AsyncSession = Depends(get_session),
) -> dict:
    now = now_utc()
    rows = await report_rows(db, p, now)
    by_region: dict[str, int] = {}
    by_bucket: dict[str, int] = {}
    for r in rows:
        by_region[r["region"] or "unknown"] = by_region.get(r["region"] or "unknown", 0) + 1
        by_bucket[r["bucket"]] = by_bucket.get(r["bucket"], 0) + 1
    return {
        "generated_at": now.isoformat(),
        "dealer": p.name,
        "agents": len(rows),
        "located": sum(1 for r in rows if r["located"]),
        "active_at_orange": sum(1 for r in rows if r["active_at_orange"]),
        "by_region": by_region,
        "by_bucket": by_bucket,
        "rows": rows,
    }


@router.get("/dealer/report.csv", summary="The same report as a CSV file")
async def dealer_report_csv(
    p: Principal = Depends(require_permission("VIEW_AGENT")),
    db: AsyncSession = Depends(get_session),
) -> Response:
    now = now_utc()
    return _csv(await report_rows(db, p, now), f"agent-report-{date.today().isoformat()}.csv")


RECORD_KINDS = ("searches", "reports", "transactions", "actions", "usage", "audit")


@router.get(
    "/dealer/records/{kind}.csv",
    summary="Export one record table for my agents as CSV — no customer identity, no comments, no money",  # noqa: E501
)
async def records_csv(
    kind: str,
    since: date | None = None,
    p: Principal = Depends(require_permission("VIEW_AGENT_HISTORY")),
    db: AsyncSession = Depends(get_session),
) -> Response:
    if kind not in RECORD_KINDS:
        raise NotFoundError("Not available.")
    now = now_utc()
    refs = [a.ref for a in await my_agents(db, p.subject)]
    start = (
        datetime(since.year, since.month, since.day, tzinfo=UTC)
        if since
        else now - timedelta(days=30)
    )
    rows: list[dict] = []
    if kind == "searches":
        q = select(SearchImpression).where(
            SearchImpression.agent_ref.in_(refs), SearchImpression.at >= start
        )
        for x in (await db.execute(q.order_by(SearchImpression.at))).scalars().all():
            rows.append(
                {
                    "at": _aware(x.at).isoformat(),
                    "agent_ref": x.agent_ref,
                    "transaction": x.transaction,
                    "amount_band": x.amount_band or "",
                    "outcome_shown": x.outcome_shown,
                    "probability": round(x.probability, 4),
                    "visit_result": ""
                    if x.label is None
                    else ("served" if x.label else "not_served"),
                }
            )
    elif kind == "reports":
        q = select(OutcomeReport).where(
            OutcomeReport.agent_ref.in_(refs), OutcomeReport.at >= start
        )
        for x in (await db.execute(q.order_by(OutcomeReport.at))).scalars().all():
            rows.append(
                {
                    "at": _aware(x.at).isoformat(),
                    "agent_ref": x.agent_ref,
                    "transaction": x.transaction or "",
                    "amount_band": x.amount_band or "",
                    "answer": x.answer,
                    "reason_code": x.reason_code or "",
                    "outcome_at_report": x.outcome_at_report or "",
                    "freshness_at_report": x.freshness_at_report or "",
                    "rating": x.rating if x.rating is not None else "",
                    "source": x.source,
                }
            )
    elif kind == "transactions":
        q = select(AgentTransaction).where(
            AgentTransaction.agent_ref.in_(refs), AgentTransaction.at >= start
        )
        for x in (await db.execute(q.order_by(AgentTransaction.at))).scalars().all():
            rows.append(
                {
                    "at": _aware(x.at).isoformat(),
                    "agent_ref": x.agent_ref,
                    "transaction": x.transaction,
                    "amount_band": x.amount_band,
                    "source": x.source,
                }
            )
    elif kind == "actions":
        q = select(Action).where(Action.agent_ref.in_(refs), Action.at >= start)
        for x in (await db.execute(q.order_by(Action.at))).scalars().all():
            rows.append(
                {
                    "at": _aware(x.at).isoformat(),
                    "agent_ref": x.agent_ref,
                    "action": x.action,
                    "actor": x.actor,
                    "note": x.note,
                    "signal_id": x.signal_id or "",
                }
            )
    elif kind == "usage":
        q = select(UsageEvent).where(
            (UsageEvent.agent_ref.in_(refs)) | (UsageEvent.actor_kind == "customer"),
            UsageEvent.at >= start,
        )
        for x in (await db.execute(q.order_by(UsageEvent.at))).scalars().all():
            rows.append(
                {
                    "at": _aware(x.at).isoformat(),
                    "kind": x.kind,
                    "actor_kind": x.actor_kind,
                    "agent_ref": x.agent_ref or "",
                }
            )
    elif kind == "audit":
        q = select(AuditLog).where(AuditLog.agent_ref.in_(refs), AuditLog.at >= start)
        for x in (await db.execute(q.order_by(AuditLog.at))).scalars().all():
            rows.append(
                {
                    "at": _aware(x.at).isoformat(),
                    "agent_ref": x.agent_ref,
                    "actor": x.actor,
                    "field": x.field,
                    "purpose": x.purpose,
                }
            )
    return _csv(rows, f"{kind}-{date.today().isoformat()}.csv")
