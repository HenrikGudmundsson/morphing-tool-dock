from pydantic import BaseModel, Field
from pydantic_ai import RunContext

from agent_backend.agent.deps import AgentDeps
from agent_backend.capabilities.base import Capability


class ShowCalendarArgs(BaseModel):
    week_offset: int = Field(
        default=0,
        ge=-52,
        le=52,
        description=(
            "Which week to show, relative to the current one: 0 for this week, "
            "1 for next week, -1 for last week."
        ),
    )


async def show_calendar(ctx: RunContext[AgentDeps], args: ShowCalendarArgs) -> str:
    """Show the user's calendar for one week.
    Call this when the user asks about their calendar, schedule, agenda,
    meetings or what they have on this week, next week or last week.
    """

    ctx.deps.resolved = {"tool": "showCalendar", "args": args.model_dump()}

    return f"Showing the calendar for week offset {args.week_offset}"


CAPABILITY = Capability(name="showCalendar", tool_fn=show_calendar)
