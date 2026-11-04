"""Security review fixes: the device a session signed in from, old customer codes cleared,
national sessions from before the 6-digit rule ended.

Revision ID: 0006_device_lockout
Revises: 0005_export_log
Create Date: 2026-11-04

- sessions.client: a hash of the device (core/limits.device_id), so the lockout can tell an
  account's own phones from new ones. New, nullable: existing sessions count as new devices
  until their next sign-in, which only means they meet the new-device count like anyone else.
- agent_transactions.customer_hash: codes written before CUSTOMER_HASH_KEY was required were
  plain SHA-256 of an 8-digit number and can be reversed by trying every number. They cannot
  be re-keyed without the number, so they are cleared; customer_last3 stays. The only effect
  is that a repeat customer is not linked to records made before this migration.
- agents.code_issued_at, dealers.code_issued_at: when the one-time code was read out, so a
  fresh code gets through the new-phone lockout (a stranger cannot keep its owner out).
- National sessions: a session opened with a PIN shorter than the 6-digit rule would stay open
  until its next sign-in; every national session ends and Orange signs in again.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0006_device_lockout"
down_revision = "0005_export_log"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {c["name"] for c in inspector.get_columns("sessions")}
    if "client" not in columns:
        with op.batch_alter_table("sessions") as batch:
            batch.add_column(sa.Column("client", sa.String(length=32), nullable=True))
    indexes = {i["name"] for i in inspector.get_indexes("sessions")}
    if "ix_sessions_client" not in indexes:
        op.create_index("ix_sessions_client", "sessions", ["client"])

    for table in ("agents", "dealers"):
        if "code_issued_at" not in {c["name"] for c in inspector.get_columns(table)}:
            with op.batch_alter_table(table) as batch:
                batch.add_column(
                    sa.Column("code_issued_at", sa.DateTime(timezone=True), nullable=True)
                )

    if "agent_transactions" in inspector.get_table_names():
        op.execute(
            "UPDATE agent_transactions SET customer_hash = NULL WHERE customer_hash IS NOT NULL"
        )

    op.execute(
        sa.text(
            "UPDATE sessions SET revoked = :yes WHERE role = 'dealer' AND subject IN "
            "(SELECT id FROM dealers WHERE permissions LIKE '%VIEW_NATIONAL%')"
        ).bindparams(yes=True)
    )


def downgrade() -> None:
    # The cleared codes and ended sessions are not restored: that is the point of the change.
    for table in ("agents", "dealers"):
        with op.batch_alter_table(table) as batch:
            batch.drop_column("code_issued_at")
    op.drop_index("ix_sessions_client", table_name="sessions")
    with op.batch_alter_table("sessions") as batch:
        batch.drop_column("client")
