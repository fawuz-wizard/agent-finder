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
# Every waiting request except each agent's newest.
OLDER = """
            SELECT id FROM (
                SELECT id, ROW_NUMBER() OVER (
                    PARTITION BY agent_ref ORDER BY requested_at DESC
                ) AS n
                FROM float_requests WHERE state = 'pending'
            ) newest WHERE n = 1
        )"""


def upgrade() -> None:
    # A database from before this rule may hold two waiting requests for one agent: keep the
    # newest waiting, cancel the older, so the rule can be added without losing anything.
    # Each cancel is written to the request's history first, so nothing changes unrecorded.
    op.execute(
        """
        INSERT INTO float_request_events (request_id, at, from_state, to_state, actor, reason)
        SELECT id, CURRENT_TIMESTAMP, 'pending', 'cancelled', 'system',
               'A newer request from the same agent was waiting (one at a time from now on)'
        FROM float_requests
        WHERE state = 'pending' AND id NOT IN (
        """
        + OLDER
    )
    op.execute(
        "UPDATE float_requests SET state = 'cancelled' WHERE state = 'pending' AND id NOT IN ("
        + OLDER
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
