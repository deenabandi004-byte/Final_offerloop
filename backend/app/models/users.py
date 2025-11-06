"""
User data models and schemas
"""
from typing import Optional, Dict, Any
from datetime import datetime
from app.models.enums import UserTier


def create_user_data(
    uid: str,
    email: str,
    tier: str = 'free',
    name: Optional[str] = None,
    credits: Optional[int] = None,
    max_credits: Optional[int] = None
) -> Dict[str, Any]:
    """
    Create a new user data structure for Firestore
    
    Args:
        uid: Firebase user ID
        email: User email address
        tier: User tier ('free' or 'pro')
        name: User display name
        credits: Initial credits (defaults based on tier)
        max_credits: Maximum credits (defaults based on tier)
    
    Returns:
        Dictionary with user data structure
    """
    from app.config import TIER_CONFIGS
    
    tier_config = TIER_CONFIGS.get(tier, TIER_CONFIGS['free'])
    default_credits = tier_config.get('credits', 150)
    
    user_data = {
        'uid': uid,
        'email': email,
        'tier': tier,
        'credits': credits if credits is not None else default_credits,
        'maxCredits': max_credits if max_credits is not None else default_credits,
        'createdAt': datetime.now().isoformat(),
        'lastCreditReset': datetime.now().isoformat(),
        'subscriptionStatus': 'active' if tier == 'pro' else None,
    }
    
    if name:
        user_data['name'] = name
    
    return user_data


def update_user_tier_data(tier: str, credits: Optional[int] = None) -> Dict[str, Any]:
    """
    Create update data for tier changes
    
    Args:
        tier: New tier ('free' or 'pro')
        credits: New credits amount (defaults based on tier)
    
    Returns:
        Dictionary with tier update data
    """
    from app.config import TIER_CONFIGS
    
    tier_config = TIER_CONFIGS.get(tier, TIER_CONFIGS['free'])
    default_credits = tier_config.get('credits', 150)
    
    update_data = {
        'tier': tier,
        'credits': credits if credits is not None else default_credits,
        'maxCredits': default_credits,
        'subscriptionStatus': 'active' if tier == 'pro' else None,
        'upgraded_at': datetime.now().isoformat() if tier == 'pro' else None,
        'lastCreditReset': datetime.now().isoformat()
    }
    
    return update_data


def validate_user_tier(tier: str) -> bool:
    """Validate that tier is a valid value"""
    return tier in ['free', 'pro']


def get_default_credits_for_tier(tier: str) -> int:
    """Get default credits for a tier"""
    from app.config import TIER_CONFIGS
    return TIER_CONFIGS.get(tier, TIER_CONFIGS['free']).get('credits', 150)

