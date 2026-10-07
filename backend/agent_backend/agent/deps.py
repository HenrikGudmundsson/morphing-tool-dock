from dataclasses import dataclass


@dataclass
class AgentDeps:
    resolved: dict | None = None
