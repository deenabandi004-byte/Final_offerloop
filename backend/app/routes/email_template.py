"""
Email Template API — save/load user default template (purpose + style + custom instructions).
"""
from flask import Blueprint, jsonify, request
from firebase_admin import firestore

from app.extensions import require_firebase_auth, get_db
from email_templates import (
    get_available_presets,
    EMAIL_STYLE_PRESETS,
    EMAIL_PURPOSE_PRESETS,
)

EMAIL_TEMPLATE_MAX_CUSTOM_LEN = 500

VALID_PURPOSES = frozenset(EMAIL_PURPOSE_PRESETS.keys()) | {"custom"}
VALID_STYLE_PRESETS = frozenset(EMAIL_STYLE_PRESETS.keys())

email_template_bp = Blueprint("email_template", __name__, url_prefix="/api/email-template")


def _validate_body():
    """Validate POST body; returns (data, error_response). error_response is (jsonify_result, status) or None."""
    data = request.get_json(silent=True)
    if data is None:
        return None, (jsonify({"error": "Invalid or missing JSON body"}), 400)

    purpose = data.get("purpose")
    if purpose is not None and purpose not in VALID_PURPOSES:
        return None, (
            jsonify({"error": "Invalid purpose", "valid": sorted(VALID_PURPOSES)}),
            400,
        )

    style_preset = data.get("stylePreset")
    if style_preset is not None and style_preset not in VALID_STYLE_PRESETS:
        return None, (
            jsonify({"error": "Invalid stylePreset", "valid": sorted(VALID_STYLE_PRESETS)}),
            400,
        )

    custom_instructions = (data.get("customInstructions") or "").strip()
    if len(custom_instructions) > EMAIL_TEMPLATE_MAX_CUSTOM_LEN:
        return None, (
            jsonify({
                "error": "customInstructions must be at most 500 characters",
                "max": EMAIL_TEMPLATE_MAX_CUSTOM_LEN,
            }),
            400,
        )

    return {
        "purpose": purpose,
        "stylePreset": style_preset,
        "customInstructions": custom_instructions[:EMAIL_TEMPLATE_MAX_CUSTOM_LEN],
    }, None


@email_template_bp.route("", methods=["POST"])
@require_firebase_auth
def save_default():
    """Save the user's default email template (purpose, stylePreset, customInstructions)."""
    try:
        db = get_db()
    except RuntimeError as e:
        return jsonify({"error": str(e)}), 500

    data, err = _validate_body()
    if err:
        return err

    uid = request.firebase_user["uid"]
    user_ref = db.collection("users").document(uid)

    email_template = {
        "purpose": data["purpose"],
        "stylePreset": data["stylePreset"],
        "customInstructions": data["customInstructions"],
        "updatedAt": firestore.SERVER_TIMESTAMP,
    }
    user_ref.set({"emailTemplate": email_template}, merge=True)

    return jsonify({"success": True}), 200


@email_template_bp.route("", methods=["GET"])
@require_firebase_auth
def get_default():
    """Get the user's current default email template."""
    try:
        db = get_db()
    except RuntimeError as e:
        return jsonify({"error": str(e)}), 500

    uid = request.firebase_user["uid"]
    user_doc = db.collection("users").document(uid).get()

    if not user_doc.exists:
        return jsonify({
            "purpose": None,
            "stylePreset": None,
            "customInstructions": "",
        }), 200

    data = user_doc.to_dict() or {}
    template = data.get("emailTemplate") or {}

    # Handle Firestore Timestamp if present (don't send updatedAt to client unless needed)
    return jsonify({
        "purpose": template.get("purpose"),
        "stylePreset": template.get("stylePreset"),
        "customInstructions": template.get("customInstructions", "") or "",
    }), 200


@email_template_bp.route("/presets", methods=["GET"])
@require_firebase_auth
def list_presets():
    """List all available style and purpose presets for the UI."""
    presets = get_available_presets()
    return jsonify(presets), 200
