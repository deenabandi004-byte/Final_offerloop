"""
Run routes - free and pro tier search endpoints
"""
import json
import csv
from io import StringIO
from flask import Blueprint, request, jsonify, send_file
from werkzeug.utils import secure_filename

from app.extensions import require_firebase_auth, get_db
from app.services.resume_parser import extract_text_from_pdf
from app.services.pdl_client import search_contacts_with_smart_location_strategy
from app.services.reply_generation import batch_generate_emails
from app.services.gmail_client import _load_user_gmail_creds, _gmail_service, create_gmail_draft_for_user
from app.services.auth import check_and_reset_credits
from app.config import TIER_CONFIGS
from firebase_admin import firestore

runs_bp = Blueprint('runs', __name__, url_prefix='/api')


# Note: run_free_tier_enhanced_optimized and run_pro_tier_enhanced_final_with_text
# are large functions that should be moved to services/runs_service.py
# For now, importing them from app.py (will be moved later)
def run_free_tier_enhanced_optimized(job_title, company, location, user_email=None, user_profile=None, resume_text=None, career_interests=None, college_alumni=None, batch_size=None):
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
        
        credits_available = 120
        if db and user_id:
            try:
                user_ref = db.collection('users').document(user_id)
                user_doc = user_ref.get()
                if user_doc.exists:
                    user_data = user_doc.to_dict()
                    credits_available = check_and_reset_credits(user_ref, user_data)
                    if credits_available < 15:
                        return {
                            'error': 'Insufficient credits',
                            'credits_needed': 15,
                            'current_credits': credits_available,
                            'contacts': []
                        }
            except Exception:
                pass
        
        tier_max = TIER_CONFIGS['free']['max_contacts']
        max_contacts = batch_size if batch_size and 1 <= batch_size <= tier_max else tier_max
        
        # Search contacts
        contacts = search_contacts_with_smart_location_strategy(
            job_title, company, location, max_contacts=max_contacts, college_alumni=college_alumni
        )
        
        if not contacts:
            return {'contacts': [], 'successful_drafts': 0}
        
        # Generate emails
        email_results = batch_generate_emails(contacts, resume_text, user_profile, career_interests)
        
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
            if creds:
                for i, contact in enumerate(contacts[:max_contacts]):
                    key = str(i)
                    email_result = email_results.get(key)
                    if email_result:
                        draft_id = create_gmail_draft_for_user(
                            contact, email_result['subject'], email_result['body'],
                            tier='free', user_email=user_email, resume_url=None, user_info=user_info
                        )
                        if draft_id and not draft_id.startswith('mock_'):
                            successful_drafts += 1
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


def run_pro_tier_enhanced_final_with_text(job_title, company, location, resume_text, user_email=None, user_profile=None, career_interests=None, college_alumni=None, batch_size=None):
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
        
        credits_available = 1800
        if db and user_id:
            try:
                user_ref = db.collection('users').document(user_id)
                user_doc = user_ref.get()
                if user_doc.exists:
                    user_data = user_doc.to_dict()
                    credits_available = check_and_reset_credits(user_ref, user_data)
                    tier = user_data.get('tier', 'free')
                    if tier != 'pro':
                        return {'error': 'Pro tier subscription required', 'contacts': []}
                    if credits_available < 15:
                        return {
                            'error': 'Insufficient credits',
                            'credits_needed': 15,
                            'current_credits': credits_available,
                            'contacts': []
                        }
            except Exception:
                pass
        
        tier_max = TIER_CONFIGS['pro']['max_contacts']
        max_contacts = batch_size if batch_size and 1 <= batch_size <= tier_max else tier_max
        
        # Search contacts
        contacts = search_contacts_with_smart_location_strategy(
            job_title, company, location, max_contacts=max_contacts, college_alumni=college_alumni
        )
        
        if not contacts:
            return {'contacts': [], 'successful_drafts': 0}
        
        # Generate emails with resume
        email_results = batch_generate_emails(contacts, resume_text, user_profile, career_interests)
        
        # Get user resume URL
        resume_url = None
        if db and user_id:
            try:
                user_doc = db.collection('users').document(user_id).get()
                if user_doc.exists:
                    resume_url = user_doc.to_dict().get('resumeUrl')
            except Exception:
                pass
        
        # Create drafts
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
            if creds:
                for i, contact in enumerate(contacts[:max_contacts]):
                    key = str(i)
                    email_result = email_results.get(key)
                    if email_result:
                        draft_id = create_gmail_draft_for_user(
                            contact, email_result['subject'], email_result['body'],
                            tier='free', user_email=user_email, resume_url=None, user_info=user_info
                        )
                        if draft_id and not draft_id.startswith('mock_'):
                            successful_drafts += 1
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
    """Free tier search endpoint"""
    try:
        if request.is_json:
            data = request.get_json(silent=True) or {}
            job_title = (data.get("jobTitle") or "").strip()
            company = (data.get("company") or "").strip()
            location = (data.get("location") or "").strip()
            user_profile = data.get("userProfile") or None
            resume_text = data.get("resumeText") or None
            career_interests = data.get("careerInterests") or []
            college_alumni = (data.get("collegeAlumni") or "").strip()
            batch_size = data.get("batchSize")
        else:
            job_title = (request.form.get("jobTitle") or "").strip()
            company = (request.form.get("company") or "").strip()
            location = (request.form.get("location") or "").strip()
            user_profile = request.form.get("userProfile") or None
            resume_text = request.form.get("resumeText") or None
            career_interests = request.form.get("careerInterests") or []
            college_alumni = (request.form.get("collegeAlumni") or "").strip()
            batch_size = request.form.get("batchSize")
        
        if batch_size is not None:
            try:
                batch_size = int(batch_size)
            except (ValueError, TypeError):
                batch_size = None
        
        user_email = (request.firebase_user or {}).get("email") or ""
        
        print(f"New unified email system Free search for {user_email}: {job_title} at {company} in {location}")
        if resume_text:
            print(f"Resume provided for enhanced personalization ({len(resume_text)} chars)")
        print(f"DEBUG - college_alumni received: {college_alumni!r}")
        print(f"DEBUG - batch_size received: {batch_size}")
        
        result = run_free_tier_enhanced_optimized(
            job_title,
            company,
            location,
            user_email=user_email,
            user_profile=user_profile,
            resume_text=resume_text,
            career_interests=career_interests,
            college_alumni=college_alumni,
            batch_size=batch_size
        )
        
        if result.get("error"):
            error_type = result.get("error")
            if error_type == "gmail_token_expired":
                return jsonify({
                    "error": error_type,
                    "message": result.get("message"),
                    "require_reauth": True,
                    "contacts": result.get("contacts", [])
                }), 401  # 401 = Unauthorized (need to re-auth)
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
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@runs_bp.route('/free-run-csv', methods=['POST'])
@require_firebase_auth
def free_run_csv():
    """Free tier CSV download endpoint"""
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


@runs_bp.route("/pro-run", methods=["POST"])
@require_firebase_auth
def pro_run():
    """Pro tier search endpoint"""
    try:
        user_email = (request.firebase_user or {}).get("email") or ""
        
        if request.is_json:
            data = request.get_json(silent=True) or {}
            job_title = (data.get("jobTitle") or "").strip()
            company = (data.get("company") or "").strip()
            location = (data.get("location") or "").strip()
            resume_text = data.get("resumeText") or None
            if not resume_text:
                return jsonify({"error": "Resume text is required for Pro tier"}), 400
            user_profile = data.get("userProfile") or None
            career_interests = data.get("careerInterests") or []
            college_alumni = (data.get("collegeAlumni") or "").strip()
            batch_size = data.get("batchSize")
        else:
            job_title = (request.form.get("jobTitle") or "").strip()
            company = (request.form.get("company") or "").strip()
            location = (request.form.get("location") or "").strip()
            if 'resume' not in request.files:
                return jsonify({'error': 'Resume PDF file is required for Pro tier'}), 400
            resume_file = request.files['resume']
            if resume_file.filename == '' or not resume_file.filename.lower().endswith('.pdf'):
                return jsonify({'error': 'Valid PDF resume file is required'}), 400
            resume_text = extract_text_from_pdf(resume_file)
            if not resume_text:
                return jsonify({'error': 'Could not extract text from PDF'}), 400
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
            batch_size = request.form.get("batchSize")
            if batch_size:
                batch_size = int(batch_size)
        
        if not job_title or not location:
            missing = []
            if not job_title: missing.append('Job Title')
            if not location: missing.append('Location')
            return jsonify({'error': f"Missing required fields: {', '.join(missing)}"}), 400
        
        print(f"New unified email system PRO search for {user_email}: {job_title} at {company} in {location}")
        if resume_text:
            print(f"Resume provided ({len(resume_text)} chars)")
        print(f"DEBUG - college_alumni received: {college_alumni!r}")
        
        result = run_pro_tier_enhanced_final_with_text(
            job_title,
            company,
            location,
            resume_text,
            user_email=user_email,
            user_profile=user_profile,
            career_interests=career_interests,
            college_alumni=college_alumni,
            batch_size=batch_size
        )
        
        if result.get("error"):
            error_type = result.get("error")
            if error_type == "gmail_token_expired":
                return jsonify({
                    "error": error_type,
                    "message": result.get("message"),
                    "require_reauth": True,
                    "contacts": result.get("contacts", [])
                }), 401  # 401 = Unauthorized (need to re-auth)
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
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@runs_bp.route('/pro-run-csv', methods=['POST'])
@require_firebase_auth
def pro_run_csv():
    """Pro tier CSV download endpoint"""
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
                return jsonify({'error': 'Resume PDF file is required'}), 400
            resume_file = request.files['resume']
            if resume_file.filename == '' or not resume_file.filename.lower().endswith('.pdf'):
                return jsonify({'error': 'Valid PDF resume file is required'}), 400
            resume_text = extract_text_from_pdf(resume_file)
            if not resume_text:
                return jsonify({'error': 'Could not extract text from PDF'}), 400
        
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

