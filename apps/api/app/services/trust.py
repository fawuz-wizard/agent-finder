"""Trust score: how often an agent's word matched what customers found, learned from visit
reports against the status the customer was shown at the time. Dealer-facing only; it ranks
and flags, it never changes a word, and a customer never sees it — it only affects the order
of agents who are all "likely" for the request.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Agent, OutcomeReport
from app.services.ledger import CAPACITY_FAILURES, _aware

WINDOW_DAYS = 14
MIN_VISITS = 3
LABEL = {
    "reliable": "Reliable",
    "mixed": "Mixed",
    "unreliable": "Unreliable",
    "new": "No track record yet",
}
# Among agents who are all "likely", the order customers get: reliable and new first, then
# mixed, then unreliable. Never a reason to hide anyone.
RANK_TIER = {"reliable": 0, "new": 0, "mixed": 1, "unreliable": 2}


@dataclass(frozen=True)
class Trust:
    label: str
    visits: int
    matched: int

    @property
    def failed(self) -> int:
        return self.visits - self.matched

    @property
    def text(self) -> str:
        if self.label == "new":
            return (
                f"Fewer than {MIN_VISITS} visits confirmed in the last {WINDOW_DAYS} days — "
                "no track record yet."
            )
        return (
            f"{self.matched} of {self.visits} visits matched the status "
            f"in the last {WINDOW_DAYS} days."
        )

    def as_dict(self) -> dict:
        return {
            "label": self.label,
            "label_text": LABEL[self.label],
            "text": self.text,
            "visits": self.visits,
            "matched": self.matched,
        }


def score(visits: int, failed: int) -> Trust:
    """The rule, in one place: the share of visits where the word held up."""
    if visits < MIN_VISITS:
        return Trust("new", visits, visits - failed)
    rate = failed / visits
    label = "reliable" if rate <= 0.1 else "mixed" if rate <= 0.34 else "unreliable"
    return Trust(label, visits, visits - failed)


async def trust_for(db: AsyncSession, agents: list[Agent], now: datetime) -> dict[str, Trust]:
    """One score per agent from the reports of customers who were told "likely" and went."""
    out = {a.ref: score(0, 0) for a in agents}
    if not agents:
        return out
    since = now - timedelta(days=WINDOW_DAYS)
    rows = (
        (
            await db.execute(
                select(OutcomeReport).where(
                    OutcomeReport.agent_ref.in_(list(out)),
                    OutcomeReport.at >= since,
                    OutcomeReport.answer.in_(("yes", "no")),
                    OutcomeReport.outcome_at_report == "likely",
                )
            )
        )
        .scalars()
        .all()
    )
    visits: dict[str, int] = {}
    failed: dict[str, int] = {}
    for r in rows:
        at = _aware(r.at)
        if at is None or at > now:
            continue
        visits[r.agent_ref] = visits.get(r.agent_ref, 0) + 1
        if r.answer == "no" and (r.reason_code or "") in CAPACITY_FAILURES:
            failed[r.agent_ref] = failed.get(r.agent_ref, 0) + 1
    for ref in out:
        out[ref] = score(visits.get(ref, 0), failed.get(ref, 0))
    return out
