"""initial schema

Revision ID: 0001
Revises:
Create Date: 2025-01-01 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), nullable=False, autoincrement=True),
        sa.Column("email", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("password_hash", sa.String(), nullable=False),
        sa.Column("role", sa.String(), nullable=False),
        sa.Column("organisation", sa.String(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("email"),
        sa.CheckConstraint("role IN ('admin', 'operator', 'client')", name="ck_users_role"),
    )
    op.create_table(
        "episodes",
        sa.Column("id", sa.Integer(), nullable=False, autoincrement=True),
        sa.Column("episode_id", sa.String(), nullable=False),
        sa.Column("robot_id", sa.String(), nullable=False),
        sa.Column("task_name", sa.String(), nullable=False),
        sa.Column("recorded_at", sa.DateTime(), nullable=False),
        sa.Column("duration_seconds", sa.Integer(), nullable=False),
        sa.Column("operator_name", sa.String(), nullable=False),
        sa.Column("quality", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("episode_id"),
        sa.CheckConstraint(
            "robot_id IN ('arm-01','arm-02','arm-03','mobile-01','humanoid-01')",
            name="ck_episodes_robot_id",
        ),
        sa.CheckConstraint("duration_seconds > 0", name="ck_episodes_duration_positive"),
        sa.CheckConstraint("quality IN ('good','usable','bad')", name="ck_episodes_quality"),
    )


def downgrade() -> None:
    op.drop_table("episodes")
    op.drop_table("users")
