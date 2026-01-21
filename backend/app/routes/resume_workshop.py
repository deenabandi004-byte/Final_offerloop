"""
Resume Workshop API endpoints - dedicated routes for resume analysis and optimization.
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
from app.utils.async_runner import run_async

logger = logging.getLogger('resume_workshop')

resume_workshop_bp = Blueprint("resume_workshop", __name__, url_prefix="/api/resume-workshop")


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
        logger.error(f"[ResumeWorkshop] Database not available")
        raise ValueError("Database not available")
    
    logger.info(f"[ResumeWorkshop] Fetching resume data for user {user_id[:8]}...")
    
    user_doc = db.collection('users').document(user_id).get()
    if not user_doc.exists:
        logger.error(f"[ResumeWorkshop] User {user_id[:8]}... not found")
        raise ValueError("User not found")
    
    user_data = user_doc.to_dict()
    
    # Log available keys for debugging
    resume_related_keys = [k for k in user_data.keys() if 'resume' in k.lower() or 'text' in k.lower()]
    logger.info(f"[ResumeWorkshop] User data keys related to resume: {resume_related_keys}")
    
    # Check multiple possible locations for resume text
    resume_text = None
    source = None
    
    # Priority 1: originalResumeText (guaranteed to be the original uploaded resume)
    if user_data.get('originalResumeText'):
        resume_text = user_data['originalResumeText']
        source = 'originalResumeText'
        logger.info(f"[ResumeWorkshop] ✅ Found resume at originalResumeText ({len(resume_text)} chars)")
    
    # Priority 2: resumeText (main field)
    elif user_data.get('resumeText'):
        resume_text = user_data['resumeText']
        source = 'resumeText'
        logger.info(f"[ResumeWorkshop] ✅ Found resume at resumeText ({len(resume_text)} chars)")
    
    # Priority 3: rawText (alternative field name)
    elif user_data.get('rawText'):
        resume_text = user_data['rawText']
        source = 'rawText'
        logger.info(f"[ResumeWorkshop] ✅ Found resume at rawText ({len(resume_text)} chars)")
    
    # Priority 4: Check nested in profile object
    elif user_data.get('profile', {}).get('resumeText'):
        resume_text = user_data['profile']['resumeText']
        source = 'profile.resumeText'
        logger.info(f"[ResumeWorkshop] ✅ Found resume at profile.resumeText ({len(resume_text)} chars)")
    
    # Priority 5: Check resumeParsed for text
    elif user_data.get('resumeParsed', {}).get('rawText'):
        resume_text = user_data['resumeParsed']['rawText']
        source = 'resumeParsed.rawText'
        logger.info(f"[ResumeWorkshop] ✅ Found resume at resumeParsed.rawText ({len(resume_text)} chars)")
    
    else:
        # Log what we found for debugging
        logger.warning(f"[ResumeWorkshop] ❌ No resume text found for user {user_id[:8]}...")
        logger.warning(f"[ResumeWorkshop] Available fields: resumeUrl={bool(user_data.get('resumeUrl'))}, "
                      f"resumeFileName={user_data.get('resumeFileName')}, "
                      f"resumeParsed={bool(user_data.get('resumeParsed'))}")
    
    result = {
        'resume_text': resume_text or '',
        'resume_url': user_data.get('resumeUrl') or user_data.get('originalResumeUrl'),
        'resume_parsed': user_data.get('resumeParsed') or user_data.get('originalResumeParsed') or {},
        'resume_file_name': user_data.get('resumeFileName'),
        'source': source,
    }
    
    logger.info(f"[ResumeWorkshop] Resume fetch result: source={source}, "
               f"text_length={len(result['resume_text'])}, "
               f"has_url={bool(result['resume_url'])}, "
               f"has_parsed={bool(result['resume_parsed'])}")
    
    return result


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
    
    logger.info(f"[ResumeWorkshop] Deducted {amount} credits from user {user_id[:8]}... New balance: {new_credits}")
    return new_credits


async def _parse_job_url(job_url: str) -> Optional[Dict[str, Any]]:
    """Try to parse job details from a URL."""
    try:
        from app.services.serp_client import fetch_job_posting_content
        
        content = await fetch_job_posting_content(job_url)
        if not content:
            return None
        
        # Use GPT to extract structured job info
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
    "job_description": "full description text"
}}"""

        response = await openai_client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "Extract job information. Return valid JSON only."},
                {"role": "user", "content": prompt}
            ],
            response_format={"type": "json_object"},
            temperature=0.1,
            max_tokens=2000
        )
        
        return json.loads(response.choices[0].message.content)
    except Exception as e:
        logger.warning(f"[ResumeWorkshop] Job URL parsing failed: {e}")
        return None


async def _fix_resume(resume_text: str, openai_client) -> Dict[str, Any]:
    """Fix resume without job context - improve formatting, clarity, bullets, impact."""
    
    prompt = f"""You are an expert resume editor. Improve this resume for:
1. Formatting and structure
2. Clarity and conciseness
3. Impact-focused bullet points (quantify achievements where possible)
4. Professional language
5. Grammar and punctuation

Do NOT tailor for any specific job - make general improvements that would help for any role.

## RESUME
{resume_text[:10000]}

Return the COMPLETE improved resume text. Keep all sections and content, just improve how it's written.
Return only the resume text, no explanations or JSON."""

    response = await openai_client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": "You are an expert resume editor. Return only the improved resume text."},
            {"role": "user", "content": prompt}
        ],
        temperature=0.3,
        max_tokens=8000
    )
    
    improved_text = response.choices[0].message.content.strip()
    
    # Generate PDF
    from app.services.pdf_builder import build_resume_pdf_from_text
    pdf_bytes = await build_resume_pdf_from_text(improved_text)
    pdf_base64 = base64.b64encode(pdf_bytes).decode('utf-8')
    
    return {
        'improved_resume_text': improved_text,
        'pdf_base64': pdf_base64
    }


async def _score_resume(resume_text: str, openai_client) -> Dict[str, Any]:
    """Score resume and provide improvement suggestions (without job tailoring)."""
    
    prompt = f"""You are an expert resume analyst. Score this resume and provide improvement suggestions.

## RESUME
{resume_text[:10000]}

## RESPONSE FORMAT
Return JSON:
{{
    "score": 75,
    "score_label": "Good",
    "categories": [
        {{
            "name": "Impact & Results",
            "score": 70,
            "explanation": "Brief explanation of what's working and what could improve",
            "suggestions": [
                "Specific actionable suggestion 1",
                "Specific actionable suggestion 2"
            ]
        }},
        {{
            "name": "Clarity & Structure",
            "score": 75,
            "explanation": "Brief explanation",
            "suggestions": ["Suggestion"]
        }},
        {{
            "name": "Keywords / ATS Readiness",
            "score": 80,
            "explanation": "Brief explanation",
            "suggestions": ["Suggestion"]
        }},
        {{
            "name": "Professional Presentation",
            "score": 70,
            "explanation": "Brief explanation",
            "suggestions": ["Suggestion"]
        }}
    ],
    "summary": "2-3 sentence overall summary with key strengths and areas for improvement"
}}

Guidelines:
- Score from 0-100 where 70+ is good, 80+ is very good, 90+ is excellent
- Be honest but constructive
- Each suggestion should be specific and actionable
- Focus on general improvements, not job-specific tailoring
- Score_label should be: "Needs Work" (0-59), "Good" (60-74), "Very Good" (75-89), "Excellent" (90-100)"""

    response = await openai_client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": "You are an expert resume analyst. Return only valid JSON."},
            {"role": "user", "content": prompt}
        ],
        response_format={"type": "json_object"},
        temperature=0.4,
        max_tokens=3000
    )
    
    return json.loads(response.choices[0].message.content)


async def _apply_improvements(resume_text: str, suggestions: List[str], openai_client) -> Dict[str, Any]:
    """Apply improvement suggestions to generate an improved resume."""
    
    suggestions_text = "\n".join([f"- {s}" for s in suggestions])
    
    prompt = f"""Apply these improvements to the resume:

## IMPROVEMENTS TO APPLY
{suggestions_text}

## RESUME
{resume_text[:10000]}

Return the COMPLETE improved resume text with ALL the improvements applied.
Keep all sections and content, just improve based on the suggestions.
Return only the resume text, no explanations."""

    response = await openai_client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": "Apply the improvements and return the updated resume text only."},
            {"role": "user", "content": prompt}
        ],
        temperature=0.3,
        max_tokens=8000
    )
    
    improved_text = response.choices[0].message.content.strip()
    
    # Generate PDF
    from app.services.pdf_builder import build_resume_pdf_from_text
    pdf_bytes = await build_resume_pdf_from_text(improved_text)
    pdf_base64 = base64.b64encode(pdf_bytes).decode('utf-8')
    
    return {
        'improved_resume_text': improved_text,
        'pdf_base64': pdf_base64
    }


async def _analyze_resume(
    resume_text: str,
    job_title: str,
    company: str,
    location: str,
    job_description: str,
    openai_client
) -> Dict[str, Any]:
    """Analyze resume against job and generate score + recommendations."""
    
    prompt = f"""You are an expert resume analyst. Analyze this resume against the job requirements and provide:
1. An overall score (0-100)
2. Category breakdown scores
3. Specific actionable recommendations

## JOB INFORMATION
Title: {job_title}
Company: {company}
Location: {location}

## JOB DESCRIPTION
{job_description[:4000]}

## RESUME
{resume_text[:8000]}

## RESPONSE FORMAT
Return JSON:
{{
    "score": 75,
    "score_label": "Good Match",
    "categories": [
        {{
            "name": "Keywords Match",
            "score": 70,
            "explanation": "Brief explanation of the score"
        }},
        {{
            "name": "Impact & Metrics",
            "score": 65,
            "explanation": "Brief explanation"
        }},
        {{
            "name": "Clarity & Structure",
            "score": 80,
            "explanation": "Brief explanation"
        }},
        {{
            "name": "ATS Compatibility",
            "score": 85,
            "explanation": "Brief explanation"
        }}
    ],
    "recommendations": [
        {{
            "id": "rec_1",
            "title": "Short actionable title",
            "explanation": "1-2 sentence explanation of what to change and why",
            "section": "Experience",
            "current_text": "exact text from resume to change",
            "suggested_text": "improved version of the text",
            "impact": "high"
        }}
    ],
    "keywords_found": ["keyword1", "keyword2"],
    "keywords_missing": ["keyword3", "keyword4"],
    "summary": "2-3 sentence summary of the analysis"
}}

Guidelines:
- Provide 5-10 specific, actionable recommendations
- Each recommendation should be a single, focused change
- Include the exact text to change and what to change it to
- Order recommendations by impact (high, medium, low)
- Be specific about which section each recommendation applies to
- Focus on: action verbs, quantifying achievements, adding relevant keywords, improving clarity"""

    response = await openai_client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": "You are an expert resume analyst. Return only valid JSON."},
            {"role": "user", "content": prompt}
        ],
        response_format={"type": "json_object"},
        temperature=0.4,
        max_tokens=4000
    )
    
    return json.loads(response.choices[0].message.content)


async def _apply_recommendation(
    resume_text: str,
    recommendation: Dict[str, Any],
    job_context: Dict[str, Any],
    openai_client
) -> Dict[str, Any]:
    """Apply a single recommendation to the resume and generate updated PDF."""
    
    current_text = recommendation.get('current_text', '')
    suggested_text = recommendation.get('suggested_text', '')
    
    # Apply the change to resume text
    if current_text and suggested_text and current_text in resume_text:
        updated_resume_text = resume_text.replace(current_text, suggested_text, 1)
    else:
        # If exact match not found, use AI to apply the change
        prompt = f"""Apply this specific recommendation to the resume.

RECOMMENDATION:
Title: {recommendation.get('title', '')}
Section: {recommendation.get('section', '')}
Current: {current_text}
Suggested: {suggested_text}
Explanation: {recommendation.get('explanation', '')}

RESUME:
{resume_text[:10000]}

Return the COMPLETE updated resume text with this one change applied. 
Keep all other content exactly the same.
Return only the resume text, no JSON or explanation."""

        response = await openai_client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": "Apply the recommendation and return the updated resume text only."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.2,
            max_tokens=8000
        )
        
        updated_resume_text = response.choices[0].message.content.strip()
    
    # Generate PDF from updated text
    from app.services.pdf_builder import build_resume_pdf_from_text
    
    pdf_bytes = await build_resume_pdf_from_text(updated_resume_text)
    pdf_base64 = base64.b64encode(pdf_bytes).decode('utf-8')
    
    return {
        'updated_resume_text': updated_resume_text,
        'pdf_base64': pdf_base64
    }


def _save_to_resume_library(
    user_id: str,
    job_title: str,
    company: str,
    location: str,
    pdf_base64: str,
    score: Optional[int] = None,
    source_resume_id: Optional[str] = None
) -> str:
    """Save the updated resume to the user's Resume Library."""
    db = get_db()
    if not db:
        raise ValueError("Database not available")
    
    # Generate display name
    sanitized_title = job_title.replace(' ', '_').replace('/', '-')[:50]
    display_name = f"{sanitized_title}_resume"
    
    # Create library entry
    entry_id = str(uuid.uuid4())
    entry = {
        'id': entry_id,
        'display_name': display_name,
        'job_title': job_title,
        'company': company,
        'location': location,
        'created_at': datetime.now().isoformat(),
        'pdf_base64': pdf_base64,
        'source_base_resume_id': source_resume_id,
        'score': score
    }
    
    # Save to user's resume_library subcollection
    db.collection('users').document(user_id).collection('resume_library').document(entry_id).set(entry)
    
    logger.info(f"[ResumeWorkshop] Saved resume to library for user {user_id[:8]}... Entry ID: {entry_id}")
    
    return entry_id


# ============================================================================
# API ENDPOINTS
# ============================================================================

@resume_workshop_bp.route("/analyze", methods=["POST"])
@require_firebase_auth
def analyze():
    """
    Analyze resume against job and generate score + recommendations.
    Costs 5 credits.
    
    Request body:
    {
        "job_url": "optional URL to parse",
        "job_title": "required if no URL or URL fails",
        "company": "required if no URL or URL fails",
        "location": "required if no URL or URL fails",
        "job_description": "required if no URL or URL fails"
    }
    
    Response:
    {
        "status": "ok",
        "score": { ... },
        "recommendations": [ ... ],
        "parsed_job": { ... } // if URL was parsed
        "credits_remaining": 123
    }
    """
    payload = request.get_json(force=True, silent=True) or {}
    
    user_id = request.firebase_user.get('uid') if hasattr(request, 'firebase_user') else None
    if not user_id:
        return jsonify({
            "status": "error",
            "message": "User not authenticated"
        }), 401
    
    try:
        # Get user's resume
        resume_data = _fetch_user_resume_data(user_id)
        resume_text = resume_data.get('resume_text', '')
        
        if not resume_text or len(resume_text) < 100:
            return jsonify({
                "status": "error",
                "message": "No resume found. Please upload your resume in Account Settings first.",
                "error_code": "NO_RESUME"
            }), 400
        
        # Try to parse job URL if provided
        job_url = payload.get('job_url', '').strip()
        parsed_job = None
        
        if job_url:
            parsed_job = run_async(_parse_job_url(job_url), timeout=30.0)
        
        # Get job context (from parsed URL or manual inputs)
        if parsed_job:
            job_title = parsed_job.get('job_title', payload.get('job_title', ''))
            company = parsed_job.get('company', payload.get('company', ''))
            location = parsed_job.get('location', payload.get('location', ''))
            job_description = parsed_job.get('job_description', payload.get('job_description', ''))
        else:
            job_title = payload.get('job_title', '').strip()
            company = payload.get('company', '').strip()
            location = payload.get('location', '').strip()
            job_description = payload.get('job_description', '').strip()
        
        # Validate required fields
        if not job_title or not company or not location or not job_description:
            error_msg = "Missing required fields."
            if job_url and not parsed_job:
                error_msg = "Could not read job URL. Please use manual inputs."
            
            return jsonify({
                "status": "error",
                "message": error_msg,
                "error_code": "URL_PARSE_FAILED" if job_url else "MISSING_FIELDS",
                "parsed_job": parsed_job
            }), 400
        
        # Deduct credits (5 for analyze)
        new_credits = _deduct_credits(user_id, 5)
        
        # Analyze resume
        openai_client = get_async_openai_client()
        if not openai_client:
            return jsonify({
                "status": "error",
                "message": "AI service unavailable"
            }), 503
        
        analysis = run_async(
            _analyze_resume(
                resume_text=resume_text,
                job_title=job_title,
                company=company,
                location=location,
                job_description=job_description,
                openai_client=openai_client
            ),
            timeout=90.0
        )
        
        return jsonify({
            "status": "ok",
            "score": analysis.get('score'),
            "score_label": analysis.get('score_label'),
            "categories": analysis.get('categories', []),
            "recommendations": analysis.get('recommendations', []),
            "keywords_found": analysis.get('keywords_found', []),
            "keywords_missing": analysis.get('keywords_missing', []),
            "summary": analysis.get('summary', ''),
            "parsed_job": parsed_job,
            "job_context": {
                "job_title": job_title,
                "company": company,
                "location": location
            },
            "credits_remaining": new_credits
        })
        
    except ValueError as exc:
        if "Insufficient credits" in str(exc):
            return jsonify({
                "status": "error",
                "message": str(exc),
                "error_code": "INSUFFICIENT_CREDITS"
            }), 402
        return jsonify({
            "status": "error",
            "message": str(exc)
        }), 400
    except TimeoutError:
        logger.error(f"[ResumeWorkshop] Analyze timed out for user {user_id[:8]}...")
        return jsonify({
            "status": "error",
            "message": "Analysis timed out. Please try again."
        }), 504
    except Exception as exc:
        logger.error(f"[ResumeWorkshop] Analyze failed: {type(exc).__name__}: {exc}")
        import traceback
        logger.error(f"[ResumeWorkshop] Traceback: {traceback.format_exc()}")
        return jsonify({
            "status": "error",
            "message": f"Analysis failed: {str(exc)}"
        }), 500


@resume_workshop_bp.route("/fix", methods=["POST"])
@require_firebase_auth
def fix_resume():
    """
    Fix resume without job context - improves formatting, clarity, bullets, impact.
    Costs 5 credits.
    
    Response:
    {
        "status": "ok",
        "improved_resume_text": "...",
        "pdf_base64": "...",
        "credits_remaining": 123
    }
    """
    user_id = request.firebase_user.get('uid') if hasattr(request, 'firebase_user') else None
    if not user_id:
        return jsonify({
            "status": "error",
            "message": "User not authenticated"
        }), 401
    
    try:
        # Get user's resume
        resume_data = _fetch_user_resume_data(user_id)
        resume_text = resume_data.get('resume_text', '')
        
        if not resume_text or len(resume_text) < 100:
            return jsonify({
                "status": "error",
                "message": "No resume found. Please upload your resume in Account Settings first.",
                "error_code": "NO_RESUME"
            }), 400
        
        # Deduct credits
        new_credits = _deduct_credits(user_id, 5)
        
        # Fix resume
        openai_client = get_async_openai_client()
        if not openai_client:
            return jsonify({
                "status": "error",
                "message": "AI service unavailable"
            }), 503
        
        result = run_async(
            _fix_resume(resume_text=resume_text, openai_client=openai_client),
            timeout=90.0
        )
        
        return jsonify({
            "status": "ok",
            "improved_resume_text": result['improved_resume_text'],
            "pdf_base64": result['pdf_base64'],
            "credits_remaining": new_credits
        })
        
    except ValueError as exc:
        if "Insufficient credits" in str(exc):
            return jsonify({
                "status": "error",
                "message": str(exc),
                "error_code": "INSUFFICIENT_CREDITS"
            }), 402
        return jsonify({
            "status": "error",
            "message": str(exc)
        }), 400
    except TimeoutError:
        logger.error(f"[ResumeWorkshop] Fix timed out for user {user_id[:8]}...")
        return jsonify({
            "status": "error",
            "message": "Fix timed out. Please try again."
        }), 504
    except Exception as exc:
        logger.error(f"[ResumeWorkshop] Fix failed: {type(exc).__name__}: {exc}")
        import traceback
        logger.error(f"[ResumeWorkshop] Traceback: {traceback.format_exc()}")
        return jsonify({
            "status": "error",
            "message": f"Fix failed: {str(exc)}"
        }), 500


@resume_workshop_bp.route("/score", methods=["POST"])
@require_firebase_auth
def score_resume():
    """
    Score resume and provide improvement suggestions (without job tailoring).
    Costs 5 credits.
    
    Response:
    {
        "status": "ok",
        "score": 75,
        "score_label": "Good",
        "categories": [...],
        "summary": "...",
        "credits_remaining": 123
    }
    """
    user_id = request.firebase_user.get('uid') if hasattr(request, 'firebase_user') else None
    if not user_id:
        return jsonify({
            "status": "error",
            "message": "User not authenticated"
        }), 401
    
    try:
        # Get user's resume
        resume_data = _fetch_user_resume_data(user_id)
        resume_text = resume_data.get('resume_text', '')
        
        if not resume_text or len(resume_text) < 100:
            return jsonify({
                "status": "error",
                "message": "No resume found. Please upload your resume in Account Settings first.",
                "error_code": "NO_RESUME"
            }), 400
        
        # Deduct credits
        new_credits = _deduct_credits(user_id, 5)
        
        # Score resume
        openai_client = get_async_openai_client()
        if not openai_client:
            return jsonify({
                "status": "error",
                "message": "AI service unavailable"
            }), 503
        
        result = run_async(
            _score_resume(resume_text=resume_text, openai_client=openai_client),
            timeout=60.0
        )
        
        return jsonify({
            "status": "ok",
            "score": result.get('score'),
            "score_label": result.get('score_label'),
            "categories": result.get('categories', []),
            "summary": result.get('summary', ''),
            "credits_remaining": new_credits
        })
        
    except ValueError as exc:
        if "Insufficient credits" in str(exc):
            return jsonify({
                "status": "error",
                "message": str(exc),
                "error_code": "INSUFFICIENT_CREDITS"
            }), 402
        return jsonify({
            "status": "error",
            "message": str(exc)
        }), 400
    except TimeoutError:
        logger.error(f"[ResumeWorkshop] Score timed out for user {user_id[:8]}...")
        return jsonify({
            "status": "error",
            "message": "Scoring timed out. Please try again."
        }), 504
    except Exception as exc:
        logger.error(f"[ResumeWorkshop] Score failed: {type(exc).__name__}: {exc}")
        import traceback
        logger.error(f"[ResumeWorkshop] Traceback: {traceback.format_exc()}")
        return jsonify({
            "status": "error",
            "message": f"Scoring failed: {str(exc)}"
        }), 500


@resume_workshop_bp.route("/apply-improvements", methods=["POST"])
@require_firebase_auth
def apply_improvements():
    """
    Apply improvement suggestions from scoring to generate an improved resume.
    Costs 5 credits.
    
    Request body:
    {
        "suggestions": ["suggestion1", "suggestion2", ...]
    }
    
    Response:
    {
        "status": "ok",
        "improved_resume_text": "...",
        "pdf_base64": "...",
        "credits_remaining": 123
    }
    """
    payload = request.get_json(force=True, silent=True) or {}
    
    user_id = request.firebase_user.get('uid') if hasattr(request, 'firebase_user') else None
    if not user_id:
        return jsonify({
            "status": "error",
            "message": "User not authenticated"
        }), 401
    
    suggestions = payload.get('suggestions', [])
    if not suggestions:
        return jsonify({
            "status": "error",
            "message": "No suggestions provided"
        }), 400
    
    try:
        # Get user's resume
        resume_data = _fetch_user_resume_data(user_id)
        resume_text = resume_data.get('resume_text', '')
        
        if not resume_text or len(resume_text) < 100:
            return jsonify({
                "status": "error",
                "message": "No resume found"
            }), 400
        
        # Deduct credits
        new_credits = _deduct_credits(user_id, 5)
        
        # Apply improvements
        openai_client = get_async_openai_client()
        if not openai_client:
            return jsonify({
                "status": "error",
                "message": "AI service unavailable"
            }), 503
        
        result = run_async(
            _apply_improvements(
                resume_text=resume_text,
                suggestions=suggestions,
                openai_client=openai_client
            ),
            timeout=90.0
        )
        
        return jsonify({
            "status": "ok",
            "improved_resume_text": result['improved_resume_text'],
            "pdf_base64": result['pdf_base64'],
            "credits_remaining": new_credits
        })
        
    except ValueError as exc:
        if "Insufficient credits" in str(exc):
            return jsonify({
                "status": "error",
                "message": str(exc),
                "error_code": "INSUFFICIENT_CREDITS"
            }), 402
        return jsonify({
            "status": "error",
            "message": str(exc)
        }), 400
    except TimeoutError:
        logger.error(f"[ResumeWorkshop] Apply improvements timed out for user {user_id[:8]}...")
        return jsonify({
            "status": "error",
            "message": "Operation timed out. Please try again."
        }), 504
    except Exception as exc:
        logger.error(f"[ResumeWorkshop] Apply improvements failed: {type(exc).__name__}: {exc}")
        import traceback
        logger.error(f"[ResumeWorkshop] Traceback: {traceback.format_exc()}")
        return jsonify({
            "status": "error",
            "message": f"Failed to apply improvements: {str(exc)}"
        }), 500


@resume_workshop_bp.route("/replace-main", methods=["POST"])
@require_firebase_auth
def replace_main_resume():
    """
    Replace the user's main resume in account settings with a new version.
    
    Request body:
    {
        "pdf_base64": "...",
        "resume_text": "..."
    }
    
    Response:
    {
        "status": "ok",
        "message": "Resume replaced successfully"
    }
    """
    payload = request.get_json(force=True, silent=True) or {}
    
    user_id = request.firebase_user.get('uid') if hasattr(request, 'firebase_user') else None
    if not user_id:
        return jsonify({
            "status": "error",
            "message": "User not authenticated"
        }), 401
    
    pdf_base64 = payload.get('pdf_base64')
    resume_text = payload.get('resume_text')
    
    if not pdf_base64 or not resume_text:
        return jsonify({
            "status": "error",
            "message": "Missing pdf_base64 or resume_text"
        }), 400
    
    try:
        db = get_db()
        if not db:
            return jsonify({
                "status": "error",
                "message": "Database not available"
            }), 500
        
        # Upload PDF to Firebase Storage and get URL
        from firebase_admin import storage
        
        bucket = storage.bucket()
        blob_name = f"resumes/{user_id}/improved_resume.pdf"
        blob = bucket.blob(blob_name)
        
        # Decode base64 and upload
        pdf_bytes = base64.b64decode(pdf_base64)
        blob.upload_from_string(pdf_bytes, content_type='application/pdf')
        
        # Make blob publicly accessible
        blob.make_public()
        pdf_url = blob.public_url
        
        # Update user document
        user_ref = db.collection('users').document(user_id)
        user_ref.update({
            'resumeUrl': pdf_url,
            'resumeText': resume_text,
            'rawText': resume_text,
            'resumeFileName': 'improved_resume.pdf',
            'resumeReplacedAt': datetime.now().isoformat()
        })
        
        logger.info(f"[ResumeWorkshop] Replaced main resume for user {user_id[:8]}...")
        
        return jsonify({
            "status": "ok",
            "message": "Resume replaced successfully",
            "new_resume_url": pdf_url
        })
        
    except Exception as exc:
        logger.error(f"[ResumeWorkshop] Replace main failed: {type(exc).__name__}: {exc}")
        import traceback
        logger.error(f"[ResumeWorkshop] Traceback: {traceback.format_exc()}")
        return jsonify({
            "status": "error",
            "message": f"Failed to replace resume: {str(exc)}"
        }), 500


@resume_workshop_bp.route("/apply", methods=["POST"])
@require_firebase_auth
def apply_recommendation():
    """
    Apply a single recommendation to the resume.
    Costs 5 credits.
    
    Request body:
    {
        "recommendation": { ... },
        "job_context": {
            "job_title": "...",
            "company": "...",
            "location": "..."
        },
        "current_working_resume_text": "optional, if applying to already-modified resume",
        "score": 75  // optional, for library entry
    }
    
    Response:
    {
        "status": "ok",
        "updated_resume_pdf_base64": "...",
        "library_entry_id": "...",
        "credits_remaining": 123
    }
    """
    payload = request.get_json(force=True, silent=True) or {}
    
    user_id = request.firebase_user.get('uid') if hasattr(request, 'firebase_user') else None
    if not user_id:
        return jsonify({
            "status": "error",
            "message": "User not authenticated"
        }), 401
    
    recommendation = payload.get('recommendation')
    job_context = payload.get('job_context', {})
    current_working_resume_text = payload.get('current_working_resume_text')
    score = payload.get('score')
    
    if not recommendation:
        return jsonify({
            "status": "error",
            "message": "Missing recommendation"
        }), 400
    
    try:
        # Get resume text (either working version or original)
        if current_working_resume_text:
            resume_text = current_working_resume_text
        else:
            resume_data = _fetch_user_resume_data(user_id)
            resume_text = resume_data.get('resume_text', '')
        
        if not resume_text or len(resume_text) < 100:
            return jsonify({
                "status": "error",
                "message": "No resume found"
            }), 400
        
        # Deduct credits (5 for apply)
        new_credits = _deduct_credits(user_id, 5)
        
        # Apply recommendation
        openai_client = get_async_openai_client()
        if not openai_client:
            return jsonify({
                "status": "error",
                "message": "AI service unavailable"
            }), 503
        
        result = run_async(
            _apply_recommendation(
                resume_text=resume_text,
                recommendation=recommendation,
                job_context=job_context,
                openai_client=openai_client
            ),
            timeout=60.0
        )
        
        # Save to Resume Library
        job_title = job_context.get('job_title', 'Unknown')
        company = job_context.get('company', 'Unknown')
        location = job_context.get('location', '')
        
        library_entry_id = _save_to_resume_library(
            user_id=user_id,
            job_title=job_title,
            company=company,
            location=location,
            pdf_base64=result['pdf_base64'],
            score=score
        )
        
        return jsonify({
            "status": "ok",
            "updated_resume_pdf_base64": result['pdf_base64'],
            "updated_resume_text": result['updated_resume_text'],
            "library_entry_id": library_entry_id,
            "credits_remaining": new_credits
        })
        
    except ValueError as exc:
        if "Insufficient credits" in str(exc):
            return jsonify({
                "status": "error",
                "message": str(exc),
                "error_code": "INSUFFICIENT_CREDITS"
            }), 402
        return jsonify({
            "status": "error",
            "message": str(exc)
        }), 400
    except TimeoutError:
        logger.error(f"[ResumeWorkshop] Apply timed out for user {user_id[:8]}...")
        return jsonify({
            "status": "error",
            "message": "Apply timed out. Please try again."
        }), 504
    except Exception as exc:
        logger.error(f"[ResumeWorkshop] Apply failed: {type(exc).__name__}: {exc}")
        import traceback
        logger.error(f"[ResumeWorkshop] Traceback: {traceback.format_exc()}")
        return jsonify({
            "status": "error",
            "message": f"Failed to apply recommendation: {str(exc)}"
        }), 500


@resume_workshop_bp.route("/library", methods=["GET"])
@require_firebase_auth
def get_library():
    """Get user's Resume Library entries."""
    user_id = request.firebase_user.get('uid') if hasattr(request, 'firebase_user') else None
    if not user_id:
        return jsonify({
            "status": "error",
            "message": "User not authenticated"
        }), 401
    
    try:
        db = get_db()
        if not db:
            return jsonify({
                "status": "error",
                "message": "Database not available"
            }), 500
        
        entries_ref = db.collection('users').document(user_id).collection('resume_library')
        entries = entries_ref.order_by('created_at', direction='DESCENDING').limit(50).stream()
        
        library = []
        for entry in entries:
            entry_data = entry.to_dict()
            # Don't send full PDF base64 in list view
            library.append({
                'id': entry_data.get('id'),
                'display_name': entry_data.get('display_name'),
                'job_title': entry_data.get('job_title'),
                'company': entry_data.get('company'),
                'location': entry_data.get('location'),
                'created_at': entry_data.get('created_at'),
                'score': entry_data.get('score')
            })
        
        return jsonify({
            "status": "ok",
            "entries": library
        })
        
    except Exception as exc:
        logger.error(f"[ResumeWorkshop] Get library failed: {type(exc).__name__}: {exc}")
        return jsonify({
            "status": "error",
            "message": f"Failed to get library: {str(exc)}"
        }), 500


@resume_workshop_bp.route("/library/<entry_id>", methods=["GET"])
@require_firebase_auth
def get_library_entry(entry_id: str):
    """Get a specific Resume Library entry with full PDF."""
    user_id = request.firebase_user.get('uid') if hasattr(request, 'firebase_user') else None
    if not user_id:
        return jsonify({
            "status": "error",
            "message": "User not authenticated"
        }), 401
    
    try:
        db = get_db()
        if not db:
            return jsonify({
                "status": "error",
                "message": "Database not available"
            }), 500
        
        entry_ref = db.collection('users').document(user_id).collection('resume_library').document(entry_id)
        entry_doc = entry_ref.get()
        
        if not entry_doc.exists:
            return jsonify({
                "status": "error",
                "message": "Entry not found"
            }), 404
        
        return jsonify({
            "status": "ok",
            "entry": entry_doc.to_dict()
        })
        
    except Exception as exc:
        logger.error(f"[ResumeWorkshop] Get library entry failed: {type(exc).__name__}: {exc}")
        return jsonify({
            "status": "error",
            "message": f"Failed to get entry: {str(exc)}"
        }), 500


@resume_workshop_bp.route("/library/<entry_id>", methods=["DELETE"])
@require_firebase_auth
def delete_library_entry(entry_id: str):
    """Delete a Resume Library entry."""
    user_id = request.firebase_user.get('uid') if hasattr(request, 'firebase_user') else None
    if not user_id:
        return jsonify({
            "status": "error",
            "message": "User not authenticated"
        }), 401
    
    try:
        db = get_db()
        if not db:
            return jsonify({
                "status": "error",
                "message": "Database not available"
            }), 500
        
        entry_ref = db.collection('users').document(user_id).collection('resume_library').document(entry_id)
        entry_ref.delete()
        
        return jsonify({
            "status": "ok",
            "message": "Entry deleted"
        })
        
    except Exception as exc:
        logger.error(f"[ResumeWorkshop] Delete library entry failed: {type(exc).__name__}: {exc}")
        return jsonify({
            "status": "error",
            "message": f"Failed to delete entry: {str(exc)}"
        }), 500


@resume_workshop_bp.route("/health", methods=["GET"])
def health():
    """Health check endpoint."""
    return jsonify({"status": "ok", "service": "resume_workshop"})


@resume_workshop_bp.route("/debug/check-resume", methods=["GET"])
@require_firebase_auth
def debug_check_resume():
    """
    Debug endpoint to check where resume data exists for the authenticated user.
    Returns a detailed report of all possible resume storage locations.
    """
    user_id = request.firebase_user.get('uid') if hasattr(request, 'firebase_user') else None
    if not user_id:
        return jsonify({"status": "error", "message": "User not authenticated"}), 401
    
    try:
        db = get_db()
        if not db:
            return jsonify({"status": "error", "message": "Database not available"}), 500
        
        result = {
            'user_id': user_id[:8] + '...',
            'locations_checked': {},
            'recommendation': None
        }
        
        # Check user document
        user_doc = db.collection('users').document(user_id).get()
        if user_doc.exists:
            user_data = user_doc.to_dict()
            
            # Check all possible resume text locations
            text_locations = {
                'resumeText': user_data.get('resumeText'),
                'originalResumeText': user_data.get('originalResumeText'),
                'rawText': user_data.get('rawText'),
                'profile.resumeText': user_data.get('profile', {}).get('resumeText') if isinstance(user_data.get('profile'), dict) else None,
                'resumeParsed.rawText': user_data.get('resumeParsed', {}).get('rawText') if isinstance(user_data.get('resumeParsed'), dict) else None,
            }
            
            for loc_name, text_value in text_locations.items():
                if text_value:
                    result['locations_checked'][loc_name] = {
                        'found': True,
                        'length': len(text_value),
                        'preview': text_value[:100] + '...' if len(text_value) > 100 else text_value
                    }
                else:
                    result['locations_checked'][loc_name] = {'found': False}
            
            # Check other resume-related fields
            result['other_fields'] = {
                'resumeUrl': bool(user_data.get('resumeUrl')),
                'originalResumeUrl': bool(user_data.get('originalResumeUrl')),
                'resumeFileName': user_data.get('resumeFileName'),
                'resumeParsed_exists': bool(user_data.get('resumeParsed')),
                'originalResumeParsed_exists': bool(user_data.get('originalResumeParsed')),
            }
            
            # Use the helper function to see what it returns
            try:
                resume_data = _fetch_user_resume_data(user_id)
                result['fetch_helper_result'] = {
                    'source': resume_data.get('source'),
                    'text_length': len(resume_data.get('resume_text', '')),
                    'has_url': bool(resume_data.get('resume_url')),
                    'has_parsed': bool(resume_data.get('resume_parsed')),
                }
            except Exception as e:
                result['fetch_helper_result'] = {'error': str(e)}
            
            # Provide recommendation
            if resume_data.get('resume_text') and len(resume_data.get('resume_text', '')) >= 100:
                result['recommendation'] = 'Resume found! The endpoints should work.'
            elif user_data.get('resumeUrl'):
                result['recommendation'] = 'Resume URL exists but text not extracted. Try re-uploading resume.'
            else:
                result['recommendation'] = 'No resume found. Please upload a resume in Account Settings.'
        else:
            result['locations_checked']['user_document'] = {'found': False}
            result['recommendation'] = 'User document not found in Firestore.'
        
        return jsonify({"status": "ok", **result})
        
    except Exception as exc:
        logger.error(f"[ResumeWorkshop] Debug check failed: {type(exc).__name__}: {exc}")
        import traceback
        logger.error(f"[ResumeWorkshop] Traceback: {traceback.format_exc()}")
        return jsonify({
            "status": "error",
            "message": f"Debug check failed: {str(exc)}"
        }), 500
