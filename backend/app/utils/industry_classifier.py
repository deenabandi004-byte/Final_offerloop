"""
Canonical industry classifier.

Single source of truth for mapping company + job title to a broad industry
bucket. Used by email_baseline.py (Phase 0 aggregation) and warmth_scoring.py
(contact relevance scoring).

Buckets: investment_banking, consulting, private_equity, venture_capital,
         tech, finance, other

Order matters: specific firm names are checked before generic keywords so
"Goldman Sachs VP" hits investment_banking, not finance.
"""


# Specific firm names come BEFORE generic keywords within each industry.
# Within the dict, industries with specific firm names (IB, consulting, PE, VC)
# are checked before generic-keyword industries (tech, finance) because the
# iteration order is insertion order (Python 3.7+).
INDUSTRY_KEYWORDS = {
    "investment_banking": [
        "investment bank", "goldman", "jpmorgan", "morgan stanley",
        "citi", "barclays", "ubs", "bofa", "lazard", "evercore",
        "moelis", "centerview", "pjt", "jefferies", "deutsche bank",
        "m&a", "capital markets",
    ],
    "consulting": [
        "mckinsey", "bain", "bcg", "deloitte", "accenture", "kearney",
        "lek", "pwc", "ey", "kpmg", "consultant", "consulting",
        "advisory", "strategy",
    ],
    "private_equity": [
        "private equity", "pe fund", "buyout", "lbo",
        "kkr", "blackstone", "carlyle", "apollo", "tpg", "warburg",
    ],
    "venture_capital": [
        "venture capital", "vc fund", "seed fund", "series a",
        "a16z", "sequoia", "accel", "benchmark", "greylock",
    ],
    "tech": [
        "software", "engineer", "developer", "product manager",
        "data scientist", "machine learning", "swe", "devops",
        "full stack", "frontend", "backend",
        "google", "meta", "apple", "amazon", "microsoft",
        "netflix", "uber", "airbnb", "stripe", "databricks",
    ],
    "finance": [
        "finance", "financial analyst", "fp&a", "treasury",
        "controller", "cfo", "accounting",
        "hedge fund", "asset management", "portfolio", "trader", "quant",
    ],
}


# Map user-facing career track strings (from onboarding / account settings)
# to canonical industry keys. Lowercased for lookup.
CAREER_TRACK_TO_INDUSTRY = {
    "investment banking": "investment_banking",
    "management consulting": "consulting",
    "consulting": "consulting",
    "private equity": "private_equity",
    "venture capital": "venture_capital",
    "tech / software engineering": "tech",
    "tech": "tech",
    "product management": "tech",
    "data science / analytics": "tech",
    "finance / corporate finance": "finance",
    "finance": "finance",
    "accounting": "finance",
}


def normalize_career_track(career_track: str) -> str:
    """Map a user-facing career track label to a canonical industry key.

    Returns the INDUSTRY_KEYWORDS key if a mapping exists, otherwise
    returns the input lowered and stripped (for use as a fallback keyword).
    """
    return CAREER_TRACK_TO_INDUSTRY.get(
        (career_track or "").strip().lower(),
        (career_track or "").strip().lower(),
    )


def classify_industry(company: str, job_title: str) -> str:
    """Classify a contact into a broad industry based on company and title.

    Returns one of: investment_banking, consulting, private_equity,
    venture_capital, tech, finance, other.
    """
    text = f"{company} {job_title}".lower()
    for industry, keywords in INDUSTRY_KEYWORDS.items():
        for kw in keywords:
            if kw in text:
                return industry
    return "other"
