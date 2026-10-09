"""An agent pins their own shop from the phone. The pin is theirs, it is recorded, and it
changes nothing about what customers are told — only where the shop is."""

from __future__ import annotations

import pytest
from app.db import session as dbsession
from app.db.models import Agent
from sqlalchemy import update


@pytest.mark.asyncio
async def test_agent_pins_the_shop_and_appears_on_the_map(client, agent, dealer):
    async with dbsession.get_session_factory()() as db:
        await db.execute(
            update(Agent)
            .where(Agent.ref == "Agent 024")
            .values(lat=None, lng=None, source="orange_file")
        )
        await db.commit()
    home = (await client.get("/api/v1/agent/home", headers=agent)).json()
    assert home["customers_see"]["state"] == "unlocated"
    assert "Profile" in home["customers_see"]["explanation"]
    prof = (await client.get("/api/v1/agent/profile", headers=agent)).json()
    assert prof["located"] is False and prof["lat"] is None
    assert (await client.get("/api/v1/agents/af-024")).status_code == 404

    r = await client.post(
        "/api/v1/agent/profile/location",
        json={"lat": 8.46251, "lng": -13.28534, "street": "Lumley Beach Road, by the bank"},
        headers=agent,
    )
    assert r.status_code == 200, r.text
    out = r.json()
    assert out["located"] is True and out["location_source"] == "agent"
    assert out["location_confirmed"] is False
    assert out["lat"] == 8.46251 and out["area"] == "Lumley Beach Road, by the bank"
    # Not live yet: the aggregator confirms the pin first.
    assert (await client.get("/api/v1/agents/af-024")).status_code == 404
    waiting = (await client.get("/api/v1/agent/home", headers=agent)).json()["customers_see"]
    assert waiting["state"] == "unlocated" and "confirm" in waiting["explanation"]
    rows = (await client.get("/api/v1/dealer/agents", headers=dealer)).json()
    mine = [x for x in rows if x["ref"] == "Agent 024"][0]
    assert mine["located"] and mine["location_confirmed"] is False
    c = await client.post("/api/v1/dealer/agents/Agent 024/confirm-location", headers=dealer)
    assert c.status_code == 200, c.text
    assert c.json()["located"] is True
    assert (await client.get("/api/v1/agents/af-024")).status_code == 200
    assert (
        await client.post("/api/v1/dealer/agents/Agent 024/confirm-location", headers=agent)
    ).status_code == 404
    # Nothing else moved: presence and the customers' phrase are as before.
    home2 = (await client.get("/api/v1/agent/home", headers=agent)).json()
    assert home2["declaration"]["presence"] == home["declaration"]["presence"]
    assert home2["customers_see"]["state"] != "unlocated"
    # Recorded in the agent's name, visible to the dealer in the agent's actions export.
    csv_ = (await client.get("/api/v1/dealer/records/actions.csv", headers=dealer)).text
    assert "locate" in csv_ and "Fatmata Kamara" in csv_

    bad = await client.post(
        "/api/v1/agent/profile/location", json={"lat": 48.85, "lng": 2.35}, headers=agent
    )
    assert bad.status_code in (400, 422)
    assert (
        await client.post(
            "/api/v1/agent/profile/location", json={"lat": 8.46, "lng": -13.28}, headers=dealer
        )
    ).status_code == 404
