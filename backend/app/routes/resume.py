"""
Resume parsing routes
"""
from flask import Blueprint, request, jsonify
from firebase_admin import auth as fb_auth

from app.services.resume_parser import extract_text_from_pdf
from app.extensions import require_firebase_auth
from app.utils.users import parse_resume_info
from app.extensions import get_db

resume_bp = Blueprint('resume', __name__, url_prefix='/api')


def upload_resume_to_firebase_storage(user_id, file):
    """Upload resume to Firebase Storage"""
    try:
        from firebase_admin import storage
        bucket = storage.bucket()
        blob = bucket.blob(f'resumes/{user_id}/{file.filename}')
        blob.upload_from_file(file)
        blob.make_public()
        return blob.public_url
    except Exception as e:
        print(f"Storage upload failed: {e}")
        return None


def save_resume_to_firebase(user_id, resume_text, resume_url):
    """Save resume text and URL to Firestore"""
    try:
        db = get_db()
        if not db:
            return False
        
        db.collection('users').document(user_id).update({
            'resumeText': resume_text,
            'resumeUrl': resume_url,
            'resumeFileName': 'resume.pdf',
            'resumeUpdatedAt': datetime.now()
        })
        return True
    except Exception as e:
        print(f"Firestore save failed: {e}")
        return False


@resume_bp.route('/parse-resume', methods=['POST'])
def parse_resume():
    """Parse uploaded resume, upload to storage, and extract user information"""
    try:
        from datetime import datetime
        
        print("=" * 60)
        print("📋 RESUME UPLOAD & PARSING")
        print("=" * 60)
        
        # Validate file exists
        if 'resume' not in request.files:
            print("❌ No resume file in request")
            return jsonify({'error': 'No resume file provided'}), 400
        
        file = request.files['resume']
        print(f"📄 File: {file.filename}")
        
        if file.filename == '':
            print("❌ Empty filename")
            return jsonify({'error': 'No file selected'}), 400
        
        if not file.filename.lower().endswith('.pdf'):
            print(f"❌ Invalid file type: {file.filename}")
            return jsonify({'error': 'Only PDF files are supported'}), 400
        
        # Extract text from PDF
        print("📖 Extracting text from PDF...")
        resume_text = extract_text_from_pdf(file)
        
        if not resume_text:
            print("❌ Could not extract text from PDF")
            return jsonify({'error': 'Could not extract text from PDF'}), 400
        
        print(f"✅ Extracted {len(resume_text)} characters")
        
        # Parse user info
        print("🔍 Parsing resume info...")
        parsed_info = parse_resume_info(resume_text)
        print(f"✅ Parsed: {parsed_info.get('name', 'Unknown')}")
        
        # Get user ID from auth token
        user_id = None
        resume_url = None
        
        try:
            db = get_db()
            auth_header = request.headers.get('Authorization', '')
            
            if auth_header.startswith('Bearer '):
                id_token = auth_header.split(' ', 1)[1].strip()
                
                try:
                    decoded = fb_auth.verify_id_token(id_token)
                    user_id = decoded.get('uid')
                    print(f"👤 User ID: {user_id}")
                    
                    if user_id and db:
                        # STEP 4A: Upload file to Firebase Storage
                        print("\n📤 Uploading to Firebase Storage...")
                        file.seek(0)  # Reset file pointer for re-reading
                        resume_url = upload_resume_to_firebase_storage(user_id, file)
                        
                        if not resume_url:
                            print("⚠️  File upload failed, continuing without URL")
                        
                        # STEP 4B: Save both text and URL to Firebase
                        print("\n💾 Saving to Firestore...")
                        file.seek(0)  # Reset again for text extraction
                        save_result = save_resume_to_firebase(
                            user_id, 
                            resume_text,
                            resume_url
                        )
                        
                        if save_result:
                            print("✅ All data saved successfully")
                        else:
                            print("⚠️  Save returned False")
                    
                except Exception as e:
                    print(f"❌ Token verification failed: {e}")
                    import traceback
                    traceback.print_exc()
                    
        except Exception as e:
            print(f"❌ Auth check failed: {e}")
            import traceback
            traceback.print_exc()
        
        print("=" * 60)
        print("✅ RESUME PROCESSING COMPLETE")
        print("=" * 60)
        
        return jsonify({
            'success': True,
            'data': parsed_info,
            'savedToFirebase': bool(user_id),
            'resumeUrl': resume_url  # Return URL to frontend
        })
        
    except Exception as e:
        print(f"💥 FATAL ERROR: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Failed to parse resume'}), 500

