"""Public: the customer's one question after a visit. Idempotent on client_token. Stores the
public outcome and freshness as they were at report time, an amount band (never the exact
amount), and a rotating device key (never an identity)."""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, Header
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.agents import ref_from_public_id
from app.core.errors import NotFoundError
from app.db.models import Agent, OutcomeReport
from app.db.session import get_session
from app.schemas.public.common import PublicModel
from app.services import usage
from app.services.phrasing import amount_band, freshness_of, normalise_tx, now_utc, public_outcome

router = APIRouter(prefix="/reports", tags=["reports"])


class VisitReport(BaseModel):
    agent_id: str
    transaction: Literal["cash_out", "withdraw", "deposit", "send"] | None = None
    amount_sle: int | None = Field(default=None, ge=1)
    answer: Literal["yes", "no", "did_not_go"]
    reason_code: str | None = Field(default=None, max_length=32)
    rating: int | None = Field(default=None, ge=1, le=5)
    comment: str | None = Field(default=None, max_length=280)
    source: Literal["search", "direct"] = "search"
    client_token: str = Field(min_length=8, max_length=64)


class ReportAccepted(PublicModel):
    id: str
    accepted: bool


@router.post("", response_model=ReportAccepted, status_code=201, summary="Report what happened")
async def report(
    body: VisitReport,
    db: AsyncSession = Depends(get_session),
    x_client: str | None = Header(default=None),
) -> ReportAccepted:
    existing = await db.get(OutcomeReport, body.client_token)
    if existing:
        return ReportAccepted(id=existing.id, accepted=True)
    ref = ref_from_public_id(body.agent_id)
    a = (await db.execute(select(Agent).where(Agent.ref == ref))).scalar_one_or_none()
    if a is None:
        raise NotFoundError("We could not find that agent.")
    now = now_utc()
    tx = normalise_tx(body.transaction) if body.transaction else None
    db.add(
        OutcomeReport(
            id=body.client_token,
            agent_ref=ref,
            transaction=tx,
            amount_band=amount_band(body.amount_sle),
            answer=body.answer,
            reason_code=body.reason_code,
            outcome_at_report=public_outcome(a, tx or "cash_out", body.amount_sle, now),
            freshness_at_report=freshness_of(a.declared_at, now),
            rating=body.rating,
            comment=body.comment,
            source=body.source,
            client_key=(x_client or "")[:64] or None,
        )
    )
    await usage.record(db, "report", "customer", x_client or "anonymous", ref)
    if body.answer != "did_not_go":
        await usage.record(db, "directions", "customer", x_client or "anonymous", ref)
    try:
        await db.commit()
    except IntegrityError:
        # Two taps raced past the idempotency read; the first one won and that is the answer.
        await db.rollback()
    return ReportAccepted(id=body.client_token, accepted=True)
