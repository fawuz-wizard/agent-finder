"""One waiting float request per agent, kept by the database.

Revision ID: 0003_one_pending_float
Revises: 0002_baseline
Create Date: 2026-11-01
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0003_one_pending_float"
down_revision = "0002_baseline"
branch_labels = None
depends_on = None

WHERE = sa.text("state = 'pending'")


def upgrade() -> None:
    # A database from before this rule may hold two waiting requests for one agent: keep the
    # newest waiting, cancel the older, so the rule can be added without losing anything.
    op.execute(
        """
        UPDATE float_requests SET state = 'cancelled'
        WHERE state = 'pending' AND id NOT IN (
            SELECT id FROM (
                SELECT id, ROW_NUMBER() OVER (
                    PARTITION BY agent_ref ORDER BY requested_at DESC
                ) AS n
                FROM float_requests WHERE state = 'pending'
            ) newest WHERE n = 1
        )
        """
    )
    if "uq_float_one_pending" in {
        i["name"] for i in sa.inspect(op.get_bind()).get_indexes("float_requests")
    }:
        return
    op.create_index(
        "uq_float_one_pending",
        "float_requests",
        ["agent_ref"],
        unique=True,
        sqlite_where=WHERE,
        postgresql_where=WHERE,
    )


def downgrade() -> None:
    op.drop_index("uq_float_one_pending", table_name="float_requests")
