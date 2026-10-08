"""Prints how much the service has been used, per day.

    uv run python -m agent_backend.usage_report [days]

One line per UTC day: questions accepted, distinct addresses and sessions,
and tokens spent against DAILY_TOKEN_BUDGET.
"""

import asyncio
import sys

from sqlalchemy import func, select

from agent_backend import config
from agent_backend.db.models import UsageEvent
from agent_backend.db.pool import close_db_pool, get_session, init_db_pool


async def main(days: int) -> None:
    await init_db_pool()
    day = func.date_trunc("day", UsageEvent.created_at).label("day")
    tokens = func.sum(UsageEvent.input_tokens + UsageEvent.output_tokens)
    async with get_session() as session:
        rows = (
            await session.execute(
                select(
                    day,
                    func.count(),
                    func.count(func.distinct(UsageEvent.ip)),
                    func.count(func.distinct(UsageEvent.session_id)),
                    tokens,
                )
                .group_by(day)
                .order_by(day.desc())
                .limit(days)
            )
        ).all()
    await close_db_pool()

    print(f"{'day':<12}{'questions':>10}{'addresses':>11}{'sessions':>10}{'tokens':>10}{'of budget':>11}")
    for when, questions, addresses, sessions, spent in rows:
        share = f"{100 * spent / config.DAILY_TOKEN_BUDGET:.0f}%"
        print(f"{when:%Y-%m-%d}  {questions:>10}{addresses:>11}{sessions:>10}{spent:>10}{share:>11}")
    if not rows:
        print("(no usage recorded)")


if __name__ == "__main__":
    asyncio.run(main(int(sys.argv[1]) if len(sys.argv) > 1 else 14))
