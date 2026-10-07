from contextlib import asynccontextmanager

from fastapi import FastAPI

from agent_backend.api import health, resolve
from agent_backend.db.pool import close_db_pool, init_db_pool


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db_pool()
    yield
    await close_db_pool()


app = FastAPI(title="agent-backend", lifespan=lifespan)

app.include_router(health.router)
app.include_router(resolve.router)
