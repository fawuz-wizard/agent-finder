"""Global Report: record the account that applied a report, not only its display name.

Revision ID: 0008_report_applied_by_id
Revises: 0007_global_report
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0008_report_applied_by_id"
down_revision = "0007_global_report"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # A database built from the models before migrations existed already has the column.
    cols = {c["name"] for c in sa.inspect(op.get_bind()).get_columns("report_imports")}
    if "applied_by_id" not in cols:
        with op.batch_alter_table("report_imports") as batch:
            batch.add_column(sa.Column("applied_by_id", sa.String(length=40), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("report_imports") as batch:
        batch.drop_column("applied_by_id")
