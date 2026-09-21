"""Everything the screens render as words is phrased here, once, on the server.
Network-wide capacity ranges (v2.1): None 0 · Small ≤ 500 · Some ≤ 10,000 · Most above."""

from __future__ import annotations

import math
from datetime import UTC, datetime

from app.domain.capacity import SideThresholds, compare
from app.domain.freshness import DEFAULT_WINDOWS, freshness_state
from app.domain.types import CapacityCategory, FreshnessState, PublicOutcome

NETWORK_RANGES = SideThresholds(some_max_sle=10_000, small_max_sle=500)

TRANSACTION_LABELS = {"cash_out": "Cash out", "deposit": "Deposit", "send": "Send"}
PUBLIC_TEXT = {
    "likely": "Can likely handle your request",
    "limited": "Limited — may not cover this amount",
    "expired": "Status expired — ask before you go",
    "closed": "Closed",
    "hidden": "Availability hidden",
    "not_set": "Status not set",
}
CAPACITY_LABEL = {"most": "Most", "some": "Some", "small": "Small", "none": "None"}
PRESENCE_LABEL = {"open": "Open · serving", "hidden": "Hidden", "closed": "Closed"}


def now_utc() -> datetime:
    return datetime.now(UTC)


def normalise_tx(tx: str) -> str:
    return "cash_out" if tx in ("withdraw", "cash_out") else tx


def side_for(tx: str) -> str:
    return "cash" if normalise_tx(tx) == "cash_out" else "float"


def word_for(agent, tx: str) -> str | None:
    return agent.cash_out if side_for(tx) == "cash" else agent.deposit


def age_minutes(declared_at: datetime | None, now: datetime) -> int | None:
    if declared_at is None:
        return None
    if declared_at.tzinfo is None:
        declared_at = declared_at.replace(tzinfo=UTC)
    return max(0, int((now - declared_at).total_seconds() // 60))


def freshness_of(declared_at: datetime | None, now: datetime) -> str:
    if declared_at is not None and declared_at.tzinfo is None:
        declared_at = declared_at.replace(tzinfo=UTC)
    st = freshness_state(declared_at, now, DEFAULT_WINDOWS)
    return {
        FreshnessState.FRESH: "fresh",
        FreshnessState.AGEING: "aging",
        FreshnessState.MAY_HAVE_CHANGED: "may_have_changed",
        FreshnessState.EXPIRED: "expired",
        FreshnessState.NOT_SET: "expired",
    }[st]


def age_text(min_: int | None) -> str:
    if min_ is None:
        return "not set"
    if min_ < 1:
        return "just now"
    if min_ < 60:
        return f"{min_} min ago"
    h, m = divmod(min_, 60)
    if h < 24:
        return f"{h} h {m} min ago" if m else f"{h} h ago"
    d = h // 24
    return f"{d} day{'s' if d != 1 else ''} ago"


def freshness_text(declared_at: datetime | None, now: datetime) -> str:
    mins = age_minutes(declared_at, now)
    if mins is None:
        return "No status yet"
    f = freshness_of(declared_at, now)
    base = f"Updated {age_text(mins)}"
    if f == "expired":
        return f"{base} — expired"
    if f == "may_have_changed":
        return f"{base} — may have changed"
    return base


def is_open_now(agent, now: datetime) -> bool:
    # Product timezone is Africa/Freetown = UTC; keep it simple for the pilot.
    hour = now.hour
    return agent.open_hour <= hour < agent.close_hour


def public_outcome(agent, tx: str, amount: int | None, now: datetime) -> str:
    if agent.presence == "hidden":
        return "hidden"
    if agent.presence == "closed" or (agent.night_mode and not is_open_now(agent, now)):
        return "closed"
    if freshness_of(agent.declared_at, now) == "expired":
        return "expired"
    word = word_for(agent, tx)
    if word is None:
        return "not_set"
    out = compare(CapacityCategory(word), NETWORK_RANGES, amount)
    return {
        PublicOutcome.LIKELY: "likely",
        PublicOutcome.LIMITED: "limited",
        PublicOutcome.NOT_SET: "not_set",
    }[out]


def haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> int:
    r = 6_371_000
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = math.radians(lat2 - lat1), math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return int(2 * r * math.asin(math.sqrt(a)))


def amount_label(amount: int | None) -> str | None:
    return None if amount is None else f"SLE {amount:,}"


def amount_band(amount: int | None) -> str | None:
    if amount is None:
        return None
    for ceiling, label in (
        (500, "≤500"),
        (2_000, "≤2k"),
        (5_000, "≤5k"),
        (10_000, "≤10k"),
        (50_000, "≤50k"),
    ):
        if amount <= ceiling:
            return label
    return ">50k"


# Coarse area centroids used when the customer declined location.
AREA_POINTS = {
    "Lumley": (8.4405, -13.2795),
    "Aberdeen": (8.4842, -13.2711),
    "Wilberforce": (8.4617, -13.2629),
    "Congo Cross": (8.4790, -13.2560),
    "Freetown": (8.4657, -13.2317),
}
