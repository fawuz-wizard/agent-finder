"""Registration: a dealer brings any agent onto the platform — with or without Orange's file —
and a customer standing nearby finds them. Permission-gated, validated, nothing private leaks."""

from __future__ import annotations

import json

import pytest
from app.db import session as dbsession
from app.db.models import Dealer

# The older ranker and the ledger phrases; the 7-day rule has its own file.
pytestmark = pytest.mark.usefixtures("activity_ranker")

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
    "usual_max_sle": 5_000,
    "usual_float_max_sle": 3_000,
    "usual_daily_transactions": 25,
    "verified": True,
}
CUST = {"X-Client": "cust-register"}


async def _sign_in(client, ref, pin, role):
    return await client.post("/api/v1/auth/sign-in", json={"ref": ref, "pin": pin, "role": role})


async def _first_sign_in(client, ref, code, pin):
    """The agent's first sign-in: the one-time code opens only the PIN screen; the PIN they
    choose is what they sign in with from then on."""
    s = await _sign_in(client, ref, code, "agent")
    assert s.status_code == 200 and s.json()["must_set_pin"] is True, s.text
    h = {"Authorization": f"Bearer {s.json()['token']}"}
    assert (await client.post("/api/v1/auth/pin", json={"pin": pin}, headers=h)).status_code == 200
    s = await _sign_in(client, ref, pin, "agent")
    assert s.status_code == 200 and s.json()["must_set_pin"] is False, s.text
    return {"Authorization": f"Bearer {s.json()['token']}"}


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
    # The one-time code comes back once, for the dealer to read out; no PIN exists yet.
    code = out["code"]
    assert len(code) == 6 and code.isdigit()
    # Nothing shows for a customer until the agent has signed in and set Open...
    found = [a for a in (await _search(client, 4_000))["recommended"] if a["id"] == "af-101"]
    assert found == []
    # ...which they do with the number and code the dealer gave them, choosing their own PIN.
    agent = await _first_sign_in(client, "101", code, "2468")
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
    # Numbers are accepted bare or with the prefix, and the next free one otherwise.
    ok = await client.post("/api/v1/dealer/agents", json={**NEW, "ref": "150"}, headers=dealer)
    assert ok.status_code == 201 and ok.json()["ref"] == "Agent 150"
    nxt = await client.post("/api/v1/dealer/agents", json=NEW, headers=dealer)
    assert nxt.status_code == 201 and nxt.json()["ref"] == "Agent 151"


@pytest.mark.asyncio
async def test_dealer_can_correct_the_record_and_reset_the_pin(client, dealer):
    out = (await client.post("/api/v1/dealer/agents", json=NEW, headers=dealer)).json()
    ref = out["ref"]
    await _first_sign_in(client, ref, out["code"], "2468")
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
    # Forgotten PIN: the dealer issues a new code; the old PIN stops working and the agent
    # chooses a new one. The dealer never sets or learns the PIN itself.
    assert (await _sign_in(client, ref, "2468", "agent")).status_code == 200
    issued = await client.post(f"/api/v1/dealer/agents/{ref}/pin", headers=dealer)
    assert issued.status_code == 200 and issued.json()["code"].isdigit()
    assert "pin_set" not in issued.json()
    assert (await _sign_in(client, ref, "2468", "agent")).status_code == 401
    await _first_sign_in(client, ref, issued.json()["code"], "9753")
    acts = (await client.get(f"/api/v1/actions?agent={ref}", headers=dealer)).json()
    assert any("issued a new sign-in code" in a["note"] for a in acts)


@pytest.mark.asyncio
async def test_an_agent_who_never_declared_is_counted_not_flagged(client, dealer):
    """Imported agents have no declaration. That is not an expired status: the overview says
    how many have not signed in, and raises no signal for each of them."""
    r = await client.post(
        "/api/v1/dealer/agents",
        json={**NEW, **VENUE, "ref": "Agent 160", "shop_name": "Quiet Corner", "verified": True},
        headers=dealer,
    )
    assert r.status_code == 201, r.text
    o = (await client.get("/api/v1/dealer/overview", headers=dealer)).json()
    assert o["not_signed_in"] >= 1
    assert not any(s["agent_ref"] == "Agent 160" for s in o["signals"])
    row = [
        x
        for x in (await client.get("/api/v1/dealer/agents", headers=dealer)).json()
        if x["ref"] == "Agent 160"
    ][0]
    assert row["presence"] == "closed" and row["presence_text"] == "Not signed in yet"
    assert row["attention"] is False


@pytest.mark.asyncio
async def test_detail_carries_the_pin_for_the_aggregators_map(client, dealer):
    """The agent's page shows the pin on a map, so the detail carries the point. Customers never
    get it from here: the public detail has no coordinates field for an unconfirmed shop."""
    r = await client.get("/api/v1/dealer/agents/Agent%20024", headers=dealer)
    assert r.status_code == 200, r.text
    d = r.json()
    assert isinstance(d["lat"], float) and isinstance(d["lng"], float)
    assert d["located"] is True
