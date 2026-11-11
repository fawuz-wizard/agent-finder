"""Production hardening for the pilot: no demo seed over real data, CORS must be explicit in
production, free text is bounded, and the unfinished admin surface is not reachable."""

from __future__ import annotations

import os
import uuid

import pytest
from app.core.settings import Settings, get_settings
from app.db import session as dbsession
from app.db.models import Agent, Dealer
from app.main import create_app
from app.seed import seed_if_empty
from pydantic import ValidationError
from sqlalchemy import func, select, text


def _settings(**kw) -> Settings:
    # _env_file=None: the machine's .env must not leak into these assertions.
    return Settings(_env_file=None, **kw)


LIVE = {
    "cors_origins": "https://agentfinder.example",
    "customer_hash_key": "k" * 32,
    "pin_pepper": "p" * 32,
    "forwarded_allow_ips": "10.0.0.0/16",
}


def test_seed_defaults_on_only_in_tests(monkeypatch):
    """The fixture network is for the test suite. A laptop starts empty and is filled by the
    Orange import or by registering agents; a live server never plants demo PINs."""
    monkeypatch.delenv("SEED_ON_START", raising=False)
    monkeypatch.delenv("CORS_ORIGINS", raising=False)
    assert _settings(app_env="development").seed_on_start is False
    assert _settings(app_env="test").seed_on_start is True
    assert _settings(app_env="production", **LIVE).seed_on_start is False
    # Asking a live server for the demo accounts, whose PINs are public, refuses to start.
    for env in ("production", "staging"):
        with pytest.raises(ValidationError, match="SEED_ON_START must be false"):
            _settings(app_env=env, **{**LIVE, "seed_on_start": True})
    assert _settings(app_env="development", seed_on_start=False).seed_on_start is False


def test_production_without_cors_origins_refuses_to_start(monkeypatch):
    monkeypatch.delenv("CORS_ORIGINS", raising=False)
    with pytest.raises(ValidationError, match="CORS_ORIGINS must be set in production"):
        _settings(app_env="production")
    # Development keeps the local dev servers; a comma-separated value is split and trimmed.
    # ...plus the origins the Android APK serves the same build from (Capacitor).
    dev = _settings(app_env="development").cors_origins
    assert dev[:2] == ["http://localhost:5173", "http://127.0.0.1:5173"]
    assert "http://localhost:5174" in dev and "http://127.0.0.1:5178" in dev
    assert dev[-3:] == ["https://localhost", "http://localhost", "capacitor://localhost"]
    assert _settings(
        app_env="production", **{**LIVE, "cors_origins": " https://a.example, https://b.example "}
    ).cors_origins == ["https://a.example", "https://b.example"]


@pytest.mark.parametrize(
    ("change", "message"),
    [
        ({"pin_pepper": ""}, "PIN_PEPPER must be set"),
        ({"customer_hash_key": "short"}, "CUSTOMER_HASH_KEY must be set"),
        ({"forwarded_allow_ips": ""}, "FORWARDED_ALLOW_IPS must be set"),
        ({"forwarded_allow_ips": "*"}, "not '\\*'"),
        ({"cors_origins": "http://localhost:5173"}, "only https://"),
        ({"cors_origins": "*"}, "only https://"),
    ],
)
def test_production_refuses_an_unsafe_setting(monkeypatch, change, message):
    monkeypatch.delenv("SEED_ON_START", raising=False)
    with pytest.raises(ValidationError, match=message):
        _settings(app_env="production", **{**LIVE, **change})


def test_production_allows_the_android_app_origin():
    origins = "https://agentfinder.example,https://localhost,capacitor://localhost"
    s = _settings(app_env="production", **{**LIVE, "cors_origins": origins})
    assert "https://localhost" in s.cors_origins


@pytest.fixture
async def empty_db(tmp_path, monkeypatch):
    """An app whose database was created but never seeded."""
    monkeypatch.setenv("SEED_ON_START", "false")
    os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{tmp_path}/bare-{uuid.uuid4().hex[:8]}.db"
    get_settings.cache_clear()
    await dbsession.dispose_engine()
    app = create_app()
    async with app.router.lifespan_context(app):
        yield app
    await dbsession.dispose_engine()
    get_settings.cache_clear()


async def _counts() -> tuple[int, int]:
    async with dbsession.get_session_factory()() as db:
        dealers = (await db.execute(select(func.count()).select_from(Dealer))).scalar_one()
        agents = (await db.execute(select(func.count()).select_from(Agent))).scalar_one()
    return dealers, agents


@pytest.mark.asyncio
async def test_seed_off_leaves_the_database_empty(empty_db):
    assert await _counts() == (0, 0)


@pytest.mark.asyncio
async def test_seed_refuses_when_agents_exist_whatever_the_flag(empty_db):
    async with dbsession.get_session_factory()() as db:
        # An agent with no aggregator on record: a state only an old, unchecked file can hold,
        # so the foreign-key check is off for this one setup write.
        await db.execute(text("PRAGMA foreign_keys=OFF"))
        db.add(
            Agent(
                ref="Real 001",
                dealer_id="someone",
                person_name="A real person",
                shop_name="A real shop",
                area="Kissy",
                street="",
                lat=8.48,
                lng=-13.2,
                phone=None,
                pin_hash="x",
                presence="closed",
                cash_out="none",
                deposit="none",
            )
        )
        await db.commit()
    await seed_if_empty()  # called directly, as SEED_ON_START=true would at startup
    assert await _counts() == (0, 1)  # no demo dealer, no demo agents, no PIN 1234


@pytest.mark.asyncio
async def test_seed_is_idempotent_on_a_seeded_database(client):
    before = await _counts()
    await seed_if_empty()
    assert await _counts() == before


@pytest.mark.asyncio
async def test_search_area_is_trimmed_bounded_and_never_empty(client):
    ok = await client.post(
        "/api/v1/search",
        json={"transaction": "cash_out", "amount_sle": 2000, "area": "  Lumley  "},
        headers={"X-Client": "t"},
    )
    assert ok.status_code == 200 and ok.json()["query"]["area"] == "Lumley"
    for bad in ("", "   ", "x" * 61):
        r = await client.post(
            "/api/v1/search",
            json={"transaction": "cash_out", "amount_sle": 2000, "area": bad},
            headers={"X-Client": "t"},
        )
        assert r.status_code == 422, repr(bad)


@pytest.mark.asyncio
async def test_other_free_text_fields_are_bounded(client, agent, dealer):
    r = await client.post(
        "/api/v1/float-requests",
        json={"amount_sle": 1000, "reason": "r" * 161},
        headers=agent,
    )
    assert r.status_code == 422
    r = await client.post(
        "/api/v1/financial/Agent 024",
        json={"field": "balance", "purpose": "p" * 161},
        headers=dealer,
    )
    assert r.status_code == 422
    r = await client.post(
        "/api/v1/reports",
        json={
            "agent_id": "af-024",
            "answer": "yes",
            "source": "search",
            "client_token": "tok-long",
            "comment": "c" * 1001,
        },
        headers={"X-Client": "t"},
    )
    assert r.status_code == 422
    r = await client.post(
        "/api/v1/auth/sign-in", json={"ref": "x" * 61, "pin": "1234", "role": "agent"}
    )
    assert r.status_code == 422


@pytest.mark.asyncio
async def test_admin_surface_is_not_mounted_for_the_pilot(client, dealer):
    for path in ("/api/v1/admin", "/api/v1/admin/", "/api/v1/admin/agents"):
        assert (await client.get(path, headers=dealer)).status_code == 404, path
    assert "admin" not in (await client.get("/api/v1")).json()["resources"]


def test_production_without_a_customer_hash_key_refuses_to_start(monkeypatch):
    with pytest.raises(ValidationError, match="CUSTOMER_HASH_KEY must be set in production"):
        _settings(app_env="production", cors_origins="https://agentfinder.example")


@pytest.mark.asyncio
@pytest.mark.parametrize("env", ["staging", "production"])
async def test_a_public_server_hides_the_api_docs_and_insists_on_https(env):
    """Staging is a public address too: no API map for strangers, and browsers are told to
    use HTTPS only (HSTS). A laptop in development keeps both."""
    from httpx import ASGITransport, AsyncClient

    app = create_app(_settings(app_env=env, **LIVE))
    async with AsyncClient(transport=ASGITransport(app=app), base_url="https://test") as c:
        for path in ("/docs", "/openapi.json", "/redoc"):
            assert (await c.get(path)).status_code == 404, path
        r = await c.get("/health")
        assert r.headers["strict-transport-security"].startswith("max-age=")
        assert r.headers["x-frame-options"] == "DENY"
    dev = create_app(_settings(app_env="development"))
    async with AsyncClient(transport=ASGITransport(app=dev), base_url="http://test") as c:
        assert (await c.get("/openapi.json")).status_code == 200
        assert "strict-transport-security" not in (await c.get("/health")).headers
