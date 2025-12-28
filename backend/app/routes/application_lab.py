"""
Application Lab API endpoints - dedicated routes for application analysis.
"""
from __future__ import annotations

import logging

from flask import Blueprint, jsonify, request

from app.extensions import require_firebase_auth
from app.services.application_lab_service import application_lab_service
from app.services.scout_service import ResumeEdit
from app.utils.async_runner import run_async

logger = logging.getLogger('application_lab')

application_lab_bp = Blueprint("application_lab", __name__, url_prefix="/api/application-lab")


@application_lab_bp.route("/analyze", methods=["POST"])
@require_firebase_auth
def analyze():
    """
    Analyze job fit with requirements mapping and resume suggestions.
    
    Request body:
    {
        "job": {
            "title": "...",
            "company": "...",
            "location": "...",
            "url": "...",
            "snippet": "..."
        },
        "user_resume": { ... }
    }
    
    Response:
    {
        "status": "ok",
        "analysis": { ... },
        "analysis_id": "..."
    }
    """
    payload = request.get_json(force=True, silent=True) or {}
    job = payload.get("job", {})
    user_resume = payload.get("user_resume")
    
    if not job or not user_resume:
        return jsonify({
            "status": "error",
            "message": "Missing job or resume data"
        }), 400
    
    user_id = request.firebase_user.get('uid') if hasattr(request, 'firebase_user') else None
    if not user_id:
        return jsonify({
            "status": "error",
            "message": "User not authenticated"
        }), 401
    
    try:
        # Progress callback for synchronous requests (optional enhancement)
        progress_updates = []
        def progress_callback(p: int, msg: str):
            progress_updates.append({"progress": p, "message": msg})
        
        result = run_async(
            application_lab_service.analyze_job_fit(
                job=job,
                user_resume=user_resume,
                user_id=user_id,
                progress_callback=progress_callback
            ),
            timeout=120.0  # 2 minute timeout
        )
        
        # Add progress info to result if available
        if progress_updates:
            result["_progress"] = progress_updates
        
        return jsonify(result)
    except TimeoutError:
        logger.error(f"[ApplicationLab] Analysis timed out for user {user_id[:8] if user_id else 'unknown'}...")
        return jsonify({
            "status": "error",
            "message": "Analysis timed out. Please try again with a simpler job posting."
        }), 504
    except ValueError as exc:
        # Validation errors (missing resume, etc.) return 400
        logger.warning(f"[ApplicationLab] Validation error for user {user_id[:8] if user_id else 'unknown'}...: {exc}")
        return jsonify({
            "status": "error",
            "message": str(exc)
        }), 400
    except Exception as exc:
        logger.error(f"[ApplicationLab] Analyze failed for user {user_id[:8] if user_id else 'unknown'}...: {type(exc).__name__}: {exc}")
        import traceback
        logger.error(f"[ApplicationLab] Traceback: {traceback.format_exc()}")
        return jsonify({
            "status": "error",
            "message": f"Failed to analyze job fit: {str(exc)}"
        }), 500


@application_lab_bp.route("/analysis/<analysis_id>", methods=["GET"])
@require_firebase_auth
def get_analysis(analysis_id: str):
    """
    Get a saved analysis by ID.
    
    FIX: Now calls synchronous get_analysis_sync() directly instead of using run_async.
    This prevents blocking Firestore calls in async routes and should return in <300ms.
    
    Response:
    {
        "status": "ok",
        "analysis": { ... },
        "job_snapshot": { ... }
    }
    """
    user_id = request.firebase_user.get('uid') if hasattr(request, 'firebase_user') else None
    if not user_id:
        return jsonify({
            "status": "error",
            "message": "User not authenticated"
        }), 401
    
    try:
        # FIX: Call synchronous version directly - no need for async_runner
        result = application_lab_service.get_analysis_sync(user_id, analysis_id)
        return jsonify(result)
    except Exception as exc:
        logger.error(f"[ApplicationLab] Get analysis failed for user {user_id[:8] if user_id else 'unknown'}...: {type(exc).__name__}: {exc}")
        import traceback
        logger.error(f"[ApplicationLab] Traceback: {traceback.format_exc()}")
        return jsonify({
            "status": "error",
            "message": f"Failed to retrieve analysis: {str(exc)}"
        }), 500


@application_lab_bp.route("/generate-cover-letter", methods=["POST"])
@require_firebase_auth
def generate_cover_letter():
    """
    Generate a cover letter based on job and fit analysis.
    
    Request body:
    {
        "job": {...},
        "user_resume": {...},
        "fit_analysis": {...},  // Optional: pass existing analysis to save recomputing
        "options": {
            "tone": "formal" | "conversational" | "enthusiastic",
            "length": "short" | "medium" | "long",
            "emphasis": ["technical_skills", "leadership", "culture_fit"]
        }
    }
    """
    payload = request.get_json(force=True, silent=True) or {}
    job = payload.get("job", {})
    user_resume = payload.get("user_resume")
    fit_analysis = payload.get("fit_analysis")
    options = payload.get("options", {})
    
    if not job or not user_resume:
        return jsonify({
            "status": "error",
            "message": "Missing job or resume data"
        }), 400
    
    # FIX 8: Get user_id from auth context before try block
    user_id = request.firebase_user.get('uid') if hasattr(request, 'firebase_user') else None
    
    try:
        cover_letter = run_async(
            application_lab_service.generate_cover_letter(
                job=job,
                user_resume=user_resume,
                fit_analysis=fit_analysis,
                tone=options.get('tone', 'conversational'),
                length=options.get('length', 'medium'),
                emphasis=options.get('emphasis', [])
            ),
            timeout=120.0  # 120 second timeout (increased from 90s for complex cover letters)
        )
        return jsonify({
            "status": "ok",
            "cover_letter": cover_letter.to_dict()
        })
    except TimeoutError:
        logger.error(f"[ApplicationLab] Cover letter generation timed out for user {user_id[:8] if user_id else 'unknown'}...")
        return jsonify({
            "status": "error",
            "message": "Cover letter generation timed out. Please try again."
        }), 504
    except ValueError as exc:
        logger.warning(f"[ApplicationLab] Validation error for cover letter: {exc}")
        return jsonify({
            "status": "error",
            "message": str(exc)
        }), 400
    except Exception as exc:
        logger.error(f"[ApplicationLab] Cover letter generation error: {type(exc).__name__}: {exc}")
        import traceback
        logger.error(f"[ApplicationLab] Traceback: {traceback.format_exc()}")
        return jsonify({
            "status": "error",
            "message": f"Failed to generate cover letter: {str(exc)}"
        }), 500


@application_lab_bp.route("/generate-edited-resume", methods=["POST"])
@require_firebase_auth
def generate_edited_resume():
    """
    Generate a complete, formatted resume with all edits applied.
    
    Request body:
    {
        "user_resume": { ... },
        "resume_edits": [ ... ],  // List of ResumeEdit objects
        "format": "plain" | "markdown" | "pdf"  // Default: "plain"
    }
    
    Response:
    {
        "status": "ok",
        "edited_resume": {
            "formatted_text": "...",  // Complete formatted resume (for txt/markdown)
            "pdf_base64": "...",      // Base64 encoded PDF (for pdf format)
            "structured": { ... },     // Structured resume with edits applied
            "format": "plain"
        }
    }
    """
    payload = request.get_json(force=True, silent=True) or {}
    user_resume = payload.get("user_resume")
    resume_edits = payload.get("resume_edits", [])
    format_type = payload.get("format", "plain")
    
    if not user_resume:
        return jsonify({
            "status": "error",
            "message": "Missing resume data"
        }), 400
    
    if not resume_edits:
        return jsonify({
            "status": "error",
            "message": "No resume edits provided"
        }), 400
    
    try:
        # Convert edit dicts to ResumeEdit objects if needed
        edit_objects = []
        for edit_dict in resume_edits:
            if isinstance(edit_dict, dict):
                edit_objects.append(ResumeEdit(
                    id=edit_dict.get('id', ''),
                    section=edit_dict.get('section', ''),
                    subsection=edit_dict.get('subsection'),
                    edit_type=edit_dict.get('edit_type', 'modify'),
                    priority=edit_dict.get('priority', 'medium'),
                    impact=edit_dict.get('impact', ''),
                    current_content=edit_dict.get('current_content'),
                    suggested_content=edit_dict.get('suggested_content', ''),
                    rationale=edit_dict.get('rationale', ''),
                    requirements_addressed=edit_dict.get('requirements_addressed', []),
                    keywords_added=edit_dict.get('keywords_added', []),
                    before_after_preview=edit_dict.get('before_after_preview')
                ))
            else:
                edit_objects.append(edit_dict)
        
        # Get user_id from Firebase auth if available
        user_id = request.firebase_user.get('uid') if hasattr(request, 'firebase_user') else None
        
        try:
            edited_resume_data = run_async(
                application_lab_service.generate_edited_resume(
                    user_resume=user_resume,
                    resume_edits=edit_objects,
                    format_type=format_type,
                    user_id=user_id
                ),
                timeout=90.0  # 90 second timeout
            )
            
            return jsonify({
                "status": "ok",
                "edited_resume": edited_resume_data
            })
        except TimeoutError:
            logger.error(f"[ApplicationLab] Generate edited resume timed out for user {user_id[:8] if user_id else 'unknown'}...")
            return jsonify({
                "status": "error",
                "message": "Resume generation timed out. Please try again with fewer edits or a simpler resume."
            }), 504
        except ValueError as exc:
            # Validation errors (missing resume, too short, etc.) return 400
            logger.warning(f"[ApplicationLab] Validation error for edited resume: {exc}")
            return jsonify({
                "status": "error",
                "message": str(exc)
            }), 400
    except Exception as exc:
        logger.error(f"[ApplicationLab] Generate edited resume failed: {type(exc).__name__}: {exc}")
        import traceback
        logger.error(f"[ApplicationLab] Traceback: {traceback.format_exc()}")
        return jsonify({
            "status": "error",
            "message": f"Failed to generate edited resume: {str(exc)}"
        }), 500


@application_lab_bp.route("/health", methods=["GET"])
def health():
    """Health check endpoint."""
    return jsonify({"status": "ok", "service": "application_lab"})


@application_lab_bp.route("/health/details", methods=["GET"])
@require_firebase_auth
def health_details():
    """Detailed health check for Application Lab dependencies."""
    from datetime import datetime
    import asyncio
    
    user_id = request.firebase_user.get('uid') if hasattr(request, 'firebase_user') else None
    if not user_id:
        return jsonify({
            "status": "error",
            "message": "User not authenticated"
        }), 401
    
    health = {
        "status": "ok",
        "timestamp": datetime.now().isoformat(),
        "checks": {}
    }
    
    # Check 1: Firestore connectivity
    try:
        from app.extensions import get_db
        db = get_db()
        if db:
            user_doc = db.collection('users').document(user_id).get()
            health["checks"]["firestore"] = {
                "status": "ok",
                "user_doc_exists": user_doc.exists
            }
            
            if user_doc.exists:
                user_data = user_doc.to_dict()
                has_resume_text = bool(user_data.get('resumeText') or user_data.get('rawText'))
                resume_text_len = len(user_data.get('resumeText', '') or user_data.get('rawText', ''))
                
                health["checks"]["resume_data"] = {
                    "status": "ok" if has_resume_text else "missing",
                    "has_resume_text": has_resume_text,
                    "resume_text_len": resume_text_len,
                    "has_resume_url": bool(user_data.get('resumeUrl')),
                    "has_resume_parsed": bool(user_data.get('resumeParsed')),
                    "resume_needs_ocr": bool(user_data.get('resumeNeedsOCR', False)),
                }
        else:
            health["checks"]["firestore"] = {"status": "error", "message": "Database not available"}
    except Exception as e:
        health["checks"]["firestore"] = {"status": "error", "message": str(e)}
    
    # Check 2: OpenAI reachability
    try:
        from app.services.openai_client import get_async_openai_client
        openai_client = get_async_openai_client()
        if openai_client:
            # Quick test call (very small)
            test_result = run_async(
                asyncio.wait_for(
                    openai_client.chat.completions.create(
                        model="gpt-4o-mini",
                        messages=[{"role": "user", "content": "test"}],
                        max_tokens=5
                    ),
                    timeout=5.0
                ),
                timeout=10.0
            )
            health["checks"]["openai"] = {
                "status": "ok",
                "model": "gpt-4o-mini"
            }
        else:
            health["checks"]["openai"] = {"status": "error", "message": "OpenAI client not available"}
    except TimeoutError:
        health["checks"]["openai"] = {"status": "timeout", "message": "OpenAI API timeout"}
    except Exception as e:
        health["checks"]["openai"] = {"status": "error", "message": str(e)}
    
    # Overall status
    all_checks_ok = all(
        check.get("status") == "ok" 
        for check in health["checks"].values()
    )
    health["status"] = "ok" if all_checks_ok else "degraded"
    
    return jsonify(health)


@application_lab_bp.route("/repair-resume", methods=["POST"])
@require_firebase_auth
def repair_resume():
    """
    Repair resume by backfilling resumeText from resumeUrl.
    """
    user_id = request.firebase_user.get('uid') if hasattr(request, 'firebase_user') else None
    if not user_id:
        return jsonify({
            "status": "error",
            "message": "User not authenticated"
        }), 401
    
    try:
        # Fetch user doc to get resumeUrl
        user_doc = application_lab_service._fetch_user_doc(user_id)
        if not user_doc:
            return jsonify({
                "status": "error",
                "message": "User document not found"
            }), 404
        
        resume_url = user_doc.get('resumeUrl')
        if not resume_url:
            return jsonify({
                "status": "error",
                "message": "No resume URL found. Please upload a resume first."
            }), 400
        
        # Check if resumeText already exists
        existing_text = user_doc.get('resumeText') or user_doc.get('rawText')
        if existing_text and len(existing_text.strip()) >= 500:
            return jsonify({
                "status": "ok",
                "message": "Resume text already exists",
                "resume_text_len": len(existing_text)
            })
        
        # Backfill from URL
        resume_text, needs_ocr = run_async(
            application_lab_service._backfill_resume_text_from_resume_url(user_id, resume_url),
            timeout=30.0
        )
        
        if needs_ocr:
            return jsonify({
                "status": "error",
                "message": "Resume appears to be a scanned PDF (image-based). Please upload a text-based PDF.",
                "needs_ocr": True
            }), 400
        
        if not resume_text:
            return jsonify({
                "status": "error",
                "message": "Failed to extract text from resume. Please try uploading again."
            }), 500
        
        return jsonify({
            "status": "ok",
            "message": "Resume text successfully backfilled",
            "resume_text_len": len(resume_text)
        })
        
    except TimeoutError:
        logger.error(f"[ApplicationLab] Repair resume timed out for user {user_id[:8]}...")
        return jsonify({
            "status": "error",
            "message": "Repair operation timed out. Please try again."
        }), 504
    except Exception as exc:
        logger.error(f"[ApplicationLab] Repair resume failed for user {user_id[:8]}...: {type(exc).__name__}: {exc}")
        import traceback
        logger.error(f"[ApplicationLab] Traceback: {traceback.format_exc()}")
        return jsonify({
            "status": "error",
            "message": f"Failed to repair resume: {str(exc)}"
        }), 500

