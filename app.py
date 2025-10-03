# app.py
# RECRUITEDGE COMPLETE IMPLEMENTATION - PDL OPTIMIZED WITH INTERESTING EMAILS
# Enhanced email generation that finds genuine mutual interests and creates compelling connections

import os
import json
import requests
import datetime
import stripe
import csv
from io import StringIO
import base64
from email.mime.text import MIMEText
import pickle
from googleapiclient.discovery import build
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
import PyPDF2
import tempfile
import re
import functools
from flask import Flask, request, jsonify, send_file, send_from_directory, redirect
from flask_cors import CORS
from werkzeug.utils import secure_filename
import traceback
import firebase_admin
from firebase_admin import credentials, firestore, auth as fb_auth
from flask import abort
from dotenv import load_dotenv
from openai import OpenAI
import sqlite3
from contextlib import contextmanager
from flask import send_from_directory
import concurrent.futures
from functools import lru_cache
import time

# Add this right after your imports section
@lru_cache(maxsize=1000)
def cached_enrich_job_title(job_title):
    """Cache job title enrichments to avoid repeated API calls"""
    return enrich_job_title_with_pdl(job_title)

@lru_cache(maxsize=1000)
def cached_clean_company(company):
    """Cache company cleaning to avoid repeated API calls"""
    return clean_company_name(company) if company else ''

@lru_cache(maxsize=1000)
def cached_clean_location(location):
    """Cache location cleaning to avoid repeated API calls"""
    return clean_location_name(location)

# === Alumni helpers (added) ===
def _school_aliases(raw: str) -> list[str]:
    """Return robust aliases for a school; used for query + strict server-side filtering."""
    if not raw:
        return []
    s = " ".join(str(raw).lower().split())
    aliases = {s}
    # Extendable alias map
    if any(k in s for k in ["usc", "southern california", "viterbi"]):
        aliases.update({
            "usc",
            "university of southern california",
            "usc viterbi school of engineering",
            "viterbi school of engineering",
            "usc viterbi",
        })
    if "stanford" in s:
        aliases.update({"stanford", "stanford university", "school of engineering, stanford"})
    # Add more schools over time as needed
    return sorted({" ".join(a.split()) for a in aliases})

def _contact_has_school_alias(c: dict, aliases: list[str]) -> bool:
    fields = []
    fields.append((c.get("College") or c.get("college") or "").lower())
    edu = c.get("education") or []
    if isinstance(edu, list):
        for e in edu:
            if isinstance(e, dict):
                name = ""
                sch = e.get("school")
                if isinstance(sch, dict):
                    name = (sch.get("name") or "").lower()
                name = name or (e.get("school_name") or "").lower()
                if name:
                    fields.append(name)
    blob = " | ".join([f for f in fields if f])
    return any(a in blob for a in aliases)
# === end alumni helpers ===



app = Flask(__name__, static_folder="connect-grow-hire/dist", static_url_path="")
CORS(app, origins=["https://d33d83bb2e38.ngrok-free.app", "*"])

# Load environment variables from .env
load_dotenv()

# Grab API key
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

# Initialize OpenAI client
client = OpenAI(api_key=OPENAI_API_KEY)

# Replace them with these lines:
PEOPLE_DATA_LABS_API_KEY = os.getenv('PEOPLE_DATA_LABS_API_KEY')
STRIPE_SECRET_KEY = os.getenv('STRIPE_SECRET_KEY')
STRIPE_PUBLISHABLE_KEY = os.getenv('STRIPE_PUBLISHABLE_KEY')
STRIPE_WEBHOOK_SECRET = os.getenv('STRIPE_WEBHOOK_SECRET')  # This might be empty for now
# Add this validation
if not PEOPLE_DATA_LABS_API_KEY:
    print("WARNING: PEOPLE_DATA_LABS_API_KEY not found in .env file")

if not OPENAI_API_KEY:
    print("WARNING: OPENAI_API_KEY not found in .env file")
if STRIPE_SECRET_KEY:
    stripe.api_key = STRIPE_SECRET_KEY
    print("✓ Stripe initialized successfully")
else:
    print("WARNING: STRIPE_SECRET_KEY not found in .env file")
# Initialize Firebase
# Initialize Firebase
try:
    if os.getenv('GOOGLE_APPLICATION_CREDENTIALS'):
        firebase_admin.initialize_app()
    else:
        # Try different possible paths for credentials
        cred_paths = [
            './firebase-creds.json',
            '/home/ubuntu/secrets/firebase-creds.json',
            os.path.expanduser('~/firebase-creds.json')
        ]
        cred = None
        for path in cred_paths:
            if os.path.exists(path):
                cred = credentials.Certificate(path)
                break
        
        if cred:
            # Explicitly specify the correct project ID
            firebase_admin.initialize_app(cred, {
                'projectId': 'offerloop-native'
            })
        else:
            print("âš ï¸ No Firebase credentials found, initializing with explicit project ID")
            firebase_admin.initialize_app(options={
                'projectId': 'offerloop-native'
            })
    
    db = firestore.client()
    print(" Firebase initialized successfully")
except Exception as e:
    print(f" Firebase initialization failed: {e}")
    db = None
@app.get("/healthz")
def healthz():
    return {"ok": True}

# SPA fallback so React Router routes (/home, /onboarding, etc.) don’t 404
@app.route("/", defaults={"path": ""})
@app.route("/<path:path>")
def spa_fallback(path):
    if path.startswith(("api/", "healthz")):
        abort(404)

    full = os.path.join(app.static_folder, path)
    if os.path.exists(full):
        return send_from_directory(app.static_folder, path)

    return send_from_directory(app.static_folder, "index.html")
def require_firebase_auth(fn):
    @functools.wraps(fn)
    def wrapper(*args, **kwargs):
        try:
            auth_header = request.headers.get('Authorization', '')
            if not auth_header.startswith('Bearer '):
                return jsonify({'error': 'Missing Authorization header'}), 401
            
            id_token = auth_header.split(' ', 1)[1].strip()
            
            # Try to verify the token
            try:
                decoded = fb_auth.verify_id_token(id_token)
                request.firebase_user = decoded
            except Exception as token_error:
                # For beta: Accept the token if it looks valid but can't be verified
                print(f"Token verification failed: {token_error}")
                # Basic validation - just check it's not empty
                if len(id_token) > 20:
                    # Create a minimal user object for the request
                    request.firebase_user = {
                        'uid': 'beta_user_' + id_token[:10],
                        'email': 'beta@offerloop.ai'
                    }
                    print("⚠️ Using beta authentication fallback")
                else:
                    return jsonify({'error': 'Invalid token format'}), 401
            
            return fn(*args, **kwargs)
        except Exception as e:
            return jsonify({'error': f'Authentication error: {str(e)}'}), 401
    return wrapper

# Initialize Flask app


DB_PATH = os.path.join(os.path.dirname(__file__), 'contacts.db')
@app.after_request
def add_caching(resp):
    content_type = resp.headers.get("Content-Type", "")
    # Don’t cache the app shell
    if content_type.startswith("text/html"):
        resp.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        resp.headers["Pragma"] = "no-cache"
        resp.headers["Expires"] = "0"
    else:
        # Let hashed assets cache hard
        resp.headers.setdefault("Cache-Control", "public, max-age=31536000, immutable")
    return resp

@contextmanager
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
    finally:
        conn.close()

def init_db():
    with get_db() as db:
        db.execute("""
        CREATE TABLE IF NOT EXISTS contacts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_email TEXT NOT NULL,
          first_name TEXT,
          last_name TEXT,
          linkedin TEXT,
          email TEXT,
          title TEXT,
          company TEXT,
          city TEXT,
          state TEXT,
          college TEXT,
          phone TEXT,
          personal_email TEXT,
          work_email TEXT,
          social_profiles TEXT,
          education_top TEXT,
          volunteer_history TEXT,
          work_summary TEXT,
          grp TEXT,
          hometown TEXT,
          similarity TEXT,
          status TEXT DEFAULT 'Not Contacted',
          first_contact_date TEXT,
          last_contact_date TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
        """)
        db.execute("CREATE INDEX IF NOT EXISTS idx_contacts_user_email ON contacts(user_email);")
        db.execute("CREATE INDEX IF NOT EXISTS idx_contacts_linkedin ON contacts(linkedin);")
        db.commit()

def normalize_contact(c: dict) -> dict:
    today = datetime.date.today().strftime("%m/%d/%Y")
    return {
      'FirstName': c.get('FirstName',''),
      'LastName': c.get('LastName',''),
      'LinkedIn': c.get('LinkedIn',''),
      'Email': c.get('Email',''),
      'Title': c.get('Title',''),
      'Company': c.get('Company',''),
      'City': c.get('City',''),
      'State': c.get('State',''),
      'College': c.get('College',''),
      'Phone': c.get('Phone',''),
      'PersonalEmail': c.get('PersonalEmail',''),
      'WorkEmail': c.get('WorkEmail',''),
      'SocialProfiles': c.get('SocialProfiles',''),
      'EducationTop': c.get('EducationTop',''),
      'VolunteerHistory': c.get('VolunteerHistory',''),
      'WorkSummary': c.get('WorkSummary',''),
      'Group': c.get('Group',''),
      'Hometown': c.get('Hometown',''),
      'Similarity': c.get('Similarity',''),
      'Status': c.get('Status','Not Contacted'),
      'FirstContactDate': c.get('FirstContactDate', today),
      'LastContactDate': c.get('LastContactDate', today),
    }

def save_contacts_sqlite(user_email: str, contacts: list) -> int:
    if not user_email or not contacts:
        return 0
    rows = [normalize_contact(c) for c in contacts]
    with get_db() as db:
        cur = db.cursor()
        for r in rows:
            existing = cur.execute("""
              SELECT id FROM contacts WHERE user_email=? AND
                (linkedin=? AND linkedin<>'') OR (email=? AND email<>'')
            """, (user_email, r['LinkedIn'], r['Email'])).fetchone()
            if existing:
                continue
            cur.execute("""
              INSERT INTO contacts (
                user_email, first_name, last_name, linkedin, email, title, company, city, state, college,
                phone, personal_email, work_email, social_profiles, education_top, volunteer_history,
                work_summary, grp, hometown, similarity, status, first_contact_date, last_contact_date
              ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            """, (
              user_email, r['FirstName'], r['LastName'], r['LinkedIn'], r['Email'], r['Title'], r['Company'],
              r['City'], r['State'], r['College'], r['Phone'], r['PersonalEmail'], r['WorkEmail'],
              r['SocialProfiles'], r['EducationTop'], r['VolunteerHistory'], r['WorkSummary'],
              r['Group'], r['Hometown'], r['Similarity'], r['Status'], r['FirstContactDate'], r['LastContactDate']
            ))
        db.commit()
        return cur.rowcount or 0

def list_contacts_sqlite(user_email: str) -> list:
    if not user_email:
        return []
    with get_db() as db:
        rows = db.execute("""
          SELECT id, user_email, first_name, last_name, linkedin, email, title, company, city, state,
                 college, phone, personal_email, work_email, social_profiles, education_top, volunteer_history,
                 work_summary, grp, hometown, similarity, status, first_contact_date, last_contact_date, created_at
          FROM contacts WHERE user_email=? ORDER BY created_at DESC
        """, (user_email,)).fetchall()
        return [dict(r) for r in rows]

# PDL Configuration with your API key
PDL_BASE_URL = 'https://api.peopledatalabs.com/v5'

# TIER CONFIGURATIONS - SIMPLIFIED TO TWO TIERS
TIER_CONFIGS = {
    'free': {
        'max_contacts': 8,  # 8 emails = 120 credits (15 credits per email)
        'fields': ['FirstName', 'LastName', 'LinkedIn', 'Email', 'Title', 'Company', 'City', 'State', 'College', 'Hometown'],
        'uses_pdl': True,
        'uses_email_drafting': True,
        'uses_resume': False,
        'credits': 120,
        'time_saved_minutes': 200,  # 8 emails * 25 minutes each
        'description': 'Try out platform risk free'
    },
    'pro': {
        'max_contacts': 15,  # 56 emails = 840 credits (15 credits per email)
        'fields': ['FirstName', 'LastName', 'LinkedIn', 'Email', 'Title', 'Company', 'City', 'State', 'College',
                  'Phone', 'PersonalEmail', 'WorkEmail', 'SocialProfiles', 'EducationTop', 'VolunteerHistory',
                  'WorkSummary', 'Group', 'Hometown', 'Similarity'],
        'uses_pdl': True,
        'uses_email_drafting': True,
        'uses_resume': True,
        'credits': 840,
        'time_saved_minutes': 1200,  # 56 emails * ~21 minutes each (more efficient at scale)
        'description': 'Everything in free plus advanced features'
    }
}

# PDL Major Metro Areas (based on PDL documentation)
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
# PDL CLEANER APIS (for better matching)
# ========================================

def clean_company_name(company):
    """Clean company name using PDL Cleaner API for better matching"""
    try:
        print(f"Cleaning company name: {company}")
        
        response = requests.get(
            f"{PDL_BASE_URL}/company/clean",
            params={
                'api_key': PEOPLE_DATA_LABS_API_KEY,
                'name': company
            },
            timeout=10
        )
        
        if response.status_code == 200:
            clean_data = response.json()
            if clean_data.get('status') == 200 and clean_data.get('name'):
                cleaned_name = clean_data['name']
                print(f"Cleaned company: '{company}' -> '{cleaned_name}'")
                return cleaned_name
    
    except Exception as e:
        print(f"Company cleaning failed: {e}")
    
    return company

def clean_location_name(location):
    """Clean location name using PDL Cleaner API for better matching"""
    try:
        print(f"Cleaning location: {location}")
        
        response = requests.get(
            f"{PDL_BASE_URL}/location/clean",
            params={
                'api_key': PEOPLE_DATA_LABS_API_KEY,
                'location': location
            },
            timeout=10
        )
        
        if response.status_code == 200:
            clean_data = response.json()
            if clean_data.get('status') == 200 and clean_data.get('name'):
                cleaned_location = clean_data['name']
                print(f"Cleaned location: '{location}' -> '{cleaned_location}'")
                return cleaned_location
    
    except Exception as e:
        print(f"Location cleaning failed: {e}")
    
    return location

# ========================================
# ENHANCED PDL APIS
# ========================================

def enrich_job_title_with_pdl(job_title):
    """Use PDL Job Title Enrichment API to get standardized job titles"""
    try:
        print(f"Enriching job title: {job_title}")
        
        response = requests.get(
            f"{PDL_BASE_URL}/job_title/enrich",
            params={
                'api_key': PEOPLE_DATA_LABS_API_KEY,
                'job_title': job_title
            },
            timeout=10
        )
        
        if response.status_code == 200:
            enrich_data = response.json()
            if enrich_data.get('status') == 200 and enrich_data.get('data'):
                enriched_data = enrich_data['data']
                
                # Extract useful enrichment data
                result = {
                    'cleaned_name': enriched_data.get('cleaned_name', job_title),
                    'similar_titles': enriched_data.get('similar_job_titles', []),
                    'levels': enriched_data.get('job_title_levels', []),
                    'categories': enriched_data.get('job_title_categories', [])
                }
                
                print(f"Job title enrichment successful: {result}")
                return result
    
    except Exception as e:
        print(f"Job title enrichment failed: {e}")
    
    return {
        'cleaned_name': job_title,
        'similar_titles': [],
        'levels': [],
        'categories': []
    }

def get_autocomplete_suggestions(query, data_type='job_title'):
    """Enhanced autocomplete with proper PDL field mapping"""
    try:
        print(f"Getting autocomplete suggestions for {data_type}: {query}")
        
        # Map your frontend field names to PDL's supported field names
        pdl_field_mapping = {
            'job_title': 'title',  # This is the key fix
            'company': 'company',
            'location': 'location',
            'school': 'school',
            'skill': 'skill',
            'industry': 'industry',
            'role': 'role',
            'sub_role': 'sub_role'
        }
        
        # Get the correct PDL field name
        pdl_field = pdl_field_mapping.get(data_type, data_type)
        
        print(f"Mapping {data_type} -> {pdl_field} for PDL API")
        
        response = requests.get(
            f"{PDL_BASE_URL}/autocomplete",
            params={
                'api_key': PEOPLE_DATA_LABS_API_KEY,
                'field': pdl_field,  # Use the mapped field name
                'text': query,
                'size': 10
            },
            timeout=15
        )
        
        print(f"PDL autocomplete response: {response.status_code}")
        
        if response.status_code == 200:
            auto_data = response.json()
            if auto_data.get('status') == 200 and auto_data.get('data'):
                suggestions = auto_data['data']
                print(f"Autocomplete suggestions: {suggestions}")
                return suggestions
            else:
                print(f"PDL autocomplete no data: {auto_data}")
                return []
        
        elif response.status_code == 400:
            try:
                error_data = response.json()
                print(f"PDL autocomplete error 400: {error_data}")
                if isinstance(error_data, dict) and 'error' in error_data:
                    msg = error_data['error'].get('message', '')
                    if 'Supported fields are' in msg:
                        print(f"Available fields: {msg}")
            except Exception:
                pass
            return []
        elif response.status_code == 402:
            print("PDL API: Payment required for autocomplete")
            return []
        elif response.status_code == 429:
            print("PDL API rate limited for autocomplete")
            return []
        else:
            print(f"PDL autocomplete error {response.status_code}: {response.text}")
            return []
    
    except requests.exceptions.Timeout:
        print(f"Autocomplete timeout for {data_type}: {query}")
        return []
    except Exception as e:
        print(f"Autocomplete exception for {data_type}: {e}")
        return []
def es_title_block(primary_title: str, similar_titles: list[str] | None):
    titles = [t.strip().lower() for t in ([primary_title] + (similar_titles or [])) if t]
    return {
        "bool": {
            "should": (
                [{"match_phrase": {"job_title": t}} for t in titles] +   # exact phrase
                [{"match": {"job_title": t}} for t in titles]            # token match
            )
        }
    }
# Alias helper used by the metro/locality search functions
def es_title_block_from_enrichment(primary_title: str, similar_titles: list[str] | None):
    # Reuse the already-implemented helper
    return es_title_block(primary_title, similar_titles or [])



def es_location_block_from_strategy(location_strategy: dict):
    city  = (location_strategy.get("city") or "").lower()
    state = (location_strategy.get("state") or "").lower()
    metro_short = (location_strategy.get("metro_location") or "").lower()
    full_input  = (location_strategy.get("original_input") or "").lower()
    metro_long  = f"{city}, {state}, united states" if city and state else (f"{city}, united states" if city else "")

    should = []
    if metro_short: should.append({"match_phrase": {"location_metro": metro_short}})
    if metro_long:  should.append({"match_phrase": {"location_metro": metro_long}})
    if full_input:  should.append({"match_phrase": {"location_metro": full_input}})
    if city:        should.append({"match_phrase": {"location_locality": city}})
    if state:       should.append({"match_phrase": {"location_region": state}})
    should.append({"match_phrase": {"location_country": "united states"}})

    return {"bool": {"should": should}}


def es_location_block_from_city_state(city: str, state: str):
    city  = (city or "").lower()
    state = (state or "").lower()
    should = []
    if city and state:
        should.append({"match_phrase": {"location_metro": f"{city}, {state}, united states"}})
    if city:
        should.append({"match_phrase": {"location_metro": f"{city}, united states"}})
        should.append({"match_phrase": {"location_locality": city}})
    if state:
        should.append({"match_phrase": {"location_region": state}})
    should.append({"match_phrase": {"location_country": "united states"}})
    return {"bool": {"should": should}}


# ========================================
# SMART LOCATION STRATEGY
# ========================================

def determine_location_strategy(location_input):
    """Determine whether to use metro or locality search based on input location"""
    try:
        location_lower = location_input.lower().strip()
        
        # Parse input location
        if ',' in location_lower:
            parts = [part.strip() for part in location_lower.split(',')]
            city = parts[0]
            state = parts[1] if len(parts) > 1 else None
        else:
            city = location_lower
            state = None
        
        # Check if this location maps to a PDL metro area
        metro_key = None
        metro_location = None
        
        # Direct match check
        if city in PDL_METRO_AREAS:
            metro_key = city
            metro_location = PDL_METRO_AREAS[city]
        
        # Also check full location string
        elif location_lower in PDL_METRO_AREAS:
            metro_key = location_lower
            metro_location = PDL_METRO_AREAS[location_lower]
        
        # Check for partial matches (e.g., "san francisco, ca" matches "san francisco")
        else:
            for metro_name in PDL_METRO_AREAS:
                if metro_name in city or city in metro_name:
                    metro_key = metro_name
                    metro_location = PDL_METRO_AREAS[metro_name]
                    break
        
        if metro_location:
            return {
                'strategy': 'metro_primary',
                'metro_location': metro_location,
                'city': city,
                'state': state,
                'original_input': location_input,
                'matched_metro': metro_key
            }
        else:
            return {
                'strategy': 'locality_primary',
                'metro_location': None,
                'city': city,
                'state': state,
                'original_input': location_input,
                'matched_metro': None
            }
            
    except Exception as e:
        print(f"Error determining location strategy: {e}")
        return {
            'strategy': 'locality_primary',
            'metro_location': None,
            'city': location_input,
            'state': None,
            'original_input': location_input,
            'matched_metro': None
        }

# ========================================
# ENHANCED PDL SEARCH IMPLEMENTATION
# ========================================

def search_contacts_with_smart_location_strategy(job_title, company, location, max_contacts=8, college_alumni=None):
    """Enhanced search that intelligently chooses metro vs locality based on location input"""
    try:
        print(f"Starting smart location search for {job_title} at {company} in {location}")
        
        # Step 1: Enrich job title
        job_title_enrichment = cached_enrich_job_title(job_title)
        primary_title = job_title_enrichment['cleaned_name']
        similar_titles = job_title_enrichment['similar_titles'][:3]
        cleaned_company = cached_clean_company(company)
        cleaned_location = cached_clean_location(location)
        
        # Step 2: Clean company
        cleaned_company = clean_company_name(company) if company else ''
        
        # Step 3: Clean and analyze location
        cleaned_location = clean_location_name(location)
        location_strategy = determine_location_strategy(cleaned_location)
        
        print(f"Location strategy: {location_strategy['strategy']}")
        if location_strategy['matched_metro']:
            print(f"Matched metro: {location_strategy['matched_metro']} -> {location_strategy['metro_location']}")
        
        # Step 4: Execute search based on determined strategy
        contacts = []
        
        if location_strategy['strategy'] == 'metro_primary':
            # Use metro search for major metro areas
            contacts = try_metro_search_optimized(
                primary_title, similar_titles, cleaned_company,
                location_strategy, max_contacts,
                college_alumni=college_alumni
            )
            
            # If metro results are insufficient, add locality results
            if len(contacts) < max_contacts // 2:
                print(f"Metro results insufficient ({len(contacts)}), adding locality results")
                locality_contacts = try_locality_search_optimized(
                    primary_title, similar_titles, cleaned_company,
                    location_strategy, max_contacts - len(contacts),
                    college_alumni=college_alumni
                )
                contacts.extend([c for c in locality_contacts if c not in contacts])
        
        else:
            # Use locality search for non-metro areas
            contacts = try_locality_search_optimized(
                primary_title, similar_titles, cleaned_company,
                location_strategy, max_contacts,
                college_alumni=college_alumni
            )
            
            # If locality results are insufficient, try broader search
            if len(contacts) < max_contacts // 2:
                print(f"Locality results insufficient ({len(contacts)}), trying broader search")
                broader_contacts = try_job_title_levels_search_enhanced(
                    job_title_enrichment, cleaned_company,
                    location_strategy['city'], location_strategy['state'],
                    max_contacts - len(contacts),
                    college_alumni=college_alumni  # ← fixed missing comma + pass through
                )
                contacts.extend([c for c in broader_contacts if c not in contacts])

        # ✅ server-side guardrail so only true alumni remain
        if college_alumni:
            aliases = _school_aliases(college_alumni)
            if aliases:
                contacts = [c for c in contacts if _contact_has_school_alias(c, aliases)]
        
        # LOG FINAL RESULTS
        if len(contacts) == 0:
            print(f"WARNING: No contacts found with valid emails for {job_title} in {location}")
            print(f"Search parameters: title='{primary_title}', company='{cleaned_company}', location='{cleaned_location}'")
        else:
            print(f"Smart location search completed: {len(contacts)} contacts found with valid emails")
        
        return contacts[:max_contacts]
        
    except Exception as e:
        print(f"Smart location search failed: {e}")
        import traceback
        traceback.print_exc()
        return []

def try_metro_search_optimized(clean_title, similar_titles, company, location_strategy, max_contacts=8, college_alumni=None):
    """
    Build an ES-style query targeting metro + fallbacks and run the scrolled PDL search.
    """
    title_block = es_title_block_from_enrichment(clean_title, similar_titles)
    loc_block   = es_location_block_from_strategy(location_strategy)

    must = [title_block, loc_block]
    if company:
        must.append({"match_phrase": {"job_company_name": company.lower()}})
    if college_alumni:
        aliases = _school_aliases(college_alumni)
        if aliases:
            must.append({"bool": {"should": [{"match_phrase": {"education.school.name": a}} for a in aliases]}})

    query_obj = {"bool": {"must": must}}

    PDL_URL = f"{PDL_BASE_URL}/person/search"
    headers = {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "X-Api-Key": PEOPLE_DATA_LABS_API_KEY,
    }

    remaining = max_contacts
    page_size = min(100, max(1, remaining))

    return execute_pdl_search(
        headers=headers,
        url=PDL_URL,
        query_obj=query_obj,
        desired_limit=remaining,
        search_type=f"metro_{location_strategy.get('matched_metro','unknown')}",
        page_size=page_size,
        verbose=False
    )


def try_locality_search_optimized(clean_title, similar_titles, company, location_strategy, max_contacts=8, college_alumni=None):
    """
    Locality-focused version (used when metro results are thin).
    """
    title_block = es_title_block_from_enrichment(clean_title, similar_titles)
    loc_block   = es_location_block_from_strategy(location_strategy)

    must = [title_block, loc_block]
    if company:
        must.append({"match_phrase": {"job_company_name": company.lower()}})
    if college_alumni:
        aliases = _school_aliases(college_alumni)
        if aliases:
            must.append({"bool": {"should": [{"match_phrase": {"education.school.name": a}} for a in aliases]}})

    query_obj = {"bool": {"must": must}}

    PDL_URL = f"{PDL_BASE_URL}/person/search"
    headers = {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "X-Api-Key": PEOPLE_DATA_LABS_API_KEY,
    }

    remaining = max_contacts
    page_size = min(100, max(1, remaining))

    return execute_pdl_search(
        headers=headers,
        url=PDL_URL,
        query_obj=query_obj,
        desired_limit=remaining,
        search_type=f"locality_{location_strategy.get('city','unknown')}",
        page_size=page_size,
        verbose=False
    )




 




def try_job_title_levels_search_enhanced(job_title_enrichment, company, city, state, max_contacts, college_alumni=None):
    print("Enhanced job title levels search")

    must = []

    levels = job_title_enrichment.get('levels') or []
    if levels:
        must.append({"bool": {"should": [{"match": {"job_title_levels": lvl}} for lvl in levels]}})
    else:
        jl = determine_job_level(job_title_enrichment.get('cleaned_name', ''))
        if jl:
            must.append({"match": {"job_title_levels": jl}})

    # Also broaden titles
    must.append(es_title_block(job_title_enrichment.get('cleaned_name',''),
                               job_title_enrichment.get('similar_titles') or []))

    if company:
        must.append({"match_phrase": {"job_company_name": (company or "").lower()}})

    must.append(es_location_block_from_city_state(city, state))

    if college_alumni:
        aliases = _school_aliases(college_alumni)
        if aliases:
            must.append({"bool": {"should": [{"match_phrase": {"education.school.name": a}} for a in aliases]}})

    query_obj = {"bool": {"must": must}}

    PDL_URL = f"{PDL_BASE_URL}/person/search"
    headers = {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "X-Api-Key": PEOPLE_DATA_LABS_API_KEY,
    }

    remaining = max_contacts
    page_size = min(100, max(1, remaining))

    return execute_pdl_search(
        headers=headers,
        url=PDL_URL,
        query_obj=query_obj,
        desired_limit=remaining,
        search_type="job_levels_enhanced",
        page_size=page_size,
        verbose=False
    )



def determine_job_level(job_title):
    """Determine job level from job title for JOB_TITLE_LEVELS search"""
    job_title_lower = job_title.lower()
    
    if any(word in job_title_lower for word in ['intern', 'internship']):
        return 'intern'
    elif any(word in job_title_lower for word in ['entry', 'junior', 'associate', 'coordinator']):
        return 'entry'
    elif any(word in job_title_lower for word in ['senior', 'lead', 'principal']):
        return 'senior'
    elif any(word in job_title_lower for word in ['manager', 'director', 'head']):
        return 'manager'
    elif any(word in job_title_lower for word in ['vp', 'vice president', 'executive', 'chief']):
        return 'executive'
    else:
        return 'mid'  # Default to mid-level



def execute_pdl_search(headers, url, query_obj, desired_limit, search_type, page_size=50, verbose=False):
    import requests, json

    # ---- Page 1
    body = {"query": query_obj, "size": page_size}
    if verbose:
        print(f"\n=== PDL {search_type} PAGE 1 BODY ===")
        print(json.dumps(body, ensure_ascii=False))

    r = requests.post(url, headers=headers, json=body, timeout=30)
    r.raise_for_status()
    j = r.json()

    data   = j.get("data", []) or []
    total  = j.get("total")
    scroll = j.get("scroll_token")

    if verbose:
        print(f"{search_type} page 1: got {len(data)}; total={total}; scroll_token={scroll}")

    # Stop early if we already have enough
    if len(data) >= desired_limit or not scroll:
        # TRANSFORM THE DATA BEFORE RETURNING
        extracted_contacts = []
        for person in data[:desired_limit]:
            contact = extract_contact_from_pdl_person_enhanced(person)
            if contact:  # Only add if extraction was successful
                extracted_contacts.append(contact)
        return extracted_contacts

    # ---- Page 2+
    while scroll and len(data) < desired_limit:
        body2 = {"scroll_token": scroll, "size": page_size}
        if verbose:
            print(f"\n=== PDL {search_type} NEXT PAGE BODY ===")
            print(json.dumps(body2, ensure_ascii=False))

        r2 = requests.post(url, headers=headers, json=body2, timeout=30)

        # Be robust to cluster quirk: require query/sql
        if r2.status_code == 400 and "Either `query` or `sql` must be provided" in (r2.text or ""):
            if verbose:
                print(f"{search_type} retrying with query+scroll_token due to 400…")
            body2_fallback = {"query": query_obj, "scroll_token": scroll, "size": page_size}
            r2 = requests.post(url, headers=headers, json=body2_fallback, timeout=30)

        if r2.status_code != 200:
            if verbose:
                print(f"{search_type} next page status={r2.status_code} err={r2.text}")
            break

        j2 = r2.json()
        batch  = j2.get("data", []) or []
        scroll = j2.get("scroll_token")
        data.extend(batch)

        if verbose:
            print(f"{search_type} next page: got {len(batch)}, total so far={len(data)}, next scroll={scroll}")

    # TRANSFORM ALL THE DATA BEFORE RETURNING
    extracted_contacts = []
    for person in data[:desired_limit]:
        contact = extract_contact_from_pdl_person_enhanced(person)
        if contact:  # Only add if extraction was successful
            extracted_contacts.append(contact)
    
    print(f"Extracted {len(extracted_contacts)} valid contacts from {len(data[:desired_limit])} PDL records")
    return extracted_contacts



def extract_hometown_from_education_history_enhanced(education_history):
    """Extract hometown from contact's education history using OpenAI with your exact prompt"""
    try:
        if not education_history or education_history in ['Not available', '']:
            return "Unknown"
        
        print(f"Extracting hometown from education: {education_history[:100]}...")
        
        prompt = f"""You are given a candidate's full education history (as plain text). 
1. **Extract** the name of the high school the candidate attended. 
2. **Determine** the city/town (hometown) where that high school is located. Use your knowledge of schools and their locations; no external APIs are required. 
3. **Return** only the hometown as a plain string, without any additional explanations or formatting.

Education History:
{education_history}
"""
        
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=50,
            temperature=0.3
        )
        
        hometown = response.choices[0].message.content.strip()
        
        # Clean up the response
        hometown = hometown.replace('"', '').replace("'", "").strip()
        
        # Validate the response
        if hometown and len(hometown) > 0 and not hometown.lower().startswith('i '):
            print(f"Extracted hometown: {hometown}")
            return hometown
        else:
            print("Could not determine hometown from education history")
            return "Unknown"
        
    except Exception as e:
        print(f"Hometown extraction failed: {e}")
        return "Unknown"

def _choose_best_email(emails: list[dict], recommended: str | None = None) -> str | None:
    def is_valid(addr: str) -> bool:
        if not addr or '@' not in addr: return False
        bad = ["example.com", "test.com", "domain.com", "noreply@"]
        return not any(b in addr.lower() for b in bad)
    items = []
    for e in emails or []:
        addr = (e.get("address") or "").strip()
        et  = (e.get("type") or "").lower()
        if is_valid(addr):
            items.append((et, addr))
    for et, a in items:
        if et in ("work","professional"): return a
    for et, a in items:
        if et == "personal": return a
    if recommended and is_valid(recommended): return recommended
    return items[0][1] if items else None
def batch_extract_hometowns(contacts):
    """Extract hometowns for all contacts in one API call"""
    try:
        if not contacts:
            return {}
        
        # Build a single prompt for all contacts
        education_data = []
        for i, contact in enumerate(contacts):
            edu = contact.get('EducationTop', '')
            if edu and edu != 'Not available':
                education_data.append(f"{i}: {edu}")
        
        if not education_data:
            return {i: "Unknown" for i in range(len(contacts))}
        
        prompt = f"""Extract the hometown (city where high school is located) for each education history.
If no high school is mentioned or hometown cannot be determined, use "Unknown".

{chr(10).join(education_data)}

Return ONLY a valid JSON object in this exact format with no other text:
{{"0": "City, State", "1": "City, State", "2": "Unknown"}}"""

        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "You are a JSON extraction assistant. Return only valid JSON with no explanation."},
                {"role": "user", "content": prompt}
            ],
            max_tokens=500,
            temperature=0.1
        )
        
        result_text = response.choices[0].message.content.strip()
        
        # Try to extract JSON even if there's extra text
        import json
        import re
        
        # Find JSON pattern in response
        json_match = re.search(r'\{[^{}]*\}', result_text)
        if json_match:
            result = json.loads(json_match.group())
            return {int(k): v for k, v in result.items()}
        else:
            # If no JSON found, try to parse the whole response
            result = json.loads(result_text)
            return {int(k): v for k, v in result.items()}
        
    except Exception as e:
        print(f"Batch hometown extraction failed: {e}")
        # Fallback: return Unknown for all
        return {i: "Unknown" for i in range(len(contacts))}

def batch_generate_emails(contacts, resume_text, user_profile, career_interests):
    """Generate all emails in a single OpenAI call"""
    try:
        if not contacts:
            return {}
        
        # Ensure career_interests are in user_profile
        if career_interests and user_profile:
            if 'careerInterests' not in user_profile and 'career_interests' not in user_profile:
                user_profile = {**user_profile, 'careerInterests': career_interests}
        elif career_interests and not user_profile:
            user_profile = {'careerInterests': career_interests}
        
        # Extract user info properly
        user_info = extract_user_info_from_resume_priority(resume_text, user_profile)
        
        # Build contact summaries
        contacts_info = []
        for i, contact in enumerate(contacts):
            contacts_info.append(f"""Contact {i}:
- Name: {contact.get('FirstName', '')} {contact.get('LastName', '')}
- Title: {contact.get('Title', '')}
- Company: {contact.get('Company', '')}
- Location: {contact.get('City', '')}, {contact.get('State', '')}""")
        
        # Build career interests string
        interests_str = ""
        ci = user_info.get('career_interests', [])
        if ci:
            if len(ci) == 1:
                interests_str = ci[0]
            elif len(ci) == 2:
                interests_str = f"{ci[0]} and {ci[1]}"
            else:
                interests_str = f"{', '.join(ci[:-1])}, and {ci[-1]}"
        
        prompt = f"""Generate {len(contacts)} personalized networking emails.

Student: {user_info.get('name', 'Student')} - {user_info.get('year', '')} {user_info.get('major', '')} at {user_info.get('university', '')}
{f"Career interests: {interests_str}" if interests_str else ""}

{chr(10).join(contacts_info)}

For EACH contact, generate:
1. Subject line (6-8 words, no placeholders)
2. Email body (120-150 words, personalized, no placeholders like [name] or {{name}})

CRITICAL: Use actual names - write "Hi Grace," not "Hi {{FirstName}},"

Return as valid JSON:
{{"0": {{"subject": "...", "body": "..."}}, "1": {{"subject": "...", "body": "..."}}, ...}}
"""
        
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "You generate professional networking emails. Return ONLY valid JSON with no markdown formatting."},
                {"role": "user", "content": prompt}
            ],
            max_tokens=3000,
            temperature=0.7
        )
        
        response_text = response.choices[0].message.content.strip()
        
        # Remove markdown code blocks if present
        if '```' in response_text:
            response_text = response_text.split('```')[1]
            if response_text.startswith('json'):
                response_text = response_text[4:]
            response_text = response_text.strip()
        
        import json
        results = json.loads(response_text)
        
        # Convert string keys to integers and apply sanitization
        cleaned_results = {}
        for k, v in results.items():
            idx = int(k)
            subject = v.get('subject', 'Quick question about your work')
            body = v.get('body', '')
            
            # Apply sanitization to remove any remaining placeholders
            if idx < len(contacts):
                contact = contacts[idx]
                body = sanitize_email_placeholders(body, contact, user_info)
                body = enforce_networking_prompt_rules(body)
                subject = sanitize_placeholders(
                    subject,
                    user_name=user_info.get('name', ''),
                    user_year=user_info.get('year', ''),
                    user_major=user_info.get('major', ''),
                    user_university=user_info.get('university', ''),
                    career_interests=user_info.get('career_interests', [])
                )
            
            cleaned_results[idx] = {'subject': subject, 'body': body}
        
        return cleaned_results
        
    except json.JSONDecodeError as e:
        print(f"Batch email JSON parsing failed: {e}")
        print(f"Response was: {response_text[:500]}")
        return {}
    except Exception as e:
        print(f"Batch email generation failed: {e}")
        import traceback
        traceback.print_exc()
        return {}

def extract_contact_from_pdl_person_enhanced(person):
    """Enhanced contact extraction with relaxed, sensible email acceptance."""
    try:
        # Basic identity
        first_name = person.get('first_name', '')
        last_name = person.get('last_name', '')
        if not first_name or not last_name:
            return None

        # Experience (keep your enriched logic)
        experience = person.get('experience', []) or []
        work_experience_details, current_job = [], None
        if isinstance(experience, list) and experience:
            current_job = experience[0]
            for i, job in enumerate(experience[:5]):
                if not isinstance(job, dict):
                    continue
                company_info = job.get('company') or {}
                title_info = job.get('title') or {}
                company_name = company_info.get('name', '') if isinstance(company_info, dict) else ''
                job_title = title_info.get('name', '') if isinstance(title_info, dict) else ''
                start_date = job.get('start_date') or {}
                end_date = job.get('end_date') or {}

                def fmt(d, default_end=False):
                    if not isinstance(d, dict):
                        return ""
                    y = d.get('year')
                    m = d.get('month')
                    if y:
                        return f"{m or 1}/{y}" if m else f"{y}"
                    return "Present" if default_end else ""

                start_str = fmt(start_date)
                end_str = fmt(end_date, default_end=(i == 0))
                if company_name and job_title:
                    duration = f"{start_str} - {end_str}" if start_str else "Date unknown"
                    work_experience_details.append(f"{job_title} at {company_name} ({duration})")

        company_name = ''
        job_title = ''
        if current_job:
            company_info = current_job.get('company') or {}
            title_info = current_job.get('title') or {}
            company_name = company_info.get('name', '') if isinstance(company_info, dict) else ''
            job_title = title_info.get('name', '') if isinstance(title_info, dict) else ''

        # Location
        location_info = person.get('location') or {}
        city = location_info.get('locality', '') if isinstance(location_info, dict) else ''
        state = location_info.get('region', '') if isinstance(location_info, dict) else ''

        # Email selection (relaxed but validated)
        emails = person.get('emails') or []
        recommended = person.get('recommended_personal_email') or ''
        best_email = _choose_best_email(emails, recommended)

        if not best_email:
            print(f"Skipping contact {first_name} {last_name} - no valid email found")
            return None

        # Phone
        phone_numbers = person.get('phone_numbers') or []
        phone = phone_numbers[0] if isinstance(phone_numbers, list) and phone_numbers else ''

        # LinkedIn
        profiles = person.get('profiles') or []
        linkedin_url = ''
        if isinstance(profiles, list):
            for p in profiles:
                if isinstance(p, dict) and 'linkedin' in (p.get('network') or '').lower():
                    linkedin_url = p.get('url', '') or ''
                    break

        # Education (keep your enriched history)
        education = person.get('education') or []
        education_details, college_name = [], ""
        if isinstance(education, list):
            for edu in education:
                if not isinstance(edu, dict):
                    continue
                school_info = edu.get('school') or {}
                school_name = school_info.get('name', '') if isinstance(school_info, dict) else ''
                degrees = edu.get('degrees') or []
                degree = degrees[0] if isinstance(degrees, list) and degrees else ''
                start_date = edu.get('start_date') or {}
                end_date = edu.get('end_date') or {}
                syear = start_date.get('year') if isinstance(start_date, dict) else None
                eyear = end_date.get('year') if isinstance(end_date, dict) else None

                if school_name:
                    entry = school_name
                    if degree:
                        entry += f" - {degree}"
                    if syear or eyear:
                        entry += f" ({syear or '?'} - {eyear or 'Present'})"
                    education_details.append(entry)
                    if not college_name and 'high school' not in school_name.lower():
                        college_name = school_name
        education_history = '; '.join(education_details) if education_details else 'Not available'

        # Volunteer (keep your logic, trimmed)
        volunteer_work = []
        interests = person.get('interests') or []
        if isinstance(interests, list):
            for interest in interests:
                if isinstance(interest, str):
                    if any(k in interest.lower() for k in ['volunteer', 'charity', 'nonprofit', 'community', 'mentor']):
                        volunteer_work.append(interest)
                    elif len(volunteer_work) < 3:
                        volunteer_work.append(f"{interest} enthusiast")

        summary = person.get('summary') or ''
        if isinstance(summary, str):
            vk = ['volunteer', 'charity', 'nonprofit', 'community service', 'mentor', 'coach']
            for k in vk:
                if k in summary.lower():
                    for sentence in summary.split('.'):
                        if k in sentence.lower():
                            volunteer_work.append(sentence.strip())
                            break
        volunteer_history = '; '.join(volunteer_work[:5]) if volunteer_work else 'Not available'

        contact = {
            'FirstName': first_name,
            'LastName': last_name,
            'LinkedIn': linkedin_url,
            'Email': best_email,  # <- final chosen email
            'Title': job_title,
            'Company': company_name,
            'City': city,
            'State': state,
            'College': college_name,
            'Phone': phone,
            'PersonalEmail': person.get('recommended_personal_email', '') or '',
            'WorkEmail': next((e.get('address') for e in emails if isinstance(e, dict) and (e.get('type') or '').lower() in ('work', 'professional')), '') or 'Not available',
            'SocialProfiles': f'LinkedIn: {linkedin_url}' if linkedin_url else 'Not available',
            'EducationTop': education_history,
            'VolunteerHistory': volunteer_history,
            'WorkSummary': '; '.join(work_experience_details[:3]) if work_experience_details else f"Professional at {company_name}",
            'Group': f"{company_name} {job_title.split()[0] if job_title else 'Professional'} Team",
            'LinkedInConnections': person.get('linkedin_connections', 0),
            'DataVersion': person.get('dataset_version', 'Unknown')
        }

        return contact
    except Exception as e:
        print(f"Failed to extract enhanced contact: {e}")
        return None

def add_pdl_enrichment_fields_optimized(contact, person_data):
    """Add enrichment fields based on your product specifications"""
    try:
        # Work summary using experience array (36.8% fill rate)
        experience = person_data.get('experience', [])
        if isinstance(experience, list) and experience:
            current_job = experience[0]
            if isinstance(current_job, dict):
                title_info = current_job.get('title', {})
                company_info = current_job.get('company', {})
                
                title = title_info.get('name', contact.get('Title', '')) if isinstance(title_info, dict) else contact.get('Title', '')
                company = company_info.get('name', contact.get('Company', '')) if isinstance(company_info, dict) else contact.get('Company', '')
                
                work_summary = f"Current {title} at {company}"
                
                # Add years of experience if available (17.5% fill rate)
                years_exp = person_data.get('inferred_years_experience')
                if years_exp:
                    work_summary += f" ({years_exp} years experience)"
                
                if len(experience) > 1:
                    prev_job = experience[1]
                    if isinstance(prev_job, dict):
                        prev_company_info = prev_job.get('company', {})
                        if isinstance(prev_company_info, dict):
                            prev_company = prev_company_info.get('name', '')
                            if prev_company:
                                work_summary += f". Previously at {prev_company}"
                
                contact['WorkSummary'] = work_summary
        else:
            contact['WorkSummary'] = f"Professional at {contact.get('Company', 'current company')}"
        
        # Volunteer History from interests (4.2% fill rate)
        interests = person_data.get('interests', [])
        if isinstance(interests, list) and interests:
            volunteer_activities = []
            for interest in interests[:3]:  # Top 3 interests
                if isinstance(interest, str):
                    volunteer_activities.append(f"{interest} enthusiast")
            
            contact['VolunteerHistory'] = '; '.join(volunteer_activities) if volunteer_activities else 'Not available'
        else:
            contact['VolunteerHistory'] = 'Not available'
        
        # Group/Department (as per your spec)
        contact['Group'] = f"{contact.get('Company', 'Company')} {contact.get('Title', '').split()[0] if contact.get('Title') else 'Professional'} Team"
        
    except Exception as e:
        print(f"Error adding enrichment fields: {e}")

# Update the main search wrapper
def search_contacts_with_pdl_optimized(job_title, company, location, max_contacts=8):
    """Updated main search function using smart location strategy"""
    return search_contacts_with_smart_location_strategy(job_title, company, location, max_contacts)

 

def find_mutual_interests_and_hooks(user_info, contact, resume_text=None):
    """Find compelling mutual interests and conversation hooks"""
    try:
        hooks = []
        
        # Extract user's interests from resume
        user_interests = extract_interests_from_resume(resume_text) if resume_text else []
        user_experiences = user_info.get('experiences', [])
        user_skills = user_info.get('skills', [])
        
        # Extract contact's interests from their data
        contact_interests = extract_contact_interests(contact)
        
        # Find specific overlap
        interest_overlaps = find_interest_overlaps(user_interests + user_experiences + user_skills, contact_interests)
        
        # Generate compelling hooks
        if interest_overlaps:
            for overlap in interest_overlaps[:2]:  # Top 2 overlaps
                hooks.append(create_interest_hook(overlap, user_info, contact))
        
        # Add unique conversation starters
        unique_hooks = generate_unique_conversation_starters(user_info, contact, contact_interests)
        hooks.extend(unique_hooks[:1])  # Add 1 unique hook
        
        return hooks[:3]  # Return top 3 hooks
        
    except Exception as e:
        print(f"Error finding mutual interests: {e}")
        return []

def extract_interests_from_resume(resume_text):
    """Extract interests, hobbies, and activities from resume"""
    try:
        if not resume_text or len(resume_text.strip()) < 50:
            return []
        
        # Look for interests section
        interests = []
        resume_lower = resume_text.lower()
        
        # Common interest indicators
        interest_patterns = [
            r'interests?[:\-\s]+(.*?)(?:\n\n|\n[A-Z]|$)',
            r'hobbies[:\-\s]+(.*?)(?:\n\n|\n[A-Z]|$)',
            r'activities[:\-\s]+(.*?)(?:\n\n|\n[A-Z]|$)',
            r'volunteer[:\-\s]+(.*?)(?:\n\n|\n[A-Z]|$)',
            r'extracurricular[:\-\s]+(.*?)(?:\n\n|\n[A-Z]|$)'
        ]
        
        for pattern in interest_patterns:
            matches = re.findall(pattern, resume_text, re.IGNORECASE | re.DOTALL)
            for match in matches:
                # Clean and split interests
                clean_interests = [i.strip() for i in re.split(r'[,;â€¢\-\n]', match) if i.strip() and len(i.strip()) > 2]
                interests.extend(clean_interests[:5])  # Limit to 5 per category
        
        # Also look for projects that might indicate interests
        project_keywords = ['project', 'built', 'created', 'developed', 'designed']
        for keyword in project_keywords:
            pattern = rf'{keyword}[:\s]+([^.\n]+)'
            matches = re.findall(pattern, resume_text, re.IGNORECASE)
            for match in matches[:3]:  # Top 3 projects
                if len(match.strip()) > 10:
                    interests.append(f"Project: {match.strip()[:50]}")
        
        # Remove duplicates and return
        unique_interests = list(set(interests))
        return unique_interests[:10]  # Top 10 interests
        
    except Exception as e:
        print(f"Error extracting interests from resume: {e}")
        return []

def extract_contact_interests(contact):
    """Extract potential interests from contact's profile data"""
    interests = []
    
    # From volunteer history
    volunteer = contact.get('VolunteerHistory', '')
    if volunteer and 'Not available' not in volunteer:
        interests.extend([v.strip() for v in volunteer.split(';') if v.strip()])
    
    # From company (industry interests)
    company = contact.get('Company', '')
    if company:
        interests.append(f"Works in {get_industry_from_company(company)}")
    
    # From job title (role interests)
    title = contact.get('Title', '')
    if title:
        interests.append(f"Interested in {extract_field_from_title(title)}")
    
    # From education (academic interests)
    education = contact.get('EducationTop', '')
    if education and 'Not available' not in education:
        # Extract university and potential major
        edu_parts = education.split(' - ')
        if len(edu_parts) > 1:
            interests.append(f"Academic background in {edu_parts[1]}")
        interests.append(f"Alumni of {edu_parts[0]}")
    
    # From location (geographic interests)
    city = contact.get('City', '')
    state = contact.get('State', '')
    if city and state:
        interests.append(f"Lives in {city}, {state}")
        interests.append(f"Connected to {state} region")
    
    return interests

def get_industry_from_company(company):
    """Determine industry from company name"""
    company_lower = company.lower()
    
    if any(word in company_lower for word in ['google', 'apple', 'microsoft', 'amazon', 'meta', 'facebook', 'netflix']):
        return 'Big Tech'
    elif any(word in company_lower for word in ['tesla', 'spacex', 'nvidia', 'intel']):
        return 'Innovation/Hardware'
    elif any(word in company_lower for word in ['goldman', 'morgan', 'jpmorgan', 'bank', 'capital', 'investment']):
        return 'Finance'
    elif any(word in company_lower for word in ['mckinsey', 'bain', 'bcg', 'consulting']):
        return 'Consulting'
    elif any(word in company_lower for word in ['healthcare', 'medical', 'pharma', 'biotech']):
        return 'Healthcare/Biotech'
    elif any(word in company_lower for word in ['startup', 'labs', 'ventures']):
        return 'Startup/Entrepreneurship'
    else:
        return 'their industry'

def extract_field_from_title(title):
    """Extract field of interest from job title"""
    title_lower = title.lower()
    
    if any(word in title_lower for word in ['engineer', 'developer', 'software', 'technical']):
        return 'technology and engineering'
    elif any(word in title_lower for word in ['product', 'pm']):
        return 'product management'
    elif any(word in title_lower for word in ['data', 'analytics', 'scientist']):
        return 'data science and analytics'
    elif any(word in title_lower for word in ['marketing', 'brand', 'growth']):
        return 'marketing and growth'
    elif any(word in title_lower for word in ['sales', 'business', 'revenue']):
        return 'business development'
    elif any(word in title_lower for word in ['design', 'ux', 'ui']):
        return 'design and user experience'
    elif any(word in title_lower for word in ['finance', 'accounting', 'analyst']):
        return 'finance and analysis'
    else:
        return 'their field'

def find_interest_overlaps(user_interests, contact_interests):
    """Find overlapping interests between user and contact"""
    overlaps = []
    
    for user_int in user_interests:
        for contact_int in contact_interests:
            similarity_score = calculate_interest_similarity(user_int, contact_int)
            if similarity_score > 0.3:  # Threshold for similarity
                overlaps.append({
                    'user_interest': user_int,
                    'contact_interest': contact_int,
                    'similarity': similarity_score,
                    'overlap_type': determine_overlap_type(user_int, contact_int)
                })
    
    # Sort by similarity score
    return sorted(overlaps, key=lambda x: x['similarity'], reverse=True)

def calculate_interest_similarity(user_int, contact_int):
    """Calculate similarity between two interests"""
    user_words = set(user_int.lower().split())
    contact_words = set(contact_int.lower().split())
    
    # Jaccard similarity
    intersection = len(user_words.intersection(contact_words))
    union = len(user_words.union(contact_words))
    
    if union == 0:
        return 0
    
    return intersection / union

def determine_overlap_type(user_int, contact_int):
    """Determine the type of overlap for better hook generation"""
    if 'project' in user_int.lower() and 'tech' in contact_int.lower():
        return 'technical_project'
    elif 'volunteer' in user_int.lower() or 'volunteer' in contact_int.lower():
        return 'community_impact'
    elif any(word in user_int.lower() for word in ['university', 'college', 'school']):
        return 'education'
    elif any(word in user_int.lower() for word in ['startup', 'entrepreneur', 'founded']):
        return 'entrepreneurship'
    elif any(word in contact_int.lower() for word in ['lives in', 'connected to']):
        return 'geographic'
    else:
        return 'professional'

def create_interest_hook(overlap, user_info, contact):
    """Create a compelling conversation hook from an overlap"""
    overlap_type = overlap['overlap_type']
    user_interest = overlap['user_interest']
    contact_interest = overlap['contact_interest']
    
    hooks = {
        'technical_project': f"I noticed you work in {extract_field_from_title(contact.get('Title', ''))} - I actually built a {user_interest.replace('Project:', '').strip()} and would love your perspective on the technical challenges.",
        
        'community_impact': f"I saw your involvement in {contact_interest} - I'm passionate about {user_interest} and curious how you balance community impact with your work at {contact.get('Company', '')}.",
        
        'education': f"Fellow {extract_university_name(contact.get('EducationTop', ''))} connection! I'd love to hear how your experience there shaped your path to {contact.get('Company', '')}.",
        
        'entrepreneurship': f"I noticed your background suggests entrepreneurial thinking - I've been working on {user_interest} and would value your insights on navigating innovation in established companies.",
        
        'geographic': f"I have strong ties to {extract_location_from_interest(contact_interest)} and am curious about the {get_industry_from_company(contact.get('Company', ''))} scene there.",
        
        'professional': f"Your work in {extract_field_from_title(contact.get('Title', ''))} aligns perfectly with my interest in {user_interest} - I'd love to learn about your journey and current projects."
    }
    
    return hooks.get(overlap_type, hooks['professional'])

def generate_unique_conversation_starters(user_info, contact, contact_interests):
    """Generate unique conversation starters based on current trends and company-specific topics"""
    starters = []
    
    company = contact.get('Company', '')
    title = contact.get('Title', '')
    
    # Company-specific conversation starters
    if company:
        company_lower = company.lower()
        
        if 'tesla' in company_lower:
            starters.append("I've been following Tesla's Full Self-Driving progress - curious about your take on the intersection of hardware and software in autonomous systems.")
        elif 'google' in company_lower:
            starters.append("With Google's focus on AI integration across products, I'm curious how that's impacting your day-to-day work and team dynamics.")
        elif 'microsoft' in company_lower:
            starters.append("Microsoft's shift toward AI-first development is fascinating - would love to hear your perspective on how that's changing the engineering culture.")
        elif 'amazon' in company_lower:
            starters.append("Amazon's scale of operations is incredible - I'm curious about the unique technical challenges that come with that level of complexity.")
        elif 'meta' in company_lower or 'facebook' in company_lower:
            starters.append("Meta's investment in VR/AR and the metaverse is bold - interested in your thoughts on how that vision is shaping current product decisions.")
        elif 'netflix' in company_lower:
            starters.append("Netflix's data-driven approach to content and user experience is impressive - curious about the technical infrastructure that makes that personalization possible.")
        elif any(word in company_lower for word in ['startup', 'labs', 'ventures']):
            starters.append(f"The startup environment at {company} must be exciting - I'm curious about the unique challenges and opportunities in a rapidly scaling company.")
        elif any(word in company_lower for word in ['consulting', 'mckinsey', 'bain', 'bcg']):
            starters.append("The consulting world offers such diverse problem-solving opportunities - would love to hear about the most interesting challenge you've tackled recently.")
        elif any(word in company_lower for word in ['bank', 'finance', 'capital']):
            starters.append("The intersection of finance and technology is evolving rapidly - curious about how traditional finance is adapting to new tech paradigms.")
    
    # Role-specific conversation starters
    if title:
        title_lower = title.lower()
        
        if 'product' in title_lower:
            starters.append("Product management requires balancing so many stakeholder needs - I'm curious about your framework for prioritizing features and making tough trade-offs.")
        elif 'data' in title_lower:
            starters.append("The role of data science in business decisions keeps expanding - interested in how you communicate complex insights to non-technical stakeholders.")
        elif 'design' in title_lower:
            starters.append("User experience design is becoming more strategic - curious about how you balance user research with business objectives in your design process.")
        elif 'marketing' in title_lower:
            starters.append("Marketing is becoming increasingly data-driven and technical - would love to hear about the tools and methodologies you find most effective.")
    
    return starters

def extract_university_name(education):
    """Extract university name from education string"""
    if not education or 'Not available' in education:
        return ''
    
    parts = education.split(' - ')
    return parts[0] if parts else education

def extract_location_from_interest(interest):
    """Extract location from interest string"""
    if 'lives in' in interest:
        return interest.replace('lives in', '').strip()
    elif 'connected to' in interest:
        return interest.replace('connected to', '').replace('region', '').strip()
    return interest

def generate_compelling_email_with_hooks(user_info, contact, hooks):
    """Generate email using the identified hooks and mutual interests"""
    try:
        # Select the best hook
        primary_hook = hooks[0] if hooks else "I'm interested in learning more about your work"
        
        # Build context
        user_context = f"{user_info.get('year', '')} {user_info.get('major', '')} student at {user_info.get('university', '')}"
        contact_role = f"{contact.get('Title', '')} at {contact.get('Company', '')}"
        
        prompt = f"""
Write a compelling networking email that feels genuine and creates immediate interest.

SENDER: {user_info.get('name', '[Name]')} - {user_context}

RECIPIENT: {contact.get('FirstName', '')} {contact.get('LastName', '')} - {contact_role}

PRIMARY CONVERSATION HOOK: {primary_hook}

ADDITIONAL CONTEXT:
- Location: {contact.get('City', '')}, {contact.get('State', '')}
- Background: {contact.get('WorkSummary', '')}

EMAIL REQUIREMENTS:
1. Start with "Hi {contact.get('FirstName', '')},"
2. Use the conversation hook naturally in the first or second sentence
3. Show genuine curiosity about their specific work/experience
4. Make it feel like you've done research but aren't stalking them
5. Ask for a brief 15-20 minute conversation
6. Keep it 60-100 words
7. End with {user_info.get('name', '[Name]')}
8. Make it feel conversational and interesting, not formal or templated

Focus on creating immediate intrigue and showing you'd be an interesting person to talk to.
"""
        
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "You write compelling networking emails that create immediate interest and intrigue. Focus on making genuine connections through shared interests and curiosity."},
                {"role": "user", "content": prompt}
            ],
            max_tokens=300,
            temperature=0.8
        )
        
        return response.choices[0].message.content.strip()
        
    except Exception as e:
        print(f"Error generating compelling email: {e}")
        return generate_fallback_email_with_hook(user_info, contact, primary_hook)

def generate_intriguing_subject_line(user_info, contact, hooks):
    """Generate subject line that creates curiosity and gets opened"""
    try:
        primary_hook = hooks[0] if hooks else ""
        
        prompt = f"""
Create an intriguing email subject line that creates curiosity and gets opened.

Context:
- {user_info.get('major', 'Student')} at {user_info.get('university', '')}
- Reaching out to {contact.get('Title', '')} at {contact.get('Company', '')}
- Conversation hook: {primary_hook[:100]}...

The subject should:
- Create immediate curiosity or intrigue
- Be 4-7 words
- Make the recipient want to know more
- Not be generic or obvious
- Include a personal element if possible

Examples of intriguing subjects:
- "Autonomous systems question from Alabama"
- "Meta's VR strategy + student perspective"
- "Tesla engineer + FSD curiosity"
- "Startup question from CS student"
- "Data science ethics dilemma"
- "Product management trade-off question"

Return only the subject line.
"""
        
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "You write intriguing email subject lines that create curiosity and get opened. Focus on making people want to know more."},
                {"role": "user", "content": prompt}
            ],
            max_tokens=30,
            temperature=0.8
        )
        
        return response.choices[0].message.content.strip().strip('"').strip("'")
        
    except Exception as e:
        print(f"Error generating subject line: {e}")
        return f"Question about {contact.get('Company', 'your work')}"

def generate_fallback_email_with_hook(user_info, contact, hook):
    """Fallback email generation if AI fails"""
    return f"""Hi {contact.get('FirstName', '')},

{hook}

As a {user_info.get('major', '')} student at {user_info.get('university', '')}, I'd love to hear your perspective. Would you be open to a brief 15-20 minute conversation?

Best regards,
{user_info.get('name', '')}"""

def generate_template_based_email_system(contact, resume_text=None, user_profile=None):
    """Core function: unified email generation for both tiers using 5 templates."""
    user_info = extract_user_info_from_resume_priority(resume_text, user_profile)
    prompt = build_template_prompt(user_info, contact, resume_text or '')
    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role":"user","content": prompt}],
            temperature=0.4,
            max_tokens=500
        )
        raw = response.choices[0].message.content
        parsed = parse_openai_email_response(raw)
        subject = parsed.get('subject') or 'Quick question about your work'
        body = parsed.get('body') or ''
        
        # FIRST: Apply the main placeholder sanitization with user data
        body = sanitize_placeholders(
            body,
            user_name=user_info.get('name', ''),
            user_year=user_info.get('year', ''),
            user_major=user_info.get('major', ''),
            user_university=user_info.get('university', ''),
            career_interests=user_info.get('career_interests', [])
        )
        
        # SECOND: Apply additional email-specific cleanup
        body = sanitize_email_placeholders(body, contact, user_info)
        
        body = enforce_networking_prompt_rules(body)
        # Also clean the subject line
        subject = sanitize_placeholders(
            subject,
            user_name=user_info.get('name', ''),
            user_year=user_info.get('year', ''),
            user_major=user_info.get('major', ''),
            user_university=user_info.get('university', ''),
            career_interests=user_info.get('career_interests', [])
        )
        
        return subject, body
    except Exception as e:
        print(f"Email generation failed: {e}")
        return generate_enhanced_fallback_email(contact, user_info)

def extract_comprehensive_user_info(resume_text=None, user_profile=None):
    """Extract comprehensive user information from all available sources"""
    user_info = {
        'name': '',
        'year': '',
        'major': '',
        'university': '',
        'experiences': [],
        'skills': [],
        'interests': [],
        'projects': [],
        'leadership': []
    }
    
    # Priority 1: Extract from resume if available
    if resume_text and len(resume_text.strip()) > 50:
        try:
            # Parse basic info
            basic_info = parse_resume_info(resume_text)
            user_info.update(basic_info)
            
            # Extract detailed insights
            detailed_insights = extract_detailed_resume_insights(resume_text)
            user_info.update(detailed_insights)
            
            # Extract interests
            user_info['interests'] = extract_interests_from_resume(resume_text)
            
        except Exception as e:
            print(f"Resume parsing failed: {e}")
    
    # Priority 2: Fallback to user profile
    if user_profile and not user_info.get('name'):
        user_info['name'] = user_profile.get('name') or f"{user_profile.get('firstName', '')} {user_profile.get('lastName', '')}".strip()
        user_info['year'] = user_profile.get('year') or user_profile.get('graduationYear') or ""
        user_info['major'] = user_profile.get('major') or user_profile.get('fieldOfStudy') or ""
        user_info['university'] = user_profile.get('university') or ""
    
    return user_info

def generate_simple_fallback_email(contact, user_name):
    """Simple fallback if everything else fails"""
    subject = f"Question about {contact.get('Company', 'your work')}"
    
    body = f"""Hi {contact.get('FirstName', '')},

I came across your profile while researching {contact.get('Company', 'your company')} and your work in {extract_field_from_title(contact.get('Title', ''))} caught my attention.

As someone exploring this field, I'd love to hear your perspective. Would you be open to a brief 15-20 minute conversation?

Best regards,
{user_name}"""
    
    return subject, body

# ========================================
# RESUME PROCESSING FUNCTIONS
# ========================================

def extract_text_from_pdf(pdf_file):
    """Extract text from PDF using PyPDF2 with improved encoding handling"""
    try:
        print("Extracting text from PDF...")
        
        with tempfile.NamedTemporaryFile(delete=False, suffix='.pdf') as temp_file:
            pdf_file.save(temp_file.name)
            
            with open(temp_file.name, 'rb') as file:
                pdf_reader = PyPDF2.PdfReader(file)
                text = ""
                
                for page in pdf_reader.pages:
                    page_text = page.extract_text()
                    # Clean and encode the text properly
                    if page_text:
                        # Remove non-printable characters and fix encoding issues
                        cleaned_text = ''.join(char for char in page_text if char.isprintable() or char.isspace())
                        # Normalize unicode characters
                        cleaned_text = cleaned_text.encode('utf-8', errors='ignore').decode('utf-8')
                        text += cleaned_text + "\n"
            
            os.unlink(temp_file.name)
            
            # Final cleanup - remove extra whitespace and normalize
            text = ' '.join(text.split())
            
            print(f"Extracted {len(text)} characters from PDF")
            return text.strip() if text.strip() else None
            
    except Exception as e:
        print(f"PDF text extraction failed: {e}")
        return None

def parse_resume_info(resume_text):
    """Extract user information from resume text with improved error handling"""
    try:
        print("Parsing resume information...")
        
        if not resume_text or len(resume_text.strip()) < 10:
            print("Resume text is too short or empty")
            return {
                "name": "[Your Name]",
                "year": "[Your Year]",
                "major": "[Your Major]",
                "university": "[Your University]"
            }
        
        # Clean the resume text for JSON processing
        clean_text = resume_text.replace('"', "'").replace('\n', ' ').replace('\r', ' ')
        clean_text = ' '.join(clean_text.split())  # Normalize whitespace
        
        # Truncate to avoid token limits
        if len(clean_text) > 1500:
            clean_text = clean_text[:1500] + "..."
        
        prompt = f"""
Extract the following information from this resume text:
- Full Name
- Graduation Year (extract the 4-digit year from graduation date, e.g., "2022", "2023", "2024")
- Major/Field of Study
- University/School name

Return as JSON format:
{{
    "name": "Full Name",
    "year": "2022",
    "major": "Major/Field",
    "university": "University Name"
}}

If graduation year is not found, use "Unknown" for the year field.

Resume text:
{clean_text}
"""
        
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "You are an expert at extracting structured information from resumes. Return only valid JSON with no extra text."},
                {"role": "user", "content": prompt}
            ],
            max_tokens=300,
            temperature=0.3
        )
        
        response_text = response.choices[0].message.content.strip()
        
        # Try to extract JSON from response
        try:
            # Remove any markdown formatting
            if '```' in response_text:
                response_text = response_text.split('```')[1]
                if response_text.startswith('json'):
                    response_text = response_text[4:]
            
            result = json.loads(response_text)
            
            # Validate the result has required fields
            required_fields = ['name', 'year', 'major', 'university']
            for field in required_fields:
                if field not in result or not result[field]:
                    result[field] = f"[Your {field.capitalize()}]"
            
            if result['year'] and result['year'] != "[Your Year]":
                year_match = re.search(r'\b(19|20)\d{2}\b', result['year'])
                if year_match:
                    result['year'] = year_match.group()
                elif result['year'].lower() in ['graduated', 'unknown', 'n/a']:
                    result['year'] = ""
            
            print(f"Parsed resume info: {result['name']} - {result['year']} {result['major']} at {result['university']}")
            return result
            
        except json.JSONDecodeError as je:
            print(f"JSON parsing failed: {je}")
            print(f"Response was: {response_text}")
            
            # Fallback: try to extract info using regex
            return extract_resume_info_fallback(clean_text)
        
    except Exception as e:
        print(f"Resume parsing failed: {e}")
        return {
            "name": "[Your Name]",
            "year": "[Your Year]",
            "major": "[Your Major]",
            "university": "[Your University]"
        }

def extract_resume_info_fallback(text):
    """Fallback method to extract resume info using regex patterns"""
    try:
        print("Using fallback regex extraction...")
        
        result = {
            "name": "[Your Name]",
            "year": "[Your Year]",
            "major": "[Your Major]",
            "university": "[Your University]"
        }
        
        # Try to find name (usually at the beginning)
        name_patterns = [
            r'^([A-Z][a-z]+ [A-Z][a-z]+)',
            r'Name:?\s*([A-Z][a-z]+ [A-Z][a-z]+)',
            r'^([A-Z][A-Z\s]+[A-Z])',  # All caps name
        ]
        
        for pattern in name_patterns:
            match = re.search(pattern, text, re.MULTILINE)
            if match:
                result['name'] = match.group(1).strip()
                break
        
        # Try to find university
        university_patterns = [
            r'University of ([^,\n]+)',
            r'([^,\n]+ University)',
            r'([^,\n]+ College)',
            r'([^,\n]+ Institute)',
        ]
        
        for pattern in university_patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                result['university'] = match.group(1).strip()
                break
        
        # Try to find year/class
        year_patterns = [
            r'Class of (\d{4})',
            r'(Senior|Junior|Sophomore|Freshman)',
            r'(Graduate Student)',
            r'(\d{4} Graduate)',
        ]
        
        for pattern in year_patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                result['year'] = match.group(1).strip()
                break
        
        # Try to find major
        major_patterns = [
            r'Major:?\s*([^,\n]+)',
            r'Bachelor of ([^,\n]+)',
            r'B\.?[AS]\.?\s+([^,\n]+)',
            r'studying ([^,\n]+)',
        ]
        
        for pattern in major_patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                result['major'] = match.group(1).strip()
                break
        
        print(f"Fallback extraction: {result}")
        return result
        
    except Exception as e:
        print(f"Fallback extraction failed: {e}")
        return {
            "name": "[Your Name]",
            "year": "[Your Year]",
            "major": "[Your Major]",
            "university": "[Your University]"
        }

def extract_detailed_resume_insights(resume_text):
    """Extract detailed insights from resume for better personalization"""
    try:
        clean_text = resume_text.replace('"', "'").replace('\n', ' ')
        clean_text = ' '.join(clean_text.split())[:1200]  # Limit to 1200 chars
        
        prompt = f"""
Analyze this resume and extract key information for networking email personalization:

Resume: {clean_text}

Extract and return JSON with:
{{
    "experiences": ["2-3 most relevant work/internship experiences"],
    "skills": ["3-4 key technical or professional skills"],
    "interests": ["2-3 career interests or goals mentioned"],
    "projects": ["1-2 notable projects if mentioned"],
    "leadership": ["any leadership roles or activities"]
}}

Keep each field concise - 1-2 words per item maximum.
"""
        
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "Extract key resume insights for networking. Return only valid JSON with concise entries."},
                {"role": "user", "content": prompt}
            ],
            max_tokens=250,
            temperature=0.3
        )
        
        response_text = response.choices[0].message.content.strip()
        
        # Try to parse JSON
        try:
            if '```' in response_text:
                response_text = response_text.split('```')[1]
                if response_text.startswith('json'):
                    response_text = response_text[4:]
            
            insights = json.loads(response_text)
            return insights
            
        except json.JSONDecodeError:
            return {'experiences': [], 'skills': [], 'interests': [], 'projects': [], 'leadership': []}
            
    except Exception as e:
        print(f"Detailed resume insights extraction failed: {e}")
        return {'experiences': [], 'skills': [], 'interests': [], 'projects': [], 'leadership': []}

def generate_similarity_summary(resume_text, contact):
    """Generate similarity between resume and contact with improved error handling"""
    try:
        print(f"Generating similarity for {contact.get('FirstName', 'Unknown')}")
        
        if not resume_text or len(resume_text.strip()) < 10:
            return "Both of you have experience in professional environments."
        
        # Clean and truncate resume text
        clean_resume = resume_text.replace('"', "'").replace('\n', ' ')
        clean_resume = ' '.join(clean_resume.split())[:800]  # Limit to 800 chars
        
        contact_summary = f"""
Name: {contact.get('FirstName', '')} {contact.get('LastName', '')}
Company: {contact.get('Company', '')}
Title: {contact.get('Title', '')}
Education: {contact.get('EducationTop', '')}
Work Summary: {contact.get('WorkSummary', '')}
Volunteer: {contact.get('VolunteerHistory', '')}
"""
        
        prompt = f"""
Compare this resume with the contact's background and identify ONE key similarity in a single sentence.
Focus on: education, work experience, volunteer work, interests, or career path.
Be specific and concise.

Resume (first 800 chars):
{clean_resume}

Contact Background:
{contact_summary}

Generate ONE sentence highlighting the most relevant similarity:
"""
        
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "You are an expert at finding meaningful connections between people's backgrounds. Write concise, specific similarities."},
                {"role": "user", "content": prompt}
            ],
            max_tokens=100,
            temperature=0.7
        )
        
        similarity = response.choices[0].message.content.strip()
        # Clean the similarity text
        similarity = similarity.replace('"', "'").strip()
        
        print(f"Generated similarity: {similarity[:50]}...")
        return similarity
        
    except Exception as e:
        print(f"Similarity generation failed: {e}")
        return "Both of you have experience in similar professional environments."

def extract_hometown_from_education(contact):
    """Extract hometown from contact's education history as per your specs"""
    try:
        print(f"Extracting hometown for {contact.get('FirstName', 'Unknown')}")
        
        education = contact.get('EducationTop', '')
        
        # Look for high school location patterns
        location_patterns = [
            r'High School.*?-\s*([^,]+,\s*[A-Z]{2})',
            r'Secondary.*?-\s*([^,]+,\s*[A-Z]{2})',
            r'Prep.*?-\s*([^,]+,\s*[A-Z]{2})'
        ]
        
        for pattern in location_patterns:
            match = re.search(pattern, education)
            if match:
                hometown = match.group(1)
                print(f"Found hometown: {hometown}")
                return hometown
        
        # Fallback to contact's current city
        if contact.get('City') and contact.get('State'):
            hometown = f"{contact['City']}, {contact['State']}"
            print(f"Using current location as hometown: {hometown}")
            return hometown
            
        print("Could not determine hometown")
        return None
        
    except Exception as e:
        print(f"Hometown extraction failed: {e}")
        return None

def sanitize_placeholders(text: str, user_name: str = "", user_year: str = "", user_major: str = "", user_university: str = "", career_interests: list = None) -> str:
    if not text:
        return ""
    
    # Handle career interests
    career_interests_str = ""
    if career_interests and isinstance(career_interests, list):
        if len(career_interests) == 1:
            career_interests_str = career_interests[0]
        elif len(career_interests) == 2:
            career_interests_str = f"{career_interests[0]} and {career_interests[1]}"
        else:
            career_interests_str = f"{', '.join(career_interests[:-1])}, and {career_interests[-1]}"
    elif isinstance(career_interests, str):
        career_interests_str = career_interests
    
    # Handle both square brackets and curly braces
    replacements = {
        # Square bracket format
        "[Your Name]": user_name, "[name]": user_name, "[Name]": user_name,
        "[Your Year]": user_year, "[year]": user_year, "[Year]": user_year,
        "[Your Major]": user_major, "[major]": user_major, "[Major]": user_major,
        "[Your University]": user_university, "[university]": user_university,
        "[career_interests]": career_interests_str,
        "[Your year/major]": f"{user_year} {user_major}".strip(),
        
        # Curly brace format (for AI-generated content)
        "{name}": user_name, "{Name}": user_name,
        "{year}": user_year, "{Year}": user_year,
        "{major}": user_major, "{Major}": user_major,
        "{university}": user_university, "{University}": user_university,
        "{degree}": "", "{Degree}": "",
        "{career_interests}": career_interests_str,
    }
    
    # Apply replacements
    for placeholder, replacement in replacements.items():
        if replacement:  # Only replace if we have a value
            text = text.replace(placeholder, replacement)
    
    # Clean up any remaining empty placeholders
    import re
    text = re.sub(r'\{[^}]*\}', '', text)  # Remove remaining {placeholder}
    text = re.sub(r'\[[^]]*\]', '', text)  # Remove remaining [placeholder]
    text = re.sub(r'\s+', ' ', text)       # Replace multiple spaces with single space
    text = text.strip()
    
    return text

# ========================================
# GMAIL INTEGRATION
# ========================================

def get_gmail_service():
    """Get Gmail API service"""
    try:
        creds = None
        
        if os.path.exists('token.pickle'):
            with open('token.pickle', 'rb') as token:
                creds = pickle.load(token)
        
        if not creds or not creds.valid:
            if creds and creds.expired and creds.refresh_token:
                print("Refreshing Gmail token...")
                creds.refresh(Request())
                with open('token.pickle', 'wb') as token:
                    pickle.dump(creds, token)
            else:
                print("No valid Gmail credentials found")
                return None
        
        service = build('gmail', 'v1', credentials=creds)
        print("Gmail service connected")
        return service
        
    except Exception as e:
        print(f"Gmail service failed: {e}")
        return None

def get_gmail_service_for_user(user_email):
    """Get Gmail API service for a specific user"""
    try:
        # For now, use the existing service - in production you'd want per-user tokens
        print(f"Getting Gmail service for user: {user_email}")
        return get_gmail_service()
        
    except Exception as e:
        print(f"Gmail service failed for {user_email}: {e}")
        return None

def create_gmail_draft_for_user(contact, email_subject, email_body, tier='free', user_email=None):
    """Create Gmail draft in the user's account"""
    try:
        gmail_service = get_gmail_service_for_user(user_email)
        if not gmail_service:
            print(f"Gmail unavailable for {user_email} - creating mock draft")
            return f"mock_{tier}_draft_{contact.get('FirstName', 'unknown').lower()}_user_{user_email}"
        
        print(f"Creating {tier.capitalize()} Gmail draft for {user_email} -> {contact.get('FirstName', 'Unknown')}")
        
        # Get the best available email address
        recipient_email = None
        
        if contact.get('PersonalEmail') and contact['PersonalEmail'] != 'Not available' and '@' in contact['PersonalEmail']:
            recipient_email = contact['PersonalEmail']
        elif contact.get('WorkEmail') and contact['WorkEmail'] != 'Not available' and '@' in contact['WorkEmail']:
            recipient_email = contact['WorkEmail']
        elif contact.get('Email') and '@' in contact['Email'] and not contact['Email'].endswith('@domain.com'):
            recipient_email = contact['Email']
        
        if not recipient_email:
            print(f"No valid email found for {contact.get('FirstName', 'Unknown')} - creating mock draft")
            return f"mock_{tier}_draft_{contact.get('FirstName', 'unknown').lower()}_no_email"
        
        print(f"User {user_email} drafting to: {recipient_email}")
        
        message = MIMEText(email_body)
        message['to'] = recipient_email
        message['subject'] = email_subject
        safe_from = user_email or os.getenv("DEFAULT_FROM_EMAIL", "noreply@offerloop.ai")
        message['from'] = safe_from
        
        raw_message = base64.urlsafe_b64encode(message.as_bytes()).decode()
        
        draft_body = {
            'message': {
                'raw': raw_message
            }
        }
        
        draft_result = gmail_service.users().drafts().create(userId='me', body=draft_body).execute()
        draft_id = draft_result['id']
        
        print(f"Created {tier.capitalize()} Gmail draft {draft_id} in {user_email}'s account")
        
        # Apply appropriate label
        try:
            apply_recruitedge_label_for_user(gmail_service, draft_result['message']['id'], tier, user_email)
        except Exception as label_error:
            print(f"Could not apply {tier} label for {user_email}: {label_error}")
        
        return draft_id
        
    except Exception as e:
        print(f"{tier.capitalize()} Gmail draft creation failed for {user_email}: {e}")
        return f"mock_{tier}_draft_{contact.get('FirstName', 'unknown').lower()}_user_{user_email}"

def apply_recruitedge_label_for_user(gmail_service, message_id, tier, user_email):
    """Apply appropriate RecruitEdge label for specific user"""
    try:
        if tier == 'free':
            label_name = f"RecruitEdge Free - {user_email.split('@')[0]}"
        elif tier == 'pro':
            label_name = f"RecruitEdge Pro - {user_email.split('@')[0]}"
        else:
            label_name = f"RecruitEdge {tier.capitalize()} - {user_email.split('@')[0]}"
        
        labels_result = gmail_service.users().labels().list(userId='me').execute()
        labels = labels_result.get('labels', [])
        
        label_id = None
        for label in labels:
            if label['name'] == label_name:
                label_id = label['id']
                break
        
        if not label_id:
            label_body = {
                'name': label_name,
                'labelListVisibility': 'labelShow',
                'messageListVisibility': 'show'
            }
            label_result = gmail_service.users().labels().create(userId='me', body=label_body).execute()
            label_id = label_result['id']
            print(f"Created '{label_name}' label for {user_email}")
        
        gmail_service.users().messages().modify(
            userId='me',
            id=message_id,
            body={'addLabelIds': [label_id]}
        ).execute()
        
        print(f"Applied {label_name} label for {user_email}")
        
    except Exception as e:
        print(f"Label application failed for {user_email}: {e}")

def create_gmail_draft(contact, email_subject, email_body, tier='free'):
    """Create Gmail draft with appropriate RecruitEdge label"""
    try:
        gmail_service = get_gmail_service()
        if not gmail_service:
            print(f"Gmail unavailable - creating mock draft for {contact.get('FirstName', 'Unknown')}")
            return f"mock_{tier}_draft_{contact.get('FirstName', 'unknown').lower()}"
        
        print(f"Creating {tier.capitalize()} Gmail draft for {contact.get('FirstName', 'Unknown')}")
        
        # Get the best available email address
        recipient_email = None
        
        # Try personal email first (recommended_personal_email)
        if contact.get('PersonalEmail') and contact['PersonalEmail'] != 'Not available' and '@' in contact['PersonalEmail']:
            recipient_email = contact['PersonalEmail']
        # Try work email next
        elif contact.get('WorkEmail') and contact['WorkEmail'] != 'Not available' and '@' in contact['WorkEmail']:
            recipient_email = contact['WorkEmail']
        # Try general email field
        elif contact.get('Email') and '@' in contact['Email'] and not contact['Email'].endswith('@domain.com'):
            recipient_email = contact['Email']
        
        # If no valid email found, create a mock draft
        if not recipient_email:
            print(f"No valid email found for {contact.get('FirstName', 'Unknown')} - creating mock draft")
            return f"mock_{tier}_draft_{contact.get('FirstName', 'unknown').lower()}_no_email"
        
        print(f"Using email: {recipient_email}")
        
        message = MIMEText(email_body)
        message['to'] = recipient_email
        message['subject'] = email_subject
        
        raw_message = base64.urlsafe_b64encode(message.as_bytes()).decode()
        
        draft_body = {
            'message': {
                'raw': raw_message
            }
        }
        
        draft_result = gmail_service.users().drafts().create(userId='me', body=draft_body).execute()
        draft_id = draft_result['id']
        
        print(f"Created {tier.capitalize()} Gmail draft {draft_id}")
        
        # Apply RecruitEdge label
        try:
            apply_recruitedge_label(gmail_service, draft_result['message']['id'], tier)
        except Exception as label_error:
            print(f"Could not apply {tier} label: {label_error}")
        
        return draft_id
        
    except Exception as e:
        print(f"{tier.capitalize()} Gmail draft creation failed: {e}")
        return f"mock_{tier}_draft_{contact.get('FirstName', 'unknown').lower()}"

def apply_recruitedge_label(gmail_service, message_id, tier):
    """Apply appropriate RecruitEdge label"""
    try:
        # Updated label naming convention for two tiers
        if tier == 'free':
            label_name = "RecruitEdge Free"
        elif tier == 'pro':
            label_name = "RecruitEdge Pro"
        else:
            label_name = f"RecruitEdge {tier.capitalize()}"
        
        labels_result = gmail_service.users().labels().list(userId='me').execute()
        labels = labels_result.get('labels', [])
        
        label_id = None
        for label in labels:
            if label['name'] == label_name:
                label_id = label['id']
                break
        
        if not label_id:
            label_body = {
                'name': label_name,
                'labelListVisibility': 'labelShow',
                'messageListVisibility': 'show'
            }
            label_result = gmail_service.users().labels().create(userId='me', body=label_body).execute()
            label_id = label_result['id']
            print(f"Created '{label_name}' label")
        
        gmail_service.users().messages().modify(
            userId='me',
            id=message_id,
            body={'addLabelIds': [label_id]}
        ).execute()
        
        print(f"Applied {label_name} label")
        
    except Exception as e:
        print(f"Label application failed: {e}")
        
# ========================================
# ENHANCED TEMPLATE EMAIL GENERATION SYSTEM
# ========================================

def generate_enhanced_template_email(contact, resume_text=None, user_profile=None):
    """
    Generate emails using enhanced templates that follow the structure but add compelling hooks
    """
    try:
        print(f"Generating enhanced template email for {contact.get('FirstName', 'Unknown')}")
        
        # Extract user information
        user_info = extract_comprehensive_user_info(resume_text, user_profile)
        
        # Select the best template based on available information
        template_type = select_optimal_template(user_info, contact, resume_text)
        
        # Generate personalized content for the template
        personalized_content = generate_template_content(user_info, contact, template_type, resume_text)
        
        # Craft the email using the enhanced template
        email_body = craft_template_email(user_info, contact, template_type, personalized_content)
        
        # Generate professional but intriguing subject line
        email_subject = generate_template_subject_line(contact, template_type, personalized_content)
        
        # Clean up placeholders
        email_body = sanitize_placeholders(
            email_body,
            user_info.get('name', ''),
            user_info.get('year', ''),
            user_info.get('major', ''),
            user_info.get('university', '')
        )
        
        print(f"Generated enhanced template email using '{template_type}' template")
        return email_subject, email_body
        
    except Exception as e:
        print(f"Enhanced template email generation failed: {e}")
        user_info = extract_comprehensive_user_info(resume_text, user_profile)
        return generate_simple_template_fallback(contact, user_info.get('name', ''))

def select_optimal_template(user_info, contact, resume_text):
    """Select the best template based on available information and connections"""
    
    # Check for strong connections first
    if find_university_connection(user_info, contact):
        return "common_background"
    
    if find_geographic_connection(user_info, contact, resume_text):
        return "mutual_affiliation"
    
    # Check if we have resume for context
    if resume_text and len(resume_text.strip()) > 100:
        return "resume_context"
    
    # Check company type for appropriate approach
    company = contact.get('Company', '').lower()
    if any(word in company for word in ['google', 'microsoft', 'amazon', 'meta', 'apple']):
        return "research_acknowledgment"
    elif any(word in company for word in ['startup', 'labs', 'ventures']):
        return "values_cultural"
    elif any(word in company for word in ['consulting', 'mckinsey', 'bain', 'bcg']):
        return "aspirational"
    
    # Default to straightforward with strong personalization
    return "straightforward_enhanced"

def generate_template_content(user_info, contact, template_type, resume_text):
    """Generate personalized content for the selected template"""
    content = {}
    
    # Generate compelling personalization hook
    content['personalization_hook'] = generate_personalization_hook(contact, resume_text)
    
    # Generate specific interest statement
    content['specific_interest'] = generate_specific_interest(contact, user_info)
    
    # Generate connection point if applicable
    content['connection_point'] = find_connection_point(user_info, contact, resume_text)
    
    # Generate value proposition (why they should talk to you)
    content['value_prop'] = generate_value_proposition(user_info, contact, template_type)
    
    return content

def generate_personalization_hook(contact, resume_text):
    """Generate a compelling, specific personalization hook"""
    company = contact.get('Company', '')
    title = contact.get('Title', '')
    
    # Company-specific hooks
    company_lower = company.lower()
    if 'google' in company_lower:
        hooks = [
            f"your work on Google's AI integration across products",
            f"your experience with Google's engineering culture",
            f"your role in Google's product development process",
            f"your perspective on Google's approach to innovation"
        ]
    elif 'tesla' in company_lower:
        hooks = [
            f"your work on Tesla's autonomous driving technology",
            f"your experience with Tesla's rapid iteration cycles",
            f"your role in Tesla's hardware-software integration",
            f"your perspective on Tesla's engineering challenges"
        ]
    elif 'meta' in company_lower or 'facebook' in company_lower:
        hooks = [
            f"your work on Meta's VR/AR initiatives",
            f"your experience with Meta's product development",
            f"your role in Meta's technical infrastructure",
            f"your perspective on Meta's future direction"
        ]
    elif 'amazon' in company_lower:
        hooks = [
            f"your work on Amazon's scale challenges",
            f"your experience with Amazon's customer obsession",
            f"your role in Amazon's technical systems",
            f"your perspective on Amazon's innovation process"
        ]
    elif 'microsoft' in company_lower:
        hooks = [
            f"your work on Microsoft's cloud transformation",
            f"your experience with Microsoft's developer tools",
            f"your role in Microsoft's AI initiatives",
            f"your perspective on Microsoft's enterprise focus"
        ]
    else:
        # Generic but specific hooks
        hooks = [
            f"your experience building products at {company}",
            f"your role in {company}'s growth",
            f"your perspective on {company}'s market position",
            f"your work on {company}'s technical challenges"
        ]
    
    return hooks[0]  # Return the first/best hook

def generate_specific_interest(contact, user_info):
    """Generate specific interest statement based on user's background and contact's role"""
    user_major = user_info.get('major', '').lower()
    contact_title = contact.get('Title', '').lower()
    contact_company = contact.get('Company', '')
    
    if 'computer science' in user_major or 'software' in user_major:
        if 'engineer' in contact_title:
            return f"how you approached the technical challenges in your engineering career at {contact_company}"
        elif 'product' in contact_title:
            return f"how you bridge technical and business perspectives in product development"
        else:
            return f"the intersection of technology and business in your role"
    
    elif 'business' in user_major:
        if 'consulting' in contact_title:
            return f"how you approach complex problem-solving in consulting"
        elif 'manager' in contact_title:
            return f"how you developed your leadership and strategic thinking skills"
        else:
            return f"how you built your business acumen and industry expertise"
    
    else:
        return f"your career journey and what drew you to {contact_company}"

def find_connection_point(user_info, contact, resume_text):
    """Find meaningful connection points between user and contact"""
    connections = []
    
    # University connection
    user_uni = user_info.get('university', '').lower()
    contact_edu = contact.get('EducationTop', '').lower()
    if user_uni and user_uni in contact_edu:
        return f"I noticed we both have ties to {user_info.get('university', '')}"
    
    # Geographic connection
    if resume_text:
        resume_lower = resume_text.lower()
        contact_city = contact.get('City', '').lower()
        contact_state = contact.get('State', '').lower()
        
        if contact_city and contact_city in resume_lower:
            return f"I have connections to {contact.get('City', '')} as well"
        elif contact_state and contact_state in resume_lower:
            return f"I also have ties to {contact.get('State', '')}"
    
    # Industry/field connection
    user_major = user_info.get('major', '').lower()
    contact_title = contact.get('Title', '').lower()
    
    if 'computer science' in user_major and any(word in contact_title for word in ['engineer', 'developer', 'technical']):
        return f"as someone studying {user_info.get('major', '')}, your technical background really resonates with me"
    
    return None

def generate_value_proposition(user_info, contact, template_type):
    """Generate why the contact should want to talk to the user"""
    value_props = {
        'straightforward_enhanced': f"I'm genuinely curious about your experience and would value your perspective as I prepare for my own career",
        'common_background': f"Since we share similar backgrounds, I'd love to learn from your experience",
        'research_acknowledgment': f"I've been researching the industry and would greatly value insights from someone with your experience",
        'resume_context': f"I'd be grateful for your perspective on my background and the industry",
        'aspirational': f"I admire your career trajectory and would value any guidance you could share",
        'values_cultural': f"I'm drawn to the innovation and culture you've helped build",
        'mutual_affiliation': f"I'd love to learn from someone who shares similar experiences"
    }
    
    return value_props.get(template_type, value_props['straightforward_enhanced'])

def craft_template_email(user_info, contact, template_type, content):
    """Craft the actual email using the enhanced template"""
    
    templates = {
        'straightforward_enhanced': f"""Hi {contact.get('FirstName', '')},

My name is {user_info.get('name', '[Your Name]')}, and I'm a {user_info.get('year', '')} {user_info.get('major', '')} at {user_info.get('university', '')} pursuing a career in {extract_field_from_title(contact.get('Title', ''))}. I came across your profile while researching professionals at {contact.get('Company', '')}, and I was particularly interested in {content['personalization_hook']}.

I'd be grateful for the chance to hear more about {content['specific_interest']}. Would you be open to a 15-20 minute call in the next couple of weeks?

Best,
{user_info.get('name', '[Your Name]')}""",

        'common_background': f"""Hi {contact.get('FirstName', '')},

I'm {user_info.get('name', '[Your Name]')}, a {user_info.get('year', '')} at {user_info.get('university', '')} studying {user_info.get('major', '')}. {content.get('connection_point', '')} and I also saw that you {content['personalization_hook']}. Since I'm exploring a similar path, I'd love to learn more about {content['specific_interest']}.

Would you have 15-20 minutes for a call or Zoom in the coming weeks? I'll keep it focused and respect your time.

Best regards,
{user_info.get('name', '[Your Name]')}""",

        'research_acknowledgment': f"""Dear {contact.get('FirstName', '')},

I hope this note finds you well. My name is {user_info.get('name', '[Your Name]')}, and I am a {user_info.get('year', '')} at {user_info.get('university', '')} majoring in {user_info.get('major', '')}. While researching {contact.get('Company', '')}, I was particularly impressed by {content['personalization_hook']}.

Would you be open to a short call or Zoom meeting at your convenience? I'd greatly value hearing about {content['specific_interest']} and any advice you might offer to someone preparing to enter the industry.

Warm regards,
{user_info.get('name', '[Your Name]')}""",

        'resume_context': f"""Hi {contact.get('FirstName', '')},

My name is {user_info.get('name', '[Your Name]')}, and I'm a {user_info.get('year', '')} student at {user_info.get('university', '')} majoring in {user_info.get('major', '')}. I was particularly interested to see {content['personalization_hook']}, and I'd love to hear how those experiences shaped your career.

{content['value_prop']}. Would you be open to a short conversation (15-20 minutes) in the next couple of weeks?

Thank you,
{user_info.get('name', '[Your Name]')}""",

        'aspirational': f"""Hi {contact.get('FirstName', '')},

I'm {user_info.get('name', '[Your Name]')}, a {user_info.get('year', '')} at {user_info.get('university', '')} majoring in {user_info.get('major', '')}. Your career path at {contact.get('Company', '')} stood out to meâ€”especially {content['personalization_hook']}. I admire how you've built your trajectory and would be grateful for the chance to hear about {content['specific_interest']}.

If you're available, I'd appreciate a brief 15-20 minute conversation in the next couple of weeks.

Sincerely,
{user_info.get('name', '[Your Name]')}""",

        'values_cultural': f"""Hi {contact.get('FirstName', '')},

I'm {user_info.get('name', '[Your Name]')}, a {user_info.get('year', '')} at {user_info.get('university', '')} studying {user_info.get('major', '')}. In looking into {contact.get('Company', '')}, I've been drawn to its reputation for innovation and impact. {content['personalization_hook']} really caught my attention.

I'd be grateful if you'd be open to a short call (15-20 minutes) in the next couple of weeks to hear more about {content['specific_interest']}.

Best regards,
{user_info.get('name', '[Your Name]')}""",

        'mutual_affiliation': f"""Hi {contact.get('FirstName', '')},

I'm {user_info.get('name', '[Your Name]')}, a {user_info.get('year', '')} studying {user_info.get('major', '')} at {user_info.get('university', '')}. {content.get('connection_point', '')} and I was particularly interested in {content['personalization_hook']}.

I'd love to learn how your experiences shaped your career path and what drew you to {contact.get('Company', '')}. Would you be open to a 15-20 minute chat in the next couple of weeks?

Thank you,
{user_info.get('name', '[Your Name]')}"""
    }
    
    return templates.get(template_type, templates['straightforward_enhanced'])

def generate_template_subject_line(contact, template_type, content):
    """Generate appropriate subject lines for each template type"""
    
    company = contact.get('Company', '')
    
    subjects = {
        'straightforward_enhanced': f"Question about your work at {company}",
        'common_background': f"Fellow alumnus interested in {company}",
        'research_acknowledgment': f"Research inquiry about {company}",
        'resume_context': f"Student seeking perspective on {company}",
        'aspirational': f"Career guidance from {company}",
        'values_cultural': f"Interested in {company}'s culture and impact",
        'mutual_affiliation': f"Shared background + {company} question"
    }
    
    return subjects.get(template_type, f"Question about {company}")

def find_university_connection(user_info, contact):
    """Check if there's a university connection"""
    user_uni = user_info.get('university', '').lower()
    contact_edu = contact.get('EducationTop', '').lower()
    
    if user_uni and user_uni in contact_edu:
        return True
    
    # Check for partial matches (e.g., "USC" in "University of Southern California")
    if user_uni:
        uni_words = user_uni.split()
        for word in uni_words:
            if len(word) > 3 and word in contact_edu:
                return True
    
    return False

def find_geographic_connection(user_info, contact, resume_text):
    """Check if there's a geographic connection"""
    if not resume_text:
        return False
    
    resume_lower = resume_text.lower()
    contact_city = contact.get('City', '').lower()
    contact_state = contact.get('State', '').lower()
    
    if contact_city and contact_city in resume_lower:
        return True
    if contact_state and contact_state in resume_lower:
        return True
    
    return False

def generate_simple_template_fallback(contact, user_name):
    """Simple fallback template if generation fails"""
    subject = f"Question about your work at {contact.get('Company', 'your company')}"
    
    body = f"""Hi {contact.get('FirstName', '')},

My name is {user_name}, and I'm a student interested in learning more about your experience at {contact.get('Company', '')}. Your work as a {contact.get('Title', '')} caught my attention.

Would you be open to a brief 15-20 minute conversation in the next couple of weeks?

Thank you for your time,
{user_name}"""
    
    return subject, body

# ========================================
# TIER ENDPOINT IMPLEMENTATIONS WITH INTERESTING EMAILS
# ========================================

def generate_email_for_tier(contact, tier='free', resume_info=None, user_profile=None, similarity=None, hometown=None, resume_text=None):
    """
    Generate emails using enhanced templates that follow professional structure
    """
    try:
        print(f"Generating enhanced template email for {contact.get('FirstName', 'Unknown')} (tier: {tier})")
        
        # Use the enhanced template system
        return generate_enhanced_template_email(contact, resume_text=resume_text, user_profile=user_profile)
        
    except Exception as e:
        print(f"Enhanced template email generation failed for {tier}: {e}")
        
        # Fallback
        user_name = ""
        if resume_info:
            user_name = resume_info.get('name', '')
        elif user_profile:
            user_name = user_profile.get('name', '')
        
        return generate_simple_template_fallback(contact, user_name)

def run_free_tier_enhanced_final(job_title, company, location, user_email=None, user_profile=None, resume_text=None, career_interests=None, college_alumni=None):
    """FREE: 8 contacts, identical email quality to PRO, basic fields."""
    print(f"Running FREE tier workflow with new email system for {user_email}")
    
    # ADD THESE DEBUG LINES:
    print(f"DEBUG - Input data:")
    print(f"  resume_text length: {len(resume_text) if resume_text else 0}")
    print(f"  user_profile: {user_profile}")
    print(f"  career_interests: {career_interests}")
    print(f"  user_email: {user_email}")
    
    try:
        # GET USER ID FROM REQUEST CONTEXT
        user_id = None
        if hasattr(request, 'firebase_user'):
            user_id = request.firebase_user.get('uid')
            print(f"Using Firebase user ID: {user_id}")
        
        # CHECK USER CREDITS BEFORE SEARCHING
        credits_available = 120  # Default for free tier
        if db and user_id:
            try:
                # Use user ID for document reference
                user_ref = db.collection('users').document(user_id)
                user_doc = user_ref.get()
                
                if user_doc.exists:
                    user_data = user_doc.to_dict()
                    credits_available = user_data.get('credits', 120)
                    
                    # Check if user has enough credits (minimum 15 for 1 contact)
                    if credits_available < 15:
                        print(f"Insufficient credits: {credits_available} < 15 minimum")
                        return {
                            'error': 'Insufficient credits. You need at least 15 credits to search.',
                            'credits_needed': 15,
                            'current_credits': credits_available,
                            'contacts': []
                        }
                    
                    print(f"User has {credits_available} credits available")
                else:
                    # Create new user document with default credits using user ID
                    user_ref.set({
                        'uid': user_id,
                        'email': user_email,
                        'credits': 120,
                        'maxCredits': 120,
                        'tier': 'free',
                        'created_at': datetime.datetime.now()
                    })
                    print(f"Created new user document with ID {user_id} and 120 credits")
            except Exception as credit_check_error:
                print(f"Credit check error: {credit_check_error}")
                # Continue without credit checking if Firebase fails
        
        # Calculate max contacts based on available credits
        tier_max = TIER_CONFIGS['free']['max_contacts']   # 8
        max_contacts_by_credits = min(tier_max, credits_available // 15)
        print(f"Max contacts by credits: {max_contacts_by_credits} (based on {credits_available} credits, cap {tier_max})")

        
        # SEARCH FOR CONTACTS
        contacts = search_contacts_with_smart_location_strategy(
            job_title, company, location,
            max_contacts=max_contacts_by_credits,
            college_alumni=college_alumni
        )
        
        if not contacts:
            print("No contacts found for Free tier")
            return {'error': 'No contacts found', 'contacts': []}
        
        # DEDUCT CREDITS BASED ON ACTUAL CONTACTS FOUND
        credits_to_deduct = len(contacts) * 15
        new_credits_balance = credits_available - credits_to_deduct
        
        # UPDATE CREDITS IN FIREBASE USING USER ID
        if db and user_id:
            try:
                user_ref = db.collection('users').document(user_id)
                user_ref.update({
                    'credits': new_credits_balance,
                    'last_search': datetime.datetime.now(),
                    'last_search_job_title': job_title,
                    'last_search_company': company,
                    'last_search_location': location,
                    'last_search_contacts': len(contacts),
                    'last_search_credits_used': credits_to_deduct
                })
                print(f"Deducted {credits_to_deduct} credits for {len(contacts)} contacts. New balance: {new_credits_balance}")
            except Exception as credit_update_error:
                print(f"Failed to update credits for user ID {user_id}: {credit_update_error}")
        
        # Add hometown extraction for Free tier
        for contact in contacts:
            hometown = extract_hometown_from_education_history_enhanced(contact.get('EducationTop', ''))
            contact['Hometown'] = hometown
        
        # Generate identical quality emails using unified system
        successful_drafts = 0
        for contact in contacts:
            print(f"DEBUG - Generating email for {contact.get('FirstName', 'Unknown')}")
            
            # Generate personalized email
            email_subject, email_body = generate_email_for_both_tiers(
                contact,
                resume_text=resume_text,
                user_profile=user_profile,
                career_interests=career_interests
            )
            
            contact['email_subject'] = email_subject
            contact['email_body'] = email_body
            
            # Create Gmail draft
            draft_id = create_gmail_draft_for_user(contact, email_subject, email_body, tier='free', user_email=user_email)
            contact['draft_id'] = draft_id
            if not str(draft_id).startswith('mock_'):
                successful_drafts += 1
        
        # Filter to Free fields only (including email data)
        free_contacts = []
        for c in contacts:
            free_contact = {k: v for k, v in c.items() if k in TIER_CONFIGS['free']['fields']}
            free_contact['email_subject'] = c.get('email_subject','')
            free_contact['email_body'] = c.get('email_body','')
            free_contacts.append(free_contact)
        
        print(f"Free tier completed for {user_email}: {len(free_contacts)} contacts, {successful_drafts} Gmail drafts")
        
        # RETURN WITH CREDIT INFO (NO CSV FILE)
        return {
            'contacts': free_contacts,
            'successful_drafts': successful_drafts,
            'tier': 'free',
            'user_email': user_email,
            'user_id': user_id,
            'credits_used': credits_to_deduct,
            'credits_remaining': new_credits_balance,
            'total_contacts': len(contacts)
        }
        
    except Exception as e:
        print(f"Free tier failed for {user_email}: {e}")
        traceback.print_exc()
        return {'error': str(e), 'contacts': []}

def run_free_tier_enhanced_optimized(job_title, company, location, user_email=None, user_profile=None, resume_text=None, career_interests=None, college_alumni=None):
    """Optimized version - keep original as backup"""
    import time
    start_time = time.time()
    
    print(f"Starting OPTIMIZED Free tier for {user_email}")
    
    try:
        # Copy the credit check code from your original function
        user_id = None
        if hasattr(request, 'firebase_user'):
            user_id = request.firebase_user.get('uid')
        
        credits_available = 120
        if db and user_id:
            try:
                user_ref = db.collection('users').document(user_id)
                user_doc = user_ref.get()
                if user_doc.exists:
                    user_data = user_doc.to_dict()
                    credits_available = user_data.get('credits', 120)
                    if credits_available < 15:
                        return {
                            'error': 'Insufficient credits',
                            'credits_needed': 15,
                            'current_credits': credits_available,
                            'contacts': []
                        }
            except Exception:
                pass
        
        max_contacts_by_credits = min(8, credits_available // 15)
        
        # Search contacts (this will now use cached enrichment)
        print("Searching for contacts...")
        search_start = time.time()
        contacts = search_contacts_with_smart_location_strategy(
            job_title, company, location,
            max_contacts=max_contacts_by_credits,
            college_alumni=college_alumni
        )
        print(f"Search took {time.time() - search_start:.2f} seconds")
        
        if not contacts:
            return {'error': 'No contacts found', 'contacts': []}
        
        # OPTIMIZATION: Batch extract hometowns instead of one by one
        print("Extracting hometowns in batch...")
        hometown_start = time.time()
        hometown_map = batch_extract_hometowns(contacts)
        for i, contact in enumerate(contacts):
            contact['Hometown'] = hometown_map.get(i, "Unknown")
        print(f"Hometown extraction took {time.time() - hometown_start:.2f} seconds")
        
        # PARALLEL EMAIL GENERATION
        # BATCH EMAIL GENERATION (single API call for all emails)
        print("Generating emails (batch)...")
        email_start = time.time()

        email_results = batch_generate_emails(contacts, resume_text, user_profile, career_interests)

        for i, contact in enumerate(contacts):
            if i in email_results:
                contact['email_subject'] = email_results[i].get('subject', 'Quick question about your work')
                contact['email_body'] = email_results[i].get('body', f"Hi {contact.get('FirstName', '')}, I'd love to connect about your work at {contact.get('Company', 'your company')}.")
            else:
             # Fallback if batch generation failed for this contact
                contact['email_subject'] = "Quick question about your work"
                contact['email_body'] = f"Hi {contact.get('FirstName', '')}, I'd love to connect about your work at {contact.get('Company', 'your company')}."

        print(f"Emails generated in {time.time() - email_start:.2f} seconds")
        
        # Create drafts (keep simple for now)
        successful_drafts = 0
        for contact in contacts:
            draft_id = create_gmail_draft_for_user(contact, contact['email_subject'], contact['email_body'], tier='free', user_email=user_email)
            contact['draft_id'] = draft_id
            if not str(draft_id).startswith('mock_'):
                successful_drafts += 1
        
        # Update credits (keeping your existing logic)
        credits_to_deduct = len(contacts) * 15
        new_credits_balance = credits_available - credits_to_deduct
        
        if db and user_id:
            try:
                user_ref = db.collection('users').document(user_id)
                user_ref.update({
                    'credits': new_credits_balance,
                    'last_search': datetime.datetime.now(),
                    'last_search_job_title': job_title,
                    'last_search_company': company,
                    'last_search_location': location,
                    'last_search_contacts': len(contacts),
                    'last_search_credits_used': credits_to_deduct
                })
            except Exception:
                pass
        
        # Filter to Free fields (keeping your existing logic)
        free_contacts = []
        for c in contacts:
            free_contact = {k: v for k, v in c.items() if k in TIER_CONFIGS['free']['fields']}
            free_contact['email_subject'] = c.get('email_subject','')
            free_contact['email_body'] = c.get('email_body','')
            free_contacts.append(free_contact)
        
        total_time = time.time() - start_time
        print(f"✅ OPTIMIZED Free tier completed in {total_time:.2f} seconds")
        
        return {
            'contacts': free_contacts,
            'successful_drafts': successful_drafts,
            'tier': 'free',
            'user_email': user_email,
            'user_id': user_id,
            'credits_used': credits_to_deduct,
            'credits_remaining': new_credits_balance,
            'total_contacts': len(contacts),
            'processing_time': total_time
        }
        
    except Exception as e:
        print(f"Optimized version failed, check error: {e}")
        import traceback
        traceback.print_exc()
        # FALLBACK to original function if something goes wrong
        return run_free_tier_enhanced_final(
            job_title, company, location, user_email, user_profile, 
            resume_text, career_interests, college_alumni
        )

# ========================================
# ENHANCED TIER FUNCTIONS WITH LOGGING - TWO TIERS ONLY
# ========================================

def validate_search_inputs(job_title, company, location):
    errors = []
    
    if not job_title or len(job_title.strip()) < 2:
        errors.append("Job title must be at least 2 characters")
    
    # Company is optional - only validate if provided
    if company and len(company.strip()) < 2:
        errors.append("Company name must be at least 2 characters")
    
    if not location or len(location.strip()) < 2:
        errors.append("Location must be at least 2 characters")
    
    return errors

def log_api_usage(tier, user_email, contacts_found, emails_generated=0):
    """Log API usage for monitoring and billing"""
    timestamp = datetime.datetime.now().isoformat()
    usage_log = {
        'timestamp': timestamp,
        'tier': tier,
        'user_email': user_email,
        'contacts_found': contacts_found,
        'emails_generated': emails_generated
    }
    
    print(f"API Usage: {usage_log}")
    
    try:
        with open('usage_log.json', 'a') as f:
            f.write(json.dumps(usage_log) + '\n')
    except Exception as e:
        print(f"Failed to write usage log: {e}")

def cleanup_old_csv_files():
    """Clean up old CSV files to save disk space"""
    try:
        current_time = datetime.datetime.now()
        
        for filename in os.listdir('.'):
            if filename.startswith('RecruitEdge_') and filename.endswith('.csv'):
                file_time = datetime.datetime.fromtimestamp(os.path.getctime(filename))
                age_hours = (current_time - file_time).total_seconds() / 3600
                
                if age_hours > 24:
                    os.remove(filename)
                    print(f"Cleaned up old CSV file: {filename}")
                    
    except Exception as e:
        print(f"Error cleaning up CSV files: {e}")

def validate_api_keys():
    """Validate that all required API keys are present"""
    missing_keys = []
    
    if not PEOPLE_DATA_LABS_API_KEY or PEOPLE_DATA_LABS_API_KEY == 'your_pdl_api_key':
        missing_keys.append('PEOPLE_DATA_LABS_API_KEY')
    
    if not OPENAI_API_KEY or 'your_openai_api_key' in OPENAI_API_KEY:
        missing_keys.append('OPENAI_API_KEY')
    
    if not STRIPE_SECRET_KEY or 'your_secret_key' in STRIPE_SECRET_KEY:
        missing_keys.append('STRIPE_SECRET_KEY')

    
    if missing_keys:
        print(f"WARNING: Missing API keys: {', '.join(missing_keys)}")
        return False
    
    print("All API keys validated successfully")
    return True

def startup_checks():
    """Run startup validation checks"""
    print("Running startup checks...")
    
    # Initialize database
    try:
        init_db()
        print("SQLite database initialized: OK")
    except Exception as e:
        print(f"SQLite database initialization: FAILED - {e}")
    
    if not validate_api_keys():
        print("WARNING: Some API keys are missing or invalid")
    
    cleanup_old_csv_files()
    
    try:
        test_response = requests.get(
            f"{PDL_BASE_URL}/person/search",
            params={
                'api_key': PEOPLE_DATA_LABS_API_KEY,
                'query': '{"query":{"bool":{"must":[{"exists":{"field":"emails"}}]}},"size":1}'
            },
            timeout=10
        )
        if test_response.status_code in [200, 402]:
            print("PDL API connection: OK")
        else:
            print(f"PDL API connection: ERROR ({test_response.status_code})")
    except Exception as e:
        print(f"PDL API connection: ERROR ({e})")
    
    # OpenAI API test
    try:
        test_response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": "test"}],
            max_tokens=5
        )
        print("OpenAI API connection: OK")
    except Exception as e:
        print(f"OpenAI API connection: ERROR - {e}")
    
    print("Startup checks completed")

def search_contacts_with_pdl(job_title, company, location, max_contacts=8):
    """Wrapper function - redirect to optimized version for backward compatibility"""
    return search_contacts_with_pdl_optimized(job_title, company, location, max_contacts)

# ========================================
# MAIN API ENDPOINTS - SIMPLIFIED TO TWO TIERS
# ========================================

@app.route('/ping')
def ping():
    return "pong"

@app.route('/health')
def health():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'tiers': ['free', 'pro'],
        'email_system': 'interesting_mutual_interests_v2',
        'services': {
            'pdl': 'connected',
            'openai': 'connected',
            'gmail': 'connected' if get_gmail_service() else 'unavailable'
        }
    })


CREATE_GMAIL_DRAFTS = False  # Set True to create Gmail drafts; False to only return subject/body and compose links

def build_mailto_link(contact, subject, body):
    try:
        from urllib.parse import quote
        to_addr = contact.get('Email') or contact.get('WorkEmail') or contact.get('PersonalEmail') or ''
        subj = quote(subject or '')
        # Use CRLF for better compatibility; also URL-encode newlines
        body_encoded = quote((body or '').replace('\n', '\r\n'))
        return f"mailto:{to_addr}?subject={subj}&body={body_encoded}"
    except Exception:
        return ''

# === NEW FINAL TIER FUNCTIONS (use unified email system) ===
def run_pro_tier_enhanced_final(job_title, company, location, resume_file, user_email=None, user_profile=None, career_interests=None, college_alumni=None):
    """PRO TIER: 56 contacts max with PDL + resume analysis + new unified email system"""
    print(f"Running PRO tier workflow with new email system for {user_email}")
    
    try:
        # GET USER ID FROM REQUEST CONTEXT
        user_id = None
        if hasattr(request, 'firebase_user'):
            user_id = request.firebase_user.get('uid')
            print(f"Using Firebase user ID: {user_id}")
        
        # CHECK USER CREDITS BEFORE SEARCHING
        credits_available = 840  # Default for pro tier
        if db and user_id:
            try:
                user_ref = db.collection('users').document(user_id)
                user_doc = user_ref.get()
                
                if user_doc.exists:
                    user_data = user_doc.to_dict()
                    credits_available = user_data.get('credits', 840)
                    tier = user_data.get('tier', 'free')
                    
                    # Verify user is Pro tier
                    if tier != 'pro':
                        return {'error': 'Pro tier subscription required', 'contacts': []}
                    
                    # Check credits (minimum 15 for 1 contact)
                    if credits_available < 15:
                        return {
                            'error': 'Insufficient credits. Please contact support for additional credits.',
                            'credits_needed': 15,
                            'current_credits': credits_available,
                            'contacts': []
                        }
                    
                    print(f"Pro user has {credits_available} credits available")
                else:
                    return {'error': 'User not found. Pro subscription required.', 'contacts': []}
            except Exception as credit_check_error:
                print(f"Credit check error: {credit_check_error}")
                return {'error': 'Unable to verify Pro subscription', 'contacts': []}
        
        # Calculate max contacts based on credits
        max_contacts_by_credits = min(TIER_CONFIGS['pro']['max_contacts'], credits_available // 15)  # 15 cap
        print(f"Max contacts by credits (PRO): {max_contacts_by_credits} (credits={credits_available})")

        
        # Step 1: Extract and parse resume
        resume_text = extract_text_from_pdf(resume_file)
        if not resume_text:
            return {'error': 'Could not extract text from PDF', 'contacts': []}
        
        print(f"DEBUG - PRO tier input data:")
        print(f"  resume_text length: {len(resume_text)}")
        print(f"  user_profile: {user_profile}")
        print(f"  career_interests: {career_interests}")
        print(f"  user_email: {user_email}")
        
        # Step 2: PDL Search for contacts (limited by credits)
        contacts = search_contacts_with_smart_location_strategy(
            job_title, company, location,
            max_contacts=max_contacts_by_credits,
            college_alumni=college_alumni
        )
        
        if not contacts:
            print("No contacts found for Pro tier")
            return {'error': 'No contacts found', 'contacts': []}
        
        # DEDUCT CREDITS BASED ON ACTUAL CONTACTS FOUND
        credits_to_deduct = len(contacts) * 15
        new_credits_balance = credits_available - credits_to_deduct
        
        # UPDATE CREDITS IN FIREBASE
        if db and user_id:
            try:
                user_ref = db.collection('users').document(user_id)
                user_ref.update({
                    'credits': new_credits_balance,
                    'last_search': datetime.datetime.now(),
                    'last_search_job_title': job_title,
                    'last_search_company': company,
                    'last_search_location': location,
                    'last_search_contacts': len(contacts),
                    'last_search_credits_used': credits_to_deduct,
                    'tier': 'pro'  # Ensure tier stays pro
                })
                print(f"Pro tier: Deducted {credits_to_deduct} credits for {len(contacts)} contacts. New balance: {new_credits_balance}")
            except Exception as credit_update_error:
                print(f"Failed to update credits for user ID {user_id}: {credit_update_error}")
                # Continue even if credit update fails
        
        # Step 3: Generate similarities and hometowns for each contact
        for contact in contacts:
            # Generate similarity
            try:
                similarity = generate_similarity_summary(resume_text, contact)
            except Exception:
                similarity = ''
            contact['Similarity'] = similarity
            
            # Extract hometown
            edu_hist = contact.get('EducationTop') or contact.get('EducationHistory') or ''
            try:
                hometown = extract_hometown_from_education_history_enhanced(edu_hist)
            except Exception:
                hometown = contact.get('Hometown') or 'Unknown'
            contact['Hometown'] = hometown or 'Unknown'
        
        # Step 4: Generate emails using NEW UNIFIED SYSTEM
        successful_drafts = 0
        for contact in contacts:
            print(f"DEBUG - Generating PRO email for {contact.get('FirstName', 'Unknown')}")
            
            # Generate personalized email
            email_subject, email_body = generate_email_for_both_tiers(
                contact,
                resume_text=resume_text,
                user_profile=user_profile,
                career_interests=career_interests
            )
            
            contact['email_subject'] = email_subject
            contact['email_body'] = email_body
            
            # Create Gmail draft
            draft_id = create_gmail_draft_for_user(contact, email_subject, email_body, tier='pro', user_email=user_email)
            contact['draft_id'] = draft_id
            if not str(draft_id).startswith('mock_'):
                successful_drafts += 1
        
        # Step 5: Filter to Pro fields
        pro_contacts = []
        for c in contacts:
            pro_contact = {k: v for k, v in c.items() if k in TIER_CONFIGS['pro']['fields']}
            pro_contact['email_subject'] = c.get('email_subject','')
            pro_contact['email_body'] = c.get('email_body','')
            pro_contacts.append(pro_contact)
        
        print(f"Pro tier completed for {user_email}: {len(pro_contacts)} contacts, {successful_drafts} Gmail drafts")
        
        # RETURN WITH CREDIT INFO (NO CSV FILE)
        return {
            'contacts': pro_contacts,
            'successful_drafts': successful_drafts,
            'tier': 'pro',
            'user_email': user_email,
            'user_id': user_id,
            'credits_used': credits_to_deduct,
            'credits_remaining': new_credits_balance,
            'total_contacts': len(contacts)
        }
        
    except Exception as e:
        print(f"Pro tier failed for {user_email}: {e}")
        traceback.print_exc()
        return {'error': str(e), 'contacts': []}
@app.route('/api/tier-info')
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
@app.route('/api/check-credits', methods=['GET'])
@require_firebase_auth
def check_credits():
    """Check user's current credits"""
    try:
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
                credits = user_data.get('credits', 0)
                max_credits = user_data.get('maxCredits', 120)
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
                    'credits': 120,
                    'max_credits': 120,
                    'searches_remaining': 8,
                    'tier': 'free',
                    'user_email': user_email
                })
        
        # If no Firebase, return defaults
        return jsonify({
            'credits': 0,
            'max_credits': 120,
            'searches_remaining': 0,
            'tier': 'free',
            'user_email': user_email
        })
        
    except Exception as e:
        print(f"Check credits error: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/directory/contacts', methods=['GET'])
@require_firebase_auth
def get_directory_contacts():
    user_email = request.firebase_user.get('email')
    return jsonify({'contacts': list_contacts_sqlite(user_email)})

@app.route('/api/directory/contacts', methods=['POST'])
@require_firebase_auth
def post_directory_contacts():
    data = request.get_json(silent=True) or {}
    user_email = request.firebase_user.get('email')
    contacts = data.get('contacts') or []
    if not isinstance(contacts, list):
        return jsonify({'error': 'contacts must be an array'}), 400
    saved = save_contacts_sqlite(user_email, contacts)
    return jsonify({'saved': saved})

# Update the /api/free-run endpoint to remove CSV download logic
@app.route("/api/free-run", methods=["POST"])
@require_firebase_auth
def free_run():
    try:
        # --- Parse request body ---
        if request.is_json:
            data = request.get_json(silent=True) or {}
            job_title = (data.get("jobTitle") or "").strip()
            company = (data.get("company") or "").strip()
            location = (data.get("location") or "").strip()
            user_profile = data.get("userProfile") or None
            resume_text = data.get("resumeText") or None
            career_interests = data.get("careerInterests") or []
            college_alumni = (data.get("collegeAlumni") or "").strip()
        else:
            job_title = (request.form.get("jobTitle") or "").strip()
            company = (request.form.get("company") or "").strip()
            location = (request.form.get("location") or "").strip()
            user_profile = request.form.get("userProfile") or None
            resume_text = request.form.get("resumeText") or None
            career_interests = request.form.get("careerInterests") or []
            college_alumni = (request.form.get("collegeAlumni") or "").strip()

        user_email = (request.firebase_user or {}).get("email") or ""

        # --- Debug logging ---
        print(f"New unified email system Free search for {user_email}: {job_title} at {company} in {location}")
        if resume_text:
            print(f"Resume provided for enhanced personalization ({len(resume_text)} chars)")
        print(f"DEBUG - college_alumni received: {college_alumni!r}")

        # --- Run the search ---
        result = run_free_tier_enhanced_optimized(
            job_title,
            company,
            location,
            user_email=user_email,
            user_profile=user_profile,
            resume_text=resume_text,
            career_interests=career_interests,
            college_alumni=college_alumni,  # ✅ pass through
        )

        if result.get("error"):
            return jsonify({"error": result["error"]}), 500

        response_data = {
            "contacts": result["contacts"],
            "successful_drafts": result.get("successful_drafts", 0),
            "total_contacts": len(result["contacts"]),
            "tier": "free",
            "user_email": user_email,
        }
        return jsonify(response_data)

    except Exception as e:
        print(f"Free endpoint error: {e}")
        import traceback; traceback.print_exc()
        return jsonify({"error": str(e)}), 500


# Add a separate CSV download endpoint if needed
@app.route('/api/free-run-csv', methods=['POST'])
@require_firebase_auth
def free_run_csv():
    """Free tier CSV download endpoint - separate from main search"""
    try:
        user_email = request.firebase_user.get('email')
        user_id = request.firebase_user['uid']
        
        # Same logic as free_run but always return CSV
        if request.is_json:
            data = request.json or {}
            job_title = data.get('jobTitle', '').strip() if data.get('jobTitle') else ''
            company = data.get('company', '').strip() if data.get('company') else ''
            location = data.get('location', '').strip() if data.get('location') else ''
            user_profile = data.get('userProfile') or None
            resume_text = data.get('resumeText', '').strip() if data.get('resumeText') else None
            career_interests = data.get('careerInterests', [])
        else:
            job_title = (request.form.get('jobTitle') or '').strip()
            company = (request.form.get('company') or '').strip()
            location = (request.form.get('location') or '').strip()
            user_profile_raw = request.form.get('userProfile')
            try:
                user_profile = json.loads(user_profile_raw) if user_profile_raw else None
            except Exception:
                user_profile = None
            
            resume_text = None
            if 'resume' in request.files:
                resume_file = request.files['resume']
                if resume_file.filename and resume_file.filename.lower().endswith('.pdf'):
                    resume_text = extract_text_from_pdf(resume_file)
            
            career_interests = []
            try:
                career_interests_raw = request.form.get('careerInterests')
                if career_interests_raw:
                    career_interests = json.loads(career_interests_raw)
            except Exception:
                career_interests = []
        
        if not job_title or not location:
            missing = []
            if not job_title: missing.append('Job Title')
            if not location: missing.append('Location')
            error_msg = f"Missing required fields: {', '.join(missing)}"
            return jsonify({'error': error_msg}), 400
        
        # Run the search
        result = run_free_tier_enhanced_final(
            job_title,
            company,
            location,
            user_email=user_email,
            user_profile=user_profile,
            resume_text=resume_text,
            career_interests=career_interests
        )
        
        if result.get('error'):
            return jsonify({'error': result['error']}), 500
        
        # Return CSV file
        return send_file(result['csv_file'], as_attachment=True)
        
    except Exception as e:
        print(f"Free CSV endpoint error: {e}")
        return jsonify({'error': str(e)}), 500

# Update the /api/pro-run endpoint similarly
@app.route("/api/pro-run", methods=["POST"])
@require_firebase_auth
def pro_run():
    try:
        user_email = (request.firebase_user or {}).get("email") or ""
        
        # Handle both JSON and form-data requests
        if request.is_json:
            # JSON request - expecting base64 encoded resume or resume text
            data = request.get_json(silent=True) or {}
            job_title = (data.get("jobTitle") or "").strip()
            company = (data.get("company") or "").strip()
            location = (data.get("location") or "").strip()
            
            # For JSON requests, we expect either resumeText or a different format
            resume_text = data.get("resumeText") or None
            if not resume_text:
                return jsonify({"error": "Resume text is required for Pro tier"}), 400
                
            user_profile = data.get("userProfile") or None
            career_interests = data.get("careerInterests") or []
            college_alumni = (data.get("collegeAlumni") or "").strip()
            
        else:
            # Form data request - expecting file upload
            job_title = (request.form.get("jobTitle") or "").strip()
            company = (request.form.get("company") or "").strip()
            location = (request.form.get("location") or "").strip()
            
            # Handle file upload
            if 'resume' not in request.files:
                return jsonify({'error': 'Resume PDF file is required for Pro tier'}), 400
            
            resume_file = request.files['resume']
            if resume_file.filename == '' or not resume_file.filename.lower().endswith('.pdf'):
                return jsonify({'error': 'Valid PDF resume file is required'}), 400
            
            # Extract text from uploaded PDF
            resume_text = extract_text_from_pdf(resume_file)
            if not resume_text:
                return jsonify({'error': 'Could not extract text from PDF'}), 400
            
            # Parse other form data
            try:
                user_profile_raw = request.form.get("userProfile")
                user_profile = json.loads(user_profile_raw) if user_profile_raw else None
            except:
                user_profile = None
                
            try:
                career_interests_raw = request.form.get("careerInterests")
                career_interests = json.loads(career_interests_raw) if career_interests_raw else []
            except:
                career_interests = []
                
            college_alumni = (request.form.get("collegeAlumni") or "").strip()

        # Validation
        if not job_title or not location:
            missing = []
            if not job_title: missing.append('Job Title')
            if not location: missing.append('Location')
            return jsonify({'error': f"Missing required fields: {', '.join(missing)}"}), 400

        # Debug logging
        print(f"New unified email system PRO search for {user_email}: {job_title} at {company} in {location}")
        if resume_text:
            print(f"Resume provided ({len(resume_text)} chars)")
        print(f"DEBUG - college_alumni received: {college_alumni!r}")

        # Run the PRO tier search - pass resume_text directly instead of resume_file
        result = run_pro_tier_enhanced_final_with_text(
            job_title,
            company,
            location,
            resume_text,  # Pass the extracted text, not the file
            user_email=user_email,
            user_profile=user_profile,
            career_interests=career_interests,
            college_alumni=college_alumni,
        )

        if result.get("error"):
            return jsonify({"error": result["error"]}), 500

        response_data = {
            "contacts": result["contacts"],
            "successful_drafts": result.get("successful_drafts", 0),
            "total_contacts": len(result["contacts"]),
            "tier": "pro",
            "user_email": user_email,
        }
        return jsonify(response_data)

    except Exception as e:
        print(f"Pro endpoint error: {e}")
        import traceback; traceback.print_exc()
        return jsonify({"error": str(e)}), 500


# Create a new version of the PRO tier function that accepts resume_text instead of resume_file
def run_pro_tier_enhanced_final_with_text(job_title, company, location, resume_text, user_email=None, user_profile=None, career_interests=None, college_alumni=None):
    """PRO TIER: Modified to accept resume_text instead of resume_file"""
    print(f"Running PRO tier workflow with resume text for {user_email}")
    
    try:
        # GET USER ID FROM REQUEST CONTEXT
        user_id = None
        if hasattr(request, 'firebase_user'):
            user_id = request.firebase_user.get('uid')
            print(f"Using Firebase user ID: {user_id}")
        
        # CHECK USER CREDITS BEFORE SEARCHING
        credits_available = 840  # Default for pro tier
        if db and user_id:
            try:
                user_ref = db.collection('users').document(user_id)
                user_doc = user_ref.get()
                
                if user_doc.exists:
                    user_data = user_doc.to_dict()
                    credits_available = user_data.get('credits', 840)
                    tier = user_data.get('tier', 'free')
                    
                    # Verify user is Pro tier
                    if tier != 'pro':
                        return {'error': 'Pro tier subscription required', 'contacts': []}
                    
                    # Check credits (minimum 15 for 1 contact)
                    if credits_available < 15:
                        return {
                            'error': 'Insufficient credits. Please contact support for additional credits.',
                            'credits_needed': 15,
                            'current_credits': credits_available,
                            'contacts': []
                        }
                    
                    print(f"Pro user has {credits_available} credits available")
                else:
                    return {'error': 'User not found. Pro subscription required.', 'contacts': []}
            except Exception as credit_check_error:
                print(f"Credit check error: {credit_check_error}")
                return {'error': 'Unable to verify Pro subscription', 'contacts': []}
        
        # Calculate max contacts based on credits
        tier_max = TIER_CONFIGS['pro']['max_contacts']    # 15
        max_contacts_by_credits = min(tier_max, credits_available // 15)
        print(f"Max contacts by credits: {max_contacts_by_credits} (based on {credits_available} credits)")
        
        # Validate resume text
        if not resume_text or len(resume_text.strip()) < 10:
            return {'error': 'Valid resume content is required for Pro tier', 'contacts': []}
        
        print(f"DEBUG - PRO tier input data:")
        print(f"  resume_text length: {len(resume_text)}")
        print(f"  user_profile: {user_profile}")
        print(f"  career_interests: {career_interests}")
        print(f"  user_email: {user_email}")
        
        # PDL Search for contacts (limited by credits)
        contacts = search_contacts_with_smart_location_strategy(
            job_title, company, location,
            max_contacts=max_contacts_by_credits,
            college_alumni=college_alumni
        )
        
        if not contacts:
            print("No contacts found for Pro tier")
            return {'error': 'No contacts found', 'contacts': []}
        
        # DEDUCT CREDITS BASED ON ACTUAL CONTACTS FOUND
        credits_to_deduct = len(contacts) * 15
        new_credits_balance = credits_available - credits_to_deduct
        
        # UPDATE CREDITS IN FIREBASE
        if db and user_id:
            try:
                user_ref = db.collection('users').document(user_id)
                user_ref.update({
                    'credits': new_credits_balance,
                    'last_search': datetime.datetime.now(),
                    'last_search_job_title': job_title,
                    'last_search_company': company,
                    'last_search_location': location,
                    'last_search_contacts': len(contacts),
                    'last_search_credits_used': credits_to_deduct,
                    'tier': 'pro'
                })
                print(f"Pro tier: Deducted {credits_to_deduct} credits for {len(contacts)} contacts. New balance: {new_credits_balance}")
            except Exception as credit_update_error:
                print(f"Failed to update credits for user ID {user_id}: {credit_update_error}")
        
        # Generate similarities and hometowns for each contact
        for contact in contacts:
            # Generate similarity
            try:
                similarity = generate_similarity_summary(resume_text, contact)
            except Exception:
                similarity = ''
            contact['Similarity'] = similarity
            
            # Extract hometown
            edu_hist = contact.get('EducationTop') or contact.get('EducationHistory') or ''
            try:
                hometown = extract_hometown_from_education_history_enhanced(edu_hist)
            except Exception:
                hometown = contact.get('Hometown') or 'Unknown'
            contact['Hometown'] = hometown or 'Unknown'
        
        # Generate emails using unified system
        successful_drafts = 0
        for contact in contacts:
            print(f"DEBUG - Generating PRO email for {contact.get('FirstName', 'Unknown')}")
            
            # Generate personalized email
            email_subject, email_body = generate_email_for_both_tiers(
                contact,
                resume_text=resume_text,
                user_profile=user_profile,
                career_interests=career_interests
            )
            
            contact['email_subject'] = email_subject
            contact['email_body'] = email_body
            
            # Create Gmail draft
            draft_id = create_gmail_draft_for_user(contact, email_subject, email_body, tier='pro', user_email=user_email)
            contact['draft_id'] = draft_id
            if not str(draft_id).startswith('mock_'):
                successful_drafts += 1
        
        # Filter to Pro fields
        pro_contacts = []
        for c in contacts:
            pro_contact = {k: v for k, v in c.items() if k in TIER_CONFIGS['pro']['fields']}
            pro_contact['email_subject'] = c.get('email_subject','')
            pro_contact['email_body'] = c.get('email_body','')
            pro_contacts.append(pro_contact)
        
        print(f"Pro tier completed for {user_email}: {len(pro_contacts)} contacts, {successful_drafts} Gmail drafts")
        
        return {
            'contacts': pro_contacts,
            'successful_drafts': successful_drafts,
            'tier': 'pro',
            'user_email': user_email,
            'user_id': user_id,
            'credits_used': credits_to_deduct,
            'credits_remaining': new_credits_balance,
            'total_contacts': len(contacts)
        }
        
    except Exception as e:
        print(f"Pro tier failed for {user_email}: {e}")
        traceback.print_exc()
        return {'error': str(e), 'contacts': []}



# Add Pro CSV download endpoint
@app.route('/api/pro-run-csv', methods=['POST'])
@require_firebase_auth
def pro_run_csv():
    """Pro tier CSV download endpoint - separate from main search"""
    try:
        user_email = request.firebase_user.get('email')
        user_id = request.firebase_user['uid']
        
        # Same logic as pro_run but always return CSV
        job_title = request.form.get('jobTitle')
        company = request.form.get('company')
        location = request.form.get('location')
        
        user_profile_raw = request.form.get('userProfile')
        user_profile = None
        try:
            user_profile = json.loads(user_profile_raw) if user_profile_raw else None
        except Exception:
            user_profile = None
        
        career_interests = []
        try:
            career_interests_raw = request.form.get('careerInterests')
            if career_interests_raw:
                career_interests = json.loads(career_interests_raw)
        except Exception:
            career_interests = []
        
        job_title = (job_title or '').strip()
        company = (company or '').strip()
        location = (location or '').strip()
        
        if not job_title or not location:
            missing = []
            if not job_title: missing.append('Job Title')
            if not location: missing.append('Location')
            error_msg = f"Missing required fields: {', '.join(missing)}"
            return jsonify({'error': error_msg}), 400
        
        if 'resume' not in request.files:
            return jsonify({'error': 'Resume PDF file is required for Pro tier'}), 400
        
        resume_file = request.files['resume']
        if resume_file.filename == '' or not resume_file.filename.lower().endswith('.pdf'):
            return jsonify({'error': 'Valid PDF resume file is required'}), 400
        
        # Run the search
        result = run_pro_tier_enhanced_final(
            job_title,
            company,
            location,
            resume_file,
            user_email=user_email,
            user_profile=user_profile,
            career_interests=career_interests
        )
        
        if result.get('error'):
            return jsonify({'error': result['error']}), 500
        
        # Return CSV file
        return send_file(result['csv_file'], as_attachment=True)
        
    except Exception as e:
        print(f"Pro CSV endpoint error: {e}")
        return jsonify({'error': str(e)}), 500
# Backward compatibility - redirect old endpoints to new ones
@app.route('/api/basic-run', methods=['POST'])
def basic_run_redirect():
    """Redirect basic-run to free-run for backward compatibility"""
    print("Redirecting /api/basic-run to /api/free-run")
    return free_run()

@app.route('/api/advanced-run', methods=['POST'])
def advanced_run_redirect():
    """Redirect advanced-run to free-run (advanced tier removed)"""
    print("Redirecting /api/advanced-run to /api/free-run (advanced tier removed)")
    return free_run()

@app.route('/api/autocomplete/<data_type>', methods=['GET'])
def autocomplete_api(data_type):
    """Enhanced API endpoint for frontend autocomplete with better error handling"""
    try:
        query = request.args.get('query', '').strip()
        
        if not query or len(query) < 2:
            return jsonify({
                'suggestions': [],
                'query': query,
                'data_type': data_type
            })
        
        valid_types = ['job_title', 'company', 'location', 'school', 'skill', 'industry', 'role', 'sub_role']
        if data_type not in valid_types:
            return jsonify({
                'error': f'Invalid data type. Must be one of: {", ".join(valid_types)}',
                'suggestions': []
            }), 400
        
        print(f"Autocomplete request: {data_type} - '{query}'")
        
        suggestions = get_autocomplete_suggestions(query, data_type)
        
        clean_suggestions = []
        for suggestion in suggestions[:10]:
            if isinstance(suggestion, dict) and 'name' in suggestion:
                # Handle PDL's response format: {'name': 'value', 'count': 123}
                clean_suggestions.append(suggestion['name'])
            elif isinstance(suggestion, str) and suggestion.strip():
                clean_suggestions.append(suggestion.strip())
        
        return jsonify({
            'suggestions': clean_suggestions,
            'query': query,
            'data_type': data_type,
            'count': len(clean_suggestions)
        })
        
    except Exception as e:
        print(f"Autocomplete API error for {data_type} - '{query}': {e}")
        traceback.print_exc()
        
        return jsonify({
            'error': 'Failed to fetch suggestions',
            'suggestions': [],
            'query': query,
            'data_type': data_type
        }), 500

@app.route('/api/enrich-job-title', methods=['POST'])
def enrich_job_title_api():
    """API endpoint for job title enrichment"""
    try:
        data = request.json
        job_title = data.get('jobTitle', '').strip()
        
        if not job_title:
            return jsonify({'error': 'Job title is required'}), 400
        
        enrichment = enrich_job_title_with_pdl(job_title)
        
        return jsonify({
            'original': job_title,
            'enrichment': enrichment
        })
        
    except Exception as e:
        print(f"Job title enrichment API error: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/parse-resume', methods=['POST'])
def parse_resume():
    """Parse uploaded resume and extract user information"""
    try:
        if 'resume' not in request.files:
            return jsonify({'error': 'No resume file provided'}), 400
        
        file = request.files['resume']
        if file.filename == '':
            return jsonify({'error': 'No file selected'}), 400
        
        if not file.filename.lower().endswith('.pdf'):
            return jsonify({'error': 'Only PDF files are supported'}), 400
        
        resume_text = extract_text_from_pdf(file)
        if not resume_text:
            return jsonify({'error': 'Could not extract text from PDF'}), 400
        
        parsed_info = parse_resume_info(resume_text)
        
        return jsonify({
            'success': True,
            'data': parsed_info
        })
        
    except Exception as e:
        print(f"Resume parsing error: {e}")
        return jsonify({'error': 'Failed to parse resume'}), 500

@app.route('/api/contacts', methods=['GET'])
@require_firebase_auth
def get_contacts():
    """Get all contacts for a user"""
    try:
        user_id = request.firebase_user['uid']
        
        if not db:
            return jsonify({'error': 'Firebase not initialized'}), 500
        
        contacts_ref = db.collection('users').document(user_id).collection('contacts')
        docs = contacts_ref.order_by('createdAt', direction=firestore.Query.DESCENDING).stream()
        
        items = []
        for doc in docs:
            d = doc.to_dict()
            d['id'] = doc.id
            items.append(d)
        
        return jsonify({'contacts': items})
        
    except Exception as e:
        print(f"Error getting contacts: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/contacts', methods=['POST'])
@require_firebase_auth
def create_contact():
    """Create a new contact"""
    try:
        data = request.get_json()
        user_id = request.firebase_user['uid']
        
        if not db:
            return jsonify({'error': 'Firebase not initialized'}), 500
        
        today = datetime.datetime.now().strftime('%m/%d/%Y')
        contact = {
            'firstName': data.get('firstName', ''),
            'lastName': data.get('lastName', ''),
            'linkedinUrl': data.get('linkedinUrl', ''),
            'email': data.get('email', ''),
            'company': data.get('company', ''),
            'jobTitle': data.get('jobTitle', ''),
            'college': data.get('college', ''),
            'location': data.get('location', ''),
            'firstContactDate': today,
            'status': 'Not Contacted',
            'lastContactDate': today,
            'userId': user_id,
            'createdAt': today,
        }
        
        doc_ref = db.collection('users').document(user_id).collection('contacts').add(contact)
        contact['id'] = doc_ref[1].id
        
        return jsonify({'contact': contact}), 201
        
    except Exception as e:
        print(f"Error creating contact: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/contacts/<contact_id>', methods=['PUT'])
@require_firebase_auth
def update_contact(contact_id):
    """Update an existing contact"""
    try:
        data = request.get_json()
        user_id = request.firebase_user['uid']
        
        if not db:
            return jsonify({'error': 'Firebase not initialized'}), 500
        
        ref = db.collection('users').document(user_id).collection('contacts').document(contact_id)
        doc = ref.get()
        
        if not doc.exists:
            return jsonify({'error': 'Contact not found'}), 404
        
        update = {k: data[k] for k in ['firstName', 'lastName', 'linkedinUrl', 'email', 'company', 'jobTitle', 'college', 'location'] if k in data}
        
        if 'status' in data:
            current = doc.to_dict()
            if current.get('status') != data['status']:
                update['lastContactDate'] = datetime.datetime.now().strftime('%m/%d/%Y')
            update['status'] = data['status']
        
        ref.update(update)
        out = ref.get().to_dict()
        out['id'] = contact_id
        
        return jsonify({'contact': out})
        
    except Exception as e:
        print(f"Error updating contact: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/contacts/<contact_id>', methods=['DELETE'])
@require_firebase_auth
def delete_contact(contact_id):
    """Delete a contact"""
    try:
        user_id = request.firebase_user['uid']
        
        if not db:
            return jsonify({'error': 'Firebase not initialized'}), 500
        
        ref = db.collection('users').document(user_id).collection('contacts').document(contact_id)
        
        if not ref.get().exists:
            return jsonify({'error': 'Contact not found'}), 404
        
        ref.delete()
        
        return jsonify({'message': 'Contact deleted successfully'})
        
    except Exception as e:
        print(f"Error deleting contact: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/contacts/bulk', methods=['POST'])
@require_firebase_auth
def bulk_create_contacts():
    """Bulk create contacts with deduplication"""
    try:
        data = request.get_json() or {}
        user_id = request.firebase_user['uid']
        raw_contacts = data.get('contacts') or []
        print(f"DEBUG - Raw contacts received: {json.dumps(raw_contacts, indent=2)}")
        
        if not db:
            return jsonify({'error': 'Firebase not initialized'}), 500

        contacts_ref = db.collection('users').document(user_id).collection('contacts')
        created = 0
        skipped = 0
        created_contacts = []
        today = datetime.datetime.now().strftime('%m/%d/%Y')

        for rc in raw_contacts:
            first_name = (rc.get('FirstName') or rc.get('firstName') or '').strip()
            last_name = (rc.get('LastName') or rc.get('lastName') or '').strip()
            email = (rc.get('Email') or rc.get('WorkEmail') or rc.get('PersonalEmail') or rc.get('email') or '').strip()
            linkedin = (rc.get('LinkedIn') or rc.get('linkedinUrl') or '').strip()
            company = (rc.get('Company') or rc.get('company') or '').strip()
            job_title = (rc.get('Title') or rc.get('jobTitle') or '').strip()
            college = (rc.get('College') or rc.get('college') or '').strip()
            city = (rc.get('City') or '').strip()
            state = (rc.get('State') or '').strip()
            location = (rc.get('location') or ', '.join([v for v in [city, state] if v]) or '').strip()

            is_dup = False
            if email:
                dup_q = contacts_ref.where('email', '==', email).limit(1).stream()
                is_dup = any(True for _ in dup_q)
            if not is_dup and linkedin:
                dup_q2 = contacts_ref.where('linkedinUrl', '==', linkedin).limit(1).stream()
                is_dup = any(True for _ in dup_q2)

            if is_dup:
                skipped += 1
                continue

            doc_data = {
                'firstName': first_name,
                'lastName': last_name,
                'linkedinUrl': linkedin,
                'email': email,
                'company': company,
                'jobTitle': job_title,
                'college': college,
                'location': location,
                'firstContactDate': today,
                'status': 'Not Contacted',
                'lastContactDate': today,
                'userId': user_id,
                'createdAt': today,
            }
            doc_ref = contacts_ref.add(doc_data)[1]
            doc_data['id'] = doc_ref.id
            created_contacts.append(doc_data)
            created += 1

        return jsonify({
            'created': created,
            'skipped': skipped,
            'contacts': created_contacts
        }), 201

    except Exception as e:
        print(f"Bulk create error: {e}")
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/api/user/update-tier', methods=['POST'])
def update_user_tier():
    """Update user tier and credits"""
    try:
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
        user_data = {
            'email': user_email,
            'tier': tier,
            'credits': credits,
            'maxCredits': max_credits,
            'updated_at': datetime.datetime.now().isoformat()
        }
        
        print(f"Updated user {user_email} to {tier} tier with {credits} credits")
        
        return jsonify({
            'success': True,
            'user': user_data
        })
        
    except Exception as e:
        print(f"User tier update error: {e}")
        return jsonify({'error': str(e)}), 500
# ========================================
# STRIPE PAYMENT ENDPOINTS
# ========================================
@app.route('/api/create-checkout-session', methods=['POST'])
@require_firebase_auth
def create_checkout_session():
    """Create Stripe checkout session for Pro upgrade"""
    try:
        data = request.get_json() or {}
        user_id = request.firebase_user['uid']
        user_email = request.firebase_user.get('email', '')

        price_id = data.get('priceId')
        success_url = data.get('successUrl', 'http://localhost:3000/payment-success')
        cancel_url = data.get('cancelUrl', 'http://localhost:3000/pricing')

        if not price_id:
            return jsonify({'error': 'Price ID is required'}), 400

        if not STRIPE_SECRET_KEY:
            return jsonify({'error': 'Stripe not configured'}), 500

        print(f"Creating Stripe checkout session for {user_email}")

        session = stripe.checkout.Session.create(
            payment_method_types=['card'],
            line_items=[
                {
                    'price': price_id,
                    'quantity': 1,
                },
            ],
            mode='subscription',
            success_url=success_url + '?session_id={CHECKOUT_SESSION_ID}',
            cancel_url=cancel_url,
            customer_email=user_email,
            metadata={
                'userId': user_id,
                'userEmail': user_email,
                'plan': 'pro'
            },
            billing_address_collection='required',
            allow_promotion_codes=True,
        )

        print(f"Created checkout session: {session.id}")
        return jsonify({'sessionId': session.id})

    except stripe.error.StripeError as e:
        print(f"Stripe error: {e}")
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        print(f"Checkout session creation failed: {e}")
        return jsonify({'error': 'Failed to create checkout session'}), 500
@app.route('/api/stripe-webhook', methods=['POST'])
def stripe_webhook():
    payload = request.get_data()
    sig_header = request.headers.get('Stripe-Signature')
    
    try:
        event = stripe.Webhook.construct_event(
            payload, sig_header, STRIPE_WEBHOOK_SECRET
        )
    except:
        return jsonify({'error': 'Invalid webhook'}), 400

    if event['type'] == 'checkout.session.completed':
        session = event['data']['object']
        user_id = session['metadata']['userId']
        # Update user to Pro tier here
        
    return jsonify({'status': 'success'})


# Error handlers
@app.errorhandler(404)
def not_found(error):
    """Handle 404 errors"""
    # For API routes, return JSON error
    if request.path.startswith('/api/'):
        return jsonify({'error': 'Endpoint not found'}), 404
    # For everything else (React routes), serve the React app
    return send_from_directory(app.static_folder, "index.html")

@app.errorhandler(500)
def internal_error(error):
    """Handle 500 errors"""
    return jsonify({'error': 'Internal server error'}), 500

@app.errorhandler(Exception)
def handle_exception(e):
    """Handle uncaught exceptions"""
    print(f"Uncaught exception: {e}")
    traceback.print_exc()
    return jsonify({'error': 'An unexpected error occurred'}), 500


# === BEGIN NEW UNIFIED EMAIL SYSTEM (template-based) ===
def extract_career_interests_from_profile(user_profile):
    """Extract only career interests from onboarding profile data.
    Expects user_profile like {'careerInterests': ['Investment Banking','Consulting']} or similar."""
    try:
        if not user_profile:
            return []
        interests = user_profile.get('careerInterests') or user_profile.get('career_interests') or []
        if isinstance(interests, str):
            # split by comma if delivered as a string
            return [s.strip() for s in interests.split(',') if s.strip()]
        if isinstance(interests, list):
            return [str(x).strip() for x in interests if str(x).strip()]
        return []
    except Exception:
        return []

def extract_user_info_from_resume_priority(resume_text, profile):
    """Return a dict prioritizing resume-derived facts (name, school, grad year, major) over profile.
    Fallbacks to profile-only if resume absent."""
    info = {}
    resume_text = (resume_text or '').strip()
    profile = profile or {}
    try:
        # Pull from resume first if available via existing parser (if defined)
        try:
            parsed = parse_resume_info(resume_text) if resume_text else {}
        except Exception:
            parsed = {}
        # Name
        info['name'] = parsed.get('name') or profile.get('name') or profile.get('fullName') or ''
        # University
        info['university'] = parsed.get('university') or parsed.get('school') or profile.get('university') or profile.get('college') or ''
        # Major
        info['major'] = parsed.get('major') or profile.get('major') or ''
        # Graduation year
        info['year'] = parsed.get('grad_year') or parsed.get('graduation_year') or profile.get('graduationYear') or profile.get('year') or ''
        # Degree
        info['degree'] = parsed.get('degree') or profile.get('degree') or ''
        # Hometown (optional if resume mentions)
        info['hometown'] = parsed.get('hometown') or profile.get('hometown') or ''
        # Career interests from onboarding only
        info['career_interests'] = extract_career_interests_from_profile(profile)
        return info
    except Exception:
        return {}

def build_template_prompt(user_info, contact, resume_text):
    """Build the exact prompt spec that drives template selection and drafting."""
    import json as _json
    
    # Get actual values, not placeholders
    name = user_info.get('name', '') or 'John Smith'  # Use actual name or fallback
    university = user_info.get('university', '') or 'University'
    major = user_info.get('major', '') or 'student'
    year = user_info.get('year', '') or ''
    degree = user_info.get('degree', '') or ''
    career_interests = user_info.get('career_interests', [])
    
    # Build a clean description of career interests
    interests_str = ""
    if career_interests:
        if len(career_interests) == 1:
            interests_str = career_interests[0]
        elif len(career_interests) == 2:
            interests_str = f"{career_interests[0]} and {career_interests[1]}"
        else:
            interests_str = f"{', '.join(career_interests[:-1])}, and {career_interests[-1]}"
    
    contact_norm = {
        'FirstName': contact.get('FirstName',''),
        'LastName': contact.get('LastName',''),
        'Title': contact.get('Title',''),
        'Company': contact.get('Company',''),
        'City': contact.get('City',''),
        'State': contact.get('State',''),
        'College': contact.get('College',''),
        'Hometown': contact.get('Hometown','')
    }
    
    return (
        "You are an expert career outreach email writer for college students.\n"
        "Follow these rules exactly:\n"
        "- Write a complete, personalized email using the provided information\n"
        "- Return STRICT JSON with keys: template, subject, body\n"
        "- The email must be 120-170 words, concise, respectful, and specific\n"
        "- Use actual names and information - NO placeholders like [name], {name}, or [Company]\n"
        "- Choose appropriate template: Straightforward, Common-Background, Research-Acknowledgment, Resume-Context, or Aspirational\n"
        "- Ask for a 15-20 minute chat within 1-2 weeks\n\n"
        f"Student Information:\n"
        f"- Name: {name}\n"
        f"- University: {university}\n"
        f"- Major: {major}\n"
        f"- Year: {year}\n"
        f"- Degree: {degree}\n"
        f"- Career Interests: {interests_str}\n\n"
        f"Contact Information: {_json.dumps(contact_norm)}\n\n"
        f"Resume Context: {resume_text[:1000].replace(chr(10), ' ') if resume_text else 'No resume provided'}\n\n"
        "Write the complete email using the actual names and information provided. "
        "Do NOT use any placeholders - fill in all information directly.\n"
        "Return JSON only with template, subject, and body keys."
    )

def parse_openai_email_response(text):
    """Parse JSON from model response gracefully, with fallbacks."""
    import json as _json
    try:
        return _json.loads(text)
    except Exception:
        try:
            start = text.find('{')
            end = text.rfind('}')
            if start != -1 and end != -1 and end > start:
                return _json.loads(text[start:end+1])
        except Exception:
            pass
    return {
        'template': 'Straightforward',
        'subject': 'Quick question about your work',
        'body': 'Hi there â€” I had a quick question about your role and would value a brief chat.'
    }

def sanitize_email_placeholders(body, contact, user_info):
    """Clean placeholders and fix easy casing issues."""
    import re as _re
    def cap_name(s):
        s = (s or "").strip()
        if not s:
            return s
        if s.islower():
            return s[:1].upper() + s[1:]
        return s
    b = (body or '').strip()
    b = _re.sub(r'\[(?:Company|Title|Name|University)\]', '', b)
    b = b.replace('{Company}', contact.get('Company','')).replace('{Title}', contact.get('Title',''))
    # Fix "Hi grace," -> "Hi Grace,"
    fname = cap_name(contact.get('FirstName',''))
    if fname:
        b = _re.sub(r'(?i)\bhi\s+' + _re.escape(fname.lower()) + r'\b', 'Hi ' + fname, b)
    b = _re.sub(r' +', ' ', b).strip()
    return b



def enforce_networking_prompt_rules(body, resume_link=None):
    """Apply A+B+C stricter rules for networking emails.
    A: Strip all URLs except the given resume_link (if provided). Preserve plain anchor text for markdown links.
    B: Remove filler phrases: 'very really'; rewrite 'in order to' -> 'to', 'due to the fact that' -> 'because'.
    C: Remove/soften 'absolutely love your work' -> 'was impressed by your work'.
    """
    import re as _re
    if not body:
        return body or ""

    text = str(body)

    # A1: Replace markdown links [text](url) with just 'text', unless url == resume_link (keep text + url appended).
    def _md_repl(m):
        label = m.group(1)
        url = m.group(2)
        if resume_link and url.strip() == resume_link.strip():
            return f"{label} {url}"
        return label
    text = _re.sub(r"\[([^\]]+)\]\((https?://[^)]+)\)", _md_repl, text)

    # A2: Remove bare URLs unless it's the resume_link
    def _url_repl(m):
        url = m.group(0)
        # Trim trailing punctuation when comparing, but keep original removal logic
        cmp = url.rstrip(').,;:')
        if resume_link and cmp == resume_link.strip():
            return url
        return ""
    text = _re.sub(r"https?://\S+", _url_repl, text)

    # B: Filler phrase cleanup
    text = _re.sub(r"\bvery\s+really\b", "", text, flags=_re.IGNORECASE)
    text = _re.sub(r"\bin order to\b", "to", text, flags=_re.IGNORECASE)
    text = _re.sub(r"\bdue to the fact that\b", "because", text, flags=_re.IGNORECASE)

    # C: Ban 'absolutely love your work'
    text = _re.sub(r"\babsolutely\s+love\s+your\s+work\b", "was impressed by your work", text, flags=_re.IGNORECASE)

    # Normalize extra whitespace created by removals
    text = _re.sub(r"\s+", " ", text).strip()
    return text

def generate_enhanced_fallback_email(contact, user_info):
    subject = f"Question about your work at {contact.get('Company','your company')}"
    body = f"""Hi {contact.get('FirstName','')},

My name is {user_info.get('name','[Your Name]')} and I'm a {user_info.get('year','')} {user_info.get('major','')} student at {user_info.get('university','')}. Your role as {contact.get('Title','')} at {contact.get('Company','')} stood out to me.

Would you be open to a 15â€“20 minute chat next week? I'd love to learn how you got started and what skills matter most.

Thank you,
{user_info.get('name','[Your Name]')}"""
    return subject, body

def generate_template_based_email_system(contact, resume_text=None, user_profile=None):
    """Core function: unified email generation for both tiers using 5 templates."""
    user_info = extract_user_info_from_resume_priority(resume_text, user_profile)
    prompt = build_template_prompt(user_info, contact, resume_text or '')
    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role":"user","content": prompt}],
            temperature=0.4,
            max_tokens=500
        )
        raw = response.choices[0].message.content
        parsed = parse_openai_email_response(raw)
        subject = parsed.get('subject') or 'Quick question about your work'
        body = parsed.get('body') or ''
        body = sanitize_email_placeholders(body, contact, user_info)
        return subject, body
    except Exception:
        return generate_enhanced_fallback_email(contact, user_info)

def generate_email_for_both_tiers(contact, resume_text=None, user_profile=None, career_interests=None):
    """Public entrypoint used by FREE and PRO tier pipelines, identical email quality."""
    # Ensure career_interests are included in user_profile if provided separately
    if career_interests and user_profile:
        # Add career_interests to user_profile if not already present
        if 'careerInterests' not in user_profile and 'career_interests' not in user_profile:
            user_profile = {**user_profile, 'careerInterests': career_interests}
    elif career_interests and not user_profile:
        # Create a minimal user_profile with just career_interests
        user_profile = {'careerInterests': career_interests}
    
    return generate_template_based_email_system(contact, resume_text=resume_text, user_profile=user_profile)

# === END NEW UNIFIED EMAIL SYSTEM (template-based) ===
# ========================================
# MAIN ENTRY POINT
# ========================================
# Replace the existing catch-all route at the end with this:
@app.route("/", defaults={"path": ""})
@app.route("/<path:path>")
def serve_react(path):
    # For root path, always serve index.html
    if not path:
        return send_from_directory(app.static_folder, "index.html")
    
    # Check if the path is for an asset file
    if path.startswith("assets/"):
        asset_path = path[7:]  # Remove "assets/" prefix
        return send_from_directory(os.path.join(app.static_folder, "assets"), asset_path)
    
    # Check if the file exists in dist
    file_path = os.path.join(app.static_folder, path)
    if os.path.exists(file_path) and os.path.isfile(file_path):
        return send_from_directory(app.static_folder, path)
    
    # Otherwise serve index.html for client-side routing
    return send_from_directory(app.static_folder, "index.html")
    # app = Flask(__name__, static_folder="connect-grow-hire/dist", static_url_path="")


if __name__ == '__main__':
    print("=" * 50)
    print("Initializing RecruitEdge server with TWO TIERS: Free and Pro...")
    print("=" * 50)
    
    startup_checks()
    
    print("\n" + "=" * 50)
    print("Starting RecruitEdge server on port 5001...")
    print("Access the API at: http://localhost:5001")
    print("Health check: http://localhost:5001/health")
    print("Available Tiers:")
    print("- FREE: 8 emails, 120 credits, 200 minutes saved")
    print("- PRO: 56 emails, 840 credits, 1200 minutes saved")
    print("New endpoints:")
    print("- /api/free-run (replaces basic-run)")
    print("- /api/pro-run (enhanced with resume)")
    print("- /api/tier-info (get tier information)")
    print("=" * 50 + "\n")
    port = int(os.environ.get('PORT', 5001))
    app.run(host='0.0.0.0', port=port, debug=True)

 