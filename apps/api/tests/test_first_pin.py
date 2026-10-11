"""First sign-in. Accounts are issued, never self-created: the aggregator (or the team) reads a
one-time code out in person. The code opens exactly one screen, where the person chooses a
PIN nobody else knows; the code then dies, and so does every other session opened with it."""

from __future__ import annotations

import pytest
from app.core.auth import hash_pin
from app.db import session as dbsession
from app.db.models import Agent, Dealer

NEW = {
    "person_name": "Mariama Sesay",
    "shop_name": "Mariama's Corner",
    "area": "Hill Station",
    "street": "Opposite the venue gate",
    "lat": 8.471,
    "lng": -13.26,
    "phone": None,
    "phone_visible": False,
}


async def _sign_in(client, ref, pin, role="agent"):
    return await client.post("/api/v1/auth/sign-in", json={"ref": ref, "pin": pin, "role": role})


def _bearer(r):
    return {"Authorization": f"Bearer {r.json()['token']}"}


@pytest.mark.asyncio
async def test_the_code_opens_only_the_pin_screen_then_dies(client, dealer):
    code = (await client.post("/api/v1/dealer/agents", json=NEW, headers=dealer)).json()["code"]
    first = await _sign_in(client, "101", code)
    assert first.status_code == 200 and first.json()["must_set_pin"] is True
    h = _bearer(first)
    # Every agent screen is shut until a PIN is chosen; the answer says so, and nothing else.
    for path in ("/api/v1/agent/home", "/api/v1/agent/profile", "/api/v1/float-requests"):
        r = await client.get(path, headers=h)
        assert r.status_code == 403 and r.json()["error"]["code"] == "pin_required", path
    assert (
        await client.post("/api/v1/agent/availability", json={"presence": "open"}, headers=h)
    ).status_code == 403
    # The PIN must be a real PIN, not the code again.
    bad = await client.post("/api/v1/auth/pin", json={"pin": code}, headers=h)
    assert bad.status_code == 422
    assert (await client.post("/api/v1/auth/pin", json={"pin": "12"}, headers=h)).status_code == 422
    # A second phone signed in with the same code is signed out when the PIN is chosen.
    second = _bearer(await _sign_in(client, "101", code))
    ok = await client.post("/api/v1/auth/pin", json={"pin": "2468"}, headers=h)
    assert ok.status_code == 200 and ok.json() == {"pin_set": True}
    assert (await client.get("/api/v1/agent/home", headers=h)).status_code == 200
    assert (await client.get("/api/v1/agent/home", headers=second)).status_code == 401
    # The code is dead, the PIN works, and the PIN screen is closed to a settled account.
    assert (await _sign_in(client, "101", code)).status_code == 401
    settled = await _sign_in(client, "101", "2468")
    assert settled.status_code == 200 and settled.json()["must_set_pin"] is False
    again = await client.post("/api/v1/auth/pin", json={"pin": "1357"}, headers=_bearer(settled))
    assert again.status_code == 409 and again.json()["error"]["code"] == "pin_set"
    acts = (await client.get("/api/v1/actions?agent=Agent 101", headers=dealer)).json()
    assert any(a["note"] == "Chose their PIN" for a in acts)


@pytest.mark.asyncio
async def test_an_aggregator_issued_a_code_chooses_a_pin_the_same_way(client):
    # The team issues the aggregator's code (scripts/issue_code.py does exactly this).
    async with dbsession.get_session_factory()() as db:
        d = await db.get(Dealer, "kissy")
        d.pin_hash = hash_pin("904417", d.id)
        d.must_set_pin = True
        await db.commit()
    first = await _sign_in(client, "kissy", "904417", "dealer")
    assert first.status_code == 200 and first.json()["must_set_pin"] is True
    h = _bearer(first)
    shut = await client.get("/api/v1/dealer/agents", headers=h)
    assert shut.status_code == 403 and shut.json()["error"]["code"] == "pin_required"
    assert (await client.post("/api/v1/dealer/agents", json=NEW, headers=h)).status_code == 403
    chosen = await client.post("/api/v1/auth/pin", json={"pin": "5566"}, headers=h)
    assert chosen.status_code == 200
    assert (await client.get("/api/v1/dealer/agents", headers=h)).status_code == 200
    assert (await _sign_in(client, "kissy", "904417", "dealer")).status_code == 401
    assert (await _sign_in(client, "kissy", "5566", "dealer")).json()["must_set_pin"] is False


@pytest.mark.asyncio
async def test_issuing_a_code_signs_the_agent_out_everywhere(client, agent, dealer):
    assert (await client.get("/api/v1/agent/home", headers=agent)).status_code == 200
    issued = await client.post("/api/v1/dealer/agents/Agent 024/pin", headers=dealer)
    assert issued.status_code == 200
    assert (await client.get("/api/v1/agent/home", headers=agent)).status_code == 401
    assert (await _sign_in(client, "024", "1234")).status_code == 401
    async with dbsession.get_session_factory()() as db:
        a = await db.get(Agent, "Agent 024")
        assert a.must_set_pin is True
    # Another dealer's agent, or one that does not exist, is a 404 with no hint.
    gone = await client.post("/api/v1/dealer/agents/Agent 999/pin", headers=dealer)
    assert gone.status_code == 404
