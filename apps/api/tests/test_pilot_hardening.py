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
from sqlalchemy import func, select


def _settings(**kw) -> Settings:
    # _env_file=None: the machine's .env must not leak into these assertions.
    return Settings(_env_file=None, **kw)


def test_seed_defaults_on_everywhere_except_production(monkeypatch):
    monkeypatch.delenv("SEED_ON_START", raising=False)
    monkeypatch.delenv("CORS_ORIGINS", raising=False)
    assert _settings(app_env="development").seed_on_start is True
    assert _settings(app_env="test").seed_on_start is True
    prod = _settings(app_env="production", cors_origins="https://agentfinder.example")
    assert prod.seed_on_start is False
    # An explicit value still wins, in either direction.
    assert (
        _settings(
            app_env="production", cors_origins="https://x.example", seed_on_start=True
        ).seed_on_start
        is True
    )
    assert _settings(app_env="development", seed_on_start=False).seed_on_start is False


def test_production_without_cors_origins_refuses_to_start(monkeypatch):
    monkeypatch.delenv("CORS_ORIGINS", raising=False)
    with pytest.raises(ValidationError, match="CORS_ORIGINS must be set in production"):
        _settings(app_env="production")
    # Development keeps the local dev servers; a comma-separated value is split and trimmed.
    assert _settings(app_env="development").cors_origins == [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]
    assert _settings(
        app_env="production", cors_origins=" https://a.example, https://b.example "
    ).cors_origins == [  # noqa: E501
        "https://a.example",
        "https://b.example",
    ]


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
            "comment": "c" * 281,
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
