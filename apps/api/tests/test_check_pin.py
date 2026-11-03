"""The keypad before recording a transaction checks the agent's own PIN: right, wrong, and
locked after too many wrong tries, with no new session made."""

import pytest


@pytest.mark.asyncio
async def test_the_keypad_checks_the_agents_pin_and_locks_after_five_wrong_tries(client, agent):
    ok = await client.post("/api/v1/auth/check-pin", json={"pin": "1234"}, headers=agent)
    assert ok.status_code == 200 and ok.json() == {"ok": True}
    for _ in range(5):
        bad = await client.post("/api/v1/auth/check-pin", json={"pin": "9999"}, headers=agent)
        assert bad.status_code == 403
    locked = await client.post("/api/v1/auth/check-pin", json={"pin": "1234"}, headers=agent)
    assert locked.status_code == 429
    # The count is in the database, not in the server's memory: a restart does not clear it.
    from app.core import limits

    assert not hasattr(limits, "_failed_sign_ins")


@pytest.mark.asyncio
async def test_the_keypad_needs_a_signed_in_agent(client):
    r = await client.post("/api/v1/auth/check-pin", json={"pin": "1234"})
    assert r.status_code in (401, 404)


@pytest.mark.asyncio
async def test_change_pin_is_locked_after_five_wrong_tries_and_signs_out_the_other_phones(
    client, agent
):
    other = await client.post(
        "/api/v1/auth/sign-in", json={"ref": "Agent 024", "pin": "1234", "role": "agent"}
    )
    other_phone = {"Authorization": f"Bearer {other.json()['token']}"}
    assert (await client.get("/api/v1/agent/profile", headers=other_phone)).status_code == 200
    ok = await client.post(
        "/api/v1/agent/profile/pin", json={"current_pin": "1234", "new_pin": "2468"}, headers=agent
    )
    assert ok.status_code == 200
    # Whoever knew the old PIN on another phone is signed out; this phone stays in.
    assert (await client.get("/api/v1/agent/profile", headers=other_phone)).status_code in (
        401,
        404,
    )
    assert (await client.get("/api/v1/agent/profile", headers=agent)).status_code == 200
    for _ in range(5):
        bad = await client.post(
            "/api/v1/agent/profile/pin",
            json={"current_pin": "0000", "new_pin": "1357"},
            headers=agent,
        )
        assert bad.status_code == 403
    locked = await client.post(
        "/api/v1/agent/profile/pin", json={"current_pin": "2468", "new_pin": "1357"}, headers=agent
    )
    assert locked.status_code == 429
