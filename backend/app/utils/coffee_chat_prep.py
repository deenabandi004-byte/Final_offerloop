"""
Coffee chat prep utilities - commonality detection, similarity generation
"""
import logging
import re

from app.utils.users import (
    extract_hometown_from_resume,
    extract_companies_from_resume,
    get_university_shorthand,
    get_university_mascot
)

logger = logging.getLogger(__name__)


def detect_commonality(user_info, contact, resume_text):
    """
    Detect strongest commonality between user and contact.
    Returns: (commonality_type, details_dict)
    """
    user_university = (user_info.get('university', '') or '').lower()
    contact_education = (
        (contact.get('College', '') or '') + ' ' + 
        (contact.get('EducationTop', '') or '')
    ).lower()
    contact_company = (contact.get('Company', '') or '').lower()
    
    # 1. Check same university (STRONGEST commonality)
    if user_university and user_university in contact_education:
        university = user_info.get('university', '')
        return ('university', {
            'university': university,
            'university_short': get_university_shorthand(university),
            'mascot': get_university_mascot(university)
        })
    
    # 2. Check same hometown
    user_hometown = extract_hometown_from_resume(resume_text or '')
    contact_city = (contact.get('City', '') or '').lower()
    if user_hometown and user_hometown.lower() in contact_city:
        return ('hometown', {
            'hometown': user_hometown
        })
    
    # 3. Check same company/internship
    user_companies = extract_companies_from_resume(resume_text or '')
    if contact_company and any(uc.lower() in contact_company for uc in user_companies if uc):
        connection_type = 'interned' if 'intern' in (resume_text or '').lower() else 'worked'
        role_type = 'Intern' if 'intern' in (resume_text or '').lower() else 'Team Member'
        return ('company', {
            'company': contact.get('Company', ''),
            'connection_type': connection_type,
            'role_type': role_type
        })
    
    # 4. No strong commonality - use general template
    return ('general', {})


def generate_coffee_chat_similarity(user_data, contact_data):
    """
    Generate similarity summary for coffee chat.
    Returns empty string if no strong similarities found (quality over quantity).
    """
    try:
        from app.services.openai_client import get_openai_client
        client = get_openai_client()
        if not client:
            return ""
        
        # Check geographic similarity eligibility: require explicit locations from both parties
        user_location = (user_data.get('contact', {}).get('location', '') if isinstance(user_data.get('contact'), dict) else '') or ''
        contact_location = (contact_data.get('location', '') or '').strip()
        user_location = user_location.strip()
        
        # Geographic similarity is ONLY allowed if both parties have explicit current locations
        geographic_similarity_allowed = bool(user_location and contact_location)
        
        prompt = f"""You are generating a high-quality coffee chat preparation brief. Your goal is to surface ONLY information that is accurate, clearly relevant, and natural for a real conversation. Silence is preferable to weak or speculative content.

GLOBAL QUALITY RULES:
1. Do NOT invent, assume, or exaggerate similarities. If a connection is not explicit in the data, use tentative language or omit it entirely.
2. Do NOT include generic content. If a sentence could apply to most professionals, it must be discarded.
3. Prefer restraint over coverage. Fewer, stronger items beat more, weaker ones.
4. If relevance is uncertain → OMIT CONTENT. Return "NONE".

SIMILARITY SUMMARY RULES:
Generate a 45-60 word paragraph describing 2-3 of the STRONGEST, MOST EXPLICIT connections between the student and professional.

Allowed similarity types (ranked by strength):
1. Shared university or academic background (EXPLICIT match required)
2. Similar early career steps or transitions (EXPLICIT evidence required)
3. Geographic similarity (ONLY if both parties' current locations are explicitly present and match)
4. Clearly evidenced shared interests or work style (EXPLICIT evidence required)

GEOGRAPHIC SIMILARITY RULES:
- Geographic similarity is ONLY permitted if BOTH the student's current location AND the professional's current location are explicitly stated in the data.
- Shared university location (e.g., USC) may be referenced as educational connection, but NOT framed as shared residence or geographic overlap.
- Do NOT use phrases like "shared geographic link" or "both from [place]" unless BOTH current locations are explicitly present and clearly match.
- If location confidence is insufficient, OMIT geographic similarity entirely.

STRICT FILTERING RULES:
- Explicitly ignore weak or generic overlaps (e.g. "both work in the same industry", "both are professionals", "shared commitment to excellence").
- If a similarity is inferred (not explicit), you MUST use tentative language (e.g. "may reflect", "suggests", "could indicate", "appears to").
- Never state facts as certain if they are not explicitly in the data.
- Never overstate entrepreneurial, leadership, or personal traits unless directly supported by explicit data.
- End with a declarative conversational bridge that frames the conversation (do NOT end with a question).
- Similarity summaries MUST NOT end with a question mark. Frame the conversation, don't ask questions.
- If no strong, explicit similarities exist (only generic or weak ones), return ONLY the word "NONE" and nothing else.

USER DATA:
Name: {user_data.get('name', '')}
University: {user_data.get('university', '')}
Major: {user_data.get('major', '')}
Education: {user_data.get('education', {})}
Experience: {user_data.get('experience', [])}
Location: {user_data.get('contact', {}).get('location', '') if isinstance(user_data.get('contact'), dict) else ''}

CONTACT DATA:
Name: {contact_data.get('firstName', '')} {contact_data.get('lastName', '')}
Company: {contact_data.get('company', '')}
Job Title: {contact_data.get('jobTitle', '')}
Education: {contact_data.get('education', [])}
Location: {contact_data.get('location', '')}
Experience: {contact_data.get('experience', []) if isinstance(contact_data.get('experience'), list) else []}

Generate the similarity summary (45-60 words), or return "NONE" if no strong similarities exist."""
        
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=150,
            temperature=0.5
        )
        
        result = response.choices[0].message.content.strip()
        
        # Return empty string if model indicates no strong similarities
        if result.upper() == "NONE" or len(result) < 20:
            logger.debug("SIMILARITY_SKIPPED: no strong explicit similarities")
            return ""
        
        # Post-process to filter out generic language
        result_lower = result.lower()
        generic_phrases = [
            "both work in",
            "both are professionals",
            "shared commitment",
            "both share",
            "common interest",
            "similar passion",
            "both value",
            "shared values",
            "both professionals",
            "both individuals"
        ]
        
        # Check if result contains too many generic phrases (more than 1 = likely generic)
        generic_count = sum(1 for phrase in generic_phrases if phrase in result_lower)
        if generic_count > 1:
            logger.debug("SIMILARITY_SKIPPED: too many generic phrases")
            return ""
        
        # Check if result lacks specific details (no proper nouns, no specific references)
        # If it's all generic language, reject it
        has_specifics = any(
            word[0].isupper() for word in result.split() 
            if len(word) > 2 and word[0].isupper()
        ) or any(
            keyword in result_lower for keyword in [
                "university", "college", "school", "company", "firm",
                "role", "position", "career", "transition"
            ]
        )
        
        if not has_specifics:
            logger.debug("SIMILARITY_SKIPPED: lacks specific details")
            return ""
        
        # TASK 2: Post-process to filter out speculative geographic similarity if not allowed
        if not geographic_similarity_allowed:
            # Check for geographic similarity language
            geographic_phrases = [
                "shared geographic link", "both from", "geographic overlap",
                "same location", "both in", "shared location", "geographic connection"
            ]
            has_geographic_language = any(phrase in result_lower for phrase in geographic_phrases)
            if has_geographic_language:
                logger.debug("GEOGRAPHY_SKIPPED: insufficient confidence (both locations not explicitly present)")
                # Remove geographic similarity - return empty if result becomes too short
                # For now, we'll filter it out entirely if it's the primary content
                # This is a conservative approach - we could also try to remove just the geographic part
                if len(result.split()) < 30:
                    logger.debug("SIMILARITY_SKIPPED: result too short after geographic filtering")
                    return ""
        
        # TASK 1: Post-generation guard - ensure similarity summary does NOT end with a question mark
        if result.strip().endswith('?'):
            # Find the last sentence ending with '?'
            # Split on sentence boundaries (., !, ?)
            parts = re.split(r'([.!?])\s+', result)
            
            if len(parts) >= 3 and parts[-2] == '?':
                # Multiple sentences - rebuild all but the last
                # parts: [text1, '.', ' ', text2, '?', '']
                previous_parts = []
                for i in range(0, len(parts) - 3, 2):
                    if i < len(parts):
                        punct = parts[i+1] if i+1 < len(parts) else ''
                        sep = parts[i+2] if i+2 < len(parts) and parts[i+2].isspace() else ' '
                        previous_parts.append(parts[i] + punct + sep)
                
                # Get the last question sentence (text before the final '?')
                last_sentence = parts[-3].strip() if len(parts) >= 3 else ''
                
                # Convert last question sentence to declarative
                # Remove leading question words if present
                question_words = r'^(What|How|Why|Where|When|Who|Do|Does|Did|Are|Is|Was|Were|Would|Could|Should|Can)\s+'
                last_declarative = re.sub(question_words, '', last_sentence, flags=re.IGNORECASE).strip()
                
                # Ensure it ends with proper punctuation
                last_declarative = last_declarative.rstrip('?.,!').strip()
                if not last_declarative.endswith(('.', '!')):
                    last_declarative = last_declarative + '.'
                
                # Rebuild: join previous sentences + converted last sentence
                previous_text = ''.join(previous_parts).strip()
                if previous_text:
                    result = previous_text + ' ' + last_declarative
                else:
                    result = last_declarative
            else:
                # Single sentence question - convert to declarative
                result = result.rstrip('?').strip()
                # Remove leading question words
                question_words = r'^(What|How|Why|Where|When|Who|Do|Does|Did|Are|Is|Was|Were|Would|Could|Should|Can)\s+'
                result = re.sub(question_words, '', result, flags=re.IGNORECASE).strip()
                # Ensure it ends with proper punctuation
                result = result.rstrip('?.,!').strip()
                if not result.endswith(('.', '!')):
                    result = result + '.'
            
            logger.debug("SIMILARITY_GUARD: removed trailing question mark, converted to declarative bridge")
        
        return result
        
    except Exception as e:
        print(f"Similarity generation failed: {e}")
        return ""


def generate_coffee_chat_questions(contact_data, user_data):
    """
    Generate up to 8 candidate coffee chat questions.
    Only returns questions that are specific, relevant, and non-generic.
    """
    try:
        from app.services.openai_client import get_openai_client
        client = get_openai_client()
        if not client:
            return []
        
        prompt = f"""You are generating high-quality coffee chat questions. Your goal is to surface ONLY questions that are accurate, clearly relevant to the specific professional, and natural for a real conversation.

GLOBAL QUALITY RULES:
1. Do NOT include generic content. If a question could apply to most professionals, it must be discarded.
2. Silence is preferable to weak or speculative content.
3. Prefer fewer, stronger questions over more, weaker ones.

QUESTION GENERATION RULES:

Each question MUST:
- Reference the professional's specific role, function, or career decisions
- Reflect genuine curiosity a student would have
- Be difficult to reuse for a different professional

Explicitly REJECT any question that:
- Asks "what inspired you to..." without context
- Asks about a "typical day" without role-specific nuance
- Could be asked of almost anyone
- Mentions recruiting, hiring, or job openings

Preferred question types:
- Career inflection points or decisions
- Role realities and tradeoffs
- How school prepared (or failed to prepare) them for this role
- How their function fits into the broader organization

PROFESSIONAL:
Name: {contact_data.get('firstName', '')} {contact_data.get('lastName', '')}
Role: {contact_data.get('jobTitle', '')} at {contact_data.get('company', '')}
Education: {contact_data.get('education', [])}
Experience: {contact_data.get('experience', []) if isinstance(contact_data.get('experience'), list) else []}

STUDENT:
Field of Study: {user_data.get('major', '')}
University: {user_data.get('university', '')}

Generate up to 8 candidate questions. If fewer than 8 meet quality standards, return only those that do. Return ONLY a JSON array, no other text:
["question 1", "question 2", ...]"""
        
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "You generate thoughtful, specific networking questions. Return only valid JSON arrays. Reject generic questions."},
                {"role": "user", "content": prompt}
            ],
            max_tokens=400,
            temperature=0.6
        )
        
        import json
        result_text = response.choices[0].message.content.strip()
        # Remove markdown if present
        if '```' in result_text:
            result_text = result_text.split('```')[1]
            if result_text.startswith('json'):
                result_text = result_text[4:]
            result_text = result_text.strip()
        
        questions = json.loads(result_text)
        
        # Strict filtering: reject generic questions and require explicit references
        generic_patterns = [
            "what inspired you",
            "typical day",
            "what advice would you give",
            "most rewarding",
            "how has the industry changed",
            "what drew you",
            "what's a typical",
            "what skills are most important",
            "what challenges do you face",
            "what would you do differently",
            "how did you get into",
            "what's the most",
            "what do you enjoy most"
        ]
        
        # Patterns that indicate generic inspiration questions
        inspiration_patterns = [
            "what inspired",
            "what drew you",
            "how did you get into",
            "what made you choose"
        ]
        
        filtered = []
        job_title_lower = (contact_data.get('jobTitle', '') or '').lower()
        company_lower = (contact_data.get('company', '') or '').lower()
        
        for q in questions if isinstance(questions, list) else []:
            if not q or not isinstance(q, str):
                continue
                
            q_lower = q.lower()
            
            # Reject if matches generic patterns
            is_generic = any(pattern in q_lower for pattern in generic_patterns)
            if is_generic:
                continue
            
            # Reject generic inspiration questions without context
            is_generic_inspiration = any(pattern in q_lower for pattern in inspiration_patterns)
            if is_generic_inspiration:
                # Only allow if it has specific role/company context
                has_context = (
                    job_title_lower in q_lower or
                    company_lower in q_lower or
                    any(keyword in q_lower for keyword in ['this role', 'this position', 'this function', 'your division', 'your team', 'at ' + company_lower])
                )
                if not has_context:
                    continue
            
            # Require explicit reference to role, company, or career decisions
            has_role_reference = (
                job_title_lower in q_lower if job_title_lower else False
            )
            has_company_reference = (
                company_lower in q_lower if company_lower else False
            )
            has_career_decision_reference = any(
                keyword in q_lower for keyword in [
                    'this role', 'this position', 'this function', 
                    'your division', 'your team', 'your career',
                    'transition', 'decision', 'move to', 'switch to',
                    'chose to', 'decided to'
                ]
            )
            
            # Must have at least one explicit reference
            if not (has_role_reference or has_company_reference or has_career_decision_reference):
                continue
            
            # Additional check: reject if question could apply to most professionals
            could_apply_to_anyone = all(
                phrase not in q_lower for phrase in [
                    job_title_lower, company_lower, 'this role', 'this position',
                    'your division', 'your team', 'at ' + company_lower
                ]
            ) if (job_title_lower or company_lower) else True
            
            if could_apply_to_anyone:
                continue
            
            filtered.append(q)
        
        # If fewer than 2 high-quality questions remain, return empty list
        if len(filtered) < 2:
            logger.debug("QUESTIONS_SKIPPED: fewer than 2 quality questions (found {})".format(len(filtered)))
            return []
        
        return filtered
        
    except Exception as e:
        print(f"Question generation failed: {e}")
        return []


def _score_similarity_strength(similarity_summary: str) -> float:
    """
    Compute a 0-1 score for similarity strength based on content richness.
    Higher scores indicate more specific, detailed similarities.
    """
    if not similarity_summary:
        return 0.0
    
    import re
    
    # Count specific indicators of strong similarity
    score = 0.0
    
    # Check for specific entities (proper nouns, capitalized terms)
    capitalized_count = len(re.findall(r'\b[A-Z][a-z]+\b', similarity_summary))
    score += min(capitalized_count * 0.1, 0.4)  # Max 0.4 from entities
    
    # Check for explicit connection words
    connection_words = ['both', 'shared', 'same', 'similar', 'common', 'also', 'together', 'both']
    connection_count = sum(1 for word in connection_words if word.lower() in similarity_summary.lower())
    score += min(connection_count * 0.05, 0.2)  # Max 0.2 from connections
    
    # Check length (longer, more detailed = stronger)
    word_count = len(similarity_summary.split())
    if word_count >= 50:
        score += 0.3
    elif word_count >= 35:
        score += 0.2
    elif word_count >= 25:
        score += 0.1
    
    # Check for specific details (numbers, locations, time references)
    has_specifics = bool(re.search(r'\d+|years?|months?|university|college|company|firm', similarity_summary.lower()))
    if has_specifics:
        score += 0.1
    
    return min(score, 1.0)


def _score_question_relevance(question: str, similarity_summary: str) -> float:
    """
    Compute a 0-1 relevance score for a question based on similarity summary.
    """
    if not question or not similarity_summary:
        return 0.0
    
    import re
    
    # Extract meaningful keywords from similarity summary
    stop_words = {
        'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
        'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
        'should', 'may', 'might', 'must', 'can', 'to', 'for', 'of', 'in',
        'on', 'at', 'by', 'with', 'from', 'as', 'and', 'or', 'but', 'if',
        'than', 'that', 'this', 'these', 'those', 'i', 'you', 'he', 'she',
        'it', 'we', 'they', 'what', 'which', 'who', 'when', 'where', 'why',
        'how', 'both', 'each', 'every', 'some', 'any', 'all', 'about', 'into',
        'through', 'during', 'before', 'after', 'above', 'below', 'up', 'down',
        'out', 'off', 'over', 'under', 'again', 'further', 'then', 'once'
    }
    
    similarity_words = set()
    similarity_lower = similarity_summary.lower()
    words = re.findall(r'\b[a-zA-Z]{2,}\b', similarity_lower)
    for word in words:
        if word not in stop_words:
            similarity_words.add(word)
    
    capitalized = re.findall(r'\b[A-Z][a-z]+\b', similarity_summary)
    for word in capitalized:
        similarity_words.add(word.lower())
    
    if not similarity_words:
        return 0.0
    
    question_lower = question.lower()
    overlap_count = sum(1 for keyword in similarity_words if keyword in question_lower)
    
    # Normalize to 0-1: more keywords = higher score, but cap based on total keywords
    if not similarity_words:
        return 0.0
    
    # Score based on proportion of matched keywords (weighted by importance of keywords)
    max_possible = min(len(similarity_words), 10)  # Cap expected max matches
    normalized_score = min(overlap_count / max_possible, 1.0) if max_possible > 0 else 0.0
    
    # Boost score if multiple matches (exponential boost for better matches)
    if overlap_count >= 3:
        normalized_score = min(normalized_score * 1.3, 1.0)
    elif overlap_count >= 2:
        normalized_score = min(normalized_score * 1.1, 1.0)
    
    return normalized_score


def select_relevant_questions(questions: list, similarity_summary: str, max_questions: int = 3) -> list:
    """
    Select questions that best relate to the similarity summary.
    Uses lightweight keyword matching to score questions based on relevance (0-1 scores).
    
    Args:
        questions: List of question strings
        similarity_summary: The similarity summary text
        max_questions: Maximum number of questions to return (default 3)
    
    Returns:
        List of selected questions, ordered by relevance score (highest first)
    """
    if not questions or not similarity_summary:
        return (questions or [])[:max_questions]
    
    # Score each question (0-1)
    scored_questions = []
    for question in questions:
        if not question:
            continue
        score = _score_question_relevance(question, similarity_summary)
        scored_questions.append((score, question))
    
    # Sort by score (descending)
    scored_questions.sort(key=lambda x: x[0], reverse=True)
    
    # Select top N questions (prefer higher scores, but include lower scores if needed)
    selected = []
    for score, q in scored_questions:
        if len(selected) >= max_questions:
            break
        selected.append(q)
    
    return selected if selected else (questions or [])[:max_questions]

