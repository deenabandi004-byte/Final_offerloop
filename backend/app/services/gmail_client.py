"""
Gmail client service - OAuth credentials management and Gmail API operations
"""
import os
import base64
import pickle
from datetime import datetime
from email.mime.text import MIMEText
import requests
from googleapiclient.discovery import build
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google.cloud.firestore_v1 import FieldFilter

from app.config import GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GMAIL_SCOPES, OAUTH_REDIRECT_URI
from app.extensions import get_db


def _gmail_client_config():
    """Get Gmail OAuth client configuration"""
    return {
        "web": {
            "client_id": GOOGLE_CLIENT_ID,
            "project_id": "offerloop-native",
            "auth_uri": "https://accounts.google.com/o/oauth2/v2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "client_secret": GOOGLE_CLIENT_SECRET,
            "redirect_uris": [OAUTH_REDIRECT_URI],
        }
    }


def _save_user_gmail_creds(uid, creds):
    """Save user Gmail credentials to Firestore"""
    db = get_db()
    if not db:
        return
    
    data = {
        "token": creds.token,
        "refresh_token": getattr(creds, "refresh_token", None),
        "token_uri": creds.token_uri,
        "client_id": creds.client_id,
        "client_secret": creds.client_secret,
        "scopes": creds.scopes,
        "expiry": creds.expiry.isoformat() if getattr(creds, "expiry", None) else None,
        "updatedAt": datetime.utcnow(),
    }
    db.collection("users").document(uid).collection("integrations").document("gmail").set(data, merge=True)


def _load_user_gmail_creds(uid):
    """Load user Gmail credentials from Firestore"""
    db = get_db()
    if not db:
        return None
    
    snap = db.collection("users").document(uid).collection("integrations").document("gmail").get()
    print(f"🔍 DEBUG: Checking integrations/gmail for uid={uid}, exists={snap.exists}")
    if not snap.exists:
        return None
    data = snap.to_dict() or {}
    creds = Credentials.from_authorized_user_info({
        "token": data.get("token"),
        "refresh_token": data.get("refresh_token"),
        "token_uri": data.get("token_uri") or "https://oauth2.googleapis.com/token",
        "client_id": data.get("client_id") or GOOGLE_CLIENT_ID,
        "client_secret": data.get("client_secret") or GOOGLE_CLIENT_SECRET,
        "scopes": data.get("scopes") or GMAIL_SCOPES,
    })
    if creds and creds.expired and creds.refresh_token:
        creds.refresh(Request())
        _save_user_gmail_creds(uid, creds)
    return creds


def _gmail_service(creds):
    """Build Gmail service from credentials"""
    return build("gmail", "v1", credentials=creds)


def get_thread_messages(gmail_service, thread_id):
    """Get all messages in a Gmail thread"""
    try:
        thread = gmail_service.users().threads().get(
            userId='me',
            id=thread_id,
            format='metadata',
            metadataHeaders=['From', 'To', 'Subject']
        ).execute()
        return thread.get('messages', [])
    except Exception as e:
        print(f"Error getting thread messages: {e}")
        return []


def check_for_replies(gmail_service, thread_id, sent_to_email):
    """Check if there are any replies from the recipient in the thread"""
    try:
        messages = get_thread_messages(gmail_service, thread_id)
        
        # Skip the first message (our sent message)
        for msg in messages[1:]:
            headers = msg.get('payload', {}).get('headers', [])
            from_header = next((h['value'] for h in headers if h['name'].lower() == 'from'), '')
            
            # Check if this message is from the recipient
            if sent_to_email.lower() in from_header.lower():
                # Check if it's unread
                if 'UNREAD' in msg.get('labelIds', []):
                    return {
                        'hasReply': True,
                        'isUnread': True,
                        'messageId': msg['id']
                    }
                else:
                    return {
                        'hasReply': True,
                        'isUnread': False,
                        'messageId': msg['id']
                    }
        
        return {'hasReply': False, 'isUnread': False}
    except Exception as e:
        print(f"Error checking for replies: {e}")
        return {'hasReply': False, 'isUnread': False}


def get_gmail_service():
    """Get Gmail API service (legacy - uses token.pickle)"""
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
    """Get Gmail service using credentials from integrations subcollection"""
    try:
        db = get_db()
        if not user_email or not db:
            return None
        
        print(f"🔍 Getting Gmail service for user: {user_email}")
        
        # Find user ID
        users_ref = db.collection('users')
        query = users_ref.where(filter=FieldFilter('email', '==', user_email)).limit(1)
        
        user_id = None
        for doc in query.stream():
            user_id = doc.id
            break
        
        if not user_id:
            print(f"❌ No user found")
            return None
        
        # Use the existing _load_user_gmail_creds function
        creds = _load_user_gmail_creds(user_id)
        
        if not creds:
            print(f"❌ No credentials")
            return None
        
        service = build('gmail', 'v1', credentials=creds)
        print(f"✅ Gmail service created successfully")
        return service
        
    except Exception as e:
        print(f"❌ Error: {e}")
        return None


def create_gmail_draft_for_user(contact, email_subject, email_body, tier='free', user_email=None, resume_url=None, user_info=None):
    """Create Gmail draft in the user's account with optional resume attachment and HTML formatting"""
    from email.mime.multipart import MIMEMultipart
    from email.mime.text import MIMEText
    from email.mime.base import MIMEBase
    from email import encoders
    
    # Import clean_email_text from utils (will be created)
    from app.utils.contact import clean_email_text
    
    try:
        # Clean the email subject and body FIRST
        email_subject = clean_email_text(email_subject)
        email_body = clean_email_text(email_body)
        
        gmail_service = get_gmail_service_for_user(user_email)
        if not gmail_service:
            print(f"Gmail unavailable for {user_email} - creating mock draft")
            return f"mock_{tier}_draft_{contact.get('FirstName', 'unknown').lower()}_user_{user_email}"
        
        print(f"Creating {tier.capitalize()} Gmail draft for {user_email} -> {contact.get('FirstName', 'Unknown')}")
        if resume_url:
            print(f"   With resume attachment")
        
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
        
        # Create multipart message
        message = MIMEMultipart('mixed')
        message['to'] = recipient_email
        message['subject'] = email_subject
        safe_from = user_email or os.getenv("DEFAULT_FROM_EMAIL", "noreply@offerloop.ai")
        message['from'] = safe_from
        
        # Add body (HTML if user_info provided, plain text otherwise)
        if user_info:
            # Create HTML email with professional signature
            user_name = user_info.get('name', '[Your Name]')
            user_email_addr = user_info.get('email', '')
            user_phone = user_info.get('phone', '')
            user_linkedin = user_info.get('linkedin', '')
            
            # Build contact signature FIRST
            contact_parts = []
            if user_email_addr:
                contact_parts.append(f'<a href="mailto:{user_email_addr}" style="color: #2563eb; text-decoration: none;">{user_email_addr}</a>')
            if user_phone:
                contact_parts.append(f'<span>{user_phone}</span>')
            if user_linkedin:
                linkedin_clean = user_linkedin.replace('https://', '').replace('http://', '').replace('www.', '')
                contact_parts.append(f'<a href="{user_linkedin}" style="color: #2563eb; text-decoration: none;">{linkedin_clean}</a>')
            
            contact_html = ' · '.join(contact_parts) if contact_parts else ''
            
            # Convert line breaks to <br> tags for Gmail
            email_body = email_body.strip()
            email_body_html = email_body.replace('\n\n', '<br><br>').replace('\n', '<br>')
            
            # Simple HTML wrapper
            html_content = f"""<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
* {{ margin: 0 !important; padding: 0 !important; text-indent: 0 !important; }}
</style>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
             line-height: 1.6; color: #1f2937; margin-left: -8px !important;">
<div style="white-space: pre-wrap; margin: 0 !important; padding: 0 !important;">
{email_body_html}
</div>
</body>
</html>"""
            message.attach(MIMEText(html_content, 'html', 'utf-8'))
        else:
            # Plain text fallback
            message.attach(MIMEText(email_body, 'plain', 'utf-8'))
        
        # Attach resume if available
        if resume_url:
            try:
                print(f"📎 Downloading resume from {resume_url}")
                response = requests.get(resume_url, timeout=10)
                response.raise_for_status()
                
                # Get filename from URL or headers
                filename = "resume.pdf"
                if 'Content-Disposition' in response.headers:
                    content_disp = response.headers['Content-Disposition']
                    if 'filename=' in content_disp:
                        filename = content_disp.split('filename=')[1].strip('"')
                else:
                    # Try to extract from URL
                    for part in reversed(resume_url.split('/')):
                        if '.pdf' in part.lower() or '.docx' in part.lower():
                            filename = part.split('?')[0]
                            break
                
                resume_content = response.content
                print(f"✅ Downloaded: {filename} ({len(resume_content)} bytes)")
                
                # Attach resume to email
                attachment = MIMEBase('application', 'octet-stream')
                attachment.set_payload(resume_content)
                encoders.encode_base64(attachment)
                attachment.add_header('Content-Disposition', f'attachment; filename="{filename}"')
                message.attach(attachment)
                print(f"✅ Resume attached successfully")
                
            except Exception as resume_error:
                print(f"⚠️ Could not attach resume: {resume_error}")
                # Continue without resume - don't fail the entire draft
        
        # Create the draft
        raw_message = base64.urlsafe_b64encode(message.as_bytes()).decode('utf-8')
        
        draft_body = {
            'message': {
                'raw': raw_message
            }
        }
        
        draft_result = gmail_service.users().drafts().create(userId='me', body=draft_body).execute()
        draft_id = draft_result['id']
        
        print(f"✅ Created {tier.capitalize()} Gmail draft {draft_id} in {user_email}'s account")
        
        return draft_id
        
    except Exception as e:
        print(f"{tier.capitalize()} Gmail draft creation failed for {user_email}: {e}")
        import traceback
        traceback.print_exc()
        return f"mock_{tier}_draft_{contact.get('FirstName', 'unknown').lower()}_user_{user_email}"

