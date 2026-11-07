"""One sign-in for agents and dealers. Nobody chooses who they are: the number decides. An
agent code or an agent's Orange Money line opens the Agent App; an aggregator's line or
account id opens the console. The server resolves the account from the credential and the
PIN, and is the authority on the role; an older client may still send a role as a hint."""

from __future__ import annotations

import re
from datetime import timedelta
from typing import Literal

from fastapi import APIRouter, Depends, Header, Request
from pydantic import BaseModel, Field
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import (
    Principal,
    current_principal,
    hash_pin,
    needs_rehash,
    new_token,
    settled_principal,
    token_key,
    verify_pin,
)
from app.core.errors import AppError, UnauthorizedError
from app.core.limits import (
    check_pin_allowed,
    check_sign_in_allowed,
    clear_sign_in_failures,
    client_address,
    code_is_fresh,
    device_id,
    device_known,
    limited,
    new_devices_refused,
)
from app.db.models import Action, Agent, Dealer, Session
from app.db.session import get_session

router = APIRouter(prefix="/auth", tags=["auth"])

_DUMMY_HASH = hash_pin("0000", "no-such-account")


class SignInRequest(BaseModel):
    ref: str = Field(default="", max_length=60)
    pin: str = Field(max_length=64)
    # Optional hint from older clients. Without it the number decides: the agent is tried
    # first, then the aggregator, and the PIN settles a number that could be either.
    role: Literal["agent", "dealer"] | None = None


class SessionOut(BaseModel):
    token: str
    role: str
    name: str
    ref: str
    permissions: list[str]
    # Signed in with the one-time code: choose a PIN before anything else opens.
    must_set_pin: bool = False


# Orange's national account sees every agent in the country, so its PIN is longer: a
# 6-digit PIN has a hundred times more guesses to get through than a 4-digit one.
NATIONAL_PIN_DIGITS = 6


def is_national(account) -> bool:
    return isinstance(account, Dealer) and "VIEW_NATIONAL" in account.permissions.split(",")


def _national_pin_ok(account, pin: str) -> None:
    if is_national(account) and len(pin) < NATIONAL_PIN_DIGITS:
        raise AppError(
            "Orange's national account needs a 6-digit PIN.", code="validation", status_code=422
        )


class FirstPinBody(BaseModel):
    pin: str = Field(min_length=4, max_length=6, pattern=r"^[0-9]+$")


class PinCheckBody(BaseModel):
    pin: str = Field(min_length=4, max_length=6, pattern=r"^[0-9]+$")


class PinChangeBody(BaseModel):
    current_pin: str = Field(min_length=4, max_length=6, pattern=r"^[0-9]+$")
    new_pin: str = Field(min_length=4, max_length=6, pattern=r"^[0-9]+$")


def as_msisdn(text: str) -> str | None:
    """A Sierra Leone mobile number in any of its usual spellings, as +232XXXXXXXX."""
    digits = re.sub(r"[^0-9]", "", text)
    if digits.startswith("00232"):
        digits = digits[2:]
    if len(digits) == 9 and digits.startswith("0"):
        digits = digits[1:]
    if len(digits) == 8:
        return f"+232{digits}"
    if len(digits) == 11 and digits.startswith("232"):
        return f"+{digits}"
    return None


async def find_agent(db: AsyncSession, ident: str) -> Agent | None:
    """An agent by what they know about themselves: the agent number the app gave them, their
    Orange agent code, or their Orange Money number."""
    if not ident:
        return None
    candidates = [ident]
    if ident.isdigit():
        candidates += [f"Agent {ident}", f"Agent {ident.zfill(3)}"]
    row = (
        await db.execute(select(Agent).where(Agent.ref.in_(candidates)).limit(1))
    ).scalar_one_or_none()
    if row is None and ident.isdigit():
        row = (
            await db.execute(select(Agent).where(Agent.agent_code == ident).limit(1))
        ).scalar_one_or_none()
    if row is None and (m := as_msisdn(ident)):
        row = (await db.execute(select(Agent).where(Agent.msisdn == m))).scalar_one_or_none()
    return row


async def find_dealer(db: AsyncSession, ident: str) -> Dealer | None:
    """An aggregator by account id or Orange Money number. With nothing typed, the one and
    only aggregator of a single-dealer pilot; several aggregators means they must say who.
    A national account is not an aggregator: it always signs in by its id."""
    if not ident:
        rows = (
            (
                await db.execute(
                    select(Dealer).where(Dealer.permissions.not_like("%VIEW_NATIONAL%")).limit(2)
                )
            )
            .scalars()
            .all()
        )
        return rows[0] if len(rows) == 1 else None
    row = await db.get(Dealer, ident)
    if row is None and (m := as_msisdn(ident)):
        row = (await db.execute(select(Dealer).where(Dealer.msisdn == m))).scalar_one_or_none()
    return row


@router.post("/sign-in", response_model=SessionOut, summary="Sign in as an agent or a dealer")
async def sign_in(
    request: Request,
    body: SignInRequest,
    db: AsyncSession = Depends(get_session),
    # On top of the per-account lockout: one phone or address trying many accounts.
    _limit: None = Depends(
        limited("sign-in", per_client=30, per_address=300, window=timedelta(minutes=10))
    ),
    user_agent: str | None = Header(default=None),
    x_client: str | None = Header(default=None),
) -> SessionOut:
    ident = body.ref.strip()
    agent = await find_agent(db, ident) if body.role != "dealer" else None
    dealer = await find_dealer(db, ident.lower()) if body.role != "agent" else None
    device = device_id(x_client, client_address(request))
    # Counted per account, however its number is typed (076…, +232…, 76-…), and per device:
    # wrong PINs lock the phone that typed them, never the owner's own phone (core/limits).
    # A name that matches no account is counted under its normal form, the same way, so the
    # lockout's answer does not tell a guesser which names exist.
    accounts: list[tuple[str, tuple[str, str] | None]] = []
    if agent:
        accounts.append((f"sign-in:agent:{agent.ref}", ("agent", agent.ref)))
    if dealer:
        accounts.append((f"sign-in:dealer:{dealer.id}", ("dealer", dealer.id)))
    if not accounts:
        accounts.append((f"sign-in:unknown:{_normal_form(ident)}", None))
    crowded = False  # an account's count for new phones is used up
    for key, account in accounts:
        known = await device_known(db, account, device)
        crowded |= await check_sign_in_allowed(db, key, device, known_device=known)
    label = (user_agent or "")[:80]

    async def opened(role: str, subject: str, account: Agent | Dealer, salt: str) -> str:
        # This device's counts end for every account tried in this request: a number that is
        # both an agent's and an aggregator's must not lock itself by being typed correctly.
        for key, _ in accounts:
            await clear_sign_in_failures(db, key, device)
        if needs_rehash(account.pin_hash):
            account.pin_hash = hash_pin(body.pin, salt)
        token = new_token()
        db.add(
            Session(
                token=token_key(token),
                role=role,
                subject=subject,
                device_label=label,
                client=device,
            )
        )
        return token

    # The same number may be an agent's line and an aggregator's: the PIN says which one is
    # signing in. Whoever the number is not, the answer is the same wrong-PIN sentence, so a
    # guess learns nothing about who exists.
    # Past the new-phone count only a fresh one-time code gets in; the PIN is still checked
    # first, so the answer and its timing are the same whether it was right or wrong.
    agent_ok = agent is not None and verify_pin(body.pin, agent.ref, agent.pin_hash)
    dealer_ok = (
        not agent_ok and dealer is not None and verify_pin(body.pin, dealer.id, dealer.pin_hash)
    )
    # No account by that name: spend the same time checking a PIN, so the answer's timing does
    # not tell a guesser who exists. The attempt was already counted by check_sign_in_allowed.
    if agent is None and dealer is None:
        verify_pin(body.pin, "no-such-account", _DUMMY_HASH)
    if crowded and not (
        (agent_ok and code_is_fresh(agent.must_set_pin, agent.code_issued_at))
        or (dealer_ok and code_is_fresh(dealer.must_set_pin, dealer.code_issued_at))
    ):
        raise new_devices_refused()
    if agent_ok:
        token = await opened("agent", agent.ref, agent, agent.ref)
        await db.commit()
        return SessionOut(
            token=token,
            role="agent",
            name=agent.shop_name,
            ref=agent.ref,
            permissions=[],
            must_set_pin=agent.must_set_pin,
        )
    if dealer_ok:
        token = await opened("dealer", dealer.id, dealer, dealer.id)
        if is_national(dealer) and len(body.pin) < NATIONAL_PIN_DIGITS:
            # A short PIN from before the rule: this session may only choose a 6-digit one.
            dealer.must_set_pin = True
        await db.commit()
        return SessionOut(
            token=token,
            role="dealer",
            name=dealer.name,
            ref=dealer.name,
            permissions=[p for p in dealer.permissions.split(",") if p],
            must_set_pin=dealer.must_set_pin,
        )
    raise UnauthorizedError("That PIN is not correct.")


def _normal_form(ident: str) -> str:
    """One spelling for a name that matches no account, as find_agent reads it: a phone line
    in any format, '24', '024' and 'Agent 024' are the same name."""
    text = ident.strip().lower()
    if m := as_msisdn(text):
        return f"line:{m}"
    digits = text.removeprefix("agent").strip()
    if digits.isdigit():
        return f"agent:{int(digits)}"
    return text or "-"


@router.post("/pin", summary="Choose my PIN after signing in with a one-time code")
async def choose_pin(
    body: FirstPinBody,
    p: Principal = Depends(current_principal),
    authorization: str = Header(),
    db: AsyncSession = Depends(get_session),
) -> dict:
    """The code the aggregator (or the team) read out works once: it opens this screen and
    nothing else. The PIN chosen here replaces it, is known to nobody else, and every other
    session opened with the code ends."""
    if not p.must_set_pin:
        raise AppError("Your PIN is already set.", code="pin_set", status_code=409)
    if p.role == "dealer":
        account = await db.get(Dealer, p.subject)
        salt = account.id if account else ""
    else:
        account = (
            await db.execute(select(Agent).where(Agent.ref == p.subject))
        ).scalar_one_or_none()
        salt = account.ref if account else ""
    if account is None:
        raise UnauthorizedError("That session has ended. Sign in again.")
    _national_pin_ok(account, body.pin)
    if verify_pin(body.pin, salt, account.pin_hash):
        raise AppError("Choose a PIN that is not the code.", code="validation", status_code=422)
    account.pin_hash = hash_pin(body.pin, salt)
    account.must_set_pin = False
    this_token = authorization.split(" ", 1)[1].strip()
    others = (
        await db.execute(
            select(Session).where(
                Session.role == p.role,
                Session.subject == p.subject,
                Session.token != token_key(this_token),
            )
        )
    ).scalars()
    for other in others:
        other.revoked = True
    if p.role == "agent":
        db.add(
            Action(actor=p.name, agent_ref=p.subject, action="agent_pin", note="Chose their PIN")
        )
    await db.commit()
    return {"pin_set": True}


@router.post("/change-pin", summary="Change my PIN: the current one first, then the new one")
async def change_pin(
    body: PinChangeBody,
    authorization: str | None = Header(default=None),
    p: Principal = Depends(settled_principal),
    db: AsyncSession = Depends(get_session),
) -> dict:
    """For agents and aggregators alike. Nobody else can set a PIN: a forgotten one gets a
    one-time code instead (the aggregator for an agent, the team for an aggregator)."""
    if p.role == "dealer":
        account = await db.get(Dealer, p.subject)
        salt = account.id if account else ""
    else:
        account = (
            await db.execute(select(Agent).where(Agent.ref == p.subject))
        ).scalar_one_or_none()
        salt = account.ref if account else ""
    if account is None:
        raise UnauthorizedError("That session has ended. Sign in again.")
    # Same lockout as signing in; a new PIN signs out every other phone.
    key = f"pin-check:{p.role}:{p.subject}"
    await check_pin_allowed(db, key)
    if not verify_pin(body.current_pin, salt, account.pin_hash):
        raise AppError("That PIN is not correct.", code="wrong_pin", status_code=403)
    await clear_sign_in_failures(db, key)
    _national_pin_ok(account, body.new_pin)
    if body.new_pin == body.current_pin:
        raise AppError("Choose a different PIN.", code="validation", status_code=422)
    account.pin_hash = hash_pin(body.new_pin, salt)
    token = (authorization or "").split(" ", 1)[-1].strip()
    await db.execute(
        # Revoked, not deleted: the rows say which phones are the owner's own, which the
        # wrong-PIN lockout must keep recognising (core/limits.device_known).
        update(Session)
        .where(
            Session.role == p.role, Session.subject == p.subject, Session.token != token_key(token)
        )
        .values(revoked=True)
    )
    if p.role == "agent":
        db.add(
            Action(actor=p.name, agent_ref=p.subject, action="agent_pin", note="Changed their PIN")
        )
    await db.commit()
    return {"pin_set": True}


@router.post("/sign-out", status_code=204, summary="End this session")
async def sign_out(
    p: Principal = Depends(current_principal),
    authorization: str = Header(),
    db: AsyncSession = Depends(get_session),
) -> None:
    sess = await db.get(Session, token_key(authorization.split(" ", 1)[1].strip()))
    if sess:
        sess.revoked = True
        await db.commit()


@router.post("/check-pin", summary="Is this my PIN? Before recording a transaction")
async def check_pin(
    body: PinCheckBody,
    p: Principal = Depends(settled_principal),
    db: AsyncSession = Depends(get_session),
) -> dict:
    """The agent's PIN confirms a transaction before it is recorded, as the design's keypad
    asks. Nothing moves and no session is made; wrong guesses count against the same lockout
    as signing in, so the keypad cannot be used to guess the PIN."""
    key = f"pin-check:{p.role}:{p.subject}"
    await check_pin_allowed(db, key)
    if p.role == "dealer":
        account = await db.get(Dealer, p.subject)
        salt = account.id if account else ""
    else:
        account = (
            await db.execute(select(Agent).where(Agent.ref == p.subject))
        ).scalar_one_or_none()
        salt = account.ref if account else ""
    if account is None:
        raise UnauthorizedError("That session has ended. Sign in again.")
    if not verify_pin(body.pin, salt, account.pin_hash):
        raise AppError("That PIN is not correct.", code="wrong_pin", status_code=403)
    await clear_sign_in_failures(db, key)
    return {"ok": True}
