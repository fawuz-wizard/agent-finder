"""Sierra Leone's towns: which region each belongs to and where it sits on the map. One
table (data/towns.json) for the Orange import and the national map, so a town can never
be in one region for the import and another on the map. A town with no point yet still has
a region; its agents count in the region and are drawn as "no place on record"."""

from __future__ import annotations

import json
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

TOWNS_FILE = Path(__file__).resolve().parents[2] / "data" / "towns.json"
REGIONS = ("west", "north", "south", "east")
REGION_LABEL = {"west": "West", "north": "North", "south": "South", "east": "East"}


@dataclass(frozen=True)
class Town:
    key: str
    name: str
    region: str
    lat: float | None
    lng: float | None


@lru_cache(maxsize=1)
def _towns() -> dict[str, Town]:
    raw = json.loads(TOWNS_FILE.read_text(encoding="utf-8"))["towns"]
    return {k: Town(k, v["name"], v["region"], v.get("lat"), v.get("lng")) for k, v in raw.items()}


def town_for(city: str | None) -> Town | None:
    """The town a free-text city belongs to: an exact name, a name at the start
    ("Port Loko Town"), or a name among its words ("Wanjama Old Town Nimikoro")."""
    key = (city or "").strip().lower()
    if not key:
        return None
    towns = _towns()
    if key in towns:
        return towns[key]
    for name, town in towns.items():
        if key.startswith(name + " ") or name in key.split():
            return town
    return None


def region_for(city: str | None) -> str | None:
    t = town_for(city)
    return t.region if t else None
