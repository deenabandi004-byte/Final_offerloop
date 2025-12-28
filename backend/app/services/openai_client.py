"""
OpenAI client service - email generation and AI operations
"""
from openai import OpenAI, AsyncOpenAI
import httpx
from app.config import OPENAI_API_KEY

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

# For async client, create a factory function that creates a new client each time
# This avoids connection pool issues with long-running requests
def create_async_openai_client():
    """Create a new AsyncOpenAI client with proper connection pool settings"""
    if not OPENAI_API_KEY:
        return None
    return AsyncOpenAI(
        api_key=OPENAI_API_KEY,
        timeout=300.0,  # 5 minutes default timeout
        max_retries=2,
        http_client=httpx.AsyncClient(
            timeout=_httpx_timeout,
            limits=_httpx_limits,
        ),
    )

# Create initial async client (but we'll create new ones for long-running requests)
async_client = create_async_openai_client()

def get_openai_client():
    """Get the OpenAI client"""
    return client

def get_async_openai_client():
    """Get the async OpenAI client"""
    return async_client

