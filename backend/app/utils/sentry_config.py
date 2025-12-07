"""
Sentry error tracking configuration
"""
import os

def init_sentry(app):
    """
    Initialize Sentry error tracking.
    Set SENTRY_DSN environment variable to enable.
    Gracefully handles missing sentry_sdk package.
    """
    try:
        import sentry_sdk
        from sentry_sdk.integrations.flask import FlaskIntegration
    except ImportError:
        print("⚠️ sentry_sdk not installed. Install with: pip install sentry-sdk[flask]")
        print("⚠️ Error tracking disabled. Continuing without Sentry.")
        return
    
    sentry_dsn = os.environ.get('SENTRY_DSN')
    
    if not sentry_dsn:
        print("⚠️ Sentry DSN not configured. Error tracking disabled.")
        return
    
    try:
        sentry_sdk.init(
            dsn=sentry_dsn,
            integrations=[
                FlaskIntegration(transaction_style='url'),
            ],
            # Set traces_sample_rate to 1.0 to capture 100%
            # of the transactions for performance monitoring.
            traces_sample_rate=0.1,  # 10% of transactions
            # Set profiles_sample_rate to 1.0 to profile 100%
            # of sampled transactions.
            profiles_sample_rate=0.1,
            # Environment
            environment=os.environ.get('FLASK_ENV', 'production'),
            # Release tracking
            release=os.environ.get('RENDER_GIT_COMMIT', 'unknown'),
            # Filter sensitive data
            before_send=lambda event, hint: filter_sensitive_data(event),
        )
        print("✅ Sentry error tracking initialized")
    except Exception as e:
        print(f"⚠️ Failed to initialize Sentry: {e}")


def filter_sensitive_data(event):
    """
    Filter out sensitive data from Sentry events.
    """
    if 'request' in event:
        # Remove sensitive headers
        if 'headers' in event['request']:
            sensitive_headers = ['authorization', 'cookie', 'x-api-key']
            for header in sensitive_headers:
                event['request']['headers'].pop(header, None)
        
        # Remove sensitive query params
        if 'query_string' in event['request']:
            sensitive_params = ['token', 'api_key', 'password']
            query_string = event['request']['query_string']
            if query_string:
                # Simple filtering - in production, use proper URL parsing
                for param in sensitive_params:
                    if param in query_string.lower():
                        event['request']['query_string'] = '[Filtered]'
    
    # Remove user data that might be sensitive
    if 'user' in event:
        event['user'].pop('email', None)
        event['user'].pop('username', None)
    
    return event
