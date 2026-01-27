"""
Cover Letter Workshop API endpoints - dedicated routes for cover letter generation.
"""
from __future__ import annotations

import logging
import json
import uuid
import base64
from datetime import datetime
from typing import Dict, Any, List, Optional

from flask import Blueprint, jsonify, request

from app.extensions import require_firebase_auth, get_db
from app.services.openai_client import get_async_openai_client
from app.services.pdf_builder import generate_cover_letter_pdf
from app.utils.async_runner import run_async

logger = logging.getLogger('cover_letter_workshop')

cover_letter_workshop_bp = Blueprint("cover_letter_workshop", __name__, url_prefix="/api/cover-letter")


# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

def _fetch_user_resume_data(user_id: str) -> Dict[str, Any]:
    """
    Fetch user's resume data from Firestore.
    Checks multiple possible locations for resume text to handle any inconsistencies.
    """
    db = get_db()
    if not db:
        logger.error(f"[CoverLetterWorkshop] Database not available")
        raise ValueError("Database not available")
    
    logger.info(f"[CoverLetterWorkshop] Fetching resume data for user {user_id[:8]}...")
    
    user_doc = db.collection('users').document(user_id).get()
    if not user_doc.exists:
        logger.error(f"[CoverLetterWorkshop] User {user_id[:8]}... not found")
        raise ValueError("User not found")
    
    user_data = user_doc.to_dict()
    
    # Check multiple possible locations for resume text
    resume_text = None
    source = None
    
    # Priority 1: originalResumeText (guaranteed to be the original uploaded resume)
    if user_data.get('originalResumeText'):
        resume_text = user_data['originalResumeText']
        source = 'originalResumeText'
        logger.info(f"[CoverLetterWorkshop] ✅ Found resume at originalResumeText ({len(resume_text)} chars)")
    
    # Priority 2: resumeText (main field)
    elif user_data.get('resumeText'):
        resume_text = user_data['resumeText']
        source = 'resumeText'
        logger.info(f"[CoverLetterWorkshop] ✅ Found resume at resumeText ({len(resume_text)} chars)")
    
    # Priority 3: rawText (alternative field name)
    elif user_data.get('rawText'):
        resume_text = user_data['rawText']
        source = 'rawText'
        logger.info(f"[CoverLetterWorkshop] ✅ Found resume at rawText ({len(resume_text)} chars)")
    
    # Priority 4: Check nested in profile object
    elif user_data.get('profile', {}).get('resumeText'):
        resume_text = user_data['profile']['resumeText']
        source = 'profile.resumeText'
        logger.info(f"[CoverLetterWorkshop] ✅ Found resume at profile.resumeText ({len(resume_text)} chars)")
    
    # Priority 5: Check resumeParsed for text
    elif user_data.get('resumeParsed', {}).get('rawText'):
        resume_text = user_data['resumeParsed']['rawText']
        source = 'resumeParsed.rawText'
        logger.info(f"[CoverLetterWorkshop] ✅ Found resume at resumeParsed.rawText ({len(resume_text)} chars)")
    
    else:
        logger.warning(f"[CoverLetterWorkshop] ❌ No resume text found for user {user_id[:8]}...")
    
    return {
        'resume_text': resume_text or '',
        'resume_parsed': user_data.get('resumeParsed') or user_data.get('originalResumeParsed') or {},
        'name': user_data.get('name') or user_data.get('displayName') or '',
        'email': user_data.get('email', ''),
        'source': source,
    }


def _deduct_credits(user_id: str, amount: int) -> int:
    """Deduct credits from user and return new balance."""
    db = get_db()
    if not db:
        raise ValueError("Database not available")
    
    user_ref = db.collection('users').document(user_id)
    user_doc = user_ref.get()
    
    if not user_doc.exists:
        raise ValueError("User not found")
    
    user_data = user_doc.to_dict()
    current_credits = user_data.get('credits', 0)
    
    if current_credits < amount:
        raise ValueError(f"Insufficient credits. You have {current_credits} credits but need {amount}.")
    
    new_credits = current_credits - amount
    user_ref.update({'credits': new_credits})
    
    logger.info(f"[CoverLetterWorkshop] Deducted {amount} credits from user {user_id[:8]}... New balance: {new_credits}")
    return new_credits


async def _parse_job_url(job_url: str) -> Optional[Dict[str, Any]]:
    """Try to parse job details from a URL."""
    try:
        from app.services.interview_prep.job_posting_parser import fetch_job_posting
        
        # fetch_job_posting returns (text_content, metadata)
        content, metadata = await fetch_job_posting(job_url)
        
        if not content:
            return None
        
        # If metadata already has good info, use it directly
        if metadata.get('job_title') and metadata.get('company_name'):
            return {
                "job_title": str(metadata.get('job_title', '') or ''),
                "company": str(metadata.get('company_name', '') or ''),
                "location": str(metadata.get('location', '') or ''),
                "job_description": str(metadata.get('description', content[:3000]) or '')
            }
        
        # Otherwise, use GPT to extract structured job info
        openai_client = get_async_openai_client()
        if not openai_client:
            return None
        
        prompt = f"""Extract job information from this content. Return JSON only.

Content:
{content[:6000]}

Return JSON:
{{
    "job_title": "...",
    "company": "...",
    "location": "...",
    "job_description": "..."
}}"""

        response = await openai_client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            temperature=0,
            response_format={"type": "json_object"}
        )
        
        result = json.loads(response.choices[0].message.content)
        # Ensure all values are strings
        return {
            "job_title": str(result.get('job_title', '') or ''),
            "company": str(result.get('company', '') or ''),
            "location": str(result.get('location', '') or ''),
            "job_description": str(result.get('job_description', '') or '')
        }
        
    except Exception as e:
        logger.warning(f"[CoverLetterWorkshop] Job URL parsing failed: {e}")
        return None


async def _generate_cover_letter(
    resume_text: str,
    resume_parsed: Dict,
    user_name: str,
    job_title: str,
    company: str,
    location: str,
    job_description: str,
) -> str:
    """Generate a cover letter using GPT."""
    openai_client = get_async_openai_client()
    if not openai_client:
        raise ValueError("OpenAI client not available")
    
    # Ensure all string inputs are actually strings
    resume_text = str(resume_text) if resume_text else ""
    user_name = str(user_name) if user_name else ""
    job_title = str(job_title) if job_title else ""
    company = str(company) if company else ""
    location = str(location) if location else ""
    job_description = str(job_description) if job_description else ""
    
    # Extract key info from resume
    experience_summary = ""
    skills = []
    
    if resume_parsed:
        # Extract experience
        experience = resume_parsed.get('experience', [])
        if experience:
            experience_summary = "\n".join([
                f"- {exp.get('title', '')} at {exp.get('company', '')} ({exp.get('duration', '')})"
                for exp in experience[:3]
            ])
        
        # Extract skills
        skills = resume_parsed.get('skills', []) or []
        if isinstance(skills, list):
            skills = skills[:10]
    
    prompt = f"""Generate a professional cover letter for the following job application.

APPLICANT INFORMATION:
Name: {user_name or 'Applicant'}
Experience:
{experience_summary or 'See resume'}
Key Skills: {', '.join(skills) if skills else 'See resume'}

Resume Text:
{resume_text[:3000]}

JOB DETAILS:
Position: {job_title}
Company: {company}
Location: {location}

Job Description:
{job_description[:2500]}

INSTRUCTIONS:
1. Write a compelling, personalized cover letter
2. Highlight relevant experience and skills that match the job requirements
3. Show enthusiasm for the role and company
4. Keep it professional but conversational
5. Include a clear call to action
6. Keep it to 3-4 paragraphs (about 300-400 words)
7. Do NOT include placeholders like [Your Name] - use the actual name provided
8. Start with "Dear Hiring Manager," or appropriate greeting

Generate the cover letter text only, no additional commentary."""

    response = await openai_client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.7,
        max_tokens=1500,
        timeout=60.0,  # Add explicit timeout for the API call
    )
    
    cover_letter_text = response.choices[0].message.content.strip()
    
    # Add signature if name is provided
    if user_name and user_name not in cover_letter_text[-100:]:
        cover_letter_text += f"\n\nSincerely,\n{user_name}"
    
    return cover_letter_text


def _save_to_library(
    user_id: str,
    job_title: str,
    company: str,
    location: str,
    cover_letter_text: str,
    pdf_base64: str,
) -> str:
    """Save generated cover letter to user's library."""
    db = get_db()
    if not db:
        raise ValueError("Database not available")
    
    entry_id = str(uuid.uuid4())
    display_name = f"{job_title.replace(' ', '_')}_cover_letter"
    
    entry_data = {
        'id': entry_id,
        'display_name': display_name,
        'job_title': job_title,
        'company': company,
        'location': location,
        'cover_letter_text': cover_letter_text,
        'pdf_base64': pdf_base64,
        'created_at': datetime.utcnow().isoformat(),
    }
    
    # Save to user's cover_letter_library subcollection
    db.collection('users').document(user_id).collection('cover_letter_library').document(entry_id).set(entry_data)
    
    logger.info(f"[CoverLetterWorkshop] Saved cover letter to library: {entry_id[:8]}... for user {user_id[:8]}...")
    return entry_id


# ============================================================================
# ROUTES
# ============================================================================

@cover_letter_workshop_bp.route("/generate", methods=["POST"])
@require_firebase_auth
def generate():
    """
    Generate a cover letter based on job context.
    
    Request body:
    {
        "job_url": "...",  // Optional
        "job_title": "...",  // Required if no job_url
        "company": "...",
        "location": "...",
        "job_description": "..."
    }
    
    Response:
    {
        "status": "ok",
        "cover_letter_text": "...",
        "pdf_base64": "...",
        "library_entry_id": "...",
        "parsed_job": {...},  // If job_url was parsed
        "credits_remaining": ...
    }
    """
    user_id = request.firebase_user.get('uid') if hasattr(request, 'firebase_user') else None
    if not user_id:
        return jsonify({
            "status": "error",
            "message": "User not authenticated"
        }), 401
    
    payload = request.get_json(force=True, silent=True) or {}
    job_url = payload.get('job_url', '').strip()
    job_title = payload.get('job_title', '').strip()
    company = payload.get('company', '').strip()
    location = payload.get('location', '').strip()
    job_description = payload.get('job_description', '').strip()
    
    parsed_job = None
    
    try:
        # If job URL provided, try to parse it
        if job_url:
            parsed_job = run_async(_parse_job_url(job_url), timeout=30.0)
            if parsed_job:
                # Ensure all values are strings
                job_title = job_title or str(parsed_job.get('job_title', '') or '')
                company = company or str(parsed_job.get('company', '') or '')
                location = location or str(parsed_job.get('location', '') or '')
                parsed_desc = parsed_job.get('job_description', '')
                job_description = job_description or str(parsed_desc if parsed_desc else '')
        
        # Ensure job_description is a string (it might be a dict or other type)
        job_description = str(job_description) if job_description else ''
        job_title = str(job_title) if job_title else ''
        company = str(company) if company else ''
        location = str(location) if location else ''
        
        # Validate required fields - only job_description is required
        if not job_description or not job_description.strip():
            return jsonify({
                "status": "error",
                "message": "Job description is required.",
                "parsed_job": parsed_job,
            }), 400
        
        # Fetch user resume data
        user_data = _fetch_user_resume_data(user_id)
        resume_text = user_data['resume_text']
        
        if not resume_text:
            return jsonify({
                "status": "error",
                "message": "Please upload your resume in Account Settings first.",
                "error_code": "no_resume"
            }), 400
        
        # Deduct credits
        try:
            credits_remaining = _deduct_credits(user_id, 5)
        except ValueError as e:
            return jsonify({
                "status": "error",
                "message": str(e),
                "error_code": "insufficient_credits"
            }), 402
        
        # Generate cover letter
        cover_letter_text = run_async(
            _generate_cover_letter(
                resume_text=resume_text,
                resume_parsed=user_data['resume_parsed'],
                user_name=user_data['name'],
                job_title=job_title,
                company=company,
                location=location,
                job_description=job_description,
            ),
            timeout=90.0  # Increased from 60 to handle complex generations
        )
        
        # Generate PDF
        try:
            pdf_buffer = generate_cover_letter_pdf(cover_letter_text)
            if not pdf_buffer:
                raise ValueError("PDF buffer generation returned None")
            pdf_bytes = pdf_buffer.read()
            if not pdf_bytes:
                raise ValueError("PDF buffer is empty")
            pdf_base64 = base64.b64encode(pdf_bytes).decode('utf-8')
        except Exception as pdf_error:
            logger.error(f"[CoverLetterWorkshop] PDF generation failed: {pdf_error}")
            # Continue without PDF - we can still return the text
            pdf_base64 = ""
        
        # Save to library
        try:
            library_entry_id = _save_to_library(
                user_id=user_id,
                job_title=job_title,
                company=company,
                location=location,
                cover_letter_text=cover_letter_text,
                pdf_base64=pdf_base64,
            )
        except Exception as save_error:
            logger.error(f"[CoverLetterWorkshop] Failed to save to library: {save_error}")
            # Continue without saving to library - we can still return the cover letter
            library_entry_id = None
        
        return jsonify({
            "status": "ok",
            "cover_letter_text": cover_letter_text,
            "pdf_base64": pdf_base64,
            "library_entry_id": library_entry_id,
            "parsed_job": parsed_job,
            "job_context": {
                "job_title": job_title,
                "company": company,
                "location": location,
            },
            "credits_remaining": credits_remaining,
        })
        
    except TimeoutError:
        logger.error(f"[CoverLetterWorkshop] Generation timed out for user {user_id[:8]}...")
        return jsonify({
            "status": "error",
            "message": "Cover letter generation timed out. Please try again."
        }), 504
    except ValueError as e:
        logger.warning(f"[CoverLetterWorkshop] Validation error: {e}")
        return jsonify({
            "status": "error",
            "message": str(e)
        }), 400
    except Exception as e:
        error_type = type(e).__name__
        error_message = str(e)
        logger.error(f"[CoverLetterWorkshop] Generation failed for user {user_id[:8]}...: {error_type}: {error_message}")
        import traceback
        traceback_str = traceback.format_exc()
        logger.error(f"[CoverLetterWorkshop] Traceback: {traceback_str}")
        
        # Provide more specific error messages based on error type
        if "OpenAI" in error_type or "openai" in error_message.lower() or "api" in error_message.lower():
            user_message = "OpenAI API error. Please try again in a moment."
        elif "timeout" in error_message.lower():
            user_message = "Request timed out. Please try again."
        elif "database" in error_message.lower() or "firestore" in error_message.lower():
            user_message = "Database error. Please try again."
        elif "credits" in error_message.lower():
            user_message = error_message  # Use original message for credit errors
        else:
            user_message = f"Failed to generate cover letter: {error_message[:200]}"
        
        return jsonify({
            "status": "error",
            "message": user_message,
            "error_type": error_type,
        }), 500


@cover_letter_workshop_bp.route("/library", methods=["GET"])
@require_firebase_auth
def get_library():
    """
    Get user's cover letter library entries.
    
    Response:
    {
        "status": "ok",
        "entries": [
            {
                "id": "...",
                "display_name": "...",
                "job_title": "...",
                "company": "...",
                "location": "...",
                "created_at": "..."
            }
        ]
    }
    """
    user_id = request.firebase_user.get('uid') if hasattr(request, 'firebase_user') else None
    if not user_id:
        return jsonify({
            "status": "error",
            "message": "User not authenticated"
        }), 401
    
    try:
        db = get_db()
        if not db:
            raise ValueError("Database not available")
        
        # Fetch library entries
        entries_ref = db.collection('users').document(user_id).collection('cover_letter_library')
        entries_docs = entries_ref.order_by('created_at', direction='DESCENDING').stream()
        
        entries = []
        for doc in entries_docs:
            data = doc.to_dict()
            # Return summary without full PDF
            entries.append({
                'id': data.get('id', doc.id),
                'display_name': data.get('display_name', ''),
                'job_title': data.get('job_title', ''),
                'company': data.get('company', ''),
                'location': data.get('location', ''),
                'created_at': data.get('created_at', ''),
            })
        
        return jsonify({
            "status": "ok",
            "entries": entries,
        })
        
    except Exception as e:
        logger.error(f"[CoverLetterWorkshop] Failed to fetch library for user {user_id[:8]}...: {e}")
        return jsonify({
            "status": "error",
            "message": f"Failed to fetch library: {str(e)}"
        }), 500


@cover_letter_workshop_bp.route("/library/<entry_id>", methods=["GET"])
@require_firebase_auth
def get_library_entry(entry_id: str):
    """
    Get a specific library entry with full PDF.
    
    Response:
    {
        "status": "ok",
        "entry": {
            "id": "...",
            "display_name": "...",
            "job_title": "...",
            "company": "...",
            "location": "...",
            "created_at": "...",
            "cover_letter_text": "...",
            "pdf_base64": "..."
        }
    }
    """
    user_id = request.firebase_user.get('uid') if hasattr(request, 'firebase_user') else None
    if not user_id:
        return jsonify({
            "status": "error",
            "message": "User not authenticated"
        }), 401
    
    try:
        db = get_db()
        if not db:
            raise ValueError("Database not available")
        
        # Fetch the entry
        entry_doc = db.collection('users').document(user_id).collection('cover_letter_library').document(entry_id).get()
        
        if not entry_doc.exists:
            return jsonify({
                "status": "error",
                "message": "Entry not found"
            }), 404
        
        data = entry_doc.to_dict()
        
        return jsonify({
            "status": "ok",
            "entry": {
                'id': data.get('id', entry_doc.id),
                'display_name': data.get('display_name', ''),
                'job_title': data.get('job_title', ''),
                'company': data.get('company', ''),
                'location': data.get('location', ''),
                'created_at': data.get('created_at', ''),
                'cover_letter_text': data.get('cover_letter_text', ''),
                'pdf_base64': data.get('pdf_base64', ''),
            }
        })
        
    except Exception as e:
        logger.error(f"[CoverLetterWorkshop] Failed to fetch entry {entry_id[:8]}... for user {user_id[:8]}...: {e}")
        return jsonify({
            "status": "error",
            "message": f"Failed to fetch entry: {str(e)}"
        }), 500


@cover_letter_workshop_bp.route("/library/<entry_id>", methods=["DELETE"])
@require_firebase_auth
def delete_library_entry(entry_id: str):
    """
    Delete a library entry.
    """
    user_id = request.firebase_user.get('uid') if hasattr(request, 'firebase_user') else None
    if not user_id:
        return jsonify({
            "status": "error",
            "message": "User not authenticated"
        }), 401
    
    try:
        db = get_db()
        if not db:
            raise ValueError("Database not available")
        
        # Delete the entry
        db.collection('users').document(user_id).collection('cover_letter_library').document(entry_id).delete()
        
        logger.info(f"[CoverLetterWorkshop] Deleted entry {entry_id[:8]}... for user {user_id[:8]}...")
        
        return jsonify({
            "status": "ok",
            "message": "Entry deleted"
        })
        
    except Exception as e:
        logger.error(f"[CoverLetterWorkshop] Failed to delete entry {entry_id[:8]}... for user {user_id[:8]}...: {e}")
        return jsonify({
            "status": "error",
            "message": f"Failed to delete entry: {str(e)}"
        }), 500


@cover_letter_workshop_bp.route("/health", methods=["GET"])
def health():
    """Health check endpoint."""
    return jsonify({"status": "ok", "service": "cover_letter_workshop"})
