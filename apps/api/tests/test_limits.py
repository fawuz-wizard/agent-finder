"""Limits that hold across restarts: the PIN lockout and the request rate limits live in the
database. A scraper on one device is stopped; many phones behind one network address are not."""

from __future__ import annotations

import pytest


@pytest.mark.asyncio
async def test_one_device_searching_too_fast_is_slowed_and_others_are_not(client):
    body = {"transaction": "cash_out", "amount_sle": 500, "area": "Lumley"}
    for _ in range(60):
        r = await client.post("/api/v1/search", json=body, headers={"X-Client": "scraper"})
        assert r.status_code == 200
    r = await client.post("/api/v1/search", json=body, headers={"X-Client": "scraper"})
    assert r.status_code == 429 and "Too many requests" in r.text
    # Another phone behind the same network address still gets answers.
    r = await client.post("/api/v1/search", json=body, headers={"X-Client": "someone-else"})
    assert r.status_code == 200


@pytest.mark.asyncio
async def test_a_wrong_pin_lockout_is_kept_in_the_database(client):
    for _ in range(5):
        r = await client.post(
            "/api/v1/auth/sign-in", json={"ref": "Agent 024", "pin": "9999", "role": "agent"}
        )
        assert r.status_code == 401
    r = await client.post(
        "/api/v1/auth/sign-in", json={"ref": "Agent 024", "pin": "1234", "role": "agent"}
    )
    assert r.status_code == 429
    from app.db import session as dbsession
    from app.db.models import RateEvent
    from sqlalchemy import func, select

    async with dbsession.get_session_factory()() as db:
        n = (
            await db.execute(
                select(func.count()).select_from(RateEvent).where(RateEvent.key.like("fail:%"))
            )
        ).scalar_one()
    # Every attempt is recorded first (five wrong, then the refused sixth).
    assert n == 6


@pytest.mark.asyncio
async def test_typing_the_number_differently_does_not_buy_more_pin_guesses(client):
    me = (await client.get("/api/v1/dealer/me", headers=await _dealer(client))).json()
    assert me["sign_in"] == "kissy"
    # The aggregator's line, typed four different ways: one account, one count of five.
    spellings = ["076000123", "+23276000123", "76-000-123", "0023276000123", "76 000 123"]
    for s in spellings:
        r = await client.post(
            "/api/v1/auth/sign-in", json={"ref": s, "pin": "9999", "role": "dealer"}
        )
        assert r.status_code == 401, (s, r.text)
    r = await client.post(
        "/api/v1/auth/sign-in", json={"ref": "kissy", "pin": "1234", "role": "dealer"}
    )
    assert r.status_code == 429


async def _dealer(client) -> dict:
    r = await client.post(
        "/api/v1/auth/sign-in", json={"ref": "kissy", "pin": "1234", "role": "dealer"}
    )
    return {"Authorization": f"Bearer {r.json()['token']}"}


@pytest.mark.asyncio
async def test_a_rival_cannot_sink_a_shop_with_scripted_reports(client):
    body = {
        "agent_id": "af-024",
        "answer": "no",
        "reason_code": "no_cash",
        "client_token": "rep-0000000001",
    }
    one = {"X-Client": "rival-phone"}
    first = await client.post("/api/v1/reports", json=body, headers=one)
    assert first.status_code == 201, first.text
    again = await client.post(
        "/api/v1/reports", json={**body, "client_token": "rep-0000000002"}, headers=one
    )
    assert again.status_code == 429
    # Without a device key, served-or-not does not count at all; a comment still does.
    anon = await client.post("/api/v1/reports", json={**body, "client_token": "rep-0000000003"})
    assert anon.status_code == 422
    note = {
        "agent_id": "af-024",
        "answer": "comment",
        "comment": "Nice shop",
        "client_token": "rep-0000000004",
    }
    assert (await client.post("/api/v1/reports", json=note)).status_code == 201


@pytest.mark.asyncio
async def test_records_per_hour_are_capped_per_agent_and_a_retry_is_free(
    client, agent, monkeypatch
):
    from app.api.v1 import agent_app

    monkeypatch.setattr(agent_app, "TRANSACTIONS_PER_HOUR", 3)

    def body(n: int) -> dict:
        return {"transaction": "deposit", "amount_sle": 1_000, "client_token": f"cap-tok-{n:04d}"}

    for n in range(3):
        r = await client.post("/api/v1/agent/transactions", json=body(n), headers=agent)
        assert r.status_code == 201, r.text
    # A retry of a record already made returns it and is not counted.
    r = await client.post("/api/v1/agent/transactions", json=body(0), headers=agent)
    assert r.status_code == 201
    r = await client.post("/api/v1/agent/transactions", json=body(3), headers=agent)
    assert r.status_code == 429 and "Too many requests" in r.text


async def _earlier_failures(key: str, n: int) -> None:
    """Wrong PINs typed an hour ago: outside the 15-minute lockout, inside today's count."""
    from datetime import UTC, datetime, timedelta

    from app.db import session as dbsession
    from app.db.models import RateEvent

    async with dbsession.get_session_factory()() as db:
        at = datetime.now(UTC) - timedelta(hours=1)
        db.add_all([RateEvent(key=f"fail:{key}", at=at) for _ in range(n)])
        await db.commit()


@pytest.mark.asyncio
async def test_a_day_of_slow_guessing_locks_the_account_and_a_new_code_opens_it(client):
    # Twenty wrong PINs earlier today, paced under the 15-minute lockout.
    await _earlier_failures("sign-in:agent:Agent 024", 20)
    r = await client.post(
        "/api/v1/auth/sign-in", json={"ref": "Agent 024", "pin": "1234", "role": "agent"}
    )
    # Even the right PIN waits: the day's count is used up.
    assert r.status_code == 429 and "today" in r.json()["error"]["message"]
    # The aggregator reads out a new code; the agent is back in with it.
    code = (
        await client.post("/api/v1/dealer/agents/Agent 024/pin", headers=await _dealer(client))
    ).json()["code"]
    r = await client.post(
        "/api/v1/auth/sign-in", json={"ref": "Agent 024", "pin": code, "role": "agent"}
    )
    assert r.status_code == 200 and r.json()["must_set_pin"] is True


@pytest.mark.asyncio
async def test_the_daily_count_survives_the_15_minute_pruning(client):
    await _earlier_failures("sign-in:dealer:kissy", 18)
    for _ in range(2):
        r = await client.post(
            "/api/v1/auth/sign-in", json={"ref": "kissy", "pin": "9999", "role": "dealer"}
        )
        assert r.status_code == 401
    r = await client.post(
        "/api/v1/auth/sign-in", json={"ref": "kissy", "pin": "9999", "role": "dealer"}
    )
    assert r.status_code == 429 and "today" in r.json()["error"]["message"]


@pytest.mark.asyncio
async def test_orange_needs_a_6_digit_pin_and_a_short_one_only_opens_choose_pin(client):
    from app.core.auth import hash_pin
    from app.db import session as dbsession
    from app.db.models import Dealer

    async with dbsession.get_session_factory()() as db:
        (await db.get(Dealer, "orange")).pin_hash = hash_pin("1234", "orange")
        await db.commit()
    r = await client.post(
        "/api/v1/auth/sign-in", json={"ref": "orange", "pin": "1234", "role": "dealer"}
    )
    assert r.status_code == 200 and r.json()["must_set_pin"] is True
    orange = {"Authorization": f"Bearer {r.json()['token']}"}
    # The map stays shut until a 6-digit PIN is chosen; 4 digits are refused.
    assert (await client.get("/api/v1/dealer/map/summary", headers=orange)).status_code == 403
    r = await client.post("/api/v1/auth/pin", json={"pin": "4826"}, headers=orange)
    assert r.status_code == 422 and "6-digit" in r.json()["error"]["message"]
    r = await client.post("/api/v1/auth/pin", json={"pin": "482613"}, headers=orange)
    assert r.status_code == 200
    assert (await client.get("/api/v1/dealer/map/summary", headers=orange)).status_code == 200
    # Changing it later keeps the rule.
    r = await client.post(
        "/api/v1/auth/change-pin",
        json={"current_pin": "482613", "new_pin": "2468"},
        headers=orange,
    )
    assert r.status_code == 422
    # An aggregator's 4-digit PIN is still fine.
    me = await _dealer(client)
    r = await client.post(
        "/api/v1/auth/change-pin", json={"current_pin": "1234", "new_pin": "2468"}, headers=me
    )
    assert r.status_code == 200


@pytest.mark.asyncio
async def test_each_download_of_the_agents_list_is_recorded_without_its_rows(client):
    from app.db import session as dbsession
    from app.db.models import ExportLog
    from sqlalchemy import select

    r = await client.post(
        "/api/v1/auth/sign-in", json={"ref": "orange", "pin": "123456", "role": "dealer"}
    )
    orange = {"Authorization": f"Bearer {r.json()['token']}"}
    r = await client.get("/api/v1/dealer/map/agents.csv?region=west", headers=orange)
    assert r.status_code == 200
    async with dbsession.get_session_factory()() as db:
        rows = (await db.execute(select(ExportLog))).scalars().all()
    assert len(rows) == 1
    log = rows[0]
    assert (log.actor_id, log.what, log.filters) == ("orange", "agents.csv", "region=west")
    assert log.rows == len(r.text.strip().splitlines()) - 1


@pytest.mark.asyncio
async def test_the_team_s_new_code_lets_a_locked_aggregator_and_orange_back_in(client, capsys):
    from scripts import issue_code

    for who, pin in (("kissy", "1234"), ("orange", "123456")):
        await _earlier_failures(f"sign-in:dealer:{who}", 20)
        r = await client.post(
            "/api/v1/auth/sign-in", json={"ref": who, "pin": pin, "role": "dealer"}
        )
        assert r.status_code == 429
        await issue_code.main(who)
        code = capsys.readouterr().out.split(": ", 1)[1].split("\n")[0].replace(" ", "")
        r = await client.post(
            "/api/v1/auth/sign-in", json={"ref": who, "pin": code, "role": "dealer"}
        )
        assert r.status_code == 200 and r.json()["must_set_pin"] is True
