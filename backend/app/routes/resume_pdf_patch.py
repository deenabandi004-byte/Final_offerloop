"""
Resume PDF patch endpoint - applies text patches to the user's uploaded resume PDF
using the pdf_patcher module. No credit cost (patching is free).
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from flask import Blueprint, jsonify, request

from app.extensions import require_firebase_auth, get_db
from app.services.pdf_patcher import patch_pdf
from app.services.gmail_client import download_resume_from_url

logger = logging.getLogger(__name__)

resume_pdf_patch_bp = Blueprint(
    "resume_pdf_patch",
    __name__,
    url_prefix="/api/resume-workshop",
)


def _upload_patched_pdf_to_storage(user_id: str, pdf_bytes: bytes) -> str | None:
    """
    Upload patched PDF bytes to Firebase Storage at resumes/{uid}/patched-{timestamp}.pdf.
    Returns the public download URL or None on failure.
    """
    try:
        from firebase_admin import storage

        bucket = storage.bucket()
        timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        blob_name = f"resumes/{user_id}/patched-{timestamp}.pdf"
        blob = bucket.blob(blob_name)
        blob.upload_from_string(pdf_bytes, content_type="application/pdf")
        blob.make_public()
        return blob.public_url
    except Exception as e:
        logger.error("[ResumePdfPatch] Storage upload failed: %s", e)
        return None


@resume_pdf_patch_bp.route("/patch-pdf", methods=["POST"])
@require_firebase_auth
def patch_pdf_endpoint():
    """
    Apply PDF patches to the user's original uploaded resume PDF.

    Request body:
    {
        "patches": [
            {
                "type": "bullet_rewrite",
                "original_text": "...",
                "replacement_text": "..."
            },
            {
                "type": "skill_append",
                "original_text": "...",
                "replacement_text": "..."
            }
        ]
    }

    Returns patched PDF URL, patch log, and counts. No credit cost.
    """
    user_id = (
        request.firebase_user.get("uid")
        if hasattr(request, "firebase_user") and request.firebase_user
        else None
    )
    if not user_id:
        return jsonify({"status": "error", "message": "User not authenticated"}), 401

    payload = request.get_json(force=True, silent=True) or {}
    patches = payload.get("patches")
    if not patches or not isinstance(patches, list):
        return jsonify({
            "status": "error",
            "message": "Missing or invalid 'patches' array"
        }), 400

    # Validate patch structure
    for i, p in enumerate(patches):
        if not isinstance(p, dict):
            return jsonify({
                "status": "error",
                "message": f"Patch at index {i} must be an object"
            }), 400
        if "original_text" not in p or "replacement_text" not in p:
            return jsonify({
                "status": "error",
                "message": f"Patch at index {i} must have 'original_text' and 'replacement_text'"
            }), 400

    db = get_db()
    if not db:
        logger.error("[ResumePdfPatch] Database not available")
        return jsonify({
            "status": "error",
            "message": "Database not available"
        }), 500

    # Fetch user document for resumeUrl
    user_doc = db.collection("users").document(user_id).get()
    if not user_doc.exists:
        return jsonify({"status": "error", "message": "User not found"}), 404

    user_data = user_doc.to_dict()
    resume_url = user_data.get("resumeUrl") or user_data.get("originalResumeUrl")
    if not resume_url:
        logger.warning("[ResumePdfPatch] No resumeUrl for user %s", user_id[:8])
        return jsonify({
            "status": "error",
            "message": "No uploaded resume PDF found. Please upload a resume first."
        }), 400

    # Download original PDF
    logger.info("[ResumePdfPatch] Fetching original PDF from %s...", resume_url[:80])
    original_pdf_bytes, _ = download_resume_from_url(resume_url)
    if not original_pdf_bytes:
        logger.error("[ResumePdfPatch] Failed to download PDF from resumeUrl")
        return jsonify({
            "status": "error",
            "message": "Failed to download resume PDF. Please try again or re-upload your resume."
        }), 500

    logger.info("[ResumePdfPatch] Downloaded PDF: %d bytes", len(original_pdf_bytes))

    # Build patch list for pdf_patcher (expects type, original_text, replacement_text)
    patch_list = []
    for p in patches:
        patch_list.append({
            "type": p.get("type", "bullet_rewrite"),
            "original_text": p["original_text"],
            "replacement_text": p["replacement_text"],
        })

    # Apply patches
    result = patch_pdf(original_pdf_bytes, patch_list)
    patched_pdf_bytes = result.get("patched_pdf_bytes")
    patch_log_raw = result.get("patch_log", [])
    all_safe = result.get("all_safe", False)

    logger.info(
        "[ResumePdfPatch] patch_pdf result: all_safe=%s, patched_bytes=%s",
        all_safe,
        len(patched_pdf_bytes) if patched_pdf_bytes else None,
    )

    # Total failure: no patched PDF
    if patched_pdf_bytes is None:
        logger.error("[ResumePdfPatch] Total patch failure - patched_pdf_bytes is None")
        return jsonify({
            "status": "error",
            "message": "Failed to apply patches to PDF. The document may be incompatible."
        }), 500

    # Upload patched PDF to Firebase Storage
    patched_url = _upload_patched_pdf_to_storage(user_id, patched_pdf_bytes)
    if not patched_url:
        return jsonify({
            "status": "error",
            "message": "Failed to upload patched PDF to storage"
        }), 500

    logger.info(
        "[ResumePdfPatch] Uploaded patched PDF: %s (%d bytes)",
        patched_url[:80],
        len(patched_pdf_bytes),
    )

    # Build response patch_log (subset of fields for client)
    patch_log = []
    for entry in patch_log_raw:
        patch_log.append({
            "type": entry.get("type", "unknown"),
            "status": entry.get("status", "unknown"),
            "fit_success": entry.get("fit_success", False),
            "original_text_matched": entry.get("original_text_matched", ""),
            "font_size_used": entry.get("font_size_used"),
        })

    applied_count = sum(1 for e in patch_log_raw if e.get("status") == "applied")
    unsafe_count = sum(1 for e in patch_log_raw if e.get("status") == "unsafe")
    not_found_count = sum(1 for e in patch_log_raw if e.get("status") == "not_found")

    return jsonify({
        "status": "ok",
        "patched_pdf_url": patched_url,
        "all_safe": all_safe,
        "patch_log": patch_log,
        "applied_count": applied_count,
        "unsafe_count": unsafe_count,
        "not_found_count": not_found_count,
    })
