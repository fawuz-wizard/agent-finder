"""Float demand forecast for dealers: which agents will probably run short of cash by
tomorrow, from the pilot's own evidence. The pace is learned from the visits customers
confirmed over the last seven days; the remaining cash comes from the agent's own words or
figure through the ledger; failed visits and the top-up history sharpen it.

Only ever a ranking with reasons. No operator balance is read, no figure of the agent's is
shown to the dealer, and nothing here decides a float request: the dealer does.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Agent, FloatRequest, OutcomeReport
from app.services.ledger import BAND_MIDPOINT, CAPACITY_FAILURES, _aware, ledgers_for, side_of
from app.services.phrasing import NETWORK_RANGES, age_text

RISK_ORDER = {"high": 0, "medium": 1, "low": 2}
HEADLINE = {
    "high": "Likely short by tomorrow",
    "medium": "Watch this week",
    "low": "Fine for now",
}
WINDOW_DAYS = 7


@dataclass
class Forecast:
    agent_ref: str
    agent_name: str
    risk: str
    reasons: list[str]
    days_left_text: str | None
    last_top_up_text: str | None
    pending_request: bool
    call_url: str | None

    def as_dict(self) -> dict:
        return {
            "agent_ref": self.agent_ref,
            "agent_name": self.agent_name,
            "risk": self.risk,
            "headline": HEADLINE[self.risk],
            "reasons": self.reasons,
            "days_left_text": self.days_left_text,
            "last_top_up_text": self.last_top_up_text,
            "pending_request": self.pending_request,
            "call_url": self.call_url,
        }


def days_left_text(days: float) -> str:
    if days < 0.75:
        return "about half a day of cash at the recent pace"
    if days < 1.5:
        return "about a day of cash at the recent pace"
    return f"about {round(days)} days of cash at the recent pace"


def risk_of(
    *,
    word: str | None,
    capped: bool,
    days_left: float | None,
    failures_today: int,
    last_top_up_days: float | None,
    pace_per_day: float,
) -> str:
    """The rule, in one place, so a dealer can be told exactly why."""
    if word == "none" or capped:
        return "high"
    if days_left is not None and days_left < 1:
        return "high"
    if days_left is not None and days_left < 2:
        return "medium"
    if word == "small" or failures_today:
        return "medium"
    if last_top_up_days is not None and last_top_up_days >= WINDOW_DAYS and pace_per_day > 0:
        return "medium"
    return "low"


async def forecasts_for(db: AsyncSession, agents: list[Agent], now: datetime) -> list[dict]:
    if not agents:
        return []
    refs = [a.ref for a in agents]
    ledgers = await ledgers_for(db, agents, now)
    since = now - timedelta(days=WINDOW_DAYS)
    start_today = now.replace(hour=0, minute=0, second=0, microsecond=0)
    reports = (
        (
            await db.execute(
                select(OutcomeReport).where(
                    OutcomeReport.agent_ref.in_(refs),
                    OutcomeReport.at >= since,
                    OutcomeReport.answer.in_(("yes", "no")),
                )
            )
        )
        .scalars()
        .all()
    )
    requests = (
        (
            await db.execute(
                select(FloatRequest)
                .where(FloatRequest.agent_ref.in_(refs))
                .order_by(FloatRequest.requested_at)
            )
        )
        .scalars()
        .all()
    )
    out: list[Forecast] = []
    for a in agents:
        drawn = 0
        visits = 0
        failures_today = 0
        for r in reports:
            if r.agent_ref != a.ref or side_of(r.transaction) != "cash":
                continue
            at = _aware(r.at)
            if at is None or at > now:
                continue
            if r.answer == "yes":
                visits += 1
                drawn += BAND_MIDPOINT.get(r.amount_band or "", 0)
            elif at >= start_today and (r.reason_code or "") in CAPACITY_FAILURES:
                failures_today += 1
        pace = drawn / WINDOW_DAYS
        ledger = ledgers[a.ref]
        ceiling = ledger.cash.ceiling(NETWORK_RANGES)
        days_left = (ceiling / pace) if (ceiling is not None and pace > 0) else None
        mine = [r for r in requests if r.agent_ref == a.ref]
        pending = any(r.state == "pending" for r in mine)
        topped = [r for r in mine if r.state in ("approved", "completed")]
        last_days = None
        last_text = None
        if topped:
            last_at = _aware(topped[-1].decided_at or topped[-1].requested_at)
            if last_at is not None:
                last_days = max(0.0, (now - last_at).total_seconds() / 86_400)
                last_text = f"Last top-up {age_text(int(last_days * 24 * 60))}"
        risk = risk_of(
            word=a.cash_out,
            capped=ledger.cash.cap_sle is not None,
            days_left=days_left,
            failures_today=failures_today,
            last_top_up_days=last_days,
            pace_per_day=pace,
        )
        reasons: list[str] = []
        if a.cash_out == "none":
            reasons.append("Says no cash right now.")
        if ledger.cash.cap_sle is not None:
            reasons.append("A customer could not be served for lack of cash since the last update.")
        if failures_today:
            n = failures_today
            reasons.append(f"{n} failed visit{'s' if n != 1 else ''} for lack of cash today.")
        if days_left is not None:
            reasons.append(days_left_text(days_left).capitalize() + ".")
        if visits:
            reasons.append(
                f"Confirmed visits drew cash {visits} time{'s' if visits != 1 else ''} in the last {WINDOW_DAYS} days."  # noqa: E501
            )
        elif a.cash_out in ("most", "some"):
            reasons.append("No confirmed visits in the last 7 days to learn a pace from yet.")
        reasons.append(f"{last_text}." if last_text else "No top-up on record.")
        if pending:
            reasons.append("A request is waiting for your decision.")
        out.append(
            Forecast(
                agent_ref=a.ref,
                agent_name=a.shop_name,
                risk=risk,
                reasons=reasons,
                days_left_text=days_left_text(days_left) if days_left is not None else None,
                last_top_up_text=last_text,
                pending_request=pending,
                call_url=f"tel:{a.phone}" if a.phone else None,
            )
        )
    out.sort(key=lambda f: (RISK_ORDER[f.risk], f.agent_name))
    return [f.as_dict() for f in out]


def forecast_counts(rows: list[dict]) -> dict[str, int]:
    counts = {"high": 0, "medium": 0, "low": 0}
    for r in rows:
        counts[r["risk"]] += 1
    return counts
