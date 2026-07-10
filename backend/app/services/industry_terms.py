"""Industry-as-company guard.

2026-07-09: "find five hiring managers in investment banking in LA" reached
PDL with company="investment banking". The only person-records matching that
employer string are shells, stale accounts, and dead profiles (title unknown,
LinkedIn 404s) — five junk drafts shipped before anyone noticed. An industry
is a filter, never an employer; every people-search entry point checks here
before spending PDL money.

Kept deliberately small and phrase-exact: real companies with industry-y
names ("Capital One", "First Republic Bank") must never match, so this is an
exact-phrase set, not substring matching.
"""

import re

_INDUSTRY_PHRASES = {
    "investment banking", "investment banks", "investment bank", "banking",
    "ib", "finance", "financial services",
    "private equity", "pe", "hedge fund", "hedge funds", "hf",
    "venture capital", "vc", "asset management",
    "consulting", "management consulting",
    "tech", "technology", "software", "big tech",
    "law", "legal", "accounting", "real estate", "healthcare",
    "marketing", "advertising", "media",
}

_NORM = re.compile(r"[^a-z0-9 ]+")


def is_industry_not_company(name) -> bool:
    """True when the given "company" is actually an industry phrase."""
    if not name or not isinstance(name, str):
        return False
    cleaned = _NORM.sub("", name.lower()).strip()
    cleaned = re.sub(r"\s+", " ", cleaned)
    return cleaned in _INDUSTRY_PHRASES


def industry_rejection_message(name: str) -> str:
    """User-facing next move — never a dead end."""
    return (
        f'"{name}" is an industry, not a company - name a firm and I can '
        f"search it (for example: Goldman Sachs, Moelis, McKinsey, Google)."
    )
