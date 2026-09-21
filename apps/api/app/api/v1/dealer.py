"""Dealer-only. Counts, register, agent detail, signals, actions, and the audited financial
read. Every response here is behind a named permission; money is masked unless revealed."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.agent_app import declaration_of, float_out
from app.core.auth import Principal, require_permission, require_role
from app.core.errors import AppError, NotFoundError
from app.db.models import (
    Action,
    Agent,
    AuditLog,
    AvailabilityEvent,
    FloatRequest,
    OutcomeReport,
    SignalMute,
    UsageEvent,
)
from app.db.session import get_session
from app.integrations.operator.base import get_operator
from app.services import usage
from app.services.phrasing import (
    CAPACITY_LABEL,
    PRESENCE_LABEL,
    age_minutes,
    age_text,
    freshness_of,
    now_utc,
)

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


async def active_mutes(db: AsyncSession, dealer_id: str, now: datetime) -> set[str]:
    rows = (
        (
            await db.execute(
                select(SignalMute).where(SignalMute.dealer_id == dealer_id, SignalMute.until > now)
            )
        )
        .scalars()
        .all()
    )
    return {m.signal_id for m in rows if _aware(m.until) > now}


async def signals_for(
    db: AsyncSession, agents: list[Agent], now, *, include_muted: bool = False
) -> list[dict]:
    """Rules 1–3 of the nine, computed from real events. Sentence + evidence + next action.
    A signal the dealer snoozed or resolved is left out until its time is up."""
    out = []
    start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    muted: set[str] = set()
    if agents and not include_muted:
        muted = await active_mutes(db, agents[0].dealer_id, now)
    for a in agents:
        call_url = f"tel:{a.phone}" if a.phone else None
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
        if freshness_of(a.declared_at, now) == "expired":
            mins = age_minutes(a.declared_at, now)
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


@router.get("/dealer/overview", summary="What is happening with all my agents")
async def overview(
    p: Principal = Depends(require_role("dealer")), db: AsyncSession = Depends(get_session)
) -> dict:
    now = now_utc()
    agents = await my_agents(db, p.subject)
    counts = {"active": 0, "limited": 0, "hidden": 0, "closed": 0}
    for a in agents:
        stale = freshness_of(a.declared_at, now) == "expired"
        if a.presence == "hidden":
            counts["hidden"] += 1
        elif a.presence == "closed" or stale:
            counts["closed"] += 1
        elif a.cash_out in ("none", "small"):
            counts["limited"] += 1
        else:
            counts["active"] += 1
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
    }


@router.get("/dealer/agents", summary="Agent register")
async def agents_list(
    p: Principal = Depends(require_permission("VIEW_AGENT")),
    db: AsyncSession = Depends(get_session),
) -> list[dict]:
    now = now_utc()
    rows = []
    for a in await my_agents(db, p.subject):
        d = declaration_of(a, now)
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
                "declaration_text": f"{CAPACITY_LABEL.get(a.cash_out or '', '—')} / {CAPACITY_LABEL.get(a.deposit or '', '—')}",  # noqa: E501
                "freshness_text": age_text(d.age_min if d.age_min < 10**6 else None),
                "attention": int(problems) > 1
                or d.freshness == "expired"
                or a.presence == "hidden",
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
    return {
        "ref": a.ref,
        "name": a.person_name,
        "shop_name": a.shop_name,
        "area": a.street,
        "declaration": declaration_of(a, now).model_dump(),
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
    }


class ActionBody(BaseModel):
    agent: str
    action: Literal["contact", "call", "nudge", "escalate"]


PERM_FOR_ACTION = {
    "contact": "CONTACT_AGENT",
    "call": "CONTACT_AGENT",
    "nudge": "CONTACT_AGENT",
    "escalate": "ESCALATE_AGENT",
}


@router.post(
    "/actions",
    status_code=201,
    summary="Contact · Call · Nudge · Escalate — logged, never a status change",
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
    note = {
        "contact": f"{p.name} contacted {a.shop_name}",
        "call": f"{p.name} called {a.shop_name}",
        "nudge": f"{p.name} asked {a.shop_name} to update their status",
        "escalate": f"{p.name} escalated {a.shop_name} to the super distributor",
    }[body.action]
    row = Action(actor=p.name, agent_ref=a.ref, action=body.action, note=note)
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return {
        "id": str(row.id),
        "action": body.action,
        "agent_ref": a.ref,
        "at": row.at.isoformat(),
        "note": note,
    }


class MuteBody(BaseModel):
    id: str = Field(min_length=5, max_length=80)


@router.post(
    "/dealer/signals/{kind}",
    status_code=201,
    summary="Snooze (4 h) or resolve (rest of today) one signal — my queue, not their status",
)
async def mute_signal(
    kind: Literal["snooze", "resolve"],
    body: MuteBody,
    p: Principal = Depends(require_role("dealer")),
    db: AsyncSession = Depends(get_session),
) -> dict:
    now = now_utc()
    # Signal ids are "sig-<rule>-<agent ref>"; the agent must be mine and the signal live.
    parts = body.id.split("-", 2)
    if len(parts) != 3 or parts[0] != "sig":
        raise NotFoundError("Not available.")
    a = (
        await db.execute(select(Agent).where(Agent.ref == parts[2], Agent.dealer_id == p.subject))
    ).scalar_one_or_none()
    if a is None:
        raise NotFoundError("Not available.")
    live = {s["id"]: s for s in await signals_for(db, [a], now)}
    sig = live.get(body.id)
    if sig is None:
        raise NotFoundError("Not available.")
    until = (
        now + SNOOZE_FOR
        if kind == "snooze"
        else now.replace(hour=23, minute=59, second=59, microsecond=0)
    )
    note = (
        f'{p.name} snoozed "{sig["title"]}" for {a.shop_name} until {until.strftime("%H:%M")}'
        if kind == "snooze"
        else f'{p.name} resolved "{sig["title"]}" for {a.shop_name} for today'
    )
    db.add(
        SignalMute(dealer_id=p.subject, agent_ref=a.ref, signal_id=body.id, kind=kind, until=until)
    )
    db.add(Action(actor=p.name, agent_ref=a.ref, action=kind, note=note))
    await db.commit()
    return {
        "id": body.id,
        "kind": kind,
        "agent_ref": a.ref,
        "until": until.isoformat(),
        "note": note,
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
            "at": x.at.isoformat(),
            "note": x.note,
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
