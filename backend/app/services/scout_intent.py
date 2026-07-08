"""
Scout voice-ask intent classifier (SCOUT-ACTION-CONTRACT.md translator, v0).

The mobile app's regex ladder handles the common shapes instantly; anything
it can't confidently parse lands here — an LLM that understands ARBITRARY
phrasing and maps it onto the contract's intent set. This is the "make it
intelligent for any ask" layer (Rylan, 2026-07-08): no more per-utterance
patches; new phrasings just work.

Same infrastructure as prompt_parser: gpt-4o-mini + a Firestore cache
(14d TTL) so repeated asks classify in ~0.1s and cost nothing.
"""
import hashlib
import json
import time
from datetime import datetime, timedelta, timezone
from threading import Lock
from typing import Any, Dict

from app.services.openai_client import get_openai_client

_FS_COLLECTION = "scout_intent_cache"
_FS_TTL_DAYS = 14
_mem_cache: Dict[str, tuple] = {}
_mem_lock = Lock()
_MEM_TTL = 3600

_INTENTS = ("draft_outreach", "find_people", "find_jobs", "apply_saved", "meeting_prep", "question")

_SYSTEM = """You classify a college student's spoken ask for a networking app. The app can:
- draft_outreach: find real professionals and WRITE outreach emails (drafts). Use when they want to reach/email/message/connect-with people, or name a role+company as a command.
- find_people: just SHOW who works somewhere (browse before acting).
- find_jobs: find job postings/roles/internships to apply to.
- apply_saved: bulk-apply to their already-saved jobs.
- meeting_prep: prep for a coffee chat / meeting.
- question: anything conversational — advice, how-tos, questions about using the app.
Voice transcripts contain recognition errors: silently fix obvious ones (company names, 'manners'→'managers') and put the FIXED text in cleaned_ask.
Rules: a role + company noun-phrase ("2 analysts at Bain") is draft_outreach. "show me / who works at" is find_people. Job-hunting phrasings ("find me a PM role") are find_jobs even when phrased as questions. When they want emails SENT, still draft_outreach with wants_send=true. Count capped at 5, default 1. Leave fields empty when absent — NEVER invent a company or location the user didn't say."""

_TOOL = {
    "type": "function",
    "function": {
        "name": "classify_ask",
        "description": "Classify the ask and extract its parameters.",
        "parameters": {
            "type": "object",
            "properties": {
                "intent": {"type": "string", "enum": list(_INTENTS)},
                "cleaned_ask": {"type": "string", "description": "The ask with obvious speech-recognition errors fixed."},
                "role": {"type": "string", "description": "Role/title words, e.g. 'IB analysts', 'hiring manager'. Empty if none."},
                "company": {"type": "string", "description": "Company named, canonical spelling. Empty if none."},
                "location": {"type": "string", "description": "Location named. Empty if none."},
                "count": {"type": "integer", "minimum": 1, "maximum": 5},
                "hiring_manager": {"type": "boolean", "description": "True when they target hiring managers/recruiters."},
                "wants_send": {"type": "boolean"},
                "job_query": {"type": "string", "description": "For find_jobs: the role words to match against job titles, shorthand expanded (pm -> product manager)."},
            },
            "required": ["intent", "cleaned_ask", "role", "company", "location", "count", "hiring_manager", "wants_send", "job_query"],
        },
    },
}


def _empty(ask: str, error: str = "") -> Dict[str, Any]:
    out = {
        "intent": "question", "cleaned_ask": ask, "role": "", "company": "",
        "location": "", "count": 1, "hiring_manager": False,
        "wants_send": False, "job_query": "",
    }
    if error:
        out["error"] = error
    return out


def classify_scout_ask(db, ask: str) -> Dict[str, Any]:
    """Classify one ask. Never raises — on any failure returns intent
    'question' with an error field so the app falls back gracefully."""
    key = hashlib.md5(ask.lower().strip().encode()).hexdigest()

    with _mem_lock:
        hit = _mem_cache.get(key)
        if hit and time.time() - hit[0] < _MEM_TTL:
            return hit[1]

    if db is not None:
        try:
            snap = db.collection(_FS_COLLECTION).document(key).get()
            if snap.exists:
                doc = snap.to_dict() or {}
                exp = doc.get("expires_at")
                if exp and exp > datetime.now(timezone.utc) and doc.get("result"):
                    result = doc["result"]
                    with _mem_lock:
                        _mem_cache[key] = (time.time(), result)
                    return result
        except Exception:
            pass

    client = get_openai_client()
    if not client:
        return _empty(ask, "no_llm")
    try:
        resp = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": _SYSTEM},
                {"role": "user", "content": ask[:500]},
            ],
            tools=[_TOOL],
            tool_choice={"type": "function", "function": {"name": "classify_ask"}},
            temperature=0,
            timeout=8,
        )
        args = resp.choices[0].message.tool_calls[0].function.arguments
        result = json.loads(args)
        if result.get("intent") not in _INTENTS:
            return _empty(ask, "bad_intent")
        result["count"] = max(1, min(int(result.get("count") or 1), 5))
        for f in ("cleaned_ask", "role", "company", "location", "job_query"):
            result[f] = str(result.get(f) or "").strip()
        result["hiring_manager"] = bool(result.get("hiring_manager"))
        result["wants_send"] = bool(result.get("wants_send"))
        if not result["cleaned_ask"]:
            result["cleaned_ask"] = ask
    except Exception as e:
        return _empty(ask, f"llm_error:{type(e).__name__}")

    with _mem_lock:
        _mem_cache[key] = (time.time(), result)
    if db is not None:
        try:
            db.collection(_FS_COLLECTION).document(key).set({
                "ask": ask[:500],
                "result": result,
                "expires_at": datetime.now(timezone.utc) + timedelta(days=_FS_TTL_DAYS),
            })
        except Exception:
            pass
    return result
