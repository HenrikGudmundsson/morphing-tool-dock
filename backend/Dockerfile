# Internal-only service (see deploy/docker-compose.branch.yml): reachable
# solely from the ssr-agent container over the compose network, never from
# a browser -- so there's no nginx-facing build stage here, just a single
# python:3.13-slim + uv image. Structurally mirrors pg's own backend
# Dockerfile (proven pattern), not the apps/ssr-agent Next.js Dockerfile's
# pruner/installer/builder staging, which solves a JS-monorepo-tracing
# problem this app doesn't have.
FROM python:3.13-slim

RUN pip install --no-cache-dir uv

WORKDIR /app

COPY pyproject.toml uv.lock ./
RUN uv sync --no-dev --no-install-project

COPY alembic.ini ./
COPY agent_backend/ ./agent_backend/
RUN uv sync --no-dev

EXPOSE 8000

CMD [".venv/bin/uvicorn", "agent_backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
