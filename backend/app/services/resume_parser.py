"""
Resume parser service - extract text from PDF and parse resume information
"""
import os
import tempfile
import PyPDF2
import re
from app.services.openai_client import get_openai_client


def extract_text_from_pdf(pdf_file):
    """Extract text from PDF using PyPDF2 with improved encoding handling"""
    try:
        print("Extracting text from PDF...")
        
        with tempfile.NamedTemporaryFile(delete=False, suffix='.pdf') as temp_file:
            pdf_file.save(temp_file.name)
            
            with open(temp_file.name, 'rb') as file:
                pdf_reader = PyPDF2.PdfReader(file)
                text = ""
                
                for page in pdf_reader.pages:
                    page_text = page.extract_text()
                    # Clean and encode the text properly
                    if page_text:
                        # Remove non-printable characters and fix encoding issues
                        cleaned_text = ''.join(char for char in page_text if char.isprintable() or char.isspace())
                        # Normalize unicode characters
                        cleaned_text = cleaned_text.encode('utf-8', errors='ignore').decode('utf-8')
                        text += cleaned_text + "\n"
            
            os.unlink(temp_file.name)
            
            # Final cleanup - remove extra whitespace and normalize
            text = ' '.join(text.split())
            
            print(f"Extracted {len(text)} characters from PDF")
            return text.strip() if text.strip() else None
            
    except Exception as e:
        print(f"PDF text extraction failed: {e}")
        return None


def extract_user_info_from_resume_priority(resume_text, profile):
    """
    Extract user info prioritizing resume text, falling back to profile.
    This is the main function used by email generation.
    """
    # Import here to avoid circular dependencies
    from app.utils.users import parse_resume_info, extract_comprehensive_user_info
    
    user_info = {}
    
    # Priority 1: Try to extract from resume if available
    if resume_text and len(resume_text.strip()) > 50:
        try:
            parsed = parse_resume_info(resume_text)
            if parsed:
                user_info.update(parsed)
        except Exception as e:
            print(f"Resume parsing failed: {e}")
    
    # Priority 2: Fallback to profile if resume didn't provide enough info
    if profile:
        if not user_info.get('name'):
            user_info['name'] = profile.get('name') or f"{profile.get('firstName', '')} {profile.get('lastName', '')}".strip()
        if not user_info.get('year'):
            user_info['year'] = profile.get('year') or profile.get('graduationYear') or ""
        if not user_info.get('major'):
            user_info['major'] = profile.get('major') or profile.get('fieldOfStudy') or ""
        if not user_info.get('university'):
            user_info['university'] = profile.get('university') or ""
    
    return user_info

