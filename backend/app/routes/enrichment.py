"""
Enrichment routes - autocomplete, job title enrichment, and LinkedIn profile enrichment
"""
from datetime import datetime, timezone
from flask import Blueprint, request, jsonify
import traceback

from app.extensions import require_firebase_auth, get_db
from app.services.pdl_client import get_autocomplete_suggestions, enrich_job_title_with_pdl
from app.utils.linkedin_enrichment import (
    normalize_linkedin_url,
    enrich_linkedin_with_fallback,
    llm_enrich_profile,
    merge_linkedin_into_resume_parsed,
)

enrichment_bp = Blueprint('enrichment', __name__, url_prefix='/api')


@enrichment_bp.route('/autocomplete/<data_type>', methods=['GET'])
@require_firebase_auth
def autocomplete_api(data_type):
    """Enhanced API endpoint for frontend autocomplete with better error handling"""
    try:
        query = request.args.get('query', '').strip()
        
        if not query or len(query) < 2:
            return jsonify({
                'suggestions': [],
                'query': query,
                'data_type': data_type
            })
        
        valid_types = ['job_title', 'company', 'location', 'school', 'skill', 'industry', 'role', 'sub_role']
        if data_type not in valid_types:
            return jsonify({
                'error': f'Invalid data type. Must be one of: {", ".join(valid_types)}',
                'suggestions': []
            }), 400
        
        print(f"Autocomplete request: {data_type} - '{query}'")
        
        suggestions = get_autocomplete_suggestions(query, data_type)
        
        clean_suggestions = []
        for suggestion in suggestions[:10]:
            if isinstance(suggestion, dict) and 'name' in suggestion:
                # Handle PDL's response format: {'name': 'value', 'count': 123}
                clean_suggestions.append(suggestion['name'])
            elif isinstance(suggestion, str) and suggestion.strip():
                clean_suggestions.append(suggestion.strip())
        
        # For location autocomplete, add "United States" if query matches US-related terms
        if data_type == 'location':
            query_lower = query.lower().strip()
            us_keywords = ['united', 'usa', 'us', 'america']
            if any(keyword in query_lower for keyword in us_keywords):
                # Add "United States" at the beginning if not already in suggestions
                if 'United States' not in clean_suggestions:
                    clean_suggestions.insert(0, 'United States')
                # Also ensure it appears even if query is very short
            elif len(query_lower) <= 2 and query_lower in ['us', 'u']:
                if 'United States' not in clean_suggestions:
                    clean_suggestions.insert(0, 'United States')
        
        return jsonify({
            'suggestions': clean_suggestions,
            'query': query,
            'data_type': data_type,
            'count': len(clean_suggestions)
        })
        
    except Exception as e:
        print(f"Autocomplete API error for {data_type} - '{query}': {e}")
        traceback.print_exc()
        
        return jsonify({
            'error': 'Failed to fetch suggestions',
            'suggestions': [],
            'query': query,
            'data_type': data_type
        }), 500


@enrichment_bp.route('/enrich-job-title', methods=['POST'])
@require_firebase_auth
def enrich_job_title_api():
    """API endpoint for job title enrichment"""
    try:
        data = request.json
        job_title = data.get('jobTitle', '').strip()
        
        if not job_title:
            return jsonify({'error': 'Job title is required'}), 400
        
        enrichment = enrich_job_title_with_pdl(job_title)
        
        return jsonify({
            'original': job_title,
            'enrichment': enrichment
        })
        
    except Exception as e:
        print(f"Job title enrichment API error: {e}")
        return jsonify({'error': str(e)}), 500


@enrichment_bp.route('/enrich-linkedin-onboarding', methods=['POST'])
@require_firebase_auth
def enrich_linkedin_for_onboarding():
    """
    Enrich a LinkedIn profile for onboarding personalization.

    Normal mode: { "linkedin_url": "..." }
      - Enriches via PDL → Bright Data fallback
      - Structures via LLM into resumeParsed format
      - Writes to Firestore, returns academics for auto-fill

    Merge-only mode: { "merge_only": true }
      - Re-merges stored linkedinResumeParsed into current resumeParsed
      - Used after resume upload to backfill LinkedIn-only fields
    """
    try:
        uid = request.firebase_user['uid']
        db = get_db()
        user_ref = db.collection('users').document(uid)
        data = request.get_json() or {}

        # ── Merge-only mode ─────────────────────────────────────────
        if data.get('merge_only'):
            return _handle_merge_only(user_ref)

        # ── Normal enrichment mode ──────────────────────────────────
        linkedin_url = data.get('linkedin_url', '').strip()
        if not linkedin_url:
            return jsonify({'success': False, 'enriched': False, 'error': 'linkedin_url is required'}), 200

        normalized = normalize_linkedin_url(linkedin_url)
        if not normalized:
            return jsonify({'success': False, 'enriched': False, 'error': 'Invalid LinkedIn URL'}), 200

        # Check for cached enrichment (per-user, keyed by uid via user_ref)
        # Only return cache if the stored URL matches the requested URL.
        # This prevents returning stale data if the user changes their LinkedIn URL.
        user_doc = user_ref.get()
        user_data = user_doc.to_dict() if user_doc.exists else {}

        if user_data.get('linkedinEnrichmentData') and user_data.get('linkedinUrl') == normalized:
            cached_parsed = user_data.get('linkedinResumeParsed', {})
            edu = cached_parsed.get('education', {}) if isinstance(cached_parsed, dict) else {}
            contact = cached_parsed.get('contact', {}) if isinstance(cached_parsed, dict) else {}
            name = cached_parsed.get('name', '') if isinstance(cached_parsed, dict) else ''
            name_parts = (name or '').strip().split(' ', 1)
            return jsonify({
                'success': True,
                'enriched': True,
                'cached': True,
                'profile': {
                    'firstName': name_parts[0] if name_parts else '',
                    'lastName': name_parts[1] if len(name_parts) > 1 else '',
                    'email': contact.get('email'),
                    'phone': contact.get('phone'),
                },
                'academics': {
                    'university': edu.get('university'),
                    'major': edu.get('major'),
                    'degree': edu.get('degree'),
                    'graduationYear': edu.get('graduation'),
                },
            })

        # Run enrichment chain: PDL → Bright Data
        raw_data, source = enrich_linkedin_with_fallback(normalized)
        if not raw_data:
            return jsonify({'success': False, 'enriched': False, 'error': 'Could not fetch LinkedIn profile'}), 200

        # LLM structuring
        linkedin_parsed = llm_enrich_profile(raw_data, source)
        if not linkedin_parsed or not linkedin_parsed.get('name'):
            return jsonify({'success': False, 'enriched': False, 'error': 'Failed to structure profile data'}), 200

        # Write enrichment metadata to Firestore
        enrichment_update = {
            'linkedinUrl': normalized,
            'linkedinEnrichmentData': raw_data,
            'linkedinEnrichmentSource': source,
            'linkedinEnrichedAt': datetime.now(timezone.utc).isoformat(),
            'linkedinResumeParsed': linkedin_parsed,
        }

        # Determine whether to write or merge resumeParsed
        existing_parsed = user_data.get('resumeParsed')
        if existing_parsed and isinstance(existing_parsed, dict) and existing_parsed.get('name'):
            # Merge: resume is primary, LinkedIn supplements
            merged = merge_linkedin_into_resume_parsed(existing_parsed, linkedin_parsed)
            enrichment_update['resumeParsed'] = merged
        else:
            # No resume — LinkedIn becomes the resumeParsed
            enrichment_update['resumeParsed'] = linkedin_parsed

        user_ref.set(enrichment_update, merge=True)

        # Extract profile + academics for frontend auto-fill
        edu = linkedin_parsed.get('education', {}) if isinstance(linkedin_parsed, dict) else {}
        contact = linkedin_parsed.get('contact', {}) if isinstance(linkedin_parsed, dict) else {}
        name = linkedin_parsed.get('name', '') if isinstance(linkedin_parsed, dict) else ''
        name_parts = (name or '').strip().split(' ', 1)
        return jsonify({
            'success': True,
            'enriched': True,
            'cached': False,
            'source': source,
            'profile': {
                'firstName': name_parts[0] if name_parts else '',
                'lastName': name_parts[1] if len(name_parts) > 1 else '',
                'email': contact.get('email'),
                'phone': contact.get('phone'),
            },
            'academics': {
                'university': edu.get('university'),
                'major': edu.get('major'),
                'degree': edu.get('degree'),
                'graduationYear': edu.get('graduation'),
            },
        })

    except Exception as e:
        print(f"[LinkedIn Enrich] Unhandled error for uid={request.firebase_user.get('uid', '?')}: {e}")
        traceback.print_exc()
        return jsonify({'success': False, 'enriched': False, 'error': 'Internal error'}), 200


def _handle_merge_only(user_ref):
    """Re-merge stored LinkedIn data into current resumeParsed."""
    try:
        user_doc = user_ref.get()
        if not user_doc.exists:
            return jsonify({'success': False, 'merged': False, 'error': 'User not found'}), 200

        user_data = user_doc.to_dict()
        linkedin_parsed = user_data.get('linkedinResumeParsed')
        existing_parsed = user_data.get('resumeParsed')

        if not linkedin_parsed or not isinstance(linkedin_parsed, dict):
            return jsonify({'success': False, 'merged': False, 'error': 'No LinkedIn data to merge'}), 200

        if not existing_parsed or not isinstance(existing_parsed, dict):
            # No resume yet — just write LinkedIn as resumeParsed
            user_ref.set({'resumeParsed': linkedin_parsed}, merge=True)
            return jsonify({'success': True, 'merged': True})

        merged = merge_linkedin_into_resume_parsed(existing_parsed, linkedin_parsed)
        user_ref.set({'resumeParsed': merged}, merge=True)
        return jsonify({'success': True, 'merged': True})

    except Exception as e:
        print(f"[LinkedIn Merge] Error: {e}")
        traceback.print_exc()
        return jsonify({'success': False, 'merged': False, 'error': 'Merge failed'}), 200

