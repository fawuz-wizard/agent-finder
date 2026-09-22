"""Working hours: the agent's own schedule, applied by the system with a warning first.

A weekly pattern (Monday to Sunday, each a range or closed), a today-only change for one date
(half day, day off, different hours), and "stay open" past today's close. Outside these hours
the agent is closed to customers by their own instruction; fifteen minutes before the close
the app tells them so they can stay open. Nothing here expires silently: the state always
says why, and the agent can change today with one tap.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta

DAYS = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")
DAY_NAMES = {
    "mon": "Monday",
    "tue": "Tuesday",
    "wed": "Wednesday",
    "thu": "Thursday",
    "fri": "Friday",
    "sat": "Saturday",
    "sun": "Sunday",
}
CLOSING_WARNING_MIN = 15
MAX_EXTENSION_MIN = 4 * 60

Hours = tuple[int, int]  # minutes from midnight: open, close


def parse_hhmm(s: str) -> int:
    try:
        h, m = s.split(":")
        v = int(h) * 60 + int(m)
    except (ValueError, AttributeError) as e:
        raise ValueError(f"not a time: {s!r}") from e
    if not 0 <= v <= 24 * 60:
        raise ValueError(f"not a time: {s!r}")
    return v


def fmt(minutes: int) -> str:
    return f"{minutes // 60:02d}:{minutes % 60:02d}"


def _aware(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=UTC)


def parse_hours(value) -> Hours | None:
    """["08:00", "20:00"] → (480, 1200); None → closed. Open must come before close."""
    if value is None:
        return None
    if not isinstance(value, list | tuple) or len(value) != 2:
        raise ValueError("hours must be [open, close] or null")
    o, c = parse_hhmm(value[0]), parse_hhmm(value[1])
    if o >= c:
        raise ValueError("opening time must be before closing time")
    return o, c


def weekly_of(agent) -> dict[str, Hours | None]:
    """The weekly pattern; before one is set, the legacy open/close hours every day."""
    raw = getattr(agent, "schedule_json", None)
    if raw:
        data = json.loads(raw)
        return {d: parse_hours(data.get(d)) for d in DAYS}
    return {d: (agent.open_hour * 60, agent.close_hour * 60) for d in DAYS}


def overrides_of(agent) -> dict[str, Hours | None]:
    raw = getattr(agent, "overrides_json", None)
    if not raw:
        return {}
    return {k: parse_hours(v) for k, v in json.loads(raw).items()}


def hours_for(agent, day: datetime) -> tuple[Hours | None, bool]:
    """(hours for that date, whether a today-only change set them)."""
    key = day.date().isoformat()
    over = overrides_of(agent)
    if key in over:
        return over[key], True
    return weekly_of(agent)[DAYS[day.weekday()]], False


def extended_until(agent, now: datetime) -> datetime | None:
    until = _aware(getattr(agent, "extended_until", None))
    if until is None or until <= now or until.date() != now.date():
        return None
    return until


def is_open_by_schedule(agent, now: datetime) -> bool:
    hours, _ = hours_for(agent, now)
    minute = now.hour * 60 + now.minute
    if hours is not None and hours[0] <= minute < hours[1]:
        return True
    return extended_until(agent, now) is not None


def close_at(agent, now: datetime) -> datetime | None:
    """When today's open period ends, counting an extension. None when not open now."""
    if not is_open_by_schedule(agent, now):
        return None
    ext = extended_until(agent, now)
    hours, _ = hours_for(agent, now)
    scheduled = (
        now.replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(minutes=hours[1])
        if hours is not None
        else None
    )
    if ext is not None and (scheduled is None or ext > scheduled):
        return ext
    return scheduled


def closing_in_min(agent, now: datetime) -> int | None:
    """Minutes until the scheduled close when it is within the warning window, else None."""
    at = close_at(agent, now)
    if at is None:
        return None
    mins = int((at - now).total_seconds() // 60)
    return mins if 0 <= mins <= CLOSING_WARNING_MIN else None


def hours_text(agent, now: datetime) -> str:
    hours, override = hours_for(agent, now)
    ext = extended_until(agent, now)
    if hours is None and ext is None:
        return "Closed today"
    if is_open_by_schedule(agent, now):
        at = close_at(agent, now)
        base = f"Open today {fmt(hours[0])}–{fmt(hours[1])}" if hours else "Open today"
        if ext is not None and at is not None:
            base = f"{base} · staying open until {at.strftime('%H:%M')}"
        return f"Today only · {base[0].lower()}{base[1:]}" if override else base
    minute = now.hour * 60 + now.minute
    if hours is not None and minute < hours[0]:
        return f"Opens {fmt(hours[0])} today"
    return "Closed for today"


def state(agent, now: datetime) -> dict:
    hours, override = hours_for(agent, now)
    ext = extended_until(agent, now)
    at = close_at(agent, now)
    mins = closing_in_min(agent, now)
    return {
        "open_now": is_open_by_schedule(agent, now),
        "today": [fmt(hours[0]), fmt(hours[1])] if hours else None,
        "today_only": override,
        "extended_until": ext.isoformat() if ext else None,
        "closes_at": at.strftime("%H:%M") if at else None,
        "closing_in_min": mins,
        "hours_text": hours_text(agent, now),
        "notice": (
            f"Closing at {at.strftime('%H:%M')} by your schedule in {mins} min. Stay open?"
            if mins is not None and at is not None
            else None
        ),
    }


def weekly_payload(agent) -> dict[str, list[str] | None]:
    return {d: ([fmt(h[0]), fmt(h[1])] if h else None) for d, h in weekly_of(agent).items()}


def overrides_payload(agent, now: datetime) -> dict[str, list[str] | None]:
    today = now.date().isoformat()
    return {
        k: ([fmt(h[0]), fmt(h[1])] if h else None)
        for k, h in overrides_of(agent).items()
        if k >= today
    }


def set_weekly(agent, weekly: dict) -> None:
    parsed = {d: parse_hours(weekly.get(d)) for d in DAYS}
    if all(h is None for h in parsed.values()):
        raise ValueError("at least one day must be open")
    agent.schedule_json = json.dumps(
        {d: ([fmt(h[0]), fmt(h[1])] if h else None) for d, h in parsed.items()}
    )


def set_today(agent, now: datetime, hours) -> None:
    """A today-only change: hours, or None for a day off. Past dates are dropped."""
    parsed = parse_hours(hours)
    today = now.date().isoformat()
    over = {k: v for k, v in overrides_of(agent).items() if k >= today}
    over[today] = parsed
    agent.overrides_json = json.dumps(
        {k: ([fmt(h[0]), fmt(h[1])] if h else None) for k, h in over.items()}
    )
    agent.extended_until = None


def clear_today(agent, now: datetime) -> None:
    today = now.date().isoformat()
    over = {k: v for k, v in overrides_of(agent).items() if k > today}
    agent.overrides_json = json.dumps(
        {k: ([fmt(h[0]), fmt(h[1])] if h else None) for k, h in over.items()}
    )
    agent.extended_until = None


def extend_today(agent, now: datetime, minutes: int) -> datetime:
    """Stay open past today's close, or reopen now for a while after it."""
    if not 1 <= minutes <= MAX_EXTENSION_MIN:
        raise ValueError("extension must be between 1 minute and 4 hours")
    base = close_at(agent, now) or now
    until = base + timedelta(minutes=minutes)
    end_of_day = now.replace(hour=23, minute=59, second=0, microsecond=0)
    agent.extended_until = min(until, end_of_day)
    return agent.extended_until
