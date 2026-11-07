"""Every download of the agents list is recorded: who, when, which filter, how many rows.

Revision ID: 0005_export_log
Revises: 0004_actor_ids_hashed_sessions
Create Date: 2026-11-02

A new table only; nothing existing changes.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0005_export_log"
down_revision = "0004_actor_ids_hashed_sessions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Safe on a database that already has the table (one made by create_all).
    if "export_log" in sa.inspect(op.get_bind()).get_table_names():
        return
    op.create_table(
        "export_log",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("actor", sa.String(length=120), nullable=False),
        sa.Column("actor_id", sa.String(length=40), nullable=False),
        sa.Column("what", sa.String(length=40), nullable=False),
        sa.Column("filters", sa.String(length=200), nullable=False),
        sa.Column("rows", sa.Integer(), nullable=False),
    )
    op.create_index("ix_export_log_at", "export_log", ["at"])
    op.create_index("ix_export_log_actor_id", "export_log", ["actor_id"])


def downgrade() -> None:
    op.drop_index("ix_export_log_actor_id", table_name="export_log")
    op.drop_index("ix_export_log_at", table_name="export_log")
    op.drop_table("export_log")
