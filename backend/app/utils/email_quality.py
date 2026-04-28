"""
Email quality gate — deterministic checks, no LLM.

Validates generated emails meet a quality floor before the student sees them.
"""
import re

# ---------------------------------------------------------------------------
# Ask-phrase patterns (compiled once)
# ---------------------------------------------------------------------------
_ASK_PATTERNS = re.compile(
    r"15 minutes|quick chat|coffee chat|your time|would love to hear|"
    r"would appreciate|brief call|short conversation|few minutes|"
    r"chance to connect|love to learn|happy to work around your schedule|"
    r"pick your brain|hear your perspective|learn more about",
    re.IGNORECASE,
)

_TEMPLATE_LEAK = re.compile(r"\[Name\]|\[Company\]|\{\{|(?<!\w)\[\s*\]")

_GENERIC_SUBJECTS = frozenset({
    "coffee chat?", "quick question", "hi", "hello", "hey",
    "introduction", "reaching out", "networking",
})


# ---------------------------------------------------------------------------
# Shared helper (also used by metrics instrumentation in runs.py)
# ---------------------------------------------------------------------------

def has_specificity_signal(body: str, contact: dict) -> bool:
    """Return True if body contains at least one concrete reference to the recipient."""
    body_lower = body.lower()
    company = (contact.get("Company") or contact.get("company") or "").strip().lower()
    college = (contact.get("College") or contact.get("college") or "").strip().lower()
    role = (contact.get("Title") or contact.get("title") or "").strip().lower()

    if company and company in body_lower:
        return True
    if college and college in body_lower:
        return True
    if role and len(role) > 3 and role in body_lower:
        return True
    return False


# ---------------------------------------------------------------------------
# Quality check
# ---------------------------------------------------------------------------

def check_email_quality(email_subject: str, email_body: str, contact: dict) -> dict:
    """
    Deterministic quality check.

    Returns {"passed": bool, "failures": list[str]}
    Failure names: too_short, too_long, no_specificity, no_clear_ask,
                   template_leak, weak_subject
    """
    failures = []
    body = (email_body or "").strip()
    subject = (email_subject or "").strip()
    word_count = len(body.split())

    if word_count < 60:
        failures.append("too_short")
    elif word_count > 180:
        failures.append("too_long")

    if not has_specificity_signal(body, contact):
        failures.append("no_specificity")

    if not _ASK_PATTERNS.search(body):
        failures.append("no_clear_ask")

    if _TEMPLATE_LEAK.search(body) or _TEMPLATE_LEAK.search(subject):
        failures.append("template_leak")

    subject_words = len(subject.split())
    if subject_words < 3 or subject_words > 8 or subject.lower().rstrip("?").strip() in _GENERIC_SUBJECTS:
        failures.append("weak_subject")

    return {"passed": len(failures) == 0, "failures": failures}
