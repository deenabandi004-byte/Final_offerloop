"""
Enums and constants for data models
"""
from enum import Enum


class ContactStatus(Enum):
    """Contact status enumeration"""
    NOT_CONTACTED = "Not Contacted"
    CONTACTED = "Contacted"
    REPLIED = "Replied"
    FOLLOWED_UP = "Followed Up"
    CLOSED = "Closed"


class UserTier(Enum):
    """User tier enumeration"""
    FREE = "free"
    PRO = "pro"
    ELITE = "elite"


class SearchType(Enum):
    """Search type enumeration"""
    METRO = "metro"
    LOCALITY = "locality"
    JOB_LEVELS = "job_levels"

