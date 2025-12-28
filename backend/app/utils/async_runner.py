"""
Async runner utility for Flask sync routes.
Safely runs async coroutines in a dedicated event loop within a thread pool.
This prevents nested event loop conflicts when Flask routes call async service methods.
"""
from __future__ import annotations

import asyncio
import concurrent.futures
from typing import Any, Coroutine, Optional
from functools import wraps


_thread_pool = concurrent.futures.ThreadPoolExecutor(
    max_workers=10,
    thread_name_prefix="async_runner"
)


def run_async(coro: Coroutine, timeout: Optional[float] = None) -> Any:
    """
    Run an async coroutine in a dedicated event loop within a thread pool.
    
    This eliminates nested asyncio.run() conflicts and CancelledError issues
    when Flask sync routes call async service methods.
    
    Args:
        coro: The coroutine to run
        timeout: Optional timeout in seconds. If None, no timeout is applied.
        
    Returns:
        The result of the coroutine
        
    Raises:
        asyncio.TimeoutError: If timeout is exceeded
        Exception: Any exception raised by the coroutine
    """
    def run_in_thread():
        # Create a new event loop for this thread
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            if timeout is not None:
                return loop.run_until_complete(
                    asyncio.wait_for(coro, timeout=timeout)
                )
            else:
                return loop.run_until_complete(coro)
        finally:
            loop.close()
    
    # Submit to thread pool and wait for result
    future = _thread_pool.submit(run_in_thread)
    return future.result(timeout=timeout + 5.0 if timeout else None)  # Add buffer for thread overhead

