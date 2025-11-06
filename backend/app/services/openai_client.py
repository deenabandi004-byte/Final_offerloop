"""
OpenAI client service - email generation and AI operations
"""
from openai import OpenAI, AsyncOpenAI
from app.config import OPENAI_API_KEY

# Initialize OpenAI clients
client = OpenAI(api_key=OPENAI_API_KEY) if OPENAI_API_KEY else None
async_client = AsyncOpenAI(api_key=OPENAI_API_KEY) if OPENAI_API_KEY else None

def get_openai_client():
    """Get the OpenAI client"""
    return client

def get_async_openai_client():
    """Get the async OpenAI client"""
    return async_client

