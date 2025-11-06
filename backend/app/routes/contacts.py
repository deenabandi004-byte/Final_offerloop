"""
Contact management routes
"""
import json
from datetime import datetime
from flask import Blueprint, request, jsonify
from firebase_admin import firestore

from app.extensions import require_firebase_auth
from app.services.gmail_client import _load_user_gmail_creds, _gmail_service, check_for_replies
from app.extensions import get_db

contacts_bp = Blueprint('contacts', __name__, url_prefix='/api/contacts')


@contacts_bp.route('', methods=['GET'])
@require_firebase_auth
def get_contacts():
    """Get all contacts for a user"""
    try:
        db = get_db()
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


@contacts_bp.route('', methods=['POST'])
@require_firebase_auth
def create_contact():
    """Create a new contact"""
    try:
        db = get_db()
        data = request.get_json()
        user_id = request.firebase_user['uid']
        
        if not db:
            return jsonify({'error': 'Firebase not initialized'}), 500
        
        today = datetime.now().strftime('%m/%d/%Y')
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


@contacts_bp.route('/<contact_id>', methods=['PUT'])
@require_firebase_auth
def update_contact(contact_id):
    """Update an existing contact"""
    try:
        db = get_db()
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
                update['lastContactDate'] = datetime.now().strftime('%m/%d/%Y')
            update['status'] = data['status']
        
        ref.update(update)
        out = ref.get().to_dict()
        out['id'] = contact_id
        
        return jsonify({'contact': out})
        
    except Exception as e:
        print(f"Error updating contact: {str(e)}")
        return jsonify({'error': str(e)}), 500


@contacts_bp.route('/<contact_id>', methods=['DELETE'])
@require_firebase_auth
def delete_contact(contact_id):
    """Delete a contact"""
    try:
        db = get_db()
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


@contacts_bp.route('/<contact_id>/check-replies', methods=['GET'])
@require_firebase_auth
def check_contact_replies(contact_id):
    """Check if a contact has replied to our email"""
    try:
        db = get_db()
        user_id = request.firebase_user['uid']
        
        # Get contact from Firestore
        contact_ref = db.collection('users').document(user_id).collection('contacts').document(contact_id)
        contact_doc = contact_ref.get()
        
        if not contact_doc.exists:
            return jsonify({'error': 'Contact not found'}), 404
        
        contact_data = contact_doc.to_dict()
        thread_id = contact_data.get('gmailThreadId')
        email = contact_data.get('email')
        
        if not thread_id or not email:
            return jsonify({'hasReply': False, 'isUnread': False})
        
        # Get Gmail service
        creds = _load_user_gmail_creds(user_id)
        if not creds:
            return jsonify({'error': 'Gmail not connected'}), 401
        
        gmail_service = _gmail_service(creds)
        
        # Check for replies
        reply_status = check_for_replies(gmail_service, thread_id, email)
        
        # Update contact with reply status
        contact_ref.update({
            'hasUnreadReply': reply_status['isUnread'],
            'lastChecked': datetime.now().isoformat()
        })
        
        return jsonify(reply_status)
        
    except Exception as e:
        print(f"Error checking replies: {e}")
        return jsonify({'error': str(e)}), 500


@contacts_bp.route('/<contact_id>/mute-notifications', methods=['POST'])
@require_firebase_auth
def mute_contact_notifications(contact_id):
    """Mute/unmute notifications for a contact"""
    try:
        db = get_db()
        user_id = request.firebase_user['uid']
        data = request.get_json() or {}
        muted = data.get('muted', True)
        
        contact_ref = db.collection('users').document(user_id).collection('contacts').document(contact_id)
        
        if not contact_ref.get().exists:
            return jsonify({'error': 'Contact not found'}), 404
        
        contact_ref.update({
            'notificationsMuted': muted,
            'mutedAt': datetime.now().isoformat() if muted else None
        })
        
        return jsonify({'success': True, 'muted': muted})
        
    except Exception as e:
        print(f"Error muting notifications: {e}")
        return jsonify({'error': str(e)}), 500


@contacts_bp.route('/batch-check-replies', methods=['POST'])
@require_firebase_auth
def batch_check_replies():
    """Check replies for multiple contacts at once"""
    try:
        db = get_db()
        user_id = request.firebase_user['uid']
        data = request.get_json() or {}
        contact_ids = data.get('contactIds', [])
        
        if not contact_ids:
            return jsonify({'results': {}})
        
        # Get Gmail service
        creds = _load_user_gmail_creds(user_id)
        if not creds:
            return jsonify({'error': 'Gmail not connected'}), 401
        
        gmail_service = _gmail_service(creds)
        results = {}
        
        for contact_id in contact_ids[:20]:  # Limit to 20 at a time
            try:
                contact_ref = db.collection('users').document(user_id).collection('contacts').document(contact_id)
                contact_doc = contact_ref.get()
                
                if not contact_doc.exists:
                    continue
                
                contact_data = contact_doc.to_dict()
                
                # Skip if notifications are muted
                if contact_data.get('notificationsMuted'):
                    results[contact_id] = {'hasReply': False, 'isUnread': False, 'muted': True}
                    continue
                
                thread_id = contact_data.get('gmailThreadId')
                email = contact_data.get('email')
                
                if thread_id and email:
                    reply_status = check_for_replies(gmail_service, thread_id, email)
                    results[contact_id] = reply_status
                    
                    # Update in Firestore
                    contact_ref.update({
                        'hasUnreadReply': reply_status['isUnread'],
                        'lastChecked': datetime.now().isoformat()
                    })
            except Exception as e:
                print(f"Error checking contact {contact_id}: {e}")
                continue
        
        return jsonify({'results': results})
        
    except Exception as e:
        print(f"Error batch checking replies: {e}")
        return jsonify({'error': str(e)}), 500


@contacts_bp.route('/<contact_id>/generate-reply', methods=['POST'])
@require_firebase_auth
def generate_reply_draft(contact_id):
    """Generate a reply draft for a contact's message"""
    try:
        import base64
        from email.mime.text import MIMEText
        db = get_db()
        user_id = request.firebase_user['uid']
        
        # Get contact
        contact_ref = db.collection('users').document(user_id).collection('contacts').document(contact_id)
        contact_doc = contact_ref.get()
        
        if not contact_doc.exists:
            return jsonify({'error': 'Contact not found'}), 404
        
        contact_data = contact_doc.to_dict()
        thread_id = contact_data.get('gmailThreadId')
        
        if not thread_id:
            return jsonify({'error': 'No Gmail thread found'}), 400
        
        # Get Gmail service
        creds = _load_user_gmail_creds(user_id)
        if not creds:
            return jsonify({'error': 'Gmail not connected'}), 401
        
        gmail_service = _gmail_service(creds)
        
        # Get the latest message in the thread
        thread = gmail_service.users().threads().get(
            userId='me',
            id=thread_id,
            format='full'
        ).execute()
        
        messages = thread.get('messages', [])
        if not messages:
            return jsonify({'error': 'No messages in thread'}), 400
        
        latest_message = messages[-1]
        
        # Extract message body (simplified)
        payload = latest_message.get('payload', {})
        body = ''
        
        if 'parts' in payload:
            for part in payload['parts']:
                if part['mimeType'] == 'text/plain':
                    body = base64.urlsafe_b64decode(part['body']['data']).decode('utf-8')
                    break
        elif 'body' in payload and 'data' in payload['body']:
            body = base64.urlsafe_b64decode(payload['body']['data']).decode('utf-8')
        
        # Generate reply using AI (placeholder - you'll enhance this later)
        reply_text = f"Thank you for your reply! I appreciate you taking the time to respond.\n\nBest regards"
        
        # Create draft reply in Gmail
        message = MIMEText(reply_text)
        message['to'] = contact_data.get('email')
        message['subject'] = f"Re: {contact_data.get('emailSubject', 'Our conversation')}"
        
        raw = base64.urlsafe_b64encode(message.as_bytes()).decode('utf-8')
        
        draft_body = {
            'message': {
                'raw': raw,
                'threadId': thread_id
            }
        }
        
        draft = gmail_service.users().drafts().create(userId='me', body=draft_body).execute()
        
        # Mark as read
        gmail_service.users().threads().modify(
            userId='me',
            id=thread_id,
            body={'removeLabelIds': ['UNREAD']}
        ).execute()
        
        # Update contact
        contact_ref.update({
            'hasUnreadReply': False,
            'lastReplyDraftId': draft['id']
        })
        
        return jsonify({
            'success': True,
            'draftId': draft['id'],
            'threadId': thread_id,
            'gmailUrl': f"https://mail.google.com/mail/u/0/#drafts/{draft['id']}"
        })
        
    except Exception as e:
        print(f"Error generating reply: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@contacts_bp.route('/bulk', methods=['POST'])
@require_firebase_auth
def bulk_create_contacts():
    """Bulk create contacts with deduplication"""
    try:
        db = get_db()
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
        today = datetime.now().strftime('%m/%d/%Y')
        
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
            
            # Skip if missing critical fields
            if not (first_name and last_name):
                skipped += 1
                continue
            
            # Check for duplicates
            existing_query = contacts_ref.where('email', '==', email).limit(1) if email else contacts_ref.where('linkedinUrl', '==', linkedin).limit(1) if linkedin else None
            if existing_query:
                existing_docs = list(existing_query.stream())
                if existing_docs:
                    skipped += 1
                    continue
            
            contact = {
                'firstName': first_name,
                'lastName': last_name,
                'email': email,
                'linkedinUrl': linkedin,
                'company': company,
                'jobTitle': job_title,
                'college': college,
                'location': location,
                'city': city,
                'state': state,
                'firstContactDate': today,
                'status': 'Not Contacted',
                'lastContactDate': today,
                'userId': user_id,
                'createdAt': today,
            }
            
            doc_ref = contacts_ref.add(contact)
            contact['id'] = doc_ref[1].id
            created_contacts.append(contact)
            created += 1
        
        return jsonify({
            'created': created,
            'skipped': skipped,
            'contacts': created_contacts
        })
        
    except Exception as e:
        print(f"Error bulk creating contacts: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@contacts_bp.route('/<contact_id>', methods=['GET'])
@require_firebase_auth
def get_contact(contact_id):
    """Get a single contact by ID"""
    try:
        db = get_db()
        user_id = request.firebase_user['uid']
        
        if not db:
            return jsonify({'error': 'Firebase not initialized'}), 500
        
        contact_ref = db.collection('users').document(user_id).collection('contacts').document(contact_id)
        contact_doc = contact_ref.get()
        
        if not contact_doc.exists:
            return jsonify({'error': 'Contact not found'}), 404
        
        contact = contact_doc.to_dict()
        contact['id'] = contact_id
        
        return jsonify({'contact': contact})
        
    except Exception as e:
        print(f"Error getting contact: {str(e)}")
        return jsonify({'error': str(e)}), 500

