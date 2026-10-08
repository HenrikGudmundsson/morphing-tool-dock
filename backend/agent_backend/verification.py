"""A once-per-session check that a person, not a script, is asking.

Session ids are made up by the client, so on their own they prove nothing:
a script can send a fresh one with every request. With Turnstile configured
(config.TURNSTILE_SECRET_KEY), a session only gets answers after its client
has run Cloudflare's Turnstile widget and handed the resulting token to
POST /verify, where it is checked with Cloudflare. Tokens are single-use
and short-lived, so each new session costs a real pass of the check.

Until then /resolve answers with `limited: "verification"` and the public
site key, which is the client's cue to run the widget and try again.
"""

import logging
from datetime import UTC, datetime, timedelta

import httpx
from sqlalchemy.dialects.postgresql import insert

from agent_backend import config
from agent_backend.db.models import VerifiedSession
from agent_backend.db.pool import get_session

SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"

logger = logging.getLogger(__name__)


def required() -> bool:
    return bool(config.TURNSTILE_SITE_KEY and config.TURNSTILE_SECRET_KEY)


class SessionVerifier:
    async def is_verified(self, session_id: str) -> bool:
        async with get_session() as session:
            row = await session.get(VerifiedSession, session_id)
        if row is None:
            return False
        return row.verified_at > datetime.now(UTC) - timedelta(
            hours=config.VERIFICATION_HOURS
        )

    async def verify(self, session_id: str, token: str, ip: str) -> bool:
        """Checks a Turnstile token with Cloudflare; records a pass."""
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                response = await client.post(
                    SITEVERIFY_URL,
                    data={
                        "secret": config.TURNSTILE_SECRET_KEY,
                        "response": token,
                        "remoteip": ip,
                    },
                )
            passed = bool(response.json().get("success"))
        except Exception:
            # Cloudflare unreachable: not verified. An outage must not
            # turn the check off.
            logger.exception("turnstile verification failed")
            return False
        if not passed:
            return False

        async with get_session() as session:
            statement = insert(VerifiedSession).values(session_id=session_id)
            await session.execute(
                statement.on_conflict_do_update(
                    index_elements=[VerifiedSession.session_id],
                    set_={"verified_at": datetime.now(UTC)},
                )
            )
            await session.commit()
        return True
