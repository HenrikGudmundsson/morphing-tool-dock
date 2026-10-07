from pydantic import BaseModel, Field
from pydantic_ai import RunContext

from agent_backend.agent.deps import AgentDeps
from agent_backend.capabilities.base import Capability


class ShowStockChartArgs(BaseModel):
    symbol: str = Field(
        default="GOOGL", description="The stock the widget is showing a value for"
    )


async def show_stock_chart(ctx: RunContext[AgentDeps], args: ShowStockChartArgs) -> str:
    """Shows the stock chart for a stock.
    Call this tool when the user asks for
    the information of a specific stock,
    or wants to see information about
    stocks in general.
    """

    ctx.deps.resolved = {"tool": "showStockChart", "args": args.model_dump()}

    return f"Showing the stock information for {args.symbol}"


CAPABILITY = Capability(name="showStockChart", tool_fn=show_stock_chart)
