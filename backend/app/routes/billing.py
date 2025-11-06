"""
Billing and tier management routes
"""
import stripe
from datetime import datetime
from flask import Blueprint, request, jsonify

from app.extensions import require_firebase_auth
from app.services.auth import check_and_reset_credits
from app.services.stripe_client import create_checkout_session, handle_stripe_webhook, create_portal_session, handle_checkout_completed
from app.config import TIER_CONFIGS
from app.extensions import get_db

billing_bp = Blueprint('billing', __name__, url_prefix='/api')


@billing_bp.route('/tier-info')
def get_tier_info():
    """Get information about available tiers"""
    return jsonify({
        'tiers': {
            'free': {
                'name': 'Free',
                'max_contacts': TIER_CONFIGS['free']['max_contacts'],
                'credits': TIER_CONFIGS['free']['credits'],
                'time_saved_minutes': TIER_CONFIGS['free']['time_saved_minutes'],
                'description': TIER_CONFIGS['free']['description'],
                'features': [
                    f"{TIER_CONFIGS['free']['credits']} credits",
                    f"Estimated time saved: {TIER_CONFIGS['free']['time_saved_minutes']} minutes",
                    "Interesting personalized emails",
                    "Mutual interest detection",
                    "Company-specific conversation starters",
                    "Try out platform risk free"
                ]
            },
            'pro': {
                'name': 'Pro',
                'max_contacts': TIER_CONFIGS['pro']['max_contacts'],
                'credits': TIER_CONFIGS['pro']['credits'],
                'time_saved_minutes': TIER_CONFIGS['pro']['time_saved_minutes'],
                'description': TIER_CONFIGS['pro']['description'],
                'features': [
                    f"{TIER_CONFIGS['pro']['credits']} credits",
                    f"Estimated time saved: {TIER_CONFIGS['pro']['time_saved_minutes']} minutes",
                    "Same quality interesting emails as Free",
                    "Resume-enhanced personalization",
                    "Directory permanently saves",
                    "Priority Support",
                    "Advanced features"
                ]
            }
        }
    })


@billing_bp.route('/check-credits', methods=['GET'])
@require_firebase_auth
def check_credits():
    """Check user's current credits"""
    try:
        db = get_db()
        user_email = request.firebase_user.get('email')
        user_id = request.firebase_user.get('uid')
        
        if db and user_id:
            # Try using user ID first (more reliable)
            user_ref = db.collection('users').document(user_id)
            user_doc = user_ref.get()
            
            if not user_doc.exists and user_email:
                # Fallback to email-based lookup
                user_ref = db.collection('users').document(user_email.replace('@', '_at_'))
                user_doc = user_ref.get()
            
            if user_doc.exists:
                user_data = user_doc.to_dict()
                credits = check_and_reset_credits(user_ref, user_data)
                max_credits = user_data.get('maxCredits', 150)
                tier = user_data.get('tier', 'free')
                
                # Calculate searches remaining
                searches_remaining = credits // 15
                
                return jsonify({
                    'credits': credits,
                    'max_credits': max_credits,
                    'searches_remaining': searches_remaining,
                    'tier': tier,
                    'user_email': user_email
                })
            else:
                # User doesn't exist yet - return default free tier credits
                return jsonify({
                    'credits': 150,
                    'max_credits': 150,
                    'searches_remaining': 8,
                    'tier': 'free',
                    'user_email': user_email
                })
        
        # If no Firebase, return defaults
        return jsonify({
            'credits': 0,
            'max_credits': 150,
            'searches_remaining': 0,
            'tier': 'free',
            'user_email': user_email
        })
        
    except Exception as e:
        print(f"Check credits error: {e}")
        return jsonify({'error': str(e)}), 500


@billing_bp.route('/user/update-tier', methods=['POST'])
def update_user_tier():
    """Update user tier and credits"""
    try:
        db = get_db()
        data = request.get_json() or {}
        user_email = data.get('userEmail', '').strip()
        tier = data.get('tier', '').strip()
        credits = data.get('credits', 0)
        max_credits = data.get('maxCredits', 0)
        
        if not user_email or not tier:
            return jsonify({'error': 'User email and tier required'}), 400
        
        # Validate tier
        if tier not in ['free', 'pro']:
            return jsonify({'error': 'Invalid tier. Must be "free" or "pro"'}), 400
        
        # Store user tier info
        if db:
            user_ref = db.collection('users').document(user_email.replace('@', '_at_'))
            user_ref.set({
                'email': user_email,
                'tier': tier,
                'credits': credits,
                'maxCredits': max_credits,
                'updated_at': datetime.now().isoformat()
            }, merge=True)
        
        print(f"Updated user {user_email} to {tier} tier with {credits} credits")
        
        return jsonify({
            'success': True,
            'user': {
                'email': user_email,
                'tier': tier,
                'credits': credits,
                'maxCredits': max_credits
            }
        })
        
    except Exception as e:
        print(f"User tier update error: {e}")
        return jsonify({'error': str(e)}), 500


@billing_bp.route('/create-checkout-session', methods=['POST'])
@require_firebase_auth
def create_checkout_session_route():
    """Create Stripe checkout session for Pro upgrade"""
    return create_checkout_session()


@billing_bp.route('/complete-upgrade', methods=['POST'])
@require_firebase_auth
def complete_upgrade():
    """Complete Pro upgrade - called by frontend after successful payment"""
    try:
        db = get_db()
        data = request.get_json() or {}
        session_id = data.get('sessionId')
        
        user_id = request.firebase_user['uid']
        user_email = request.firebase_user.get('email')
        
        print(f"\n💳 Completing upgrade for {user_email}")
        print(f"   Session: {session_id}")
        
        # Verify with Stripe
        if session_id:
            try:
                from app.config import STRIPE_SECRET_KEY
                if STRIPE_SECRET_KEY:
                    stripe.api_key = STRIPE_SECRET_KEY
                    session = stripe.checkout.Session.retrieve(session_id)
                    print(f"   Payment status: {session.payment_status}")
                    
                    if session.payment_status != 'paid':
                        return jsonify({'error': 'Payment not completed'}), 400
                    
                    subscription_id = session.subscription
                    customer_id = session.customer
                else:
                    subscription_id = None
                    customer_id = None
                    
            except Exception as e:
                print(f"   ⚠️  Stripe check failed: {e}")
                subscription_id = None
                customer_id = None
        else:
            subscription_id = None
            customer_id = None
        
        # Update Firebase
        if db:
            user_ref = db.collection('users').document(user_id)
            
            update_data = {
                'tier': 'pro',
                'credits': 1800,
                'maxCredits': 1800,
                'subscriptionStatus': 'active',
                'upgraded_at': datetime.now().isoformat(),
                'lastCreditReset': datetime.now().isoformat()
            }
            
            if customer_id:
                update_data['stripeCustomerId'] = customer_id
            if subscription_id:
                update_data['stripeSubscriptionId'] = subscription_id
            
            user_ref.set(update_data, merge=True)
        
        print(f"✅ Upgraded {user_email} to Pro!")
        
        return jsonify({
            'success': True,
            'message': 'Successfully upgraded to Pro',
            'tier': 'pro',
            'credits': 1800
        })
        
    except Exception as e:
        print(f"Upgrade completion error: {e}")
        return jsonify({'error': str(e)}), 500


@billing_bp.route('/stripe-webhook', methods=['POST'])
def stripe_webhook():
    """Handle Stripe webhook events"""
    return handle_stripe_webhook()


@billing_bp.route('/create-portal-session', methods=['POST'])
@require_firebase_auth
def create_portal_session_route():
    """Create Stripe customer portal session"""
    return create_portal_session()


@billing_bp.route('/subscription-status', methods=['GET'])
@require_firebase_auth
def subscription_status():
    """Get subscription status"""
    try:
        db = get_db()
        user_id = request.firebase_user.get('uid')
        
        if not db:
            return jsonify({'subscribed': False}), 200
        
        user_ref = db.collection('users').document(user_id)
        user_doc = user_ref.get()
        
        if not user_doc.exists:
            return jsonify({'subscribed': False, 'tier': 'free'}), 200
        
        user_data = user_doc.to_dict()
        tier = user_data.get('tier', 'free')
        subscription_id = user_data.get('stripeSubscriptionId')
        
        return jsonify({
            'subscribed': tier == 'pro',
            'tier': tier,
            'subscriptionId': subscription_id,
            'credits': user_data.get('credits', 0)
        })
        
    except Exception as e:
        print(f"Subscription status error: {e}")
        return jsonify({'subscribed': False, 'tier': 'free'}), 200


@billing_bp.route('/debug/check-upgrade/<user_id>', methods=['GET'])
def debug_check_upgrade(user_id):
    """Debug endpoint to check user upgrade status"""
    try:
        db = get_db()
        if not db:
            return jsonify({'error': 'Firebase not initialized'}), 500
        
        user_ref = db.collection('users').document(user_id)
        user_doc = user_ref.get()
        
        if not user_doc.exists:
            return jsonify({'error': 'User not found'}), 404
        
        user_data = user_doc.to_dict()
        
        return jsonify({
            'user_id': user_id,
            'tier': user_data.get('tier', 'free'),
            'credits': user_data.get('credits', 0),
            'maxCredits': user_data.get('maxCredits', 0),
            'subscriptionId': user_data.get('stripeSubscriptionId'),
            'customerId': user_data.get('stripeCustomerId'),
            'upgraded_at': user_data.get('upgraded_at')
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

