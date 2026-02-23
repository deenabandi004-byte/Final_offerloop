"""
Stripe client service - payment processing and subscription management
"""
import stripe
from datetime import datetime
from flask import request, jsonify
from app.config import STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, TIER_CONFIGS, STRIPE_PRO_PRICE_ID, STRIPE_ELITE_PRICE_ID
from app.extensions import get_db
from app.services.auth import check_and_reset_credits


def get_tier_from_price_id(price_id: str) -> str:
    """Determine tier from Stripe price ID"""
    if price_id == STRIPE_ELITE_PRICE_ID:
        return 'elite'
    elif price_id == STRIPE_PRO_PRICE_ID:
        return 'pro'
    else:
        # Default to pro for backward compatibility
        return 'pro'


def create_checkout_session():
    """Create Stripe checkout session for upgrade"""
    try:
        if not STRIPE_SECRET_KEY:
            return jsonify({'error': 'Stripe not configured'}), 500
        
        stripe.api_key = STRIPE_SECRET_KEY
        
        data = request.get_json() or {}
        user_id = request.firebase_user.get('uid')
        user_email = request.firebase_user.get('email')
        price_id = data.get('priceId')
        
        # Validate required fields
        if not user_id:
            return jsonify({'error': 'User ID is required'}), 400
        if not user_email:
            return jsonify({'error': 'User email is required'}), 400
        
        # Determine base URL based on environment
        if request.url_root and 'localhost' in request.url_root:
            base_url = 'http://localhost:8080'  # Frontend dev server runs on port 8080
        else:
            base_url = 'https://www.offerloop.ai'
        
        # Hardcode URLs with double braces to escape in f-string
        # Stripe recognizes {CHECKOUT_SESSION_ID} as a template variable
        success_url = f'{base_url}/payment-success?session_id={{CHECKOUT_SESSION_ID}}'
        cancel_url = f'{base_url}/pricing'
        
        print(f"Creating checkout session: user_id={user_id}, email={user_email}, price_id={price_id}")
        print(f"Success URL: {success_url}")
        print(f"Cancel URL: {cancel_url}")
        
        # Prepare session parameters (1-month free trial for Pro and Elite)
        session_params = {
            'payment_method_types': ['card'],
            'mode': 'subscription',
            'success_url': success_url,
            'cancel_url': cancel_url,
            'customer_email': user_email,
            'metadata': {
                'user_id': user_id,
            },
            'subscription_data': {
                'trial_period_days': 30,
            },
        }
        
        # Create checkout session
        if price_id:
            # Use the provided price ID
            session_params['line_items'] = [{
                'price': price_id,
                'quantity': 1,
            }]
        else:
            # Fallback to inline price data if no priceId provided
            session_params['line_items'] = [{
                'price_data': {
                    'currency': 'usd',
                    'product_data': {
                        'name': 'Offerloop Pro',
                    },
                    'unit_amount': 1999,  # $19.99
                    'recurring': {
                        'interval': 'month',
                    },
                },
                'quantity': 1,
            }]
        
        try:
            session = stripe.checkout.Session.create(**session_params)
            print(f"Checkout session created successfully: {session.id}")
            return jsonify({'sessionId': session.id, 'url': session.url})
        except stripe.error.StripeError as stripe_error:
            print(f"Stripe API error: {stripe_error}")
            print(f"Error type: {type(stripe_error).__name__}")
            print(f"Error message: {stripe_error.user_message or stripe_error.message}")
            return jsonify({
                'error': 'Stripe checkout session creation failed',
                'stripe_error': str(stripe_error),
                'stripe_error_type': type(stripe_error).__name__,
                'message': stripe_error.user_message or stripe_error.message
            }), 400
        
    except Exception as e:
        print(f"Stripe checkout error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


def handle_stripe_webhook():
    """Handle Stripe webhook events"""
    try:
        if not STRIPE_SECRET_KEY or not STRIPE_WEBHOOK_SECRET:
            return jsonify({'error': 'Stripe not configured'}), 500
        
        stripe.api_key = STRIPE_SECRET_KEY
        
        payload = request.data
        sig_header = request.headers.get('Stripe-Signature')
        
        event = stripe.Webhook.construct_event(
            payload, sig_header, STRIPE_WEBHOOK_SECRET
        )
        
        # Handle different event types
        if event['type'] == 'checkout.session.completed':
            handle_checkout_completed(event['data']['object'])
        elif event['type'] == 'invoice.paid':
            handle_invoice_paid(event['data']['object'])
        elif event['type'] == 'customer.subscription.deleted':
            handle_subscription_deleted(event['data']['object'])
        elif event['type'] == 'customer.subscription.updated':
            handle_subscription_updated(event['data']['object'])
        
        return jsonify({'status': 'success'})
        
    except ValueError as e:
        print(f"Invalid payload: {e}")
        return jsonify({'error': 'Invalid payload'}), 400
    except stripe.error.SignatureVerificationError as e:
        print(f"Invalid signature: {e}")
        return jsonify({'error': 'Invalid signature'}), 400
    except Exception as e:
        print(f"Webhook error: {e}")
        return jsonify({'error': str(e)}), 500


def handle_checkout_completed(session):
    """Handle successful checkout - upgrade user to appropriate tier"""
    try:
        db = get_db()
        if not db:
            return
        
        user_id = session.get('metadata', {}).get('user_id')
        if not user_id:
            return
        
        # Get subscription to determine tier and actual status (trialing vs active)
        subscription_id = session.get('subscription')
        tier = 'pro'  # Default
        sub_status = 'active'  # Default fallback
        if subscription_id:
            try:
                stripe.api_key = STRIPE_SECRET_KEY
                subscription = stripe.Subscription.retrieve(subscription_id)
                sub_status = subscription.status  # 'trialing' during free trial, 'active' after
                if subscription.items.data:
                    price_id = subscription.items.data[0].price.id
                    tier = get_tier_from_price_id(price_id)
            except Exception as e:
                print(f"Error retrieving subscription: {e}")
        
        tier_config = TIER_CONFIGS.get(tier, TIER_CONFIGS['pro'])
        
        user_ref = db.collection('users').document(user_id)
        user_ref.update({
            'subscriptionTier': tier,
            'tier': tier,  # Keep for backward compatibility
            'maxCredits': tier_config['credits'],
            'credits': tier_config['credits'],
            'stripeSubscriptionId': subscription_id,
            'stripeCustomerId': session.get('customer'),
            'subscriptionStatus': sub_status,
            'upgraded_at': datetime.now().isoformat(),
            'updatedAt': datetime.now().isoformat()
        })
        
        print(f"✅ User {user_id} upgraded to {tier}")
        
    except Exception as e:
        print(f"Error handling checkout: {e}")
        import traceback
        traceback.print_exc()


def handle_subscription_deleted(subscription):
    """Handle subscription cancellation - downgrade to free"""
    try:
        db = get_db()
        if not db:
            return
        
        customer_id = subscription.get('customer')
        if not customer_id:
            return
        
        # Find user by customer ID and downgrade
        users_ref = db.collection('users')
        query = users_ref.where('stripeCustomerId', '==', customer_id).limit(1)
        docs = query.stream()
        
        for doc in docs:
            user_ref = users_ref.document(doc.id)
            tier_config = TIER_CONFIGS['free']
            user_ref.update({
                'subscriptionTier': 'free',
                'tier': 'free',
                'maxCredits': tier_config['credits'],
                'credits': min(doc.to_dict().get('credits', 0), tier_config['credits']),  # Cap at free tier limit
                'subscriptionStatus': None,
                'stripeSubscriptionId': None,
                'updatedAt': datetime.now().isoformat()
            })
            print(f"✅ User {doc.id} downgraded to free")
            break
        
    except Exception as e:
        print(f"Error handling subscription deletion: {e}")
        import traceback
        traceback.print_exc()


def handle_invoice_paid(invoice):
    """Handle successful invoice payment - reset monthly credits and usage counters"""
    try:
        db = get_db()
        if not db:
            return
        
        customer_id = invoice.get('customer')
        subscription_id = invoice.get('subscription')
        
        if not customer_id or not subscription_id:
            return
        
        # Find user by customer ID
        users_ref = db.collection('users')
        query = users_ref.where('stripeCustomerId', '==', customer_id).limit(1)
        docs = query.stream()
        
        for doc in docs:
            user_ref = users_ref.document(doc.id)
            user_data = doc.to_dict()
            tier = user_data.get('subscriptionTier') or user_data.get('tier', 'free')
            
            # Only reset for Pro/Elite tiers (Free tier limits are lifetime)
            if tier not in ['pro', 'elite']:
                print(f"⚠️ Invoice paid for Free tier user {doc.id} - skipping reset")
                break
            
            # Get subscription to determine tier from price ID
            tier = 'pro'  # Default
            try:
                subscription = stripe.Subscription.retrieve(subscription_id)
                if subscription.items.data:
                    price_id = subscription.items.data[0].price.id
                    tier = get_tier_from_price_id(price_id)
            except Exception as e:
                print(f"Error retrieving subscription: {e}")
            
            tier_config = TIER_CONFIGS.get(tier, TIER_CONFIGS['pro'])
            
            # Reset credits and usage counters for monthly reset
            user_ref.update({
                'credits': tier_config['credits'],
                'maxCredits': tier_config['credits'],
                'alumniSearchesUsed': 0,  # Reset usage counters
                'coffeeChatPrepsUsed': 0,
                'interviewPrepsUsed': 0,
                'lastCreditReset': datetime.now().isoformat(),
                'lastUsageReset': datetime.now().isoformat(),
                'updatedAt': datetime.now().isoformat()
            })
            
            print(f"✅ Monthly reset for user {doc.id} ({tier}): {tier_config['credits']} credits restored, usage counters reset")
            break
        
    except Exception as e:
        print(f"Error handling invoice payment: {e}")
        import traceback
        traceback.print_exc()


def handle_subscription_updated(subscription):
    """Handle subscription updates (e.g., tier changes, plan upgrades/downgrades)"""
    try:
        db = get_db()
        if not db:
            return
        
        customer_id = subscription.get('customer')
        if not customer_id:
            return
        
        # Determine tier from subscription price ID
        tier = 'pro'  # Default
        if subscription.items.data:
            price_id = subscription.items.data[0].price.id
            tier = get_tier_from_price_id(price_id)
        
        tier_config = TIER_CONFIGS.get(tier, TIER_CONFIGS['pro'])
        
        # Find user by customer ID and update tier
        users_ref = db.collection('users')
        query = users_ref.where('stripeCustomerId', '==', customer_id).limit(1)
        docs = query.stream()
        
        for doc in docs:
            user_ref = users_ref.document(doc.id)
            user_data = doc.to_dict()
            current_credits = user_data.get('credits', 0)
            
            # If upgrading, give full credits. If downgrading, cap at new tier limit
            new_credits = tier_config['credits'] if tier in ['pro', 'elite'] else min(current_credits, tier_config['credits'])
            
            user_ref.update({
                'subscriptionTier': tier,
                'tier': tier,
                'maxCredits': tier_config['credits'],
                'credits': new_credits,
                'stripeSubscriptionId': subscription.id,
                'subscriptionStatus': subscription.status,
                'updatedAt': datetime.now().isoformat()
            })
            print(f"✅ User {doc.id} subscription updated to {tier}")
            break
        
    except Exception as e:
        print(f"Error handling subscription update: {e}")
        import traceback
        traceback.print_exc()


def create_portal_session():
    """Create Stripe customer portal session"""
    try:
        if not STRIPE_SECRET_KEY:
            return jsonify({'error': 'Stripe not configured'}), 500
        
        stripe.api_key = STRIPE_SECRET_KEY
        
        user_id = request.firebase_user.get('uid')
        data = request.get_json() or {}
        return_url = data.get('returnUrl') or f'{request.url_root}pricing'
        
        db = get_db()
        
        if not db:
            return jsonify({'error': 'Database not available'}), 500
        
        user_ref = db.collection('users').document(user_id)
        user_doc = user_ref.get()
        
        if not user_doc.exists:
            return jsonify({'error': 'User not found'}), 404
        
        user_data = user_doc.to_dict()
        customer_id = user_data.get('stripeCustomerId')
        
        if not customer_id:
            return jsonify({'error': 'No Stripe customer ID found. Please contact support.'}), 404
        
        # Verify customer exists and is accessible with current Stripe key
        try:
            customer = stripe.Customer.retrieve(customer_id)
            if not customer:
                return jsonify({
                    'error': 'Stripe customer not found. This may be due to a test/live mode mismatch. Please contact support.',
                    'details': 'Customer ID exists in database but not accessible with current Stripe key'
                }), 400
        except stripe.error.InvalidRequestError as e:
            error_msg = str(e)
            if 'test mode' in error_msg.lower() or 'live mode' in error_msg.lower():
                return jsonify({
                    'error': 'Stripe mode mismatch detected. The customer was created in a different Stripe mode (test vs live).',
                    'details': 'Please ensure your Stripe keys match the mode used when the subscription was created.',
                    'customer_id': customer_id
                }), 400
            raise
        
        # Create portal session
        try:
            session = stripe.billing_portal.Session.create(
                customer=customer_id,
                return_url=return_url,
            )
            print(f"✅ Created portal session for user {user_id}, customer {customer_id}")
            return jsonify({'url': session.url})
        except stripe.error.StripeError as e:
            print(f"❌ Stripe error creating portal session: {e}")
            return jsonify({
                'error': 'Failed to create Stripe portal session',
                'details': str(e)
            }), 400
        
    except Exception as e:
        print(f"Portal session error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({
            'error': 'Failed to open subscription management',
            'details': str(e)
        }), 500

