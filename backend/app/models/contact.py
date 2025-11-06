"""
Contact data models and normalization
"""
from datetime import date


def normalize_contact(c: dict) -> dict:
    """Normalize contact data for storage"""
    today = date.today().strftime("%m/%d/%Y")
    return {
        'FirstName': c.get('FirstName', ''),
        'LastName': c.get('LastName', ''),
        'LinkedIn': c.get('LinkedIn', ''),
        'Email': c.get('Email', ''),
        'Title': c.get('Title', ''),
        'Company': c.get('Company', ''),
        'City': c.get('City', ''),
        'State': c.get('State', ''),
        'College': c.get('College', ''),
        'Phone': c.get('Phone', ''),
        'PersonalEmail': c.get('PersonalEmail', ''),
        'WorkEmail': c.get('WorkEmail', ''),
        'SocialProfiles': c.get('SocialProfiles', ''),
        'EducationTop': c.get('EducationTop', ''),
        'VolunteerHistory': c.get('VolunteerHistory', ''),
        'WorkSummary': c.get('WorkSummary', ''),
        'Group': c.get('Group', ''),
        'Hometown': c.get('Hometown', ''),
        'Similarity': c.get('Similarity', ''),
        'Status': c.get('Status', 'Not Contacted'),
        'FirstContactDate': c.get('FirstContactDate', today),
        'LastContactDate': c.get('LastContactDate', today),
    }

