"""
Models package - data models, schemas, and normalization functions
"""
from app.models.contact import normalize_contact
from app.models.users import (
    create_user_data,
    update_user_tier_data,
    validate_user_tier,
    get_default_credits_for_tier
)
from app.models.coffee_chat_prep import (
    create_coffee_chat_prep_data,
    update_coffee_chat_prep_status,
    validate_prep_status,
    format_coffee_chat_prep_response
)
from app.models.enums import ContactStatus, UserTier, SearchType

__all__ = [
    # Contact models
    'normalize_contact',
    # User models
    'create_user_data',
    'update_user_tier_data',
    'validate_user_tier',
    'get_default_credits_for_tier',
    # Coffee chat prep models
    'create_coffee_chat_prep_data',
    'update_coffee_chat_prep_status',
    'validate_prep_status',
    'format_coffee_chat_prep_response',
    # Enums
    'ContactStatus',
    'UserTier',
    'SearchType'
]

