"""Float requests: a request, a decision and an audit trail — never money movement.
State machine: pending → approved → completed | pending → declined (reason required) |
pending → cancelled (agent). Nothing expires silently."""

from __future__ import annotations

import secrets
from typing import Literal

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.agent_app import FloatOut, float_out
from app.core.auth import Principal, current_principal
from app.core.errors import AppError, ForbiddenError, NotFoundError
from app.db.models import Agent, FloatRequest, FloatRequestEvent
from app.db.session import get_session
from app.services import usage
from app.services.phrasing import now_utc

router = APIRouter(prefix="/float-requests", tags=["float"])

ALLOWED = {
    "pending": {"approved", "declined", "cancelled"},
    "approved": {"completed"},
    "completed": set(),
    "declined": set(),
    "cancelled": set(),
}
DEALER_MOVES = {"approved", "declined", "completed"}
AGENT_MOVES = {"cancelled"}


class CreateBody(BaseModel):
    amount_sle: int = Field(ge=100, le=5_000_000)
    reason: str = Field(default="", max_length=160)
    client_token: str | None = Field(default=None, max_length=64)


class DecisionBody(BaseModel):
    to: Literal["approved", "declined", "completed", "cancelled"]
    reason: str | None = Field(default=None, max_length=160)


async def _names(db: AsyncSession, refs: set[str]) -> dict[str, str]:
    rows = (await db.execute(select(Agent.ref, Agent.shop_name).where(Agent.ref.in_(refs)))).all()
    return {r: n for r, n in rows}


@router.get("", response_model=list[FloatOut], summary="Float requests visible to me")
async def list_requests(
    agent: str | None = Query(default=None),
    p: Principal = Depends(current_principal),
    db: AsyncSession = Depends(get_session),
) -> list[FloatOut]:
    now = now_utc()
    q = select(FloatRequest)
    if p.role == "agent":
        q = q.where(FloatRequest.agent_ref == p.subject)
    else:
        q = q.where(FloatRequest.dealer_id == p.subject)
        if agent:
            q = q.where(FloatRequest.agent_ref == agent)
    rows = (await db.execute(q.order_by(FloatRequest.requested_at.desc()))).scalars().all()
    names = await _names(db, {r.agent_ref for r in rows})
    return [float_out(r, names.get(r.agent_ref, r.agent_ref), now) for r in rows]


@router.post("", response_model=FloatOut, status_code=201, summary="Agent: ask for float")
async def create(
    body: CreateBody,
    p: Principal = Depends(current_principal),
    db: AsyncSession = Depends(get_session),
) -> FloatOut:
    if p.role != "agent":
        raise ForbiddenError("Not available.", code="not_found", status_code=404)
    now = now_utc()
    a = (await db.execute(select(Agent).where(Agent.ref == p.subject))).scalar_one()
    if body.client_token:
        dup = (
            await db.execute(
                select(FloatRequest).where(FloatRequest.client_token == body.client_token)
            )
        ).scalar_one_or_none()
        if dup:
            return float_out(dup, a.shop_name, now)
    open_ = (
        await db.execute(
            select(FloatRequest).where(
                FloatRequest.agent_ref == a.ref, FloatRequest.state == "pending"
            )
        )
    ).scalar_one_or_none()
    if open_:
        raise AppError(
            "You already have a request waiting. Cancel it first if the amount has changed.",
            code="request_open",
        )
    r = FloatRequest(
        id=f"fr-{secrets.token_hex(6)}",
        agent_ref=a.ref,
        dealer_id=a.dealer_id,
        amount_sle=body.amount_sle,
        reason=body.reason or "No reason given",
        state="pending",
        client_token=body.client_token,
    )
    db.add(r)
    await db.flush()
    db.add(
        FloatRequestEvent(
            request_id=r.id, from_state="none", to_state="pending", actor=a.ref, reason=body.reason
        )
    )
    await usage.record(db, "float_request", "agent", a.ref, a.ref)
    await db.commit()
    await db.refresh(r)
    return float_out(r, a.shop_name, now)


@router.post(
    "/{request_id}/decision", response_model=FloatOut, summary="Move a request to its next state"
)
async def decide(
    request_id: str,
    body: DecisionBody,
    p: Principal = Depends(current_principal),
    db: AsyncSession = Depends(get_session),
) -> FloatOut:
    now = now_utc()
    r = await db.get(FloatRequest, request_id)
    if r is None:
        raise NotFoundError("That request no longer exists.")
    if p.role == "agent":
        if r.agent_ref != p.subject or body.to not in AGENT_MOVES:
            raise ForbiddenError("Not available.", code="not_found", status_code=404)
    else:
        if (
            r.dealer_id != p.subject
            or body.to not in DEALER_MOVES
            or not p.can("MANAGE_FLOAT_REQUEST")
        ):
            raise ForbiddenError("Not available.", code="not_found", status_code=404)
    if body.to not in ALLOWED[r.state]:
        raise AppError(f"A {r.state} request cannot become {body.to}.", code="illegal_transition")
    if body.to == "declined" and not (body.reason or "").strip():
        raise AppError("A decline needs a reason the agent can read.", code="reason_required")
    db.add(
        FloatRequestEvent(
            request_id=r.id, from_state=r.state, to_state=body.to, actor=p.name, reason=body.reason
        )
    )
    # Guarded by the state we read: a second decision racing this one finds no row to move.
    moved = await db.execute(
        update(FloatRequest)
        .where(FloatRequest.id == r.id, FloatRequest.state == r.state)
        .values(
            state=body.to, decided_at=now, decided_by=p.name, decision_reason=body.reason or None
        )
    )
    if moved.rowcount != 1:
        await db.rollback()
        raise AppError(
            "That request was just updated. Refresh and try again.",
            code="illegal_transition",
            status_code=409,
        )
    await usage.record(db, "float_decision", p.role, p.subject, r.agent_ref)
    await db.commit()
    await db.refresh(r)
    a = (await db.execute(select(Agent).where(Agent.ref == r.agent_ref))).scalar_one()
    return float_out(r, a.shop_name, now)
