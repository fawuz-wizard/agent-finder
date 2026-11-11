"""The pilot week loader: only agents on record, figures add up, the 7-day rule reads them,
a re-run replaces instead of doubling, --remove takes exactly these away, nothing else moves."""

from __future__ import annotations

from datetime import UTC, date, datetime

import pytest
from app.db import session as dbsession
from app.db.models import Agent, AgentTransaction
from app.services.week_rule import weeks_for
from scripts.load_pilot_week import load, remove, split
from sqlalchemy import func, select, update

TODAY = date(2026, 11, 11)


async def _give_code(ref: str, code: str) -> None:
    async with dbsession.get_session_factory()() as db:
        await db.execute(update(Agent).where(Agent.ref == ref).values(agent_code=code))
        await db.commit()


def _file(tmp_path, rows: list[str]):
    p = tmp_path / "week.csv"
    p.write_text("date,agent_code,cash_in,cash_out\n" + "\n".join(rows) + "\n")
    return p


async def _pilot_rows(ref: str | None = None) -> list[AgentTransaction]:
    async with dbsession.get_session_factory()() as db:
        q = select(AgentTransaction).where(AgentTransaction.source == "pilot")
        if ref:
            q = q.where(AgentTransaction.agent_ref == ref)
        return list((await db.execute(q)).scalars())


def test_a_day_is_split_into_amounts_that_add_up_exactly():
    import random

    for total in (1, 7, 450, 1250, 2_240_882):
        parts = split(total, random.Random(total))
        assert sum(parts) == total and all(p > 0 for p in parts) and len(parts) <= 12
    assert split(0, random.Random(0)) == []


@pytest.mark.asyncio
async def test_only_agents_on_record_are_loaded_and_the_figures_add_up(client, tmp_path):
    await _give_code("Agent 024", "207979")
    f = _file(
        tmp_path,
        [
            "2026-11-04,207979,1250,800",
            "2026-11-05,207979,0,0",  # a day off writes nothing
            "2026-11-06,207979,450,300.5",
            "2026-11-04,999999,5000,5000",  # nobody holds this code: skipped, never created
        ],
    )
    dry = await load(f, apply=False, keep_dates=False, today=TODAY)
    assert dry["agents_on_record"] == 1 and dry["agents_skipped_not_on_record"] == 1
    assert dry["applied"] is False and await _pilot_rows() == []

    out = await load(f, apply=True, keep_dates=False, today=TODAY)
    assert out["applied"] and out["to"] == "2026-11-10"  # moved to end yesterday
    rows = await _pilot_rows("Agent 024")
    by_day: dict = {}
    for t in rows:
        by_day.setdefault((t.at.date(), t.transaction), 0)
        by_day[(t.at.date(), t.transaction)] += t.amount_sle
    assert by_day == {
        (date(2026, 11, 8), "deposit"): 1250,
        (date(2026, 11, 8), "cash_out"): 800,
        (date(2026, 11, 10), "deposit"): 450,
        (date(2026, 11, 10), "cash_out"): 300,  # 300.5 rounds to whole leones
    }
    async with dbsession.get_session_factory()() as db:
        assert await db.get(Agent, "Agent 999999") is None


@pytest.mark.asyncio
async def test_the_seven_day_rule_reads_the_pilot_week(client, tmp_path):
    await _give_code("Agent 031", "268236")
    f = _file(tmp_path, [f"2026-11-0{d},268236,2012,1150" for d in range(4, 9)])
    await load(f, apply=True, keep_dates=False, today=TODAY)
    now = datetime(2026, 11, 11, 12, 0, tzinfo=UTC)
    async with dbsession.get_session_factory()() as db:
        week = (await weeks_for(db, ["Agent 031"], now))["Agent 031"]
    assert week.active_days >= 5


@pytest.mark.asyncio
async def test_a_rerun_replaces_and_remove_takes_only_pilot_rows(client, tmp_path):
    await _give_code("Agent 009", "268223")
    async with dbsession.get_session_factory()() as db:
        agent_own = (
            await db.execute(select(func.count()).select_from(AgentTransaction))
        ).scalar_one()
        before = await db.get(Agent, "Agent 009")
        snapshot = (before.verified, before.street, before.lat, before.lng, before.dealer_id)
    f = _file(tmp_path, ["2026-11-04,268223,450,300", "2026-11-05,268223,900,600"])
    await load(f, apply=True, keep_dates=True, today=TODAY)
    first = len(await _pilot_rows())
    await load(f, apply=True, keep_dates=True, today=TODAY)
    assert len(await _pilot_rows()) == first > 0  # replaced, not doubled
    async with dbsession.get_session_factory()() as db:
        after = await db.get(Agent, "Agent 009")
        assert (after.verified, after.street, after.lat, after.lng, after.dealer_id) == snapshot

    assert (await remove(apply=False))["removed"] is False
    assert (await remove(apply=True))["pilot_transactions"] == first
    assert await _pilot_rows() == []
    async with dbsession.get_session_factory()() as db:
        left = (await db.execute(select(func.count()).select_from(AgentTransaction))).scalar_one()
    assert left == agent_own  # what agents recorded themselves is untouched


@pytest.mark.asyncio
async def test_a_file_without_the_columns_is_refused(client, tmp_path):
    p = tmp_path / "bad.csv"
    p.write_text("Agent Code,Cash In\n207979,1250\n")
    with pytest.raises(SystemExit):
        await load(p, apply=False, keep_dates=False, today=TODAY)
