"""Limits that hold across restarts and servers: the PIN lockout and the request rate limits.
Each counted event is a row in rate_events; a limit counts the rows for its key inside its
window. Wall-clock time on purpose: a lockout must not move with a test's pinned clock.

Sierra Leone's mobile networks put many phones behind one address, so limits by address are
generous and limits by device (the app's X-Client key) or account are the tight ones.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from fastapi import Depends, Header, Request
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError
from app.db.models import RateEvent
from app.db.session import get_session

LOCK_AFTER_FAILURES = 5
LOCK_WINDOW = timedelta(minutes=15)
# On top of the 15-minute lockout: without it, five guesses every 15 minutes would try every
# 4-digit PIN in about three weeks. Past this many in a day the account waits a day or gets a
# new sign-in code (an agent's from their aggregator, which clears the count).
DAILY_LOCK_AFTER = 20
DAILY_WINDOW = timedelta(days=1)


def _now() -> datetime:
    return datetime.now(UTC)


async def _count(
    db: AsyncSession, key: str, window: timedelta, keep: timedelta | None = None
) -> int:
    since = _now() - window
    # Prune this key's old rows as we go, so the table stays small without a cron job; `keep`
    # holds them longer when a wider window counts the same key.
    oldest = _now() - max(window, keep or window)
    await db.execute(delete(RateEvent).where(RateEvent.key == key, RateEvent.at < oldest))
    await db.commit()
    return (
        await db.execute(
            select(func.count())
            .select_from(RateEvent)
            .where(RateEvent.key == key, RateEvent.at >= since)
        )
    ).scalar_one()


async def _note(db: AsyncSession, key: str) -> None:
    db.add(RateEvent(key=key, at=_now()))
    await db.commit()


async def check_sign_in_allowed(db: AsyncSession, key: str) -> None:
    """Every attempt is recorded as a failure first and counted after, so fifty attempts at
    the same moment each see the others; a correct PIN then clears the count. Committed at
    once, so the request failing later cannot roll the count back."""
    await _note(db, f"fail:{key}")
    if await _count(db, f"fail:{key}", DAILY_WINDOW) > DAILY_LOCK_AFTER:
        raise AppError(
            "Too many wrong PINs today. Try again tomorrow, or ask for a new sign-in code.",
            code="rate_limited",
            status_code=429,
        )
    if await _count(db, f"fail:{key}", LOCK_WINDOW, keep=DAILY_WINDOW) > LOCK_AFTER_FAILURES:
        raise AppError(
            "Too many attempts. Try again in 15 minutes.", code="rate_limited", status_code=429
        )


async def clear_sign_in_failures(db: AsyncSession, key: str) -> None:
    await db.execute(delete(RateEvent).where(RateEvent.key == f"fail:{key}"))
    await db.commit()


async def rate_limit(db: AsyncSession, key: str, limit: int, window: timedelta) -> None:
    """Count this request against `key` (recorded first, then counted, so a burst at the
    same moment cannot all slip under); refuse with 429 past `limit` in `window`."""
    await _note(db, f"rate:{key}")
    if await _count(db, f"rate:{key}", window) > limit:
        raise AppError(
            "Too many requests. Wait a minute and try again.", code="rate_limited", status_code=429
        )


def limited(name: str, per_client: int, per_address: int, window: timedelta = timedelta(minutes=1)):
    """A FastAPI dependency: count this request by the app's device key (X-Client) and by the
    network address. Several phones share an address on Sierra Leone's networks, so the
    address limit is the loose one; the device limit is the one a scraper hits."""

    async def dependency(
        request: Request,
        x_client: str | None = Header(default=None),
        db: AsyncSession = Depends(get_session),
    ) -> None:
        address = request.client.host if request.client else "unknown"
        if x_client:
            await rate_limit(db, f"{name}:client:{x_client[:64]}", per_client, window)
        await rate_limit(db, f"{name}:addr:{address}", per_address, window)

    return dependency
