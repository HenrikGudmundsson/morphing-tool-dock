from pydantic_ai.messages import ModelMessage, ModelRequest, UserPromptPart


def last_turns(messages: list[ModelMessage], turns: int) -> list[ModelMessage]:
    """The tail of a conversation holding at most `turns` user questions.

    Cut at a user question, never mid-exchange: a tool result without the
    call it answers is not a history the model API accepts.
    """
    starts = [
        i
        for i, message in enumerate(messages)
        if isinstance(message, ModelRequest)
        and any(isinstance(part, UserPromptPart) for part in message.parts)
    ]
    if len(starts) <= turns:
        return messages
    return messages[starts[-turns] :]
