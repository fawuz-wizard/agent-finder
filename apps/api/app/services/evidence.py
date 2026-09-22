"""Evidence by amount: what an agent usually serves, from their history rather than a word.

Three sources, in order of trust: the operator's records (served and declined by amount band,
last 30 days), the dealer's note at registration ("usually handles up to about SLE …"), and
the visits customers confirmed or failed through the app. The result is one ceiling per side
that the search, the forecast and the ranker compare against, with a sentence saying where it
came from. Nobody is asked to declare capacity, and nothing here changes what an agent set.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.settings import get_settings
from app.db.models import Agent, OutcomeReport
from app.integrations.operator.base import get_operator
from app.services.ledger import CAPACITY_FAILURES, _aware, side_of

BANDS: tuple[tuple[str, int], ...] = (
    ("≤500", 500),
    ("≤2k", 2_000),
    ("≤5k", 5_000),
    ("≤10k", 10_000),
    ("≤50k", 50_000),
    (">50k", 200_000),
)
BAND_CEILING = dict(BANDS)
WINDOW_DAYS = 30


@dataclass(frozen=True)
class SideEvidence:
    ceiling_sle: int | None
    source: str  # operator | dealer | visits | none
    text: str  # agent- and dealer-facing sentence; never shown to customers


def ceiling_from_bands(served: dict[str, int], declined: dict[str, int]) -> int | None:
    """The highest band served more often than declined, walking up from the smallest."""
    best = None
    for band, ceiling in BANDS:
        s, d = served.get(band, 0), declined.get(band, 0)
        if s > 0 and s > d:
            best = ceiling
        elif d > 0 and d >= s:
            break
    return best


async def evidence_for(
    db: AsyncSession, agents: list[Agent], now: datetime
) -> dict[str, dict[str, SideEvidence]]:
    """{ref: {"cash": SideEvidence, "float": SideEvidence}} for every agent, one query."""
    out: dict[str, dict[str, SideEvidence]] = {}
    refs = [a.ref for a in agents]
    since = now - timedelta(days=WINDOW_DAYS)
    rows = (
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
    served: dict[tuple[str, str], dict[str, int]] = {}
    failed: dict[tuple[str, str], dict[str, int]] = {}
    for r in rows:
        at = _aware(r.at)
        if at is None or at > now or not r.amount_band:
            continue
        key = (r.agent_ref, side_of(r.transaction))
        if r.answer == "yes":
            served.setdefault(key, {})[r.amount_band] = (
                served.get(key, {}).get(r.amount_band, 0) + 1
            )
        elif (r.reason_code or "") in CAPACITY_FAILURES:
            failed.setdefault(key, {})[r.amount_band] = (
                failed.get(key, {}).get(r.amount_band, 0) + 1
            )
    feed = get_settings().operator_feed
    op = get_operator() if feed else None
    for a in agents:
        hist = await op.history(a.ref, now) if op is not None else None
        sides: dict[str, SideEvidence] = {}
        for side in ("cash", "float"):
            if hist is not None:
                by_served = hist.served_by_band.get(side, {})
                by_declined = hist.declined_by_band.get(side, {})
                c = ceiling_from_bands(by_served, by_declined)
                n = sum(by_served.values())
                sides[side] = SideEvidence(
                    c,
                    "operator",
                    f"{hist.source}: {n} served in the last {WINDOW_DAYS} days"
                    + (f", usually up to about SLE {c:,}" if c else ", none above SLE 500"),
                )
                continue
            usual = a.usual_max_sle if side == "cash" else a.usual_float_max_sle
            s = served.get((a.ref, side), {})
            f = failed.get((a.ref, side), {})
            from_visits = ceiling_from_bands(s, f)
            if usual is not None:
                c = usual if from_visits is None else max(usual, from_visits)
                sides[side] = SideEvidence(
                    c, "dealer", f"Your dealer noted you usually handle up to about SLE {c:,}"
                )
            elif from_visits is not None:
                sides[side] = SideEvidence(
                    from_visits,
                    "visits",
                    f"{sum(s.values())} confirmed visits in the last {WINDOW_DAYS} days, "
                    f"usually up to about SLE {from_visits:,}",
                )
            else:
                sides[side] = SideEvidence(None, "none", "No record for this side yet")
        out[a.ref] = sides
    return out
