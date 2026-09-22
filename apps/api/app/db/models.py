"""Pilot schema. Small on purpose: what ten real users need, nothing that pretends to be a
ledger. Money is never stored here; balance and float position are read through the
operator adapter and returned with their source.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin


class Dealer(Base, TimestampMixin):
    __tablename__ = "dealers"
    id: Mapped[str] = mapped_column(String(40), primary_key=True)  # e.g. "kissy"
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    pin_hash: Mapped[str] = mapped_column(String(128), nullable=False)
    # Named grants, comma-separated. The API is the authority on these.
    permissions: Mapped[str] = mapped_column(Text, nullable=False, default="")


class Agent(Base, TimestampMixin):
    __tablename__ = "agents"
    ref: Mapped[str] = mapped_column(String(40), primary_key=True)  # "Agent 024"
    dealer_id: Mapped[str] = mapped_column(ForeignKey("dealers.id"), nullable=False)
    person_name: Mapped[str] = mapped_column(String(120), nullable=False)
    shop_name: Mapped[str] = mapped_column(String(120), nullable=False)
    area: Mapped[str] = mapped_column(String(80), nullable=False)
    street: Mapped[str] = mapped_column(String(120), nullable=False)
    # Coarse business point (~100 m). Never a customer's point.
    lat: Mapped[float] = mapped_column(Float, nullable=False)
    lng: Mapped[float] = mapped_column(Float, nullable=False)
    hours_text: Mapped[str] = mapped_column(
        String(80), nullable=False, default="Open today 07:00–20:00"
    )
    open_hour: Mapped[int] = mapped_column(Integer, nullable=False, default=7)
    close_hour: Mapped[int] = mapped_column(Integer, nullable=False, default=20)
    # The agent's own working hours (services/schedule.py): a weekly pattern, today-only
    # changes by date, and "stay open" past today's close. Applied by the system, with a
    # warning first. Legacy open/close hours stand in until a pattern is set.
    schedule_json: Mapped[str | None] = mapped_column(Text)
    overrides_json: Mapped[str | None] = mapped_column(Text)
    extended_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    phone: Mapped[str | None] = mapped_column(String(32))
    phone_visible: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    verified: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    pin_hash: Mapped[str] = mapped_column(String(128), nullable=False)

    # Current declaration. PRIVATE words; compared server-side only.
    presence: Mapped[str] = mapped_column(
        String(10), nullable=False, default="open"
    )  # open|hidden|closed
    cash_out: Mapped[str | None] = mapped_column(String(10))  # most|some|small|none
    deposit: Mapped[str | None] = mapped_column(String(10))
    # Optional figures behind the words ("up to about SLE 5,000"). PRIVATE like the words;
    # the ledger counts confirmed visits against them. None when the agent gave a word only.
    cash_out_sle: Mapped[int | None] = mapped_column(Integer)
    deposit_sle: Mapped[int | None] = mapped_column(Integer)
    night_mode: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    declared_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    dealer: Mapped[Dealer] = relationship()


class AvailabilityEvent(Base):
    __tablename__ = "availability_events"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    agent_ref: Mapped[str] = mapped_column(ForeignKey("agents.ref"), nullable=False, index=True)
    at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    kind: Mapped[str] = mapped_column(String(20), nullable=False)  # declare|confirm|hide|show
    presence: Mapped[str] = mapped_column(String(10), nullable=False)
    cash_out: Mapped[str | None] = mapped_column(String(10))
    deposit: Mapped[str | None] = mapped_column(String(10))
    source: Mapped[str] = mapped_column(String(20), nullable=False, default="app")


class OutcomeReport(Base):
    __tablename__ = "outcome_reports"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)  # client_token: idempotent
    agent_ref: Mapped[str] = mapped_column(ForeignKey("agents.ref"), nullable=False, index=True)
    at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    transaction: Mapped[str | None] = mapped_column(String(12))
    amount_band: Mapped[str | None] = mapped_column(String(12))  # never the exact amount
    answer: Mapped[str] = mapped_column(String(12), nullable=False)  # yes|no|did_not_go
    reason_code: Mapped[str | None] = mapped_column(String(32))
    # What the customer was told at report time — so a signal can compare claim vs outcome.
    outcome_at_report: Mapped[str | None] = mapped_column(String(12))
    freshness_at_report: Mapped[str | None] = mapped_column(String(20))
    rating: Mapped[int | None] = mapped_column(Integer)  # network-only
    comment: Mapped[str | None] = mapped_column(Text)  # network-only, moderation window
    source: Mapped[str] = mapped_column(String(10), nullable=False, default="search")
    # Rotating pseudonymous device key. Never a phone number or account.
    client_key: Mapped[str | None] = mapped_column(String(64))


class FloatRequest(Base):
    __tablename__ = "float_requests"
    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    agent_ref: Mapped[str] = mapped_column(ForeignKey("agents.ref"), nullable=False, index=True)
    dealer_id: Mapped[str] = mapped_column(ForeignKey("dealers.id"), nullable=False)
    amount_sle: Mapped[int] = mapped_column(Integer, nullable=False)  # the agent's own statement
    reason: Mapped[str] = mapped_column(Text, nullable=False, default="")
    state: Mapped[str] = mapped_column(String(12), nullable=False, default="pending")
    requested_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    decided_by: Mapped[str | None] = mapped_column(String(120))
    decision_reason: Mapped[str | None] = mapped_column(Text)
    client_token: Mapped[str | None] = mapped_column(String(64), unique=True)


class FloatRequestEvent(Base):
    __tablename__ = "float_request_events"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    request_id: Mapped[str] = mapped_column(
        ForeignKey("float_requests.id"), nullable=False, index=True
    )
    at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    from_state: Mapped[str] = mapped_column(String(12), nullable=False)
    to_state: Mapped[str] = mapped_column(String(12), nullable=False)
    actor: Mapped[str] = mapped_column(String(120), nullable=False)
    reason: Mapped[str | None] = mapped_column(Text)


class Action(Base):
    __tablename__ = "actions"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    actor: Mapped[str] = mapped_column(String(120), nullable=False)
    agent_ref: Mapped[str] = mapped_column(ForeignKey("agents.ref"), nullable=False, index=True)
    # contact|call|nudge|escalate|snooze|resolve
    action: Mapped[str] = mapped_column(String(20), nullable=False)
    note: Mapped[str] = mapped_column(Text, nullable=False)
    # Only snooze and resolve carry one. They are the dealer's own queue housekeeping: the
    # signal is recomputed from data every request and this row just hides it for a while
    # (snooze four hours, resolve the rest of the day). Never touches the agent's status.
    signal_id: Mapped[str | None] = mapped_column(String(80), nullable=True)


class AuditLog(Base):
    """Written BEFORE a financial value is returned. Field name and purpose — never the value."""

    __tablename__ = "audit_log"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    actor: Mapped[str] = mapped_column(String(120), nullable=False)
    permission: Mapped[str] = mapped_column(String(60), nullable=False)
    agent_ref: Mapped[str] = mapped_column(ForeignKey("agents.ref"), nullable=False, index=True)
    field: Mapped[str] = mapped_column(String(20), nullable=False)
    purpose: Mapped[str] = mapped_column(Text, nullable=False)


class Session(Base):
    __tablename__ = "sessions"
    token: Mapped[str] = mapped_column(String(64), primary_key=True)
    role: Mapped[str] = mapped_column(String(10), nullable=False)  # agent|dealer
    subject: Mapped[str] = mapped_column(String(40), nullable=False)  # agent ref or dealer id
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    device_label: Mapped[str | None] = mapped_column(String(80))
    revoked: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)


class SearchImpression(Base):
    """The ranker's training log: what the system knew about one agent when it showed them
    for one request, and — once the customer reported — whether the visit succeeded. Never
    a location, never an identity: the customer's rotating device key and a distance."""

    __tablename__ = "search_impressions"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    client_key: Mapped[str | None] = mapped_column(String(64), index=True)
    agent_ref: Mapped[str] = mapped_column(ForeignKey("agents.ref"), nullable=False, index=True)
    transaction: Mapped[str] = mapped_column(String(12), nullable=False)
    amount_band: Mapped[str | None] = mapped_column(String(12))
    features_json: Mapped[str] = mapped_column(Text, nullable=False)
    outcome_shown: Mapped[str] = mapped_column(String(12), nullable=False)
    probability: Mapped[float] = mapped_column(Float, nullable=False)
    label: Mapped[int | None] = mapped_column(Integer)  # 1 served, 0 not served for money
    labelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class RankerModel(Base):
    """One row per fit of the ranker: the weights and how many labelled visits taught them."""

    __tablename__ = "ranker_models"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    weights_json: Mapped[str] = mapped_column(Text, nullable=False)
    trained_on: Mapped[int] = mapped_column(Integer, nullable=False)
    note: Mapped[str] = mapped_column(Text, nullable=False, default="")


class UsageEvent(Base):
    """One row per real thing a real person did. This is how "10+ users" is counted."""

    __tablename__ = "usage_events"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    kind: Mapped[str] = mapped_column(
        String(24), nullable=False
    )  # search|directions|report|declare|confirm|float_request|float_decision
    # Who, without identity: a customer's rotating device key, or an agent/dealer subject.
    actor_kind: Mapped[str] = mapped_column(String(10), nullable=False)  # customer|agent|dealer
    actor_key: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    agent_ref: Mapped[str | None] = mapped_column(String(40))
