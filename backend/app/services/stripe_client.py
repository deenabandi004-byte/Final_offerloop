"""
Stripe client service - payment processing and subscription management
"""
import stripe
from datetime import datetime
from flask import request, jsonify
from app.config import STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, TIER_CONFIGS
from app.extensions import get_db
from app.services.auth import check_and_reset_credits


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
        
        # Prepare session parameters
        session_params = {
            'payment_method_types': ['card'],
            'mode': 'subscription',
            'success_url': success_url,
            'cancel_url': cancel_url,
            'customer_email': user_email,
            'metadata': {
                'user_id': user_id,
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
    """Handle successful checkout - upgrade user to pro"""
    try:
        db = get_db()
        if not db:
            return
        
        user_id = session.get('metadata', {}).get('user_id')
        if not user_id:
            return
        
        user_ref = db.collection('users').document(user_id)
        user_ref.update({
            'tier': 'pro',
            'maxCredits': TIER_CONFIGS['pro']['credits'],
            'credits': TIER_CONFIGS['pro']['credits'],
            'subscriptionId': session.get('subscription'),
            'updatedAt': datetime.now()
        })
        
        print(f"✅ User {user_id} upgraded to pro")
        
    except Exception as e:
        print(f"Error handling checkout: {e}")


def handle_subscription_deleted(subscription):
    """Handle subscription cancellation - downgrade to free"""
    try:
        db = get_db()
        if not db:
            return
        
        customer_id = subscription.get('customer')
        # Find user by customer ID and downgrade
        # Implementation depends on how you store customer IDs
        
    except Exception as e:
        print(f"Error handling subscription deletion: {e}")


def handle_subscription_updated(subscription):
    """Handle subscription updates"""
    try:
        # Update subscription status if needed
        pass
    except Exception as e:
        print(f"Error handling subscription update: {e}")


def create_portal_session():
    """Create Stripe customer portal session"""
    try:
        if not STRIPE_SECRET_KEY:
            return jsonify({'error': 'Stripe not configured'}), 500
        
        stripe.api_key = STRIPE_SECRET_KEY
        
        user_id = request.firebase_user.get('uid')
        db = get_db()
        
        if db:
            user_ref = db.collection('users').document(user_id)
            user_doc = user_ref.get()
            if user_doc.exists:
                user_data = user_doc.to_dict()
                customer_id = user_data.get('stripeCustomerId')
                
                if customer_id:
                    session = stripe.billing_portal.Session.create(
                        customer=customer_id,
                        return_url=request.url_root + 'api/subscription-status',
                    )
                    return jsonify({'url': session.url})
        
        return jsonify({'error': 'No subscription found'}), 404
        
    except Exception as e:
        print(f"Portal session error: {e}")
        return jsonify({'error': str(e)}), 500

