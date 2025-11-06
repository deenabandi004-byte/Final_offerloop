"""
Authentication services - credit management only
(require_firebase_auth is in extensions.py to avoid circular dependencies)
"""
from datetime import datetime
from app.extensions import get_db
from app.config import TIER_CONFIGS


def check_and_reset_credits(user_ref, user_data):
    """Check if 30 days have passed and reset credits if needed"""
    try:
        last_reset = user_data.get('lastCreditReset')
        if not last_reset:
            # If no reset date, set it to now
            user_ref.update({'lastCreditReset': datetime.now()})
            return user_data.get('credits', 0)
        
        # Convert Firestore timestamp to datetime if needed
        if hasattr(last_reset, 'timestamp'):
            last_reset = datetime.fromtimestamp(last_reset.timestamp())
        elif isinstance(last_reset, str):
            # Try parsing with datetime first, fallback to dateutil
            try:
                last_reset = datetime.fromisoformat(last_reset.replace('Z', '+00:00'))
            except (ValueError, AttributeError):
                # Fallback: try dateutil if available
                try:
                    from dateutil import parser  # type: ignore
                    last_reset = parser.parse(last_reset)
                except ImportError:
                    # If dateutil not available, try basic parsing
                    print(f"Warning: dateutil not available, using basic date parsing")
                    # Assume ISO format or common format
                    last_reset = datetime.fromisoformat(last_reset.replace('Z', ''))
        
        # Check if 30 days have passed
        days_since_reset = (datetime.now() - last_reset).days
        
        if days_since_reset >= 30:
            # Reset credits
            tier = user_data.get('tier', 'free')
            max_credits = TIER_CONFIGS[tier]['credits']
            
            user_ref.update({
                'credits': max_credits,
                'lastCreditReset': datetime.now()
            })
            
            print(f"✅ Credits reset for user {user_data.get('email')} - {max_credits} credits restored")
            return max_credits
        
        return user_data.get('credits', 0)
        
    except Exception as e:
        print(f"Error checking credit reset: {e}")
        return user_data.get('credits', 0)
