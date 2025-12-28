"""
Scout Assistant Service - Product assistant for helping users navigate Offerloop.

This service handles the "Ask Scout" chat functionality that helps users:
- Understand features and how to use them
- Navigate to the right pages
- Troubleshoot common issues
- Learn about credits and pricing

NO credit cost for using this service.
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from app.services.openai_client import get_async_openai_client


# ============================================================================
# KNOWLEDGE BASE (mirrors frontend scout-knowledge.ts)
# ============================================================================

PAGES = {
    "home": {
        "route": "/home",
        "name": "Home / Dashboard",
        "description": "Your central hub for tracking networking progress, managing emails, and planning your recruiting timeline.",
    },
    "contactSearch": {
        "route": "/contact-search",
        "name": "Contact Search",
        "description": "Find professionals at companies to network with. Enter job title, company, and location to discover contacts and generate personalized outreach emails.",
        "creditCost": "15 credits per contact",
    },
    "firmSearch": {
        "route": "/firm-search",
        "name": "Firm Search",
        "description": "Discover companies and firms matching your criteria. Search by industry, location, and size.",
        "creditCost": "5 credits per firm",
    },
    "jobBoard": {
        "route": "/job-board",
        "name": "Job Board",
        "description": "Browse job listings, optimize your resume for specific jobs, generate cover letters, and find recruiters.",
    },
    "coffeeChatPrep": {
        "route": "/coffee-chat-prep",
        "name": "Coffee Chat Prep",
        "description": "Generate comprehensive preparation materials for networking conversations.",
        "creditCost": "15 credits per prep",
    },
    "interviewPrep": {
        "route": "/interview-prep",
        "name": "Interview Prep",
        "description": "Generate interview preparation guides based on job postings with real interview experiences.",
        "creditCost": "25 credits per prep",
    },
    "applicationLab": {
        "route": "/application-lab",
        "name": "Application Lab",
        "description": "Deep job fit analysis and application strengthening. Get detailed fit scores, resume edits, and cover letters.",
    },
    "pricing": {
        "route": "/pricing",
        "name": "Pricing",
        "description": "View and manage your subscription. Compare Free, Pro, and Elite plans.",
    },
    "accountSettings": {
        "route": "/account-settings",
        "name": "Account Settings",
        "description": "Manage your profile, upload resume, connect Gmail, and update preferences.",
    },
    "outbox": {
        "route": "/home?tab=outbox",
        "name": "Outbox",
        "description": "Manage your email threads and track responses.",
    },
    "calendar": {
        "route": "/home?tab=calendar",
        "name": "Calendar",
        "description": "View your personalized recruiting timeline with key dates and milestones.",
    },
}

CREDIT_COSTS = {
    "Contact Search": "15 credits per contact",
    "Firm Search": "5 credits per firm",
    "Coffee Chat Prep": "15 credits per prep",
    "Interview Prep": "25 credits per prep",
    "Resume Optimization": "10 credits per optimization",
    "Cover Letter": "10 credits per letter",
}

TIERS = {
    "Free": "$0/month - 300 credits, up to 3 contacts per search",
    "Pro": "$9.99/month - 1,500 credits, up to 8 contacts per search, resume matching",
    "Elite": "$34.99/month - 3,000 credits, up to 15 contacts per search, all features",
}

ROUTE_KEYWORDS = {
    "/contact-search": ["contact", "search", "find contacts", "networking", "outreach", "email", "people", "professionals"],
    "/firm-search": ["firm", "company", "companies", "employers", "find firms", "search companies"],
    "/job-board": ["job", "jobs", "listings", "openings", "positions", "resume", "cover letter", "recruiter"],
    "/coffee-chat-prep": ["coffee chat", "coffee prep", "networking prep", "informational"],
    "/interview-prep": ["interview prep", "interview preparation", "prepare for interview"],
    "/application-lab": ["application lab", "fit analysis", "job fit", "analyze application"],
    "/pricing": ["pricing", "plans", "upgrade", "subscription", "pro", "elite", "credits", "billing"],
    "/account-settings": ["settings", "account", "profile", "gmail", "connect gmail", "resume upload"],
    "/home?tab=outbox": ["outbox", "emails", "drafts", "sent", "replies"],
    "/home?tab=calendar": ["calendar", "timeline", "schedule", "deadlines"],
    "/home": ["home", "dashboard", "main"],
}


def _build_knowledge_prompt() -> str:
    """Build the knowledge section of the system prompt."""
    lines = ["PAGES AND ROUTES:"]
    for key, page in PAGES.items():
        credit_info = f" ({page.get('creditCost', 'no credit cost')})" if page.get('creditCost') else ""
        lines.append(f"- {page['name']} ({page['route']}): {page['description']}{credit_info}")
    
    lines.append("\nCREDIT COSTS:")
    for feature, cost in CREDIT_COSTS.items():
        lines.append(f"- {feature}: {cost}")
    
    lines.append("\nSUBSCRIPTION TIERS:")
    for tier, info in TIERS.items():
        lines.append(f"- {tier}: {info}")
    
    lines.append("\nCOMMON TROUBLESHOOTING:")
    lines.append("- Gmail not connected: Go to Account Settings and click 'Connect Gmail'")
    lines.append("- Out of credits: Check credits in sidebar, upgrade plan at Pricing")
    lines.append("- No contacts found: Try broader job titles or different locations")
    lines.append("- Emails seem generic: Upload resume in Account Settings for better personalization")
    
    return "\n".join(lines)


def _build_system_prompt(user_name: str, tier: str, credits: int, max_credits: int, current_page: str) -> str:
    """Build the complete system prompt for Scout assistant."""
    knowledge = _build_knowledge_prompt()
    
    routes_list = "\n".join([f"  {route}" for route in ROUTE_KEYWORDS.keys()])
    
    return f"""You are Scout, Offerloop's friendly product assistant. Your job is to help users understand and navigate the platform.

PERSONALITY:
- Helpful, concise, and friendly
- Give direct answers, not lengthy explanations
- When user wants to do something, briefly explain AND offer to navigate them there
- Use the user's name occasionally to personalize
- Keep responses to 2-4 sentences unless detailed explanation is requested

USER CONTEXT:
- Name: {user_name}
- Plan: {tier}
- Credits: {credits}/{max_credits}
- Current page: {current_page}

{knowledge}

AVAILABLE ROUTES FOR NAVIGATION:
{routes_list}

CRITICAL INSTRUCTIONS:
1. Answer questions about Offerloop features and how to use them
2. When directing user to a page, ALWAYS include the route in your response JSON's "navigate_to" field
3. Do NOT mention "click the button below" or reference any buttons in your message - the navigation button appears automatically
4. Your message should read naturally, e.g., "Head to Contact Search to find professionals" NOT "Click the button below to go to Contact Search"
5. If user asks about something outside Offerloop, politely redirect: "I'm here to help with Offerloop! What can I help you with on the platform?"
6. If you're unsure about something, say so—don't make up features
7. When mentioning credit costs, be specific about how many credits each action costs

AUTO-POPULATE INSTRUCTIONS:
When a user asks you to find specific people or companies, extract the search parameters from their request and include them in "auto_populate":

FOR CONTACT SEARCH REQUESTS:
- Extract: job_title, company, location (if mentioned)
- Examples:
  * "find me investment banking analysts from JP Morgan" → auto_populate: {{"search_type": "contact", "job_title": "Investment Banking Analyst", "company": "JP Morgan", "location": ""}}
  * "I need software engineers at Google in NYC" → auto_populate: {{"search_type": "contact", "job_title": "Software Engineer", "company": "Google", "location": "NYC"}}
  * "show me product managers at Meta" → auto_populate: {{"search_type": "contact", "job_title": "Product Manager", "company": "Meta", "location": ""}}

FOR FIRM SEARCH REQUESTS:
- Extract: industry, location, size (if mentioned)
- Examples:
  * "find me venture capital firms in San Francisco" → auto_populate: {{"search_type": "firm", "industry": "Venture Capital", "location": "San Francisco"}}
  * "show me consulting firms in Boston" → auto_populate: {{"search_type": "firm", "industry": "Consulting", "location": "Boston"}}
  * "find hedge funds in NYC" → auto_populate: {{"search_type": "firm", "industry": "Hedge Fund", "location": "NYC"}}

Always include "auto_populate" when the user is asking for specific contacts or firms, so the search fields are pre-filled when they click "Take me there."

RESPONSE FORMAT:
You must respond with valid JSON in this exact format:
{{
  "message": "Your helpful response text here",
  "navigate_to": "/route-path" or null,
  "action_buttons": [
    {{"label": "Button text", "route": "/route"}}
  ] or [],
  "auto_populate": {{
    "search_type": "contact" or "firm" or null,
    "job_title": "..." or null,
    "company": "..." or null,
    "location": "..." or null,
    "industry": "..." or null
  }} or null
}}

The "navigate_to" field should contain the most relevant route if the user is asking about or wants to go to a specific feature.
The "action_buttons" array can contain additional helpful navigation options (max 2-3 buttons).
The "auto_populate" field should only be included when the user is asking for specific contacts or firms to search for.
"""


def _detect_route_from_query(query: str) -> Optional[str]:
    """Detect if the query mentions a specific route/page."""
    query_lower = query.lower()
    
    for route, keywords in ROUTE_KEYWORDS.items():
        for keyword in keywords:
            if keyword in query_lower:
                return route
    
    return None


# ============================================================================
# DATA CLASSES
# ============================================================================

@dataclass
class ScoutAssistantResponse:
    """Response from Scout assistant."""
    message: str
    navigate_to: Optional[str] = None
    action_buttons: List[Dict[str, str]] = field(default_factory=list)
    auto_populate: Optional[Dict[str, Any]] = None
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "message": self.message,
            "navigate_to": self.navigate_to,
            "action_buttons": self.action_buttons,
            "auto_populate": self.auto_populate,
        }


# ============================================================================
# SCOUT ASSISTANT SERVICE
# ============================================================================

class ScoutAssistantService:
    """Service for Scout product assistant functionality."""
    
    DEFAULT_MODEL = "gpt-4o-mini"
    
    def __init__(self):
        self._openai = get_async_openai_client()
    
    async def handle_chat(
        self,
        *,
        message: str,
        conversation_history: Optional[List[Dict[str, str]]] = None,
        current_page: str = "/home",
        user_name: str = "there",
        tier: str = "free",
        credits: int = 0,
        max_credits: int = 300,
    ) -> Dict[str, Any]:
        """
        Handle a chat message from the user.
        
        Args:
            message: User's current message
            conversation_history: Previous messages for context
            current_page: User's current route
            user_name: User's display name
            tier: User's subscription tier
            credits: Current credit balance
            max_credits: Maximum credits for tier
        
        Returns:
            ScoutAssistantResponse as dictionary
        """
        message = (message or "").strip()
        conversation_history = conversation_history or []
        
        # Handle empty message
        if not message:
            return ScoutAssistantResponse(
                message=f"Hi{', ' + user_name if user_name != 'there' else ''}! I'm Scout, your Offerloop assistant. Ask me anything about the platform!",
                navigate_to=None,
                action_buttons=[],
            ).to_dict()
        
        # Build system prompt
        system_prompt = _build_system_prompt(
            user_name=user_name,
            tier=tier,
            credits=credits,
            max_credits=max_credits,
            current_page=current_page,
        )
        
        # Build messages for OpenAI
        messages = [{"role": "system", "content": system_prompt}]
        
        # Add conversation history (last 10 messages)
        for msg in conversation_history[-10:]:
            role = msg.get("role", "user")
            content = msg.get("content", "")
            if role in ["user", "assistant"] and content:
                messages.append({"role": role, "content": content})
        
        # Add current message
        messages.append({"role": "user", "content": message})
        
        try:
            # Call OpenAI
            response = await self._openai.chat.completions.create(
                model=self.DEFAULT_MODEL,
                messages=messages,
                temperature=0.7,
                max_tokens=500,
                response_format={"type": "json_object"},
            )
            
            # Parse response
            content = response.choices[0].message.content
            try:
                parsed = json.loads(content)
            except json.JSONDecodeError:
                # If JSON parsing fails, use content as message
                parsed = {"message": content, "navigate_to": None, "action_buttons": [], "auto_populate": None}
            
            # Extract fields
            response_message = parsed.get("message", "I'm not sure how to help with that. Could you rephrase?")
            navigate_to = parsed.get("navigate_to")
            action_buttons = parsed.get("action_buttons", [])
            auto_populate = parsed.get("auto_populate")
            
            # Validate navigate_to is a valid route
            if navigate_to and not any(navigate_to.startswith(route.split("?")[0]) for route in ROUTE_KEYWORDS.keys()):
                # Check if it's a valid route we know about
                valid_routes = ["/home", "/contact-search", "/firm-search", "/job-board", 
                               "/coffee-chat-prep", "/interview-prep", "/application-lab",
                               "/pricing", "/account-settings", "/contact-directory"]
                if navigate_to not in valid_routes and not navigate_to.startswith("/home?"):
                    navigate_to = None
            
            # Validate action buttons
            validated_buttons = []
            for btn in action_buttons[:3]:  # Max 3 buttons
                if isinstance(btn, dict) and "label" in btn and "route" in btn:
                    validated_buttons.append({
                        "label": str(btn["label"])[:50],  # Limit label length
                        "route": str(btn["route"]),
                    })
            
            # Validate auto_populate
            validated_auto_populate = None
            if auto_populate and isinstance(auto_populate, dict):
                search_type = auto_populate.get("search_type")
                if search_type == "contact":
                    validated_auto_populate = {
                        "search_type": "contact",
                        "job_title": str(auto_populate.get("job_title", ""))[:100],
                        "company": str(auto_populate.get("company", ""))[:100],
                        "location": str(auto_populate.get("location", ""))[:100],
                    }
                elif search_type == "firm":
                    validated_auto_populate = {
                        "search_type": "firm",
                        "industry": str(auto_populate.get("industry", ""))[:100],
                        "location": str(auto_populate.get("location", ""))[:100],
                        "size": str(auto_populate.get("size", ""))[:50] if auto_populate.get("size") else "",
                    }
            
            return ScoutAssistantResponse(
                message=response_message,
                navigate_to=navigate_to,
                action_buttons=validated_buttons,
                auto_populate=validated_auto_populate,
            ).to_dict()
            
        except Exception as e:
            print(f"[ScoutAssistant] Error: {type(e).__name__}: {e}")
            import traceback
            traceback.print_exc()
            
            # Return a helpful fallback response
            detected_route = _detect_route_from_query(message)
            fallback_message = "I ran into a hiccup, but I'm here to help! What would you like to know about Offerloop?"
            
            return ScoutAssistantResponse(
                message=fallback_message,
                navigate_to=detected_route,
                action_buttons=[],
                auto_populate=None,
            ).to_dict()


    async def handle_search_help(
        self,
        *,
        search_type: str,  # "contact" or "firm"
        failed_search_params: Dict[str, Any],
        error_type: str = "no_results",  # "no_results" or "error"
        user_name: str = "there",
    ) -> Dict[str, Any]:
        """
        Handle a failed search by generating helpful suggestions.
        
        Args:
            search_type: "contact" or "firm"
            failed_search_params: The original search parameters that failed
            error_type: Type of failure
            user_name: User's display name
        
        Returns:
            Dictionary with message, suggestions, and auto_populate data
        """
        if search_type == "contact":
            return await self._handle_contact_search_help(
                failed_search_params=failed_search_params,
                error_type=error_type,
                user_name=user_name,
            )
        elif search_type == "firm":
            return await self._handle_firm_search_help(
                failed_search_params=failed_search_params,
                error_type=error_type,
                user_name=user_name,
            )
        else:
            return {
                "message": "I'm not sure how to help with that search type.",
                "suggestions": [],
                "auto_populate": None,
                "search_type": search_type,
                "action": None,
            }
    
    async def _handle_contact_search_help(
        self,
        *,
        failed_search_params: Dict[str, Any],
        error_type: str,
        user_name: str,
    ) -> Dict[str, Any]:
        """Generate help for failed contact search."""
        job_title = failed_search_params.get("job_title", "")
        company = failed_search_params.get("company", "")
        location = failed_search_params.get("location", "")
        
        system_prompt = """You are Scout, a helpful assistant that suggests alternative job titles when a contact search fails.

CONTEXT:
Different companies use different job titles for the same role. For example:
- Google uses "Software Engineer", "SWE", "Software Developer"
- Amazon uses "SDE", "Software Development Engineer"
- Meta/Facebook uses "Software Engineer, IC3", "Software Engineer, E4"
- Banks use "Analyst", "Associate", "VP" levels
- Consulting uses "Consultant", "Associate", "Senior Consultant"

COMPANY-SPECIFIC KNOWLEDGE:
- Google: Uses L3-L10 levels, "SWE" is common
- Amazon: Uses "SDE" (Software Development Engineer), levels I, II, III
- Meta: Uses E3-E8 levels, "Software Engineer, IC" format
- Microsoft: Uses levels 59-67+, "Software Engineer" or "SDE"
- Apple: Uses "Software Engineer", "ICT" prefixes
- Investment banks (Goldman, JPMorgan, etc.): Analyst, Associate, VP, Director, MD
- Consulting (McKinsey, BCG, Bain): Business Analyst, Associate, Consultant, Engagement Manager
- Private Equity: Analyst, Associate, VP, Principal, Partner

YOUR TASK:
Generate 3-5 alternative job titles that might work better for the given search.
Consider:
1. The company's known naming conventions
2. Industry standard variations
3. Seniority level variations
4. Abbreviations vs full titles

RESPONSE FORMAT (JSON):
{
  "message": "Brief, friendly explanation of why the search may have failed and what you suggest",
  "suggestions": ["Alternative Title 1", "Alternative Title 2", "Alternative Title 3"],
  "recommended_title": "The single best alternative to try first"
}

Keep the message to 1-2 sentences. Be specific about the company if known."""

        user_message = f"Contact search failed for:\n- Job Title: {job_title or 'Not specified'}\n- Company: {company or 'Not specified'}\n- Location: {location or 'Not specified'}\n\nSuggest alternative job titles."

        try:
            response = await self._openai.chat.completions.create(
                model=self.DEFAULT_MODEL,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_message},
                ],
                temperature=0.7,
                max_tokens=300,
                response_format={"type": "json_object"},
            )
            
            content = response.choices[0].message.content
            parsed = json.loads(content)
            
            message = parsed.get("message", f"I couldn't find contacts matching '{job_title}'. Try these alternatives:")
            suggestions = parsed.get("suggestions", [])
            recommended = parsed.get("recommended_title", suggestions[0] if suggestions else job_title)
            
            return {
                "message": message,
                "suggestions": suggestions[:5],  # Max 5 suggestions
                "auto_populate": {
                    "job_title": recommended,
                    "company": company,
                    "location": location,
                },
                "search_type": "contact",
                "action": "retry_search",
            }
            
        except Exception as e:
            print(f"[ScoutAssistant] Contact search help failed: {type(e).__name__}: {e}")
            # Fallback suggestions based on common patterns
            fallback_suggestions = self._get_fallback_job_title_suggestions(job_title, company)
            return {
                "message": f"I couldn't find contacts matching '{job_title}'. Different companies use different titles—try one of these alternatives:",
                "suggestions": fallback_suggestions,
                "auto_populate": {
                    "job_title": fallback_suggestions[0] if fallback_suggestions else job_title,
                    "company": company,
                    "location": location,
                },
                "search_type": "contact",
                "action": "retry_search",
            }
    
    async def _handle_firm_search_help(
        self,
        *,
        failed_search_params: Dict[str, Any],
        error_type: str,
        user_name: str,
    ) -> Dict[str, Any]:
        """Generate help for failed firm search."""
        industry = failed_search_params.get("industry", "")
        location = failed_search_params.get("location", "")
        size = failed_search_params.get("size", "")
        
        system_prompt = """You are Scout, a helpful assistant that suggests alternatives when a firm search fails.

CONTEXT:
Firm searches can fail because:
1. Industry terminology varies (e.g., "VC" vs "Venture Capital" vs "Investment Firm")
2. Location is too narrow (city vs metro area vs state)
3. Company size filters are too restrictive
4. Spelling or naming variations

INDUSTRY KNOWLEDGE:
- Finance: "Investment Banking", "IB", "Investment Bank", "Financial Services"
- VC/PE: "Venture Capital", "VC", "Private Equity", "PE", "Growth Equity", "Investment Firm"
- Consulting: "Management Consulting", "Strategy Consulting", "Consulting Firm"
- Tech: "Technology", "Software", "SaaS", "Enterprise Software"
- Hedge Funds: "Hedge Fund", "Asset Management", "Investment Management", "Alternative Investments"

LOCATION SUGGESTIONS:
- If city-level fails, suggest the metro area or state
- NYC → "New York Metro", "New York State"
- SF → "Bay Area", "California"
- Boston → "Greater Boston", "Massachusetts"

YOUR TASK:
Generate 3-5 alternative search terms that might work better.
Consider:
1. Alternative industry terminology
2. Broader locations
3. Related industries

RESPONSE FORMAT (JSON):
{
  "message": "Brief, friendly explanation of why the search may have failed and what you suggest",
  "suggestions": ["Alternative 1", "Alternative 2", "Alternative 3"],
  "recommended_industry": "Best alternative industry term",
  "recommended_location": "Broader location if applicable, or original"
}

Keep the message to 1-2 sentences."""

        user_message = f"Firm search failed for:\n- Industry: {industry or 'Not specified'}\n- Location: {location or 'Not specified'}\n- Size: {size or 'Any'}\n\nSuggest alternatives."

        try:
            response = await self._openai.chat.completions.create(
                model=self.DEFAULT_MODEL,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_message},
                ],
                temperature=0.7,
                max_tokens=300,
                response_format={"type": "json_object"},
            )
            
            content = response.choices[0].message.content
            parsed = json.loads(content)
            
            message = parsed.get("message", f"I couldn't find firms matching '{industry}'. Try broadening your search:")
            suggestions = parsed.get("suggestions", [])
            recommended_industry = parsed.get("recommended_industry", suggestions[0] if suggestions else industry)
            recommended_location = parsed.get("recommended_location", location)
            
            return {
                "message": message,
                "suggestions": suggestions[:5],  # Max 5 suggestions
                "auto_populate": {
                    "industry": recommended_industry,
                    "location": recommended_location,
                    "size": size,
                },
                "search_type": "firm",
                "action": "retry_search",
            }
            
        except Exception as e:
            print(f"[ScoutAssistant] Firm search help failed: {type(e).__name__}: {e}")
            # Fallback suggestions
            fallback_suggestions = self._get_fallback_industry_suggestions(industry)
            return {
                "message": f"I couldn't find firms matching '{industry}'. Try one of these broader terms:",
                "suggestions": fallback_suggestions,
                "auto_populate": {
                    "industry": fallback_suggestions[0] if fallback_suggestions else industry,
                    "location": location,
                    "size": size,
                },
                "search_type": "firm",
                "action": "retry_search",
            }
    
    def _get_fallback_job_title_suggestions(self, job_title: str, company: str) -> List[str]:
        """Get fallback job title suggestions when OpenAI fails."""
        job_lower = job_title.lower()
        company_lower = company.lower() if company else ""
        
        # Common mappings
        if "software" in job_lower or "developer" in job_lower or "engineer" in job_lower:
            if "google" in company_lower:
                return ["SWE", "Software Developer", "Software Engineer, L3", "Software Engineer, L4"]
            elif "amazon" in company_lower:
                return ["SDE", "Software Development Engineer", "SDE I", "SDE II"]
            elif "meta" in company_lower or "facebook" in company_lower:
                return ["Software Engineer, IC3", "Software Engineer, E4", "Software Developer"]
            else:
                return ["Software Developer", "Software Engineer", "Developer", "Programmer"]
        
        if "product" in job_lower and "manager" in job_lower:
            return ["PM", "Product Lead", "Product Manager", "Product Management"]
        
        if "analyst" in job_lower:
            return ["Business Analyst", "Financial Analyst", "Data Analyst", "Associate Analyst"]
        
        if "consultant" in job_lower:
            return ["Associate", "Business Analyst", "Consultant", "Strategy Consultant"]
        
        # Generic fallback
        return [job_title, f"Senior {job_title}", f"Junior {job_title}"]
    
    def _get_fallback_industry_suggestions(self, industry: str) -> List[str]:
        """Get fallback industry suggestions when OpenAI fails."""
        industry_lower = industry.lower()
        
        if "venture" in industry_lower or "vc" in industry_lower:
            return ["Investment Firm", "Private Equity", "Growth Equity", "Venture Capital"]
        
        if "private equity" in industry_lower or "pe" in industry_lower:
            return ["Investment Firm", "Venture Capital", "Growth Equity", "Asset Management"]
        
        if "hedge" in industry_lower:
            return ["Asset Management", "Investment Management", "Alternative Investments", "Fund Management"]
        
        if "consulting" in industry_lower:
            return ["Management Consulting", "Strategy Consulting", "Business Advisory", "Professional Services"]
        
        if "investment bank" in industry_lower or "ib" in industry_lower:
            return ["Financial Services", "Investment Banking", "Corporate Finance", "Capital Markets"]
        
        # Generic fallback
        return [industry, "Financial Services", "Professional Services"]


# Create singleton instance
scout_assistant_service = ScoutAssistantService()

