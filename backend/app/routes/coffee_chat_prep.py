"""
Coffee chat prep routes
"""
import os
import threading
from datetime import datetime
from flask import Blueprint, request, jsonify, send_file
from firebase_admin import firestore

from app.extensions import require_firebase_auth
from app.services.auth import check_and_reset_credits
from app.services.pdl_client import enrich_linkedin_profile
from app.services.pdf_builder import generate_coffee_chat_pdf_simple_fixed
from app.utils.coffee_chat_prep import generate_coffee_chat_similarity, generate_coffee_chat_questions
from app.utils.users import parse_resume_info
from app.config import COFFEE_CHAT_CREDITS
from app.extensions import get_db

coffee_chat_bp = Blueprint('coffee_chat_prep', __name__, url_prefix='/api/coffee-chat-prep')


def fetch_company_news(company, location):
    """Fetch recent company news using SerpAPI"""
    try:
        from app.config import SERPAPI_KEY
        if not SERPAPI_KEY:
            print("SerpAPI key not configured - skipping news fetch")
            return []
        
        print(f"Fetching news for {company} in {location}")
        
        from serpapi import GoogleSearch
        query = f"{company} {location} recent news announcements"
        
        search = GoogleSearch({
            'q': query,
            'api_key': SERPAPI_KEY,
            'num': 5,
            'tbm': 'nws',
            'tbs': 'qdr:m3'
        })
        
        results = search.get_dict()
        news_items = []
        
        if 'news_results' in results:
            for result in results.get('news_results', [])[:5]:
                news_items.append({
                    'title': result.get('title', ''),
                    'url': result.get('link', ''),
                    'summary': result.get('snippet', '')[:200],
                    'source': result.get('source', ''),
                    'published_at': result.get('date', ''),
                    'relevance_tag': 'company'
                })
        
        return news_items
        
    except Exception as e:
        print(f"Error fetching company news: {e}")
        return []


def process_coffee_chat_prep_background(prep_id, linkedin_url, user_id, credits_available, resume_text):
    """Background worker to process coffee chat prep"""
    try:
        db = get_db()
        print(f"\n=== PROCESSING PREP {prep_id} ===")
        
        if not db:
            print("❌ No database connection")
            return
        
        prep_ref = db.collection('users').document(user_id).collection('coffee-chat-preps').document(prep_id)
        
        # Step 1: Enrich LinkedIn profile
        print("Step 1: Enriching LinkedIn profile...")
        prep_ref.update({'status': 'enriching_profile'})
        contact_data = enrich_linkedin_profile(linkedin_url)
        
        if not contact_data:
            print("❌ Failed to enrich profile")
            prep_ref.update({
                'status': 'failed',
                'error': 'Could not enrich LinkedIn profile. Please check the URL and try again.'
            })
            return
        
        print(f"✅ Profile enriched: {contact_data.get('firstName')} {contact_data.get('lastName')}")
        prep_ref.update({'contactData': contact_data})
        
        # Step 2: Fetch company news
        print("Step 2: Fetching company news...")
        prep_ref.update({'status': 'fetching_news'})
        company_news = fetch_company_news(
            contact_data.get('company', ''),
            contact_data.get('location', '')
        )
        print(f"✅ Found {len(company_news)} news items")
        
        # Step 3: Generate user data from resume
        print("Step 3: Parsing resume...")
        user_data = parse_resume_info(resume_text) if resume_text else {}
        print(f"✅ User data: {user_data.get('name')}")
        
        # Step 4: Generate similarity and questions
        print("Step 4: Generating similarity and questions...")
        prep_ref.update({'status': 'generating_content'})
        
        similarity = generate_coffee_chat_similarity(user_data, contact_data)
        questions = generate_coffee_chat_questions(contact_data, user_data)
        
        print(f"✅ Generated similarity and {len(questions)} questions")
        
        # Step 5: Generate PDF
        print("Step 5: Generating PDF...")
        prep_ref.update({'status': 'generating_pdf'})
        
        pdf_buffer = generate_coffee_chat_pdf_simple_fixed(
            prep_id,
            contact_data,
            company_news,
            similarity,
            questions
        )
        
        # Save PDF to temporary file
        import tempfile
        with tempfile.NamedTemporaryFile(delete=False, suffix='.pdf') as tmp:
            tmp.write(pdf_buffer.getvalue())
            pdf_path = tmp.name
        
        print(f"✅ PDF generated ({pdf_buffer.getbuffer().nbytes} bytes)")
        print(f"✅ PDF saved to: {pdf_path}")
        
        # Step 6: Mark as completed
        print("Step 6: Marking as completed...")
        prep_ref.update({
            'status': 'completed',
            'pdfPath': pdf_path,
            'completedAt': datetime.now().isoformat(),
            'companyNews': company_news,
            'similaritySummary': similarity,
            'coffeeQuestions': questions
        })
        
        print(f"✅ Status set to 'completed'")
        
        # Step 7: Deduct credits
        print("Step 7: Deducting credits...")
        user_ref = db.collection('users').document(user_id)
        new_credits = max(0, credits_available - COFFEE_CHAT_CREDITS)
        user_ref.update({'credits': new_credits})
        
        print(f"✅ Credits deducted: {credits_available} -> {new_credits}")
        print(f"=== PREP {prep_id} COMPLETED SUCCESSFULLY ===\n")
        
    except Exception as e:
        print(f"❌ Coffee chat prep failed: {e}")
        import traceback
        traceback.print_exc()
        
        try:
            prep_ref.update({
                'status': 'failed',
                'error': str(e)
            })
        except:
            pass


@coffee_chat_bp.route('', methods=['POST'])
@require_firebase_auth
def create_coffee_chat_prep():
    """Create a new coffee chat prep"""
    try:
        print("\n=== COFFEE CHAT PREP START ===")
        db = get_db()
        
        data = request.get_json() or {}
        linkedin_url = data.get('linkedinUrl', '').strip()
        
        if not linkedin_url:
            return jsonify({'error': 'LinkedIn URL is required'}), 400
        
        user_id = request.firebase_user.get('uid')
        user_email = request.firebase_user.get('email')
        
        # Check credits
        credits_available = 120
        if db and user_id:
            user_ref = db.collection('users').document(user_id)
            user_doc = user_ref.get()
            if user_doc.exists:
                user_data = user_doc.to_dict()
                credits_available = check_and_reset_credits(user_ref, user_data)
                
                if credits_available < COFFEE_CHAT_CREDITS:
                    return jsonify({
                        'error': f'Insufficient credits. You need {COFFEE_CHAT_CREDITS} credits.',
                        'credits_needed': COFFEE_CHAT_CREDITS,
                        'current_credits': credits_available
                    }), 400
        
        # Get resume
        resume_text = None
        if db and user_id:
            user_doc = db.collection('users').document(user_id).get()
            if user_doc.exists:
                user_data = user_doc.to_dict()
                resume_text = user_data.get('resumeText')
        
        if not resume_text:
            return jsonify({
                'error': 'Please upload your resume in Account Settings first.',
                'needsResume': True
            }), 400
        
        # Create prep record
        prep_data = {
            'linkedinUrl': linkedin_url,
            'status': 'processing',
            'createdAt': datetime.now().isoformat(),
            'userId': user_id,
            'userEmail': user_email
        }
        
        prep_ref = db.collection('users').document(user_id).collection('coffee-chat-preps').document()
        prep_ref.set(prep_data)
        prep_id = prep_ref.id
        
        # Start background processing
        thread = threading.Thread(
            target=process_coffee_chat_prep_background,
            args=(prep_id, linkedin_url, user_id, credits_available, resume_text)
        )
        thread.daemon = True
        thread.start()
        
        return jsonify({
            'prepId': prep_id,
            'status': 'processing',
            'message': 'Coffee Chat Prep is being generated...'
        }), 200
        
    except Exception as e:
        print(f"Error: {e}")
        return jsonify({'error': str(e)}), 500


@coffee_chat_bp.route('/history', methods=['GET'])
@require_firebase_auth
def get_coffee_chat_history():
    """Get recent coffee chat prep history"""
    try:
        db = get_db()
        user_id = request.firebase_user.get('uid')
        limit = request.args.get('limit', 5, type=int)
        
        if not db:
            return jsonify({'history': []}), 200
        
        preps_ref = db.collection('users').document(user_id).collection('coffee-chat-preps')
        preps = preps_ref.order_by('createdAt', direction=firestore.Query.DESCENDING).limit(limit).stream()
        
        history = []
        for prep in preps:
            prep_data = prep.to_dict()
            contact_data = prep_data.get('contactData', {})
            history.append({
                'id': prep.id,
                'contactName': f"{contact_data.get('firstName', '')} {contact_data.get('lastName', '')}".strip() or 'Unknown',
                'company': contact_data.get('company', ''),
                'jobTitle': contact_data.get('jobTitle', ''),
                'status': prep_data.get('status', 'unknown'),
                'createdAt': prep_data.get('createdAt', ''),
                'error': prep_data.get('error', '')
            })
        
        return jsonify({'history': history}), 200
        
    except Exception as e:
        print(f"Error: {e}")
        return jsonify({'history': []}), 200


@coffee_chat_bp.route('/all', methods=['GET'])
@require_firebase_auth
def get_all_coffee_chat_preps():
    """Get all coffee chat preps"""
    try:
        db = get_db()
        user_id = request.firebase_user.get('uid')
        preps_ref = db.collection('users').document(user_id).collection('coffee-chat-preps')
        preps = preps_ref.order_by('createdAt', direction=firestore.Query.DESCENDING).stream()
        
        all_preps = []
        for prep in preps:
            prep_data = prep.to_dict()
            contact_data = prep_data.get('contactData', {})
            
            all_preps.append({
                'id': prep.id,
                'contactName': f"{contact_data.get('firstName', '')} {contact_data.get('lastName', '')}".strip() or 'Unknown',
                'company': contact_data.get('company', ''),
                'jobTitle': contact_data.get('jobTitle', ''),
                'linkedinUrl': prep_data.get('linkedinUrl', ''),
                'status': prep_data.get('status'),
                'createdAt': prep_data.get('createdAt', ''),
                'error': prep_data.get('error', '')
            })
        
        return jsonify({'preps': all_preps})
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@coffee_chat_bp.route('/<prep_id>/download', methods=['GET'])
@require_firebase_auth
def download_coffee_chat_pdf(prep_id):
    """Download Coffee Chat PDF"""
    try:
        db = get_db()
        user_id = request.firebase_user.get('uid')
        prep_ref = db.collection('users').document(user_id).collection('coffee-chat-preps').document(prep_id)
        prep_doc = prep_ref.get()
        
        if not prep_doc.exists:
            return jsonify({'error': 'Prep not found'}), 404
        
        prep_data = prep_doc.to_dict()
        pdf_path = prep_data.get('pdfPath')
        
        if not pdf_path or not os.path.exists(pdf_path):
            return jsonify({'error': 'PDF not found'}), 404
        
        return send_file(
            pdf_path,
            mimetype='application/pdf',
            as_attachment=True,
            download_name=f'coffee_chat_{prep_id}.pdf'
        )
        
    except Exception as e:
        print(f"Error: {e}")
        return jsonify({'error': str(e)}), 500


@coffee_chat_bp.route('/<prep_id>', methods=['GET'])
@require_firebase_auth
def get_coffee_chat_prep(prep_id):
    """Get prep status"""
    try:
        db = get_db()
        user_id = request.firebase_user.get('uid')
        prep_ref = db.collection('users').document(user_id).collection('coffee-chat-preps').document(prep_id)
        prep_doc = prep_ref.get()
        
        if not prep_doc.exists:
            return jsonify({'error': 'Prep not found'}), 404
        
        prep_data = prep_doc.to_dict()
        prep_data['id'] = prep_id
        
        return jsonify(prep_data), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@coffee_chat_bp.route('/<prep_id>', methods=['DELETE'])
@require_firebase_auth
def delete_coffee_chat_prep(prep_id):
    """Delete a coffee chat prep"""
    try:
        db = get_db()
        user_id = request.firebase_user.get('uid')
        prep_ref = db.collection('users').document(user_id).collection('coffee-chat-preps').document(prep_id)
        prep_doc = prep_ref.get()
        
        if not prep_doc.exists:
            return jsonify({'error': 'Prep not found'}), 404
        
        # Delete PDF file if exists
        prep_data = prep_doc.to_dict()
        pdf_path = prep_data.get('pdfPath')
        if pdf_path and os.path.exists(pdf_path):
            try:
                os.unlink(pdf_path)
            except Exception:
                pass
        
        prep_ref.delete()
        
        return jsonify({'message': 'Prep deleted successfully'})
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

