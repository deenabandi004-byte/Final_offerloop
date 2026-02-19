"""
Run routes - free and pro tier search endpoints
"""
import json
import csv
import time
import threading
from datetime import datetime
from typing import Dict, Tuple, Optional
from app.services.pdl_client import search_contacts_with_smart_location_strategy, get_contact_identity
from io import StringIO
from flask import Blueprint, request, jsonify, send_file
from werkzeug.utils import secure_filename

from app.extensions import require_firebase_auth, get_db, require_tier
from app.services.resume_parser import extract_text_from_pdf, extract_text_from_file
from app.services.reply_generation import batch_generate_emails, PURPOSES_INCLUDE_RESUME, email_body_mentions_resume
from app.services.gmail_client import _load_user_gmail_creds, _gmail_service, create_gmail_draft_for_user, download_resume_from_url
from app.services.auth import check_and_reset_credits
from app.services.hunter import enrich_contacts_with_hunter
from app.config import TIER_CONFIGS
from app.utils.exceptions import ValidationError, OfferloopException, InsufficientCreditsError, ExternalAPIError
from app.utils.validation import ContactSearchRequest, validate_request
from firebase_admin import firestore
from email_templates import get_template_instructions

# =============================================================================
# EMAIL TEMPLATE RESOLUTION (per-request override → user default → none)
# =============================================================================

def _resolve_email_template(email_template_override, user_id, db):
    """
    Resolve email template: request body override → user's saved default in Firestore → no injection.
    Returns (template_instructions: str, purpose: str|None) for use in batch_generate_emails.
    """
    purpose = None
    style_preset = None
    custom_instructions = ""
    if email_template_override and isinstance(email_template_override, dict):
        purpose = email_template_override.get("purpose")
        style_preset = email_template_override.get("stylePreset")
        custom_instructions = (email_template_override.get("customInstructions") or "").strip()[:500]
    elif user_id and db:
        try:
            user_doc = db.collection("users").document(user_id).get()
            if user_doc.exists:
                data = user_doc.to_dict() or {}
                t = data.get("emailTemplate") or {}
                purpose = t.get("purpose")
                style_preset = t.get("stylePreset")
                custom_instructions = (t.get("customInstructions") or "").strip()[:500]
        except Exception:
            pass
    instructions = get_template_instructions(purpose=purpose, style_preset=style_preset, custom_instructions=custom_instructions)
    print(f"[EmailTemplate] Resolved purpose={purpose!r}, style_preset={style_preset!r}, custom_len={len(custom_instructions)}, instructions_len={len(instructions)}")
    if instructions:
        print(f"[EmailTemplate] Instructions preview: {instructions[:300]}...")
    return instructions, purpose


# =============================================================================
# EXCLUSION LIST CACHING (1-hour TTL for faster contact searches)
# =============================================================================

_exclusion_list_cache: Dict[str, Tuple[set, float]] = {}
_exclusion_cache_lock = threading.Lock()
EXCLUSION_CACHE_TTL = 3600  # 1 hour in seconds

def _get_cached_exclusion_list(user_id: str) -> Optional[set]:
    """Get cached exclusion list if not expired."""
    with _exclusion_cache_lock:
        if user_id in _exclusion_list_cache:
            exclusion_set, timestamp = _exclusion_list_cache[user_id]
            if time.time() - timestamp < EXCLUSION_CACHE_TTL:
                print(f"[ContactSearch] ✅ Using cached exclusion list for {user_id[:8]}... ({len(exclusion_set)} contacts, age: {time.time() - timestamp:.1f}s)")
                return exclusion_set
            else:
                # Cache expired, remove it
                del _exclusion_list_cache[user_id]
                print(f"[ContactSearch] ⏰ Exclusion list cache expired for {user_id[:8]}...")
    return None

def _set_cached_exclusion_list(user_id: str, exclusion_set: set):
    """Cache exclusion list with current timestamp."""
    with _exclusion_cache_lock:
        _exclusion_list_cache[user_id] = (exclusion_set, time.time())
        print(f"[ContactSearch] 💾 Cached exclusion list for {user_id[:8]}... ({len(exclusion_set)} contacts)")

def _invalidate_exclusion_cache(user_id: str):
    """Invalidate exclusion list cache (call when contacts are added/removed)."""
    with _exclusion_cache_lock:
        if user_id in _exclusion_list_cache:
            del _exclusion_list_cache[user_id]
            print(f"[ContactSearch] 🗑️  Invalidated exclusion list cache for {user_id[:8]}...")
def _is_valid_email(value: str) -> bool:
    """Basic sanity check for emails."""
    if not isinstance(value, str):
        return False
    value = value.strip()
    if not value:
        return False
    if value.lower() in ("not available", "n/a"):
        return False
    if "@" not in value:
        return False
    return True


def has_pdl_email(contact: dict) -> bool:
    """
    Treat ANY of Email / WorkEmail / PersonalEmail as 'PDL has an email'
    as long as it looks like a real email.
    """
    candidates = [
        contact.get("Email"),
        contact.get("WorkEmail"),
        contact.get("PersonalEmail"),
    ]
    return any(_is_valid_email(v) for v in candidates)
runs_bp = Blueprint('runs', __name__, url_prefix='/api')


# Note: run_free_tier_enhanced_optimized and run_pro_tier_enhanced_final_with_text
# are large functions that should be moved to services/runs_service.py
# For now, importing them from app.py (will be moved later)
def run_free_tier_enhanced_optimized(job_title, company, location, user_email=None, user_profile=None, resume_text=None, career_interests=None, college_alumni=None, batch_size=None, email_template=None):
    """Free tier search - will be moved to services/runs_service.py"""
    # Import here to avoid circular dependencies
    # This function will be extracted from app.py and moved to services
    
    import time
    start_time = time.time()
    
    print(f"Starting OPTIMIZED Free tier for {user_email}")
    
    try:
        db = get_db()
        user_id = None
        if hasattr(request, 'firebase_user'):
            user_id = request.firebase_user.get('uid')
        
        # Initialize seen_contact_set before it's used
        seen_contact_set = set()
        
        # Default to free tier credits if user not found
        credits_available = TIER_CONFIGS['free']['credits']  # 300
        user_tier = 'free'  # Default tier
        if db and user_id:
            try:
                user_ref = db.collection('users').document(user_id)
                user_doc = user_ref.get()
                if user_doc.exists:
                    user_data = user_doc.to_dict()
                    credits_available = check_and_reset_credits(user_ref, user_data)
                    # Get user's actual tier (free, pro, or elite)
                    user_tier = user_data.get('tier', 'free')
                    if user_tier not in TIER_CONFIGS:
                        user_tier = 'free'  # Fallback to free if invalid tier
                    
                    # ✅ LOAD FROM SUBCOLLECTION (not contactLibrary field)
                    # ✅ OPTIMIZED: Use cached exclusion list for faster searches
                    seen_contact_set = _get_cached_exclusion_list(user_id)
                    
                    if seen_contact_set is None:
                        # Cache miss - load from database
                        load_start = time.time()
                        contacts_ref = db.collection('users').document(user_id).collection('contacts')
                        contact_docs = list(contacts_ref.select(
                            'firstName', 'lastName', 'email', 'linkedinUrl', 'company'
                        ).stream())
                        
                        seen_contact_set = set()
                        for doc in contact_docs:
                            contact = doc.to_dict()
                            
                            # Standardize to match PDL format for identity matching
                            standardized = {
                                'FirstName': contact.get('firstName', ''),
                                'LastName': contact.get('lastName', ''),
                                'Email': contact.get('email', ''),
                                'LinkedIn': contact.get('linkedinUrl', ''),
                                'Company': contact.get('company', '')
                            }
                            
                            library_key = get_contact_identity(standardized)
                            seen_contact_set.add(library_key)
                        
                        # Cache the exclusion list
                        _set_cached_exclusion_list(user_id, seen_contact_set)
                        load_time = time.time() - load_start
                        print(f"📊 Exclusion list loaded from database ({load_time:.2f}s):")
                        print(f"   - Contacts in database: {len(contact_docs)}")
                        print(f"   - Unique identity keys: {len(seen_contact_set)}")
                    else:
                        print(f"📊 Exclusion list (from cache):")
                        print(f"   - Unique identity keys: {len(seen_contact_set)}")
                    print(f"   💡 Deleting contacts from library will allow them to appear in searches")
                    
                    if credits_available < 15:
                        return {    
                            'error': 'Insufficient credits',
                            'credits_needed': 15,
                            'current_credits': credits_available,
                            'contacts': []
                        }
            except Exception:
                pass
        
        # Use user's actual tier max_contacts (free=3, pro=8, elite=15)
        tier_max = TIER_CONFIGS[user_tier]['max_contacts']
        max_contacts = batch_size if batch_size and 1 <= batch_size <= tier_max else tier_max
        
        # ✅ OPTIMIZED CONTACT SEARCH - Process one-by-one and stop early
        from app.services.contact_search_optimized import contact_search_optimized
        
        contacts = contact_search_optimized(
            job_title=job_title,
            location=location,
            max_contacts=max_contacts,
            user_data=user_data,
            company=company,
            college_alumni=college_alumni,
            exclude_keys=seen_contact_set
        )
        
        if not contacts:
            return {'contacts': [], 'successful_drafts': 0}
        
        # Resolve email template (request override → user default → none); db and user_id already in scope
        print(f"[EmailTemplate] free-run email_template from request: {email_template!r}")
        template_instructions, email_template_purpose = _resolve_email_template(email_template, user_id, db)
        # Generate emails
        print(f"📧 Generating emails for {len(contacts)} contacts...")
        try:
            email_results = batch_generate_emails(
                contacts, resume_text, user_profile, career_interests,
                fit_context=None,
                template_instructions=template_instructions,
                email_template_purpose=email_template_purpose,
            )
            print(f"📧 Email generation returned {len(email_results)} results")
        except Exception as email_gen_error:
            print(f"❌ Email generation failed: {email_gen_error}")
            import traceback
            traceback.print_exc()
            # Continue with empty results - contacts won't have emails but search can still complete
            email_results = {}
        
        # Attach email data to ALL contacts FIRST (before draft creation)
        emails_attached = 0
        for i, contact in enumerate(contacts):
            key = str(i)
            email_result = email_results.get(i) or email_results.get(str(i)) or email_results.get(f"{i}")
            if email_result and isinstance(email_result, dict):
                subject = email_result.get('subject', '')
                body = email_result.get('body', '')
                if subject and body:
                    contact['emailSubject'] = subject
                    contact['emailBody'] = body
                    emails_attached += 1
                    print(f"✅ [{i}] Attached email to {contact.get('FirstName', 'Unknown')}: {subject[:50]}...")
                else:
                    print(f"⚠️ [{i}] Email result missing subject/body for {contact.get('FirstName', 'Unknown')}")
            else:
                print(f"⚠️ [{i}] No email result found for {contact.get('FirstName', 'Unknown')} (key: {key})")
        
        print(f"📧 Attached emails to {emails_attached}/{len(contacts)} contacts")
        
        # Prepare contacts with email data (and per-contact attach_resume) for draft creation
        contacts_with_emails = []
        for i, contact in enumerate(contacts[:max_contacts]):
            email_result = email_results.get(i) or email_results.get(str(i)) or email_results.get(f"{i}")
            if email_result and isinstance(email_result, dict):
                subject = email_result.get('subject', '')
                body = email_result.get('body', '')
                if subject and body:
                    attach_resume = (email_template_purpose in PURPOSES_INCLUDE_RESUME) or email_body_mentions_resume(body)
                    contacts_with_emails.append({
                        'index': i,
                        'contact': contact,
                        'email_subject': subject,
                        'email_body': body,
                        'attach_resume': attach_resume,
                    })
        # Get user resume URL and download once when template includes resume OR any email body mentions attached resume
        resume_url = None
        resume_content = None
        resume_filename = None
        should_fetch_resume = (email_template_purpose in PURPOSES_INCLUDE_RESUME) or any(item['attach_resume'] for item in contacts_with_emails)
        if db and user_id and should_fetch_resume:
            try:
                user_doc = db.collection('users').document(user_id).get()
                if user_doc.exists:
                    resume_url = user_doc.to_dict().get('resumeUrl')
                    # Download resume once before the loop to avoid redundant fetches
                    if resume_url:
                        print(f"📎 Downloading resume once for all {len(contacts[:max_contacts])} contacts...")
                        resume_content, resume_filename = download_resume_from_url(resume_url)
                        if resume_content:
                            print(f"✅ Resume downloaded successfully ({len(resume_content)} bytes) - will reuse for all drafts")
                        else:
                            print(f"⚠️ Failed to download resume - drafts will be created without attachment")
            except Exception as e:
                print(f"⚠️ Error getting/downloading resume: {e}")
                pass
        elif email_template_purpose and email_template_purpose not in PURPOSES_INCLUDE_RESUME and not any(item['attach_resume'] for item in contacts_with_emails):
            print(f"📎 Skipping resume attachment for template purpose={email_template_purpose!r}")

        # Create drafts if Gmail connected
        successful_drafts = 0
        user_info = None
        if user_profile:
            user_info = {
                'name': user_profile.get('name', ''),
                'email': user_profile.get('email', ''),
                'phone': user_profile.get('phone', ''),
                'linkedin': user_profile.get('linkedin', '')
            }
        
        try:
            creds = _load_user_gmail_creds(user_id) if user_id else None
            connected_email = None
            if creds:
                try:
                    from app.services.gmail_client import _gmail_service
                    gmail = _gmail_service(creds)
                    connected_email = gmail.users().getProfile(userId="me").execute().get("emailAddress")
                except Exception:
                    pass
                
                # ✅ ISSUE 3 FIX: Parallel Gmail draft creation
                from app.services.gmail_client import create_drafts_parallel
                
                if contacts_with_emails:
                    # Create all drafts in parallel
                    draft_results = create_drafts_parallel(
                        contacts_with_emails,
                        resume_bytes=resume_content,
                        resume_filename=resume_filename,
                        user_info=user_info,
                        user_id=user_id,
                        tier='free',
                        user_email=user_email
                    )
                    
                    # Process results and attach to contacts
                    for item, draft_result in zip(contacts_with_emails, draft_results):
                        contact = item['contact']
                        i = item['index']
                        try:
                            # Handle both dict response (new) and string response (old/fallback)
                            if isinstance(draft_result, dict):
                                draft_id = draft_result.get('draft_id', '')
                                message_id = draft_result.get('message_id')
                                draft_url = draft_result.get('draft_url', '')
                            else:
                                draft_id = draft_result if draft_result else None
                                message_id = None
                                draft_url = f"https://mail.google.com/mail/u/0/#draft/{draft_id}" if draft_id and not draft_id.startswith('mock_') else None
                            
                            if draft_id and not draft_id.startswith('mock_'):
                                successful_drafts += 1
                                # Store draft info with contact
                                contact['gmailDraftId'] = draft_id
                                if message_id:
                                    contact['gmailMessageId'] = message_id
                                if draft_url:
                                    contact['gmailDraftUrl'] = draft_url
                                print(f"✅ [{i}] Created draft for {contact.get('FirstName', 'Unknown')}: {draft_id}")
                            else:
                                print(f"⚠️ [{i}] Draft creation returned mock/invalid ID for {contact.get('FirstName', 'Unknown')}")
                        except Exception as draft_error:
                            print(f"❌ [{i}] Failed to process draft result for {contact.get('FirstName', 'Unknown')}: {draft_error}")
                else:
                    print(f"⚠️ No contacts with valid email data to create drafts")
        except Exception as gmail_error:
            # Token refresh happens automatically in _load_user_gmail_creds
            # Only catch errors that indicate PERMANENT auth failure
            error_str = str(gmail_error).lower()
            if 'invalid_grant' in error_str or 'token has been expired or revoked' in error_str:
                print(f"⚠️ Gmail token permanently invalid for user {user_id}")
                return {
                    'error': 'gmail_token_expired',
                    'message': 'Your Gmail connection has expired. Please reconnect your Gmail account.',
                    'require_reauth': True,
                    'contacts': contacts
                }
            else:
                print(f"⚠️ Gmail draft creation error (continuing without drafts): {gmail_error}")
                # Continue without drafts if other Gmail error
                pass
        
        # Deduct credits
        if db and user_id:
            try:
                user_ref = db.collection('users').document(user_id)
                user_ref.update({
                    'credits': firestore.Increment(-15 * len(contacts))
                })
            except Exception:
                pass
        
        # Save contacts to Firestore (networking tracker) - same as pro tier
        if db and user_id:
            try:
                print(f"💾 Saving {len(contacts)} contacts to Firestore (free tier)...")
                contacts_ref = db.collection('users').document(user_id).collection('contacts')
                existing_contacts = list(contacts_ref.stream())
                existing_emails = {c.get('email', '').lower().strip() for c in existing_contacts if c.get('email')}
                existing_linkedins = {c.get('linkedinUrl', '').strip() for c in existing_contacts if c.get('linkedinUrl')}
                existing_name_company = {
                    f"{c.get('firstName', '')}_{c.get('lastName', '')}_{c.get('company', '')}".lower().strip()
                    for c in existing_contacts
                    if c.get('firstName') and c.get('lastName') and c.get('company')
                }
                today = datetime.now().strftime('%m/%d/%Y')
                saved_count = 0
                skipped_count = 0
                for contact in contacts:
                    first_name = (contact.get('FirstName') or contact.get('firstName') or '').strip()
                    last_name = (contact.get('LastName') or contact.get('lastName') or '').strip()
                    email = (contact.get('Email') or contact.get('WorkEmail') or contact.get('PersonalEmail') or contact.get('email') or '').strip().lower()
                    linkedin = (contact.get('LinkedIn') or contact.get('linkedinUrl') or '').strip()
                    company = (contact.get('Company') or contact.get('company') or '').strip()
                    is_duplicate = (
                        (email and email in existing_emails) or
                        (linkedin and linkedin in existing_linkedins) or
                        (first_name and last_name and company and
                         f"{first_name}_{last_name}_{company}".lower() in existing_name_company)
                    )
                    if is_duplicate:
                        skipped_count += 1
                        continue
                    contact_doc = {
                        'firstName': first_name,
                        'lastName': last_name,
                        'email': contact.get('Email') or contact.get('WorkEmail') or contact.get('PersonalEmail') or '',
                        'linkedinUrl': linkedin,
                        'company': company,
                        'jobTitle': contact.get('Title') or contact.get('jobTitle') or '',
                        'college': contact.get('College') or contact.get('college') or '',
                        'location': contact.get('location') or '',
                        'city': contact.get('City') or '',
                        'state': contact.get('State') or '',
                        'firstContactDate': today,
                        'status': 'Not Contacted',
                        'lastContactDate': today,
                        'userId': user_id,
                        'createdAt': today,
                    }
                    if contact.get('emailSubject'):
                        contact_doc['emailSubject'] = contact['emailSubject']
                    if contact.get('emailBody'):
                        contact_doc['emailBody'] = contact['emailBody']
                    if contact.get('gmailDraftId'):
                        contact_doc['gmailDraftId'] = contact['gmailDraftId']
                    if contact.get('gmailDraftUrl'):
                        contact_doc['gmailDraftUrl'] = contact['gmailDraftUrl']
                    if contact.get('gmailDraftId') or contact.get('gmailDraftUrl'):
                        contact_doc['pipelineStage'] = 'draft_created'
                    contacts_ref.add(contact_doc)
                    saved_count += 1
                print(f"✅ Free tier: saved {saved_count} new contacts to Firestore, skipped {skipped_count} duplicates")
                _invalidate_exclusion_cache(user_id)
            except Exception as save_error:
                print(f"⚠️ Error saving contacts to Firestore (free tier): {save_error}")
                import traceback
                traceback.print_exc()
        
        elapsed = time.time() - start_time
        print(f"✅ Free tier completed in {elapsed:.2f}s - {len(contacts)} contacts, {successful_drafts} drafts")
        
        return {
            'contacts': contacts,
            'successful_drafts': successful_drafts
        }
        
    except Exception as e:
        print(f"Free tier error: {e}")
        import traceback
        traceback.print_exc()
        return {'error': str(e), 'contacts': []}


def run_pro_tier_enhanced_final_with_text(job_title, company, location, resume_text, user_email=None, user_profile=None, career_interests=None, college_alumni=None, batch_size=None, email_template=None):
    """Pro tier search - will be moved to services/runs_service.py"""
    # Import here to avoid circular dependencies
    from flask import request
    
    import time
    start_time = time.time()
    
    print(f"Starting OPTIMIZED Pro tier for {user_email}")
    
    try:
        db = get_db()
        user_id = None
        if hasattr(request, 'firebase_user'):
            user_id = request.firebase_user.get('uid')
        
        # Initialize seen_contact_set before it's used
        seen_contact_set = set()
        
        # Default to pro tier credits if user not found
        credits_available = TIER_CONFIGS['pro']['credits']  # 1500
        if db and user_id:
            try:
                user_ref = db.collection('users').document(user_id)
                user_doc = user_ref.get()
                if user_doc.exists:
                    user_data = user_doc.to_dict()
                    credits_available = check_and_reset_credits(user_ref, user_data)
                    
                    # ✅ LOAD FROM SUBCOLLECTION (not contactLibrary field)
                    # ✅ OPTIMIZED: Use cached exclusion list for faster searches
                    seen_contact_set = _get_cached_exclusion_list(user_id)
                    
                    if seen_contact_set is None:
                        # Cache miss - load from database
                        load_start = time.time()
                        contacts_ref = db.collection('users').document(user_id).collection('contacts')
                        contact_docs = list(contacts_ref.select(
                            'firstName', 'lastName', 'email', 'linkedinUrl', 'company'
                        ).stream())
                        
                        seen_contact_set = set()
                        for doc in contact_docs:
                            contact = doc.to_dict()
                            
                            # Standardize to match PDL format for identity matching
                            standardized = {
                                'FirstName': contact.get('firstName', ''),
                                'LastName': contact.get('lastName', ''),
                                'Email': contact.get('email', ''),
                                'LinkedIn': contact.get('linkedinUrl', ''),
                                'Company': contact.get('company', '')
                            }
                            
                            library_key = get_contact_identity(standardized)
                            seen_contact_set.add(library_key)
                        
                        # Cache the exclusion list
                        _set_cached_exclusion_list(user_id, seen_contact_set)
                        load_time = time.time() - load_start
                        print(f"📊 Exclusion list loaded from database ({load_time:.2f}s):")
                        print(f"   - Contacts in database: {len(contact_docs)}")
                        print(f"   - Unique identity keys: {len(seen_contact_set)}")
                    else:
                        print(f"📊 Exclusion list (from cache):")
                        print(f"   - Unique identity keys: {len(seen_contact_set)}")
                    print(f"   💡 Deleting contacts from library will allow them to appear in searches")
                    
                    tier = user_data.get('tier', 'free')
                    if tier not in ['pro', 'elite']:
                        return {'error': 'Pro or Elite tier subscription required', 'contacts': []}
                    if credits_available < 15:
                        return {
                            'error': 'Insufficient credits',
                            'credits_needed': 15,
                            'current_credits': credits_available,
                            'contacts': []
                        }
            except Exception:
                pass
        
        # Use user's actual tier to get correct max_contacts (pro=8, elite=15)
        user_tier = 'pro'  # Default
        if db and user_id:
            try:
                user_doc = db.collection('users').document(user_id).get()
                if user_doc.exists:
                    user_tier = user_doc.to_dict().get('tier', 'pro')
            except Exception:
                pass
        
        tier_max = TIER_CONFIGS.get(user_tier, TIER_CONFIGS['pro'])['max_contacts']
        max_contacts = batch_size if batch_size and 1 <= batch_size <= tier_max else tier_max
        
        # Search contacts
        contacts = search_contacts_with_smart_location_strategy(
            job_title, company, location, max_contacts=max_contacts, college_alumni=college_alumni, exclude_keys=seen_contact_set
        )
        
        if not contacts:
            return {'contacts': [], 'successful_drafts': 0}
        
        # ✅ REMOVED: No longer tracking seenContactKeys
        # Only Contact Library is used for exclusion
        # This allows contacts to reappear if library is cleared
        
        # ✅ HUNTER.IO ENRICHMENT - Enrich contacts without emails
        contacts_with_email: list[dict] = []
        contacts_without_email: list[dict] = []

        for c in contacts:
            if has_pdl_email(c):
                contacts_with_email.append(c)
            else:
                contacts_without_email.append(c)
        
        print(f"\n📧 Email Status: {len(contacts_with_email)}/{len(contacts)} have emails from PDL")
        
        # Only use Hunter.io if we have contacts without emails
        if contacts_without_email:
            needed = max_contacts - len(contacts_with_email)
            print(f"🔍 Need {needed} more emails, enriching {len(contacts_without_email)} contacts with Hunter.io...")
            
            try:
                contacts = enrich_contacts_with_hunter(
                    contacts,
                    max_enrichments=needed  # Only enrich what we need to save Hunter credits
                )
            except Exception as hunter_error:
                print(f"⚠️ Hunter.io enrichment failed: {hunter_error}")
                import traceback
                traceback.print_exc()
                # Continue without Hunter enrichment
        else:
            print(f"✅ All {len(contacts_with_email)} contacts have emails from PDL, skipping Hunter.io enrichment")
        
        # ✅ FIX #4: Parse resume ONCE in orchestration layer (not in batch_generate_emails)
        print(f"📄 Parsing resume once for email generation...")
        user_info = None
        if resume_text or user_profile:
            from app.utils.users import extract_user_info_from_resume_priority
            user_info = extract_user_info_from_resume_priority(resume_text, user_profile)
            print(f"✅ Resume parsed - extracted user info for {user_info.get('name', 'Unknown')}")
        
        # Resolve email template (request override → user default → none)
        print(f"[EmailTemplate] pro-run email_template from request: {email_template!r}")
        template_instructions, email_template_purpose = _resolve_email_template(email_template, user_id, db)
        # Generate emails with pre-parsed user_info
        print(f"📧 Generating emails for {len(contacts)} contacts...")
        try:
            # Pass pre-parsed user_info instead of raw resume_text
            email_results = batch_generate_emails(
                contacts, 
                resume_text=None,  # Don't need raw text anymore
                user_profile=user_profile, 
                career_interests=career_interests, 
                fit_context=None,
                pre_parsed_user_info=user_info,  # Pass pre-parsed info
                template_instructions=template_instructions,
                email_template_purpose=email_template_purpose,
            )
            print(f"📧 Email generation returned {len(email_results)} results")
        except Exception as email_gen_error:
            print(f"❌ Email generation failed: {email_gen_error}")
            import traceback
            traceback.print_exc()
            # Continue with empty results - contacts won't have emails but search can still complete
            email_results = {}
        
        # Attach email data to ALL contacts FIRST (before draft creation)
        emails_attached = 0
        for i, contact in enumerate(contacts):
            key = str(i)
            email_result = email_results.get(i) or email_results.get(str(i)) or email_results.get(f"{i}")
            if email_result and isinstance(email_result, dict):
                subject = email_result.get('subject', '')
                body = email_result.get('body', '')
                if subject and body:
                    contact['emailSubject'] = subject
                    contact['emailBody'] = body
                    emails_attached += 1
                    print(f"✅ [{i}] Attached email to {contact.get('FirstName', 'Unknown')}: {subject[:50]}...")
                else:
                    print(f"⚠️ [{i}] Email result missing subject/body for {contact.get('FirstName', 'Unknown')}")
            else:
                print(f"⚠️ [{i}] No email result found for {contact.get('FirstName', 'Unknown')} (key: {key})")
        
        print(f"📧 Attached emails to {emails_attached}/{len(contacts)} contacts")
        
        # Prepare contacts with email data (and per-contact attach_resume) for batch draft creation
        contacts_with_emails = []
        for i, contact in enumerate(contacts[:max_contacts]):
            email_result = email_results.get(i) or email_results.get(str(i)) or email_results.get(f"{i}")
            if email_result and isinstance(email_result, dict):
                subject = email_result.get('subject', '')
                body = email_result.get('body', '')
                if subject and body:
                    attach_resume = (email_template_purpose in PURPOSES_INCLUDE_RESUME) or email_body_mentions_resume(body)
                    contacts_with_emails.append({
                        'index': i,
                        'contact': contact,
                        'email_subject': subject,
                        'email_body': body,
                        'attach_resume': attach_resume,
                    })
        # Get user resume URL and download once when template includes resume OR any email body mentions attached resume
        resume_url = None
        resume_content = None
        resume_filename = None
        should_fetch_resume = (email_template_purpose in PURPOSES_INCLUDE_RESUME) or any(item['attach_resume'] for item in contacts_with_emails)
        if db and user_id and should_fetch_resume:
            try:
                user_doc = db.collection('users').document(user_id).get()
                if user_doc.exists:
                    resume_url = user_doc.to_dict().get('resumeUrl')
                    # Download resume once before the loop to avoid redundant fetches
                    if resume_url:
                        print(f"📎 Downloading resume once for all {len(contacts[:max_contacts])} contacts...")
                        resume_content, resume_filename = download_resume_from_url(resume_url)
                        if resume_content:
                            print(f"✅ Resume downloaded successfully ({len(resume_content)} bytes) - will reuse for all drafts")
                        else:
                            print(f"⚠️ Failed to download resume - drafts will be created without attachment")
            except Exception as e:
                print(f"⚠️ Error getting/downloading resume: {e}")
                pass
        elif email_template_purpose and email_template_purpose not in PURPOSES_INCLUDE_RESUME and not any(item['attach_resume'] for item in contacts_with_emails):
            print(f"📎 Skipping resume attachment for template purpose={email_template_purpose!r}")

        # Create drafts
        successful_drafts = 0
        # ✅ FIX #4: user_info already parsed above for email generation, reuse it
        if not user_info and user_profile:
            user_info = {
                'name': user_profile.get('name', ''),
                'email': user_profile.get('email', ''),
                'phone': user_profile.get('phone', ''),
                'linkedin': user_profile.get('linkedin', '')
            }
        
        try:
            # ✅ TASK 1: Get Gmail service once for batch operations
            from app.services.gmail_client import get_gmail_service_for_user, create_drafts_batch
            gmail_service = get_gmail_service_for_user(user_email, user_id=user_id)
            
            if gmail_service:
                try:
                    connected_email = gmail_service.users().getProfile(userId="me").execute().get("emailAddress")
                    print(f"📧 Connected Gmail account: {connected_email}")
                except Exception:
                    connected_email = None
                
                if contacts_with_emails:
                    # ✅ TASK 1: Use batch API for single HTTP request instead of 15 parallel requests
                    print(f"📧 Creating {len(contacts_with_emails)} Gmail drafts using batch API...")
                    draft_results = create_drafts_batch(
                        contacts_with_emails,
                        gmail_service=gmail_service,
                        resume_bytes=resume_content,
                        resume_filename=resume_filename,
                        user_info=user_info,
                        tier='pro',
                        user_email=user_email
                    )
                    
                    # Process results and attach to contacts
                    for item, draft_result in zip(contacts_with_emails, draft_results):
                        contact = item['contact']
                        i = item['index']
                        try:
                            if isinstance(draft_result, dict) and not draft_result.get('error'):
                                draft_id = draft_result.get('draft_id', '')
                                message_id = draft_result.get('message_id')
                                draft_url = draft_result.get('draft_url', '')
                                
                                if draft_id and not draft_id.startswith('mock_'):
                                    successful_drafts += 1
                                    # Store draft info with contact
                                    contact['gmailDraftId'] = draft_id
                                    if message_id:
                                        contact['gmailMessageId'] = message_id
                                    if draft_url:
                                        contact['gmailDraftUrl'] = draft_url
                                    print(f"✅ [{i}] Created draft for {contact.get('FirstName', 'Unknown')}: {draft_id}")
                                else:
                                    print(f"⚠️ [{i}] Draft creation returned mock/invalid ID for {contact.get('FirstName', 'Unknown')}")
                            else:
                                error = draft_result.get('error', 'Unknown error') if isinstance(draft_result, dict) else str(draft_result)
                                print(f"❌ [{i}] Failed to create draft for {contact.get('FirstName', 'Unknown')}: {error}")
                        except Exception as draft_error:
                            print(f"❌ [{i}] Failed to process draft result for {contact.get('FirstName', 'Unknown')}: {draft_error}")
                else:
                    print(f"⚠️ No contacts with valid email data to create drafts")
            else:
                print(f"⚠️ Gmail service unavailable - skipping draft creation")
        except Exception as gmail_error:
            # Token refresh happens automatically in _load_user_gmail_creds
            # Only catch errors that indicate PERMANENT auth failure
            error_str = str(gmail_error).lower()
            if 'invalid_grant' in error_str or 'token has been expired or revoked' in error_str:
                print(f"⚠️ Gmail token permanently invalid for user {user_id}")
                return {
                    'error': 'gmail_token_expired',
                    'message': 'Your Gmail connection has expired. Please reconnect your Gmail account.',
                    'require_reauth': True,
                    'contacts': contacts
                }
            else:
                print(f"⚠️ Gmail draft creation error (continuing without drafts): {gmail_error}")
                # Continue without drafts if other Gmail error
                pass
        
        # Deduct credits
        if db and user_id:
            try:
                user_ref = db.collection('users').document(user_id)
                user_ref.update({
                    'credits': firestore.Increment(-15 * len(contacts))
                })
            except Exception:
                pass
        
        # ✅ FIX #2: Save contacts directly to Firestore after draft creation (eliminates redundant bulk_create_contacts call)
        if db and user_id:
            try:
                print(f"💾 Saving {len(contacts)} contacts directly to Firestore...")
                contacts_ref = db.collection('users').document(user_id).collection('contacts')
                
                # ✅ FIX #3: Batch fetch ALL existing contacts ONCE for duplicate checking
                existing_contacts = list(contacts_ref.stream())
                existing_emails = {c.get('email', '').lower().strip() for c in existing_contacts if c.get('email')}
                existing_linkedins = {c.get('linkedinUrl', '').strip() for c in existing_contacts if c.get('linkedinUrl')}
                existing_name_company = {
                    f"{c.get('firstName', '')}_{c.get('lastName', '')}_{c.get('company', '')}".lower().strip()
                    for c in existing_contacts 
                    if c.get('firstName') and c.get('lastName') and c.get('company')
                }
                print(f"📊 Loaded {len(existing_contacts)} existing contacts for duplicate checking")
                
                today = datetime.now().strftime('%m/%d/%Y')
                saved_count = 0
                skipped_count = 0
                
                for contact in contacts:
                    first_name = (contact.get('FirstName') or contact.get('firstName') or '').strip()
                    last_name = (contact.get('LastName') or contact.get('lastName') or '').strip()
                    email = (contact.get('Email') or contact.get('WorkEmail') or contact.get('PersonalEmail') or contact.get('email') or '').strip().lower()
                    linkedin = (contact.get('LinkedIn') or contact.get('linkedinUrl') or '').strip()
                    company = (contact.get('Company') or contact.get('company') or '').strip()
                    
                    # ✅ FIX #3: Check duplicates in O(1) using pre-loaded sets
                    is_duplicate = (
                        (email and email in existing_emails) or
                        (linkedin and linkedin in existing_linkedins) or
                        (first_name and last_name and company and 
                         f"{first_name}_{last_name}_{company}".lower() in existing_name_company)
                    )
                    
                    if is_duplicate:
                        skipped_count += 1
                        print(f"🚫 Skipping duplicate contact: {first_name} {last_name} (already in library)")
                        continue
                    
                    # Create contact document
                    contact_doc = {
                        'firstName': first_name,
                        'lastName': last_name,
                        'email': contact.get('Email') or contact.get('WorkEmail') or contact.get('PersonalEmail') or '',
                        'linkedinUrl': linkedin,
                        'company': company,
                        'jobTitle': contact.get('Title') or contact.get('jobTitle') or '',
                        'college': contact.get('College') or contact.get('college') or '',
                        'location': contact.get('location') or '',
                        'city': contact.get('City') or '',
                        'state': contact.get('State') or '',
                        'firstContactDate': today,
                        'status': 'Not Contacted',
                        'lastContactDate': today,
                        'userId': user_id,
                        'createdAt': today,
                    }
                    
                    # Add email data if available
                    if contact.get('emailSubject'):
                        contact_doc['emailSubject'] = contact['emailSubject']
                    if contact.get('emailBody'):
                        contact_doc['emailBody'] = contact['emailBody']
                    if contact.get('gmailDraftId'):
                        contact_doc['gmailDraftId'] = contact['gmailDraftId']
                    if contact.get('gmailDraftUrl'):
                        contact_doc['gmailDraftUrl'] = contact['gmailDraftUrl']
                    if contact.get('gmailDraftId') or contact.get('gmailDraftUrl'):
                        contact_doc['pipelineStage'] = 'draft_created'
                    
                    contacts_ref.add(contact_doc)
                    saved_count += 1
                
                print(f"✅ Saved {saved_count} new contacts to Firestore, skipped {skipped_count} duplicates")
            except Exception as save_error:
                print(f"⚠️ Error saving contacts to Firestore: {save_error}")
                import traceback
                traceback.print_exc()
                # Continue - contacts are still returned to frontend
        
        elapsed = time.time() - start_time
        print(f"✅ Pro tier completed in {elapsed:.2f}s - {len(contacts)} contacts, {successful_drafts} drafts")
        
        return {
            'contacts': contacts,
            'successful_drafts': successful_drafts
        }
        
    except Exception as e:
        print(f"Pro tier error: {e}")
        import traceback
        traceback.print_exc()
        return {'error': str(e), 'contacts': []}


@runs_bp.route("/free-run", methods=["POST"])
@require_firebase_auth
def free_run():
    """Free tier search endpoint with validation"""
    try:
        user_email = request.firebase_user.get('email')
        user_id = request.firebase_user['uid']
        
        # Get request data
        if request.is_json:
            data = request.get_json(silent=True) or {}
        else:
            # Handle form data
            data = {
                'jobTitle': request.form.get('jobTitle', '').strip(),
                'company': request.form.get('company', '').strip(),
                'location': request.form.get('location', '').strip(),
                'collegeAlumni': request.form.get('collegeAlumni', '').strip() or None,
                'batchSize': request.form.get('batchSize'),
                'userProfile': None,
                'careerInterests': []
            }
            # Parse JSON fields from form data
            user_profile_raw = request.form.get('userProfile')
            if user_profile_raw:
                try:
                    data['userProfile'] = json.loads(user_profile_raw)
                except:
                    pass
            career_interests_raw = request.form.get('careerInterests')
            if career_interests_raw:
                try:
                    data['careerInterests'] = json.loads(career_interests_raw)
                except:
                    pass
            email_template_raw = request.form.get('emailTemplate')
            if email_template_raw:
                try:
                    data['emailTemplate'] = json.loads(email_template_raw)
                except Exception:
                    pass
            if data.get('batchSize'):
                try:
                    data['batchSize'] = int(data['batchSize'])
                except:
                    data['batchSize'] = None
        
        # Validate input
        try:
            validated_data = validate_request(ContactSearchRequest, data)
        except ValidationError as ve:
            return ve.to_response()
        
        # Extract validated fields
        job_title = validated_data['jobTitle']
        company = validated_data.get('company') or ''  # Company is optional, default to empty string
        location = validated_data['location']
        college_alumni = validated_data.get('collegeAlumni')
        batch_size = validated_data.get('batchSize')
        user_profile = validated_data.get('userProfile')
        career_interests = validated_data.get('careerInterests', [])
        
        # Get resume text if provided (not in validation schema as it's optional)
        resume_text = None
        if request.is_json:
            resume_text = (data.get('resumeText') or '').strip() or None
        else:
            resume_text = request.form.get('resumeText', '').strip() or None
        
        # Save search to history
        db = get_db()
        if db:
            try:
                search_data = {
                    'jobTitle': job_title,
                    'company': company,
                    'location': location,
                    'collegeAlumni': college_alumni,
                    'batchSize': batch_size,
                    'tier': 'free',
                    'createdAt': datetime.now().isoformat(),
                    'userId': user_id
                }
                db.collection('users').document(user_id).collection('searchHistory').add(search_data)
            except Exception as history_error:
                print(f"⚠️ Failed to save search history: {history_error}")
                # Don't fail the search if history save fails
        
        result = run_free_tier_enhanced_optimized(
            job_title,
            company,
            location,
            user_email=user_email,
            user_profile=user_profile,
            resume_text=resume_text,
            career_interests=career_interests,
            college_alumni=college_alumni,
            batch_size=batch_size,
            email_template=data.get('emailTemplate'),
        )
        
        if result.get("error"):
            error_type = result.get("error")
            if error_type == "gmail_token_expired":
                return jsonify({
                    "error": error_type,
                    "message": result.get("message"),
                    "require_reauth": True,
                    "contacts": result.get("contacts", [])
                }), 401
            elif "insufficient" in error_type.lower() or "credits" in error_type.lower():
                required = result.get('credits_needed', 15)
                available = result.get('current_credits', 0)
                raise InsufficientCreditsError(required, available)
            else:
                raise ExternalAPIError("Contact Search", result.get("error", "Search failed"))
        
        response_data = {
            "contacts": result["contacts"],
            "successful_drafts": result.get("successful_drafts", 0),
            "total_contacts": len(result["contacts"]),
            "tier": "free",
            "user_email": user_email,
        }
        return jsonify(response_data)
        
    except (ValidationError, InsufficientCreditsError, ExternalAPIError, OfferloopException):
        raise
    except Exception as e:
        print(f"Free endpoint error: {e}")
        import traceback
        traceback.print_exc()
        raise OfferloopException(f"Search failed: {str(e)}", error_code="SEARCH_ERROR")


@runs_bp.route('/free-run-csv', methods=['POST'])
@require_firebase_auth
@require_tier(['pro', 'elite'])  # CSV export is Pro/Elite only per audit
def free_run_csv():
    """CSV download endpoint (Pro/Elite only)"""
    try:
        user_email = request.firebase_user.get('email')
        user_id = request.firebase_user['uid']
        
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
            resume_text = request.form.get('resumeText', '').strip() if request.form.get('resumeText') else None
            career_interests_raw = request.form.get('careerInterests')
            try:
                career_interests = json.loads(career_interests_raw) if career_interests_raw else []
            except Exception:
                career_interests = []
        
        result = run_free_tier_enhanced_optimized(
            job_title, company, location,
            user_email=user_email, user_profile=user_profile,
            resume_text=resume_text, career_interests=career_interests
        )
        
        if result.get('error'):
            return jsonify({'error': result['error']}), 500
        
        # Generate CSV
        output = StringIO()
        writer = csv.DictWriter(output, fieldnames=[
            'FirstName', 'LastName', 'Email', 'LinkedIn', 'Title', 'Company',
            'City', 'State', 'College', 'Phone'
        ])
        writer.writeheader()
        for contact in result.get('contacts', []):
            writer.writerow({
                'FirstName': contact.get('FirstName', ''),
                'LastName': contact.get('LastName', ''),
                'Email': contact.get('Email', ''),
                'LinkedIn': contact.get('LinkedIn', ''),
                'Title': contact.get('Title', ''),
                'Company': contact.get('Company', ''),
                'City': contact.get('City', ''),
                'State': contact.get('State', ''),
                'College': contact.get('College', ''),
                'Phone': contact.get('Phone', '')
            })
        
        output.seek(0)
        return send_file(
            output,
            mimetype='text/csv',
            as_attachment=True,
            download_name=f'contacts_{job_title}_{company}.csv'
        )
        
    except Exception as e:
        print(f"Free CSV endpoint error: {e}")
        return jsonify({'error': str(e)}), 500


@runs_bp.route("/pro-run", methods=["POST", "OPTIONS"])
@require_firebase_auth
def pro_run():
    """Pro tier search endpoint with validation"""
    # OPTIONS requests are handled by CORS middleware automatically
    # Return empty response - Flask-CORS will add headers via after_request hook
    if request.method == 'OPTIONS':
        from flask import make_response
        response = make_response()
        response.status_code = 200
        return response
    
    try:
        user_email = request.firebase_user.get('email')
        user_id = request.firebase_user['uid']
        
        # Get request data
        if request.is_json:
            data = request.get_json(silent=True) or {}
        else:
            # Handle form data
            data = {
                'jobTitle': request.form.get('jobTitle', '').strip(),
                'company': request.form.get('company', '').strip(),
                'location': request.form.get('location', '').strip(),
                'collegeAlumni': request.form.get('collegeAlumni', '').strip() or None,
                'batchSize': request.form.get('batchSize'),
                'userProfile': None,
                'careerInterests': []
            }
            # Parse JSON fields from form data
            user_profile_raw = request.form.get('userProfile')
            if user_profile_raw:
                try:
                    data['userProfile'] = json.loads(user_profile_raw)
                except:
                    pass
            career_interests_raw = request.form.get('careerInterests')
            if career_interests_raw:
                try:
                    data['careerInterests'] = json.loads(career_interests_raw)
                except:
                    pass
            email_template_raw = request.form.get('emailTemplate')
            if email_template_raw:
                try:
                    data['emailTemplate'] = json.loads(email_template_raw)
                except Exception:
                    pass
            if data.get('batchSize'):
                try:
                    data['batchSize'] = int(data['batchSize'])
                except:
                    data['batchSize'] = None
            
            # Handle resume file
            if 'resume' not in request.files:
                return jsonify({'error': 'Resume file is required for Pro/Elite tier'}), 400
            resume_file = request.files['resume']
            if resume_file.filename == '':
                return jsonify({'error': 'Valid resume file is required'}), 400
            
            # Check file extension
            filename_lower = resume_file.filename.lower()
            if not (filename_lower.endswith('.pdf') or filename_lower.endswith('.docx') or filename_lower.endswith('.doc')):
                return jsonify({'error': 'Resume must be a PDF, DOCX, or DOC file'}), 400
            
            # Extract file extension and get text
            file_ext = filename_lower.split('.')[-1] if '.' in filename_lower else 'pdf'
            resume_text = extract_text_from_file(resume_file, file_ext)
            if not resume_text:
                return jsonify({'error': f'Could not extract text from {file_ext.upper()} file'}), 400
            data['resumeText'] = resume_text
        
        # Validate input (same as free tier)
        try:
            validated_data = validate_request(ContactSearchRequest, data)
        except ValidationError as ve:
            return ve.to_response()
        
        # Extract validated fields
        job_title = validated_data['jobTitle']
        company = validated_data.get('company') or ''
        location = validated_data['location']
        college_alumni = validated_data.get('collegeAlumni')
        batch_size = validated_data.get('batchSize')
        user_profile = validated_data.get('userProfile')
        career_interests = validated_data.get('careerInterests', [])
        
        # Get resume text (required for pro tier)
        resume_text = None
        if request.is_json:
            resume_text = (data.get('resumeText') or '').strip() or None
        else:
            resume_text = data.get('resumeText')  # Already extracted from file above
        
        if not resume_text:
            return jsonify({"error": "Resume text is required for Pro tier"}), 400
        
        # Save search to history
        db = get_db()
        if db:
            try:
                search_data = {
                    'jobTitle': job_title,
                    'company': company,
                    'location': location,
                    'collegeAlumni': college_alumni,
                    'batchSize': batch_size,
                    'tier': 'pro',
                    'createdAt': datetime.now().isoformat(),
                    'userId': user_id
                }
                db.collection('users').document(user_id).collection('searchHistory').add(search_data)
            except Exception as history_error:
                print(f"⚠️ Failed to save search history: {history_error}")
                # Don't fail the search if history save fails
        
        result = run_pro_tier_enhanced_final_with_text(
            job_title,
            company,
            location,
            resume_text,
            user_email=user_email,
            user_profile=user_profile,
            career_interests=career_interests,
            college_alumni=college_alumni,
            batch_size=batch_size,
            email_template=data.get('emailTemplate'),
        )
        
        if result.get("error"):
            error_type = result.get("error")
            if error_type == "gmail_token_expired":
                return jsonify({
                    "error": error_type,
                    "message": result.get("message"),
                    "require_reauth": True,
                    "contacts": result.get("contacts", [])
                }), 401
            elif "insufficient" in error_type.lower() or "credits" in error_type.lower():
                required = result.get('credits_needed', 15)
                available = result.get('current_credits', 0)
                raise InsufficientCreditsError(required, available)
            else:
                raise ExternalAPIError("Contact Search", result.get("error", "Search failed"))
        
        response_data = {
            "contacts": result["contacts"],
            "successful_drafts": result.get("successful_drafts", 0),
            "total_contacts": len(result["contacts"]),
            "tier": "pro",
            "user_email": user_email,
        }
        return jsonify(response_data)
        
    except (ValidationError, InsufficientCreditsError, ExternalAPIError, OfferloopException):
        raise
    except Exception as e:
        print(f"Pro endpoint error: {e}")
        import traceback
        traceback.print_exc()
        raise OfferloopException(f"Search failed: {str(e)}", error_code="SEARCH_ERROR")


@runs_bp.route('/pro-run-csv', methods=['POST', 'OPTIONS'])
@require_firebase_auth
def pro_run_csv():
    """Pro tier CSV download endpoint"""
    # OPTIONS requests are handled by CORS middleware automatically
    # Return empty response - Flask-CORS will add headers via after_request hook
    if request.method == 'OPTIONS':
        from flask import make_response
        response = make_response()
        response.status_code = 200
        return response
    
    try:
        user_email = request.firebase_user.get('email')
        
        if request.is_json:
            data = request.json or {}
            job_title = data.get('jobTitle', '').strip()
            company = data.get('company', '').strip()
            location = data.get('location', '').strip()
            resume_text = data.get('resumeText', '')
            if not resume_text:
                return jsonify({'error': 'Resume text is required'}), 400
        else:
            job_title = (request.form.get('jobTitle') or '').strip()
            company = (request.form.get('company') or '').strip()
            location = (request.form.get('location') or '').strip()
            if 'resume' not in request.files:
                return jsonify({'error': 'Resume file is required'}), 400
            resume_file = request.files['resume']
            if resume_file.filename == '':
                return jsonify({'error': 'Valid resume file is required'}), 400
            
            # Check file extension
            filename_lower = resume_file.filename.lower()
            if not (filename_lower.endswith('.pdf') or filename_lower.endswith('.docx') or filename_lower.endswith('.doc')):
                return jsonify({'error': 'Resume must be a PDF, DOCX, or DOC file'}), 400
            
            # Extract file extension and get text
            file_ext = filename_lower.split('.')[-1] if '.' in filename_lower else 'pdf'
            resume_text = extract_text_from_file(resume_file, file_ext)
            if not resume_text:
                return jsonify({'error': f'Could not extract text from {file_ext.upper()} file'}), 400
        
        result = run_pro_tier_enhanced_final_with_text(
            job_title, company, location, resume_text, user_email=user_email
        )
        
        if result.get('error'):
            return jsonify({'error': result['error']}), 500
        
        # Generate CSV
        output = StringIO()
        writer = csv.DictWriter(output, fieldnames=[
            'FirstName', 'LastName', 'Email', 'LinkedIn', 'Title', 'Company',
            'City', 'State', 'College', 'Phone', 'PersonalEmail', 'WorkEmail'
        ])
        writer.writeheader()
        for contact in result.get('contacts', []):
            writer.writerow({
                'FirstName': contact.get('FirstName', ''),
                'LastName': contact.get('LastName', ''),
                'Email': contact.get('Email', ''),
                'LinkedIn': contact.get('LinkedIn', ''),
                'Title': contact.get('Title', ''),
                'Company': contact.get('Company', ''),
                'City': contact.get('City', ''),
                'State': contact.get('State', ''),
                'College': contact.get('College', ''),
                'Phone': contact.get('Phone', ''),
                'PersonalEmail': contact.get('PersonalEmail', ''),
                'WorkEmail': contact.get('WorkEmail', '')
            })
        
        output.seek(0)
        return send_file(
            output,
            mimetype='text/csv',
            as_attachment=True,
            download_name=f'contacts_{job_title}_{company}.csv'
        )
        
    except Exception as e:
        print(f"Pro CSV endpoint error: {e}")
        return jsonify({'error': str(e)}), 500


@runs_bp.route('/basic-run', methods=['POST'])
def basic_run_redirect():
    """Redirect basic-run to free-run for backward compatibility"""
    print("Redirecting /api/basic-run to /api/free-run")
    return free_run()


@runs_bp.route('/advanced-run', methods=['POST'])
def advanced_run_redirect():
    """Redirect advanced-run to free-run (advanced tier removed)"""
    print("Redirecting /api/advanced-run to /api/free-run (advanced tier removed)")
    return free_run()
