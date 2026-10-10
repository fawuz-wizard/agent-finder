"""Registration: a dealer brings any agent onto the platform — with or without Orange's file —
and a customer standing nearby finds them. Permission-gated, validated, nothing private leaks."""

from __future__ import annotations

import json

import pytest
from app.db import session as dbsession
from app.db.models import Dealer

VENUE = {"lat": 8.4700, "lng": -13.2600}  # a point ~4 km from every seeded agent
NEW = {
    "person_name": "Mariama Sesay",
    "shop_name": "Mariama's Corner",
    "area": "Hill Station",
    "street": "Opposite the venue gate",
    "lat": VENUE["lat"] + 0.001,  # ~110 m away
    "lng": VENUE["lng"],
    "phone": "+232 76 123 456",
    "phone_visible": False,
    "open_time": "08:00",
    "close_time": "19:00",
    "pin": "2468",
    "usual_max_sle": 5_000,
    "usual_float_max_sle": 3_000,
    "usual_daily_transactions": 25,
    "verified": True,
}
CUST = {"X-Client": "cust-register"}


async def _sign_in(client, ref, pin, role):
    return await client.post("/api/v1/auth/sign-in", json={"ref": ref, "pin": pin, "role": role})


async def _search(client, amount, tx="cash_out"):
    r = await client.post(
        "/api/v1/search",
        json={"transaction": tx, "amount_sle": amount, "area": "Hill Station", **VENUE},
        headers=CUST,
    )
    assert r.status_code == 200, r.text
    return r.json()


@pytest.mark.asyncio
async def test_registered_agent_is_found_by_a_customer_standing_nearby(client, dealer):
    r = await client.post("/api/v1/dealer/agents", json=NEW, headers=dealer)
    assert r.status_code == 201, r.text
    out = r.json()
    assert out["ref"] == "Agent 101" and out["public_id"] == "af-101"
    assert out["hours_text"].startswith("Open today 08:00–19:00")
    assert "2468" not in json.dumps(out)  # the PIN itself is never echoed back
    # Nothing shows for a customer until the agent has signed in and set Open...
    found = [a for a in (await _search(client, 4_000))["recommended"] if a["id"] == "af-101"]
    assert found == []
    # ...which they do with the number and PIN the dealer gave them.
    s = await _sign_in(client, "101", "2468", "agent")
    assert s.status_code == 200, s.text
    agent = {"Authorization": f"Bearer {s.json()['token']}"}
    assert (
        await client.post("/api/v1/agent/availability", json={"presence": "open"}, headers=agent)
    ).status_code == 200
    # Now a customer at the venue sees them first, within 500 m, with the note's ceiling applied.
    res = await _search(client, 4_000)
    top = res["recommended"][0]
    assert top["id"] == "af-101" and top["name"] == "Mariama's Corner"
    assert top["distance_m"] < 500 and top["outcome"] == "likely"
    assert (await _search(client, 6_000))["recommended"] == [] or all(
        a["id"] != "af-101" for a in (await _search(client, 6_000))["recommended"]
    )
    # The customer payload carries the badge and nothing private: no note, no PIN, no number.
    text = json.dumps(res)
    for private in ("usual", "5,000", "5000", "2468", "76123456", "Mariama Sesay", "pin"):
        assert private not in text, private
    assert top["can_call"] is False
    detail = (await client.get("/api/v1/agents/af-101?transaction=cash_out&amount_sle=4000")).json()
    assert detail["verified_label"] == "Verified agent" and detail["call_url"] is None
    # The dealer's register lists the new agent, and the action log says who registered them.
    rows = (await client.get("/api/v1/dealer/agents", headers=dealer)).json()
    mine = [x for x in rows if x["ref"] == "Agent 101"][0]
    assert mine["name"] == "Mariama's Corner" and mine["capacity_text"].startswith("Cash out up to")
    acts = (await client.get("/api/v1/actions?agent=Agent 101", headers=dealer)).json()
    assert any("registered Mariama's Corner as Agent 101" in a["note"] for a in acts)
    assert any("Orange's record" in a["note"] for a in acts)


@pytest.mark.asyncio
async def test_registration_is_permission_gated_and_validated(client, agent, dealer):
    # The agent role gets a 404 shape, never a hint.
    assert (await client.post("/api/v1/dealer/agents", json=NEW, headers=agent)).status_code == 404
    # A dealer without MANAGE_AGENT likewise — permissions are read from the database per request.
    async with dbsession.get_session_factory()() as db:
        d = await db.get(Dealer, "kissy")
        d.permissions = "VIEW_AGENT,CONTACT_AGENT"
        await db.commit()
    assert (await client.post("/api/v1/dealer/agents", json=NEW, headers=dealer)).status_code == 404
    async with dbsession.get_session_factory()() as db:
        d = await db.get(Dealer, "kissy")
        d.permissions = "VIEW_AGENT,CONTACT_AGENT,MANAGE_AGENT"
        await db.commit()
    # Validation: a point outside Sierra Leone, hours the wrong way round, a bad number, a
    # number already taken.
    bad = await client.post("/api/v1/dealer/agents", json={**NEW, "lat": 48.85}, headers=dealer)
    assert bad.status_code == 400 and bad.json()["error"]["code"] == "invalid_location"
    bad = await client.post(
        "/api/v1/dealer/agents",
        json={**NEW, "open_time": "19:00", "close_time": "08:00"},
        headers=dealer,
    )
    assert bad.status_code == 400 and bad.json()["error"]["code"] == "invalid_hours"
    bad = await client.post("/api/v1/dealer/agents", json={**NEW, "ref": "abc"}, headers=dealer)
    assert bad.status_code == 400 and bad.json()["error"]["code"] == "invalid_ref"
    dup = await client.post(
        "/api/v1/dealer/agents", json={**NEW, "ref": "Agent 024"}, headers=dealer
    )
    assert dup.status_code == 409 and dup.json()["error"]["code"] == "exists"
    assert (
        await client.post("/api/v1/dealer/agents", json={**NEW, "pin": "12"}, headers=dealer)
    ).status_code == 422
    # Numbers are accepted bare or with the prefix, and the next free one otherwise.
    ok = await client.post("/api/v1/dealer/agents", json={**NEW, "ref": "150"}, headers=dealer)
    assert ok.status_code == 201 and ok.json()["ref"] == "Agent 150"
    nxt = await client.post("/api/v1/dealer/agents", json=NEW, headers=dealer)
    assert nxt.status_code == 201 and nxt.json()["ref"] == "Agent 151"


@pytest.mark.asyncio
async def test_dealer_can_correct_the_record_and_reset_the_pin(client, dealer):
    ref = (await client.post("/api/v1/dealer/agents", json=NEW, headers=dealer)).json()["ref"]
    moved = await client.put(
        f"/api/v1/dealer/agents/{ref}",
        json={
            "street": "Next to the stadium gate",
            "lat": VENUE["lat"] + 0.003,
            "lng": VENUE["lng"],
            "open_time": "09:00",
            "close_time": "18:00",
            "phone_visible": True,
        },
        headers=dealer,
    )
    assert moved.status_code == 200, moved.text
    assert moved.json()["street"] == "Next to the stadium gate"
    assert moved.json()["hours_text"].startswith("Open today 09:00–18:00")
    detail = (await client.get(f"/api/v1/dealer/agents/{ref}", headers=dealer)).json()
    assert detail["area"] == "Next to the stadium gate"
    # Half a location is refused; another dealer's agent (or a missing one) is a 404.
    assert (
        await client.put(f"/api/v1/dealer/agents/{ref}", json={"lat": 8.47}, headers=dealer)
    ).status_code == 400
    assert (
        await client.put("/api/v1/dealer/agents/Agent 999", json={"street": "x"}, headers=dealer)
    ).status_code == 404
    # PIN reset: the old one stops working, the new one works.
    assert (await _sign_in(client, ref, "2468", "agent")).status_code == 200
    assert (
        await client.post(f"/api/v1/dealer/agents/{ref}/pin", json={"pin": "9753"}, headers=dealer)
    ).status_code == 200
    assert (await _sign_in(client, ref, "2468", "agent")).status_code == 401
    assert (await _sign_in(client, ref, "9753", "agent")).status_code == 200
