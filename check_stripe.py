import stripe

stripe.api_key = os.environ.get('STRIPE_SECRET_KEY')

try:
    customer = stripe.Customer.retrieve("cus_TZSAmYdeRKClz1")
    print("Found in LIVE mode")
except Exception as e:
    print(f"NOT found in live mode: {e}")
