"""
Authentication services - credit management only
(require_firebase_auth is in extensions.py to avoid circular dependencies)
"""
from datetime import datetime
from firebase_admin import firestore
from app.extensions import get_db
from app.config import TIER_CONFIGS


def _parse_datetime(date_value):
    """Helper to parse datetime from various formats"""
    if not date_value:
        return None
    
    if hasattr(date_value, 'timestamp'):
        return datetime.fromtimestamp(date_value.timestamp())
    elif isinstance(date_value, str):
        try:
            return datetime.fromisoformat(date_value.replace('Z', '+00:00'))
        except (ValueError, AttributeError):
            try:
                from dateutil import parser  # type: ignore
                return parser.parse(date_value)
            except ImportError:
                return datetime.fromisoformat(date_value.replace('Z', ''))
    return None


def check_and_reset_credits(user_ref, user_data):
    """Check if 30 days have passed and reset credits if needed"""
    try:
        last_reset = _parse_datetime(user_data.get('lastCreditReset'))
        if not last_reset:
            # If no reset date, set it to now
            user_ref.update({'lastCreditReset': datetime.now().isoformat()})
            return user_data.get('credits', 0)
        
        # Check if 30 days have passed
        days_since_reset = (datetime.now() - last_reset).days
        
        if days_since_reset >= 30:
            # Reset credits
            tier = user_data.get('subscriptionTier') or user_data.get('tier', 'free')
            max_credits = TIER_CONFIGS[tier]['credits']
            
            user_ref.update({
                'credits': max_credits,
                'lastCreditReset': datetime.now().isoformat()
            })
            
            print(f"✅ Credits reset for user {user_data.get('email')} - {max_credits} credits restored")
            return max_credits
        
        return user_data.get('credits', 0)
        
    except Exception as e:
        print(f"Error checking credit reset: {e}")
        return user_data.get('credits', 0)


def check_and_reset_usage(user_ref, user_data):
    """Check if a month has passed and reset usage counters if needed (Pro/Elite only)"""
    try:
        tier = user_data.get('subscriptionTier') or user_data.get('tier', 'free')
        
        # Free tier limits are LIFETIME - never reset
        if tier == 'free':
            return
        
        last_usage_reset = _parse_datetime(user_data.get('lastUsageReset'))
        now = datetime.now()
        
        # If no reset date, set it to now
        if not last_usage_reset:
            user_ref.update({'lastUsageReset': now.isoformat()})
            return
        
        # Check if a month has passed (approximately 30 days)
        days_since_reset = (now - last_usage_reset).days
        
        if days_since_reset >= 30:
            # Reset usage counters (only for Pro/Elite)
            user_ref.update({
                'alumniSearchesUsed': 0,
                'coffeeChatPrepsUsed': 0,
                'interviewPrepsUsed': 0,
                'lastUsageReset': now.isoformat()
            })
            print(f"✅ Usage counters reset for user {user_data.get('email')} ({tier} tier)")
        
    except Exception as e:
        print(f"Error checking usage reset: {e}")


def can_access_feature(tier: str, feature: str, user_data: dict, tier_config: dict) -> tuple[bool, str]:
    """
    Check if user can access a feature based on tier and usage limits
    
    Returns:
        Tuple of (allowed: bool, reason: str)
    """
    # Feature access based on tier
    feature_map = {
        'firm_search': 'firm_search',
        'smart_filters': 'smart_filters',
        'bulk_drafting': 'bulk_drafting',
        'export': 'export_enabled',
        'priority_queue': 'priority_queue',
        'personalized_templates': 'personalized_templates',
        'weekly_insights': 'weekly_insights',
        'early_access': 'early_access',
    }
    
    # Check tier-based features
    if feature in feature_map:
        config_key = feature_map[feature]
        if not tier_config.get(config_key, False):
            required_tier = 'pro' if feature in ['firm_search', 'smart_filters', 'bulk_drafting', 'export'] else 'elite'
            return False, f'This feature requires {required_tier} tier'
        return True, 'allowed'
    
    # Check usage-based features
    usage_map = {
        'alumni_search': ('alumniSearchesUsed', 'alumni_searches'),
        'coffee_chat_prep': ('coffeeChatPrepsUsed', 'coffee_chat_preps'),
        'interview_prep': ('interviewPrepsUsed', 'interview_preps'),
    }
    
    if feature in usage_map:
        used_field, limit_key = usage_map[feature]
        used = user_data.get(used_field, 0)
        limit = tier_config.get(limit_key, 0)
        
        if limit == 'unlimited':
            return True, 'allowed'
        
        if used >= limit:
            return False, f'Monthly limit reached ({limit} uses)'
        
        return True, 'allowed'
    
    return True, 'allowed'  # Default: allow if not specifically restricted


def deduct_credits_atomic(user_id: str, amount: int, operation_name: str = "operation") -> tuple[bool, int]:
    """
    Atomically deduct credits from user account using Firestore transaction.
    Prevents race conditions when multiple requests try to deduct credits simultaneously.
    
    Args:
        user_id: Firebase user ID
        amount: Number of credits to deduct
        operation_name: Name of operation for logging
    
    Returns:
        Tuple of (success: bool, remaining_credits: int)
        If success is False, remaining_credits is the current balance
    """
    db = get_db()
    user_ref = db.collection('users').document(user_id)
    
    @firestore.transactional
    def deduct_in_transaction(transaction):
        """Transaction function to atomically check and deduct credits"""
        user_doc = user_ref.get(transaction=transaction)
        
        if not user_doc.exists:
            print(f"❌ User {user_id} not found for credit deduction")
            return False, 0
        
        user_data = user_doc.to_dict()
        current_credits = check_and_reset_credits(user_ref, user_data)
        
        if current_credits < amount:
            print(f"❌ Insufficient credits for {operation_name}: need {amount}, have {current_credits}")
            return False, current_credits
        
        # Deduct credits atomically
        new_credits = current_credits - amount
        transaction.update(user_ref, {
            'credits': new_credits,
            'lastCreditUpdate': datetime.now().isoformat()
        })
        
        print(f"✅ Deducted {amount} credits for {operation_name}: {current_credits} -> {new_credits}")
        return True, new_credits
    
    try:
        transaction = db.transaction()
        success, credits = deduct_in_transaction(transaction)
        return success, credits
    except Exception as e:
        print(f"❌ Error in atomic credit deduction: {e}")
        # Fallback to non-transactional (less safe but won't crash)
        try:
            user_doc = user_ref.get()
            if user_doc.exists:
                user_data = user_doc.to_dict()
                current_credits = check_and_reset_credits(user_ref, user_data)
                return False, current_credits
        except:
            pass
        return False, 0
