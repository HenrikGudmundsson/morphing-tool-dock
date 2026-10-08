import os

from dotenv import load_dotenv

load_dotenv()

ANTHROPIC_API_KEY = os.environ["ANTHROPIC_API_KEY"]
DATABASE_URL = os.environ["DATABASE_URL"]


def _int(name: str, default: int) -> int:
    return int(os.environ.get(name, default))


# --- Usage limits --------------------------------------------------------
# This service is called by public demos, so every way a caller could run
# up the model bill is bounded. Defaults suit a low-traffic demo; override
# any of them through the environment. See limits.py for how they apply.

# What one question may cost.
MAX_QUERY_CHARS = _int("MAX_QUERY_CHARS", 400)
MAX_REPLY_TOKENS = _int("MAX_REPLY_TOKENS", 300)
# Model calls one question may trigger (one normally; one more for a retry).
MAX_MODEL_REQUESTS = _int("MAX_MODEL_REQUESTS", 2)
# How many earlier exchanges are sent along with a new question.
HISTORY_TURNS = _int("HISTORY_TURNS", 6)

# How many questions are accepted.
LIMIT_PER_IP_PER_HOUR = _int("LIMIT_PER_IP_PER_HOUR", 20)
LIMIT_PER_SESSION_PER_DAY = _int("LIMIT_PER_SESSION_PER_DAY", 30)
# Tokens (input + output) across all callers per UTC day. A question costs
# roughly 1,000-2,000, so this is a few hundred questions.
DAILY_TOKEN_BUDGET = _int("DAILY_TOKEN_BUDGET", 500_000)

# --- Human verification (Cloudflare Turnstile) ----------------------------
# Optional. When both keys are set, a session has to pass a Turnstile check
# once before its questions are answered; see verification.py. Unset (local
# development, branch deploys) nothing is asked for.
TURNSTILE_SITE_KEY = os.environ.get("TURNSTILE_SITE_KEY") or None
TURNSTILE_SECRET_KEY = os.environ.get("TURNSTILE_SECRET_KEY") or None
# How long a passed check keeps a session verified.
VERIFICATION_HOURS = _int("VERIFICATION_HOURS", 24)
