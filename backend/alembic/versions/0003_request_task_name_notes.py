"""add task_name and notes to dataset_requests

Revision ID: 0003
Revises: 0002
Create Date: 2026-10-04 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "dataset_requests",
        sa.Column("task_name", sa.String(), nullable=False, server_default=""),
    )
    op.add_column(
        "dataset_requests",
        sa.Column("notes", sa.String(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("dataset_requests", "notes")
    op.drop_column("dataset_requests", "task_name")
