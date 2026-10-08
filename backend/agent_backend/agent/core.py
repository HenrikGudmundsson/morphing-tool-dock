from pydantic_ai import Agent

from agent_backend.agent.deps import AgentDeps
from agent_backend.capabilities.registry import CAPABILITIES


async def build_agent(enabled: list[str] | None = None):
    # A caller names the capabilities it has widgets for, so the model is
    # never offered a tool that caller can't render. No list means all.
    capabilities = (
        [c for c in CAPABILITIES if c.name in enabled] if enabled else CAPABILITIES
    )
    return Agent(
        "anthropic:claude-haiku-5-5",
        deps_type=AgentDeps,
        instructions="You help decide which UI widget to show in response to a user's request. If one of your tools matches what they're asking for, call it. If nothing fits, just reply in plain text. The widgets do not remember earlier turns, so call the matching tool every time it is asked for, even if you already called it for the same request earlier in the conversation.",
        tools=[c.tool_fn for c in capabilities],
    )
