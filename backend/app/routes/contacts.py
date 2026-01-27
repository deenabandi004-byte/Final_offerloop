"""
Contact management routes
"""
import json
from datetime import datetime
from flask import Blueprint, request, jsonify
from firebase_admin import firestore

from ..extensions import require_firebase_auth
from app.services.gmail_client import _load_user_gmail_creds, _gmail_service, check_for_replies
from ..extensions import get_db
from app.utils.exceptions import NotFoundError, ValidationError, OfferloopException
from app.utils.validation import ContactCreateRequest, ContactUpdateRequest, validate_request

contacts_bp = Blueprint('contacts', __name__, url_prefix='/api/contacts')


@contacts_bp.route('', methods=['GET'])
@require_firebase_auth
def get_contacts():
    """Get contacts for a user with pagination"""
    try:
        db = get_db()
        user_id = request.firebase_user['uid']
        
        if not db:
            raise OfferloopException("Database not initialized", error_code="DATABASE_ERROR")
        
        # Get pagination parameters
        page = request.args.get('page', 1, type=int)
        per_page = min(request.args.get('per_page', 50, type=int), 100)  # Max 100 per page
        page = max(1, page)  # Ensure page is at least 1
        
        contacts_ref = db.collection('users').document(user_id).collection('contacts')
        
        # Get total count (for pagination metadata)
        # Note: Firestore doesn't have efficient count queries, so we'll estimate
        # For better performance, consider maintaining a count field
        
        # Query with pagination
        query = contacts_ref.order_by('createdAt', direction=firestore.Query.DESCENDING)
        
        # Calculate offset
        offset = (page - 1) * per_page
        
        # Firestore pagination: get one extra to check if there's a next page
        docs = list(query.limit(per_page + 1).offset(offset).stream())
        
        has_next = len(docs) > per_page
        items = []
        
        for doc in docs[:per_page]:  # Only return requested page size
            d = doc.to_dict()
            d['id'] = doc.id
            items.append(d)
        
        return jsonify({
            'contacts': items,
            'pagination': {
                'page': page,
                'per_page': per_page,
                'total_items': len(items),  # Approximate (Firestore limitation)
                'has_next': has_next,
                'has_prev': page > 1
            }
        })
        
    except OfferloopException:
        raise
    except Exception as e:
        print(f"Error getting contacts: {str(e)}")
        raise OfferloopException(f"Failed to retrieve contacts: {str(e)}", error_code="CONTACTS_FETCH_ERROR")


@contacts_bp.route('', methods=['POST'])
@require_firebase_auth
def create_contact():
    """Create a new contact with validation"""
    try:
        db = get_db()
        data = request.get_json() or {}
        user_id = request.firebase_user['uid']
        
        if not db:
            raise OfferloopException("Database not initialized", error_code="DATABASE_ERROR")
        
        # Validate input
        try:
            validated_data = validate_request(ContactCreateRequest, data)
        except ValidationError as ve:
            return ve.to_response()
        
        today = datetime.now().strftime('%m/%d/%Y')
        contact = {
            'firstName': validated_data.get('firstName', ''),
            'lastName': validated_data.get('lastName', ''),
            'linkedinUrl': validated_data.get('linkedinUrl', ''),
            'email': validated_data.get('email', ''),
            'company': validated_data.get('company', ''),
            'jobTitle': validated_data.get('jobTitle', ''),
            'college': validated_data.get('college', ''),
            'location': validated_data.get('location', ''),
            'firstContactDate': today,
            'status': 'Not Contacted',
            'lastContactDate': today,
            'userId': user_id,
            'createdAt': today,
        }
        
        doc_ref = db.collection('users').document(user_id).collection('contacts').add(contact)
        contact['id'] = doc_ref[1].id
        
        return jsonify({'contact': contact}), 201
        
    except OfferloopException:
        raise
    except Exception as e:
        print(f"Error creating contact: {str(e)}")
        raise OfferloopException(f"Failed to create contact: {str(e)}", error_code="CONTACT_CREATE_ERROR")


@contacts_bp.route('/<contact_id>', methods=['PUT'])
@require_firebase_auth
def update_contact(contact_id):
    """Update an existing contact with validation"""
    try:
        db = get_db()
        data = request.get_json() or {}
        user_id = request.firebase_user['uid']
        
        if not db:
            raise OfferloopException("Database not initialized", error_code="DATABASE_ERROR")
        
        # Validate input
        try:
            validated_data = validate_request(ContactUpdateRequest, data)
        except ValidationError as ve:
            return ve.to_response()
        
        ref = db.collection('users').document(user_id).collection('contacts').document(contact_id)
        doc = ref.get()
        
        if not doc.exists:
            raise NotFoundError("Contact")
        
        # Build update dict from validated data
        update = {}
        allowed_fields = ['firstName', 'lastName', 'linkedinUrl', 'email', 'company', 'jobTitle', 'college', 'location', 'status']
        for field in allowed_fields:
            if field in validated_data:
                update[field] = validated_data[field]
        
        # Handle status change - update lastContactDate
        if 'status' in update:
            current = doc.to_dict()
            if current.get('status') != update['status']:
                update['lastContactDate'] = datetime.now().strftime('%m/%d/%Y')
        
        if update:
            ref.update(update)
        
        out = ref.get().to_dict()
        out['id'] = contact_id
        
        return jsonify({'contact': out})
        
    except (OfferloopException, NotFoundError):
        raise
    except Exception as e:
        print(f"Error updating contact: {str(e)}")
        raise OfferloopException(f"Failed to update contact: {str(e)}", error_code="CONTACT_UPDATE_ERROR")


@contacts_bp.route('/<contact_id>', methods=['DELETE'])
@require_firebase_auth
def delete_contact(contact_id):
    """Delete a contact"""
    try:
        db = get_db()
        user_id = request.firebase_user['uid']
        
        if not db:
            raise OfferloopException("Database not initialized", error_code="DATABASE_ERROR")
        
        ref = db.collection('users').document(user_id).collection('contacts').document(contact_id)
        
        if not ref.get().exists:
            raise NotFoundError("Contact")
        
        ref.delete()
        
        return jsonify({'message': 'Contact deleted successfully'})
        
    except (OfferloopException, NotFoundError):
        raise
    except Exception as e:
        print(f"Error deleting contact: {str(e)}")
        raise OfferloopException(f"Failed to delete contact: {str(e)}", error_code="CONTACT_DELETE_ERROR")


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


@contacts_bp.route('/batch-check-replies', methods=['POST', 'OPTIONS'])
@require_firebase_auth
def batch_check_replies():
    """Check replies for multiple contacts at once"""
    # Handle CORS preflight
    if request.method == 'OPTIONS':
        return '', 200
    
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
            'gmailUrl': f"https://mail.google.com/mail/u/0/#draft/{draft['id']}"
        })
        
    except Exception as e:
        print(f"Error generating reply: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@contacts_bp.route('/bulk', methods=['POST'])
@require_firebase_auth
def bulk_create_contacts():
    """Bulk create contacts with validation and deduplication"""
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
        
        for idx, rc in enumerate(raw_contacts):
            # DEBUG: Log first contact received
            if idx == 0:
                print(f"[DEBUG] bulk_create_contacts - First raw contact received:")
                print(f"  emailSubject: {rc.get('emailSubject') or rc.get('email_subject') or 'MISSING'}")
                print(f"  emailBody: {(rc.get('emailBody') or rc.get('email_body') or 'MISSING')[:100]}...")
                print(f"  All keys: {list(rc.keys())}")
            
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
            
            # Check for duplicates - check both email and LinkedIn
            # This matches the same logic used in exclusion
            is_duplicate = False
            
            # Check by email if available
            if email:
                email_query = contacts_ref.where('email', '==', email).limit(1)
                email_docs = list(email_query.stream())
                if email_docs:
                    is_duplicate = True
            
            # Check by LinkedIn if available and not already found as duplicate
            if not is_duplicate and linkedin:
                linkedin_query = contacts_ref.where('linkedinUrl', '==', linkedin).limit(1)
                linkedin_docs = list(linkedin_query.stream())
                if linkedin_docs:
                    is_duplicate = True
            
            # Also check by name + company combination (for cases where email/LinkedIn might differ slightly)
            if not is_duplicate and first_name and last_name and company:
                name_company_query = contacts_ref.where('firstName', '==', first_name).where('lastName', '==', last_name).where('company', '==', company).limit(1)
                name_company_docs = list(name_company_query.stream())
                if name_company_docs:
                    is_duplicate = True
            
            if is_duplicate:
                # DON'T update email fields for duplicates - preserve the existing draft relationship
                # The user already has a draft for this contact, so we keep the original emailBody
                # and gmailDraftUrl to maintain consistency between Firestore and Gmail draft
                
                # Find the existing contact document to check if it needs any non-email updates
                existing_doc = None
                if email:
                    email_query = contacts_ref.where('email', '==', email).limit(1)
                    email_docs = list(email_query.stream())
                    if email_docs:
                        existing_doc = email_docs[0]
                elif linkedin:
                    linkedin_query = contacts_ref.where('linkedinUrl', '==', linkedin).limit(1)
                    linkedin_docs = list(linkedin_query.stream())
                    if linkedin_docs:
                        existing_doc = linkedin_docs[0]
                elif first_name and last_name and company:
                    name_company_query = contacts_ref.where('firstName', '==', first_name).where('lastName', '==', last_name).where('company', '==', company).limit(1)
                    name_company_docs = list(name_company_query.stream())
                    if name_company_docs:
                        existing_doc = name_company_docs[0]
                
                # Only update non-email fields if needed (e.g., lastContactDate, status, etc.)
                # Do NOT update: emailSubject, emailBody, gmailDraftId, gmailDraftUrl
                # This preserves the relationship between Firestore emailBody and Gmail draft
                if existing_doc:
                    update_data = {
                        'updatedAt': datetime.now().isoformat(),
                    }
                    # Optionally update other non-email fields here if needed
                    # For example, you might want to update lastContactDate if the contact was searched again
                    existing_doc.reference.update(update_data)
                    print(f"✅ Updated existing contact {first_name} {last_name} (preserved email content and draft URL)")
                
                skipped += 1
                print(f"🚫 Skipping duplicate contact: {first_name} {last_name} ({email or linkedin or 'no email/linkedin'}) - preserving existing email content and draft")
                continue
            
            # Get email subject and body if available (from generated emails)
            email_subject = (rc.get('emailSubject') or rc.get('email_subject') or '').strip()
            email_body = (rc.get('emailBody') or rc.get('email_body') or '').strip()
            gmail_draft_id = (rc.get('gmailDraftId') or rc.get('gmail_draft_id') or '').strip()
            gmail_draft_url = (rc.get('gmailDraftUrl') or rc.get('gmail_draft_url') or '').strip()
            
            # DEBUG: Log extracted email fields
            if idx == 0:
                print(f"[DEBUG] bulk_create_contacts - Extracted email fields:")
                print(f"  email_subject: {email_subject or 'MISSING'}")
                print(f"  email_body: {(email_body[:100] + '...') if email_body else 'MISSING'}")
            
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
            
            # Add email subject and body if available (from generated personalized emails)
            if email_subject:
                contact['emailSubject'] = email_subject
            if email_body:
                contact['emailBody'] = email_body
            # Add Gmail draft URL if available (draft has resume attached)
            if gmail_draft_id:
                contact['gmailDraftId'] = gmail_draft_id
            if gmail_draft_url:
                contact['gmailDraftUrl'] = gmail_draft_url
            
            # DEBUG: Log contact being saved to Firestore
            if idx == 0:
                print(f"[DEBUG] bulk_create_contacts - Contact being saved to Firestore:")
                print(f"  emailSubject: {contact.get('emailSubject') or 'MISSING'}")
                print(f"  emailBody: {(contact.get('emailBody', '')[:100] + '...') if contact.get('emailBody') else 'MISSING'}")
            
            doc_ref = contacts_ref.add(contact)
            contact['id'] = doc_ref[1].id
            created_contacts.append(contact)
            created += 1
        
        return jsonify({
            'created': created,
            'skipped': skipped,
            'contacts': created_contacts
        })
        
    except OfferloopException:
        raise
    except Exception as e:
        print(f"Error bulk creating contacts: {str(e)}")
        import traceback
        traceback.print_exc()
        raise OfferloopException(f"Failed to bulk create contacts: {str(e)}", error_code="BULK_CREATE_ERROR")


@contacts_bp.route('/<contact_id>', methods=['GET'])
@require_firebase_auth
def get_contact(contact_id):
    """Get a single contact by ID"""
    try:
        db = get_db()
        user_id = request.firebase_user['uid']
        
        if not db:
            raise OfferloopException("Database not initialized", error_code="DATABASE_ERROR")
        
        contact_ref = db.collection('users').document(user_id).collection('contacts').document(contact_id)
        contact_doc = contact_ref.get()
        
        if not contact_doc.exists:
            raise NotFoundError("Contact")
        
        contact = contact_doc.to_dict()
        contact['id'] = contact_id
        
        return jsonify({'contact': contact})
        
    except (OfferloopException, NotFoundError):
        raise
    except Exception as e:
        print(f"Error getting contact: {str(e)}")
        raise OfferloopException(f"Failed to retrieve contact: {str(e)}", error_code="CONTACT_FETCH_ERROR")


@contacts_bp.route('/bulk-delete', methods=['POST'])
@require_firebase_auth
def bulk_delete_contacts():
    """Bulk delete contacts by IDs"""
    try:
        db = get_db()
        user_id = request.firebase_user['uid']
        data = request.get_json() or {}
        contact_ids = data.get('contactIds', [])
        
        if not db:
            raise OfferloopException("Database not initialized", error_code="DATABASE_ERROR")
        
        if not contact_ids or not isinstance(contact_ids, list):
            raise ValidationError("contactIds must be a non-empty array", field="contactIds")
        
        if len(contact_ids) > 100:
            raise ValidationError("Cannot delete more than 100 contacts at once", field="contactIds")
        
        deleted_count = 0
        not_found = []
        
        contacts_ref = db.collection('users').document(user_id).collection('contacts')
        
        for contact_id in contact_ids:
            contact_ref = contacts_ref.document(contact_id)
            if contact_ref.get().exists:
                contact_ref.delete()
                deleted_count += 1
            else:
                not_found.append(contact_id)
        
        return jsonify({
            'deleted': deleted_count,
            'not_found': not_found,
            'message': f'Successfully deleted {deleted_count} contact(s)'
        })
        
    except (OfferloopException, ValidationError):
        raise
    except Exception as e:
        print(f"Error bulk deleting contacts: {str(e)}")
        raise OfferloopException(f"Failed to bulk delete contacts: {str(e)}", error_code="BULK_DELETE_ERROR")

