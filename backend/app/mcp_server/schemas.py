"""
Pydantic input + output schemas for the three MCP tools.

Tier-cap fields (most importantly find_contacts.count) are intentionally
permissive at the schema level. Handlers clamp to the current tier cap.
This lets us raise the anonymous-tier cap in v2 (OAuth) by editing
handler logic only, no schema migration.
"""
from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, Field


# ── find_contacts ────────────────────────────────────────────────────────────


class FindContactsInput(BaseModel):
    company: str = Field(..., description="Target company name. Required.")
    school: Optional[str] = Field(
        None,
        description=(
            "Your school. When provided, alumni at that school rank "
            "higher and surface an alumni connection hook."
        ),
    )
    role: Optional[str] = Field(
        None,
        description="Target role or function, e.g. 'software engineer', 'M&A'.",
    )
    career_track: Optional[str] = Field(
        None,
        description=(
            "Broader career track, e.g. 'investment banking', 'tech'. Used as a "
            "fallback when role is too narrow."
        ),
    )
    count: int = Field(
        default=5,
        ge=1,
        le=25,
        description=(
            "Requested number of contacts. Schema is permissive (1-25); the "
            "anonymous tier handler clamps to 5."
        ),
    )


class Contact(BaseModel):
    name: str
    title: Optional[str] = None
    company: Optional[str] = None
    linkedin_url: Optional[str] = None
    education: Optional[str] = None
    recent_career_move: Optional[str] = None
    personalization_hook: Optional[str] = None
    relationship_type: Optional[str] = None
    warmth: Optional[str] = None  # cold | neutral | warm


class PaywallCTA(BaseModel):
    message: str
    claim_url: str
    reset_in_hours: int
    hit_cap_type: Optional[str] = None  # day | hour | budget


class FindContactsOutput(BaseModel):
    contacts: List[Contact]
    company: str
    cached: bool = False
    truncated_to: Optional[int] = None  # set when count clamped
    note: Optional[str] = None
    paywall: Optional[PaywallCTA] = None


# ── get_company_intel ────────────────────────────────────────────────────────


class GetCompanyIntelInput(BaseModel):
    company: str = Field(..., description="Target company name. Required.")
    user_school: Optional[str] = Field(
        None,
        description=(
            "Your school. When provided, returns how many alumni from that "
            "school work at the company."
        ),
    )
    career_field: Optional[str] = Field(
        None,
        description=(
            "Career field for the alumni-density filter, e.g. 'investment "
            "banking', 'software engineering'. Defaults to 'general' if omitted."
        ),
    )


class AlumniAtSchool(BaseModel):
    school: str
    count: int
    field: str
    examples_available_via: str = "find_contacts"


class CompanyOverview(BaseModel):
    description: Optional[str] = None
    headquarters: Optional[str] = None
    industries: List[str] = Field(default_factory=list)
    culture_keywords: List[str] = Field(default_factory=list)


class RecruitingSignals(BaseModel):
    hiring_momentum: Optional[str] = None
    cycle_intel: Optional[str] = None


class GetCompanyIntelOutput(BaseModel):
    company: str
    overview: CompanyOverview
    recent_news: List[str] = Field(default_factory=list)
    recruiting_signals: RecruitingSignals
    divisions: List[str] = Field(default_factory=list)
    alumni_at_your_school: Optional[AlumniAtSchool] = None
    discovery_score: Optional[int] = None
    cached: bool = False
    paywall: Optional[PaywallCTA] = None


# ── draft_outreach ───────────────────────────────────────────────────────────


class ContactRef(BaseModel):
    name: str
    title: Optional[str] = None
    company: Optional[str] = None
    linkedin_url: Optional[str] = None
    education: Optional[str] = None
    recent_career_move: Optional[str] = None


class DraftOutreachInput(BaseModel):
    contact: ContactRef
    user_school: str = Field(..., description="Your school. Required.")
    user_major: Optional[str] = None
    user_year: Optional[str] = None
    user_career_track: Optional[str] = None
    user_target_companies: Optional[List[str]] = None
    intent: str = Field(
        default="coffee_chat",
        description="One of: coffee_chat, informational_interview, referral_ask.",
    )
    personal_note: Optional[str] = Field(
        None,
        description="Free-text context to include in the email.",
    )


class DraftOutreachOutput(BaseModel):
    subject: str
    body: str
    contact_name: str
    cached: bool = False
    paywall: Optional[PaywallCTA] = None
