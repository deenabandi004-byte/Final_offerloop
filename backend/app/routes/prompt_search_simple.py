"""
Simple prompt-based search route - uses existing search_contacts_with_smart_location_strategy()
"""
import logging
from flask import Blueprint, request, jsonify

from app.extensions import require_firebase_auth, require_tier, get_db
from app.services.prompt_parser import parse_search_prompt_simple
from app.services.reply_generation import batch_generate_emails
from app.services.gmail_client import _load_user_gmail_creds, _gmail_service, create_gmail_draft_for_user, download_resume_from_url, clear_user_gmail_integration
from app.routes.gmail_oauth import build_gmail_oauth_url_for_user
from app.services.reply_generation import email_body_mentions_resume
from app.services.hunter import enrich_contacts_with_hunter
from app.services.auth import check_and_reset_credits
from app.config import TIER_CONFIGS
from firebase_admin import firestore

prompt_search_simple_bp = Blueprint("prompt_search_simple", __name__, url_prefix="/api")
logger = logging.getLogger(__name__)


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


@prompt_search_simple_bp.route("/prompt-search", methods=["POST"])
@require_firebase_auth
@require_tier(['elite'])
def prompt_search():
    """
    Simple prompt-based search endpoint that:
    1. Parses natural language prompt
    2. Calls search_contacts_with_smart_location_strategy()
    3. Generates emails and creates Gmail drafts
    4. Returns contacts with parsed query info
    
    Request body:
    {
        "prompt": "Find me USC alumni in investment banking at Goldman in NYC",
        "max_contacts": 8,
        "userProfile": {...},  // Optional - will fetch from DB if not provided
        "careerInterests": [...]  // Optional
    }
    
    Response:
    {
        "contacts": [...],
        "parsed_query": {
            "job_title": "investment banking analyst",
            "company": "Goldman Sachs",
            "location": "New York, NY",
            "school": "University of Southern California"
        },
        "count": 8,
        "successful_drafts": 5
    }
    """
    try:
        data = request.get_json(silent=True) or {}
        prompt = data.get('prompt', '').strip()
        max_contacts = data.get('max_contacts', 8)
        user_profile = data.get('userProfile')
        career_interests = data.get('careerInterests', [])
        
        # Get user info
        user_id = None
        user_email = None
        if hasattr(request, 'firebase_user'):
            user_id = request.firebase_user.get('uid')
            user_email = request.firebase_user.get('email')
        
        db = get_db()
        
        # Validate max_contacts (slider range 1-25)
        try:
            max_contacts = max(1, min(25, int(max_contacts)))
        except (ValueError, TypeError):
            max_contacts = 8
        
        if not prompt:
            return jsonify({"error": "Prompt is required"}), 400
        
        # Check user credits before search
        credits_available = TIER_CONFIGS['free']['credits']  # Default to free tier
        if db and user_id:
            try:
                user_ref = db.collection('users').document(user_id)
                user_doc = user_ref.get()
                if user_doc.exists:
                    user_data = user_doc.to_dict()
                    credits_available = check_and_reset_credits(user_ref, user_data)
            except Exception as e:
                logger.warning(f"Failed to check credits: {e}")
        
        # Check if user has enough credits (15 credits per contact)
        credits_needed = 15 * max_contacts
        if credits_available < 15:
            return jsonify({
                'error': 'Insufficient credits',
                'credits_needed': 15,
                'current_credits': credits_available,
                'message': f'You need at least 15 credits to perform a search. You currently have {credits_available} credits.'
            }), 400
        
        # Parse prompt to structured fields
        parsed = parse_search_prompt_simple(prompt)
        
        logger.info(f"🔍 Parsed prompt: {parsed}")
        logger.info(f"   job_title: '{parsed.get('job_title', '')}'")
        logger.info(f"   company: '{parsed.get('company', '')}'")
        logger.info(f"   location: '{parsed.get('location', '')}'")
        logger.info(f"   school: '{parsed.get('school', '')}'")
        
        # No fields are required - allow search with any combination of fields
        # Use prompt-specific search function that handles optional fields
        from app.services.prompt_pdl_search import run_prompt_search
        
        # Convert simple format to prompt search format
        filters = {
            'roles': [parsed.get('job_title', '').strip()] if parsed.get('job_title', '').strip() else [],
            'company': [parsed.get('company', '').strip()] if parsed.get('company', '').strip() else [],
            'location': [parsed.get('location', '').strip()] if parsed.get('location', '').strip() else [],
            'schools': [parsed.get('school', '').strip()] if parsed.get('school', '').strip() else [],
            'max_results': max_contacts
        }
        
        # Use prompt-specific search for optional fields
        search_result = run_prompt_search(filters)
        contacts = search_result.get('contacts', [])
        
        # Fetch user profile from database if not provided
        if not user_profile and db and user_id:
            try:
                # Try to get professional info from Firestore
                professional_info_ref = db.collection('users').document(user_id).collection('professionalInfo').document('info')
                professional_info_doc = professional_info_ref.get()
                if professional_info_doc.exists:
                    professional_info = professional_info_doc.to_dict()
                    user_profile = {
                        'name': f"{professional_info.get('firstName', '')} {professional_info.get('lastName', '')}".strip() or user_email or '',
                        'university': professional_info.get('university', ''),
                        'major': professional_info.get('fieldOfStudy', ''),
                        'year': professional_info.get('graduationYear', ''),
                        'graduationYear': professional_info.get('graduationYear', ''),
                        'degree': professional_info.get('currentDegree', ''),
                    }
            except Exception as e:
                logger.warning(f"Failed to fetch user profile: {e}")
                # Use minimal profile if fetch fails
                if not user_profile:
                    user_profile = {
                        'name': user_email or '',
                        'university': '',
                        'major': '',
                        'year': '',
                        'graduationYear': '',
                        'degree': '',
                    }
        
        # Ensure contacts have location data - use parsed location as fallback
        parsed_location = parsed.get('location', '')
        if parsed_location:
            for contact in contacts:
                # If contact doesn't have City/State or location, set it from parsed query
                if not contact.get('City') and not contact.get('State') and not contact.get('location'):
                    contact['location'] = parsed_location
                # Also ensure location field is set if we have City/State but no location
                elif (contact.get('City') or contact.get('State')) and not contact.get('location'):
                    city_state = [contact.get('City', ''), contact.get('State', '')]
                    contact['location'] = ', '.join([c for c in city_state if c]) or parsed_location
        
        if not contacts:
            return jsonify({
                "contacts": [],
                "parsed_query": parsed,
                "count": 0,
                "successful_drafts": 0,
                "credits_charged": 0,
                "remaining_credits": credits_available
            })
        
        # ✅ HUNTER.IO ENRICHMENT - Enrich contacts without emails
        contacts_with_email = [c for c in contacts if has_pdl_email(c)]
        contacts_without_email = [c for c in contacts if not has_pdl_email(c)]
        
        logger.info(f"📧 Email Status: {len(contacts_with_email)}/{len(contacts)} have emails from PDL")
        
        # Only use Hunter.io if we have contacts without emails
        if contacts_without_email:
            needed = max_contacts - len(contacts_with_email)
            logger.info(f"🔍 Need {needed} more emails, enriching {len(contacts_without_email)} contacts with Hunter.io...")
            try:
                contacts = enrich_contacts_with_hunter(
                    contacts,
                    max_enrichments=needed
                )
            except Exception as hunter_error:
                logger.warning(f"⚠️ Hunter.io enrichment failed: {hunter_error}")
        
        # Generate emails
        logger.info(f"📧 Generating emails for {len(contacts)} contacts...")
        resume_text = ""  # Prompt search doesn't use resume for email generation
        try:
            email_results = batch_generate_emails(
                contacts, 
                resume_text, 
                user_profile, 
                career_interests, 
                fit_context=None
            )
            logger.info(f"📧 Email generation returned {len(email_results)} results")
        except Exception as email_gen_error:
            logger.error(f"❌ Email generation failed: {email_gen_error}")
            email_results = {}
        
        # Attach email data to contacts
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
        
        logger.info(f"📧 Attached emails to {emails_attached}/{len(contacts)} contacts")
        
        # Get user resume URL and download once
        resume_url = None
        resume_content = None
        resume_filename = None
        if db and user_id:
            try:
                user_doc = db.collection('users').document(user_id).get()
                if user_doc.exists:
                    resume_url = user_doc.to_dict().get('resumeUrl')
                    if resume_url:
                        logger.info(f"📎 Downloading resume for draft attachments...")
                        resume_content, resume_filename = download_resume_from_url(resume_url)
            except Exception as e:
                logger.warning(f"⚠️ Error getting/downloading resume: {e}")
        
        # Create drafts if Gmail connected
        successful_drafts = 0
        user_info = None
        if user_profile:
            user_info = {
                'name': user_profile.get('name', ''),
                'email': user_email or '',
            }
        
        try:
            creds = _load_user_gmail_creds(user_id) if user_id else None
            if creds:
                logger.info(f"📧 Creating Gmail drafts for {len(contacts[:max_contacts])} contacts...")
                for i, contact in enumerate(contacts[:max_contacts]):
                    email_result = email_results.get(i) or email_results.get(str(i)) or email_results.get(f"{i}")
                    if email_result and isinstance(email_result, dict):
                        subject = email_result.get('subject', '')
                        body = email_result.get('body', '')
                        if subject and body:
                            try:
                                # Attach resume only when the email body says it's attached
                                attach_resume = email_body_mentions_resume(body)
                                draft_result = create_gmail_draft_for_user(
                                    contact, subject, body,
                                    tier='free', user_email=user_email,
                                    resume_content=resume_content if attach_resume else None,
                                    resume_filename=resume_filename if attach_resume else None,
                                    user_info=user_info, user_id=user_id
                                )
                                
                                # Handle both dict response (new) and string response (old/fallback)
                                if isinstance(draft_result, dict):
                                    draft_id = draft_result.get('draft_id', '')
                                    message_id = draft_result.get('message_id')
                                    draft_url = draft_result.get('draft_url', '')
                                    if not draft_url and draft_id:
                                        draft_url = f"https://mail.google.com/mail/u/0/#drafts?compose={message_id}" if message_id else f"https://mail.google.com/mail/u/0/#draft/{draft_id}"
                                else:
                                    draft_id = draft_result
                                    message_id = None
                                    draft_url = f"https://mail.google.com/mail/u/0/#draft/{draft_id}" if draft_id and not str(draft_id).startswith('mock_') else None
                                if draft_id and not str(draft_id).startswith('mock_'):
                                    successful_drafts += 1
                                    if draft_url:
                                        contact['gmailDraftId'] = draft_id
                                        if message_id:
                                            contact['gmailMessageId'] = message_id
                                        contact['gmailDraftUrl'] = draft_url
                                        contact['pipelineStage'] = 'draft_created'
                            except Exception as draft_error:
                                logger.error(f"❌ Failed to create draft for {contact.get('FirstName', 'Unknown')}: {draft_error}")
        except Exception as gmail_error:
            error_str = str(gmail_error).lower()
            if 'invalid_grant' in error_str or 'token has been expired or revoked' in error_str:
                logger.warning(f"⚠️ Gmail token permanently invalid for user {user_id}")
                uid = request.firebase_user["uid"]
                user_email = request.firebase_user.get("email") or ""
                auth_url = build_gmail_oauth_url_for_user(uid, user_email)
                clear_user_gmail_integration(uid)
                return jsonify({
                    'error': 'gmail_token_expired',
                    'message': 'Your Gmail connection has expired. Please reconnect your Gmail account.',
                    'require_reauth': True,
                    'authUrl': auth_url,
                    'contacts': contacts,
                    'parsed_query': parsed,
                    'count': len(contacts)
                }), 401
            else:
                logger.warning(f"⚠️ Gmail draft creation error (continuing without drafts): {gmail_error}")
        
        # Deduct credits (15 credits per contact)
        credits_charged = 15 * len(contacts)
        remaining_credits = credits_available
        if db and user_id:
            try:
                user_ref = db.collection('users').document(user_id)
                user_ref.update({
                    'credits': firestore.Increment(-credits_charged)
                })
                remaining_credits = credits_available - credits_charged
                logger.info(f"✅ Deducted {credits_charged} credits ({len(contacts)} contacts × 15). Remaining: {remaining_credits}")
            except Exception as e:
                logger.error(f"❌ Failed to deduct credits: {e}")
        
        return jsonify({
            "contacts": contacts,
            "parsed_query": parsed,
            "count": len(contacts),
            "successful_drafts": successful_drafts,
            "credits_charged": credits_charged,
            "remaining_credits": remaining_credits
        })
        
    except Exception as e:
        logger.error(f"Error in prompt_search: {e}", exc_info=True)
        return jsonify({"error": f"Search failed: {str(e)}"}), 500
