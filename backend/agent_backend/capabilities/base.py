from collections.abc import Awaitable, Callable
from dataclasses import dataclass


@dataclass(frozen=True)
class Capability:
    name: str
    tool_fn: Callable[..., Awaitable[str]]
