from agent_backend.db.repository import ConversationRepository
from agent_backend.limits import UsageLimiter


def get_conversation_repository():
    return ConversationRepository()


def get_usage_limiter():
    return UsageLimiter()
