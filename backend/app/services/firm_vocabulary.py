"""
Canonical firm-name vocabulary for voice understanding.

One source of truth for the firm spellings that student voice asks name, used
two ways:
  - classifier_vocab_block(): injected into scout_intent's system prompt so the
    LLM repairs phonetic mishears ("Molly's"/"Molise"/"Mose" -> Moelis) against
    a real list instead of guessing.
  - transcription_prompt(extra): the biasing prompt for audio transcription
    (whisper-family prompts truncate at ~224 tokens, so this one is budgeted).

Names are consolidated from job_board.py's TOP_FINANCE/TECH/CONSULTING lists
and app/data/company_marks.py, canonicalized to display case with aliases
dropped (one canonical spelling per firm). This module is intentionally
dependency-free — scout_intent and the transcribe route both import it.
"""

# Boutique banks / PE / HF first — the names on-device ASR reliably butchers.
# FAANG-tier names are at the tail: recognizers never miss "Google".
_FRAGILE_FINANCE = [
    "Moelis", "Evercore", "Lazard", "Centerview", "Perella Weinberg",
    "PJT Partners", "Houlihan Lokey", "Qatalyst", "Greenhill", "Rothschild",
    "Guggenheim", "Jefferies", "Piper Sandler", "Raymond James",
    "Blackstone", "KKR", "Apollo", "Carlyle", "TPG", "Warburg Pincus",
    "Thoma Bravo", "Silver Lake", "Vista Equity", "General Atlantic",
    "Bain Capital", "Advent International",
    "Citadel", "Point72", "Millennium", "Two Sigma", "Jane Street",
    "DE Shaw", "Bridgewater", "AQR", "Renaissance Technologies",
    "BlackRock", "PIMCO", "Wellington", "T. Rowe Price", "State Street",
    "Sequoia", "Andreessen Horowitz", "Kleiner Perkins", "Accel",
    "Greylock", "Lightspeed", "General Catalyst", "Benchmark",
]

_BULGE_AND_CONSULTING = [
    "Goldman Sachs", "JPMorgan", "Morgan Stanley", "Bank of America",
    "Citigroup", "Wells Fargo", "Barclays", "UBS", "Deutsche Bank",
    "Credit Suisse", "RBC",
    "McKinsey", "Bain", "BCG", "Deloitte", "PwC", "EY", "KPMG",
    "Accenture", "Oliver Wyman", "Kearney", "LEK", "Roland Berger",
    "Booz Allen", "ZS Associates", "Alvarez and Marsal", "EY-Parthenon",
    "Simon-Kucher", "Cornerstone Research",
]

_TECH = [
    "Stripe", "OpenAI", "Anthropic", "Databricks", "Palantir", "Snowflake",
    "Figma", "Ramp", "Plaid", "Notion", "Airtable", "Canva", "Datadog",
    "MongoDB", "Twilio", "Okta", "CrowdStrike", "ServiceNow", "Workday",
    "Anduril", "Scale AI", "Coinbase", "Robinhood", "DoorDash", "Instacart",
    "Uber", "Lyft", "Airbnb", "Spotify", "Pinterest", "Snap", "TikTok",
    "Salesforce", "Adobe", "Oracle", "Nvidia", "Intel", "Cisco", "IBM",
    "LinkedIn", "Tesla", "SpaceX", "Netflix",
    "Google", "Meta", "Amazon", "Apple", "Microsoft",
]

# Full canonical list, mishear-fragile names first.
CANONICAL_FIRMS = _FRAGILE_FINANCE + _BULGE_AND_CONSULTING + _TECH


def classifier_vocab_block() -> str:
    """Vocabulary line for the intent classifier's system prompt (~300 tokens
    is fine there — chat prompts don't truncate like whisper prompts do)."""
    return "Known firms (canonical spellings): " + ", ".join(CANONICAL_FIRMS) + "."


def transcription_prompt(extra=None) -> str:
    """Biasing prompt for audio transcription. Whisper-family prompts truncate
    at ~224 tokens, so budget hard: caller's hint companies (the user's own
    targets) first, then the ASR-fragile names, FAANG never makes the cut.
    Shaped as a natural sentence — biasing works better than a bare list."""
    seen = set()
    names = []
    for name in list(extra or [])[:25] + _FRAGILE_FINANCE + _BULGE_AND_CONSULTING:
        n = str(name).strip()
        if not n or n.lower() in seen:
            continue
        seen.add(n.lower())
        names.append(n)
        # ~2-3 tokens/name + joiners; 60 names lands ~180 tokens, safely under
        # the ~224-token whisper prompt truncation ceiling.
        if len(names) >= 60:
            break
    return (
        "A college student asks a recruiting assistant to find people or draft "
        "outreach at firms such as " + ", ".join(names) + "."
    )
