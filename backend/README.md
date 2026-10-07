# agent-backend

Real `pydantic-ai` agent backend for `apps/ssr-agent`. Internal-only
service: reachable from the `ssr-agent` container over the Docker Compose
network, never from a browser directly.

See `the project's design notes` (or the repo's own copy
if it's been committed) for the full design.

## Local dev

1. `docker compose -f docker-compose.dev.yml up -d` -- Postgres only.
2. `cp .env.example .env`, fill in `ANTHROPIC_API_KEY`.
3. `uv sync`
4. `uv run alembic upgrade head`
5. `uv run uvicorn agent_backend.main:app --reload --port 8000`

Then, in `apps/ssr-agent`, add a `.env.local` with:
```
AGENT_BACKEND_URL=http://localhost:8000
```

## Tests

```
uv run pytest
```
