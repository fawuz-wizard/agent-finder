"""Two actions at the same moment: exactly one wins and the other gets a clear answer, never a
crash or a duplicate."""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime

import pytest
from app.db import session as dbsession
from app.db.models import FloatRequest
from sqlalchemy.exc import IntegrityError


@pytest.mark.asyncio
async def test_the_database_keeps_one_waiting_float_request_per_agent(client, agent):
    r = await client.post(
        "/api/v1/float-requests", json={"amount_sle": 5000, "reason": "busy"}, headers=agent
    )
    assert r.status_code == 201, r.text
    # Even if two inserts slipped past the check in the code, the database refuses the second.
    async with dbsession.get_session_factory()() as db:
        first = await db.get(FloatRequest, r.json()["id"])
        db.add(
            FloatRequest(
                id="fr-race",
                requested_at=datetime.now(UTC),
                agent_ref=first.agent_ref,
                dealer_id=first.dealer_id,
                amount_sle=1000,
                reason="race",
                state="pending",
            )
        )
        with pytest.raises(IntegrityError):
            await db.commit()


@pytest.mark.asyncio
async def test_two_decisions_on_one_request_at_once_only_one_moves_it(client, agent, dealer):
    r = await client.post(
        "/api/v1/float-requests", json={"amount_sle": 5000, "reason": "busy"}, headers=agent
    )
    rid = r.json()["id"]
    a, b = await asyncio.gather(
        client.post(
            f"/api/v1/float-requests/{rid}/decision", json={"to": "approved"}, headers=dealer
        ),
        client.post(
            f"/api/v1/float-requests/{rid}/decision",
            json={"to": "declined", "reason": "no"},
            headers=dealer,
        ),
    )
    codes = sorted([a.status_code, b.status_code])
    # The loser is told the request already moved (409) or that its move no longer applies (400).
    assert codes[0] == 200 and codes[1] in (400, 409, 422), (a.text, b.text)
