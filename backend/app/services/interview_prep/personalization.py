"""
Personalization Engine for Interview Prep 2.0
Creates tailored content based on user profile, resume, and history
"""
import re
import json
from typing import Dict, List, Optional
from app.services.openai_client import get_openai_client
import logging
from datetime import datetime

logger = logging.getLogger(__name__)


class PersonalizationEngine:
    """Generates personalized interview prep content"""
    
    def __init__(self):
        self.client = get_openai_client()
    
    async def get_user_context(self, user_id: str, db) -> Dict:
        """
        Gather user context from various sources
        
        Returns dict with:
        - resume_data: Parsed resume if available
        - profile: User profile data
        - history: Past interview preps
        - coffee_chats: Relevant conversations
        """
        context = {
            "resume_data": None,
            "profile": {},
            "history": [],
            "coffee_chats": [],
        }
        
        try:
            # Get user document
            user_ref = db.collection("users").document(user_id)
            user_doc = user_ref.get()
            
            if user_doc.exists:
                user_data = user_doc.to_dict()
                
                # Profile data
                context["profile"] = {
                    "name": user_data.get("name", ""),
                    "email": user_data.get("email", ""),
                    "school": user_data.get("school", ""),
                    "major": user_data.get("major", ""),
                    "graduation_year": user_data.get("graduationYear", ""),
                    "target_roles": user_data.get("targetRoles", []),
                    "target_industries": user_data.get("targetIndustries", []),
                }
                
                # Resume data (if uploaded and parsed)
                context["resume_data"] = user_data.get("parsedResume", None)
            
            # Get past interview preps
            try:
                preps_ref = user_ref.collection("interview-preps").order_by(
                    "createdAt", direction="DESCENDING"
                ).limit(5)
                
                for prep in preps_ref.stream():
                    prep_data = prep.to_dict()
                    context["history"].append({
                        "company": prep_data.get("companyName", ""),
                        "role": prep_data.get("jobTitle", ""),
                        "date": prep_data.get("createdAt", ""),
                    })
            except Exception as e:
                logger.debug(f"Could not fetch interview prep history: {e}")
            
            # Get relevant coffee chats (optional)
            # Could add logic to fetch from coffee-chats collection
            
        except Exception as e:
            logger.error(f"Error fetching user context: {e}")
        
        return context
    
    def generate_fit_analysis(
        self, 
        user_context: Dict, 
        job_details: Dict
    ) -> Dict:
        """
        Generate personalized fit analysis
        
        Returns:
        - fit_score: 0-100 match score
        - strengths: List of matching qualifications
        - gaps: List of areas to address
        - recommendations: Specific prep advice
        """
        resume = user_context.get("resume_data") or {}
        profile = user_context.get("profile") or {}
        
        company = job_details.get("company_name", "")
        role = job_details.get("job_title", "")
        required_skills = job_details.get("required_skills", [])
        
        # If no resume data, return generic analysis
        if not resume:
            return {
                "fit_score": None,
                "strengths": [],
                "gaps": [],
                "recommendations": [
                    "Upload your resume to get personalized fit analysis",
                    "Review the required skills and assess your experience level",
                ],
                "personalized": False,
            }
        
        # Use AI to generate fit analysis
        if not self.client:
            logger.warning("OpenAI client not available, returning generic fit analysis")
            return {
                "fit_score": None,
                "strengths": [],
                "gaps": [],
                "recommendations": ["Could not generate personalized analysis"],
                "personalized": False,
            }
        
        prompt = f"""Analyze the fit between this candidate and job:

CANDIDATE PROFILE:
{json.dumps(resume, indent=2)}

School: {profile.get('school', 'Unknown')}
Major: {profile.get('major', 'Unknown')}
Graduation: {profile.get('graduation_year', 'Unknown')}

JOB DETAILS:
Company: {company}
Role: {role}
Required Skills: {', '.join(required_skills)}

Generate a fit analysis with:
1. fit_score (0-100): How well does the candidate match?
2. strengths: List of 3-5 matching qualifications/experiences
3. gaps: List of 1-3 areas where candidate could improve
4. recommendations: 3-5 specific prep recommendations

Respond in JSON format:
{{
    "fit_score": 85,
    "strengths": ["Strong Python experience matches requirement", ...],
    "gaps": ["Limited system design experience", ...],
    "recommendations": ["Focus on X because...", ...]
}}
"""
        
        try:
            response = self.client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": "You are a career counselor analyzing candidate-job fit. Be specific and actionable."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.4,
                max_tokens=1000,
            )
            
            result_text = response.choices[0].message.content
            
            # Parse JSON
            json_match = re.search(r'\{[\s\S]*\}', result_text)
            if json_match:
                result = json.loads(json_match.group())
                result["personalized"] = True
                return result
            else:
                raise ValueError("Could not parse fit analysis response")
            
        except Exception as e:
            logger.error(f"Fit analysis generation failed: {e}")
            return {
                "fit_score": None,
                "strengths": [],
                "gaps": [],
                "recommendations": ["Could not generate personalized analysis"],
                "personalized": False,
            }
    
    def generate_story_bank(
        self, 
        user_context: Dict, 
        job_details: Dict,
        questions: Dict[str, List[Dict]]
    ) -> Dict:
        """
        Generate personalized STAR stories based on user's experiences
        
        Returns dict with:
        - stories: List of story objects
        - personalized: Boolean indicating if stories were generated
        
        Each story object has:
        - theme/title: Story name
        - project_name: Project name from resume
        - use_for: Which questions it answers
        - situation: STAR situation
        - task: STAR task
        - action: STAR action
        - result: STAR result
        - company_connection: How to tie to target company
        """
        resume = user_context.get("resume_data") or {}
        
        if not resume:
            return {"stories": [], "personalized": False}
        
        if not self.client:
            logger.warning("OpenAI client not available, returning empty story bank")
            return {"stories": [], "personalized": False}
        
        company = job_details.get("company_name", "")
        role_category = job_details.get("role_category", "Software Engineering")
        
        # Get behavioral questions to map stories to
        behavioral_qs = questions.get("behavioral", [])[:5]
        q_list = [q.get("question", "") for q in behavioral_qs if isinstance(q, dict)]
        
        prompt = f"""Based on this candidate's resume, generate 3 STAR stories they can use in interviews.

RESUME/EXPERIENCE:
{json.dumps(resume, indent=2)}

TARGET COMPANY: {company}
ROLE TYPE: {role_category}

COMMON BEHAVIORAL QUESTIONS:
{chr(10).join(f'- {q}' for q in q_list)}

For each story, create a complete STAR response:
1. Pick a real experience from their resume
2. Structure it as Situation → Task → Action → Result
3. Include specific metrics/outcomes where possible
4. Add a "company_connection" showing how to tie it to {company}

Respond in JSON format:
{{
    "stories": [
        {{
            "theme": "Technical Challenge",
            "project_name": "[Project Name from resume]",
            "use_for": ["Tell me about a challenge", "Problem-solving example"],
            "situation": "Specific situation from their experience",
            "task": "What they needed to accomplish",
            "action": "Specific actions they took (use details from resume)",
            "result": "Quantified results where possible",
            "company_connection": "How to tie this to {company}'s values/needs"
        }}
    ]
}}

Make stories specific using actual details from the resume. Include metrics where available.
"""
        
        try:
            response = self.client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": "You are an interview coach creating STAR stories from real experiences."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.5,
                max_tokens=2000,
            )
            
            result_text = response.choices[0].message.content
            
            # Parse JSON
            json_match = re.search(r'\{[\s\S]*\}', result_text)
            if json_match:
                result = json.loads(json_match.group())
                stories = result.get("stories", [])
                # Ensure each story has theme and project_name fields
                for story in stories:
                    if 'theme' not in story and 'title' in story:
                        story['theme'] = story['title']
                    if 'project_name' not in story:
                        # Extract project name from title if available
                        title = story.get('title', '')
                        if ':' in title:
                            story['project_name'] = title.split(':', 1)[1].strip()
                        else:
                            story['project_name'] = title
                return {"stories": stories, "personalized": True}
            else:
                logger.error("Could not parse story bank response")
                return {"stories": [], "personalized": False}
            
        except Exception as e:
            logger.error(f"Story bank generation failed: {e}")
            return {"stories": [], "personalized": False}
    
    def generate_personalized_prep_plan(
        self, 
        user_context: Dict,
        job_details: Dict,
        fit_analysis: Dict
    ) -> Dict:
        """
        Generate a personalized week-by-week prep plan
        """
        gaps = fit_analysis.get("gaps", [])
        strengths = fit_analysis.get("strengths", [])
        role_category = job_details.get("role_category", "Software Engineering")
        
        # Customize based on gaps
        focus_areas = []
        if any("system design" in g.lower() for g in gaps):
            focus_areas.append("system_design")
        if any("algorithm" in g.lower() or "coding" in g.lower() for g in gaps):
            focus_areas.append("coding")
        if any("behavioral" in g.lower() or "communication" in g.lower() for g in gaps):
            focus_areas.append("behavioral")
        
        # Default plan structure
        plan = {
            "total_weeks": 4,
            "weeks": [],
            "focus_areas": focus_areas,
            "personalized_notes": [],
        }
        
        # Add personalized notes
        if strengths:
            plan["personalized_notes"].append(
                f"Your strengths: {', '.join(strengths[:3])}. Leverage these in your interviews."
            )
        if gaps:
            plan["personalized_notes"].append(
                f"Focus on improving: {', '.join(gaps[:2])}."
            )
        
        # Generate weekly plan
        if role_category == "Software Engineering":
            plan["weeks"] = [
                {
                    "week": 1,
                    "title": "Foundations",
                    "tasks": [
                        "Complete 20 easy LeetCode problems",
                        "Review Big O notation",
                        "Study basic algorithms: sorting, searching, BFS/DFS",
                    ],
                    "personalized": f"Focus extra time on {gaps[0] if gaps else 'fundamentals'}",
                },
                {
                    "week": 2,
                    "title": "Core Problems",
                    "tasks": [
                        "Complete 30 medium LeetCode problems",
                        "Focus on company-tagged problems",
                        "Practice explaining your approach out loud",
                    ],
                },
                {
                    "week": 3,
                    "title": "System Design",
                    "tasks": [
                        "Read System Design Primer",
                        "Practice 3-4 common design problems",
                        "Understand caching, load balancing, databases",
                    ],
                },
                {
                    "week": 4,
                    "title": "Behavioral + Mock",
                    "tasks": [
                        "Refine your STAR stories",
                        "Do 2-3 mock interviews",
                        "Research the company thoroughly",
                    ],
                },
            ]
        elif role_category == "Consulting":
            plan["weeks"] = [
                {
                    "week": 1,
                    "title": "Case Frameworks",
                    "tasks": [
                        "Learn profitability and market entry frameworks",
                        "Read Case in Point",
                        "Practice mental math",
                    ],
                },
                {
                    "week": 2,
                    "title": "Case Practice",
                    "tasks": [
                        "Complete 10-15 cases",
                        "Find case partners on PrepLounge",
                        "Focus on structuring",
                    ],
                },
                {
                    "week": 3,
                    "title": "Advanced Cases",
                    "tasks": [
                        "Complete 15-20 more cases",
                        "Practice market sizing",
                        "Work on communication",
                    ],
                },
                {
                    "week": 4,
                    "title": "Behavioral + Mock",
                    "tasks": [
                        "Refine your STAR stories",
                        "Do 2-3 mock interviews",
                        "Research the company thoroughly",
                    ],
                },
            ]
        else:
            # Generic plan
            plan["weeks"] = [
                {
                    "week": i + 1,
                    "title": f"Week {i + 1}",
                    "tasks": [
                        "Review job requirements",
                        "Practice relevant skills",
                        "Prepare for interviews",
                    ],
                }
                for i in range(4)
            ]
        
        return plan


# Convenience function
async def personalize_prep(
    user_id: str,
    job_details: Dict,
    questions: Dict,
    db
) -> Dict:
    """Generate all personalization elements"""
    engine = PersonalizationEngine()
    
    # Get user context
    user_context = await engine.get_user_context(user_id, db)
    
    # Generate components
    fit_analysis = engine.generate_fit_analysis(user_context, job_details)
    story_bank = engine.generate_story_bank(user_context, job_details, questions)
    prep_plan = engine.generate_personalized_prep_plan(user_context, job_details, fit_analysis)
    
    return {
        "fit_analysis": fit_analysis,
        "story_bank": story_bank,
        "prep_plan": prep_plan,
        "user_context": {
            "has_resume": user_context.get("resume_data") is not None,
            "school": user_context.get("profile", {}).get("school", ""),
            "history_count": len(user_context.get("history", [])),
        }
    }

