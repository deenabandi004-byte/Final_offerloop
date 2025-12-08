"""
Caching service for interview prep - reduces redundant API calls and processing
"""
import hashlib
import json
from datetime import datetime, timedelta
from typing import Optional, Any, Dict
from firebase_admin import firestore


# Simple in-memory cache with TTL (fallback if Redis unavailable)
_memory_cache = {}
_cache_timestamps = {}


def _generate_cache_key(prefix: str, *args) -> str:
    """Generate a cache key from prefix and arguments"""
    key_string = f"{prefix}:{':'.join(str(arg) for arg in args)}"
    return hashlib.md5(key_string.encode()).hexdigest()


def get_from_cache(cache_key: str, ttl_seconds: int = 86400) -> Optional[Any]:
    """
    Get value from cache (memory cache as fallback)
    
    Args:
        cache_key: Cache key
        ttl_seconds: Time to live in seconds (default: 1 day)
    
    Returns:
        Cached value or None if not found/expired
    """
    # Check memory cache first
    if cache_key in _memory_cache:
        timestamp = _cache_timestamps.get(cache_key)
        if timestamp and (datetime.now() - timestamp).total_seconds() < ttl_seconds:
            return _memory_cache[cache_key]
        else:
            # Expired - remove from cache
            _memory_cache.pop(cache_key, None)
            _cache_timestamps.pop(cache_key, None)
    
    return None


def set_in_cache(cache_key: str, value: Any, ttl_seconds: int = 86400) -> None:
    """
    Set value in cache (memory cache)
    
    Args:
        cache_key: Cache key
        value: Value to cache
        ttl_seconds: Time to live in seconds
    """
    _memory_cache[cache_key] = value
    _cache_timestamps[cache_key] = datetime.now()


def get_job_posting_cache(job_posting_url: str) -> Optional[Dict]:
    """Get cached parsed job posting"""
    cache_key = _generate_cache_key("job_posting", job_posting_url)
    return get_from_cache(cache_key, ttl_seconds=604800)  # 7 days


def set_job_posting_cache(job_posting_url: str, job_details: Dict) -> None:
    """Cache parsed job posting"""
    cache_key = _generate_cache_key("job_posting", job_posting_url)
    set_in_cache(cache_key, job_details, ttl_seconds=604800)  # 7 days


def get_reddit_cache(company_name: str, job_title: str, role_category: str = "") -> Optional[list]:
    """Get cached Reddit posts"""
    cache_key = _generate_cache_key("reddit", company_name.lower(), job_title.lower(), role_category)
    return get_from_cache(cache_key, ttl_seconds=86400)  # 1 day


def set_reddit_cache(company_name: str, job_title: str, role_category: str, posts: list) -> None:
    """Cache Reddit posts"""
    cache_key = _generate_cache_key("reddit", company_name.lower(), job_title.lower(), role_category)
    set_in_cache(cache_key, posts, ttl_seconds=86400)  # 1 day


def get_insights_cache(company_name: str, job_title: str, posts_hash: str) -> Optional[Dict]:
    """Get cached OpenAI insights"""
    cache_key = _generate_cache_key("insights", company_name.lower(), job_title.lower(), posts_hash)
    return get_from_cache(cache_key, ttl_seconds=604800)  # 7 days


def set_insights_cache(company_name: str, job_title: str, posts_hash: str, insights: Dict) -> None:
    """Cache OpenAI insights"""
    cache_key = _generate_cache_key("insights", company_name.lower(), job_title.lower(), posts_hash)
    set_in_cache(cache_key, insights, ttl_seconds=604800)  # 7 days


def _hash_posts(posts: list) -> str:
    """Generate hash of posts list for cache key"""
    if not posts:
        return "empty"
    # Use post IDs to create hash
    post_ids = sorted([str(p.get('post_id', '')) for p in posts[:20]])  # Use top 20 for hash
    return hashlib.md5(''.join(post_ids).encode()).hexdigest()[:16]


def get_cached_insights_for_posts(company_name: str, job_title: str, posts: list) -> Optional[Dict]:
    """Get cached insights based on posts hash"""
    posts_hash = _hash_posts(posts)
    return get_insights_cache(company_name, job_title, posts_hash)


def set_cached_insights_for_posts(company_name: str, job_title: str, posts: list, insights: Dict) -> None:
    """Cache insights based on posts hash"""
    posts_hash = _hash_posts(posts)
    set_insights_cache(company_name, job_title, posts_hash, insights)


# ========================================
# Contact Search Caching
# ========================================

def get_pdl_search_cache(job_title: str, company: str, location: str, college_alumni: str = None) -> Optional[list]:
    """
    Get cached PDL search results
    
    Args:
        job_title: Job title searched
        company: Company name (can be empty)
        location: Location searched
        college_alumni: College alumni filter (optional)
    
    Returns:
        Cached list of contacts or None
    """
    cache_key = _generate_cache_key(
        "pdl_search",
        job_title.lower().strip(),
        (company or "").lower().strip(),
        location.lower().strip(),
        (college_alumni or "").lower().strip()
    )
    return get_from_cache(cache_key, ttl_seconds=3600)  # 1 hour cache


def set_pdl_search_cache(job_title: str, company: str, location: str, contacts: list, college_alumni: str = None) -> None:
    """
    Cache PDL search results
    
    Args:
        job_title: Job title searched
        company: Company name (can be empty)
        location: Location searched
        contacts: List of contacts to cache
        college_alumni: College alumni filter (optional)
    """
    cache_key = _generate_cache_key(
        "pdl_search",
        job_title.lower().strip(),
        (company or "").lower().strip(),
        location.lower().strip(),
        (college_alumni or "").lower().strip()
    )
    set_in_cache(cache_key, contacts, ttl_seconds=3600)  # 1 hour cache


def get_exclusion_list_cache(user_id: str) -> Optional[set]:
    """
    Get cached exclusion list for a user
    
    Args:
        user_id: Firebase user ID
    
    Returns:
        Cached set of exclusion keys or None
    """
    cache_key = _generate_cache_key("exclusion_list", user_id)
    cached = get_from_cache(cache_key, ttl_seconds=300)  # 5 minute cache
    if cached is not None:
        # Convert list back to set
        return set(cached) if isinstance(cached, list) else cached
    return None


def set_exclusion_list_cache(user_id: str, exclusion_set: set) -> None:
    """
    Cache exclusion list for a user
    
    Args:
        user_id: Firebase user ID
        exclusion_set: Set of exclusion keys to cache
    """
    cache_key = _generate_cache_key("exclusion_list", user_id)
    # Convert set to list for JSON serialization
    set_in_cache(cache_key, list(exclusion_set), ttl_seconds=300)  # 5 minute cache


def invalidate_exclusion_list_cache(user_id: str) -> None:
    """
    Invalidate exclusion list cache when contacts are added/removed
    
    Args:
        user_id: Firebase user ID
    """
    cache_key = _generate_cache_key("exclusion_list", user_id)
    _memory_cache.pop(cache_key, None)
    _cache_timestamps.pop(cache_key, None)
