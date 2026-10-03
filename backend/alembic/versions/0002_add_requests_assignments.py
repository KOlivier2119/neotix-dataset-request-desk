"""add requests and assignments

Revision ID: 0002
Revises: 0001
Create Date: 2025-01-02 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "dataset_requests",
        sa.Column("id", sa.Integer(), nullable=False, autoincrement=True),
        sa.Column("client_id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("episodes_requested", sa.Integer(), nullable=False),
        sa.Column("deadline", sa.DateTime(), nullable=False),
        sa.Column("status", sa.String(), nullable=False, server_default=sa.text("'submitted'")),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["client_id"], ["users.id"]),
        sa.CheckConstraint(
            "status IN ('submitted','in_progress','delivered','accepted','rejected')",
            name="ck_dataset_requests_status",
        ),
    )
    op.create_table(
        "request_status_history",
        sa.Column("id", sa.Integer(), nullable=False, autoincrement=True),
        sa.Column("request_id", sa.Integer(), nullable=False),
        sa.Column("actor_id", sa.Integer(), nullable=False),
        sa.Column("from_status", sa.String(), nullable=True),
        sa.Column("to_status", sa.String(), nullable=False),
        sa.Column("changed_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["request_id"], ["dataset_requests.id"]),
        sa.ForeignKeyConstraint(["actor_id"], ["users.id"]),
    )
    op.create_table(
        "assignments",
        sa.Column("id", sa.Integer(), nullable=False, autoincrement=True),
        sa.Column("request_id", sa.Integer(), nullable=False),
        sa.Column("episode_id", sa.Integer(), nullable=False),
        sa.Column("assigned_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["request_id"], ["dataset_requests.id"]),
        sa.ForeignKeyConstraint(["episode_id"], ["episodes.id"]),
        sa.UniqueConstraint("request_id", "episode_id", name="uq_assignments_request_episode"),
    )


def downgrade() -> None:
    op.drop_table("assignments")
    op.drop_table("request_status_history")
    op.drop_table("dataset_requests")
