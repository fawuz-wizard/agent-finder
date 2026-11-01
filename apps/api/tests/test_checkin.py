"""Staying visible without being asked: customers see an agent while the app has confirmed
them at the shop pin in the last two hours; away from the pin they are hidden at once, and
shown again on return. The phone sends only yes or no, never a position."""

from __future__ import annotations

import pytest

CUST = {"X-Client": "cust-checkin"}


async def _shown(client, name: str) -> bool:
    r = await client.post(
        "/api/v1/search",
        json={"transaction": "cash_out", "amount_sle": 500, "area": "Lumley"},
        headers=CUST,
    )
    d = r.json()
    rows = d["recommended"] + d["closer_not_serving"] + d["results"] + d["further_away"]
    return any(x["name"] == name for x in rows)


async def _shop(client, agent) -> str:
    return (await client.get("/api/v1/agent/profile", headers=agent)).json()["shop_name"]


@pytest.mark.asyncio
async def test_away_from_the_pin_hides_at_once_and_coming_back_shows_again(client, agent, dealer):
    shop = await _shop(client, agent)
    # Never checked in: the listing is as before.
    assert await _shown(client, shop)
    r = await client.post("/api/v1/agent/checkin", json={"at_pin": True}, headers=agent)
    assert r.status_code == 200 and r.json()["checkin"]["hidden_reason"] is None
    assert await _shown(client, shop)
    away = await client.post("/api/v1/agent/checkin", json={"at_pin": False}, headers=agent)
    assert away.json()["checkin"]["hidden_reason"] == "away_from_pin"
    assert away.json()["checkin_text"].startswith("Hidden · away from the pin since ")
    assert not await _shown(client, shop)
    # The aggregator reads why, never a distance or a position.
    detail = (await client.get("/api/v1/dealer/agents/Agent 024", headers=dealer)).json()
    assert detail["bucket"] == "hidden"
    assert detail["checkin_text"].startswith("Hidden · away from the pin")
    assert "m from" not in detail["checkin_text"] and "lat" not in str(away.json())
    back = await client.post("/api/v1/agent/checkin", json={"at_pin": True}, headers=agent)
    assert back.json()["checkin"]["hidden_reason"] is None
    assert await _shown(client, shop)


@pytest.mark.asyncio
async def test_two_hours_without_a_check_in_hides_until_the_app_is_opened_at_the_shop(
    client, agent, frozen_clock
):
    shop = await _shop(client, agent)
    await client.post("/api/v1/agent/checkin", json={"at_pin": True}, headers=agent)
    frozen_clock.advance(119)
    assert await _shown(client, shop)
    frozen_clock.advance(2)
    home = (await client.get("/api/v1/agent/home", headers=agent)).json()
    assert home["checkin"]["hidden_reason"] == "no_checkin"
    assert home["checkin_text"].startswith("Hidden · no check-in since ")
    assert not await _shown(client, shop)
    # Location off: the app being open still counts, and the aggregator is told.
    await client.post("/api/v1/agent/checkin", json={"at_pin": None}, headers=agent)
    assert await _shown(client, shop)
    home = (await client.get("/api/v1/agent/home", headers=agent)).json()
    assert home["checkin"]["location_check"] is False


@pytest.mark.asyncio
async def test_check_in_needs_the_agent(client, dealer):
    r = await client.post("/api/v1/agent/checkin", json={"at_pin": True}, headers=dealer)
    assert r.status_code in (401, 403, 404)
