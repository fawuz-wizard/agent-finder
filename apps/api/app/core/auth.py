"""Bearer sessions. A token identifies a role and a subject; permissions come from the
database on every request, so a change to a dealer's grants takes effect immediately."""

from __future__ import annotations

import hashlib
import hmac
import secrets
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
    # Register and edit the agents under me (their record, location, hours, initial PIN).
    "MANAGE_AGENT",
    # Orange's national view: the map and counts for every agent in the country. Read only.
    "VIEW_NATIONAL",
    # Upload Orange's daily Global Report (national console): preview, then apply.
    "IMPORT_GLOBAL_REPORT",
}


PEPPERED = "p1$"


def _legacy_hash(pin: str, salt: str) -> str:
    return hashlib.pbkdf2_hmac("sha256", pin.encode(), salt.encode(), 100_000).hex()


def hash_pin(pin: str, salt: str) -> str:
    """PBKDF2 over an HMAC of the PIN with PIN_PEPPER, a secret that lives only in the host's
    secret store: a copy of the database or a backup is not enough to try the 10^4 PINs."""
    from app.core.settings import get_settings

    pepper = get_settings().pin_pepper.encode()
    peppered = hmac.new(pepper, pin.encode(), hashlib.sha256).digest()
    return PEPPERED + hashlib.pbkdf2_hmac("sha256", peppered, salt.encode(), 100_000).hex()


# A hash from before the pepper, sealed with it in place (wrap_legacy_hashes): HMAC with the
# pepper over the old PBKDF2, so a copy of the database no longer opens it either.
WRAPPED = "p2$"


def _wrap(legacy: str) -> str:
    from app.core.settings import get_settings

    pepper = get_settings().pin_pepper.encode()
    return WRAPPED + hmac.new(pepper, legacy.encode(), hashlib.sha256).hexdigest()


def verify_pin(pin: str, salt: str, stored: str) -> bool:
    """Constant-time. Older hashes (wrapped, or from before the pepper) still verify;
    needs_rehash says to replace them the next time their owner signs in."""
    if stored.startswith(PEPPERED):
        return hmac.compare_digest(hash_pin(pin, salt), stored)
    if stored.startswith(WRAPPED):
        return hmac.compare_digest(_wrap(_legacy_hash(pin, salt)), stored)
    return hmac.compare_digest(PEPPERED + _legacy_hash(pin, salt), PEPPERED + stored)


def needs_rehash(stored: str) -> bool:
    return not stored.startswith(PEPPERED)


async def wrap_legacy_hashes(db: AsyncSession) -> int:
    """At start-up: every PIN or unused code hashed before the pepper is sealed with it now,
    not only when its owner next signs in (some never do). Returns how many were sealed."""
    from app.db.models import Agent

    sealed = 0
    for model in (Agent, Dealer):
        rows = (
            await db.execute(
                select(model).where(
                    model.pin_hash != "",
                    model.pin_hash.not_like(f"{PEPPERED}%"),
                    model.pin_hash.not_like(f"{WRAPPED}%"),
                )
            )
        ).scalars()
        for row in rows:
            row.pin_hash = _wrap(row.pin_hash)
            sealed += 1
    await db.commit()
    return sealed


def new_token() -> str:
    return secrets.token_urlsafe(32)


# A one-time sign-in code: six digits, read out in person. It is stored exactly like a PIN
# and typed into the same field; the account is marked must_set_pin until the person
# replaces it with a PIN of their own, which only they know.
CODE_DIGITS = 6


def new_code() -> str:
    return f"{secrets.randbelow(10**CODE_DIGITS):0{CODE_DIGITS}d}"


SESSION_MAX_AGE = timedelta(days=30)


def token_key(token: str) -> str:
    """What the sessions table keeps of a sign-in token: its SHA-256, never the token itself,
    so a leaked database or backup holds no working sign-ins."""
    return hashlib.sha256(token.encode()).hexdigest()


# The PIN lockout lives in app/core/limits.py, in the database, so it survives restarts.


@dataclass(frozen=True)
class Principal:
    role: str  # agent|dealer
    subject: str
    name: str
    permissions: frozenset[str]
    # Signed in with a one-time code: the only thing this session may do is choose a PIN.
    must_set_pin: bool = False

    def can(self, permission: str) -> bool:
        return permission in self.permissions


def pin_required() -> AppError:
    return AppError("Choose your PIN first.", code="pin_required", status_code=403)


async def current_principal(
    authorization: str | None = Header(default=None),
    db: AsyncSession = Depends(get_session),
) -> Principal:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise UnauthorizedError("Sign in first.")
    token = authorization.split(" ", 1)[1].strip()
    sess = await db.get(Session, token_key(token))
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
        return Principal("dealer", dealer.id, dealer.name, perms, dealer.must_set_pin)
    from app.db.models import Agent  # local import keeps the module graph simple

    agent = (await db.execute(select(Agent).where(Agent.ref == sess.subject))).scalar_one_or_none()
    if agent is None:
        raise UnauthorizedError("That session has ended. Sign in again.")
    return Principal("agent", agent.ref, agent.shop_name, frozenset(), agent.must_set_pin)


async def settled_principal(p: Principal = Depends(current_principal)) -> Principal:
    """Any signed-in person who has chosen their PIN. Routes open to both roles use this."""
    if p.must_set_pin:
        raise pin_required()
    return p


def require_role(role: str):
    async def _dep(p: Principal = Depends(current_principal)) -> Principal:
        if p.role != role:
            # Absent, not hinted: the wrong role gets a 404 shape, never a 403 that maps the API.
            raise ForbiddenError("Not available.", code="not_found", status_code=404)
        if p.must_set_pin:
            raise pin_required()
        return p

    return _dep


def require_permission(permission: str):
    async def _dep(p: Principal = Depends(current_principal)) -> Principal:
        if p.role != "dealer" or not p.can(permission):
            raise ForbiddenError("Not available.", code="not_found", status_code=404)
        if p.must_set_pin:
            raise pin_required()
        return p

    return _dep
