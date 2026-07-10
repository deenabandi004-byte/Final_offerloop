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

from app.services.firm_vocabulary import classifier_vocab_block
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
""" + classifier_vocab_block() + """
Spoken firm names arrive phonetically mangled — 'Molly's', 'Molise', 'Mose', and 'mo ellis' are all Moelis; 'ever core' is Evercore; 'set Evercore' means 'at Evercore'. When a token where a company belongs (role + at/with/for + X) phonetically resembles a known firm, output the canonical firm name in company and cleaned_ask and set repaired=true. Only repair when the ENTIRE company mention is the near-miss: if it carries extra words naming a different real business ('Molly's Cupcakes') or the role/context clearly isn't professional networking ('baristas at'), keep the user's words verbatim with repaired=false. If nothing on the list is phonetically close, keep verbatim with repaired=false — NEVER substitute a firm that isn't phonetically close to what they said.
Rules: a role + company noun-phrase ("2 analysts at Bain") is draft_outreach. "show me / who works at" is find_people. Job-hunting phrasings ("find me a PM role") are find_jobs even when phrased as questions. When they want emails SENT, still draft_outreach with wants_send=true. Count capped at 5, default 1. Leave fields empty when absent — NEVER invent a company or location the user didn't say.
TARGETING DOCTRINE (product rule): regular employees are ALWAYS the default target — the database has far more employees than recruiters, so employee asks fill and recruiter asks starve. hiring_manager=true when and ONLY when the words "hiring manager", "recruiter", or "talent" appear in the ask — then it is true even if an industry or location is also named. "Employees", "people", "someone", or plain role words mean employees: hiring_manager=false. An INDUSTRY ("tech", "the tech industry", "investment banking", "consulting", "finance") is NEVER a company — leave company empty and keep the industry words in role or cleaned_ask so the app can offer real firms in that industry."""

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
                "company": {"type": "string", "description": "Company named, canonical spelling. Empty if none. An industry (tech, banking, consulting) is NOT a company - leave empty."},
                "location": {"type": "string", "description": "Location named. Empty if none."},
                "count": {"type": "integer", "minimum": 1, "maximum": 5},
                "hiring_manager": {"type": "boolean", "description": "True ONLY when the ask explicitly says hiring manager/recruiter/talent. Broad or employee asks are false — never inferred."},
                "wants_send": {"type": "boolean"},
                "job_query": {"type": "string", "description": "For find_jobs: the role words to match against job titles, shorthand expanded (pm -> product manager)."},
                "repaired": {"type": "boolean", "description": "True when company/role was corrected from a likely speech-recognition error rather than taken verbatim."},
            },
            "required": ["intent", "cleaned_ask", "role", "company", "location", "count", "hiring_manager", "wants_send", "job_query", "repaired"],
        },
    },
}


def _empty(ask: str, error: str = "") -> Dict[str, Any]:
    out = {
        "intent": "question", "cleaned_ask": ask, "role": "", "company": "",
        "location": "", "count": 1, "hiring_manager": False,
        "wants_send": False, "job_query": "", "repaired": False,
    }
    if error:
        out["error"] = error
    return out


def classify_scout_ask(db, ask: str) -> Dict[str, Any]:
    """Classify one ask. Never raises — on any failure returns intent
    'question' with an error field so the app falls back gracefully."""
    # Salt history: v2 = vocabulary + repaired-field prompt; v3 = the
    # targeting-doctrine prompt (employees default, industry is
    # never a company) obsoletes v2 entries — a cached hiring_manager=true
    # for a broad ask must not be served for its 14-day TTL.
    key = hashlib.md5(("v3|" + ask.lower().strip()).encode()).hexdigest()

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
        result["repaired"] = bool(result.get("repaired"))
        # Deterministic guard: a company the user said verbatim was not
        # repaired, whatever the model claims — spurious repaired flags cost
        # the user a needless confirm card.
        if result["company"] and result["company"].lower() in ask.lower():
            result["repaired"] = False
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
