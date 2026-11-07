"""The security review of 2026-11-04: each finding reproduced as it was reported, then shown
fixed. H = high, M = medium, L = low, as numbered in the review."""

from __future__ import annotations

import os
import uuid
from datetime import UTC, datetime, timedelta

import pytest
from app.core.auth import hash_pin
from app.core.settings import get_settings
from app.db import session as dbsession
from app.db.models import Agent, AuditLog, Dealer, ExportLog, RateEvent, Session
from sqlalchemy import func, select, text, update

SI = "/api/v1/auth/sign-in"
OWNER_PHONE = {"X-Client": "owner-phone-0000000000000001"}


def _phone(n: int) -> dict:
    return {"X-Client": f"stranger-phone-{n:016d}"}


async def _db():
    return dbsession.get_session_factory()()


# H1: a stranger could lock any account, Orange's included, for a whole day.


@pytest.mark.asyncio
async def test_h1_a_stranger_cannot_lock_the_owner_out_of_their_own_phone(client):
    # The owner has signed in on this phone before.
    r = await client.post(SI, json={"ref": "orange", "pin": "123456"}, headers=OWNER_PHONE)
    assert r.status_code == 200
    # A stranger types wrong PINs from one phone, then from a new phone key for every try.
    for _ in range(6):
        await client.post(SI, json={"ref": "orange", "pin": "000000"}, headers=_phone(0))
    for n in range(1, 30):
        await client.post(SI, json={"ref": "orange", "pin": "000000"}, headers=_phone(n))
    # The stranger is stopped...
    r = await client.post(SI, json={"ref": "orange", "pin": "000000"}, headers=_phone(99))
    assert r.status_code == 429 and "new phones" in r.json()["error"]["message"]
    r = await client.post(SI, json={"ref": "orange", "pin": "000000"}, headers=_phone(0))
    assert r.status_code == 429
    # ...and the owner, on their own phone, is not.
    r = await client.post(SI, json={"ref": "orange", "pin": "123456"}, headers=OWNER_PHONE)
    assert r.status_code == 200, r.text


@pytest.mark.asyncio
async def test_h1_a_guesser_switching_phone_keys_still_gets_only_a_few_tries_a_day(client):
    statuses = []
    for n in range(40):
        r = await client.post(SI, json={"ref": "Agent 024", "pin": "9999"}, headers=_phone(n))
        statuses.append(r.status_code)
    # Ten tries from new phones in 15 minutes, then refused, whatever the phone key says.
    assert statuses.count(401) == 10 and set(statuses[10:]) == {429}


@pytest.mark.asyncio
async def test_h1_a_new_code_clears_every_count_for_the_account(client, dealer):
    for n in range(12):
        await client.post(SI, json={"ref": "Agent 024", "pin": "9999"}, headers=_phone(n))
    code = (await client.post("/api/v1/dealer/agents/Agent 024/pin", headers=dealer)).json()["code"]
    r = await client.post(SI, json={"ref": "Agent 024", "pin": code}, headers=_phone(50))
    assert r.status_code == 200 and r.json()["must_set_pin"] is True


# M2: a number that is both an agent's and an aggregator's locked itself by signing in.


@pytest.mark.asyncio
async def test_m2_a_shared_number_signing_in_correctly_never_locks_itself(client):
    async with await _db() as db:
        await db.execute(
            update(Agent)
            .where(Agent.ref == "Agent 024")
            .values(msisdn="+23276000123", pin_hash=hash_pin("5678", "Agent 024"))
        )
        await db.commit()
    for _ in range(8):
        r = await client.post(SI, json={"ref": "076000123", "pin": "5678"}, headers=OWNER_PHONE)
        assert r.status_code == 200 and r.json()["role"] == "agent"
    r = await client.post(SI, json={"ref": "076000123", "pin": "1234"}, headers=OWNER_PHONE)
    assert r.status_code == 200 and r.json()["role"] == "dealer"


# L1: the lockout told a guesser which names exist.


@pytest.mark.asyncio
async def test_l1_the_lockout_answers_alike_for_real_and_made_up_names(client):
    for ref, other in (("Agent 024", "024"), ("Agent 999", "999")):
        for _ in range(5):
            await client.post(SI, json={"ref": ref, "pin": "9999"}, headers=_phone(1))
        r = await client.post(SI, json={"ref": other, "pin": "9999"}, headers=_phone(1))
        assert r.status_code == 429, ref


# H2: behind the load balancer every phone shared one address and one limit.


@pytest.mark.asyncio
async def test_h2_limits_see_each_client_through_the_trusted_balancer(tmp_path, monkeypatch):
    from app.main import create_app
    from httpx import ASGITransport, AsyncClient

    os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{tmp_path}/p-{uuid.uuid4().hex[:8]}.db"
    monkeypatch.setenv("FORWARDED_ALLOW_IPS", "127.0.0.1")
    get_settings.cache_clear()
    await dbsession.dispose_engine()
    app = create_app()
    body = {"transaction": "cash_out", "amount_sle": 500, "area": "Lumley"}
    async with app.router.lifespan_context(app):
        transport = ASGITransport(app=app, client=("127.0.0.1", 1234))
        async with AsyncClient(transport=transport, base_url="http://test") as c:
            await c.post("/api/v1/search", json=body, headers={"X-Forwarded-For": "41.1.1.1"})
            # A client cannot claim an address through an untrusted hop: the balancer's own
            # view (the rightmost) is used.
            await c.post(
                "/api/v1/search", json=body, headers={"X-Forwarded-For": "9.9.9.9, 41.2.2.2"}
            )
        async with await _db() as db:
            keys = set((await db.execute(select(RateEvent.key))).scalars())
    assert "rate:search:addr:41.1.1.1" in keys and "rate:search:addr:41.2.2.2" in keys
    assert "rate:search:addr:127.0.0.1" not in keys
    get_settings.cache_clear()
    await dbsession.dispose_engine()


# H3: one aggregator's usage.csv listed customer traffic for another's agents.


@pytest.mark.asyncio
async def test_h3_usage_csv_holds_only_my_own_agents(client, dealer):
    async with await _db() as db:
        db.add(Dealer(id="rival", name="Rival", pin_hash=hash_pin("1234", "rival"), permissions=""))
        await db.flush()
        await db.execute(update(Agent).where(Agent.ref == "Agent 024").values(dealer_id="rival"))
        await db.commit()
    await client.post("/api/v1/agents/af-024/directions", headers={"X-Client": "c" * 20})
    await client.post(
        "/api/v1/reports",
        json={"agent_id": "af-024", "answer": "no", "reason_code": "no_cash",
              "client_token": "rep-h3-000000001"},
        headers={"X-Client": "c" * 20},
    )  # fmt: skip
    r = await client.get("/api/v1/dealer/records/usage.csv", headers=dealer)
    assert r.status_code == 200 and "Agent 024" not in r.text


# H4: the container crashed on a database already stamped at 0001_extensions.


@pytest.mark.asyncio
async def test_h4_a_database_stamped_at_0001_with_tables_is_brought_forward(tmp_path):
    from app.db.base import Base
    from app.db.migrate import migrate

    os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{tmp_path}/s-{uuid.uuid4().hex[:8]}.db"
    get_settings.cache_clear()
    await dbsession.dispose_engine()
    async with dbsession.get_engine().begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await conn.execute(text("CREATE TABLE alembic_version (version_num VARCHAR(32))"))
        await conn.execute(text("INSERT INTO alembic_version VALUES ('0001_extensions')"))
    await migrate()  # used to fail: table dealers already exists
    async with dbsession.get_engine().connect() as conn:
        v = (await conn.execute(text("SELECT version_num FROM alembic_version"))).scalar_one()
    from alembic.script import ScriptDirectory
    from app.db.migrate import alembic_config

    assert v == ScriptDirectory.from_config(alembic_config()).get_current_head()
    await dbsession.dispose_engine()


def test_h4_the_container_does_not_run_alembic_a_second_time():
    from pathlib import Path

    entry = (Path(__file__).resolve().parents[1] / "docker-entrypoint.sh").read_text()
    commands = [line for line in entry.splitlines() if line and not line.startswith("#")]
    assert not any("alembic" in line for line in commands)
    assert "--no-proxy-headers" in commands[-1]
    assert "--no-access-log" in commands[-1]  # L5: no query strings (positions) in the access log


# M1: rotating the phone key gave a rival unlimited "not served" reports.


@pytest.mark.asyncio
async def test_m1_an_agent_s_standing_moves_by_only_a_few_reports_an_hour(client):
    codes = []
    for n in range(10):
        body = {"agent_id": "af-024", "answer": "no", "reason_code": "no_cash",
                "client_token": f"rep-m1-{n:010d}"}  # fmt: skip
        r = await client.post("/api/v1/reports", json=body, headers=_phone(n))
        codes.append(r.status_code)
    assert codes.count(201) == 6 and set(codes[6:]) == {429}


# M5: the limits' table grew for ever.


@pytest.mark.asyncio
async def test_m5_old_counts_are_pruned_whatever_their_key(client):
    from app.core.limits import prune_rate_events

    async with await _db() as db:
        old = datetime.now(UTC) - timedelta(days=2)
        db.add_all(RateEvent(key=f"rate:x:client:{n}", at=old) for n in range(50))
        db.add(RateEvent(key="rate:x:client:fresh", at=datetime.now(UTC)))
        await db.commit()
        assert await prune_rate_events(db) >= 50
        left = (
            await db.execute(select(func.count()).where(RateEvent.key.like("rate:x:%")))
        ).scalar_one()
    assert left == 1


# M6: a stolen database or backup gave up every PIN in seconds.


@pytest.mark.asyncio
async def test_m6_pins_are_peppered_and_old_hashes_are_replaced_at_sign_in(client, monkeypatch):
    from app.core import auth

    async with await _db() as db:
        legacy = auth._legacy_hash("1234", "Agent 024")
        await db.execute(update(Agent).where(Agent.ref == "Agent 024").values(pin_hash=legacy))
        await db.commit()
    r = await client.post(SI, json={"ref": "Agent 024", "pin": "1234"}, headers=OWNER_PHONE)
    assert r.status_code == 200
    async with await _db() as db:
        stored = (
            await db.execute(select(Agent.pin_hash).where(Agent.ref == "Agent 024"))
        ).scalar_one()
    assert stored.startswith(auth.PEPPERED) and stored != auth.PEPPERED + legacy
    # Without the pepper, the stored hash cannot be matched by trying PINs.
    monkeypatch.setenv("PIN_PEPPER", "a-different-pepper")
    get_settings.cache_clear()
    assert not auth.verify_pin("1234", "Agent 024", stored)
    monkeypatch.delenv("PIN_PEPPER")
    get_settings.cache_clear()


# M7: Orange's money figures went to every aggregator, unaudited.


@pytest.mark.asyncio
async def test_m7_orange_figures_need_financial_permission_and_are_audited(client, dealer):
    r = await client.get("/api/v1/dealer/report", headers=dealer)
    assert "orange_april_cash_in" in r.json()["rows"][0]  # kissy holds the permission
    async with await _db() as db:
        audited = (
            await db.execute(select(func.count()).where(AuditLog.field == "orange_month"))
        ).scalar_one()
        assert audited == len(r.json()["rows"])
        await db.execute(
            update(Dealer).where(Dealer.id == "kissy").values(permissions="VIEW_AGENT")
        )
        await db.commit()
    r = await client.get("/api/v1/dealer/report", headers=dealer)
    assert "orange_april_cash_in" not in r.json()["rows"][0]
    csv = (await client.get("/api/v1/dealer/report.csv", headers=dealer)).text
    assert "orange_april" not in csv


# L4: only the national CSV was in the export log.


@pytest.mark.asyncio
async def test_l4_every_aggregator_csv_is_in_the_export_log(client, dealer):
    await client.get("/api/v1/dealer/report.csv", headers=dealer)
    await client.get("/api/v1/dealer/records/reports.csv", headers=dealer)
    async with await _db() as db:
        what = set((await db.execute(select(ExportLog.what))).scalars())
    assert {"report.csv", "records/reports.csv"} <= what


# L6: shop photos could be copied by walking the ids.


@pytest.mark.asyncio
async def test_l6_photos_are_rate_limited(client):
    for _ in range(120):
        await client.get("/api/v1/agents/af-024/photo", headers={"X-Client": "w" * 20})
    r = await client.get("/api/v1/agents/af-024/photo", headers={"X-Client": "w" * 20})
    assert r.status_code == 429


# L7: sessions opened with an old 4-digit national PIN stayed open.


@pytest.mark.asyncio
async def test_l7_the_migration_ends_national_sessions_and_clears_old_customer_codes(tmp_path):
    from alembic import command
    from app.db.migrate import alembic_config, migrate

    os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{tmp_path}/n-{uuid.uuid4().hex[:8]}.db"
    get_settings.cache_clear()
    await dbsession.dispose_engine()
    await migrate()
    import asyncio

    await asyncio.to_thread(command.downgrade, alembic_config(), "0005_export_log")
    async with dbsession.get_engine().begin() as conn:
        # The tables as they were at 0005 (written in SQL: today's models have newer columns).
        await conn.execute(
            text(
                "INSERT INTO dealers (id, name, pin_hash, permissions, must_set_pin, source) "
                "VALUES ('orange', 'Orange', 'x', 'VIEW_NATIONAL', 0, 'manual'),"
                "('kissy', 'Kissy', 'x', 'VIEW_AGENT', 0, 'manual')"
            )
        )
    async with dbsession.get_engine().begin() as conn:
        await conn.execute(
            text(
                "INSERT INTO sessions (token, role, subject, revoked) VALUES "
                "('t1', 'dealer', 'orange', 0), ('t2', 'dealer', 'kissy', 0)"
            )
        )
    await migrate()
    async with dbsession.get_engine().connect() as conn:
        rows = dict((await conn.execute(text("SELECT subject, revoked FROM sessions"))).all())
    assert rows == {"orange": 1, "kissy": 0}
    await dbsession.dispose_engine()


@pytest.mark.asyncio
async def test_a_sign_in_remembers_the_device(client):
    await client.post(SI, json={"ref": "Agent 024", "pin": "1234"}, headers=OWNER_PHONE)
    async with await _db() as db:
        clients = set((await db.execute(select(Session.client))).scalars())
    assert any(clients)


# M8: versions were ranges, resolved to whatever was newest at build time.


def test_m8_every_dependency_is_pinned_in_the_lock_file():
    import re
    import tomllib
    from pathlib import Path

    root = Path(__file__).resolve().parents[1]
    deps = tomllib.loads((root / "pyproject.toml").read_text())["project"]["dependencies"]
    lock = (root / "requirements.lock").read_text().splitlines()
    pinned = {
        re.split(r"[\[=]", line)[0].lower(): line
        for line in lock
        if line and not line.startswith("#")
    }
    assert all("==" in line for line in pinned.values())
    for dep in deps:
        name = re.split(r"[\[<>=!~ ]", dep)[0].lower()
        assert name in pinned, f"{name} is not pinned in requirements.lock"
    docker = (root / "Dockerfile").read_text()
    assert "pip install -r requirements.lock" in docker


# Re-review of 2026-11-04 (N = new findings).


@pytest.mark.asyncio
async def test_n1_right_after_launch_a_fresh_code_gets_through_a_filled_new_phone_count(
    client, dealer
):
    # Nobody has a known phone yet (as after the migration); a stranger fills the count.
    for n in range(25):
        await client.post(SI, json={"ref": "Agent 024", "pin": "9999"}, headers=_phone(n))
    r = await client.post(SI, json={"ref": "Agent 024", "pin": "1234"}, headers=_phone(77))
    assert r.status_code == 429  # even the right PIN, from a new phone
    code = (await client.post("/api/v1/dealer/agents/Agent 024/pin", headers=dealer)).json()["code"]
    # The stranger fills it again at once...
    for n in range(30, 55):
        await client.post(SI, json={"ref": "Agent 024", "pin": "9999"}, headers=_phone(n))
    # ...and the fresh code still gets its owner in, from any phone.
    r = await client.post(SI, json={"ref": "Agent 024", "pin": code}, headers=_phone(78))
    assert r.status_code == 200 and r.json()["must_set_pin"] is True
    # A wrong code while the count is full gets the same answer as before.
    r = await client.post(SI, json={"ref": "Agent 024", "pin": "000000"}, headers=_phone(79))
    assert r.status_code == 429


@pytest.mark.asyncio
async def test_n1_an_old_code_does_not_get_through_the_full_count(client, dealer):
    from app.core import limits

    code = (await client.post("/api/v1/dealer/agents/Agent 024/pin", headers=dealer)).json()["code"]
    async with await _db() as db:
        await db.execute(
            update(Agent)
            .where(Agent.ref == "Agent 024")
            .values(code_issued_at=datetime.now(UTC) - limits.FRESH_CODE - timedelta(minutes=1))
        )
        await db.commit()
    for n in range(25):
        await client.post(SI, json={"ref": "Agent 024", "pin": "9999"}, headers=_phone(n))
    r = await client.post(SI, json={"ref": "Agent 024", "pin": code}, headers=_phone(80))
    assert r.status_code == 429


@pytest.mark.asyncio
async def test_n1_changing_the_pin_keeps_the_owner_s_other_phones_known(client):
    other = {"X-Client": "owner-second-phone-000000001"}
    r = await client.post(SI, json={"ref": "kissy", "pin": "1234"}, headers=other)
    assert r.status_code == 200
    r = await client.post(SI, json={"ref": "kissy", "pin": "1234"}, headers=OWNER_PHONE)
    me = {"Authorization": f"Bearer {r.json()['token']}", **OWNER_PHONE}
    r = await client.post(
        "/api/v1/auth/change-pin", json={"current_pin": "1234", "new_pin": "2468"}, headers=me
    )
    assert r.status_code == 200
    for n in range(25):
        await client.post(SI, json={"ref": "kissy", "pin": "9999"}, headers=_phone(n))
    # The second phone was signed out by the change, but it is still the owner's phone.
    r = await client.post(SI, json={"ref": "kissy", "pin": "2468"}, headers=other)
    assert r.status_code == 200, r.text


# N2: the per-agent report cap shut out the agent's real customers.


@pytest.mark.asyncio
async def test_n2_a_rival_filling_the_report_cap_does_not_silence_other_customers(
    tmp_path, monkeypatch
):
    from app.main import create_app
    from httpx import ASGITransport, AsyncClient

    os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{tmp_path}/r-{uuid.uuid4().hex[:8]}.db"
    monkeypatch.setenv("FORWARDED_ALLOW_IPS", "127.0.0.1")
    get_settings.cache_clear()
    await dbsession.dispose_engine()
    app = create_app()

    def body(n: int, answer: str = "no") -> dict:
        return {"agent_id": "af-024", "answer": answer, "reason_code": "no_cash",
                "client_token": f"rep-n2-{n:010d}"}  # fmt: skip

    async with app.router.lifespan_context(app):
        transport = ASGITransport(app=app, client=("127.0.0.1", 1234))
        async with AsyncClient(transport=transport, base_url="http://test") as c:
            rival = {"X-Forwarded-For": "41.9.9.9"}
            codes = [
                (
                    await c.post("/api/v1/reports", json=body(n), headers={**rival, **_phone(n)})
                ).status_code
                for n in range(8)
            ]
            assert codes[:6] == [201] * 6 and codes[6:] == [429, 429]
            real = {"X-Forwarded-For": "41.1.2.3", "X-Client": "real-customer-000000001"}
            r = await c.post("/api/v1/reports", json=body(99, "yes"), headers=real)
            assert r.status_code == 201
    get_settings.cache_clear()
    await dbsession.dispose_engine()


# N3: a URL-encoded database password ("%") crashed start-up and printed the URL.


@pytest.mark.asyncio
async def test_n3_a_percent_sign_in_the_database_url_does_not_stop_migrations(tmp_path):
    from app.db.migrate import migrate

    folder = tmp_path / "pa%40ss"
    folder.mkdir()
    os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{folder}/m.db"
    get_settings.cache_clear()
    await dbsession.dispose_engine()
    await migrate()
    await dbsession.dispose_engine()


# N7: hashes from before the pepper stayed open until their owner signed in.


@pytest.mark.asyncio
async def test_n7_old_hashes_are_sealed_at_start_up_and_still_open_with_the_pin(client):
    from app.core import auth

    async with await _db() as db:
        legacy = auth._legacy_hash("1234", "Agent 024")
        await db.execute(update(Agent).where(Agent.ref == "Agent 024").values(pin_hash=legacy))
        await db.commit()
        assert await auth.wrap_legacy_hashes(db) == 1
        stored = (
            await db.execute(select(Agent.pin_hash).where(Agent.ref == "Agent 024"))
        ).scalar_one()
    assert stored.startswith(auth.WRAPPED) and legacy not in stored
    r = await client.post(SI, json={"ref": "Agent 024", "pin": "1234"}, headers=OWNER_PHONE)
    assert r.status_code == 200
    async with await _db() as db:
        stored = (
            await db.execute(select(Agent.pin_hash).where(Agent.ref == "Agent 024"))
        ).scalar_one()
    assert stored.startswith(auth.PEPPERED)  # replaced by the full form at sign-in
