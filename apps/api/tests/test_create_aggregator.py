"""scripts/create_aggregator.py: a new aggregator (or a test one before Orange's data arrives)
signs in once with the code, chooses a PIN, and registers its own agents; a reset issues a new
code, signs out its phones and keeps its agents."""

from __future__ import annotations

import pytest
from app.db import session as dbsession
from app.db.models import Agent
from scripts.create_aggregator import create
from sqlalchemy import func, select

NEW_AGENT = {
    "person_name": "Mariama Sesay",
    "shop_name": "Mariama's Corner",
    "area": "Hill Station",
    "street": "Opposite the venue gate",
    "lat": 8.471,
    "lng": -13.26,
    "phone": "+232 76 555 161",
    "phone_visible": False,
}


async def _sign_in(client, ref, pin):
    return await client.post(
        "/api/v1/auth/sign-in", json={"ref": ref, "pin": pin, "role": "dealer"}
    )


def _bearer(r):
    return {"Authorization": f"Bearer {r.json()['token']}"}


async def _agents_of(dealer_id: str) -> int:
    async with dbsession.get_session_factory()() as db:
        return (
            await db.execute(
                select(func.count()).select_from(Agent).where(Agent.dealer_id == dealer_id)
            )
        ).scalar_one()


@pytest.mark.asyncio
async def test_a_new_aggregator_chooses_a_pin_then_registers_agents(client):
    code = await create("test-agg", "Mohira Test Aggregator", "west", "076123450")
    first = await _sign_in(client, "test-agg", code)
    assert first.status_code == 200 and first.json()["must_set_pin"] is True
    assert (
        await client.post("/api/v1/auth/pin", json={"pin": "2468"}, headers=_bearer(first))
    ).status_code == 200
    assert (await _sign_in(client, "test-agg", code)).status_code == 401  # the code is dead
    h = _bearer(await _sign_in(client, "076123450", "2468"))  # the phone number works too
    assert (await client.get("/api/v1/dealer/agents", headers=h)).json() == []  # starts empty
    made = await client.post("/api/v1/dealer/agents", json=NEW_AGENT, headers=h)
    assert made.status_code in (200, 201), made.text
    assert await _agents_of("test-agg") == 1
    # kissy's agents are not theirs, and theirs are not kissy's.
    refs = {a["ref"] for a in (await client.get("/api/v1/dealer/agents", headers=h)).json()}
    assert refs == {made.json()["ref"]}


@pytest.mark.asyncio
async def test_a_reset_signs_out_its_phones_and_keeps_its_agents(client):
    code = await create("test-agg", "Mohira Test Aggregator", "west", None)
    first = await _sign_in(client, "test-agg", code)
    await client.post("/api/v1/auth/pin", json={"pin": "2468"}, headers=_bearer(first))
    h = _bearer(await _sign_in(client, "test-agg", "2468"))
    await client.post("/api/v1/dealer/agents", json=NEW_AGENT, headers=h)
    again = await create("test-agg", "Mohira Test Aggregator", "west", None)
    assert (await client.get("/api/v1/dealer/agents", headers=h)).status_code == 401
    assert (await _sign_in(client, "test-agg", "2468")).status_code == 401  # old PIN gone
    assert (await _sign_in(client, "test-agg", again)).json()["must_set_pin"] is True
    assert await _agents_of("test-agg") == 1


@pytest.mark.asyncio
async def test_bad_input_and_national_accounts_are_refused(client):
    for args in (
        ("Test Agg", "x", "west", None),  # not a valid account name
        ("test-agg", "x", "middle", None),  # not a region
        ("test-agg", "x", "west", "12345"),  # not a Sierra Leone number
        ("orange", "x", "west", None),  # Orange's national account
    ):
        with pytest.raises(SystemExit):
            await create(*args)
