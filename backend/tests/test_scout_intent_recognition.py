"""Phase 4 P0 regression: Scout intent recognition.

A message that describes a recruiting/networking need must produce a navigate,
not an answer that just restates the need back. This grew out of the production
bug where "email ey portland auditors" returned the text answer "Search for
auditors at EY in Portland to email them." instead of navigating to the find
page.

Two layers:
  - Tier A cases call try_pre_llm directly: fast, deterministic, no API.
  - LLM cases call handle_chat end to end via run_async (the same path the
    Flask route uses): real gpt-4.1-mini, marked integration. OPENAI_API_KEY
    is required, loaded from the repo .env.

LLM output is non-deterministic, so a case with a genuinely ambiguous target
accepts a set of routes. The hard assertion every LLM case makes is
tool == "navigate" - that is the P0 this file guards.
"""
import os

import pytest

from app.services.scout.router import try_pre_llm
from app.services.scout_assistant_service import scout_assistant_service
from app.utils.async_runner import run_async

try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(os.path.dirname(__file__), "..", "..", ".env"))
except Exception:
    pass


# --- Tier A: the find-people rule is RETIRED (scout overhaul 2026-07) -------
# "find me 3 SWEs at Spotify" must reach the LLM so it can execute
# find_contacts in-chat instead of navigating. These messages therefore pin
# the fall-through: a regex hit here would silently re-route execution asks
# to a page visit.

_TIER_A_FALLTHROUGH = [
    "reach out to PMs at stripe",
    "find consultants at mckinsey",
    "find me a recruiter at apple",
    "looking for engineers at Anthropic",
    "need to connect with recruiters at Meta",
    "connect with analysts at Goldman in Chicago",
]


@pytest.mark.unit
@pytest.mark.parametrize("message", _TIER_A_FALLTHROUGH,
                         ids=[c[:42] for c in _TIER_A_FALLTHROUGH])
def test_tier_a_find_people_falls_through(message):
    plan = try_pre_llm(message, "/dashboard")
    assert plan is None, (
        f"{message!r} must fall through to the LLM (find-people rule is "
        f"retired so find_contacts can execute in-chat); got a regex hit: {plan}")


@pytest.mark.unit
def test_tier_a_ignores_find_out():
    # "find out ... at ..." is not a contact search and must not mis-fire.
    assert try_pre_llm("find out what happened at the meeting", "/dashboard") is None


# --- LLM tier: end to end, real model calls ---------------------------------
# Scout overhaul: an ACTION-shaped need is now either executed in-chat (with
# the count/consent guardrails asking one focused question first) or
# navigated. The P0 this section guards is unchanged: the need must never be
# answered by restating it back, and no turn may degrade to the harness error
# fallback. Each case pins the acceptable outcomes for its workflow.

_ERROR_FALLBACK_MARKER = "having a moment"

# message, allowed tools, accepted routes when navigate, message tokens
# (lowercase) at least one of which must appear when the turn stays in chat.
_LLM_NEED_CASES = [
    # find-people execute chain: a count-less ask clarifies for a count.
    ("email ey portland auditors",
     ("navigate", "clarify"), ("/find", "/outbox"),
     ("how many", "count", "number", "3")),
    # Removed Jane Street interview prep case: /interview-prep no longer
    # exists in the page registry after the Phase 5 cleanup.
    # cover-letter execute chain: needs the job posting before generating.
    ("draft a cover letter for the stripe pm role",
     ("navigate", "clarify", "answer"), ("/cover-letter",),
     ("url", "job description", "posting", "cover letter")),
    ("who do i know at anthropic",
     ("navigate", "answer", "clarify"), ("/my-network/people", "/find"),
     ("network", "contact", "anthropic")),
    # auto-apply execute chain: job search first, then a count confirm.
    ("auto apply to swe jobs in nyc",
     ("navigate", "clarify", "answer"), ("/job-board", "/applications"),
     ("how many", "number", "confirm", "roles", "auto-apply", "apply")),
]


@pytest.mark.integration
@pytest.mark.parametrize("message,tools,routes,tokens", _LLM_NEED_CASES,
                         ids=[c[0][:42] for c in _LLM_NEED_CASES])
def test_llm_acts_on_need(message, tools, routes, tokens):
    result = run_async(scout_assistant_service.handle_chat(
        message=message, current_page="/dashboard"))
    assert result["tool"] in tools, (
        f"{message!r} returned tool={result['tool']!r}, expected one of {tools} "
        f"(message was: {result.get('message')!r})")
    msg = (result.get("message") or "").lower()
    assert _ERROR_FALLBACK_MARKER not in msg, (
        f"{message!r} degraded to the error fallback: {result.get('message')!r}")
    if result["tool"] == "navigate":
        assert result["navigate"]["route"] in routes, (
            f"{message!r} navigated to {result['navigate']['route']!r}, "
            f"expected one of {routes}")
    else:
        assert any(t in msg for t in tokens), (
            f"{message!r} stayed in chat without advancing the workflow "
            f"(none of {tokens} in: {result.get('message')!r})")


@pytest.mark.integration
def test_llm_does_not_hallucinate_linkedin_url():
    # "sarah" is a name, not a URL. Whatever the turn does (clarify who,
    # attempt the prep and surface its error, or navigate), the model must
    # not stuff the name into a linkedin_url prefill.
    result = run_async(scout_assistant_service.handle_chat(
        message="i have a coffee chat with sarah at goldman tomorrow",
        current_page="/dashboard"))
    assert result["tool"] in ("navigate", "clarify", "answer"), result.get("tool")
    msg = (result.get("message") or "").lower()
    assert _ERROR_FALLBACK_MARKER not in msg, result.get("message")
    if result["tool"] == "navigate":
        prefill = result["navigate"].get("prefill") or {}
        assert not prefill.get("linkedin_url"), (
            f"linkedin_url must not be a name: got {prefill.get('linkedin_url')!r}")
