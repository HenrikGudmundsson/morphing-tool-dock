# @portfolio/agent-tools

Minimal agent-driven UI demo: Vite + React + TypeScript + Tailwind v4, no
SSR, no framework beyond React. Calls `apps/agent-backend`'s `/resolve`
directly from the browser and renders the matching widget client-side.

Local dev: run `apps/agent-backend` per its own README, then `pnpm dev`
from the repo root as usual. Vite's dev server proxies `/agent-tools-api`
to `http://localhost:8000` (see `vite.config.ts`), same relative path this
app's code uses in branch deploys -- no env var needed.

See the repo root `the workspace notes` for the overall structure and commands.
