"""
User management routes
"""
from flask import Blueprint, jsonify, request
from app.extensions import require_firebase_auth, get_db
from app.routes.job_board import (
    get_user_career_profile,
    normalize_intent,
    _clear_user_profile_cache,
    _get_cached_user_profile,
)
from firebase_admin import firestore
import json

users_bp = Blueprint('users', __name__, url_prefix='/api/users')

# =============================================================================
# PHASE 5: Job-Relevant Fields That Trigger Recomputation
# =============================================================================

JOB_RELEVANT_FIELDS = {
    "location.preferredLocation",
    "location.interests",
    "location.careerInterests",
    "location.jobTypes",
    "academics.graduationYear",
    "academics.graduationMonth",
    "academics.degree",
    "academics.university",
    "professionalInfo.interests",  # Legacy path
    "jobTypes",  # Legacy top-level path
    "graduationYear",  # Legacy top-level path
}


def _get_nested_field(data: dict, field_path: str) -> any:
    """
    Get nested field value using dot notation (e.g., "location.preferredLocation").
    """
    parts = field_path.split(".")
    value = data
    for part in parts:
        if isinstance(value, dict):
            value = value.get(part)
        else:
            return None
    return value


def _set_nested_field(data: dict, field_path: str, value: any):
    """
    Set nested field value using dot notation.
    """
    parts = field_path.split(".")
    current = data
    for i, part in enumerate(parts):
        if i == len(parts) - 1:
            current[part] = value
        else:
            if part not in current:
                current[part] = {}
            current = current[part]


def _detect_job_relevant_changes(old_data: dict, new_data: dict) -> list:
    """
    Detect if any job-relevant fields changed between old and new data.
    
    Returns:
        List of changed field paths
    """
    changed_fields = []
    
    for field_path in JOB_RELEVANT_FIELDS:
        old_value = _get_nested_field(old_data, field_path)
        new_value = _get_nested_field(new_data, field_path)
        
        # Compare values (handle lists specially)
        if old_value != new_value:
            # Deep comparison for lists
            if isinstance(old_value, list) and isinstance(new_value, list):
                if sorted(old_value) != sorted(new_value):
                    changed_fields.append(field_path)
            elif old_value != new_value:
                changed_fields.append(field_path)
    
    return changed_fields


def _compare_intent_contracts(old_intent: dict, new_intent: dict) -> bool:
    """
    Compare two intent contracts to detect meaningful changes.
    
    Returns:
        True if intent meaningfully changed, False otherwise
    """
    # Compare key fields that affect job recommendations
    key_fields = [
        "career_domains",
        "preferred_locations",
        "job_types",
        "graduation_timing.career_phase",
        "graduation_timing.months_until_graduation",
    ]
    
    for field in key_fields:
        if "." in field:
            # Nested field
            parts = field.split(".")
            old_val = old_intent
            new_val = new_intent
            for part in parts:
                old_val = old_val.get(part, {}) if isinstance(old_val, dict) else None
                new_val = new_val.get(part, {}) if isinstance(new_val, dict) else None
            
            if old_val != new_val:
                return True
        else:
            # Top-level field
            old_val = old_intent.get(field)
            new_val = new_intent.get(field)
            
            # Special handling for lists
            if isinstance(old_val, list) and isinstance(new_val, list):
                if sorted(old_val) != sorted(new_val):
                    return True
            elif old_val != new_val:
                return True
    
    return False


@users_bp.route('/update-preferences', methods=['POST'])
@require_firebase_auth
def update_user_preferences():
    """
    PHASE 5: Update user preferences with intent change detection.
    
    Detects if preference changes affect job recommendations and invalidates
    caches accordingly.
    
    Request body:
    {
        "updates": {
            "location": {
                "preferredLocation": ["New York, NY", "San Francisco, CA"]
            },
            "academics": {
                "graduationYear": "2026"
            },
            ...
        }
    }
    
    Returns:
    {
        "success": true,
        "intentChanged": true/false,
        "changedFields": ["location.preferredLocation", ...]
    }
    """
    try:
        db = get_db()
        if not db:
            return jsonify({"error": "Database not available"}), 500
        
        user_id = request.firebase_user.get('uid')
        data = request.get_json() or {}
        updates = data.get("updates", {})
        
        if not updates:
            return jsonify({"error": "No updates provided"}), 400
        
        # Get current user data
        user_ref = db.collection("users").document(user_id)
        user_doc = user_ref.get()
        
        if not user_doc.exists:
            return jsonify({"error": "User not found"}), 404
        
        old_data = user_doc.to_dict()
        
        # PHASE 5: Detect job-relevant field changes BEFORE update
        changed_fields = _detect_job_relevant_changes(old_data, {**old_data, **updates})
        
        # PHASE 5: Get old intent contract for comparison
        old_profile = get_user_career_profile(user_id)
        old_intent = old_profile.get("_intent_contract")
        if not old_intent:
            # Compute old intent if not cached
            old_intent = normalize_intent(old_profile)
        
        print(f"[IntentUpdate] user={user_id[:8]}... updated_fields={changed_fields}")
        
        # Apply updates to Firestore
        # Convert nested updates to Firestore-compatible format
        firestore_updates = {}
        for key, value in updates.items():
            if isinstance(value, dict):
                # Nested update (e.g., location.preferredLocation)
                for nested_key, nested_value in value.items():
                    firestore_updates[f"{key}.{nested_key}"] = nested_value
            else:
                firestore_updates[key] = value
        
        user_ref.update(firestore_updates)
        
        # PHASE 5: Recompute new intent contract AFTER update
        # Clear profile cache to force fresh fetch
        _clear_user_profile_cache(user_id)
        new_profile = get_user_career_profile(user_id)
        new_intent = normalize_intent(new_profile)
        
        # PHASE 5: Compare old vs new intent
        intent_changed = _compare_intent_contracts(old_intent, new_intent)
        
        print(f"[IntentUpdate] old_intent={json.dumps({k: v for k, v in old_intent.items() if k != 'preferred_locations'}, default=str)[:200]}...")
        print(f"[IntentUpdate] new_intent={json.dumps({k: v for k, v in new_intent.items() if k != 'preferred_locations'}, default=str)[:200]}...")
        print(f"[IntentUpdate] intent_changed={intent_changed}")
        
        # PHASE 5: Invalidate job board cache if intent changed
        if intent_changed:
            # Clear user profile cache (already cleared, but ensure it stays clear)
            _clear_user_profile_cache(user_id)
            
            # Invalidate job cache in Firestore (delete all cached jobs for this user's queries)
            # Note: We can't easily identify user-specific cache keys, so we rely on TTL
            # But we can add a user-specific invalidation marker
            invalidation_ref = db.collection("job_cache_invalidations").document(user_id)
            invalidation_ref.set({
                "invalidated_at": firestore.SERVER_TIMESTAMP,
                "reason": "intent_changed",
                "changed_fields": changed_fields
            }, merge=True)
            
            print(f"[JobBoard][INVALIDATE] user={user_id[:8]}... reason=intent_changed changed_fields={changed_fields}")
        else:
            print(f"[IntentUpdate] intent_unchanged — no recompute triggered")
        
        return jsonify({
            "success": True,
            "intentChanged": intent_changed,
            "changedFields": changed_fields
        })
        
    except Exception as e:
        print(f"[IntentUpdate] Error updating preferences: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

