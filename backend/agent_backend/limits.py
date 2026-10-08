"""Bounds on how much this service can be made to cost.

Three limits decide whether a question is accepted at all, checked in
order: a per-IP hourly count (the one a script cannot dodge by inventing
session ids), a per-session daily count, and a daily token budget across
everyone. A refused question gets a plain-text explanation instead of an
answer, and never reaches the model.

What a single accepted question can cost is bounded separately, where the
agent is built and run: question length, reply length, model calls per
question and how much history is sent (see config.py).
"""

from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select, update

from agent_backend import config
from agent_backend.db.models import UsageEvent
from agent_backend.db.pool import get_session

MESSAGES = {
    "length": (
        "That message is too long for this demo. "
        f"Please keep it under {config.MAX_QUERY_CHARS} characters."
    ),
    "ip": "You've reached this demo's hourly limit. Please try again in a little while.",
    "session": "This conversation has reached the demo's limit for today.",
    "daily": "The demo has reached today's usage limit. Please come back tomorrow.",
    "unavailable": "The demo is temporarily unavailable. Please try again later.",
    "verification": "One moment: checking that you're not a robot.",
}


class UsageLimiter:
    async def reserve(self, session_id: str, ip: str) -> tuple[int | None, str | None]:
        """Accept or refuse one question.

        Returns (event_id, None) when accepted, having recorded it, or
        (None, reason) when refused; `reason` is a key of MESSAGES. The
        row is written before the model is called so that questions still
        in flight count against the limits too.
        """
        now = datetime.now(UTC)
        async with get_session() as session:

            async def count(*where) -> int:
                return (
                    await session.execute(
                        select(func.count()).select_from(UsageEvent).where(*where)
                    )
                ).scalar_one()

            if (
                await count(
                    UsageEvent.ip == ip,
                    UsageEvent.created_at > now - timedelta(hours=1),
                )
                >= config.LIMIT_PER_IP_PER_HOUR
            ):
                return None, "ip"

            if (
                await count(
                    UsageEvent.session_id == session_id,
                    UsageEvent.created_at > now - timedelta(days=1),
                )
                >= config.LIMIT_PER_SESSION_PER_DAY
            ):
                return None, "session"

            midnight = now.replace(hour=0, minute=0, second=0, microsecond=0)
            spent = (
                await session.execute(
                    select(
                        func.coalesce(
                            func.sum(UsageEvent.input_tokens + UsageEvent.output_tokens),
                            0,
                        )
                    ).where(UsageEvent.created_at >= midnight)
                )
            ).scalar_one()
            if spent >= config.DAILY_TOKEN_BUDGET:
                return None, "daily"

            event = UsageEvent(session_id=session_id, ip=ip)
            session.add(event)
            await session.commit()
            return event.id, None

    async def record(self, event_id: int, input_tokens: int, output_tokens: int) -> None:
        """Fill in what an accepted question actually cost."""
        async with get_session() as session:
            await session.execute(
                update(UsageEvent)
                .where(UsageEvent.id == event_id)
                .values(input_tokens=input_tokens, output_tokens=output_tokens)
            )
            await session.commit()
