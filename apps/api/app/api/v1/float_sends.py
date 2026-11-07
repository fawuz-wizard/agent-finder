"""Float sent: the aggregator records float they sent an agent in Orange Money. The app never
moves money and never reads a balance; a send is the aggregator's statement, with the Orange
Money reference when they have it. A send that answers a request completes it (pending is
approved first, both steps in the request's own trail). Agents read the sends they received."""

from __future__ import annotations

import secrets
from datetime import UTC, timedelta

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import Principal, settled_principal
from app.core.errors import AppError, ForbiddenError, NotFoundError
from app.db.models import Agent, Dealer, FloatRequest, FloatRequestEvent, FloatSend
from app.db.session import get_session
from app.services import usage
from app.services.phrasing import now_utc

router = APIRouter(prefix="/float-sends", tags=["float"])


class SendBody(BaseModel):
    agent_ref: str = Field(min_length=1, max_length=40)
    amount_sle: int = Field(ge=100, le=5_000_000)
    om_reference: str | None = Field(default=None, max_length=40)
    request_id: str | None = Field(default=None, max_length=40)
    client_token: str | None = Field(default=None, max_length=64)


class SendOut(BaseModel):
    id: str
    agent_ref: str
    agent_name: str
    amount_sle: int
    om_reference: str | None
    request_id: str | None
    sent_at: str
    sent_by: str


def _out(s: FloatSend, agent_name: str, sender: str) -> SendOut:
    return SendOut(
        id=s.id,
        agent_ref=s.agent_ref,
        agent_name=agent_name,
        amount_sle=s.amount_sle,
        om_reference=s.om_reference,
        request_id=s.request_id,
        # SQLite hands times back without a zone; they are UTC (Freetown's time) by design.
        sent_at=(s.sent_at if s.sent_at.tzinfo else s.sent_at.replace(tzinfo=UTC)).isoformat(),
        sent_by=sender,
    )


def _not_found() -> ForbiddenError:
    return ForbiddenError("Not available.", code="not_found", status_code=404)


@router.post("", response_model=SendOut, status_code=201, summary="Aggregator: record float sent")
async def record_send(
    body: SendBody,
    p: Principal = Depends(settled_principal),
    db: AsyncSession = Depends(get_session),
) -> SendOut:
    if p.role != "dealer" or not p.can("MANAGE_FLOAT_REQUEST"):
        raise _not_found()
    if body.client_token:
        dup = (
            await db.execute(
                select(FloatSend).where(
                    FloatSend.client_token == body.client_token, FloatSend.dealer_id == p.subject
                )
            )
        ).scalar_one_or_none()
        if dup:
            a = await db.get(Agent, dup.agent_ref)
            return _out(dup, a.shop_name if a else dup.agent_ref, dup.actor)
    a = await db.get(Agent, body.agent_ref)
    if a is None or a.dealer_id != p.subject:
        raise NotFoundError("That agent is not one of yours.")
    ref = (body.om_reference or "").strip() or None
    now = now_utc()
    req: FloatRequest | None = None
    if body.request_id:
        req = await db.get(FloatRequest, body.request_id)
        if req is None or req.dealer_id != p.subject or req.agent_ref != a.ref:
            raise NotFoundError("That request is not one of yours.")
        if req.state not in ("pending", "approved"):
            raise AppError(f"A {req.state} request cannot be sent.", code="illegal_transition")
    s = FloatSend(
        id=f"fs-{secrets.token_hex(6)}",
        dealer_id=p.subject,
        agent_ref=a.ref,
        amount_sle=body.amount_sle,
        om_reference=ref,
        request_id=req.id if req else None,
        sent_at=now,
        actor=p.name,
        client_token=body.client_token,
    )
    db.add(s)
    if req:
        note = f"Sent SLE {body.amount_sle:,}" + (f" · ref {ref}" if ref else "")
        read_state = req.state
        # Guarded by the state we read: a second send racing this one (a double tap, a second
        # phone) finds the request already completed and records nothing.
        moved = await db.execute(
            update(FloatRequest)
            .where(FloatRequest.id == req.id, FloatRequest.state == read_state)
            .values(state="completed", decided_at=now, decided_by=p.name, decision_reason=note)
            .execution_options(synchronize_session=False)
        )
        if moved.rowcount != 1:
            await db.rollback()
            raise AppError(
                "That request was just sent. Refresh to see it.",
                code="illegal_transition",
                status_code=409,
            )
        steps = ["approved", "completed"] if read_state == "pending" else ["completed"]
        state = read_state
        for to in steps:
            db.add(
                FloatRequestEvent(
                    request_id=req.id, from_state=state, to_state=to, actor=p.name, reason=note
                )
            )
            state = to
    await usage.record(db, "float_send", "dealer", p.subject, a.ref)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        if body.client_token:
            # The same tap sent twice at once: the first one's result, not an error.
            first = (
                await db.execute(
                    select(FloatSend).where(
                        FloatSend.client_token == body.client_token,
                        FloatSend.dealer_id == p.subject,
                    )
                )
            ).scalar_one_or_none()
            if first:
                return _out(first, a.shop_name, first.actor)
        raise AppError(
            "That send was already recorded.", code="duplicate", status_code=409
        ) from None
    await db.refresh(s)
    return _out(s, a.shop_name, p.name)


@router.get(
    "", response_model=list[SendOut], summary="Float sends: an aggregator's, or an agent's own"
)
async def list_sends(
    days: int | None = Query(default=None, ge=1, le=366),
    p: Principal = Depends(settled_principal),
    db: AsyncSession = Depends(get_session),
) -> list[SendOut]:
    q = select(FloatSend)
    if p.role == "agent":
        q = q.where(FloatSend.agent_ref == p.subject)
    else:
        q = q.where(FloatSend.dealer_id == p.subject)
    if days:
        q = q.where(FloatSend.sent_at >= now_utc() - timedelta(days=days))
    rows = (await db.execute(q.order_by(FloatSend.sent_at.desc()).limit(500))).scalars().all()
    refs = {r.agent_ref for r in rows}
    names = (
        dict(
            (await db.execute(select(Agent.ref, Agent.shop_name).where(Agent.ref.in_(refs)))).all()
        )
        if refs
        else {}
    )
    dealers = {r.dealer_id for r in rows}
    senders = (
        dict((await db.execute(select(Dealer.id, Dealer.name).where(Dealer.id.in_(dealers)))).all())
        if dealers
        else {}
    )
    return [
        _out(r, names.get(r.agent_ref, r.agent_ref), senders.get(r.dealer_id, r.actor))
        for r in rows
    ]
