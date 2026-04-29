"""
Email generator — locked dataclass interface (§4.1 of the eng review).

This module is the contract that both the founder and co-founder converge
on for Phase 7. The dataclass shapes are the deliverable; both sides must
import from here so the signature can't drift.

PHASE 1 SCOPE: dataclasses only. The implementation of `generate_email`
itself is Phase 7 territory and is owned by the co-founder. The function
exists as a stub that raises NotImplementedError so downstream imports
succeed but accidental Phase-1 callers fail loudly.

Do NOT add fields to these dataclasses without the cross-engineer
agreement described in §4.4. Adding optional fields is fine; renaming or
removing fields is not.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Dict, List, Literal, Optional


@dataclass(frozen=True)
class StructuredProfile:
    """Locked Phase 1 fields, passed by value to the generator."""
    uid: str
    name: str
    email: str
    phone: Optional[str]
    linkedin: Optional[str]
    school: Optional[str]
    school_short: Optional[str]              # "USC", "Duke" — for greetings
    major: Optional[str]
    graduation_year: Optional[int]
    graduation_status: Optional[Literal['student', 'recent_grad', 'experienced']]
    current_role: Optional[str]
    current_company: Optional[str]
    target_industries: List[str]
    target_companies: List[str]
    target_role_types: List[str]
    interest_tags: List[str]
    tone_preference: Optional[Literal['formal', 'casual', 'warm']]
    length_preference: Optional[Literal['short', 'medium']]


@dataclass(frozen=True)
class VoiceModel:
    avg_length_words: int
    formality_score: float                   # 0.0 (casual) – 1.0 (formal)
    opener_style: Literal['direct', 'warm', 'contextual', 'question', 'none']
    closer_style: Literal['direct', 'warm', 'grateful', 'none']
    signature_pattern: str                   # template, e.g. "Best,\n{name}\n{school_short} | Class of {year}"


@dataclass(frozen=True)
class InterestModel:
    top_industries: List[str]                # ranked
    top_companies: List[str]                 # ranked
    emerging_interests: List[str]            # rising in last 30d
    pivot_signal: Optional[str]              # "shifted from IB → consulting" if detected


@dataclass(frozen=True)
class BehaviorStats:
    edit_rate_30d: float                     # 0.0–1.0, fraction of drafts edited
    reply_rate_30d: float
    avg_edit_distance: float                 # words changed per email


@dataclass(frozen=True)
class DerivedProfile:
    voice_model: Optional[VoiceModel]
    interest_model: Optional[InterestModel]
    behavior_stats: Optional[BehaviorStats]
    last_synthesized_at: Optional[datetime]
    synthesized_from_event_count: int


@dataclass(frozen=True)
class CompanyContext:
    company_id: str
    company_name: str
    reason: str                              # the answer, weaved into email
    source: Literal['explicit', 'inferred_from_resume', 'inferred_from_behavior']
    related_role_types: List[str]
    last_used_at: Optional[datetime]


@dataclass(frozen=True)
class Contact:
    contact_id: str
    first_name: str
    last_name: str
    company: str
    company_normalized: str
    title: str
    school: Optional[str]
    school_match: bool                       # alumni overlap with sender
    hometown_match: bool
    company_overlap: Optional[str]           # shared prior company, if any
    email: Optional[str]
    linkedin: Optional[str]


@dataclass(frozen=True)
class JobContext:
    role_type: Optional[str]
    posting_id: Optional[str]
    posting_title: Optional[str]
    industry: Optional[str]


@dataclass(frozen=True)
class GeneratedEmail:
    subject: str
    body: str
    tracking_id: str                         # the ID that goes in X-Offerloop-Tracking-Id
    template_used: str                       # "alumni_school" | "alumni_hometown" | "company_overlap" | "general" | "context_explicit"
    generation_metadata: Dict[str, Any] = field(default_factory=dict)


def generate_email(
    structured_profile: StructuredProfile,
    derived_profile: Optional[DerivedProfile],
    company_context: Optional[CompanyContext],
    contact: Contact,
    job: Optional[JobContext] = None,
) -> GeneratedEmail:
    """Phase 7 entry point — stubbed in Phase 1.

    The full implementation is owned by the co-founder per §4.3. This stub
    raises so any accidental Phase 1-3 callers fail loudly instead of
    silently downgrading users to a broken codepath.

    The signature is locked. Any change requires a cross-engineer review.
    """
    raise NotImplementedError(
        'email_generator.generate_email is the Phase 7 contract; '
        'implementation lands with co-founder. Do not call directly in '
        'Phase 1-3 — keep using reply_generation.batch_generate_emails '
        'until the USE_NEW_GENERATOR feature flag is flipped.'
    )
