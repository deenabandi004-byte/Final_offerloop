"""
Contact import routes - Upload CSV/Excel to import contacts
"""
import csv
import io
from datetime import datetime
from flask import Blueprint, request, jsonify, Response

from ..extensions import require_firebase_auth
from ..extensions import get_db
from app.utils.exceptions import OfferloopException, ValidationError

contact_import_bp = Blueprint('contact_import', __name__, url_prefix='/api/contacts')

# Cost per imported contact
CREDITS_PER_CONTACT = 15

# Column mapping - maps common CSV header variations to our schema
COLUMN_MAPPINGS = {
    'firstName': ['firstname', 'first_name', 'first name', 'fname', 'given name'],
    'lastName': ['lastname', 'last_name', 'last name', 'lname', 'surname', 'family name'],
    'email': ['email', 'email address', 'e-mail', 'mail', 'work email', 'personal email'],
    'linkedinUrl': ['linkedin', 'linkedinurl', 'linkedin_url', 'linkedin url', 'linkedin profile', 'profile url'],
    'company': ['company', 'company name', 'organization', 'employer', 'firm', 'workplace'],
    'jobTitle': ['jobtitle', 'job_title', 'job title', 'title', 'role', 'position'],
    'college': ['college', 'university', 'school', 'education', 'alma mater'],
    'location': ['location', 'city', 'address', 'city, state', 'city/state'],
    'city': ['city'],
    'state': ['state', 'province', 'region'],
    'phone': ['phone', 'phone number', 'mobile', 'cell', 'telephone'],
}


def normalize_header(header: str) -> str:
    """Normalize a header string for matching"""
    return header.lower().strip().replace('-', ' ').replace('_', ' ')


def map_columns(headers: list) -> dict:
    """
    Map CSV headers to our schema fields.
    Returns a dict of {csv_index: our_field_name}
    """
    mapping = {}
    normalized_headers = [normalize_header(h) for h in headers]
    
    for our_field, variations in COLUMN_MAPPINGS.items():
        for idx, header in enumerate(normalized_headers):
            if header in variations or header == our_field.lower():
                mapping[idx] = our_field
                break
    
    return mapping


def parse_csv_content(file_content: str) -> tuple:
    """Parse CSV content and return headers and rows"""
    reader = csv.reader(io.StringIO(file_content))
    rows = list(reader)
    
    if not rows:
        raise ValidationError("CSV file is empty", field="file")
    
    headers = rows[0]
    data_rows = rows[1:]
    
    return headers, data_rows


def parse_row_to_contact(row: list, column_mapping: dict, headers: list) -> dict:
    """Convert a CSV row to a contact dict using the column mapping"""
    contact = {}
    
    for idx, value in enumerate(row):
        if idx in column_mapping:
            field = column_mapping[idx]
            contact[field] = value.strip() if value else ''
    
    # Handle city + state -> location
    if 'city' in contact or 'state' in contact:
        city = contact.pop('city', '')
        state = contact.pop('state', '')
        if not contact.get('location'):
            contact['location'] = ', '.join(filter(None, [city, state]))
    
    return contact


@contact_import_bp.route('/import/preview', methods=['POST'])
@require_firebase_auth
def preview_import():
    """
    Preview CSV import - parse file and return column mapping suggestions.
    Does not deduct credits or save contacts.
    """
    try:
        db = get_db()
        user_id = request.firebase_user['uid']
        
        if not db:
            raise OfferloopException("Database not initialized", error_code="DATABASE_ERROR")
        
        # Check user tier - must be pro or above
        user_ref = db.collection('users').document(user_id)
        user_doc = user_ref.get()
        
        if not user_doc.exists:
            raise OfferloopException("User not found", error_code="USER_NOT_FOUND")
        
        user_data = user_doc.to_dict()
        tier = user_data.get('tier', 'free')
        
        # TODO: Re-enable tier restriction after testing
        # if tier == 'free':
        #     return jsonify({
        #         'error': 'Contact import is available for Pro and Elite users only',
        #         'upgrade_required': True
        #     }), 403
        
        # Get file from request
        if 'file' not in request.files:
            raise ValidationError("No file provided", field="file")
        
        file = request.files['file']
        
        if not file.filename:
            raise ValidationError("No file selected", field="file")
        
        # Check file extension
        filename = file.filename.lower()
        if not (filename.endswith('.csv') or filename.endswith('.xlsx') or filename.endswith('.xls')):
            raise ValidationError("File must be CSV or Excel (.csv, .xlsx, .xls)", field="file")
        
        # Parse file
        if filename.endswith('.csv'):
            file_content = file.read().decode('utf-8-sig')  # Handle BOM
            headers, data_rows = parse_csv_content(file_content)
        else:
            # Handle Excel files
            try:
                import openpyxl
                from io import BytesIO
                
                workbook = openpyxl.load_workbook(BytesIO(file.read()), read_only=True)
                sheet = workbook.active
                
                rows = list(sheet.iter_rows(values_only=True))
                if not rows:
                    raise ValidationError("Excel file is empty", field="file")
                
                headers = [str(h) if h else '' for h in rows[0]]
                data_rows = [[str(cell) if cell else '' for cell in row] for row in rows[1:]]
                
            except ImportError:
                raise OfferloopException(
                    "Excel support not available. Please upload a CSV file.",
                    error_code="EXCEL_NOT_SUPPORTED"
                )
        
        # Auto-detect column mappings
        column_mapping = map_columns(headers)
        
        # Get user's current credits
        credits = user_data.get('credits', 0)
        
        # Count valid rows (must have at least first name and last name, or email)
        valid_rows = []
        for row in data_rows:
            contact = parse_row_to_contact(row, column_mapping, headers)
            has_name = contact.get('firstName') and contact.get('lastName')
            has_email = contact.get('email')
            has_linkedin = contact.get('linkedinUrl')
            
            if has_name or has_email or has_linkedin:
                valid_rows.append(contact)
        
        # Calculate credit cost
        total_cost = len(valid_rows) * CREDITS_PER_CONTACT
        can_afford = credits >= total_cost
        max_affordable = credits // CREDITS_PER_CONTACT
        
        # Return preview with first 5 parsed contacts as sample
        return jsonify({
            'success': True,
            'headers': headers,
            'column_mapping': {str(k): v for k, v in column_mapping.items()},
            'unmapped_headers': [h for idx, h in enumerate(headers) if idx not in column_mapping],
            'total_rows': len(data_rows),
            'valid_rows': len(valid_rows),
            'sample_contacts': valid_rows[:5],
            'credits': {
                'available': credits,
                'cost_per_contact': CREDITS_PER_CONTACT,
                'total_cost': total_cost,
                'can_afford': can_afford,
                'max_affordable': max_affordable
            }
        })
        
    except ValidationError as ve:
        return jsonify({'error': ve.message, 'field': getattr(ve, 'field', None)}), 400
    except OfferloopException as oe:
        return jsonify({'error': oe.message, 'error_code': oe.error_code}), 500
    except Exception as e:
        print(f"Error previewing import: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': f'Failed to preview import: {str(e)}'}), 500


@contact_import_bp.route('/import', methods=['POST'])
@require_firebase_auth
def import_contacts():
    """
    Import contacts from CSV/Excel file.
    Deducts 15 credits per contact imported.
    Skips duplicates (by email or LinkedIn URL).
    """
    try:
        db = get_db()
        user_id = request.firebase_user['uid']
        
        if not db:
            raise OfferloopException("Database not initialized", error_code="DATABASE_ERROR")
        
        # Check user tier - must be pro or above
        user_ref = db.collection('users').document(user_id)
        user_doc = user_ref.get()
        
        if not user_doc.exists:
            raise OfferloopException("User not found", error_code="USER_NOT_FOUND")
        
        user_data = user_doc.to_dict()
        tier = user_data.get('tier', 'free')
        
        # TODO: Re-enable tier restriction after testing
        # if tier == 'free':
        #     return jsonify({
        #         'error': 'Contact import is available for Pro and Elite users only',
        #         'upgrade_required': True
        #     }), 403
        
        # Get current credits
        credits = user_data.get('credits', 0)
        
        # Get file from request
        if 'file' not in request.files:
            raise ValidationError("No file provided", field="file")
        
        file = request.files['file']
        
        if not file.filename:
            raise ValidationError("No file selected", field="file")
        
        # Check file extension
        filename = file.filename.lower()
        if not (filename.endswith('.csv') or filename.endswith('.xlsx') or filename.endswith('.xls')):
            raise ValidationError("File must be CSV or Excel (.csv, .xlsx, .xls)", field="file")
        
        # Get optional custom column mapping from request
        custom_mapping = request.form.get('column_mapping')
        if custom_mapping:
            import json
            custom_mapping = json.loads(custom_mapping)
            # Convert string keys back to int
            custom_mapping = {int(k): v for k, v in custom_mapping.items()}
        
        # Parse file
        if filename.endswith('.csv'):
            file_content = file.read().decode('utf-8-sig')
            headers, data_rows = parse_csv_content(file_content)
        else:
            try:
                import openpyxl
                from io import BytesIO
                
                workbook = openpyxl.load_workbook(BytesIO(file.read()), read_only=True)
                sheet = workbook.active
                
                rows = list(sheet.iter_rows(values_only=True))
                if not rows:
                    raise ValidationError("Excel file is empty", field="file")
                
                headers = [str(h) if h else '' for h in rows[0]]
                data_rows = [[str(cell) if cell else '' for cell in row] for row in rows[1:]]
                
            except ImportError:
                raise OfferloopException(
                    "Excel support not available. Please upload a CSV file.",
                    error_code="EXCEL_NOT_SUPPORTED"
                )
        
        # Use custom mapping or auto-detect
        column_mapping = custom_mapping if custom_mapping else map_columns(headers)
        
        contacts_ref = db.collection('users').document(user_id).collection('contacts')
        today = datetime.now().strftime('%m/%d/%Y')
        
        created = 0
        skipped_duplicate = 0
        skipped_invalid = 0
        skipped_no_credits = 0
        created_contacts = []
        
        for row in data_rows:
            # Parse row to contact
            contact_data = parse_row_to_contact(row, column_mapping, headers)
            
            first_name = contact_data.get('firstName', '').strip()
            last_name = contact_data.get('lastName', '').strip()
            email = contact_data.get('email', '').strip()
            linkedin = contact_data.get('linkedinUrl', '').strip()
            
            # Validate - must have name OR email OR linkedin
            has_name = first_name and last_name
            if not (has_name or email or linkedin):
                skipped_invalid += 1
                continue
            
            # Check credits before processing
            if credits < CREDITS_PER_CONTACT:
                skipped_no_credits += 1
                continue
            
            # Check for duplicates (same logic as existing bulk_create_contacts)
            is_duplicate = False
            
            if email:
                email_query = contacts_ref.where('email', '==', email).limit(1)
                if list(email_query.stream()):
                    is_duplicate = True
            
            if not is_duplicate and linkedin:
                linkedin_query = contacts_ref.where('linkedinUrl', '==', linkedin).limit(1)
                if list(linkedin_query.stream()):
                    is_duplicate = True
            
            if not is_duplicate and first_name and last_name and contact_data.get('company'):
                name_company_query = (contacts_ref
                    .where('firstName', '==', first_name)
                    .where('lastName', '==', last_name)
                    .where('company', '==', contact_data.get('company'))
                    .limit(1))
                if list(name_company_query.stream()):
                    is_duplicate = True
            
            if is_duplicate:
                skipped_duplicate += 1
                continue
            
            # Create contact (same schema as existing contacts)
            contact = {
                'firstName': first_name,
                'lastName': last_name,
                'email': email,
                'linkedinUrl': linkedin,
                'company': contact_data.get('company', ''),
                'jobTitle': contact_data.get('jobTitle', ''),
                'college': contact_data.get('college', ''),
                'location': contact_data.get('location', ''),
                'phone': contact_data.get('phone', ''),
                'firstContactDate': today,
                'status': 'Not Contacted',
                'lastContactDate': today,
                'userId': user_id,
                'createdAt': today,
                'importedAt': datetime.now().isoformat(),
                'importSource': 'spreadsheet'
            }
            
            doc_ref = contacts_ref.add(contact)
            contact['id'] = doc_ref[1].id
            created_contacts.append(contact)
            created += 1
            
            # Deduct credits
            credits -= CREDITS_PER_CONTACT
        
        # Update user's credits in database
        if created > 0:
            user_ref.update({
                'credits': credits,
                'lastCreditUsage': datetime.now().isoformat()
            })
        
        return jsonify({
            'success': True,
            'created': created,
            'skipped': {
                'duplicate': skipped_duplicate,
                'invalid': skipped_invalid,
                'no_credits': skipped_no_credits,
                'total': skipped_duplicate + skipped_invalid + skipped_no_credits
            },
            'contacts': created_contacts,
            'credits': {
                'spent': created * CREDITS_PER_CONTACT,
                'remaining': credits
            }
        })
        
    except ValidationError as ve:
        return jsonify({'error': ve.message, 'field': getattr(ve, 'field', None)}), 400
    except OfferloopException as oe:
        return jsonify({'error': oe.message, 'error_code': oe.error_code}), 500
    except Exception as e:
        print(f"Error importing contacts: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': f'Failed to import contacts: {str(e)}'}), 500


@contact_import_bp.route('/import/template', methods=['GET'])
@require_firebase_auth
def download_template():
    """Download a CSV template for contact import"""
    headers = [
        'First Name',
        'Last Name', 
        'Email',
        'LinkedIn URL',
        'Company',
        'Job Title',
        'College',
        'Location',
        'Phone'
    ]
    
    sample_row = [
        'John',
        'Doe',
        'john.doe@example.com',
        'https://linkedin.com/in/johndoe',
        'Acme Corp',
        'Software Engineer',
        'MIT',
        'San Francisco, CA',
        '555-123-4567'
    ]
    
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(headers)
    writer.writerow(sample_row)
    
    return Response(
        output.getvalue(),
        mimetype='text/csv',
        headers={'Content-Disposition': 'attachment; filename=contact_import_template.csv'}
    )
