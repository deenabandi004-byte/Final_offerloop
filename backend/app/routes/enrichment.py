"""
Enrichment routes - autocomplete and job title enrichment
"""
from flask import Blueprint, request, jsonify
import traceback

from app.services.pdl_client import get_autocomplete_suggestions, enrich_job_title_with_pdl

enrichment_bp = Blueprint('enrichment', __name__, url_prefix='/api')


@enrichment_bp.route('/autocomplete/<data_type>', methods=['GET'])
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

