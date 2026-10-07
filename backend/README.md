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
