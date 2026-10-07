from pydantic import BaseModel


class ResolveRequest(BaseModel):
    query: str
    session_id: str
    # Capability names the caller can render (e.g. "showWeather"). Omitted
    # or empty means every capability.
    tools: list[str] | None = None


class ResolveResponse(BaseModel):
    tool: str | None = None
    args: dict | None = None
    reply: str | None = None
