from datetime import datetime

import sqlalchemy as sa
from sqlalchemy import TIMESTAMP
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    """Shared declarative base -- every ORM model inherits from this.

    alembic/env.py points at Base.metadata as its migration target, so a
    new model only needs to subclass this to be picked up by
    `alembic revision --autogenerate`.
    """


class Conversation(Base):
    __tablename__ = "conversations"

    session_id: Mapped[str] = mapped_column(primary_key=True)
    message_history: Mapped[list] = mapped_column(
        JSONB, nullable=False, server_default="[]"
    )
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("now()")
    )
    updated_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("now()")
    )


class UsageEvent(Base):
    """One accepted question: who asked, and what it cost.

    A row is written when a question is accepted, before the model is
    called, and its token counts are filled in afterwards. The limits in
    limits.py are counts and sums over these rows, and they are also the
    record of how much the service is being used.
    """

    __tablename__ = "usage_events"
    __table_args__ = (
        sa.Index("ix_usage_events_created_at", "created_at"),
        sa.Index("ix_usage_events_ip_created_at", "ip", "created_at"),
        sa.Index("ix_usage_events_session_created_at", "session_id", "created_at"),
    )

    id: Mapped[int] = mapped_column(sa.BigInteger, primary_key=True, autoincrement=True)
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("now()")
    )
    session_id: Mapped[str] = mapped_column(nullable=False)
    ip: Mapped[str] = mapped_column(nullable=False)
    input_tokens: Mapped[int] = mapped_column(nullable=False, server_default="0")
    output_tokens: Mapped[int] = mapped_column(nullable=False, server_default="0")


class VerifiedSession(Base):
    """A session that has passed the human check, and when.

    See verification.py. One row per session; passing again moves
    `verified_at` forward.
    """

    __tablename__ = "verified_sessions"

    session_id: Mapped[str] = mapped_column(primary_key=True)
    verified_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("now()")
    )
