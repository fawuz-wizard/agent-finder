"""The national map: how many agents there are and how many are working, by region, by
aggregator and by town, for Orange's head of sales and, scoped to their own agents, for each
aggregator. It only reads. No money figure is ever part of it.

Definitions (sent with every summary, printed in the table's headers):
- Registered: every agent in scope, whatever their status.
- Transacting: active at Orange and with transactions in Orange's file. An agent with no file
  figure (registered in the app) is counted apart, never as zero.
- Using the app: opened, closed or hid the shop, or recorded a transaction, in the last 7 x 24
  hours. A sign-in alone does not count, nor anything the seed or an import wrote.
- Located: the shop has a point. Confirmed: the aggregator confirmed it; only confirmed shops
  get a pin on the map.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Agent, AgentTransaction, AvailabilityEvent, Dealer
from app.services.towns import REGION_LABEL, REGIONS, town_for

WINDOW = timedelta(days=7)
FILE_MONTH = "April 2026"
SUB_LEVELS = 5  # sub-aggregators are followed this deep, no further
NOT_BY_AGENT = ("seed", "import")
DEFINITIONS = {
    "registered": "Every agent on record, whatever their status.",
    "transacting": f"Active at Orange with transactions in Orange's file ({FILE_MONTH}).",
    "app": "Opened, closed or recorded a transaction in the app in the last 7 days.",
    "located": "The shop has a pin on the map.",
    "confirmed": "The aggregator confirmed the pin, so customers can find the shop.",
    "file_month": FILE_MONTH,
}


@dataclass
class Counts:
    registered: int = 0
    transacting: int = 0
    no_file_figure: int = 0
    app_active: int = 0
    located: int = 0
    confirmed: int = 0

    def add(self, a: Agent, app_on: bool) -> None:
        self.registered += 1
        if a.orange_tx_count is None:
            self.no_file_figure += 1
        elif a.active and a.orange_tx_count > 0:
            self.transacting += 1
        self.app_active += app_on
        located = a.lat is not None and a.lng is not None
        self.located += located
        self.confirmed += located and bool(a.location_confirmed)

    def out(self) -> dict:
        return dict(self.__dict__)


def transacting(a: Agent) -> bool | None:
    """True or False from Orange's file; None when the file has no figure for this agent."""
    if a.orange_tx_count is None:
        return None
    return bool(a.active) and a.orange_tx_count > 0


async def scope_agents(db: AsyncSession, dealer_id: str, national: bool) -> list[Agent]:
    """Every agent for a national account; otherwise the aggregator's own agents and those of
    their sub-aggregators, followed through parent_id up to SUB_LEVELS deep. The scope comes
    from the signed-in account only, never from the request."""
    if national:
        return list((await db.execute(select(Agent).order_by(Agent.ref))).scalars().all())
    ids = {dealer_id}
    frontier = {dealer_id}
    for _ in range(SUB_LEVELS):
        rows = (await db.execute(select(Dealer.id).where(Dealer.parent_id.in_(frontier)))).all()
        frontier = {r[0] for r in rows} - ids
        if not frontier:
            break
        ids |= frontier
    stmt = select(Agent).where(Agent.dealer_id.in_(ids)).order_by(Agent.ref)
    return list((await db.execute(stmt)).scalars().all())


async def app_days(db: AsyncSession, refs: list[str], now: datetime) -> dict[str, int]:
    """On how many of the last 7 days each agent did something in the app. Two grouped
    queries for the whole list, whatever its size."""
    since = now - WINDOW
    days: dict[str, set] = {r: set() for r in refs}
    if not refs:
        return {}
    ev = await db.execute(
        select(AvailabilityEvent.agent_ref, func.date(AvailabilityEvent.at))
        .where(
            AvailabilityEvent.agent_ref.in_(refs),
            AvailabilityEvent.at >= since,
            AvailabilityEvent.source.not_in(NOT_BY_AGENT),
        )
        .group_by(AvailabilityEvent.agent_ref, func.date(AvailabilityEvent.at))
    )
    tx = await db.execute(
        select(AgentTransaction.agent_ref, func.date(AgentTransaction.at))
        .where(AgentTransaction.agent_ref.in_(refs), AgentTransaction.at >= since)
        .group_by(AgentTransaction.agent_ref, func.date(AgentTransaction.at))
    )
    for ref, day in [*ev.all(), *tx.all()]:
        days[ref].add(day)
    return {r: len(d) for r, d in days.items()}


async def summary(db: AsyncSession, me: Dealer, national: bool, now: datetime) -> dict:
    agents = await scope_agents(db, me.id, national)
    used = await app_days(db, [a.ref for a in agents], now)
    dealers = {d.id: d for d in (await db.execute(select(Dealer))).scalars().all()}

    totals = Counts()
    regions: dict[str, Counts] = {r: Counts() for r in REGIONS}
    by_agg: dict[tuple[str, str], Counts] = {}
    towns: dict[str, dict] = {}
    unplaced = Counts()  # the table's last row: no region at all
    no_point = Counts()  # the map's off-coast bubble: everyone the map cannot place
    reasons = {"no_town": 0, "town_not_on_record": 0}

    for a in agents:
        on = used.get(a.ref, 0) > 0
        totals.add(a, on)
        town = town_for(a.city)
        region = a.region if a.region in REGIONS else (town.region if town else None)
        if region is None:
            unplaced.add(a, on)
            no_point.add(a, on)
            reasons["no_town" if not (a.city or "").strip() else "town_not_on_record"] += 1
            continue
        regions[region].add(a, on)
        by_agg.setdefault((region, a.dealer_id), Counts()).add(a, on)
        if town and town.lat is not None:
            t = towns.setdefault(
                town.key,
                {
                    "city": town.name,
                    "region": region,
                    "lat": town.lat,
                    "lng": town.lng,
                    "c": Counts(),
                },
            )
            t["c"].add(a, on)
        else:
            # A region but no point yet: counted in its region, drawn in the off-coast bubble.
            no_point.add(a, on)

    def agg_row(region: str, did: str, c: Counts) -> dict:
        d = dealers.get(did)
        return {
            "id": did,
            "name": d.name if d else did,
            "parent_id": d.parent_id if d else None,
            **c.out(),
        }

    return {
        "generated_at": now.isoformat(),
        "scope": "national" if national else "aggregator",
        "scope_name": "Sierra Leone" if national else me.name,
        "definitions": DEFINITIONS,
        "totals": totals.out(),
        "regions": [
            {
                "region": r,
                "label": REGION_LABEL[r],
                **regions[r].out(),
                "aggregators": sorted(
                    (agg_row(r, did, c) for (rr, did), c in by_agg.items() if rr == r),
                    key=lambda x: (-x["registered"], x["name"]),
                ),
            }
            for r in REGIONS
        ],
        "towns": sorted(
            ({k: v for k, v in t.items() if k != "c"} | t["c"].out() for t in towns.values()),
            key=lambda x: -x["registered"],
        ),
        "unplaced": {**unplaced.out(), "reasons": reasons},
        # Off the coast, so it is visible and never mistaken for a real town.
        "no_point": {**no_point.out(), "lat": 7.90, "lng": -13.60},
    }
