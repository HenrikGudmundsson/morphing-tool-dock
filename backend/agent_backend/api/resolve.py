from fastapi import APIRouter, Depends
from pydantic_ai import ModelMessagesTypeAdapter
from pydantic_core import to_jsonable_python

from agent_backend.agent.core import build_agent
from agent_backend.agent.deps import AgentDeps
from agent_backend.api.models import ResolveRequest, ResolveResponse
from agent_backend.dependencies import get_conversation_repository

router = APIRouter()


@router.post("/resolve")
async def resolve(
    request: ResolveRequest,
    repo=Depends(get_conversation_repository),
):
    stored_history = await repo.load(request.session_id)
    message_history = (
        ModelMessagesTypeAdapter.validate_python(stored_history)
        if stored_history
        else None
    )

    agent = await build_agent(request.tools)
    deps = AgentDeps()
    result = await agent.run(request.query, message_history=message_history, deps=deps)

    await repo.save(request.session_id, to_jsonable_python(result.all_messages()))

    if deps.resolved:
        return ResolveResponse(tool=deps.resolved["tool"], args=deps.resolved["args"])

    return ResolveResponse(reply=result.output)
