"""Fixes from the independent security review (2026-11-01): a formula typed by an agent never
runs in the aggregator's Excel; a location that is not a number is refused, not a crash; one
float request is sent once, however many taps."""

from __future__ import annotations

import pytest


@pytest.mark.asyncio
async def test_a_formula_typed_as_a_street_cannot_run_in_excel(client, agent, dealer):
    r = await client.post(
        "/api/v1/agent/profile/location",
        json={"lat": 8.4405, "lng": -13.2795, "street": '=HYPERLINK("http://x","click")'},
        headers=agent,
    )
    assert r.status_code == 200, r.text
    csv_ = (await client.get("/api/v1/dealer/report.csv", headers=dealer)).text
    assert "'=HYPERLINK(\"" in csv_ or "'=HYPERLINK(" in csv_.replace('""', '"')
    assert ",=HYPERLINK" not in csv_ and '"=HYPERLINK' not in csv_


@pytest.mark.asyncio
async def test_a_location_that_is_not_a_number_is_refused(client):
    body = {"transaction": "cash_out", "amount_sle": 500, "lat": "NaN", "lng": -13.2}
    r = await client.post("/api/v1/search", json=body, headers={"X-Client": "nan-phone"})
    assert r.status_code == 422


@pytest.mark.asyncio
async def test_two_sends_for_one_request_record_only_one(client, agent, dealer):
    req = await client.post(
        "/api/v1/float-requests", json={"amount_sle": 5000, "reason": "Weekend"}, headers=agent
    )
    rid = req.json()["id"]
    body = {"agent_ref": "Agent 024", "amount_sle": 5000, "request_id": rid}
    first = await client.post(
        "/api/v1/float-sends", json={**body, "client_token": "send-tap-0001"}, headers=dealer
    )
    second = await client.post(
        "/api/v1/float-sends", json={**body, "client_token": "send-tap-0002"}, headers=dealer
    )
    assert first.status_code == 201 and second.status_code in (400, 409), second.text
    sends = (await client.get("/api/v1/float-sends", headers=dealer)).json()
    assert sum(1 for s in sends if s.get("request_id") == rid) == 1


@pytest.mark.asyncio
async def test_sign_in_tokens_are_kept_hashed_and_still_work(client, dealer):
    from app.db import session as dbsession
    from app.db.models import Session
    from sqlalchemy import select

    token = dealer["Authorization"].split(" ", 1)[1]
    async with dbsession.get_session_factory()() as db:
        stored = (await db.execute(select(Session.token))).scalars().all()
    assert token not in stored and all(len(s) == 64 for s in stored)
    assert (await client.get("/api/v1/dealer/me", headers=dealer)).status_code == 200


@pytest.mark.asyncio
async def test_an_aggregators_history_is_found_by_account_not_by_a_shared_name(client, dealer):
    from datetime import UTC, datetime

    from app.db import session as dbsession
    from app.db.models import Action

    # Another account's row carrying the same display name must not appear.
    async with dbsession.get_session_factory()() as db:
        db.add(
            Action(
                at=datetime.now(UTC),
                actor="Kissy Distribution",
                actor_id="someone-else",
                agent_ref="Agent 024",
                action="contact",
                note="not yours",
            )
        )
        await db.commit()
    await client.post(
        "/api/v1/actions", json={"agent": "Agent 024", "action": "nudge"}, headers=dealer
    )
    notes = [a["note"] for a in (await client.get("/api/v1/actions", headers=dealer)).json()]
    assert "not yours" not in notes and any("asked" in n or "update" in n for n in notes)
