"""Pilot schema. Small on purpose: what ten real users need, nothing that pretends to be a
ledger. Money is never stored here; balance and float position are read through the
operator adapter and returned with their source.
"""

from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    LargeBinary,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin


class Dealer(Base, TimestampMixin):
    """An aggregator (Orange's word) or dealer (ours): the person a set of agents work under."""

    __tablename__ = "dealers"
    id: Mapped[str] = mapped_column(String(40), primary_key=True)  # e.g. "kissy"
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    pin_hash: Mapped[str] = mapped_column(String(128), nullable=False)
    # True while the account holds a one-time sign-in code, not a PIN the person chose.
    must_set_pin: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # When the one-time code now in pin_hash was issued. For a short while after, a sign-in
    # with it is let through the new-phone lockout (core/limits): the code is how a locked-out
    # person gets back in, so a stranger filling that count must not be able to stop it.
    code_issued_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Named grants, comma-separated. The API is the authority on these.
    permissions: Mapped[str] = mapped_column(Text, nullable=False, default="")
    # Orange's regions: east | north | west | south. Derived from the city on import.
    region: Mapped[str | None] = mapped_column(String(10))
    # The aggregator's own Orange Money line, how the file names them. Dealer-side only.
    msisdn: Mapped[str | None] = mapped_column(String(32), unique=True)
    # A sub-aggregator sits under an aggregator.
    parent_id: Mapped[str | None] = mapped_column(ForeignKey("dealers.id"))
    # manual | orange_file — and, for the file, "<file hash>:<row>" so the row can be traced.
    source: Mapped[str] = mapped_column(String(20), nullable=False, default="manual")
    source_row: Mapped[str | None] = mapped_column(String(80))


class DealerPhoto(Base):
    """The aggregator's own picture, a logo or shop sign, kept apart from the dealer row so an
    existing database gains it without a migration. Seen by the aggregator and Orange only."""

    __tablename__ = "dealer_photos"

    dealer_id: Mapped[str] = mapped_column(ForeignKey("dealers.id"), primary_key=True)
    photo: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    photo_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class Agent(Base, TimestampMixin):
    __tablename__ = "agents"
    ref: Mapped[str] = mapped_column(String(40), primary_key=True)  # "Agent 024"
    dealer_id: Mapped[str] = mapped_column(ForeignKey("dealers.id"), nullable=False)
    person_name: Mapped[str] = mapped_column(String(120), nullable=False)
    shop_name: Mapped[str] = mapped_column(String(120), nullable=False)
    area: Mapped[str] = mapped_column(String(80), nullable=False)
    street: Mapped[str] = mapped_column(String(120), nullable=False)
    # Coarse business point (~100 m). Never a customer's point. None until a dealer pins the
    # shop: Orange's file carries no coordinates, and an unlocated agent is never shown to a
    # customer.
    lat: Mapped[float | None] = mapped_column(Float)
    lng: Mapped[float | None] = mapped_column(Float)
    # Who put the shop on the map: dealer | agent | placed (script, until someone pins it).
    location_source: Mapped[str | None] = mapped_column(String(10))
    # A location goes live only once confirmed: an aggregator's own pin is, an agent's pin
    # waits for the aggregator, a placed point is demo-only and counts as confirmed.
    location_confirmed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # Orange's identifiers and record, from the file or typed at registration. Dealer-side only.
    agent_code: Mapped[str | None] = mapped_column(String(20), unique=True)
    msisdn: Mapped[str | None] = mapped_column(String(32), unique=True)
    region: Mapped[str | None] = mapped_column(String(10))  # east | north | west | south
    city: Mapped[str | None] = mapped_column(String(80))
    # Orange's account status; an inactive agent is never shown to a customer.
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    source: Mapped[str] = mapped_column(String(20), nullable=False, default="manual")
    source_row: Mapped[str | None] = mapped_column(String(80))
    # One month of Orange's activity figures from the file (cash in, cash out, transaction
    # count), kept for the Global Report and as evidence. Never shown to customers.
    orange_cash_in: Mapped[float | None] = mapped_column(Float)
    orange_cash_out: Mapped[float | None] = mapped_column(Float)
    orange_tx_count: Mapped[float | None] = mapped_column(Float)
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
    # The dealer's note at registration, until the operator's records replace it: what this
    # agent usually handles (services/evidence.py). PRIVATE; never shown to customers.
    usual_max_sle: Mapped[int | None] = mapped_column(Integer)
    usual_float_max_sle: Mapped[int | None] = mapped_column(Integer)
    usual_daily_transactions: Mapped[int | None] = mapped_column(Integer)
    phone: Mapped[str | None] = mapped_column(String(32))
    phone_visible: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # One picture of the shopfront, taken by the agent on the phone and shrunk there (JPEG,
    # at most PHOTO_MAX_BYTES). Live for customers at once; the aggregator can remove it.
    photo: Mapped[bytes | None] = mapped_column(LargeBinary)
    photo_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    verified: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # Why the agent is not verified yet, for the aggregator: "Pending: no city; region unknown".
    # None once verified. Never shown to customers.
    verification_note: Mapped[str | None] = mapped_column(String(200))
    pin_hash: Mapped[str] = mapped_column(String(128), nullable=False)
    # True while the account holds a one-time sign-in code, not a PIN the person chose.
    must_set_pin: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # When the one-time code now in pin_hash was issued. For a short while after, a sign-in
    # with it is let through the new-phone lockout (core/limits): the code is how a locked-out
    # person gets back in, so a stranger filling that count must not be able to stop it.
    code_issued_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

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
    # The agent's own correction for today: "low" or "none" per side, until midnight. It can
    # only lower what customers read, never raise it.
    low_cash_out: Mapped[str | None] = mapped_column(String(5), nullable=True)
    low_deposit: Mapped[str | None] = mapped_column(String(5), nullable=True)
    low_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    declared_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    dealer: Mapped[Dealer] = relationship()
    # Where the app last confirmed the agent at the shop pin; loaded with every agent, since
    # it decides whether customers see them (services/checkin.py).
    checkin: Mapped[AgentCheckin | None] = relationship(lazy="selectin", uselist=False)


class AgentCheckin(Base):
    """The agent's app confirming them at the shop pin. The phone compares its own position
    with the pin and sends only yes or no; the position never leaves the phone. A table of
    its own so existing databases gain it without a migration."""

    __tablename__ = "agent_checkins"

    agent_ref: Mapped[str] = mapped_column(ForeignKey("agents.ref"), primary_key=True)
    # The last time the app found the phone at the pin (or, location off, simply open).
    last_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    # Set when the phone was found away from the pin; cleared when it is back.
    away_since: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # False when the agent turned location off: opening the app then counts as a check-in.
    location_check: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


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
    answer: Mapped[str] = mapped_column(String(12), nullable=False)  # yes|no|did_not_go|comment
    reason_code: Mapped[str | None] = mapped_column(String(32))
    # What the customer was told at report time — so a signal can compare claim vs outcome.
    outcome_at_report: Mapped[str | None] = mapped_column(String(12))
    freshness_at_report: Mapped[str | None] = mapped_column(String(20))
    rating: Mapped[int | None] = mapped_column(Integer)  # network-only
    comment: Mapped[str | None] = mapped_column(Text)  # network-only, moderation window
    source: Mapped[str] = mapped_column(String(10), nullable=False, default="search")
    # Rotating pseudonymous device key. Never a phone number or account.
    client_key: Mapped[str | None] = mapped_column(String(64))


class AgentTransaction(Base):
    """A transaction the agent logged themselves — two taps, a side and an amount band, never
    the amount. Activity evidence for the ranker and the freshness line until Orange Money's
    own records (or the agent's SMS) feed the same slot. Idempotent on the client token."""

    __tablename__ = "agent_transactions"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)  # client_token
    agent_ref: Mapped[str] = mapped_column(ForeignKey("agents.ref"), nullable=False, index=True)
    at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    transaction: Mapped[str] = mapped_column(String(12), nullable=False)  # cash_out|deposit
    amount_band: Mapped[str] = mapped_column(String(12), nullable=False)
    source: Mapped[str] = mapped_column(String(10), nullable=False, default="agent")
    # The exact amount, as the agent types it in Orange's own flow; the band is derived.
    amount_sle: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # The customer's number for a cash in: never stored whole. The last three digits for the
    # agent's eye, a salted hash for reconciliation with Orange's records.
    customer_last3: Mapped[str | None] = mapped_column(String(3), nullable=True)
    customer_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    reference: Mapped[str | None] = mapped_column(String(32), nullable=True)


class FloatRequest(Base):
    __tablename__ = "float_requests"
    # One waiting request per agent, kept by the database: two taps at the same moment cannot
    # both get through the check in the code.
    __table_args__ = (
        Index(
            "uq_float_one_pending",
            "agent_ref",
            unique=True,
            sqlite_where=text("state = 'pending'"),
            postgresql_where=text("state = 'pending'"),
        ),
    )
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


class FloatSend(Base):
    """Float an aggregator sent an agent in Orange Money, recorded here afterwards. The app
    never moves money: this row is the aggregator's statement, with the Orange Money
    reference when they give it, and completes the request it answers. Idempotent on the
    client token."""

    __tablename__ = "float_sends"
    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    dealer_id: Mapped[str] = mapped_column(ForeignKey("dealers.id"), nullable=False, index=True)
    agent_ref: Mapped[str] = mapped_column(ForeignKey("agents.ref"), nullable=False, index=True)
    amount_sle: Mapped[int] = mapped_column(Integer, nullable=False)
    om_reference: Mapped[str | None] = mapped_column(String(40))
    request_id: Mapped[str | None] = mapped_column(ForeignKey("float_requests.id"))
    sent_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    actor: Mapped[str] = mapped_column(String(120), nullable=False)
    client_token: Mapped[str | None] = mapped_column(String(64), unique=True)


class Action(Base):
    __tablename__ = "actions"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    actor: Mapped[str] = mapped_column(String(120), nullable=False)
    # Who did it, by account id (the aggregator's), so lists never match on a shared name.
    actor_id: Mapped[str | None] = mapped_column(String(40), nullable=True, index=True)
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
    # Who did it, by account id (the aggregator's), so lists never match on a shared name.
    actor_id: Mapped[str | None] = mapped_column(String(40), nullable=True, index=True)
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
    # A hash of the device that signed in (core/limits.device_id): a phone the account has
    # used before is never refused by the lockout that guards against new phones.
    client: Mapped[str | None] = mapped_column(String(32), index=True)


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


class RateEvent(Base):
    """One counted event for a limit: a wrong PIN, a search, a sign-in attempt. Kept in the
    database, not in memory, so a restart does not reset a lockout and several API servers
    share one count. Old rows are pruned as the limits are checked."""

    __tablename__ = "rate_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    key: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)


class ExportLog(Base):
    """One download of a list of agents (the national map's CSV): who, when and which filter,
    never the rows. Written before the file is returned, so a download that fails half way is
    still on record."""

    __tablename__ = "export_log"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    actor: Mapped[str] = mapped_column(String(120), nullable=False)
    actor_id: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    what: Mapped[str] = mapped_column(String(40), nullable=False)
    filters: Mapped[str] = mapped_column(String(200), nullable=False)
    rows: Mapped[int] = mapped_column(Integer, nullable=False)


class ReportImport(Base):
    """One upload of Orange's Global Report. Read, cleaned and compared with what is on record
    first (status "previewed"), written only when a person applies it ("applied") or set aside
    ("discarded"). The cleaned rows wait here between the two steps, without the file's
    personal columns, and are cleared once the report is applied or discarded. The same file
    twice is one record (its SHA-256 is unique)."""

    __tablename__ = "report_imports"

    id: Mapped[str] = mapped_column(String(24), primary_key=True)
    sha256: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    report_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    file_name: Mapped[str] = mapped_column(String(120), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    uploaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    uploaded_by: Mapped[str] = mapped_column(String(120), nullable=False)
    uploaded_by_id: Mapped[str] = mapped_column(String(40), nullable=False)
    status: Mapped[str] = mapped_column(String(12), nullable=False, index=True)
    summary: Mapped[str] = mapped_column(Text, nullable=False)  # JSON: counts, issues by row
    rows: Mapped[str | None] = mapped_column(Text)  # JSON: cleaned rows, until applied
    applied_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    applied_by: Mapped[str | None] = mapped_column(String(120))


class AgentDailyStat(Base):
    """One agent's figures for one day, from Orange's Global Report: cash in, cash out, the
    transaction count, and, when the report carries them, float and commission. Money figures:
    never shown to customers; to an aggregator only with financial-detail permission."""

    __tablename__ = "agent_daily_stats"
    __table_args__ = (UniqueConstraint("agent_ref", "report_date", name="uq_daily_agent_date"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    agent_ref: Mapped[str] = mapped_column(ForeignKey("agents.ref"), nullable=False, index=True)
    report_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    cash_in: Mapped[float | None] = mapped_column(Float)
    cash_out: Mapped[float | None] = mapped_column(Float)
    tx_count: Mapped[float | None] = mapped_column(Float)
    float_balance: Mapped[float | None] = mapped_column(Float)
    commission: Mapped[float | None] = mapped_column(Float)
    import_id: Mapped[str] = mapped_column(ForeignKey("report_imports.id"), nullable=False)
