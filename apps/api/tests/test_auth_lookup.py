"""Agents sign in with the number the app gave them, their Orange agent code or their Orange
Money number; aggregators with their account id or number. Nothing else changes."""

from __future__ import annotations

import pytest
from app.db import session as dbsession
from app.db.models import Agent, Dealer
from sqlalchemy import update


async def sign_in(client, role, ref, pin="1234"):
    return await client.post("/api/v1/auth/sign-in", json={"ref": ref, "pin": pin, "role": role})


@pytest.mark.asyncio
async def test_agent_signs_in_by_number_code_or_line(client):
    async with dbsession.get_session_factory()() as db:
        await db.execute(
            update(Agent)
            .where(Agent.ref == "Agent 024")
            .values(agent_code="100024", msisdn="+23276111111")
        )
        await db.commit()
    for ident in ("Agent 024", "024", "24", "100024", "76111111", "076 111 111", "+232 76 111 111"):
        r = await sign_in(client, "agent", ident)
        assert r.status_code == 200, ident
        assert r.json()["ref"] == "Agent 024"
    assert (await sign_in(client, "agent", "100099")).status_code == 401
    assert (await sign_in(client, "agent", "")).status_code == 401


@pytest.mark.asyncio
async def test_aggregator_signs_in_by_id_or_line_and_must_say_who_when_there_are_several(client):
    assert (await sign_in(client, "dealer", "")).status_code == 200  # one aggregator: no id needed
    async with dbsession.get_session_factory()() as db:
        await db.execute(update(Dealer).where(Dealer.id == "kissy").values(msisdn="+23276000001"))
        db.add(
            Dealer(
                id="agg-000002",
                name="Second",
                pin_hash="x",
                permissions="VIEW_AGENT",
                msisdn="+23276000002",
            )
        )
        await db.commit()
    assert (await sign_in(client, "dealer", "")).status_code == 401
    assert (await sign_in(client, "dealer", "kissy")).status_code == 200
    r = await sign_in(client, "dealer", "76000001")
    assert r.status_code == 200 and r.json()["name"] == "Kissy Distribution"
    assert (await sign_in(client, "dealer", "76000002")).status_code == 401  # wrong PIN
