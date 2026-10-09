"""One sign-in for agents and dealers. The role in the request only says which experience to
open; the server resolves the real role from the credential and is the authority on it."""

from __future__ import annotations

import re
from typing import Literal

from fastapi import APIRouter, Depends, Header
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import (
    Principal,
    check_sign_in_allowed,
    clear_sign_in_failures,
    current_principal,
    new_token,
    note_sign_in_failure,
    verify_pin,
)
from app.core.errors import UnauthorizedError
from app.db.models import Agent, Dealer, Session
from app.db.session import get_session

router = APIRouter(prefix="/auth", tags=["auth"])


class SignInRequest(BaseModel):
    ref: str = Field(default="", max_length=60)
    pin: str = Field(max_length=64)
    role: Literal["agent", "dealer"]


class SessionOut(BaseModel):
    token: str
    role: str
    name: str
    ref: str
    permissions: list[str]


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
    only aggregator of a single-dealer pilot; several aggregators means they must say who."""
    if not ident:
        rows = (await db.execute(select(Dealer).limit(2))).scalars().all()
        return rows[0] if len(rows) == 1 else None
    row = await db.get(Dealer, ident)
    if row is None and (m := as_msisdn(ident)):
        row = (await db.execute(select(Dealer).where(Dealer.msisdn == m))).scalar_one_or_none()
    return row


@router.post("/sign-in", response_model=SessionOut, summary="Sign in as an agent or a dealer")
async def sign_in(
    body: SignInRequest,
    db: AsyncSession = Depends(get_session),
    user_agent: str | None = Header(default=None),
) -> SessionOut:
    if body.role == "dealer":
        dealer_id = body.ref.strip().lower()
        check_sign_in_allowed(f"dealer:{dealer_id or '-'}")
        dealer = await find_dealer(db, dealer_id)
        if dealer is None or not verify_pin(body.pin, dealer.id, dealer.pin_hash):
            note_sign_in_failure(f"dealer:{dealer_id or '-'}")
            raise UnauthorizedError("That PIN is not correct.")
        clear_sign_in_failures(f"dealer:{dealer_id or '-'}")
        token = new_token()
        db.add(
            Session(
                token=token, role="dealer", subject=dealer.id, device_label=(user_agent or "")[:80]
            )
        )
        await db.commit()
        return SessionOut(
            token=token,
            role="dealer",
            name=dealer.name,
            ref=dealer.name,
            permissions=[p for p in dealer.permissions.split(",") if p],
        )

    ref = body.ref.strip()
    check_sign_in_allowed(f"agent:{ref}")
    agent = await find_agent(db, ref)
    if agent is None or not verify_pin(body.pin, agent.ref, agent.pin_hash):
        note_sign_in_failure(f"agent:{ref}")
        raise UnauthorizedError("That PIN is not correct.")
    clear_sign_in_failures(f"agent:{ref}")
    token = new_token()
    db.add(
        Session(token=token, role="agent", subject=agent.ref, device_label=(user_agent or "")[:80])
    )
    await db.commit()
    return SessionOut(
        token=token, role="agent", name=agent.shop_name, ref=agent.ref, permissions=[]
    )


@router.post("/sign-out", status_code=204, summary="End this session")
async def sign_out(
    p: Principal = Depends(current_principal),
    authorization: str = Header(),
    db: AsyncSession = Depends(get_session),
) -> None:
    sess = await db.get(Session, authorization.split(" ", 1)[1].strip())
    if sess:
        sess.revoked = True
        await db.commit()
