"""
Retry utility with exponential backoff for external API calls
"""
import time
import random
from functools import wraps
from typing import Callable, Type, Tuple, Optional
import requests


class RetryableError(Exception):
    """Exception that should trigger a retry"""
    pass


class NonRetryableError(Exception):
    """Exception that should not trigger a retry"""
    pass


def retry_with_backoff(
    max_retries: int = 3,
    initial_delay: float = 1.0,
    max_delay: float = 60.0,
    exponential_base: float = 2.0,
    jitter: bool = True,
    retryable_exceptions: Tuple[Type[Exception], ...] = (
        requests.exceptions.RequestException,
        requests.exceptions.Timeout,
        requests.exceptions.ConnectionError,
    ),
    non_retryable_exceptions: Tuple[Type[Exception], ...] = (
        requests.exceptions.HTTPError,  # 4xx errors usually shouldn't retry
    ),
):
    """
    Decorator to retry a function with exponential backoff.
    
    Args:
        max_retries: Maximum number of retry attempts
        initial_delay: Initial delay in seconds
        max_delay: Maximum delay in seconds
        exponential_base: Base for exponential backoff
        jitter: Add random jitter to prevent thundering herd
        retryable_exceptions: Exceptions that should trigger retry
        non_retryable_exceptions: Exceptions that should not trigger retry
    """
    def decorator(func: Callable):
        @wraps(func)
        def wrapper(*args, **kwargs):
            last_exception = None
            
            for attempt in range(max_retries + 1):
                try:
                    return func(*args, **kwargs)
                except non_retryable_exceptions as e:
                    # Don't retry for non-retryable exceptions
                    print(f"❌ Non-retryable error in {func.__name__}: {e}")
                    raise
                except retryable_exceptions as e:
                    last_exception = e
                    
                    # Check if it's a rate limit error (429)
                    if isinstance(e, requests.exceptions.HTTPError):
                        response = getattr(e, 'response', None)
                        if response and response.status_code == 429:
                            # For rate limits, use longer delay
                            retry_after = response.headers.get('Retry-After')
                            if retry_after:
                                delay = float(retry_after)
                            else:
                                delay = min(initial_delay * (exponential_base ** attempt), max_delay)
                            print(f"⚠️ Rate limit hit in {func.__name__}, waiting {delay}s before retry {attempt + 1}/{max_retries}")
                        else:
                            # For other HTTP errors, don't retry
                            print(f"❌ HTTP error in {func.__name__}: {e}")
                            raise
                    else:
                        # Calculate delay with exponential backoff
                        delay = initial_delay * (exponential_base ** attempt)
                        delay = min(delay, max_delay)
                        
                        # Add jitter to prevent thundering herd
                        if jitter:
                            jitter_amount = delay * 0.1 * random.random()
                            delay += jitter_amount
                    
                    if attempt < max_retries:
                        print(f"⚠️ Error in {func.__name__} (attempt {attempt + 1}/{max_retries + 1}): {e}")
                        print(f"   Retrying in {delay:.2f}s...")
                        time.sleep(delay)
                    else:
                        print(f"❌ Max retries exceeded for {func.__name__}")
                        raise last_exception
                except Exception as e:
                    # For unknown exceptions, check if they're retryable
                    if isinstance(e, retryable_exceptions):
                        last_exception = e
                        delay = min(initial_delay * (exponential_base ** attempt), max_delay)
                        if jitter:
                            delay += delay * 0.1 * random.random()
                        
                        if attempt < max_retries:
                            print(f"⚠️ Error in {func.__name__} (attempt {attempt + 1}/{max_retries + 1}): {e}")
                            print(f"   Retrying in {delay:.2f}s...")
                            time.sleep(delay)
                        else:
                            print(f"❌ Max retries exceeded for {func.__name__}")
                            raise last_exception
                    else:
                        # Unknown exception, don't retry
                        print(f"❌ Unknown error in {func.__name__}: {e}")
                        raise
            
            # Should never reach here, but just in case
            if last_exception:
                raise last_exception
        
        return wrapper
    return decorator


def retry_on_rate_limit(
    max_retries: int = 3,
    initial_delay: float = 5.0,
    max_delay: float = 300.0,  # 5 minutes max for rate limits
):
    """
    Specialized retry decorator for rate limit errors (429).
    Uses longer delays appropriate for rate limit recovery.
    """
    return retry_with_backoff(
        max_retries=max_retries,
        initial_delay=initial_delay,
        max_delay=max_delay,
        exponential_base=2.0,
        jitter=True,
        retryable_exceptions=(
            requests.exceptions.HTTPError,  # Specifically for 429
        ),
    )
