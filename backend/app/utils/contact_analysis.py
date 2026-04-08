"""
Contact analysis utilities shared between warmth_scoring and reply_generation.

Extracted from reply_generation.py to break circular imports.
"""

import re
import logging
from datetime import datetime

logger = logging.getLogger(__name__)


def _detect_career_transition(contact):
    """
    Detect if contact has made a career transition (e.g., engineering -> consulting).

    Returns:
        dict with 'type': 'transition', 'value': str, 'priority': 1
        or None if no transition detected
    """
    experience = contact.get('experience', [])
    if not isinstance(experience, list) or len(experience) < 2:
        return None

    current_job = experience[0] if experience else {}
    prev_job = experience[1] if len(experience) > 1 else {}

    if not isinstance(current_job, dict) or not isinstance(prev_job, dict):
        return None

    # Extract company and title info
    current_company = _extract_field(current_job, 'company')
    current_title = _extract_field(current_job, 'title')
    prev_company = _extract_field(prev_job, 'company')
    prev_title = _extract_field(prev_job, 'title')

    if not current_company or not prev_company:
        return None

    if current_company.lower() == prev_company.lower():
        return None  # Same company, not a transition

    # Determine transition type
    current_lower = current_title.lower()
    prev_lower = prev_title.lower()

    consulting_keywords = ['consultant', 'consulting', 'associate', 'analyst', 'manager']
    banking_keywords = ['analyst', 'associate', 'banking', 'investment', 'finance']
    engineering_keywords = ['engineer', 'developer', 'software', 'technical']

    is_consulting = any(kw in current_lower for kw in consulting_keywords)
    is_banking = any(kw in current_lower for kw in banking_keywords)
    is_engineering = any(kw in current_lower for kw in engineering_keywords)

    prev_is_consulting = any(kw in prev_lower for kw in consulting_keywords)
    prev_is_banking = any(kw in prev_lower for kw in banking_keywords)
    prev_is_engineering = any(kw in prev_lower for kw in engineering_keywords)

    transition_value = None
    if is_consulting and (prev_is_engineering or prev_is_banking):
        transition_value = "transitioned into consulting"
    elif is_banking and (prev_is_engineering or prev_is_consulting):
        transition_value = "moved into banking"
    elif is_consulting and not prev_is_consulting:
        transition_value = "transitioned into consulting"
    elif is_banking and not prev_is_banking:
        transition_value = "moved into banking"
    elif is_engineering and (prev_is_consulting or prev_is_banking):
        transition_value = "shifted from industry into consulting"

    if transition_value:
        return {
            'type': 'transition',
            'priority': 1,
            'value': transition_value
        }

    return None


def _detect_tenure(contact):
    """
    Detect tenure at current role.

    Returns:
        dict with 'type': 'tenure', 'years': int, 'value': str, 'priority': 2
        or None if tenure cannot be determined or > 3 years.

    The 'years' field is numeric for downstream consumers (e.g. warmth_scoring).
    The 'value' field is a human-readable string for email prompts.
    """
    experience = contact.get('experience', [])
    if not isinstance(experience, list) or len(experience) == 0:
        return None

    current_job = experience[0]
    if not isinstance(current_job, dict):
        return None

    start_date = current_job.get('start_date')
    if not isinstance(start_date, dict):
        # Fallback: parse from WorkSummary
        work_summary = contact.get('WorkSummary', '')
        years_match = re.search(r'\((\d+)\s+years?\s+experience\)', work_summary)
        if years_match:
            years_exp = int(years_match.group(1))
            if years_exp <= 3:
                current_year = datetime.now().year
                estimated_start_year = current_year - years_exp
                start_date = {'year': estimated_start_year}
            else:
                return None
        else:
            return None

    start_year = start_date.get('year')
    if not start_year:
        return None

    current_year = datetime.now().year
    tenure_years = current_year - start_year

    # Check if still at this job
    end_date = current_job.get('end_date')
    if end_date and isinstance(end_date, dict):
        end_year = end_date.get('year')
        if end_year and end_year < current_year:
            start_month = start_date.get('month', 1)
            end_month = end_date.get('month', 12)
            tenure_years = end_year - start_year
            if end_month < start_month:
                tenure_years -= 1

    if tenure_years > 3:
        return None

    if tenure_years <= 1:
        tenure_label = "recently joined"
    elif tenure_years <= 3:
        tenure_label = "early in your time"
    else:
        return None

    company = contact.get('Company', '')
    if company:
        tenure_label = f"{tenure_label} at {company}"

    return {
        'type': 'tenure',
        'priority': 2,
        'years': tenure_years,
        'value': tenure_label
    }


def _extract_field(job_entry, field_name):
    """Extract a string field from a job entry, handling both dict and str formats."""
    value = job_entry.get(field_name)
    if isinstance(value, dict):
        return value.get('name', '')
    elif isinstance(value, str):
        return value
    return ''
