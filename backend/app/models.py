from datetime import datetime

from sqlalchemy import CheckConstraint, String, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint("role IN ('admin', 'operator', 'client')", name="ck_users_role"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    password_hash: Mapped[str] = mapped_column(String, nullable=False)
    role: Mapped[str] = mapped_column(String, nullable=False)
    organisation: Mapped[str | None] = mapped_column(String, nullable=True)
    is_active: Mapped[bool] = mapped_column(nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        nullable=False, server_default=func.now()
    )


class Episode(Base):
    __tablename__ = "episodes"
    __table_args__ = (
        CheckConstraint(
            "robot_id IN ('arm-01','arm-02','arm-03','mobile-01','humanoid-01')",
            name="ck_episodes_robot_id",
        ),
        CheckConstraint("duration_seconds > 0", name="ck_episodes_duration_positive"),
        CheckConstraint(
            "quality IN ('good','usable','bad')", name="ck_episodes_quality"
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    episode_id: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    robot_id: Mapped[str] = mapped_column(String, nullable=False)
    task_name: Mapped[str] = mapped_column(String, nullable=False)
    recorded_at: Mapped[datetime] = mapped_column(nullable=False)
    duration_seconds: Mapped[int] = mapped_column(nullable=False)
    operator_name: Mapped[str] = mapped_column(String, nullable=False)
    quality: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        nullable=False, server_default=func.now()
    )
