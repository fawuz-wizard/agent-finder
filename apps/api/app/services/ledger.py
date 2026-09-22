"""Predictive availability, pilot edition: a two-sided ledger per agent built from the visits
customers confirmed through the app, so the phrase a customer reads tracks what has probably
happened since the agent last spoke.

Rules on real events, nothing more. The ledger never changes what the agent declared; it
lowers the ceiling the search compares against, and tells the agent why. A cash-out takes
cash out and puts e-float in; a deposit does the reverse. Only visits after the current
declaration count, so a refresh by the agent starts the ledger again from their own words.
Once Orange Money sends real transactions the same ledger stops estimating and becomes exact.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.settings import get_settings
from app.db.models import Agent, OutcomeReport
from app.domain.capacity import SideThresholds
from app.integrations.operator.base import get_operator

# Reports keep a band, never the exact amount (privacy). A confirmed visit moves the band's
# midpoint; a failed one caps the side at the band's floor, the safe reading for the next
# customer, since we only know the agent could not cover something in that band.
BAND_MIDPOINT = {
    "≤500": 250,
    "≤2k": 1_250,
    "≤5k": 3_500,
    "≤10k": 7_500,
    "≤50k": 30_000,
    ">50k": 50_000,
}
BAND_FLOOR = {"≤500": 1, "≤2k": 501, "≤5k": 2_001, "≤10k": 5_001, "≤50k": 10_001, ">50k": 50_001}
BAND_TEXT = {
    "≤500": "under SLE 500",
    "≤2k": "SLE 500 to 2,000",
    "≤5k": "SLE 2,000 to 5,000",
    "≤10k": "SLE 5,000 to 10,000",
    "≤50k": "SLE 10,000 to 50,000",
    ">50k": "over SLE 50,000",
}
# The customer's reason codes that say "the agent did not have the money", as opposed to a
# fee complaint or a closed shop, which say nothing about capacity.
CAPACITY_FAILURES = ("could_not_complete", "less_than_requested")

SIDE_LABEL = {"cash": "Cash out", "float": "Deposit"}


def _aware(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=UTC)


def side_of(tx: str | None) -> str:
    return "cash" if (tx or "cash_out") in ("cash_out", "withdraw") else "float"


def word_for_figure(sle: int, ranges: SideThresholds) -> str:
    """The word a figure implies, so dealers keep seeing words and nothing else changes."""
    if sle <= 0:
        return "none"
    if sle <= ranges.small_max_sle:
        return "small"
    if sle <= ranges.some_max_sle:
        return "some"
    return "most"


def amount_label(sle: int) -> str:
    return f"SLE {sle:,}"


@dataclass
class SideLedger:
    side: str
    word: str | None
    declared_sle: int | None
    net_out_sle: int = 0
    confirmed_visits: int = 0
    cap_sle: int | None = None
    cap_at: datetime | None = None
    cap_band: str | None = None

    @property
    def estimate_sle(self) -> int | None:
        if self.declared_sle is None:
            return None
        return max(0, self.declared_sle - self.net_out_sle)

    def ceiling(self, ranges: SideThresholds) -> int | None:
        """Largest amount that reads as likely right now. None means no upper bound."""
        if self.declared_sle is not None:
            base: int | None = self.estimate_sle
        elif self.word == "none":
            base = 0
        elif self.word == "small":
            base = ranges.small_max_sle
        elif self.word == "some":
            base = ranges.some_max_sle
        else:
            base = None
        if self.cap_sle is not None:
            capped = max(0, self.cap_sle - 1)
            base = capped if base is None else min(base, capped)
        return base

    def outcome(self, amount_sle: int | None, ranges: SideThresholds) -> str:
        c = self.ceiling(ranges)
        if c is None:
            return "likely"
        if amount_sle is None:
            return "limited" if c <= 0 else "likely"
        return "likely" if amount_sle <= c else "limited"

    def estimate_text(self) -> str | None:
        """For the agent only: their figure, and what confirmed visits leave of it."""
        if self.declared_sle is None:
            return None
        text = f"You said up to {amount_label(self.declared_sle)}"
        if self.confirmed_visits:
            n = self.confirmed_visits
            text += (
                f" · {n} confirmed visit{'s' if n != 1 else ''} since"
                f" · about {amount_label(self.estimate_sle or 0)} left"
            )
        return text

    def why_text(self) -> str | None:
        """For the agent only: the event that lowered the ceiling, so they can dispute it."""
        if self.cap_sle is None or self.cap_at is None or self.cap_band is None:
            return None
        label = SIDE_LABEL[self.side].lower()
        return (
            f"A customer reported a failed {label} of {BAND_TEXT[self.cap_band]} at "
            f"{self.cap_at.strftime('%H:%M')}, so amounts of {amount_label(self.cap_sle)} and "
            "above read as limited until you refresh your status."
        )


@dataclass
class Ledger:
    cash: SideLedger
    float: SideLedger
    last_event_at: datetime | None = None
    events: int = field(default=0)
    # "agent": words and figure the agent gave, moved by app-confirmed visits.
    # "operator": the host system's position, read just now; nothing to refresh.
    source: str = "agent"
    feed_age_min: int | None = None
    feed_source: str | None = None
    failed_for_float_today: int = 0
    tx_last_hour: int = 0

    @property
    def live(self) -> bool:
        return self.source == "operator"

    def side(self, tx: str | None) -> SideLedger:
        return self.cash if side_of(tx) == "cash" else self.float

    def updated_at(self, now: datetime) -> datetime | None:
        """When the capacity behind the phrase was last known to be true."""
        if self.live and self.feed_age_min is not None:
            from datetime import timedelta

            return now - timedelta(minutes=self.feed_age_min)
        return None

    def nudge_reason(self, ranges: SideThresholds) -> str | None:
        """Why the agent should be asked "still correct?" now, independent of the clock:
        a failed visit lowered a side, or confirmed visits moved a figure into another word.
        With the operator feed on there is nothing to ask: the position is read, not told."""
        if self.live:
            return None
        for s in (self.cash, self.float):
            if s.cap_sle is not None:
                return s.why_text()
        for s in (self.cash, self.float):
            if s.declared_sle is None or not s.confirmed_visits:
                continue
            if word_for_figure(s.estimate_sle or 0, ranges) != word_for_figure(
                s.declared_sle, ranges
            ):
                return (
                    f"{SIDE_LABEL[s.side]}: confirmed visits since you said "
                    f"{amount_label(s.declared_sle)} leave about "
                    f"{amount_label(s.estimate_sle or 0)}."
                )
        return None


def empty_ledger(a: Agent) -> Ledger:
    return Ledger(
        cash=SideLedger("cash", a.cash_out, a.cash_out_sle),
        float=SideLedger("float", a.deposit, a.deposit_sle),
    )


async def ledgers_for(db: AsyncSession, agents: list[Agent], now: datetime) -> dict[str, Ledger]:
    """One ledger per agent from the visits confirmed since each agent's current declaration.
    One query for the whole list, so the search pays for it once."""
    out = {a.ref: empty_ledger(a) for a in agents}
    declared = {a.ref: _aware(a.declared_at) for a in agents}
    since = [d for d in declared.values() if d is not None]
    if not since:
        return out
    rows = (
        (
            await db.execute(
                select(OutcomeReport)
                .where(
                    OutcomeReport.agent_ref.in_(list(out)),
                    OutcomeReport.at >= min(since),
                    OutcomeReport.answer.in_(("yes", "no")),
                )
                .order_by(OutcomeReport.at)
            )
        )
        .scalars()
        .all()
    )
    for r in rows:
        start = declared.get(r.agent_ref)
        at = _aware(r.at)
        if start is None or at is None or at < start or at > now:
            continue
        ledger = out[r.agent_ref]
        band = r.amount_band
        side = ledger.side(r.transaction)
        other = ledger.float if side is ledger.cash else ledger.cash
        if r.answer == "yes":
            ledger.events += 1
            ledger.last_event_at = at
            side.confirmed_visits += 1
            if band in BAND_MIDPOINT:
                side.net_out_sle += BAND_MIDPOINT[band]
                other.net_out_sle -= BAND_MIDPOINT[band]
        elif band in BAND_FLOOR and (r.reason_code or "") in CAPACITY_FAILURES:
            ledger.events += 1
            ledger.last_event_at = at
            floor = BAND_FLOOR[band]
            if side.cap_sle is None or floor < side.cap_sle:
                side.cap_sle, side.cap_at, side.cap_band = floor, at, band
    if get_settings().operator_feed:
        op = get_operator()
        for a in agents:
            act = await op.activity(a.ref, now)
            if act is None:
                continue  # not on the feed: the agent's own words stand
            ledger = out[a.ref]
            # The position replaces words, figure and app-counted movement; a failed visit
            # reported after this reading still caps until the next reading.
            ledger.cash = SideLedger(
                "cash", word_for_figure(act.cash_sle, ranges_now()), act.cash_sle
            )
            ledger.float = SideLedger(
                "float", word_for_figure(act.float_sle, ranges_now()), act.float_sle
            )
            ledger.source = "operator"
            ledger.feed_age_min = act.last_transaction_min_ago
            ledger.feed_source = act.source
            ledger.failed_for_float_today = act.failed_for_float_today
            ledger.tx_last_hour = act.transactions_last_hour
    return out


def ranges_now() -> SideThresholds:
    from app.services.phrasing import NETWORK_RANGES

    return NETWORK_RANGES
