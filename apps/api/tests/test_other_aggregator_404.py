"""Changing the ID in the address never reaches someone else's record.

A second aggregator with every permission the first one has asks, route by route, for the
first aggregator's agent and float request. Each answer is "not found" (404), the same as for
an agent that does not exist, and nothing about the agent changes."""

from __future__ import annotations

import pytest
from app.core.auth import hash_pin
from app.db import session as dbsession
from app.db.models import Agent, Dealer
from sqlalchemy import select

THEIRS = "Agent 024"  # kissy's agent in the seed


async def _rival(client) -> dict:
    """Aggregator X: the same permissions as kissy, none of kissy's agents."""
    async with dbsession.get_session_factory()() as db:
        kissy = await db.get(Dealer, "kissy")
        db.add(
            Dealer(
                id="agg-x",
                name="Aggregator X",
                pin_hash=hash_pin("1234", "agg-x"),
                permissions=kissy.permissions,
                region=kissy.region,
            )
        )
        await db.commit()
    r = await client.post(
        "/api/v1/auth/sign-in", json={"ref": "agg-x", "pin": "1234", "role": "dealer"}
    )
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


async def _snapshot() -> tuple:
    async with dbsession.get_session_factory()() as db:
        a = (await db.execute(select(Agent).where(Agent.ref == THEIRS))).scalar_one()
        return (a.street, a.lat, a.lng, a.location_confirmed, a.pin_hash, a.usual_max_sle)


@pytest.mark.asyncio
async def test_another_aggregators_agent_answers_not_found_on_every_route(client):
    rival = await _rival(client)
    before = await _snapshot()
    ref = THEIRS
    calls = [
        ("GET", f"/api/v1/dealer/agents/{ref}", None),
        ("GET", f"/api/v1/dealer/agents/{ref}/reports", None),
        ("PUT", f"/api/v1/dealer/agents/{ref}", {"street": "Somewhere else"}),
        ("PUT", f"/api/v1/dealer/agents/{ref}/usual", {"usual_max_sle": 5_000}),
        ("POST", f"/api/v1/dealer/agents/{ref}/confirm-location", None),
        ("POST", f"/api/v1/dealer/agents/{ref}/pin", None),
        ("DELETE", f"/api/v1/dealer/agents/{ref}/photo", None),
        ("POST", f"/api/v1/financial/{ref}", {"field": "balance", "purpose": "Checking"}),
    ]
    for method, url, body in calls:
        r = await client.request(method, url, json=body, headers=rival)
        assert r.status_code == 404, f"{method} {url} answered {r.status_code}: {r.text}"
        # The same answer as an agent that does not exist: nothing to tell the two apart.
        missing = await client.request(
            method, url.replace(ref, "Agent 999"), json=body, headers=rival
        )
        assert missing.status_code == 404
        assert r.json()["error"]["code"] == missing.json()["error"]["code"]
    assert await _snapshot() == before  # nothing about kissy's agent changed


@pytest.mark.asyncio
async def test_another_aggregators_float_request_cannot_be_decided(client, agent, dealer):
    rival = await _rival(client)
    made = await client.post(
        "/api/v1/float-requests", json={"amount_sle": 5_000, "reason": "Market"}, headers=agent
    )
    assert made.status_code in (200, 201), made.text
    rid = made.json()["id"]
    r = await client.post(
        f"/api/v1/float-requests/{rid}/decision", json={"to": "approved"}, headers=rival
    )
    assert r.status_code == 404, r.text
    mine = (await client.get("/api/v1/float-requests", headers=rival)).json()
    assert rid not in str(mine)
    # The real aggregator still can.
    ok = await client.post(
        f"/api/v1/float-requests/{rid}/decision", json={"to": "approved"}, headers=dealer
    )
    assert ok.status_code == 200, ok.text
