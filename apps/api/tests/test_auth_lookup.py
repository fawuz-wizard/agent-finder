"""Nobody chooses who they are at sign-in: the number decides. Agents sign in with the number
the app gave them, their Orange agent code or their Orange Money number; aggregators with their
account id or number. The PIN settles a number that could be either."""

from __future__ import annotations

import pytest
from app.db import session as dbsession
from app.db.models import Agent, Dealer
from sqlalchemy import update


async def sign_in(client, role, ref, pin="1234"):
    body = {"ref": ref, "pin": pin}
    if role is not None:
        body["role"] = role
    return await client.post("/api/v1/auth/sign-in", json=body)


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


@pytest.mark.asyncio
async def test_the_number_decides_the_role_with_no_choice_asked(client):
    async with dbsession.get_session_factory()() as db:
        await db.execute(
            update(Agent)
            .where(Agent.ref == "Agent 024")
            .values(agent_code="100024", msisdn="+23276111111")
        )
        await db.execute(update(Dealer).where(Dealer.id == "kissy").values(msisdn="+23276000001"))
        await db.commit()
    for ident, role, name in (
        ("024", "agent", "Fatmata's Shop"),
        ("100024", "agent", "Fatmata's Shop"),
        ("076 111 111", "agent", "Fatmata's Shop"),
        ("kissy", "dealer", "Kissy Distribution"),
        ("76000001", "dealer", "Kissy Distribution"),
        ("", "dealer", "Kissy Distribution"),  # one aggregator in the pilot: the line is optional
    ):
        r = await sign_in(client, None, ident)
        assert r.status_code == 200, (ident, r.text)
        assert r.json()["role"] == role and r.json()["name"] == name, ident
    # A number nobody has, or the right number with the wrong PIN: the same sentence, no hint.
    nobody = await sign_in(client, None, "076 999 999")
    wrong = await sign_in(client, None, "024", pin="0000")
    assert nobody.status_code == 401 and wrong.status_code == 401
    assert nobody.json()["error"]["message"] == wrong.json()["error"]["message"]


@pytest.mark.asyncio
async def test_a_line_that_is_both_an_agents_and_an_aggregators_is_settled_by_the_pin(client):
    from app.core.auth import hash_pin

    async with dbsession.get_session_factory()() as db:
        await db.execute(
            update(Agent).where(Agent.ref == "Agent 024").values(msisdn="+23276000001")
        )
        await db.execute(
            update(Dealer)
            .where(Dealer.id == "kissy")
            .values(msisdn="+23276000001", pin_hash=hash_pin("9090", "kissy"))
        )
        await db.commit()
    as_agent = await sign_in(client, None, "076 000 001", pin="1234")
    as_dealer = await sign_in(client, None, "076 000 001", pin="9090")
    assert as_agent.status_code == 200 and as_agent.json()["role"] == "agent"
    assert as_dealer.status_code == 200 and as_dealer.json()["role"] == "dealer"
    assert (await sign_in(client, None, "076 000 001", pin="5555")).status_code == 401
    # The old hint still narrows it when a client sends one.
    assert (await sign_in(client, "dealer", "076 000 001", pin="1234")).status_code == 401
