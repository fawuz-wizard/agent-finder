"""The daily Global Report: each upload, and each agent's figures per day.

Revision ID: 0007_global_report
Revises: 0006_device_lockout
Create Date: 2026-11-04

New tables only, and one new permission (IMPORT_GLOBAL_REPORT) for Orange's national accounts,
which upload the report. Nothing existing changes.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0007_global_report"
down_revision = "0006_device_lockout"
branch_labels = None
depends_on = None


def upgrade() -> None:
    tables = set(sa.inspect(op.get_bind()).get_table_names())
    if "report_imports" not in tables:
        op.create_table(
            "report_imports",
            sa.Column("id", sa.String(length=24), primary_key=True),
            sa.Column("sha256", sa.String(length=64), nullable=False, unique=True),
            sa.Column("report_date", sa.Date(), nullable=False),
            sa.Column("file_name", sa.String(length=120), nullable=False),
            sa.Column("size_bytes", sa.Integer(), nullable=False),
            sa.Column("uploaded_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("uploaded_by", sa.String(length=120), nullable=False),
            sa.Column("uploaded_by_id", sa.String(length=40), nullable=False),
            sa.Column("status", sa.String(length=12), nullable=False),
            sa.Column("summary", sa.Text(), nullable=False),
            sa.Column("rows", sa.Text(), nullable=True),
            sa.Column("applied_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("applied_by", sa.String(length=120), nullable=True),
        )
        op.create_index("ix_report_imports_report_date", "report_imports", ["report_date"])
        op.create_index("ix_report_imports_status", "report_imports", ["status"])
    if "agent_daily_stats" not in tables:
        op.create_table(
            "agent_daily_stats",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column(
                "agent_ref", sa.String(length=40), sa.ForeignKey("agents.ref"), nullable=False
            ),
            sa.Column("report_date", sa.Date(), nullable=False),
            sa.Column("cash_in", sa.Float(), nullable=True),
            sa.Column("cash_out", sa.Float(), nullable=True),
            sa.Column("tx_count", sa.Float(), nullable=True),
            sa.Column("float_balance", sa.Float(), nullable=True),
            sa.Column("commission", sa.Float(), nullable=True),
            sa.Column(
                "import_id",
                sa.String(length=24),
                sa.ForeignKey("report_imports.id"),
                nullable=False,
            ),
            sa.UniqueConstraint("agent_ref", "report_date", name="uq_daily_agent_date"),
        )
        op.create_index("ix_agent_daily_stats_agent_ref", "agent_daily_stats", ["agent_ref"])
        op.create_index("ix_agent_daily_stats_report_date", "agent_daily_stats", ["report_date"])
    # Orange's national accounts upload the report.
    op.execute(
        "UPDATE dealers SET permissions = permissions || ',IMPORT_GLOBAL_REPORT' "
        "WHERE permissions LIKE '%VIEW_NATIONAL%' "
        "AND permissions NOT LIKE '%IMPORT_GLOBAL_REPORT%'"
    )


def downgrade() -> None:
    op.drop_table("agent_daily_stats")
    op.drop_table("report_imports")
