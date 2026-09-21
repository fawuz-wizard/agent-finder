"""Counting real use. One row per real action; the pilot's "10+ users" number comes from here."""

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import UsageEvent


async def record(
    db: AsyncSession, kind: str, actor_kind: str, actor_key: str, agent_ref: str | None = None
) -> None:
    db.add(
        UsageEvent(kind=kind, actor_kind=actor_kind, actor_key=actor_key[:64], agent_ref=agent_ref)
    )


async def summary(db: AsyncSession) -> dict:
    rows = (
        await db.execute(
            select(UsageEvent.actor_kind, func.count(func.distinct(UsageEvent.actor_key))).group_by(
                UsageEvent.actor_kind
            )
        )
    ).all()
    by_actor = {k: int(n) for k, n in rows}
    kinds = (
        await db.execute(select(UsageEvent.kind, func.count()).group_by(UsageEvent.kind))
    ).all()
    return {
        "distinct_customers": by_actor.get("customer", 0),
        "distinct_agents": by_actor.get("agent", 0),
        "distinct_dealers": by_actor.get("dealer", 0),
        "distinct_users": sum(by_actor.values()),
        "events": {k: int(n) for k, n in kinds},
    }
