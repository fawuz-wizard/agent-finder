"""The keypad before recording a transaction checks the agent's own PIN: right, wrong, and
locked after too many wrong tries, with no new session made."""

import pytest
from app.core.auth import _failed_sign_ins


@pytest.mark.asyncio
async def test_the_keypad_checks_the_agents_pin_and_locks_after_five_wrong_tries(client, agent):
    _failed_sign_ins.clear()
    ok = await client.post("/api/v1/auth/check-pin", json={"pin": "1234"}, headers=agent)
    assert ok.status_code == 200 and ok.json() == {"ok": True}
    for _ in range(5):
        bad = await client.post("/api/v1/auth/check-pin", json={"pin": "9999"}, headers=agent)
        assert bad.status_code == 403
    locked = await client.post("/api/v1/auth/check-pin", json={"pin": "1234"}, headers=agent)
    assert locked.status_code == 429
    _failed_sign_ins.clear()


@pytest.mark.asyncio
async def test_the_keypad_needs_a_signed_in_agent(client):
    r = await client.post("/api/v1/auth/check-pin", json={"pin": "1234"})
    assert r.status_code in (401, 404)
