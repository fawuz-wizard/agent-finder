"""The database is built by migrations, and the models and the migrations never disagree: a
model change without a migration fails here, before it can crash a live server at start-up."""

from __future__ import annotations

import os
import uuid

import pytest
from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from app.core.settings import get_settings
from app.db import session as dbsession
from app.db.base import Base
from app.db.migrate import migrate
from sqlalchemy import inspect, text


async def _fresh(tmp_path):
    os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{tmp_path}/mig-{uuid.uuid4().hex[:8]}.db"
    get_settings.cache_clear()
    await dbsession.dispose_engine()


@pytest.mark.asyncio
async def test_an_empty_database_is_built_by_migrations_and_matches_the_models(tmp_path):
    await _fresh(tmp_path)
    await migrate()
    async with dbsession.get_engine().connect() as conn:
        tables = set(await conn.run_sync(lambda c: inspect(c).get_table_names()))
        diff = await conn.run_sync(
            lambda c: compare_metadata(MigrationContext.configure(c), Base.metadata)
        )
    assert set(Base.metadata.tables) <= tables and "alembic_version" in tables
    assert diff == [], f"models and migrations disagree; add a migration: {diff}"
    await dbsession.dispose_engine()


@pytest.mark.asyncio
async def test_a_database_made_before_migrations_is_kept_and_brought_forward(tmp_path):
    await _fresh(tmp_path)
    # The pilot's database: made by create_all, without the newest tables and without Alembic.
    async with dbsession.get_engine().begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await conn.execute(text("DROP TABLE agent_checkins"))
        await conn.execute(text("DROP INDEX uq_float_one_pending"))
        await conn.execute(text("INSERT INTO rate_events (key, at) VALUES ('kept', '2026-11-01')"))
    await migrate()
    async with dbsession.get_engine().connect() as conn:
        names = set(await conn.run_sync(lambda c: inspect(c).get_table_names()))
        kept = (await conn.execute(text("SELECT key FROM rate_events"))).scalar_one()
        indexes = await conn.run_sync(
            lambda c: [i["name"] for i in inspect(c).get_indexes("float_requests")]
        )
    assert "agent_checkins" in names and kept == "kept" and "uq_float_one_pending" in indexes
    await dbsession.dispose_engine()
