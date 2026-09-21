"""Bearer sessions. A token identifies a role and a subject; permissions come from the
database on every request, so a change to a dealer's grants takes effect immediately."""

from __future__ import annotations

import hashlib
import hmac
import secrets
import time
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from fastapi import Depends, Header
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError, ForbiddenError, UnauthorizedError
from app.db.models import Dealer, Session
from app.db.session import get_session

PERMISSIONS = {
    "VIEW_AGENT",
    "VIEW_AGENT_FINANCIAL_DETAIL",
    "MANAGE_FLOAT_REQUEST",
    "VIEW_AGENT_HISTORY",
    "CONTACT_AGENT",
    "ESCALATE_AGENT",
}


def hash_pin(pin: str, salt: str) -> str:
    return hashlib.pbkdf2_hmac("sha256", pin.encode(), salt.encode(), 100_000).hex()


def verify_pin(pin: str, salt: str, stored: str) -> bool:
    return hmac.compare_digest(hash_pin(pin, salt), stored)


def new_token() -> str:
    return secrets.token_urlsafe(32)


SESSION_MAX_AGE = timedelta(days=30)

# A 4-6 digit PIN survives only if guessing is slow. Per-account lockout, in memory: the
# API is one process, so this needs no store. Cleared on a successful sign-in.
LOCK_AFTER_FAILURES = 5
LOCK_WINDOW_SECONDS = 15 * 60
_failed_sign_ins: dict[str, list[float]] = {}


def check_sign_in_allowed(key: str) -> None:
    now = time.monotonic()
    recent = [t for t in _failed_sign_ins.get(key, []) if now - t < LOCK_WINDOW_SECONDS]
    _failed_sign_ins[key] = recent
    if len(recent) >= LOCK_AFTER_FAILURES:
        raise AppError(
            "Too many attempts. Try again in 15 minutes.", code="rate_limited", status_code=429
        )


def note_sign_in_failure(key: str) -> None:
    _failed_sign_ins.setdefault(key, []).append(time.monotonic())


def clear_sign_in_failures(key: str) -> None:
    _failed_sign_ins.pop(key, None)


@dataclass(frozen=True)
class Principal:
    role: str  # agent|dealer
    subject: str
    name: str
    permissions: frozenset[str]

    def can(self, permission: str) -> bool:
        return permission in self.permissions


async def current_principal(
    authorization: str | None = Header(default=None),
    db: AsyncSession = Depends(get_session),
) -> Principal:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise UnauthorizedError("Sign in first.")
    token = authorization.split(" ", 1)[1].strip()
    sess = await db.get(Session, token)
    if sess is None or sess.revoked:
        raise UnauthorizedError("That session has ended. Sign in again.")
    created = sess.created_at if sess.created_at.tzinfo else sess.created_at.replace(tzinfo=UTC)
    if datetime.now(UTC) - created > SESSION_MAX_AGE:
        raise UnauthorizedError("That session has ended. Sign in again.")
    if sess.role == "dealer":
        dealer = await db.get(Dealer, sess.subject)
        if dealer is None:
            raise UnauthorizedError("That session has ended. Sign in again.")
        perms = frozenset(p for p in dealer.permissions.split(",") if p)
        return Principal("dealer", dealer.id, dealer.name, perms)
    from app.db.models import Agent  # local import keeps the module graph simple

    agent = (await db.execute(select(Agent).where(Agent.ref == sess.subject))).scalar_one_or_none()
    if agent is None:
        raise UnauthorizedError("That session has ended. Sign in again.")
    return Principal("agent", agent.ref, agent.shop_name, frozenset())


def require_role(role: str):
    async def _dep(p: Principal = Depends(current_principal)) -> Principal:
        if p.role != role:
            # Absent, not hinted: the wrong role gets a 404 shape, never a 403 that maps the API.
            raise ForbiddenError("Not available.", code="not_found", status_code=404)
        return p

    return _dep


def require_permission(permission: str):
    async def _dep(p: Principal = Depends(current_principal)) -> Principal:
        if p.role != "dealer" or not p.can(permission):
            raise ForbiddenError("Not available.", code="not_found", status_code=404)
        return p

    return _dep
