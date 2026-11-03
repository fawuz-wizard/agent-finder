"""Bring the database to the current schema at start-up, by migrations.

A new database is built by the migrations alone. A database made before migrations were in use
(by create_all, like the pilot's) is first given any tables it lacks, as before, then marked as
being at the baseline, then migrated forward from there; nothing in it is dropped. From now on
a change to an existing table is a new file in alembic/versions, and a test fails if the models
and the migrations ever disagree.
"""

from __future__ import annotations

import asyncio
from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import inspect

from app.db.base import Base
from app.db.session import get_engine

BASELINE = "0002_baseline"
API_DIR = Path(__file__).resolve().parents[2]


def alembic_config() -> Config:
    cfg = Config(str(API_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(API_DIR / "alembic"))
    cfg.attributes["configure_logger"] = False
    return cfg


async def migrate() -> None:
    import app.db.models  # noqa: F401  (every table on Base.metadata)

    async with get_engine().begin() as conn:
        tables = set(await conn.run_sync(lambda c: inspect(c).get_table_names()))
        legacy = "agents" in tables and "alembic_version" not in tables
        if legacy:
            await conn.run_sync(Base.metadata.create_all)
    cfg = alembic_config()
    # Alembic runs its own event loop (alembic/env.py), so it gets a thread of its own.
    if legacy:
        await asyncio.to_thread(command.stamp, cfg, BASELINE)
    await asyncio.to_thread(command.upgrade, cfg, "head")
