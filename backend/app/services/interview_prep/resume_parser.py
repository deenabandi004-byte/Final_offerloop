"""
Resume parser helper for Interview Prep - extracts user profile from uploaded resume
"""
import json
from typing import Dict, Optional
from firebase_admin import storage, firestore
from app.services.openai_client import get_openai_client
import PyPDF2
from io import BytesIO
import logging

logger = logging.getLogger(__name__)


def get_user_resume_text(user_id: str) -> Optional[str]:
    """
    Fetch user's resume from Firebase Storage and extract text.
    Returns None if no resume found.
    """
    try:
        bucket = storage.bucket()
        # Check common resume paths
        possible_paths = [
            f"resumes/{user_id}/resume.pdf",
            f"resumes/{user_id}.pdf",
            f"users/{user_id}/resume.pdf",
            f"resumes/{user_id}/main.pdf",
        ]
        
        for path in possible_paths:
            blob = bucket.blob(path)
            if blob.exists():
                logger.info(f"Found resume at: {path}")
                # Download and extract text
                pdf_bytes = blob.download_as_bytes()
                return extract_text_from_pdf_bytes(pdf_bytes)
        
        logger.info(f"No resume found in storage for user {user_id}")
        return None
    except Exception as e:
        logger.error(f"Error fetching resume: {e}")
        return None


def extract_text_from_pdf_bytes(pdf_bytes: bytes) -> str:
    """Extract text from PDF bytes using PyPDF2."""
    try:
        pdf_reader = PyPDF2.PdfReader(BytesIO(pdf_bytes))
        text = ""
        
        for page in pdf_reader.pages:
            page_text = page.extract_text()
            if page_text:
                # Clean and encode properly
                cleaned_text = ''.join(char for char in page_text if char.isprintable() or char.isspace())
                cleaned_text = cleaned_text.encode('utf-8', errors='ignore').decode('utf-8')
                text += cleaned_text + "\n"
        
        # Final cleanup
        text = ' '.join(text.split())
        return text.strip() if text.strip() else ""
    except Exception as e:
        logger.error(f"PDF text extraction failed: {e}")
        return ""


def parse_resume_to_profile(resume_text: str) -> Dict:
    """
    Use OpenAI to extract structured profile data from resume text.
    """
    client = get_openai_client()
    if not client:
        logger.warning("OpenAI client not available")
        return {}
    
    prompt = f"""Extract structured profile data from this resume. 
Return a JSON object with these fields:
- name: string
- email: string (if found)
- school: string (most recent)
- graduation_year: string
- major: string
- skills: array of strings (technical skills)
- experience: array of {{title, company, description, dates, metrics}}
- projects: array of {{name, description, technologies, metrics}}
- achievements: array of strings

For metrics, extract any quantified results (e.g., "increased by 50%", "113 users", "$1K MRR").
If a field is not found, use null.

Resume text:
{resume_text[:8000]}  # Limit to avoid token limits
"""
    
    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "system",
                    "content": "You are a resume parser. Extract structured data from resume text. Always return valid JSON."
                },
                {"role": "user", "content": prompt}
            ],
            response_format={"type": "json_object"},
            max_tokens=2000,
        )
        
        result = json.loads(response.choices[0].message.content)
        return result
    except Exception as e:
        logger.error(f"Resume parsing failed: {e}")
        return {}


def get_user_profile(user_id: str) -> Dict:
    """
    Get user profile from resume or Firebase profile data.
    Returns structured profile or empty dict if nothing found.
    """
    # Try to get resume first
    resume_text = get_user_resume_text(user_id)
    
    if resume_text and len(resume_text) > 100:
        try:
            profile = parse_resume_to_profile(resume_text)
            if profile:
                profile["_source"] = "resume"
                logger.info(f"Extracted profile from resume for user {user_id}")
                return profile
        except Exception as e:
            logger.warning(f"Resume parsing failed: {e}")
    
    # Fallback: Try Firebase user profile
    try:
        db = firestore.client()
        user_doc = db.collection("users").document(user_id).get()
        
        if user_doc.exists:
            data = user_doc.to_dict()
            
            # Try to get parsed resume data
            resume_parsed = data.get("resumeParsed") or data.get("parsedResume")
            if resume_parsed:
                profile = {
                    "name": resume_parsed.get("name") or data.get("name") or data.get("displayName"),
                    "email": data.get("email"),
                    "school": resume_parsed.get("school") or resume_parsed.get("university") or data.get("school"),
                    "graduation_year": resume_parsed.get("graduationYear") or resume_parsed.get("year") or data.get("graduationYear"),
                    "major": resume_parsed.get("major") or data.get("major"),
                    "skills": resume_parsed.get("skills", []) or data.get("skills", []),
                    "experience": resume_parsed.get("experience", []) or resume_parsed.get("workExperience", []),
                    "projects": resume_parsed.get("projects", []),
                    "achievements": resume_parsed.get("achievements", []),
                    "_source": "firebase_resume_parsed",
                }
                return profile
            
            # Fallback to basic profile data
            profile = {
                "name": data.get("displayName") or data.get("name"),
                "email": data.get("email"),
                "school": data.get("school"),
                "skills": data.get("skills", []),
                "experience": data.get("experience", []),
                "projects": data.get("projects", []),
                "_source": "firebase",
            }
            return profile
    except Exception as e:
        logger.error(f"Firebase profile fetch failed: {e}")
    
    # Nothing found
    logger.info(f"No profile data found for user {user_id}")
    return {"_source": "none"}

