# agent-backend

The agent behind the demos: a FastAPI service around a
[pydantic-ai](https://ai.pydantic.dev/) agent that decides which widget
answers a message.

`POST /resolve` takes:

```json
{ "query": "what's on my calendar next week", "session_id": "…", "tools": ["showWeather", "showCalendar"] }
```

and returns either a tool call or a plain text reply:

```json
{ "tool": "showCalendar", "args": { "week_offset": 1 }, "reply": null }
```

- **Capabilities.** Each widget a client can show is declared to the model
  as a tool with a typed argument schema, in `agent_backend/capabilities/`.
  The model never produces UI; it names a capability and fills in its
  arguments, and the client renders the matching widget.
- **`tools`** lists the capabilities the calling client has widgets for.
  Only those are offered to the model. Omit it to offer all of them.
- **History.** The conversation is stored per `session_id` in Postgres and
  sent along with each new message.

## Usage limits

The demos calling this service are public, so every way a caller could run
up the model bill is bounded. Defaults are in `agent_backend/config.py`
and can be overridden through the environment.

What one question can cost:

- the question is at most 400 characters, checked before the model is
  called;
- the reply is at most 300 tokens, enforced by the model API whatever the
  prompt asks for;
- a question triggers one model call (a second is allowed for a retry),
  because a capability is the agent's *output*: calling one ends the run;
- only the last 6 exchanges are sent as history.

How many questions are accepted (`agent_backend/limits.py`):

- 20 per IP address per hour -- session ids are chosen by the client, so
  this is the limit a script cannot dodge;
- 30 per session per day;
- 500,000 tokens per day across everyone, a few hundred questions.

A refused question gets a normal response whose `reply` explains why and
whose `limited` field names the limit; the model is not called. If the
limits cannot be checked (the database is down), questions are refused
rather than let through.

**Human check (optional).** With `TURNSTILE_SITE_KEY` and
`TURNSTILE_SECRET_KEY` set, a session's questions are only answered after
its client has passed Cloudflare Turnstile once: `/resolve` replies with
`limited: "verification"` and the site key, the client runs the widget and
posts the token to `/verify`, then asks again. See
`agent_backend/verification.py`.

The caller's address is read from the `X-Real-IP` header, so this service
must only be reachable through a proxy that sets it.

`uv run python -m agent_backend.usage_report` prints usage per day.

These limits bound the bill; they are not a hard guarantee. That is what a
spend limit on the API key's workspace in the Anthropic Console is for.

## Local dev

1. `docker compose -f docker-compose.dev.yml up -d` -- Postgres only.
2. `cp .env.example .env`, fill in `ANTHROPIC_API_KEY`.
3. `uv sync`
4. `uv run alembic upgrade head`
5. `uv run uvicorn agent_backend.main:app --reload --port 8000`

## Adding a capability

Add a module in `agent_backend/capabilities/` with an argument model, a
tool function that records its decision on `ctx.deps.resolved`, and a
`CAPABILITY`; then list it in `capabilities/registry.py`.
