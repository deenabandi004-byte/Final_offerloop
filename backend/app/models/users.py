"""
User data models and schemas.

Structured profile fields (Phase 1 personalization data layer):
    - school, schoolNormalized      — user's university
    - targetCompanies               — list of company slugs
    - targetIndustries              — list from controlled vocab
    - targetRoleTypes               — list from controlled vocab
    - openToLocations               — list from controlled vocab
    - careerTrack                   — legacy single string (e.g. "Investment Banking")
    - profileConfirmedAt            — ISO timestamp when user confirmed structured fields
    - schemaVersion                 — integer, bumped on schema changes

All new fields are nullable/additive — safe on top of any existing user doc.
Read helpers try structured fields first, fall back to legacy professionalInfo.
"""
import re
from typing import Optional, Dict, Any
from datetime import datetime
from app.models.enums import UserTier


# Current schema version — bump when structured fields change shape
SCHEMA_VERSION = 1


# ---------------------------------------------------------------------------
# Slug normalizers (used as cache keys, company context keys, etc.)
# ---------------------------------------------------------------------------

# Common aliases: variant → canonical slug
_COMPANY_ALIASES: dict[str, str] = {
    "goldman": "goldman-sachs", "gs": "goldman-sachs", "goldman sachs": "goldman-sachs",
    "jpmorgan": "jpmorgan", "jpm": "jpmorgan", "jp morgan": "jpmorgan", "jpmorgan chase": "jpmorgan",
    "morgan stanley": "morgan-stanley", "ms": "morgan-stanley",
    "mckinsey": "mckinsey", "mckinsey & company": "mckinsey", "mckinsey and company": "mckinsey",
    "bain": "bain", "bain & company": "bain", "bain and company": "bain",
    "bcg": "bcg", "boston consulting group": "bcg", "boston consulting": "bcg",
    "deloitte": "deloitte", "deloitte consulting": "deloitte",
    "pwc": "pwc", "pricewaterhousecoopers": "pwc",
    "ey": "ey", "ernst & young": "ey", "ernst and young": "ey",
    "kpmg": "kpmg",
    "google": "google", "alphabet": "google",
    "meta": "meta", "facebook": "meta",
    "amazon": "amazon", "aws": "amazon",
    "apple": "apple",
    "microsoft": "microsoft", "msft": "microsoft",
    "netflix": "netflix",
    "tesla": "tesla",
    "uber": "uber",
    "airbnb": "airbnb",
    "salesforce": "salesforce",
    "blackstone": "blackstone",
    "kkr": "kkr",
    "carlyle": "carlyle", "carlyle group": "carlyle",
    "apollo": "apollo", "apollo global": "apollo",
    "citadel": "citadel",
    "two sigma": "two-sigma",
    "jane street": "jane-street",
    "bridgewater": "bridgewater",
    "lazard": "lazard",
    "evercore": "evercore",
    "centerview": "centerview",
    "moelis": "moelis",
    "pjt partners": "pjt-partners", "pjt": "pjt-partners",
    "bofa": "bank-of-america", "bank of america": "bank-of-america", "bofa securities": "bank-of-america",
    "citi": "citi", "citigroup": "citi", "citibank": "citi",
    "barclays": "barclays",
    "deutsche bank": "deutsche-bank", "db": "deutsche-bank",
    "ubs": "ubs",
    "credit suisse": "credit-suisse", "cs": "credit-suisse",
    "wells fargo": "wells-fargo",
    "accenture": "accenture",
    "oliver wyman": "oliver-wyman",
    "lek": "lek", "l.e.k.": "lek", "lek consulting": "lek",
    "a.t. kearney": "kearney", "kearney": "kearney",
}


def normalize_company(name: str) -> str:
    """
    Normalize a company name to a canonical slug.
    Used as Firestore key for companyContexts, alumni cache, etc.

    Examples:
        "Goldman Sachs" → "goldman-sachs"
        "GS"            → "goldman-sachs"
        "My Startup"    → "my-startup"
    """
    if not name:
        return ""
    lower = name.strip().lower()
    # Check alias map first
    if lower in _COMPANY_ALIASES:
        return _COMPANY_ALIASES[lower]
    # Fall back to generic slugify
    slug = re.sub(r"[^a-z0-9]+", "-", lower).strip("-")
    return slug


def normalize_school(name: str) -> str:
    """
    Normalize a university name to a canonical slug.
    Used as Firestore key for alumni cache.

    Examples:
        "University of Southern California" → "usc"
        "USC"                               → "usc"
        "New York University"               → "nyu"
    """
    if not name:
        return ""
    lower = name.strip().lower()
    # Check the shorthand map (maps full → abbreviation)
    from app.utils.users import UNIVERSITY_SHORTCUTS
    for full, short in UNIVERSITY_SHORTCUTS.items():
        if full.lower() == lower or short.lower() == lower:
            return short.lower()
    # Fall back to generic slugify
    slug = re.sub(r"[^a-z0-9]+", "-", lower).strip("-")
    return slug


# ---------------------------------------------------------------------------
# User document creation
# ---------------------------------------------------------------------------

def create_user_data(
    uid: str,
    email: str,
    tier: str = 'free',
    name: Optional[str] = None,
    credits: Optional[int] = None,
    max_credits: Optional[int] = None
) -> Dict[str, Any]:
    """
    Create a new user data structure for Firestore.
    Emits schemaVersion on every new doc.
    """
    from app.config import TIER_CONFIGS

    tier_config = TIER_CONFIGS.get(tier, TIER_CONFIGS['free'])
    default_credits = tier_config.get('credits', 300)

    user_data = {
        'uid': uid,
        'email': email,
        'subscriptionTier': tier,  # Use subscriptionTier for consistency
        'tier': tier,  # Keep tier for backward compatibility
        'credits': credits if credits is not None else default_credits,
        'maxCredits': max_credits if max_credits is not None else default_credits,
        'createdAt': datetime.now().isoformat(),
        'lastCreditReset': datetime.now().isoformat(),
        'lastUsageReset': datetime.now().isoformat(),  # Track usage reset date
        'subscriptionStatus': 'active' if tier in ['pro', 'elite'] else None,
        # Usage tracking fields
        'alumniSearchesUsed': 0,
        'coffeeChatPrepsUsed': 0,
        'interviewPrepsUsed': 0,
        # Personalization schema version
        'schemaVersion': SCHEMA_VERSION,
    }

    if name:
        user_data['name'] = name

    return user_data


# ---------------------------------------------------------------------------
# Structured profile read helpers
# ---------------------------------------------------------------------------

def get_structured_school(user_data: dict) -> str:
    """Read school from structured fields first, fall back to legacy."""
    return (
        user_data.get("school")
        or (user_data.get("academics") or {}).get("university")
        or ((user_data.get("resumeParsed") or {}).get("education") or {}).get("university")
        or (user_data.get("professionalInfo") or {}).get("university")
        or user_data.get("university")
        or ""
    )


def get_structured_career_track(user_data: dict) -> str:
    """Read career track from structured fields first, fall back to legacy."""
    return (
        user_data.get("careerTrack")
        or (user_data.get("goals") or {}).get("careerTrack")
        or (user_data.get("professionalInfo") or {}).get("careerTrack")
        or ""
    )


def get_structured_target_companies(user_data: dict) -> list[str]:
    """Read target companies, fall back to dreamCompanies."""
    tc = user_data.get("targetCompanies")
    if tc and isinstance(tc, list):
        return tc
    # Fall back to dreamCompanies (legacy)
    dc = (user_data.get("goals") or {}).get("dreamCompanies") or user_data.get("dreamCompanies") or []
    if isinstance(dc, str):
        dc = [c.strip() for c in dc.split(",") if c.strip()]
    return dc


def get_structured_target_industries(user_data: dict) -> list[str]:
    """Read target industries from structured fields."""
    ti = user_data.get("targetIndustries")
    if ti and isinstance(ti, list):
        return ti
    # Fall back to career interests
    interests = (user_data.get("location") or {}).get("careerInterests") or []
    if isinstance(interests, list):
        return interests
    return []


def get_field_provenance(user_data: dict, field: str) -> str:
    """
    Return the provenance of a structured field:
    'explicit' if the user confirmed it, 'inferred_from_resume_backfill' if
    it was auto-populated, or 'unknown'.
    """
    provenance = user_data.get("fieldProvenance") or {}
    return provenance.get(field, "unknown")


def update_user_tier_data(tier: str, credits: Optional[int] = None) -> Dict[str, Any]:
    """
    Create update data for tier changes
    
    Args:
        tier: New tier ('free', 'pro', or 'elite')
        credits: New credits amount (defaults based on tier)
    
    Returns:
        Dictionary with tier update data
    """
    from app.config import TIER_CONFIGS
    
    tier_config = TIER_CONFIGS.get(tier, TIER_CONFIGS['free'])
    default_credits = tier_config.get('credits', 300)
    
    update_data = {
        'subscriptionTier': tier,
        'tier': tier,  # Keep for backward compatibility
        'credits': credits if credits is not None else default_credits,
        'maxCredits': default_credits,
        'subscriptionStatus': 'active' if tier in ['pro', 'elite'] else None,
        'upgraded_at': datetime.now().isoformat() if tier in ['pro', 'elite'] else None,
        'lastCreditReset': datetime.now().isoformat()
    }
    
    return update_data


def validate_user_tier(tier: str) -> bool:
    """Validate that tier is a valid value"""
    return tier in ['free', 'pro', 'elite']


def get_default_credits_for_tier(tier: str) -> int:
    """Get default credits for a tier"""
    from app.config import TIER_CONFIGS
    return TIER_CONFIGS.get(tier, TIER_CONFIGS['free']).get('credits', 300)

