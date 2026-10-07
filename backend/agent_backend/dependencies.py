from agent_backend.db.repository import ConversationRepository


def get_conversation_repository():
    return ConversationRepository()
