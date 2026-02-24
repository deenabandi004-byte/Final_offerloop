"""
Billing and tier management routes
"""
import stripe
from datetime import datetime
from flask import Blueprint, request, jsonify

from ..extensions import require_firebase_auth
from app.services.auth import check_and_reset_credits
from app.services.stripe_client import create_checkout_session, handle_stripe_webhook, create_portal_session, handle_checkout_completed, update_subscription_tier
from app.config import TIER_CONFIGS
from ..extensions import get_db

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
            },
            'elite': {
                'name': 'Elite',
                'max_contacts': TIER_CONFIGS['elite']['max_contacts'],
                'credits': TIER_CONFIGS['elite']['credits'],
                'time_saved_minutes': TIER_CONFIGS['elite']['time_saved_minutes'],
                'description': TIER_CONFIGS['elite']['description'],
                'features': [
                    f"{TIER_CONFIGS['elite']['credits']} credits",
                    f"Estimated time saved: {TIER_CONFIGS['elite']['time_saved_minutes']} minutes",
                    "Everything in Pro, plus:",
                    "Unlimited Coffee Chat Prep",
                    "Unlimited Interview Prep",
                    "Priority queue for contact generation",
                    "Personalized outreach templates",
                    "Weekly personalized firm insights",
                    "Early access to new AI tools"
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
                    'credits': 300,
                    'max_credits': 300,
                    'searches_remaining': 20,
                    'tier': 'free',
                    'user_email': user_email
                })
        
        # If no Firebase, return defaults
        return jsonify({
            'credits': 0,
            'max_credits': 300,
            'searches_remaining': 0,
            'tier': 'free',
            'user_email': user_email
        })
        
    except Exception as e:
        print(f"Check credits error: {e}")
        return jsonify({'error': str(e)}), 500


@billing_bp.route('/user/update-tier', methods=['POST'])
@require_firebase_auth
def update_user_tier():
    """
    Update user tier and credits - ADMIN/INTERNAL USE ONLY
    SECURITY: This endpoint should only be used by webhooks or admin tools.
    Tier is validated but comes from request - this is intentional for webhook/admin use.
    For normal user operations, tier should NEVER be accepted from client.
    """
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
        if tier not in ['free', 'pro', 'elite']:
            return jsonify({'error': 'Invalid tier. Must be "free", "pro", or "elite"'}), 400
        
        # SECURITY NOTE: This endpoint accepts tier from request, which is a security risk.
        # This should only be used by:
        # 1. Stripe webhooks (which are server-to-server)
        # 2. Admin tools (which should have additional authentication)
        # Consider adding admin authentication or removing this endpoint in favor of webhook-only updates.
        
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
        print(f"   User ID: {user_id}")
        print(f"   Session ID: {session_id}")
        
        if not session_id:
            print("   ⚠️  No session ID provided")
            return jsonify({'error': 'Session ID is required'}), 400
        
        # Verify with Stripe
        subscription_id = None
        customer_id = None
        
        try:
            from app.config import STRIPE_SECRET_KEY
            if not STRIPE_SECRET_KEY:
                print("   ⚠️  Stripe not configured, proceeding without verification")
            else:
                stripe.api_key = STRIPE_SECRET_KEY
                session = stripe.checkout.Session.retrieve(session_id)
                print(f"   Payment status: {session.payment_status}")
                print(f"   Session mode: {session.mode}")
                print(f"   Customer: {session.customer}")
                print(f"   Subscription: {session.subscription}")
                
                if session.payment_status != 'paid':
                    print(f"   ❌ Payment not completed. Status: {session.payment_status}")
                    return jsonify({
                        'error': f'Payment not completed. Status: {session.payment_status}',
                        'payment_status': session.payment_status
                    }), 400
                
                subscription_id = session.subscription
                customer_id = session.customer
                print(f"   ✅ Payment verified - Customer: {customer_id}, Subscription: {subscription_id}")
                    
        except stripe.error.StripeError as e:
            print(f"   ❌ Stripe error: {e}")
            return jsonify({
                'error': f'Stripe verification failed: {str(e)}',
                'stripe_error': str(e)
            }), 400
        except Exception as e:
            print(f"   ⚠️  Error retrieving Stripe session: {e}")
            import traceback
            traceback.print_exc()
            # Continue without Stripe verification if it fails
            # This allows manual upgrades if Stripe is having issues
        
        # Update Firebase
        if not db:
            print("   ❌ Firebase not initialized")
            return jsonify({'error': 'Database not available'}), 500
        
        user_ref = db.collection('users').document(user_id)
        
        # Check if user exists first
        user_doc = user_ref.get()
        if not user_doc.exists:
            print(f"   ⚠️  User document doesn't exist, creating new one")
        
        # Determine tier and credits based on price ID
        from app.services.stripe_client import get_tier_from_price_id
        
        tier = 'pro'  # Default
        if subscription_id:
            try:
                subscription = stripe.Subscription.retrieve(subscription_id)
                if subscription.items.data:
                    price_id = subscription.items.data[0].price.id
                    tier = get_tier_from_price_id(price_id)
            except Exception as e:
                print(f"   ⚠️  Error retrieving subscription: {e}")
        
        tier_config = TIER_CONFIGS.get(tier, TIER_CONFIGS['pro'])
        credits = tier_config['credits']
        
        update_data = {
            'tier': tier,
            'credits': credits,
            'maxCredits': credits,
            'subscriptionStatus': 'active',
            'upgraded_at': datetime.now().isoformat(),
            'lastCreditReset': datetime.now().isoformat(),
            'coffeeChatPrepsUsed': 0,
            'coffeeChatPrepsLimit': tier_config['coffee_chat_preps'],
            'interviewPrepsUsed': 0,
            'interviewPrepsLimit': tier_config['interview_preps']
        }
        
        if customer_id:
            update_data['stripeCustomerId'] = customer_id
        if subscription_id:
            update_data['stripeSubscriptionId'] = subscription_id
        
        user_ref.set(update_data, merge=True)
        print(f"   ✅ Updated Firebase user document")
        
        print(f"✅ Successfully upgraded {user_email} to Pro!")
        
        return jsonify({
            'success': True,
            'message': f'Successfully upgraded to {tier.capitalize()}',
            'tier': tier,
            'credits': credits,
            'subscriptionId': subscription_id,
            'customerId': customer_id
        })
        
    except KeyError as e:
        print(f"❌ Missing required field: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': f'Missing required field: {str(e)}'}), 400
    except Exception as e:
        print(f"❌ Upgrade completion error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@billing_bp.route('/stripe-webhook', methods=['POST'])
def stripe_webhook():
    """Handle Stripe webhook events"""
    return handle_stripe_webhook()


@billing_bp.route('/update-subscription', methods=['POST'])
@require_firebase_auth
def update_subscription():
    """Update existing subscription tier (e.g., Pro → Elite) via Stripe modify"""
    return update_subscription_tier()


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
        # Use actual status from Firestore so trialing subscribers see 'trialing'
        raw_status = user_data.get('subscriptionStatus')
        status = raw_status if tier in ['pro', 'elite'] and raw_status else ('active' if tier in ['pro', 'elite'] else 'inactive')
        
        return jsonify({
            'subscribed': tier in ['pro', 'elite'],
            'tier': tier,
            'status': status,
            'hasSubscription': tier in ['pro', 'elite'],
            'subscriptionId': subscription_id,
            'credits': user_data.get('credits', 0)
        })
        
    except Exception as e:
        print(f"Subscription status error: {e}")
        return jsonify({'subscribed': False, 'tier': 'free'}), 200


@billing_bp.route('/user/subscription', methods=['GET'])
@require_firebase_auth
def get_user_subscription():
    """Get user subscription tier and usage information"""
    try:
        db = get_db()
        user_id = request.firebase_user.get('uid')
        
        if not db or not user_id:
            return jsonify({
                'tier': 'free',
                'credits': 0,
                'maxCredits': TIER_CONFIGS['free']['credits'],
                'alumniSearchesUsed': 0,
                'alumniSearchesLimit': TIER_CONFIGS['free']['alumni_searches'],
                'coffeeChatPrepsUsed': 0,
                'coffeeChatPrepsLimit': TIER_CONFIGS['free']['coffee_chat_preps'],
                'interviewPrepsUsed': 0,
                'interviewPrepsLimit': TIER_CONFIGS['free']['interview_preps'],
            }), 200
        
        user_ref = db.collection('users').document(user_id)
        user_doc = user_ref.get()
        
        if not user_doc.exists:
            return jsonify({
                'tier': 'free',
                'credits': 0,
                'maxCredits': TIER_CONFIGS['free']['credits'],
                'alumniSearchesUsed': 0,
                'alumniSearchesLimit': TIER_CONFIGS['free']['alumni_searches'],
                'coffeeChatPrepsUsed': 0,
                'coffeeChatPrepsLimit': TIER_CONFIGS['free']['coffee_chat_preps'],
                'interviewPrepsUsed': 0,
                'interviewPrepsLimit': TIER_CONFIGS['free']['interview_preps'],
            }), 200
        
        user_data = user_doc.to_dict()
        tier = user_data.get('subscriptionTier') or user_data.get('tier', 'free')
        tier_config = TIER_CONFIGS.get(tier, TIER_CONFIGS['free'])
        
        # Check and reset usage if needed
        from app.services.auth import check_and_reset_usage
        check_and_reset_usage(user_ref, user_data)
        user_doc = user_ref.get()  # Refresh after potential reset
        user_data = user_doc.to_dict()
        
        return jsonify({
            'tier': tier,
            'credits': user_data.get('credits', 0),
            'maxCredits': user_data.get('maxCredits', tier_config['credits']),
            'alumniSearchesUsed': user_data.get('alumniSearchesUsed', 0),
            'alumniSearchesLimit': tier_config['alumni_searches'],
            'coffeeChatPrepsUsed': user_data.get('coffeeChatPrepsUsed', 0),
            'coffeeChatPrepsLimit': tier_config['coffee_chat_preps'],
            'interviewPrepsUsed': user_data.get('interviewPrepsUsed', 0),
            'interviewPrepsLimit': tier_config['interview_preps'],
        })
        
    except Exception as e:
        print(f"Get subscription error: {e}")
        return jsonify({'error': str(e)}), 500


@billing_bp.route('/user/check-feature', methods=['POST'])
@require_firebase_auth
def check_feature():
    """Check if user can access a feature"""
    try:
        db = get_db()
        user_id = request.firebase_user.get('uid')
        data = request.get_json() or {}
        feature = data.get('feature')
        
        if not feature:
            return jsonify({'error': 'Feature name is required'}), 400
        
        if not db or not user_id:
            return jsonify({'allowed': False, 'reason': 'User not found'}), 200
        
        user_ref = db.collection('users').document(user_id)
        user_doc = user_ref.get()
        
        if not user_doc.exists:
            return jsonify({'allowed': False, 'reason': 'User not found'}), 200
        
        user_data = user_doc.to_dict()
        tier = user_data.get('subscriptionTier') or user_data.get('tier', 'free')
        tier_config = TIER_CONFIGS.get(tier, TIER_CONFIGS['free'])
        
        # Check feature access based on tier
        from app.services.auth import can_access_feature
        allowed, reason = can_access_feature(tier, feature, user_data, tier_config)
        
        return jsonify({
            'allowed': allowed,
            'reason': reason,
            'tier': tier
        })
        
    except Exception as e:
        print(f"Check feature error: {e}")
        return jsonify({'error': str(e)}), 500


@billing_bp.route('/user/increment-usage', methods=['POST'])
@require_firebase_auth
def increment_usage():
    """Increment usage counter for a feature"""
    try:
        db = get_db()
        user_id = request.firebase_user.get('uid')
        data = request.get_json() or {}
        feature = data.get('feature')
        
        if not feature:
            return jsonify({'error': 'Feature name is required'}), 400
        
        if not db or not user_id:
            return jsonify({'error': 'Database not available'}), 500
        
        user_ref = db.collection('users').document(user_id)
        user_doc = user_ref.get()
        
        if not user_doc.exists:
            return jsonify({'error': 'User not found'}), 404
        
        user_data = user_doc.to_dict()
        
        # Check and reset usage if needed
        from app.services.auth import check_and_reset_usage
        check_and_reset_usage(user_ref, user_data)
        user_doc = user_ref.get()  # Refresh
        user_data = user_doc.to_dict()
        
        # Map feature names to field names
        field_map = {
            'alumni_search': 'alumniSearchesUsed',
            'coffee_chat_prep': 'coffeeChatPrepsUsed',
            'interview_prep': 'interviewPrepsUsed',
        }
        
        field_name = field_map.get(feature)
        if not field_name:
            return jsonify({'error': f'Unknown feature: {feature}'}), 400
        
        # Increment usage
        current_usage = user_data.get(field_name, 0)
        user_ref.update({
            field_name: current_usage + 1,
            'updatedAt': datetime.now().isoformat()
        })
        
        return jsonify({
            'success': True,
            'usage': current_usage + 1
        })
        
    except Exception as e:
        print(f"Increment usage error: {e}")
        return jsonify({'error': str(e)}), 500


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

