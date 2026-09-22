"""Agent-only: the agent's own home, declaration, activity, profile and insights."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import Principal, require_role
from app.db.models import (
    Action,
    Agent,
    AvailabilityEvent,
    Dealer,
    FloatRequest,
    OutcomeReport,
    UsageEvent,
)
from app.db.session import get_session
from app.integrations.operator.base import get_operator
from app.services import usage
from app.services.ledger import Ledger, ledgers_for, word_for_figure
from app.services.phrasing import (
    CAPACITY_LABEL,
    NETWORK_RANGES,
    age_minutes,
    age_text,
    customers_see,
    freshness_of,
    now_utc,
)

router = APIRouter(prefix="/agent", tags=["agent"])
CONFIRM_AFTER_MIN = 90


class Declaration(BaseModel):
    presence: str
    cash_out: str
    deposit: str
    # The agent's own figures behind the words, when they gave any. Never shown to customers.
    cash_out_sle: int | None = None
    deposit_sle: int | None = None
    updated_at: str
    age_min: int
    freshness: str
    freshness_text: str
    confirm_due: bool
    # Why "still correct?" is asked now, when an event (not the clock) raised it.
    confirm_reason: str | None = None
    night_mode: bool
    # "agent": these words and figures are the agent's own. "operator": they are the host
    # system's position, read just now, and there is nothing to refresh.
    capacity_source: str = "agent"
    source_text: str | None = None


class OperatorValue(BaseModel):
    amount_sle: int
    source: str
    read_at: str


class FloatOut(BaseModel):
    id: str
    agent_ref: str
    agent_name: str
    amount_sle: int
    reason: str
    state: str
    requested_at: str
    waiting_text: str
    decided_at: str | None
    decided_by: str | None
    decision_reason: str | None
    ageing: bool


def waiting_text(since: datetime, now: datetime) -> str:
    mins = max(0, int((now - since).total_seconds() // 60))
    return f"{mins} min" if mins < 60 else f"{mins // 60} h {mins % 60:02d}"


def float_out(r: FloatRequest, agent_name: str, now: datetime) -> FloatOut:
    req_at = r.requested_at if r.requested_at.tzinfo else r.requested_at.replace(tzinfo=now.tzinfo)
    mins = int((now - req_at).total_seconds() // 60)
    return FloatOut(
        id=r.id,
        agent_ref=r.agent_ref,
        agent_name=agent_name,
        amount_sle=r.amount_sle,
        reason=r.reason,
        state=r.state,
        requested_at=req_at.isoformat(),
        waiting_text=waiting_text(req_at, now),
        decided_at=r.decided_at.isoformat() if r.decided_at else None,
        decided_by=r.decided_by,
        decision_reason=r.decision_reason,
        ageing=r.state == "pending" and mins >= 120,
    )


def declaration_of(a: Agent, now: datetime, ledger: Ledger | None = None) -> Declaration:
    if ledger is not None and ledger.live:
        return _live_declaration(a, now, ledger)
    mins = age_minutes(a.declared_at, now)
    f = freshness_of(a.declared_at, now)
    reason = ledger.nudge_reason(NETWORK_RANGES) if ledger is not None else None
    text = (
        "No status yet — customers cannot find you until you set one"
        if mins is None
        else f"You updated this {age_text(mins)} — customers no longer see you"
        if f == "expired"
        else f"You updated this {age_text(mins)} — customers are told it may have changed"
        if f == "may_have_changed"
        else f"You updated this {age_text(mins)}"
    )
    return Declaration(
        presence=a.presence,
        cash_out=a.cash_out or "none",
        deposit=a.deposit or "none",
        cash_out_sle=a.cash_out_sle,
        deposit_sle=a.deposit_sle,
        updated_at=a.declared_at.isoformat() if a.declared_at else "",
        age_min=mins if mins is not None else 10**6,
        freshness=f,
        freshness_text=text,
        confirm_due=mins is None or mins >= CONFIRM_AFTER_MIN or reason is not None,
        confirm_reason=reason,
        night_mode=a.night_mode,
    )


def _live_declaration(a: Agent, now: datetime, ledger: Ledger) -> Declaration:
    """The operator feed is on: capacity is read, not told. Presence stays the agent's."""
    updated = ledger.updated_at(now)
    mins = age_minutes(updated, now)
    src = ledger.feed_source or "operator"
    return Declaration(
        presence=a.presence,
        cash_out=ledger.cash.word or "none",
        deposit=ledger.float.word or "none",
        cash_out_sle=ledger.cash.declared_sle,
        deposit_sle=ledger.float.declared_sle,
        updated_at=updated.isoformat() if updated else "",
        age_min=mins if mins is not None else 0,
        freshness=freshness_of(updated, now),
        freshness_text=f"{src} updated your capacity {age_text(mins)} — nothing to refresh",
        confirm_due=False,
        confirm_reason=None,
        night_mode=a.night_mode,
        capacity_source="operator",
        source_text=f"From {src}: e-float exact, cash inferred from your transactions. Your own words are used if the link drops.",  # noqa: E501
    )


async def load_agent(db: AsyncSession, ref: str) -> Agent:
    return (await db.execute(select(Agent).where(Agent.ref == ref))).scalar_one()


async def today_counts(db: AsyncSession, ref: str, now: datetime) -> dict:
    start = now.replace(hour=0, minute=0, second=0, microsecond=0)
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
    return {"found_you": int(found), "reported_problems": int(problems)}


@router.get("/home", summary="The agent's day")
async def home(
    p: Principal = Depends(require_role("agent")), db: AsyncSession = Depends(get_session)
) -> dict:
    now = now_utc()
    a = await load_agent(db, p.subject)
    op = get_operator()
    counts = await today_counts(db, a.ref, now)
    tx = await op.transactions_today(a.ref)
    pending = (
        (
            await db.execute(
                select(FloatRequest)
                .where(
                    FloatRequest.agent_ref == a.ref, FloatRequest.state.in_(["pending", "approved"])
                )
                .order_by(FloatRequest.requested_at.desc())
            )
        )
        .scalars()
        .first()
    )
    attention = []
    if counts["reported_problems"]:
        n = counts["reported_problems"]
        attention.append(
            f"{n} customer{'s' if n > 1 else ''} said you could not complete their transaction today."  # noqa: E501
        )
    ledger = (await ledgers_for(db, [a], now))[a.ref]
    d = declaration_of(a, now, ledger)
    if d.freshness == "expired":
        attention.append("Your status has expired, so customers are not being sent to you.")
    bal = await op.balance(a.ref)
    fl = await op.float_position(a.ref)
    return {
        "name": a.shop_name,
        "ref": a.ref,
        "area": a.street,
        "declaration": d.model_dump(),
        "customers_see": customers_see(a, now, ledger),
        "balance": bal.model_dump() if bal else None,
        "float_position": fl.model_dump() if fl else None,
        "pending_float": float_out(pending, a.shop_name, now).model_dump() if pending else None,
        "today": {
            "found_you": counts["found_you"],
            "transactions": tx.get("transactions"),
            "successful": tx.get("successful"),
            "reported_problems": counts["reported_problems"],
        },
        "attention": attention,
    }


class DeclareBody(BaseModel):
    presence: Literal["open", "hidden", "closed"]
    cash_out: Literal["most", "some", "small", "none"]
    deposit: Literal["most", "some", "small", "none"]
    # Optional: "up to about SLE …". When given, the word is derived from it so dealers keep
    # seeing words, and the ledger counts confirmed visits against the figure.
    cash_out_sle: int | None = Field(default=None, ge=0, le=10_000_000)
    deposit_sle: int | None = Field(default=None, ge=0, le=10_000_000)
    night_mode: bool = True


@router.post(
    "/availability", response_model=Declaration, summary="Declare availability and capacity"
)
async def declare(
    body: DeclareBody,
    p: Principal = Depends(require_role("agent")),
    db: AsyncSession = Depends(get_session),
) -> Declaration:
    now = now_utc()
    a = await load_agent(db, p.subject)
    kind = (
        "hide"
        if body.presence == "hidden" and a.presence != "hidden"
        else "show"
        if a.presence == "hidden" and body.presence != "hidden"
        else "declare"
    )
    cash_word = (
        word_for_figure(body.cash_out_sle, NETWORK_RANGES)
        if body.cash_out_sle is not None
        else body.cash_out
    )
    dep_word = (
        word_for_figure(body.deposit_sle, NETWORK_RANGES)
        if body.deposit_sle is not None
        else body.deposit
    )
    a.presence, a.cash_out, a.deposit, a.night_mode, a.declared_at = (
        body.presence,
        cash_word,
        dep_word,
        body.night_mode,
        now,
    )
    a.cash_out_sle, a.deposit_sle = body.cash_out_sle, body.deposit_sle
    db.add(
        AvailabilityEvent(
            agent_ref=a.ref,
            kind=kind,
            presence=body.presence,
            cash_out=cash_word,
            deposit=dep_word,
        )
    )
    await usage.record(db, "declare", "agent", a.ref, a.ref)
    await db.commit()
    return declaration_of(a, now)


@router.post("/availability/confirm", response_model=Declaration, summary="Still correct? — yes")
async def confirm(
    p: Principal = Depends(require_role("agent")), db: AsyncSession = Depends(get_session)
) -> Declaration:
    now = now_utc()
    a = await load_agent(db, p.subject)
    # "Still correct?" · Yes confirms what the ledger says is probably left, not the figure
    # from this morning: the agent's own figure moves to the estimate they just agreed with.
    ledger = (await ledgers_for(db, [a], now))[a.ref]
    if a.cash_out_sle is not None:
        a.cash_out_sle = ledger.cash.estimate_sle
        a.cash_out = word_for_figure(a.cash_out_sle or 0, NETWORK_RANGES)
    if a.deposit_sle is not None:
        a.deposit_sle = ledger.float.estimate_sle
        a.deposit = word_for_figure(a.deposit_sle or 0, NETWORK_RANGES)
    a.declared_at = now
    db.add(
        AvailabilityEvent(
            agent_ref=a.ref,
            kind="confirm",
            presence=a.presence,
            cash_out=a.cash_out,
            deposit=a.deposit,
        )
    )
    await usage.record(db, "confirm", "agent", a.ref, a.ref)
    await db.commit()
    return declaration_of(a, now)


@router.get("/activity", summary="Today's timeline: operator rows and ours, each labelled")
async def activity(
    p: Principal = Depends(require_role("agent")), db: AsyncSession = Depends(get_session)
) -> list[dict]:
    now = now_utc()
    a = await load_agent(db, p.subject)
    start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    out: list[dict] = []
    ev = (
        (
            await db.execute(
                select(AvailabilityEvent).where(
                    AvailabilityEvent.agent_ref == a.ref, AvailabilityEvent.at >= start
                )
            )
        )
        .scalars()
        .all()
    )
    for e in ev:
        words = f"{CAPACITY_LABEL.get(e.cash_out or '', '—')} · {CAPACITY_LABEL.get(e.deposit or '', '—')}"  # noqa: E501
        text = (
            "You confirmed your status was still correct"
            if e.kind == "confirm"
            else "You went hidden"
            if e.kind == "hide"
            else f"You declared {e.presence.capitalize()} · {words}"
        )
        out.append(
            {
                "id": f"av-{e.id}",
                "at": e.at.isoformat(),
                "time_text": e.at.strftime("%H:%M"),
                "text": text,
                "source": "agent_finder",
                "tone": "warning"
                if e.kind == "hide"
                else "good"
                if e.kind == "confirm"
                else "neutral",
            }
        )
    reps = (
        (
            await db.execute(
                select(OutcomeReport).where(
                    OutcomeReport.agent_ref == a.ref, OutcomeReport.at >= start
                )
            )
        )
        .scalars()
        .all()
    )
    for r in reps:
        if r.answer == "no":
            out.append(
                {
                    "id": f"rep-{r.id[:8]}",
                    "at": r.at.isoformat(),
                    "time_text": r.at.strftime("%H:%M"),
                    "text": f"Customer reported: {(r.reason_code or 'could not complete').replace('_', ' ')}",  # noqa: E501
                    "source": "agent_finder",
                    "tone": "danger",
                }
            )
    fr = (
        (
            await db.execute(
                select(FloatRequest).where(
                    FloatRequest.agent_ref == a.ref, FloatRequest.requested_at >= start
                )
            )
        )
        .scalars()
        .all()
    )
    for r in fr:
        out.append(
            {
                "id": f"fr-{r.id}",
                "at": r.requested_at.isoformat(),
                "time_text": r.requested_at.strftime("%H:%M"),
                "text": f"You requested float SLE {r.amount_sle:,}",
                "source": "agent_finder",
                "tone": "neutral",
            }
        )
        if r.decided_at:
            out.append(
                {
                    "id": f"frd-{r.id}",
                    "at": r.decided_at.isoformat(),
                    "time_text": r.decided_at.strftime("%H:%M"),
                    "text": f"Your float request was {r.state}"
                    + (f": {r.decision_reason}" if r.decision_reason else ""),
                    "source": "agent_finder",
                    "tone": "warning" if r.state == "declined" else "good",
                }
            )
    acts = (
        (
            await db.execute(
                select(Action).where(
                    Action.agent_ref == a.ref, Action.at >= start, Action.action == "nudge"
                )
            )
        )
        .scalars()
        .all()
    )
    for x in acts:
        out.append(
            {
                "id": f"act-{x.id}",
                "at": x.at.isoformat(),
                "time_text": x.at.strftime("%H:%M"),
                "text": "Your dealer asked you to check your status is still correct",
                "source": "agent_finder",
                "tone": "warning",
            }
        )
    for row in await get_operator().transactions_list(a.ref):
        out.append({**row, "source": "operator"})
    out.sort(key=lambda e: e["at"], reverse=True)
    return out


@router.get("/profile", summary="Business, dealer, phone visibility, devices")
async def profile(
    p: Principal = Depends(require_role("agent")), db: AsyncSession = Depends(get_session)
) -> dict:
    a = await load_agent(db, p.subject)
    dealer = await db.get(Dealer, a.dealer_id)
    return {
        "name": a.person_name,
        "ref": a.ref,
        "shop_name": a.shop_name,
        "area": a.street,
        "hours_text": f"{a.open_hour:02d}:00 – {a.close_hour:02d}:00",
        "dealer_name": dealer.name if dealer else "",
        "phone_visible": a.phone_visible,
        "verified": a.verified,
        "devices": [
            {"id": "this", "label": "This phone", "last_seen_text": "Active now", "current": True}
        ],
    }


class PhoneBody(BaseModel):
    visible: bool


@router.post("/profile/phone", summary="Show or hide my number to customers")
async def set_phone(
    body: PhoneBody,
    p: Principal = Depends(require_role("agent")),
    db: AsyncSession = Depends(get_session),
) -> dict:
    a = await load_agent(db, p.subject)
    a.phone_visible = body.visible
    await db.commit()
    return await profile(p, db)


@router.get("/insights", summary="The dashboard series for one range")
async def insights(
    range_: Literal["today", "yesterday", "week", "month"] = Query(default="week", alias="range"),
    p: Principal = Depends(require_role("agent")),
    db: AsyncSession = Depends(get_session),
) -> dict:
    span = range_
    now = now_utc()
    a = await load_agent(db, p.subject)
    if span in ("today", "yesterday"):
        day = now.replace(hour=0, minute=0, second=0, microsecond=0) - (
            timedelta(days=1) if span == "yesterday" else timedelta(0)
        )
        buckets = [
            (day + timedelta(hours=h), f"{h:02d}:00")
            for h in range_hours(
                a.open_hour,
                a.close_hour if span == "yesterday" else min(a.close_hour, now.hour + 1),
            )
        ]
        width = timedelta(hours=1)
    elif span == "week":
        start = now.replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=6)
        buckets = [
            (
                start + timedelta(days=i),
                (start + timedelta(days=i)).strftime("%a") if i < 6 else "Today",
            )
            for i in range(7)
        ]
        width = timedelta(days=1)
    else:
        start = now.replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=29)
        buckets = [
            (start + timedelta(days=i), (start + timedelta(days=i)).strftime("%-d %b"))
            for i in range(30)
        ]
        width = timedelta(days=1)

    ev = (
        (
            await db.execute(
                select(UsageEvent).where(
                    UsageEvent.agent_ref == a.ref,
                    UsageEvent.kind == "directions",
                    UsageEvent.at >= buckets[0][0],
                )
            )
        )
        .scalars()
        .all()
    )
    decl = (
        (
            await db.execute(
                select(AvailabilityEvent)
                .where(
                    AvailabilityEvent.agent_ref == a.ref,
                    AvailabilityEvent.at >= buckets[0][0] - timedelta(hours=4),
                )
                .order_by(AvailabilityEvent.at)
            )
        )
        .scalars()
        .all()
    )
    op_tx = await get_operator().transactions_series(a.ref, [b[0] for b in buckets], width)
    points = []
    for i, (b0, label) in enumerate(buckets):
        b1 = b0 + width
        found = sum(1 for e in ev if b0 <= _aware(e.at) < b1)
        points.append(
            {
                "label": label,
                "found_you": found,
                "transactions": op_tx[i] if op_tx else None,
                "fresh_pct": fresh_pct(decl, b0, b1),
            }
        )
    total = sum(p_["found_you"] for p_ in points)
    tx_total = sum(x for x in op_tx) if op_tx else None
    return {
        "range": span,
        "points": points,
        "found_total": total,
        "found_delta": 0,
        "fresh_pct": round(sum(p_["fresh_pct"] for p_ in points) / max(1, len(points))),
        "transactions_total": tx_total,
        "operator_source": get_operator().source_name() if op_tx else None,
    }


def range_hours(a: int, b: int) -> list[int]:
    return list(range(a, max(a + 1, b)))


def _aware(dt: datetime) -> datetime:

    return dt if dt.tzinfo else dt.replace(tzinfo=UTC)


def fresh_pct(events: list[AvailabilityEvent], b0: datetime, b1: datetime) -> int:
    """Share of the interval during which the latest declaration was under 90 minutes old."""
    fresh = timedelta(0)
    t = b0
    step = timedelta(minutes=10)
    while t < b1:
        last = None
        for e in events:
            if _aware(e.at) <= t:
                last = _aware(e.at)
            else:
                break
        if last is not None and t - last < timedelta(minutes=90):
            fresh += step
        t += step
    return round(fresh / (b1 - b0) * 100) if b1 > b0 else 0
