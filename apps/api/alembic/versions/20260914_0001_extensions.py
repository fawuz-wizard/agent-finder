"""Baseline: enable PostGIS and pgcrypto.

Revision ID: 0001_extensions
Revises: None
Create Date: 2026-09-14
"""

from __future__ import annotations

from alembic import op

revision = "0001_extensions"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS postgis")
    op.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto")


def downgrade() -> None:
    # Extensions are shared infrastructure; dropping them would take PostGIS types with them.
    pass
