"""Limits that hold across restarts and servers: the PIN lockout and the request rate limits.
Each counted event is a row in rate_events; a limit counts the rows for its key inside its
window. Wall-clock time on purpose: a lockout must not move with a test's pinned clock.

Sierra Leone's mobile networks put many phones behind one address, so limits by address are
generous and limits by device (the app's X-Client key) or account are the tight ones.

The sign-in lockout is per device, not per account (the "device cookie" pattern): wrong PINs
lock the phone that typed them, so a stranger cannot lock an agent out of their own phone. A
stranger switching device keys meets a second, account-wide count kept for devices the account
has never signed in from; the phones it has signed in from before do not count against it and
are never refused by it.
"""

from __future__ import annotations

import asyncio
import hashlib
from datetime import UTC, datetime, timedelta

from fastapi import Depends, Header, Request
from sqlalchemy import delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError
from app.core.logging import get_logger
from app.db.models import RateEvent, Session
from app.db.session import get_session

log = get_logger("app.limits")

# One device, one account: five wrong PINs in 15 minutes, twenty in a day.
LOCK_AFTER_FAILURES = 5
LOCK_WINDOW = timedelta(minutes=15)
# On top of the 15-minute lockout: without it, five guesses every 15 minutes would try every
# 4-digit PIN in about three weeks. Past this many in a day the device waits a day, or the
# account gets a new sign-in code (an agent's from their aggregator, which clears the counts).
DAILY_LOCK_AFTER = 20
DAILY_WINDOW = timedelta(days=1)
# Every device the account has never used, together: a guesser inventing a new device key
# for each try still gets only this many a day. The owner's own phones are not affected.
NEW_DEVICES_PER_DAY = 20
NEW_DEVICES_PER_WINDOW = 10

# No limit counts further back than this; older rows are deleted by prune_rate_events.
LONGEST_WINDOW = timedelta(days=1)
PRUNE_EVERY = timedelta(minutes=10)


def _now() -> datetime:
    return datetime.now(UTC)


async def _note_and_count(db: AsyncSession, key: str, windows: list[timedelta]) -> list[int]:
    """Record one event for `key`, then count it in each window, in one transaction:
    recorded first, so fifty attempts at the same moment each see the others; committed
    before the caller decides, so a request failing later cannot roll the count back."""
    now = _now()
    db.add(RateEvent(key=key, at=now))
    await db.flush()
    counts = []
    for window in windows:
        counts.append(
            (
                await db.execute(
                    select(func.count())
                    .select_from(RateEvent)
                    .where(RateEvent.key == key, RateEvent.at >= now - window)
                )
            ).scalar_one()
        )
    await db.commit()
    return counts


async def prune_rate_events(db: AsyncSession) -> int:
    """Delete every row older than the longest window: keys never seen again (a new device
    key per request, a made-up account name) would otherwise stay for ever."""
    result = await db.execute(delete(RateEvent).where(RateEvent.at < _now() - LONGEST_WINDOW))
    await db.commit()
    return result.rowcount or 0


async def prune_forever(session_factory) -> None:  # noqa: ANN001 - async_sessionmaker
    """Run by the app while it is up: one prune every PRUNE_EVERY. A failed prune is retried
    next time; it never takes the app down."""
    while True:
        try:
            async with session_factory() as db:
                await prune_rate_events(db)
        except Exception:  # noqa: BLE001 - reported, retried next round
            log.exception("rate_events prune failed")  # reaches Sentry when it is on
        await asyncio.sleep(PRUNE_EVERY.total_seconds())


def device_id(x_client: str | None, address: str) -> str:
    """What the lockout knows of a device: a hash of the app's random device key, or of the
    network address when the app sent none. A key too short to be the app's random one (the
    'anon' fallback) is not trusted as a device."""
    raw = (x_client or "").strip()
    raw = f"client:{raw[:64]}" if len(raw) >= 16 else f"addr:{address}"
    return hashlib.sha256(raw.encode()).hexdigest()[:32]


async def device_known(db: AsyncSession, account: tuple[str, str] | None, device: str) -> bool:
    """Has this account signed in from this device before?"""
    if account is None:
        return False
    role, subject = account
    found = (
        await db.execute(
            select(Session.token)
            .where(Session.role == role, Session.subject == subject, Session.client == device)
            .limit(1)
        )
    ).scalar_one_or_none()
    return found is not None


NEW_DEVICES_MESSAGE = (
    "Too many attempts on this account from new phones. Sign in on a phone you have used "
    "before, or ask for a new sign-in code."
)
# A code just read out in person gets through the new-phone count for this long, so a stranger
# filling that count cannot keep its owner out. Six digits, once, for half an hour: a guesser
# held to the per-address limit has about a one-in-a-thousand chance in that window.
FRESH_CODE = timedelta(minutes=30)


def code_is_fresh(must_set_pin: bool, issued_at: datetime | None) -> bool:
    if not must_set_pin or issued_at is None:
        return False
    if issued_at.tzinfo is None:
        issued_at = issued_at.replace(tzinfo=UTC)
    return _now() - issued_at <= FRESH_CODE


async def check_sign_in_allowed(
    db: AsyncSession, key: str, device: str, *, known_device: bool
) -> bool:
    """One sign-in attempt for the account under `key` from `device`, counted as a failure
    until a correct PIN clears it. Refuses at once when this device has used up its tries.
    Returns True when the account's count for new phones is used up: the caller then refuses
    too, after checking the PIN, unless it was a fresh one-time code (code_is_fresh)."""
    in_day, in_window = await _note_and_count(
        db, f"fail:{key}:dev:{device}", [DAILY_WINDOW, LOCK_WINDOW]
    )
    if in_day > DAILY_LOCK_AFTER:
        raise AppError(
            "Too many wrong PINs on this phone today. Try again tomorrow, or ask for a new "
            "sign-in code.",
            code="rate_limited",
            status_code=429,
        )
    if in_window > LOCK_AFTER_FAILURES:
        raise AppError(
            "Too many attempts. Try again in 15 minutes.", code="rate_limited", status_code=429
        )
    if known_device:
        return False
    new_day, new_window = await _note_and_count(db, f"fail:{key}:new", [DAILY_WINDOW, LOCK_WINDOW])
    return new_day > NEW_DEVICES_PER_DAY or new_window > NEW_DEVICES_PER_WINDOW


def new_devices_refused() -> AppError:
    return AppError(NEW_DEVICES_MESSAGE, code="rate_limited", status_code=429)


async def check_pin_allowed(db: AsyncSession, key: str) -> None:
    """A PIN typed inside a signed-in session (check-pin, change-PIN): only the session's
    holder can reach it, so the count is the account's own."""
    in_day, in_window = await _note_and_count(db, f"fail:{key}", [DAILY_WINDOW, LOCK_WINDOW])
    if in_day > DAILY_LOCK_AFTER:
        raise AppError(
            "Too many wrong PINs today. Try again tomorrow, or ask for a new sign-in code.",
            code="rate_limited",
            status_code=429,
        )
    if in_window > LOCK_AFTER_FAILURES:
        raise AppError(
            "Too many attempts. Try again in 15 minutes.", code="rate_limited", status_code=429
        )


def _like_escape(text: str) -> str:
    return text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


async def clear_sign_in_failures(db: AsyncSession, key: str, device: str | None = None) -> None:
    """With a device: that device's count for this account (a correct PIN). Without one:
    every count for the account, every device and the new-device count (a new sign-in code)."""
    if device is not None:
        cond = RateEvent.key == f"fail:{key}:dev:{device}"
    else:
        cond = or_(
            RateEvent.key == f"fail:{key}",
            RateEvent.key.like(f"{_like_escape(f'fail:{key}:')}%", escape="\\"),
        )
    await db.execute(delete(RateEvent).where(cond))
    await db.commit()


async def rate_limit(db: AsyncSession, key: str, limit: int, window: timedelta) -> None:
    """Count this request against `key` (recorded first, then counted, so a burst at the
    same moment cannot all slip under); refuse with 429 past `limit` in `window`."""
    (count,) = await _note_and_count(db, f"rate:{key}", [window])
    if count > limit:
        raise AppError(
            "Too many requests. Wait a minute and try again.", code="rate_limited", status_code=429
        )


def client_address(request: Request) -> str:
    """The client's address: behind the load balancer, the one it vouched for
    (ProxyHeadersMiddleware, FORWARDED_ALLOW_IPS); otherwise the direct peer."""
    return request.client.host if request.client else "unknown"


def limited(name: str, per_client: int, per_address: int, window: timedelta = timedelta(minutes=1)):
    """A FastAPI dependency: count this request by the app's device key (X-Client) and by the
    network address. Several phones share an address on Sierra Leone's networks, so the
    address limit is the loose one; the device limit is the one a scraper hits."""

    async def dependency(
        request: Request,
        x_client: str | None = Header(default=None),
        db: AsyncSession = Depends(get_session),
    ) -> None:
        if x_client:
            await rate_limit(db, f"{name}:client:{x_client[:64]}", per_client, window)
        await rate_limit(db, f"{name}:addr:{client_address(request)}", per_address, window)

    return dependency
