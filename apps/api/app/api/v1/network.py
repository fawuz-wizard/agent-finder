"""The national map's data: the count summary, the agents behind a row, and the same rows as
a CSV file for Excel. VIEW_NATIONAL sees the whole country; any other aggregator sees only
their own agents and their sub-aggregators'. Read only; no money field, by test."""

from __future__ import annotations

import csv
import io
from typing import Literal

from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import Principal, require_permission
from app.core.errors import NotFoundError
from app.db.models import Agent, Dealer
from app.db.session import get_session
from app.services.network_map import app_days, scope_agents, summary, transacting
from app.services.photo import public_photo_url
from app.services.phrasing import is_open_now, now_utc
from app.services.points import on_map
from app.services.towns import REGION_LABEL, REGIONS, town_for

router = APIRouter(prefix="/dealer/map", tags=["national map"])

Region = Literal["west", "north", "south", "east", "none"]


async def _me(db: AsyncSession, p: Principal) -> Dealer:
    me = await db.get(Dealer, p.subject)
    if me is None:
        raise NotFoundError("Not available.")
    return me


@router.get("/summary", summary="Counts by region, aggregator and town — never money")
async def map_summary(
    p: Principal = Depends(require_permission("VIEW_AGENT")),
    db: AsyncSession = Depends(get_session),
) -> dict:
    me = await _me(db, p)
    return await summary(db, me, p.can("VIEW_NATIONAL"), now_utc())


def _region_of(a: Agent) -> str | None:
    if a.region in REGIONS:
        return a.region
    t = town_for(a.city)
    return t.region if t else None


async def _rows(
    db: AsyncSession, p: Principal, region: str | None, aggregator: str | None, city: str | None
) -> list[dict]:
    me = await _me(db, p)
    now = now_utc()
    agents = await scope_agents(db, me.id, p.can("VIEW_NATIONAL"))
    names = {d.id: d.name for d in await _dealers(db)}
    picked = []
    for a in agents:
        r = _region_of(a)
        if region and (r or "none") != region:
            continue
        if aggregator and a.dealer_id != aggregator:
            continue
        t = town_for(a.city)
        if city and (t.key if t else (a.city or "").strip().lower()) != city.strip().lower():
            continue
        picked.append((a, r, t))
    days = await app_days(db, [a.ref for a, _, _ in picked], now)
    out = []
    for a, r, t in picked:
        confirmed = a.lat is not None and a.lng is not None and bool(a.location_confirmed)
        out.append(
            {
                "ref": a.ref,
                "shop_name": a.shop_name,
                "aggregator_id": a.dealer_id,
                "aggregator": names.get(a.dealer_id, a.dealer_id),
                "region": r,
                "region_label": REGION_LABEL.get(r or "", "No place on record"),
                "city": t.name if t else (a.city or None),
                "street": a.street,
                "active_at_orange": bool(a.active),
                "transacting": transacting(a),
                "app_days": days.get(a.ref, 0),
                "located": a.lat is not None and a.lng is not None,
                "confirmed": confirmed,
                "open_now": a.presence == "open" and is_open_now(a, now),
                # The point only once confirmed; the photo only once customers can be sent.
                "lat": a.lat if confirmed else None,
                "lng": a.lng if confirmed else None,
                "photo_url": public_photo_url(a) if on_map(a) else None,
            }
        )
    return out


async def _dealers(db: AsyncSession) -> list[Dealer]:
    return list((await db.execute(select(Dealer))).scalars().all())


@router.get("/agents", summary="The agents behind one row of the map — never money")
async def map_agents(
    region: Region | None = Query(default=None),
    aggregator: str | None = Query(default=None, max_length=40),
    city: str | None = Query(default=None, max_length=80),
    p: Principal = Depends(require_permission("VIEW_AGENT")),
    db: AsyncSession = Depends(get_session),
) -> list[dict]:
    return await _rows(db, p, region, aggregator, city)


CSV_COLUMNS = [
    ("ref", "Agent"),
    ("shop_name", "Shop"),
    ("aggregator", "Aggregator"),
    ("region_label", "Region"),
    ("city", "Town"),
    ("street", "Street"),
    ("active_at_orange", "Active at Orange"),
    ("transacting", "Transacting (Orange file)"),
    ("app_days", "Days using the app (last 7)"),
    ("located", "Located"),
    ("confirmed", "Confirmed on the map"),
]


def _cell(v) -> str:
    """Excel-safe: yes/no for booleans, "no file figure" for none, and a leading quote on
    anything Excel would read as a formula."""
    if v is True:
        return "yes"
    if v is False:
        return "no"
    if v is None:
        return "no file figure"
    s = str(v)
    return "'" + s if s[:1] in ("=", "+", "-", "@") else s


@router.get("/agents.csv", summary="The same rows as a CSV file that opens in Excel")
async def map_agents_csv(
    region: Region | None = Query(default=None),
    aggregator: str | None = Query(default=None, max_length=40),
    city: str | None = Query(default=None, max_length=80),
    p: Principal = Depends(require_permission("VIEW_AGENT")),
    db: AsyncSession = Depends(get_session),
) -> Response:
    rows = await _rows(db, p, region, aggregator, city)
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow([label for _, label in CSV_COLUMNS])
    for r in rows:
        w.writerow([_cell(r[k]) if k != "city" or r[k] else "" for k, _ in CSV_COLUMNS])
    return Response(
        content=buf.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="agent-network.csv"'},
    )
