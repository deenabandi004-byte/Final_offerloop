"""
Progress tracking for long-running searches (firm search, contact search, etc.)
Uses in-memory storage with TTL to track search progress.
"""
import time
from typing import Dict, Optional, Any
from datetime import datetime, timedelta

# In-memory progress store: {search_id: {current, total, step, timestamp, ...}}
_search_progress: Dict[str, Dict[str, Any]] = {}

# TTL for progress entries (5 minutes)
PROGRESS_TTL_SECONDS = 300


def create_search_progress(search_id: str, total: int, step: str = "Starting search...") -> None:
    """Initialize progress tracking for a search."""
    _search_progress[search_id] = {
        "current": 0,
        "total": total,
        "step": step,
        "timestamp": datetime.now(),
        "status": "in_progress"
    }


def update_search_progress(search_id: str, current: int, step: Optional[str] = None) -> None:
    """Update progress for a search."""
    if search_id not in _search_progress:
        return
    
    _search_progress[search_id]["current"] = current
    _search_progress[search_id]["timestamp"] = datetime.now()
    
    if step:
        _search_progress[search_id]["step"] = step


def complete_search_progress(search_id: str, step: str = "Complete") -> None:
    """Mark a search as complete."""
    if search_id not in _search_progress:
        return
    
    progress = _search_progress[search_id]
    progress["current"] = progress["total"]
    progress["step"] = step
    progress["status"] = "completed"
    progress["timestamp"] = datetime.now()


def fail_search_progress(search_id: str, error: str) -> None:
    """Mark a search as failed."""
    if search_id not in _search_progress:
        return
    
    _search_progress[search_id].update({
        "status": "failed",
        "error": error,
        "timestamp": datetime.now()
    })


def get_search_progress(search_id: str) -> Optional[Dict[str, Any]]:
    """Get current progress for a search."""
    if search_id not in _search_progress:
        return None
    
    progress = _search_progress[search_id].copy()
    
    # Check if expired
    timestamp = progress.get("timestamp")
    if timestamp and isinstance(timestamp, datetime):
        age = (datetime.now() - timestamp).total_seconds()
        if age > PROGRESS_TTL_SECONDS:
            # Expired - remove and return None
            _search_progress.pop(search_id, None)
            return None
    
    # Convert datetime to ISO string for JSON serialization
    if isinstance(progress.get("timestamp"), datetime):
        progress["timestamp"] = progress["timestamp"].isoformat()
    
    return progress


def cleanup_expired_progress() -> int:
    """Remove expired progress entries. Returns count of removed entries."""
    now = datetime.now()
    expired_ids = []
    
    for search_id, progress in _search_progress.items():
        timestamp = progress.get("timestamp")
        if timestamp and isinstance(timestamp, datetime):
            age = (now - timestamp).total_seconds()
            if age > PROGRESS_TTL_SECONDS:
                expired_ids.append(search_id)
    
    for search_id in expired_ids:
        _search_progress.pop(search_id, None)
    
    return len(expired_ids)

