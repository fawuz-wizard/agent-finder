"""One sign-in for agents and dealers. The role in the request only says which experience to
open; the server resolves the real role from the credential and is the authority on it."""

from __future__ import annotations

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


@router.post("/sign-in", response_model=SessionOut, summary="Sign in as an agent or a dealer")
async def sign_in(
    body: SignInRequest,
    db: AsyncSession = Depends(get_session),
    user_agent: str | None = Header(default=None),
) -> SessionOut:
    if body.role == "dealer":
        dealer_id = body.ref.strip().lower() or "kissy"
        check_sign_in_allowed(f"dealer:{dealer_id}")
        dealer = await db.get(Dealer, dealer_id)
        if dealer is None or not verify_pin(body.pin, dealer.id, dealer.pin_hash):
            note_sign_in_failure(f"dealer:{dealer_id}")
            raise UnauthorizedError("That PIN is not correct.")
        clear_sign_in_failures(f"dealer:{dealer_id}")
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
    if ref.isdigit():
        ref = f"Agent {ref.zfill(3)}"
    check_sign_in_allowed(f"agent:{ref}")
    agent = (await db.execute(select(Agent).where(Agent.ref == ref))).scalar_one_or_none()
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
