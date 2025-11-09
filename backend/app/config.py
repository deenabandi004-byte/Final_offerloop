"""
Application configuration - all constants, environment variables, and config dictionaries
"""
import os
from datetime import timedelta
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# ========================================
# API Keys & Secrets
# ========================================
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
PEOPLE_DATA_LABS_API_KEY = os.getenv('PEOPLE_DATA_LABS_API_KEY')
STRIPE_SECRET_KEY = os.getenv('STRIPE_SECRET_KEY')
STRIPE_PUBLISHABLE_KEY = os.getenv('STRIPE_PUBLISHABLE_KEY')
STRIPE_WEBHOOK_SECRET = os.getenv('STRIPE_WEBHOOK_SECRET')
SERPAPI_KEY = os.getenv('SERPAPI_KEY')
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET")
FLASK_SECRET = os.getenv("FLASK_SECRET", "dev")

# ========================================
# Gmail OAuth Configuration
# ========================================
GMAIL_SCOPES = [
    "https://www.googleapis.com/auth/gmail.compose",
    "https://www.googleapis.com/auth/gmail.readonly", 
    "https://www.googleapis.com/auth/gmail.send",
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile"
]

def get_oauth_redirect_uri():
    """Get the appropriate OAuth redirect URI based on environment"""
    env_uri = os.getenv("OAUTH_REDIRECT_URI")
    if env_uri:
        return env_uri
    # Auto-detect based on Flask environment
    is_production = os.getenv("FLASK_ENV") == "production" or os.getenv("RENDER")
    return (
        "https://www.offerloop.ai/api/google/oauth/callback"
        if is_production
        else "http://localhost:5001/api/google/oauth/callback"
    )

def get_frontend_redirect_uri():
    """Get the appropriate frontend redirect URI based on environment"""
    is_production = os.getenv("FLASK_ENV") == "production" or os.getenv("RENDER")
    return (
        "https://www.offerloop.ai/signin?connected=gmail"
        if is_production
        else "http://localhost:8080/signin?connected=gmail"
    )

OAUTH_REDIRECT_URI = get_oauth_redirect_uri()

# ========================================
# Constants
# ========================================
RESUME_LINE = "For context, I've attached my resume below."
COFFEE_CHAT_CREDITS = 30
CACHE_DURATION = timedelta(days=365)
CREATE_GMAIL_DRAFTS = False  # Set True to create Gmail drafts; False to only return subject/body and compose links

# ========================================
# Database Configuration
# ========================================
# Get absolute path to contacts.db in project root
_config_dir = os.path.dirname(os.path.abspath(__file__))  # backend/app/
_backend_dir = os.path.dirname(_config_dir)  # backend/
_project_root = os.path.dirname(_backend_dir)  # project root/
DB_PATH = os.path.join(_project_root, 'contacts.db')

# ========================================
# PDL Configuration
# ========================================
PDL_BASE_URL = 'https://api.peopledatalabs.com/v5'
pdl_cache = {}  # In-memory cache for PDL data

# ========================================
# Tier Configurations
# ========================================
TIER_CONFIGS = {
    'free': {
        'max_contacts': 3,   
        'min_contacts': 1,
        'fields': ['FirstName', 'LastName', 'LinkedIn', 'Email', 'Title', 'Company', 'City', 'State', 'College', 'Hometown'],
        'uses_pdl': True,
        'uses_email_drafting': True,
        'uses_resume': False,
        'credits': 150,
        'time_saved_minutes': 200,
        'description': 'Try out platform risk free'
    },
    'pro': {
        'max_contacts': 8,
        'min_contacts': 1, 
        'fields': ['FirstName', 'LastName', 'LinkedIn', 'Email', 'Title', 'Company', 'City', 'State', 'College',
                  'Phone', 'PersonalEmail', 'WorkEmail', 'SocialProfiles', 'EducationTop', 'VolunteerHistory',
                  'WorkSummary', 'Group', 'Hometown', 'Similarity'],
        'uses_pdl': True,
        'uses_email_drafting': True,
        'uses_resume': True,
        'credits': 1800,
        'time_saved_minutes': 1200,
        'description': 'Everything in free plus advanced features'
    }
}

# ========================================
# PDL Metro Areas
# ========================================
PDL_METRO_AREAS = {
    'san francisco': 'san francisco, california',
    'san francisco bay area': 'san francisco, california',
    'bay area': 'san francisco, california',
    'sf': 'san francisco, california',
    'los angeles': 'los angeles, california',
    'la': 'los angeles, california',
    'new york': 'new york, new york',
    'new york city': 'new york, new york',
    'nyc': 'new york, new york',
    'chicago': 'chicago, illinois',
    'boston': 'boston, massachusetts',
    'washington dc': 'washington, district of columbia',
    'dc': 'washington, district of columbia',
    'seattle': 'seattle, washington',
    'atlanta': 'atlanta, georgia',
    'dallas': 'dallas, texas',
    'houston': 'houston, texas',
    'miami': 'miami, florida',
    'denver': 'denver, colorado',
    'phoenix': 'phoenix, arizona',
    'philadelphia': 'philadelphia, pennsylvania',
    'detroit': 'detroit, michigan',
    'minneapolis': 'minneapolis, minnesota',
    'austin': 'austin, texas',
    'san diego': 'san diego, california',
    'portland': 'portland, oregon',
    'orlando': 'orlando, florida',
    'tampa': 'tampa, florida',
    'nashville': 'nashville, tennessee',
    'charlotte': 'charlotte, north carolina',
    'pittsburgh': 'pittsburgh, pennsylvania',
    'cleveland': 'cleveland, ohio',
    'cincinnati': 'cincinnati, ohio',
    'columbus': 'columbus, ohio',
    'indianapolis': 'indianapolis, indiana',
    'milwaukee': 'milwaukee, wisconsin',
    'kansas city': 'kansas city, missouri',
    'sacramento': 'sacramento, california',
    'las vegas': 'las vegas, nevada',
    'salt lake city': 'salt lake city, utah',
    'raleigh': 'raleigh, north carolina',
    'richmond': 'richmond, virginia',
    'birmingham': 'birmingham, alabama',
    'memphis': 'memphis, tennessee',
    'louisville': 'louisville, kentucky',
    'jacksonville': 'jacksonville, florida',
    'oklahoma city': 'oklahoma city, oklahoma',
    'buffalo': 'buffalo, new york',
    'rochester': 'rochester, new york',
    'albany': 'albany, new york',
    'hartford': 'hartford, connecticut',
    'providence': 'providence, rhode island'
}

# ========================================
# Validation
# ========================================
if not PEOPLE_DATA_LABS_API_KEY:
    print("WARNING: PEOPLE_DATA_LABS_API_KEY not found in .env file")

if not OPENAI_API_KEY:
    print("WARNING: OPENAI_API_KEY not found in .env file")

if STRIPE_SECRET_KEY:
    import stripe
    stripe.api_key = STRIPE_SECRET_KEY
    print("✓ Stripe initialized successfully")
else:
    print("WARNING: STRIPE_SECRET_KEY not found in .env file")

# OAuth insecure transport for localhost
if (os.environ.get("OAUTH_REDIRECT_URI") or "").startswith("http://localhost"):
    os.environ["OAUTHLIB_INSECURE_TRANSPORT"] = "1"

