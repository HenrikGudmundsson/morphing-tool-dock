from pydantic import BaseModel, Field


class ResolveRequest(BaseModel):
    # Length is checked in the handler, not here: an over-long question
    # gets an explanation the client can show, not a validation error.
    query: str
    session_id: str = Field(min_length=1, max_length=100)
    # Capability names the caller can render (e.g. "showWeather"). Omitted
    # or empty means every capability.
    tools: list[str] | None = Field(default=None, max_length=20)


class ResolveResponse(BaseModel):
    tool: str | None = None
    args: dict | None = None
    reply: str | None = None
    # Set when the question was refused by a usage limit rather than
    # answered; `reply` then holds the explanation. See limits.py.
    limited: str | None = None
    # With limited == "verification": the Turnstile site key the client
    # needs to run the human check (see verification.py).
    site_key: str | None = None


class VerifyRequest(BaseModel):
    session_id: str = Field(min_length=1, max_length=100)
    # The token Cloudflare's Turnstile widget produced in the browser.
    token: str = Field(min_length=1, max_length=4096)


class VerifyResponse(BaseModel):
    verified: bool
