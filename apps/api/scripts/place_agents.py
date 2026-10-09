"""Demonstration only: give agents without a point a place on a real street in Lumley or
Aberdeen, so a locator walk-through has something to find. Nothing from Orange's record is
touched: the address, city and names stay exactly as the file says; only the coordinates are
set, and they are marked "placed" so the agent's own pin or the aggregator's replaces them.
A point a person set is never moved. --clear removes every placed point again.

Usage:
  python -m scripts.place_agents                       # report what would change
  python -m scripts.place_agents --apply               # write the points
  python -m scripts.place_agents --clear               # remove placed points again
  python -m scripts.place_agents --apply --pin 1234    # development only: one PIN for every account
"""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
from pathlib import Path

from app.core.auth import hash_pin
from app.db.models import Agent, Dealer
from app.db.session import get_session_factory
from app.services.points import check_point
from sqlalchemy import select

DATA = Path(__file__).resolve().parent.parent / "data" / "lumley_aberdeen_streets.json"

# Which sampled streets, and which stretch of them, count as each area. Wilkinson Road and
# Spur Road climb away from Lumley; Lumley Beach Road runs from Lumley up to Aberdeen.
AREAS: dict[str, list[tuple[str, float | None, float | None]]] = {
    "Lumley": [
        ("Lumley Beach Road", None, 8.468),
        ("Regent Road", None, 8.465),
        ("Wilkinson Road", None, 8.468),
        ("Spur Road", None, 8.465),
        ("Aberdeen Road", None, None),
        ("Peninsular Road", 8.445, None),
        ("Off Spur Road", None, None),
    ],
    "Aberdeen": [
        ("Lumley Beach Road", 8.478, None),
        ("Sir Samuel Lewis Road", None, None),
        ("Cape Road", None, None),
        ("Off Beach Road", None, None),
        ("Aberdeen Ferry Road", None, None),
    ],
}


def load_points(path: Path = DATA) -> dict[str, list[tuple[str, float, float]]]:
    """Per area, (street, lat, lng) points, in a stable order."""
    doc = json.loads(path.read_text(encoding="utf-8"))
    out: dict[str, list[tuple[str, float, float]]] = {}
    for area, rules in AREAS.items():
        pts: list[tuple[str, float, float]] = []
        for street, lo, hi in rules:
            for lat, lng in doc["streets"].get(street, []):
                if (lo is None or lat >= lo) and (hi is None or lat <= hi):
                    pts.append((street, lat, lng))
        out[area] = pts
    return out


def pick(points: dict[str, list[tuple[str, float, float]]], key: str, index: int):
    """Alternate areas by index so both fill evenly; the point within the area comes from a
    hash of the agent, so re-running gives the same answer and neighbours are not bunched."""
    areas = sorted(points)
    area = areas[index % len(areas)]
    pts = points[area]
    h = int(hashlib.sha256(key.encode()).hexdigest()[:8], 16)
    street, lat, lng = pts[h % len(pts)]
    return area, street, lat, lng


async def clear_placed() -> int:
    """Remove every script-placed point. Agents become unlocated until a person pins them."""
    async with get_session_factory()() as db:
        agents = (
            (await db.execute(select(Agent).where(Agent.location_source == "placed")))
            .scalars()
            .all()
        )
        for a in agents:
            a.lat, a.lng, a.location_source = None, None, None
        await db.commit()
        return len(agents)


async def place(apply: bool, pin: str | None, everyone: bool = False) -> dict[str, int]:
    points = load_points()
    counts = {"placed": 0, "kept": 0, "pins": 0}
    async with get_session_factory()() as db:
        agents = (await db.execute(select(Agent).order_by(Agent.ref))).scalars().all()
        for i, a in enumerate(agents):
            person_set = a.lat is not None and a.location_source in ("dealer", "agent")
            if person_set and not everyone:
                counts["kept"] += 1
                continue
            if a.lat is not None and a.location_source == "placed" and not everyone:
                counts["kept"] += 1
                continue
            area, street, lat, lng = pick(points, a.ref, i)
            check_point(lat, lng)
            print(f"  {a.ref:14s} -> a point on {street} ({area}); address unchanged")
            if apply:
                a.lat, a.lng = lat, lng
                a.location_source = "placed"
            counts["placed"] += 1
        if pin:
            for a in agents:
                a.pin_hash = hash_pin(pin, a.ref)
                counts["pins"] += 1
            for d in (await db.execute(select(Dealer))).scalars().all():
                d.pin_hash = hash_pin(pin, d.id)
                counts["pins"] += 1
        if apply:
            await db.commit()
    return counts


def main() -> None:
    ap = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    ap.add_argument("--apply", action="store_true", help="write the points (default: report only)")
    ap.add_argument("--pin", help="development only: set this PIN on every agent and aggregator")
    ap.add_argument("--everyone", action="store_true", help="also move points a person set")
    ap.add_argument("--clear", action="store_true", help="remove every placed point")
    args = ap.parse_args()
    if args.clear:
        print(json.dumps({"cleared": asyncio.run(clear_placed())}))
        return
    if args.pin and (not args.pin.isdigit() or not 4 <= len(args.pin) <= 6):
        raise SystemExit("PIN must be 4–6 digits")
    counts = asyncio.run(place(args.apply, args.pin, args.everyone))
    print(json.dumps(counts), "" if args.apply else "— dry run, add --apply to write")


if __name__ == "__main__":
    main()
