"""The served percentage from the last seven days, the same rule for every agent.

Three checks, in order, all from counts the agent can change by working:

1. Active days: on how many of the last 7 days the agent recorded any transaction.
   40 x days / 7. Volume does not count; one transaction a day earns the same as thirty.
2. This transaction: has the agent done the requested type in the window, at the requested
   size or larger? 35. Only at smaller sizes: 15, and the total is capped at 50. The type
   not done at all: 0, capped at 35.
3. Customers: visit reports for the requested type in the window. Fewer than three: 0.
   Three or more: 20 x (served - failed) / reports. Served and failed weigh the same.

The total is rounded to the nearest five, never under 5, never over 95. An agent with no
transaction of any type in seven days is not recommended and reads 5. The agent's own "low
today" caps that side at 35 until it lapses; "none today" caps it at 5.

No subtraction: nothing here estimates what an agent has left. Customers read the
percentage; agents and aggregators never see it or the points.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import AgentTransaction, OutcomeReport
from app.services.ledger import CAPACITY_FAILURES
from app.services.phrasing import amount_band, side_for

WINDOW_DAYS = 7
BAND_ORDER = ("≤500", "≤2k", "≤5k", "≤10k", "≤50k", ">50k")
LIKELY_FROM = 50  # a percentage at or above this reads "likely" and can be recommended


@dataclass
class Week:
    """What seven days hold for one agent, per side (cash = cash out, float = cash in)."""

    active_days: int = 0
    bands: dict[str, set[str]] = field(default_factory=lambda: {"cash": set(), "float": set()})
    served: dict[str, int] = field(default_factory=lambda: {"cash": 0, "float": 0})
    failed: dict[str, int] = field(default_factory=lambda: {"cash": 0, "float": 0})


@dataclass(frozen=True)
class WeekScore:
    pct: int
    outcome: str  # likely | limited | unknown
    note: str | None  # a plain reason for the customer, when one helps
    active: bool


def _band_index(band: str | None) -> int | None:
    return BAND_ORDER.index(band) if band in BAND_ORDER else None


async def weeks_for(db: AsyncSession, refs: list[str], now: datetime) -> dict[str, Week]:
    """One query per table for every agent in the request."""
    out = {ref: Week() for ref in refs}
    if not refs:
        return out
    today = now.date()
    since = datetime.combine(
        today - timedelta(days=WINDOW_DAYS - 1), datetime.min.time(), now.tzinfo
    )
    days: dict[str, set] = {ref: set() for ref in refs}
    rows = await db.execute(
        select(
            AgentTransaction.agent_ref,
            AgentTransaction.at,
            AgentTransaction.transaction,
            AgentTransaction.amount_band,
        ).where(AgentTransaction.agent_ref.in_(refs), AgentTransaction.at >= since)
    )
    for ref, at, tx, band in rows:
        when = at if at.tzinfo else at.replace(tzinfo=now.tzinfo)
        if when > now:
            continue
        days[ref].add(when.date())
        out[ref].bands[side_for(tx)].add(band)
    for ref in refs:
        out[ref].active_days = len(days[ref])
    reports = await db.execute(
        select(
            OutcomeReport.agent_ref,
            OutcomeReport.transaction,
            OutcomeReport.answer,
            OutcomeReport.reason_code,
        ).where(OutcomeReport.agent_ref.in_(refs), OutcomeReport.at >= since)
    )
    for ref, tx, answer, reason in reports:
        if tx is None:
            continue
        side = side_for(tx)
        if answer == "yes":
            out[ref].served[side] += 1
        elif answer == "no" and (reason or "") in CAPACITY_FAILURES:
            out[ref].failed[side] += 1
    return out


def score(week: Week, tx: str, amount_sle: int | None, low: str | None = None) -> WeekScore:
    """The percentage a customer reads for one agent and one request."""
    side = side_for(tx)
    other = "float" if side == "cash" else "cash"
    label = "cash out" if side == "cash" else "cash in"
    other_label = "cash in" if side == "cash" else "cash out"
    if week.active_days == 0:
        return WeekScore(5, "unknown", "No activity recorded this week", active=False)

    points = 40 * week.active_days / WINDOW_DAYS
    cap = 95
    note = None
    seen = week.bands[side]
    if not seen:
        cap = 35
        note = (
            f"Does {other_label}; no {label} this week"
            if week.bands[other]
            else f"No {label} recorded this week"
        )
    else:
        asked = _band_index(amount_band(amount_sle))
        largest = max(_band_index(b) or 0 for b in seen)
        if asked is None or largest >= asked:
            points += 35
        else:
            points += 15
            cap = 50
            note = "Not seen at this size this week"

    reports = week.served[side] + week.failed[side]
    if reports >= 3:
        points += 20 * (week.served[side] - week.failed[side]) / reports

    if low == "low":
        cap = min(cap, 35)
    elif low == "none":
        cap = min(cap, 5)

    pct = 5 * math.floor(points / 5 + 0.5)  # a half rounds up, as in the demo's copy
    pct = max(5, min(95, cap, pct))
    return WeekScore(pct, "likely" if pct >= LIKELY_FROM else "limited", note, active=True)


SIDES = (("cash_out", "cash", "Cash out"), ("deposit", "float", "Cash in"))


def _status(s: WeekScore, seen: bool, low: str | None) -> tuple[str, str]:
    """One status word per type, as the agent's listing shows it: never the percentage."""
    if low == "none":
        return "limited", "None today"
    if low == "low":
        return "limited", "Low today"
    if not s.active:
        return "unknown", "No activity this week"
    if not seen:
        return "limited", "Not done this week"
    if s.outcome == "likely":
        return "likely", "Likely to be served"
    return "limited", "Less likely yet"


def week_note(week: Week, low: tuple[str | None, str | None], viewer: str = "agent") -> dict:
    """How customers see this agent this week, in words, for the agent and the aggregator.

    One status per type and the lines that explain it. No percentage and no points: the
    figure is worked out for each customer request and stays in the system; this note reads
    the same for whoever looks, in the second person for the agent and the third for the
    aggregator."""
    you = viewer == "agent"
    sides = []
    done = []
    for (tx, side, label), side_low in zip(SIDES, low, strict=True):
        s = score(week, tx, None, side_low)
        seen = bool(week.bands[side])
        if seen:
            done.append(label.lower())
        outcome, phrase = _status(s, seen, side_low)
        sides.append({"label": label, "outcome": outcome, "phrase": phrase})

    why = []
    d = week.active_days
    if d == 0:
        title = "No transaction recorded in the last 7 days"
        detail = (
            "Customers are not sent to you until you record one. Record every day you work."
            if you
            else "Customers are not sent to this agent until they record one."
        )
    else:
        days = "all 7" if d == WINDOW_DAYS else f"{d} of the last 7"
        title = f"{'You worked' if you else 'Worked'} {days} days"
        detail = (
            "Record every day you work. Days count, not how many transactions."
            if you
            else "Days count, not how many transactions."
        )
    why.append({"tone": "good" if d >= 5 else "warn", "title": title, "detail": detail})

    if d > 0:
        if len(done) == 2:
            why.append(
                {
                    "tone": "good",
                    "title": "Cash out and cash in done this week",
                    "detail": "Customers see you for both."
                    if you
                    else "Customers see this agent for both.",
                }
            )
        elif done:
            missing = "cash in" if done[0] == "cash out" else "cash out"
            why.append(
                {
                    "tone": "good",
                    "title": f"{done[0].capitalize()} done this week; {missing} not",
                    "detail": f"Record {missing}s when you do them, and customers will see you for both."  # noqa: E501
                    if you
                    else f"{missing.capitalize()} shows once the agent records one.",
                }
            )

    served = sum(week.served.values())
    failed = sum(week.failed.values())
    n = served + failed
    if n >= 3:
        title = f"Customers: {served} served, {'none' if failed == 0 else failed} failed"
        tone = "good" if served >= failed else "warn"
        detail = "From visits customers reported in the last 7 days."
    else:
        title = (
            "No customer reports this week"
            if n == 0
            else f"Customers: {n} report{'s' if n > 1 else ''} this week"
        )
        tone = "neutral"
        detail = "Reports count from 3 on. Served and could not serve weigh the same."
    why.append({"tone": tone, "title": title, "detail": detail})

    for (_tx, _side, label), side_low in zip(SIDES, low, strict=True):
        if side_low in ("low", "none"):
            word = "low on" if side_low == "low" else "out of"
            what = "cash" if label == "Cash out" else "float"
            why.append(
                {
                    "tone": "warn",
                    "title": f"{'You said you are' if you else 'Said'} {word} {what} today",
                    "detail": f"{label} reads less likely for the rest of the day.",
                }
            )
    return {"sides": sides, "why": why}
