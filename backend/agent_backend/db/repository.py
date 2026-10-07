from datetime import UTC, datetime

from sqlalchemy import select

from agent_backend.db.models import Conversation
from agent_backend.db.pool import get_session


class ConversationRepository:
    async def load(self, session_id: str):
        async with get_session() as session:
            conversation = (
                await session.execute(
                    select(Conversation).where(Conversation.session_id == session_id)
                )
            ).scalar_one_or_none()

            return conversation.message_history if conversation else []

    async def save(self, session_id: str, message_history: list):
        async with get_session() as session:
            conversation = await session.get(Conversation, session_id)
            if conversation is not None:
                conversation.message_history = message_history
                conversation.updated_at = datetime.now(UTC)
            else:
                session.add(
                    Conversation(session_id=session_id, message_history=message_history)
                )

            await session.commit()
