"""Freshness: how much to trust a status given its age.

Windows are configuration (loaded from the settings table by the service layer), never constants
scattered through the app. Defaults match the approved product spec.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta

from app.domain.types import FreshnessState


@dataclass(frozen=True)
class FreshnessWindows:
    fresh_until: timedelta = timedelta(minutes=90)
    ageing_until: timedelta = timedelta(hours=2)
    may_have_changed_until: timedelta = timedelta(hours=4)

    def __post_init__(self) -> None:
        if not (self.fresh_until < self.ageing_until < self.may_have_changed_until):
            raise ValueError("freshness windows must be strictly increasing")


DEFAULT_WINDOWS = FreshnessWindows()


def freshness_state(
    updated_at: datetime | None, now: datetime, windows: FreshnessWindows = DEFAULT_WINDOWS
) -> FreshnessState:
    """Classify a status by age. A missing timestamp is NOT_SET, never treated as fresh."""
    if updated_at is None:
        return FreshnessState.NOT_SET
    age = now - updated_at
    if age < timedelta(0):
        # Clock skew from a client is not our problem to trust; treat as just now.
        age = timedelta(0)
    if age < windows.fresh_until:
        return FreshnessState.FRESH
    if age < windows.ageing_until:
        return FreshnessState.AGEING
    if age < windows.may_have_changed_until:
        return FreshnessState.MAY_HAVE_CHANGED
    return FreshnessState.EXPIRED


def expires_at(updated_at: datetime, windows: FreshnessWindows = DEFAULT_WINDOWS) -> datetime:
    return updated_at + windows.may_have_changed_until


def relative_label(updated_at: datetime | None, now: datetime) -> str:
    """Human wording for the freshness line. Relative times only; never clock times."""
    if updated_at is None:
        return "No availability given yet"
    seconds = max(0, int((now - updated_at).total_seconds()))
    if seconds < 60:
        return "Updated just now"
    minutes = seconds // 60
    if minutes < 60:
        return f"Updated {minutes} min ago"
    hours, rem = divmod(minutes, 60)
    if hours < 24:
        return f"Updated {hours} h {rem} m ago" if rem else f"Updated {hours} h ago"
    days = hours // 24
    return f"Last updated {days} day{'s' if days != 1 else ''} ago"
