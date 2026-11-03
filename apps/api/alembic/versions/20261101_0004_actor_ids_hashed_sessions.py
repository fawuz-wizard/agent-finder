"""Actions and reveals keep who did them by account id; sign-in tokens are kept hashed.

Revision ID: 0004_actor_ids_hashed_sessions
Revises: 0003_one_pending_float
Create Date: 2026-11-01

Before: an aggregator's history and reveal log were found by display name, so two aggregators
with the same name (or an agent named like one) could read each other's rows; and the sessions
table held working sign-in tokens. After: rows carry the aggregator's id (old rows are matched
by name only where exactly one aggregator has that name; the rest stay unmatched, never shown
to the wrong one), and each token is replaced by its SHA-256, so everyone stays signed in.
"""

from __future__ import annotations

import hashlib

import sqlalchemy as sa
from alembic import op

revision = "0004_actor_ids_hashed_sessions"
down_revision = "0003_one_pending_float"
branch_labels = None
depends_on = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    for table in ("actions", "audit_log"):
        # Safe to run on a database that already has the column (one made by create_all).
        columns = {c["name"] for c in inspector.get_columns(table)}
        indexes = {i["name"] for i in inspector.get_indexes(table)}
        with op.batch_alter_table(table) as batch:
            if "actor_id" not in columns:
                batch.add_column(sa.Column("actor_id", sa.String(length=40), nullable=True))
            if f"ix_{table}_actor_id" not in indexes:
                batch.create_index(f"ix_{table}_actor_id", ["actor_id"])
        op.execute(
            f"""
            UPDATE {table} SET actor_id = (SELECT d.id FROM dealers d WHERE d.name = {table}.actor)
            WHERE actor_id IS NULL
              AND (SELECT COUNT(*) FROM dealers d WHERE d.name = {table}.actor) = 1
            """
        )
    bind = op.get_bind()
    tokens = [row[0] for row in bind.execute(sa.text("SELECT token FROM sessions"))]
    for token in tokens:
        # A token that is already 64 hex characters was hashed before; leave it.
        if len(token) == 64 and all(c in "0123456789abcdef" for c in token):
            continue
        bind.execute(
            sa.text("UPDATE sessions SET token = :new WHERE token = :old"),
            {"new": hashlib.sha256(token.encode()).hexdigest(), "old": token},
        )


def downgrade() -> None:
    # Hashed tokens cannot be turned back: going down signs everyone out.
    op.execute("DELETE FROM sessions")
    for table in ("actions", "audit_log"):
        with op.batch_alter_table(table) as batch:
            batch.drop_index(f"ix_{table}_actor_id")
            batch.drop_column("actor_id")
