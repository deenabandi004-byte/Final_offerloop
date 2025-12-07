"""
Authentication services - credit management only
(require_firebase_auth is in extensions.py to avoid circular dependencies)
"""
from datetime import datetime
from firebase_admin import firestore
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
