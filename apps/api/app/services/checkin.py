"""Staying visible: customers see an agent during working hours only while the agent's app has
recently confirmed them at the shop pin. No question is ever asked. The app checks in when it
opens, when a transaction is recorded and every five minutes while it is open. More than
LEFT_PIN_METRES from the pin (decided on the phone): hidden at once, shown again on return.
No check-in for CHECKIN_WINDOW: hidden until the app is opened at the shop. Each working day
starts afresh: the window and an away from the night before count from today's opening.
Agents whose app has never checked in are not affected, so imported and registered shops keep
their listing until the agent starts using the app.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from app.services import schedule

CHECKIN_WINDOW = timedelta(hours=2)
REMIND_BEFORE = timedelta(minutes=15)
LEFT_PIN_METRES = 300


def _aware(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=UTC)


def opened_today(agent, now: datetime) -> datetime | None:
    """Today's opening time, if the shop has opened yet today."""
    hours, _ = schedule.hours_for(agent, now)
    if hours is None:
        return None
    opening = now.replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(minutes=hours[0])
    return opening if opening <= now else None


def state(agent, now: datetime) -> dict | None:
    """The check-in picture for one agent, or None when their app has never checked in."""
    c = getattr(agent, "checkin", None)
    if c is None:
        return None
    start = opened_today(agent, now)
    last = _aware(c.last_at)
    away = _aware(c.away_since)
    # A new working day starts afresh: last night's away and the old check-in do not count.
    if start is not None and away is not None and away < start:
        away = None
    counted = max(last, start) if start is not None else last
    until = counted + CHECKIN_WINDOW
    if away is not None:
        reason = "away_from_pin"
    elif until <= now:
        reason = "no_checkin"
    else:
        reason = None
    return {
        "last_at": last.isoformat(),
        "visible_until": until.isoformat(),
        "away_since": away.isoformat() if away else None,
        "location_check": bool(c.location_check),
        "hidden_reason": reason,
    }


def hidden_reason(agent, now: datetime) -> str | None:
    """'away_from_pin' or 'no_checkin' while that keeps customers away; None otherwise."""
    s = state(agent, now)
    return s["hidden_reason"] if s else None


def reason_text(agent, now: datetime) -> str | None:
    """The words the agent and their aggregator read; never a distance or a position."""
    s = state(agent, now)
    if not s or not s["hidden_reason"]:
        return None
    if s["hidden_reason"] == "away_from_pin":
        since = datetime.fromisoformat(s["away_since"])
        return f"Hidden · away from the pin since {since:%H:%M}"
    return f"Hidden · no check-in since {datetime.fromisoformat(s['last_at']):%H:%M}"
