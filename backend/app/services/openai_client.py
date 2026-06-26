"""
OpenAI and Anthropic client service - email generation and AI operations
"""
import logging
import time

from openai import OpenAI, AsyncOpenAI
import httpx
from backend.app.config import OPENAI_API_KEY, CLAUDE_API_KEY

logger = logging.getLogger("openai_client")


# ---------------------------------------------------------------------------
# Auto-metering
#
# Every caller resolves to one of the singletons built below (either via the
# get_*_client() getters or `from openai_client import client`). Wrapping the
# `.create` boundary once here means all ~50 call sites get token + cost
# logging into the `provider_calls` collection with zero per-site edits.
#
# Perplexity builds its OWN OpenAI(base_url=...) client elsewhere, so it is not
# touched here and never double-counted as OpenAI spend.
#
# Streamed responses carry no usage object, so they log nothing (Scout, which
# streams, has its own per-turn metrics in scout/metrics.py). Everything is
# try/except'd: metering must never break a model call.
# ---------------------------------------------------------------------------


def _install_sync_meter(c, provider: str):
    """Patch a sync OpenAI/Anthropic client's create() to log token usage."""
    if c is None:
        return c
    try:
        if provider == "anthropic":
            target = c.messages
        else:
            target = c.chat.completions
        original = target.create

        def metered_create(*args, **kwargs):
            t0 = time.time()
            resp = original(*args, **kwargs)
            try:
                from app.services.metering import log_llm_usage
                log_llm_usage(
                    provider,
                    kwargs.get("model", ""),
                    getattr(resp, "usage", None),
                    latency_ms=int((time.time() - t0) * 1000),
                )
            except Exception:  # noqa: BLE001
                pass
            return resp

        target.create = metered_create

        # client.with_options(...)/copy() build a fresh client whose resources
        # bypass the patch above; re-install the meter on any derived client.
        if hasattr(c, "copy"):
            orig_copy = c.copy

            def metered_copy(*args, **kwargs):
                return _install_sync_meter(orig_copy(*args, **kwargs), provider)

            c.copy = metered_copy
            c.with_options = metered_copy
    except Exception as e:  # noqa: BLE001
        logger.warning("Could not install %s sync meter: %s", provider, e)
    return c


def _install_async_meter(c, provider: str):
    """Patch an async OpenAI/Anthropic client's create() to log token usage."""
    if c is None:
        return c
    try:
        if provider == "anthropic":
            target = c.messages
        else:
            target = c.chat.completions
        original = target.create

        async def metered_create(*args, **kwargs):
            t0 = time.time()
            resp = await original(*args, **kwargs)
            try:
                from app.services.metering import log_llm_usage
                log_llm_usage(
                    provider,
                    kwargs.get("model", ""),
                    getattr(resp, "usage", None),
                    latency_ms=int((time.time() - t0) * 1000),
                )
            except Exception:  # noqa: BLE001
                pass
            return resp

        target.create = metered_create

        # with_options(...)/copy() build a fresh client; re-meter the derived one.
        if hasattr(c, "copy"):
            orig_copy = c.copy

            def metered_copy(*args, **kwargs):
                return _install_async_meter(orig_copy(*args, **kwargs), provider)

            c.copy = metered_copy
            c.with_options = metered_copy
    except Exception as e:  # noqa: BLE001
        logger.warning("Could not install %s async meter: %s", provider, e)
    return c

try:
    import anthropic
    _anthropic_client = _install_sync_meter(
        anthropic.Anthropic(api_key=CLAUDE_API_KEY) if CLAUDE_API_KEY else None, "anthropic"
    )
    _anthropic_async_client = _install_async_meter(
        anthropic.AsyncAnthropic(api_key=CLAUDE_API_KEY) if CLAUDE_API_KEY else None, "anthropic"
    )
except ImportError:
    _anthropic_client = None
    _anthropic_async_client = None

# Create custom HTTP client configurations for better connection pool handling
_httpx_timeout = httpx.Timeout(
    connect=60.0,   # Time to establish connection (increased from 30s)
    read=300.0,     # Time to read response (5 minutes)
    write=60.0,    # Time to write request
    pool=60.0,     # Time to get connection from pool (increased from 30s - this is the key fix)
)

_httpx_limits = httpx.Limits(
    max_keepalive_connections=50,  # Increased from 20
    max_connections=200,            # Increased from 100
    keepalive_expiry=60.0,          # Increased from 30s
)

# Initialize OpenAI clients with increased timeout settings
# Default timeout is 60s, but we increase it for long-running operations
client = OpenAI(
    api_key=OPENAI_API_KEY,
    timeout=300.0,  # 5 minutes default timeout (increased from 180s)
    max_retries=2,
    http_client=httpx.Client(
        timeout=_httpx_timeout,
        limits=_httpx_limits,
    ) if OPENAI_API_KEY else None
) if OPENAI_API_KEY else None
client = _install_sync_meter(client, "openai")

# For async client, create a factory function that creates a new client each time
# This avoids connection pool issues with long-running requests
def create_async_openai_client():
    """Create a new AsyncOpenAI client with proper connection pool settings"""
    if not OPENAI_API_KEY:
        return None
    return _install_async_meter(AsyncOpenAI(
        api_key=OPENAI_API_KEY,
        timeout=300.0,  # 5 minutes default timeout
        max_retries=2,
        http_client=httpx.AsyncClient(
            timeout=_httpx_timeout,
            limits=_httpx_limits,
        ),
    ), "openai")

# Create initial async client (but we'll create new ones for long-running requests)
async_client = create_async_openai_client()

def get_openai_client():
    """Get the OpenAI client"""
    return client

def get_async_openai_client():
    """Get the async OpenAI client"""
    return async_client

def get_anthropic_client():
    """Get the Anthropic client"""
    return _anthropic_client

def get_async_anthropic_client():
    """Get the async Anthropic client for streaming"""
    return _anthropic_async_client

