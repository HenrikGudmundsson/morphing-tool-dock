from pydantic import BaseModel, Field
from pydantic_ai import RunContext

from agent_backend.agent.deps import AgentDeps
from agent_backend.capabilities.base import Capability


class ShowWeatherArgs(BaseModel):
    location: str = Field(
        default="Stockholm",
        description="The location that the widget's weather forcast is shown for",
    )


async def show_weather(ctx: RunContext[AgentDeps], args: ShowWeatherArgs) -> str:
    """Show the current weather forecast for a location.
    Call this when the user asks something related to
    weather forecasts or temperatures for a location.
    """

    ctx.deps.resolved = {"tool": "showWeather", "args": args.model_dump()}

    return f"Showing the weather for {args.location}"


CAPABILITY = Capability(name="showWeather", tool_fn=show_weather)
