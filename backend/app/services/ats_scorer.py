"""
ATS Scoring Service

Provides programmatic ATS scoring with:
- Keyword matching (taxonomy-based skill extraction + synonym matching)
- Formatting validation (ATS compatibility checks)
- Job description quality assessment
- Combined scoring with AI relevance scores

Usage:
    from app.services.ats_scorer import calculate_ats_score
    
    result = calculate_ats_score(
        resume_text="...",
        job_description="...",
        ai_relevance_score=75  # From GPT
    )
"""

import re
from typing import TypedDict, List, Dict
from .skills_taxonomy import get_canonical_skill, SKILL_SYNONYMS, VARIATION_TO_CANONICAL

# Type definitions
class KeywordResult(TypedDict):
    score: int
    matched: List[str]
    missing: List[str]
    total_keywords: int

class FormattingResult(TypedDict):
    score: int
    checks: Dict[str, bool]
    issues: List[str]

class ATSScoreResult(TypedDict):
    overall: int
    keywords: int
    formatting: int
    relevance: int
    details: Dict

# Scoring weights
KEYWORD_WEIGHT = 0.35
FORMATTING_WEIGHT = 0.20
RELEVANCE_WEIGHT = 0.45

# Stop words to filter out
STOP_WORDS = {
    "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for", 
    "of", "with", "by", "from", "as", "is", "was", "are", "were", "been",
    "be", "have", "has", "had", "do", "does", "did", "will", "would",
    "should", "could", "may", "might", "must", "can", "this", "that",
    "these", "those", "i", "you", "he", "she", "it", "we", "they", "what",
    "which", "who", "when", "where", "why", "how", "all", "each", "every",
    "both", "few", "more", "most", "other", "some", "such", "no", "nor",
    "not", "only", "own", "same", "so", "than", "too", "very", "s", "t",
    "can", "will", "just", "don", "should", "now"
}


def preprocess_text(text: str) -> str:
    """Preprocess text: lowercase, remove extra whitespace."""
    text = text.lower()
    text = re.sub(r'\s+', ' ', text)
    return text.strip()


def assess_job_description_quality(job_description: str) -> dict:
    """
    Assess whether a job description has enough technical content for accurate scoring.
    
    Returns:
        - is_valid: bool - True if JD has enough technical content
        - technical_keyword_count: int - Number of recognized skills found
        - warning: str | None - Warning message if JD is low quality
    """
    if not job_description or len(job_description.strip()) < 100:
        return {
            "is_valid": False,
            "technical_keyword_count": 0,
            "warning": "Job description is too short. Please paste the full job description for accurate optimization."
        }
    
    # Extract only skills that exist in our taxonomy
    from .skills_taxonomy import VARIATION_TO_CANONICAL
    
    jd_lower = job_description.lower()
    found_skills = set()
    
    # Check for each known skill
    for variation, canonical in VARIATION_TO_CANONICAL.items():
        # Use word boundary matching to avoid partial matches
        pattern = r'\b' + re.escape(variation) + r'\b'
        if re.search(pattern, jd_lower):
            found_skills.add(canonical)
    
    technical_count = len(found_skills)
    
    if technical_count < 3:
        return {
            "is_valid": False,
            "technical_keyword_count": technical_count,
            "warning": "This job description doesn't list many specific technical skills. The ATS score may not accurately reflect your fit. Consider finding a more detailed job posting.",
            "found_skills": list(found_skills)
        }
    
    return {
        "is_valid": True,
        "technical_keyword_count": technical_count,
        "warning": None,
        "found_skills": list(found_skills)
    }


def extract_keywords_from_jd(job_description: str) -> List[str]:
    """
    Extract technical skills and keywords from job description.
    
    Only returns keywords that exist in our skills taxonomy to avoid
    extracting garbage like "city nj" or "sciencedegree".
    
    Returns list of canonical skill names found in the JD.
    """
    from .skills_taxonomy import VARIATION_TO_CANONICAL
    
    if not job_description:
        return []
    
    jd_lower = job_description.lower()
    found_skills = set()
    
    # Check for each known skill variation
    for variation, canonical in VARIATION_TO_CANONICAL.items():
        # Use word boundary matching
        # Escape special regex characters in the variation
        escaped = re.escape(variation)
        pattern = r'\b' + escaped + r'\b'
        
        if re.search(pattern, jd_lower):
            found_skills.add(canonical)
    
    # Return as sorted list for consistency
    return sorted(list(found_skills))


def normalize_skill(skill: str) -> str:
    """
    Normalize a skill to its canonical form using SKILL_SYNONYMS.
    
    Example: "React.js" -> "react", "ReactJS" -> "react"
    """
    skill_lower = skill.lower().strip()
    # Remove common punctuation
    skill_lower = re.sub(r'[._-]', ' ', skill_lower)
    skill_lower = re.sub(r'\s+', ' ', skill_lower).strip()
    
    # Check if it's in our synonym map
    canonical = VARIATION_TO_CANONICAL.get(skill_lower)
    if canonical:
        return canonical
    
    # If not found, return normalized version
    return skill_lower


def calculate_keyword_score(resume_text: str, job_description: str) -> KeywordResult:
    """
    Calculate keyword match score between resume and job description.
    
    Only considers skills from our taxonomy to avoid garbage keywords.
    """
    from .skills_taxonomy import VARIATION_TO_CANONICAL
    
    # Extract skills from JD (only taxonomy-recognized skills)
    jd_skills = extract_keywords_from_jd(job_description)
    
    if not jd_skills:
        # No technical skills found in JD
        return {
            "score": 50,  # Neutral score when we can't assess
            "matched": [],
            "missing": [],
            "total_keywords": 0,
            "warning": "Could not extract technical skills from job description"
        }
    
    # Check which skills appear in resume
    resume_lower = resume_text.lower()
    matched = []
    missing = []
    
    for skill in jd_skills:
        # Check for the canonical skill and all its variations
        skill_found = False
        
        # Check canonical form
        pattern = r'\b' + re.escape(skill) + r'\b'
        if re.search(pattern, resume_lower):
            skill_found = True
        
        # Check all variations that map to this canonical skill
        if not skill_found:
            for variation, canonical in VARIATION_TO_CANONICAL.items():
                if canonical == skill:
                    pattern = r'\b' + re.escape(variation) + r'\b'
                    if re.search(pattern, resume_lower):
                        skill_found = True
                        break
        
        if skill_found:
            matched.append(skill)
        else:
            missing.append(skill)
    
    # Calculate score
    score = (len(matched) / len(jd_skills) * 100) if jd_skills else 50
    
    return {
        "score": round(min(score, 100)),
        "matched": matched,
        "missing": missing[:10],  # Top 10 missing
        "total_keywords": len(jd_skills)
    }


def calculate_formatting_score(resume_text: str) -> FormattingResult:
    """
    Check resume for ATS-friendly formatting.
    
    Checks:
        - Contact info present (email, phone)
        - Standard section headers (Experience, Education, Skills)
        - Reasonable length (200-1500 words)
        - No problematic special characters
        - Consistent date formatting
        - Has skills section
    
    Returns:
        - score: 0-100 based on checks passed
        - checks: Dict of check_name -> passed boolean
        - issues: List of human-readable issues to fix
    """
    checks = {}
    issues = []
    
    # Check for email
    email_pattern = r'[\w\.-]+@[\w\.-]+\.\w+'
    has_email = bool(re.search(email_pattern, resume_text, re.IGNORECASE))
    checks["has_email"] = has_email
    if not has_email:
        issues.append("Add your email address to your contact information")
    
    # Check for phone
    phone_pattern = r'[\d\-\(\)\+\s]{10,}'
    has_phone = bool(re.search(phone_pattern, resume_text))
    checks["has_phone"] = has_phone
    if not has_phone:
        issues.append("Add your phone number to your contact information")
    
    # Check for Experience section (various possible headers)
    experience_patterns = [
        r'\b(experience|work experience|employment|professional experience|work history)\b',
        r'\b(career|positions held|professional background)\b'
    ]
    has_experience = any(re.search(pattern, resume_text, re.IGNORECASE) for pattern in experience_patterns)
    checks["has_experience_section"] = has_experience
    if not has_experience:
        issues.append("Add a Work Experience section to showcase your professional history")
    
    # Check for Education section
    education_patterns = [
        r'\b(education|academic|degrees|university|college)\b',
        r'\b(school|degree|qualifications)\b'
    ]
    has_education = any(re.search(pattern, resume_text, re.IGNORECASE) for pattern in education_patterns)
    checks["has_education_section"] = has_education
    if not has_education:
        issues.append("Add an Education section to list your degrees and academic background")
    
    # Check for Skills section
    skills_patterns = [
        r'\b(skills|technical skills|competencies|technologies|tools)\b',
        r'\b(expertise|proficiencies|capabilities)\b'
    ]
    has_skills = any(re.search(pattern, resume_text, re.IGNORECASE) for pattern in skills_patterns)
    checks["has_skills_section"] = has_skills
    if not has_skills:
        issues.append("Add a dedicated Skills section to highlight your technical abilities")
    
    # Check length (word count)
    words = resume_text.split()
    word_count = len(words)
    reasonable_length = 200 <= word_count <= 1500
    checks["reasonable_length"] = reasonable_length
    if word_count < 200:
        issues.append("Your resume is too short - consider adding more detail about your experience and achievements")
    elif word_count > 1500:
        issues.append("Your resume is too long - consider condensing to 1-2 pages for better ATS readability")
    
    # Check for problematic special characters
    problematic_chars = ['●', '◦', '→', '★', 'résumé', '•', '▪', '▸']
    has_problematic_chars = any(char in resume_text for char in problematic_chars)
    checks["clean_characters"] = not has_problematic_chars
    if has_problematic_chars:
        issues.append("Remove special characters (bullets, arrows) that may not parse correctly in ATS systems")
    
    # Check for dates (various formats)
    date_patterns = [
        r'\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b',  # MM/DD/YYYY
        r'\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4}\b',  # Month Year
        r'\b\d{4}\b',  # Year only
        r'\b(present|current|now)\b'
    ]
    has_dates = any(re.search(pattern, resume_text, re.IGNORECASE) for pattern in date_patterns)
    checks["has_dates"] = has_dates
    if not has_dates:
        issues.append("Add dates to your experience entries to show timeline and progression")
    
    # Calculate score based on checks passed
    total_checks = len(checks)
    passed_checks = sum(1 for passed in checks.values() if passed)
    score = int((passed_checks / total_checks) * 100) if total_checks > 0 else 0
    
    return {
        "score": min(score, 100),
        "checks": checks,
        "issues": issues
    }


def generate_suggestions(
    keyword_result: KeywordResult,
    formatting_result: FormattingResult,
    jd_quality: dict = None
) -> List[str]:
    """
    Generate actionable improvement suggestions.
    
    Only suggests adding REAL skills, not garbage keywords.
    """
    suggestions = []
    
    # Add JD quality warning first if applicable
    if jd_quality and jd_quality.get("warning"):
        suggestions.append(jd_quality["warning"])
    
    # Missing keywords suggestion - only if we have real skills
    missing = keyword_result.get("missing", [])
    if missing and len(missing) > 0:
        # These are already filtered to taxonomy skills
        skills_str = ", ".join(missing[:5])
        suggestions.append(f"Consider adding these skills if you have experience with them: {skills_str}")
    
    # Low keyword match warning
    if keyword_result["score"] < 40 and keyword_result["total_keywords"] >= 3:
        suggestions.append(
            "Your resume is missing several key skills from the job description. "
            "Focus on highlighting relevant technical experience."
        )
    
    # Formatting issues
    for issue in formatting_result.get("issues", []):
        suggestions.append(issue)
    
    return suggestions[:10]  # Limit to 10 suggestions


def calculate_ats_score(
    resume_text: str,
    job_description: str,
    ai_relevance_score: int = 75
) -> ATSScoreResult:
    """
    Main scoring function with job description quality check.
    """
    # Check JD quality first
    jd_quality = assess_job_description_quality(job_description)
    
    # Validate inputs
    if not resume_text or not job_description:
        return {
            "overall": 0,
            "keywords": 0,
            "formatting": 0,
            "relevance": ai_relevance_score,
            "details": {
                "matched_keywords": [],
                "missing_keywords": [],
                "formatting_checks": {},
                "formatting_issues": [],
                "suggestions": ["Resume or job description is missing"],
                "jd_quality_warning": jd_quality.get("warning"),
                "technical_keywords_in_jd": jd_quality.get("technical_keyword_count", 0)
            }
        }
    
    # Ensure ai_relevance_score is in valid range
    ai_relevance_score = max(0, min(100, ai_relevance_score))
    
    # Calculate keyword score
    keyword_result = calculate_keyword_score(resume_text, job_description)
    
    # Calculate formatting score
    formatting_result = calculate_formatting_score(resume_text)
    
    # Calculate overall score
    overall = round(
        keyword_result["score"] * KEYWORD_WEIGHT +
        formatting_result["score"] * FORMATTING_WEIGHT +
        ai_relevance_score * RELEVANCE_WEIGHT
    )
    
    # Generate suggestions (include JD quality info)
    suggestions = generate_suggestions(keyword_result, formatting_result, jd_quality)
    
    return {
        "overall": min(overall, 100),
        "keywords": keyword_result["score"],
        "formatting": formatting_result["score"],
        "relevance": ai_relevance_score,
        "details": {
            "matched_keywords": keyword_result["matched"],
            "missing_keywords": keyword_result["missing"],
            "total_keywords": keyword_result["total_keywords"],
            "formatting_checks": formatting_result["checks"],
            "formatting_issues": formatting_result["issues"],
            "suggestions": suggestions,
            "jd_quality_warning": jd_quality.get("warning"),
            "technical_keywords_in_jd": jd_quality.get("technical_keyword_count", 0)
        }
    }

