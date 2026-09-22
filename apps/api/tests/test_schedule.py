"""Working hours are the agent's own instruction, applied by the system with a warning first."""

from __future__ import annotations

from datetime import UTC, datetime
from types import SimpleNamespace

import pytest
from app.services import schedule as sch

HDR = {"X-Client": "cust-hours"}


def agent(**kw):
    base = dict(
        open_hour=7, close_hour=20, schedule_json=None, overrides_json=None, extended_until=None
    )  # noqa: E501
    base.update(kw)
    return SimpleNamespace(**base)


def at(h, m=0, day=22):
    return datetime(2026, 9, day, h, m, tzinfo=UTC)  # 22 Sep 2026 is a Tuesday


def test_legacy_hours_stand_in_until_a_pattern_is_set():
    a = agent()
    assert sch.is_open_by_schedule(a, at(12)) and not sch.is_open_by_schedule(a, at(20))
    assert sch.hours_text(a, at(12)) == "Open today 07:00–20:00"
    assert sch.hours_text(a, at(6, 30)) == "Opens 07:00 today"
    assert sch.hours_text(a, at(21)) == "Closed for today"


def test_weekly_pattern_today_only_and_stay_open():
    a = agent()
    sch.set_weekly(a, {"mon": ["08:00", "20:00"], "tue": ["08:00", "20:00"], "sun": None})
    assert sch.weekly_of(a)["sun"] is None and sch.weekly_of(a)["wed"] is None
    assert sch.is_open_by_schedule(a, at(7, 30)) is False  # opens at 8 on a Tuesday
    assert sch.is_open_by_schedule(a, at(12, day=27)) is False  # Sunday
    assert sch.hours_text(a, at(12, day=27)) == "Closed today"
    sch.set_today(a, at(9), ["08:00", "13:00"])  # half day today
    assert sch.is_open_by_schedule(a, at(12, 59)) and not sch.is_open_by_schedule(a, at(13))
    assert sch.hours_text(a, at(9)) == "Today only · open today 08:00–13:00"
    assert sch.hours_for(a, at(9, day=28))[0] == (480, 1200)  # next Monday back to normal
    until = sch.extend_today(a, at(12, 50), 60)
    assert until == at(14, 0) and sch.is_open_by_schedule(a, at(13, 30))
    assert sch.close_at(a, at(13, 30)) == at(14, 0)
    assert "staying open until 14:00" in sch.hours_text(a, at(13, 30))
    sch.clear_today(a, at(13, 30))
    assert sch.is_open_by_schedule(a, at(13, 30)) is True  # back to 08:00–20:00


def test_closing_warning_window_and_day_off():
    a = agent()
    assert sch.closing_in_min(a, at(19, 40)) is None
    assert sch.closing_in_min(a, at(19, 45)) == 15
    assert sch.closing_in_min(a, at(19, 58)) == 2
    st = sch.state(a, at(19, 50))
    assert st["notice"] == "Closing at 20:00 by your schedule in 10 min. Stay open?"
    sch.set_today(a, at(9), None)
    assert sch.state(a, at(12))["today"] is None and sch.state(a, at(12))["open_now"] is False
    with pytest.raises(ValueError):
        sch.set_weekly(a, {d: None for d in sch.DAYS})
    with pytest.raises(ValueError):
        sch.parse_hours(["20:00", "08:00"])


async def _fatmata(client):
    r = await client.post(
        "/api/v1/search",
        json={"transaction": "cash_out", "amount_sle": 500, "area": "Lumley"},
        headers=HDR,  # noqa: E501
    )
    d = r.json()
    return [
        x
        for x in d["recommended"] + d["closer_not_serving"] + d["results"]
        if x["name"] == "Fatmata's Shop"
    ][0]  # noqa: E501


@pytest.mark.asyncio
async def test_schedule_endpoints_drive_what_customers_see(client, agent, frozen_clock):
    s = (await client.get("/api/v1/agent/schedule", headers=agent)).json()
    assert s["weekly"]["mon"] == ["07:00", "20:00"] and s["today"]["open_now"] is True
    assert (await _fatmata(client))["outcome"] == "likely"
    # Half day today: from 13:00 customers are told she is closed, by her own instruction.
    r = await client.post(
        "/api/v1/agent/schedule/today", json={"hours": ["08:00", "13:00"]}, headers=agent
    )
    assert r.status_code == 200 and r.json()["today"]["today"] == ["08:00", "13:00"]
    frozen_clock.now = frozen_clock.now.replace(hour=13, minute=5)
    assert (await _fatmata(client))["outcome"] == "closed"
    home = (await client.get("/api/v1/agent/home", headers=agent)).json()
    assert (
        home["schedule"]["open_now"] is False
        and home["schedule"]["hours_text"] == "Closed for today"
    )  # noqa: E501
    detail = (await client.get("/api/v1/agents/af-024")).json()
    assert detail["hours_text"] == "Closed for today"
    # Stay open one more hour: open again until 14:05, and the dealer's tile agrees.
    r = await client.post(
        "/api/v1/agent/schedule/today", json={"extend_minutes": 60}, headers=agent
    )  # noqa: E501
    assert (
        r.json()["today"]["closes_at"] == "14:05"
        and (await _fatmata(client))["outcome"] == "likely"
    )  # noqa: E501
    # Fifteen minutes before, the warning.
    frozen_clock.now = frozen_clock.now.replace(hour=13, minute=55)
    home = (await client.get("/api/v1/agent/home", headers=agent)).json()
    assert home["schedule"]["notice"] == "Closing at 14:05 by your schedule in 10 min. Stay open?"
    # Weekly: Sunday closed, validated.
    r = await client.put(
        "/api/v1/agent/schedule",
        json={"weekly": {**{d: ["08:00", "20:00"] for d in sch.DAYS}, "sun": None}},
        headers=agent,
    )
    assert r.status_code == 200 and r.json()["weekly"]["sun"] is None
    bad = await client.put(
        "/api/v1/agent/schedule", json={"weekly": {"mon": ["20:00", "08:00"]}}, headers=agent
    )  # noqa: E501
    assert bad.status_code == 400 and bad.json()["error"]["code"] == "invalid_hours"


@pytest.mark.asyncio
async def test_schedule_is_the_agents_alone(client, dealer):
    assert (await client.get("/api/v1/agent/schedule", headers=dealer)).status_code == 404
    assert (await client.get("/api/v1/agent/schedule")).status_code == 401
