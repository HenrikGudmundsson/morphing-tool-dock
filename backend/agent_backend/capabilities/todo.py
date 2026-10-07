from pydantic import BaseModel, Field
from pydantic_ai import RunContext

from agent_backend.agent.deps import AgentDeps
from agent_backend.capabilities.base import Capability


class ShowTodoArgs(BaseModel):
    add: list[str] = Field(
        default_factory=list,
        max_length=20,
        description=(
            "Items to add to the to-do list, one short task per entry, phrased "
            "as the task itself (e.g. 'Buy milk'). Leave empty to just show "
            "the list."
        ),
    )


async def show_todo(ctx: RunContext[AgentDeps], args: ShowTodoArgs) -> str:
    """Show the user's to-do list, optionally adding items to it.
    Call this when the user asks to see their to-do list or tasks, or asks
    to add, note or remember something they need to do. Put every task they
    mention in `add`, split into separate entries.
    """

    ctx.deps.resolved = {"tool": "showTodo", "args": args.model_dump()}

    if args.add:
        return f"Added {len(args.add)} item(s) to the to-do list and showed it"
    return "Showing the to-do list"


CAPABILITY = Capability(name="showTodo", tool_fn=show_todo)
