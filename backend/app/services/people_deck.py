"""
The People deck built from a sentence.

The mobile People feed used to be ranker-only: the server decided who you should
meet, and the app swiped through the verdict. This is the other half (Nick
2026-08-16): the student describes who they want ("investment banking analysts at
Goldman Sachs in New York") and we go find twenty of them.

The split that matters, and the reason this is not just prompt_search with a
different name:

    SEARCH  is free. One PDL person/search per prompt, no address handed to the
            client, no email written, no credits moved. Someone can describe a
            search, look through twenty faces, decide none of them are worth
            writing to, and have spent nothing. That is the whole point.

    REVEAL  is the paid step, and it is where the address and the written email
            both come from. One call, one charge, because an address with no
            draft is a lookup tool and this deck exists to not be one.

Between the two, the deck lives in Firestore under the user. The app never holds
enough about these people to identify them to PDL, which is deliberate: a reveal
is addressed as (deck_id, person_id), so the app cannot ask us to enrich an
arbitrary person it invented.

Everything here reuses the existing pipeline (prompt_pdl_search, reply_generation,
gmail_client). There is no new business logic about how a search runs or how an
email is written, only about what gets charged and when.
"""
import hashlib
import logging
import os
import re
import traceback
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

from app.config import CREDIT_COSTS, TIER_CONFIGS
from app.services import neverbounce_client
from app.services.auth import check_and_reset_credits, deduct_credits_atomic
from app.services.gmail_client import _load_user_gmail_creds, download_resume_from_url
from app.services.metering import attach_request_context
from app.services.pdl_client import search_contacts_from_prompt
from app.services.prompt_parser import parse_search_prompt_structured
from app.services.reply_generation import (
    PURPOSES_INCLUDE_RESUME,
    batch_generate_emails,
    email_body_mentions_resume,
)
from app.services.resume_parser import extract_text_from_pdf_bytes
from app.utils.users import get_outreach_email
from app.utils.warmth_scoring import build_briefing_line, score_and_sort_contacts

logger = logging.getLogger(__name__)

# How many people one batch surfaces. Twenty is a session's worth of swiping,
# and small enough that a student who described the wrong thing finds out fast.
BATCH_SIZE = 20
MAX_BATCH_SIZE = 25

# Searching is free, so the only thing standing between a bored user and a large
# PDL bill is this. Deliberately loose: a real user rewriting their search five
# times in an evening never touches it.
DAILY_SEARCH_CAP = 12

# A stashed deck is a promise we can still reveal from. Past this the PDL data is
# stale enough that the person may have changed jobs, and the app is told the
# search expired rather than being allowed to buy an address from last week.
DECK_TTL_HOURS = 48

PROMPT_MIN = 3
PROMPT_MAX = 500


def _person_id(contact: Dict[str, Any]) -> str:
    """A stable, opaque id for one person in one deck.

    LinkedIn first: it is the only identifier PDL reliably returns that is
    genuinely unique to a human. Name plus company is the fallback, and is the
    same pair the swipe-reservation keys use, so the two agree about who counts
    as the same person.
    """
    linkedin = (contact.get("LinkedIn") or "").strip().lower()
    if linkedin and linkedin.lower() != "not available":
        linkedin = linkedin.split("?")[0].rstrip("/")
        return hashlib.sha1(f"li:{linkedin}".encode("utf-8")).hexdigest()[:20]
    name = f"{contact.get('FirstName', '')} {contact.get('LastName', '')}".strip().lower()
    company = (contact.get("Company") or "").strip().lower()
    return hashlib.sha1(f"nc:{name}|{company}".encode("utf-8")).hexdigest()[:20]


def _has_address(contact: Dict[str, Any]) -> bool:
    for key in ("Email", "WorkEmail", "PersonalEmail"):
        v = (contact.get(key) or "").strip()
        if v and v.lower() != "not available" and "@" in v:
            return True
    return False


def _address_of(contact: Dict[str, Any]) -> str:
    for key in ("Email", "WorkEmail", "PersonalEmail"):
        v = (contact.get(key) or "").strip()
        if v and v.lower() != "not available" and "@" in v:
            return v.lower()
    return ""


def _public_person(contact: Dict[str, Any], person_id: str, rank: int) -> Dict[str, Any]:
    """What the CARD gets. Everything the deck draws, and nothing it can email.

    The address is the product; it stays on the server until it is paid for.
    Sending it down "just for the client to hide" would put every address in the
    deck one proxy log away from being free.
    """
    city = (contact.get("City") or "").strip()
    state = (contact.get("State") or "").strip()
    return {
        "id": person_id,
        "rank": rank,
        "firstName": (contact.get("FirstName") or "").strip(),
        "lastName": (contact.get("LastName") or "").strip(),
        "title": (contact.get("Title") or "").strip(),
        "company": (contact.get("Company") or "").strip(),
        "city": city,
        "state": state,
        "college": (contact.get("College") or "").strip(),
        "linkedinUrl": (contact.get("LinkedIn") or "").strip(),
        # snake_case on purpose: the app's candidate mapper reads photo_url.
        # A real headshot when the provider has one; the card falls back to
        # the initials tile on its own when this is empty or the link dies.
        "photo_url": (contact.get("PhotoUrl") or "").strip(),
        # The card's "Why we surfaced them" list. Built from the warmth signals
        # the same scorer produces for every other surface, so a prompt person
        # and a ranked person explain themselves the same way.
        "reasons": contact.get("_reasons") or [],
        # Whether a right swipe can actually deliver. The card does not draw
        # this yet, but the swipe needs it and a client that knows can stop
        # charging for a person we already know has no address.
        "hasEmail": _has_address(contact),
    }


#: Everything a stashed person needs to survive until a reveal: who they are,
#: how to reach them, and what the writer needs to write well. PDL hands back a
#: good deal more (full work summaries, volunteer prose, education blobs) and
#: fifty of those in one document is how you find the 1MB Firestore limit.
_STASH_FIELDS = (
    "FirstName", "LastName", "LinkedIn", "LinkedInUrn", "Email", "WorkEmail",
    "PersonalEmail", "PendingEmail", "PendingEmailStatus", "Title", "Company",
    "City", "State", "College", "WorkSummary", "PhotoUrl",
    "warmth_score", "warmth_tier", "warmth_label", "warmth_signals", "briefing",
    "personalization", "_reasons", "_provider",
)


def _stashable(contact: Dict[str, Any]) -> Dict[str, Any]:
    """Trim a PDL contact to what a later reveal actually reads."""
    out = {k: contact[k] for k in _STASH_FIELDS if k in contact and contact[k] is not None}
    # The writer uses this for context; a paragraph is plenty and the full blob
    # is often several.
    summary = out.get("WorkSummary")
    if isinstance(summary, str) and len(summary) > 600:
        out["WorkSummary"] = summary[:600]
    return out


def _deck_ref(db, user_id: str, deck_id: str):
    return db.collection("users").document(user_id).collection("peopleDecks").document(deck_id)


def _search_count_today(db, user_id: str) -> int:
    """How many searches this user has run in the last 24h. Best effort: a guard
    that cannot read must not block real work."""
    try:
        since = datetime.now(timezone.utc) - timedelta(hours=24)
        docs = (
            db.collection("users").document(user_id).collection("peopleDecks")
            .where("createdAt", ">=", since)
            .limit(DAILY_SEARCH_CAP + 1)
            .get()
        )
        return len(docs)
    except Exception:
        logger.exception("people-deck search cap check failed for uid=%s", user_id)
        return 0



# ---------------------------------------------------------------------------
# Search hygiene (Rylan 2026-08-21). Provider-agnostic rules that make every
# rung's results land closer to what a student meant. Calibrated on the
# benchmark runs: global freelancers for "software engineers", retired and
# "incoming intern" profiles, synthetic "Trent-xyz Doe" test records, regional
# resellers matched on a brand name, and single-word title variants like
# "Engineer" dragging in process engineers.
# ---------------------------------------------------------------------------

DEFAULT_SEARCH_LOCATION = "United States"

#: Title variants too generic to search on alone when a specific one exists.
_GENERIC_TITLE_WORDS = {
    "engineer", "manager", "analyst", "consultant", "associate", "director",
    "specialist", "developer", "designer", "intern", "lead", "scientist",
    "recruiter", "partner", "coordinator", "assistant", "officer", "advisor",
}

#: Title or company fragments that mean "not actually there to network with".
_DISQUALIFYING_TITLE_PREFIXES = ("incoming", "aspiring", "future", "prospective")
_DISQUALIFYING_FRAGMENTS = ("retired", "seeking opportunities", "looking for", "open to work")

_SYNTHETIC_LAST_NAMES = {"doe", "test", "tester", "sample", "example"}
_SYNTHETIC_FIRST_RE = re.compile(r"-[A-Za-z0-9]{6,}$")


def _apply_search_rules(parsed: Dict[str, Any]) -> Dict[str, Any]:
    """Shape the parsed prompt before any provider sees it."""
    # Rule 1: no location means the US, not the planet.
    if not parsed.get("locations"):
        parsed["locations"] = [DEFAULT_SEARCH_LOCATION]
        parsed["_defaulted_location"] = True

    # Rule 3: a specific multi-word title makes its single-word generic
    # siblings harmful ("Software Engineer" must not fan out to "Engineer").
    titles = [t for t in (parsed.get("title_variations") or []) if isinstance(t, str) and t.strip()]
    if any(len(t.split()) > 1 for t in titles):
        kept = [t for t in titles if not (len(t.split()) == 1 and t.strip().lower() in _GENERIC_TITLE_WORDS)]
        if kept:
            parsed["title_variations"] = kept
    return parsed


def _missing_target(parsed: Dict[str, Any]) -> bool:
    """Rule 2: a people search needs a company or an industry to aim at."""
    return not (parsed.get("companies") or parsed.get("industries"))


def _norm(s: str) -> str:
    return re.sub(r"[^a-z0-9 ]+", " ", (s or "").lower()).strip()


def _filter_contacts(contacts: List[Dict[str, Any]], parsed: Dict[str, Any], user_id: str) -> List[Dict[str, Any]]:
    """Drop what no student would want to email, and log why."""
    targets = [
        _norm(c.get("name") if isinstance(c, dict) else c)
        for c in (parsed.get("companies") or [])
    ]
    targets = [t for t in targets if t]
    dropped: Dict[str, int] = {}
    seen: set = set()
    out: List[Dict[str, Any]] = []

    def drop(reason: str) -> None:
        dropped[reason] = dropped.get(reason, 0) + 1

    for c in contacts:
        first = (c.get("FirstName") or "").strip()
        last = (c.get("LastName") or "").strip()
        title = (c.get("Title") or "").strip()
        company = (c.get("Company") or "").strip()
        tl, cl = title.lower(), company.lower()

        if last.lower() in _SYNTHETIC_LAST_NAMES or _SYNTHETIC_FIRST_RE.search(first) or "test" in first.lower().split("-")[0:1]:
            drop("synthetic_profile"); continue
        if any(tl.startswith(p) for p in _DISQUALIFYING_TITLE_PREFIXES):
            drop("not_there_yet"); continue
        if any(f in tl or f in cl for f in _DISQUALIFYING_FRAGMENTS):
            drop("retired_or_seeking"); continue

        # Company precision: a brand name that appears but not at the start
        # ("ABM SPORT - Nike representative") is a reseller or partner, not
        # the company. Subsidiaries that lead with the name ("Deloitte
        # Consulting") stay. A company string without the name at all is
        # left alone: the provider matched it by id and we cannot judge.
        if targets and company:
            cn = _norm(company)
            hit = [t for t in targets if t in cn]
            if hit and not any(cn.startswith(t) for t in hit):
                drop("brand_not_employer"); continue

        key = (first.lower(), last.lower(), cl)
        if key in seen:
            drop("duplicate"); continue
        seen.add(key)
        out.append(c)

    if dropped:
        logger.info("people-deck hygiene uid=%s kept=%d dropped=%s", user_id, len(out), dropped)
    return out



def _track(db, kind: str, payload: Dict[str, Any]) -> None:
    """One compact record per provider decision, so 'which path did what,
    when, and why' is queryable instead of grep-able. Best effort: tracking
    must never break the product path."""
    try:
        doc = {"kind": kind, "at": datetime.now(timezone.utc), **payload}
        db.collection("providerEvents").add(doc)
    except Exception:
        logger.exception("provider event write failed (%s)", kind)


def search_people(
    *,
    user_id: str,
    user_email: Optional[str],
    prompt: str,
    limit: int = BATCH_SIZE,
    cursor: Optional[str] = None,
) -> Tuple[Dict[str, Any], int]:
    """Find people matching `prompt`. Free.

    `cursor` asks for the NEXT slice of an existing deck rather than a new
    search: it is "<deck_id>:<offset>", and it is the server's own token, so the
    app never has to know that a deck and a batch are different things.

    Returns (payload, http_status).
    """
    from app.extensions import get_db

    prompt = (prompt or "").strip()
    if len(prompt) < PROMPT_MIN:
        return {"error": "Tell us a bit more about who you want to reach."}, 400
    if len(prompt) > PROMPT_MAX:
        return {"error": f"Keep it under {PROMPT_MAX} characters."}, 400

    limit = max(1, min(int(limit or BATCH_SIZE), MAX_BATCH_SIZE))
    db = get_db()
    if db is None:
        return {"error": "Database unavailable"}, 503

    attach_request_context(user_id=user_id)

    # Paging an existing deck: no parse, no PDL, no cap. The people are already
    # bought and stashed; this is the free half of "show me twenty more".
    if cursor:
        return _serve_next_batch(db, user_id, cursor, limit)

    if _search_count_today(db, user_id) >= DAILY_SEARCH_CAP:
        return {
            "error": "rate_limited",
            "message": (
                f"That's {DAILY_SEARCH_CAP} searches today. Swipe the ones you have, "
                "or come back tomorrow."
            ),
        }, 429

    parsed = parse_search_prompt_structured(prompt)
    if parsed.get("error"):
        return {
            "error": "vague",
            "message": (
                "That was a little vague to search on. Add a role, a company, or a city."
            ),
        }, 400
    # A low-confidence parse used to 400 here, which turned "recently hired
    # engineers" into a dead-feeling error (live session 2026-08-24). If the
    # parse produced ANYTHING actionable (a title, company, or industry),
    # continue: the target rule below returns a 200 empty state that says
    # exactly what to add, which is guidance, not a wall.
    if parsed.get("confidence") == "low" and not (
        parsed.get("title_variations") or parsed.get("companies") or parsed.get("industries")
    ):
        return {
            "error": "vague",
            "message": (
                "That was a little vague to search on. Add a role, a company, or a city."
            ),
        }, 400

    parsed = _apply_search_rules(parsed)

    # Recency lever (2026-08-24, shipped for real this time): recency
    # phrasing becomes a joined-after filter the Coresignal builder folds
    # into the company clause ("February 2026"-style formats).
    if re.search(
        r"recent(ly)?\s+(hired|joined|hires?|joiners?)|new\s+(hires?|joiners?)"
        r"|just\s+(joined|hired|started)|joined\s+recently|last\s+\d+\s+months",
        prompt.lower(),
    ):
        parsed["joined_after"] = (datetime.utcnow() - timedelta(days=183)).strftime("%B %Y")
        logger.info("people-deck recency lever: joined_after=%s prompt=%r",
                    parsed["joined_after"], prompt[:80])
    if _missing_target(parsed):
        # Rule 2 (Rylan 2026-08-21): without a company or industry every
        # provider returns the planet's engineers. The app renders `reason`
        # verbatim in the empty state, so say exactly what to add.
        return {
            "deck_id": "",
            "people": [],
            "next_cursor": None,
            "reason": (
                "Add a company or an industry so we search the right people. "
                "Try \"software engineers at Stripe\", \"analysts in consulting\", "
                "or \"recently hired engineers at Datadog\"."
            ),
        }, 200

    # Over-fetch deliberately. PDL's post-filters (company match, alumni) drop a
    # meaningful share of what comes back, and a deck that promised twenty and
    # delivered nine reads as a broken search rather than a strict one. The
    # surplus is stashed, not thrown away, so "show me twenty more" is free.
    fetch_count = min(50, limit * 2 + 10)
    parsed["max_results"] = fetch_count

    # THE searcher, not a lookalike. search_contacts_from_prompt is what the
    # website's Find feature runs, and it is the one that understands the shape
    # parse_search_prompt_structured actually emits: `companies` as a list of
    # {name, matched_titles} objects, plus title_variations and seniority.
    #
    # This used to call prompt_pdl_search.run_prompt_search, which reads a
    # DIFFERENT, older filter shape (`company`/`roles`/`location` as flat string
    # lists) produced by the other parser. Handed the structured output, its
    # clause builders found none of the keys they wanted and silently emitted a
    # query with no company and no title in it: "software engineer at roblox"
    # went to PDL as "anyone whose industry is technology", which PDL answered
    # with 404 on every relaxation tier. A search that looked run and found
    # nobody, for every prompt.
    user_doc = _firestore_user(db, user_id)

    # Crustdata TEST rung (2026-08-19, Rylan: spend 30-35 trial credits for
    # real signal). Primary when the key is present and budget remains, so
    # phone testing exercises the candidate provider on real prompts. A
    # search is ~0.03 credits per result; addresses come later, at reveal.
    # Empty or disabled falls straight through to the PDL ladder unchanged.
    contacts: list = []
    _retry_level, _already_saved, _adjacency = 0, [], {}
    try:
        from app.services import crustdata_client
        if crustdata_client.enabled(db):
            crustdata_client.log_balance()
            contacts = crustdata_client.search_from_parsed(parsed, fetch_count, db)
            if contacts:
                _adjacency = {"provider": "crustdata_test"}
                logger.info(
                    "people-deck crustdata rung uid=%s returned %d contacts",
                    user_id, len(contacts),
                )
    except Exception:
        logger.exception("people-deck crustdata rung failed for uid=%s", user_id)
        contacts = []

    # Coresignal TEST rung (2026-08-20, the canceled-call pivot: extract the
    # signal from our own infrastructure). Runs when the Crustdata rung came
    # up empty (its trial is out of credits), the Coresignal key is present,
    # and the trial budget holds. A collect is 20 credits, so collects are
    # capped hard per search and tracked in Firestore. Emails ship tiered by
    # the client: verified sells as-is, matched holds for an SMTP check at
    # reveal, guesses never leave the backend (benchmarked 6 of 6 invalid).
    if not contacts:
        try:
            import os as _os
            from app.services import coresignal_client
            if coresignal_client.CORESIGNAL_API_KEY:
                _budget = float(_os.getenv("CORESIGNAL_TEST_BUDGET", "1500"))
                _bref = db.collection("meta").document("coresignalTestBudget")
                try:
                    _bsnap = _bref.get()
                    _spent = float((_bsnap.to_dict() or {}).get("spent_estimate", 0.0)) if _bsnap.exists else 0.0
                except Exception:
                    logger.exception("coresignal budget read failed; treating as exhausted")
                    _spent = _budget
                if _spent < _budget:
                    _max_collects = int(_os.getenv("CORESIGNAL_MAX_COLLECTS", "8"))
                    cs_contacts, _lvl, _saved, cs_meta = coresignal_client.search_contacts_from_prompt(
                        parsed,
                        min(limit, _max_collects),
                        exclude_keys=set(),
                        user_profile=user_doc,
                        # Alumni-first: same filters, the student's school,
                        # those people lead the deck (free extra search).
                        alumni_school=(user_doc.get("school") or "").strip() or None,
                    )
                    _collected = int((cs_meta or {}).get("collected_count") or 0)
                    if _collected:
                        try:
                            from google.cloud import firestore as _fs
                            _bref.set({"spent_estimate": _fs.Increment(20.0 * _collected),
                                       "collect_count": _fs.Increment(_collected)}, merge=True)
                        except Exception:
                            logger.exception("coresignal budget write failed (%d collects untracked)", _collected)
                        # Mirror into provider_calls: the spend alerter reads
                        # that collection, not the tank doc, so without this
                        # row Coresignal consumption is invisible to alerts.
                        try:
                            from app.services.metering import log_provider_spend
                            log_provider_spend("coresignal", "member_collect", _collected, returned=_collected)
                        except Exception:
                            logger.exception("coresignal metering mirror failed")
                    if cs_contacts:
                        contacts = cs_contacts
                        _adjacency = dict(cs_meta or {})
                        _adjacency["provider"] = "coresignal_test"
                        logger.info(
                            "people-deck coresignal rung uid=%s returned %d contacts (%d collects, ~%d credits)",
                            user_id, len(cs_contacts), _collected, _collected * 20,
                        )
                else:
                    logger.warning("coresignal: test budget exhausted (%.0f of %.0f)", _spent, _budget)
        except Exception:
            logger.exception("people-deck coresignal rung failed for uid=%s", user_id)
            contacts = contacts or []

    # FullEnrich budget-discovery rung (env-gated, photo-less; capability
    # matrix 2026-08-24: rich rows at 0.25 cr/result). Default OFF: the
    # swipe deck's photos are measured product value.
    if not contacts:
        try:
            from app.services import fullenrich_search
            if fullenrich_search.discovery_enabled(db):
                contacts, _lvl2, _saved2, fe_meta = fullenrich_search.search_contacts_from_prompt(
                    parsed, min(limit, 20), exclude_keys=set(), user_profile=user_doc, db=db)
                if contacts:
                    _adjacency = dict(fe_meta or {})
                    _adjacency["provider"] = "fullenrich_search"
                    logger.info("people-deck fullenrich-search rung uid=%s returned %d",
                                user_id, len(contacts))
        except Exception:
            logger.exception("people-deck fullenrich-search rung failed uid=%s", user_id)
            contacts = contacts or []

    if not contacts:
        try:
            contacts, _retry_level, _already_saved, _adjacency = search_contacts_from_prompt(
                parsed,
                fetch_count,
                exclude_keys=set(),
                user_profile=user_doc,
            )
        except Exception:
            # A PDL failure is NOT the end of the search any more (2026-08-18).
            # It used to 502 here, which showed "Could not run that search" for
            # the whole PDL billing outage. Fall through to the Hunter rung below,
            # the same ladder the website's Find flow got in commit ed8961d8.
            logger.exception("people-deck PDL search raised for uid=%s", user_id)
            contacts, _retry_level, _already_saved, _adjacency = [], 0, [], {}

        contacts = contacts or []
        _adjacency = _adjacency or {}

        # The outage rung, previously wired into routes/runs.py only, which left
        # THIS route with zero fallbacks. Fires on empty as well as on raise,
        # because a PDL 404 returns [] without raising. Hunter Domain Search
        # covers company-targeted prompts, which is most mobile searches, and its
        # addresses are Hunter-verified (no synthesized-email risk).
        if not contacts and (parsed.get("companies") or []):
            try:
                from app.services.hunter_person_search import search_people_via_hunter
                contacts, _retry_level, _already_saved, hunter_meta = search_people_via_hunter(
                    parsed,
                    limit,
                    exclude_keys=set(),
                    user_profile=user_doc,
                )
                contacts = contacts or []
                _adjacency.update(hunter_meta or {})
                _adjacency["fallback_used"] = "hunter"
                logger.info(
                    "people-deck hunter bridge uid=%s returned %d contacts", user_id, len(contacts)
                )
            except Exception:
                logger.exception("people-deck hunter bridge failed for uid=%s", user_id)
                contacts = contacts or []


    contacts = _filter_contacts(contacts or [], parsed, user_id)

    if not contacts:
        # The searcher often KNOWS why it came back empty ("found 25 people
        # who previously worked at X but have since moved on") and that
        # message used to be computed and then thrown away. Surface it; the
        # app renders `reason` verbatim.
        diagnosis = (_adjacency.get("message") or "").strip()
        logger.warning(
            "people-deck zero-hit uid=%s rung=%s diagnosis=%r",
            user_id, _retry_level, diagnosis[:200],
        )
        return {
            "deck_id": "",
            "people": [],
            "next_cursor": None,
            "reason": diagnosis or (
                "We could not find anyone matching that. Try a broader role, or drop the city."
            ),
        }, 200

    # Warmth scoring orders the deck and, more usefully here, produces the
    # signals the card turns into "Why we surfaced them". Same scorer as every
    # other surface, so a prompt person explains itself the same way a ranked
    # one does.
    try:
        scoring_profile = _user_profile(db, user_id, user_email)
        scoring_profile.pop("_userData", None)
        contacts = score_and_sort_contacts(scoring_profile, contacts, search_context=parsed)
        for c in contacts:
            signals = c.get("warmth_signals") or []
            briefing = build_briefing_line(c, signals)
            reasons = [s for s in (signals if isinstance(signals, list) else []) if isinstance(s, str)]
            if briefing:
                reasons = [briefing] + reasons
            c["_reasons"] = reasons[:3]
    except Exception:
        # Ordering and reasons are a nicety. A scorer that throws must not cost
        # the user the search they already waited for.
        logger.exception("people-deck warmth scoring failed for uid=%s", user_id)

    # Stash the whole haul. The addresses live here and only here until a reveal
    # pays for one.
    deck_id = hashlib.sha1(
        f"{user_id}|{prompt}|{datetime.now(timezone.utc).isoformat()}".encode("utf-8")
    ).hexdigest()[:20]

    stash: Dict[str, Any] = {}
    order: List[str] = []
    for c in contacts:
        pid = _person_id(c)
        if pid in stash:
            continue
        stash[pid] = _stashable(c)
        order.append(pid)

    try:
        _deck_ref(db, user_id, deck_id).set({
            "prompt": prompt,
            "createdAt": datetime.now(timezone.utc),
            "order": order,
            "people": stash,
            "delivered": 0,
        })
    except Exception:
        logger.exception("people-deck stash failed for uid=%s", user_id)
        return {"error": "search_failed", "message": "Could not save that search."}, 502

    # FullEnrich prefetch (2026-08-24): one bulk waterfall for every SHOWN
    # card that lacks a sellable address, fired while the student is still
    # reading card one. Reveals become instant lookups instead of 45-second
    # timeouts (the first live session logged nine of those), and one call
    # per deck sidesteps their per-request rate limit. Costs a credit only
    # per FOUND email among shown cards (~$0.35/deck at measured hit rates).
    try:
        from app.services import fullenrich_client
        if fullenrich_client.enabled(db) and os.getenv("FULLENRICH_PREFETCH", "1") == "1":
            wanting = [
                (pid,
                 stash[pid].get("FirstName") or "",
                 stash[pid].get("LastName") or "",
                 stash[pid].get("Company") or "",
                 (stash[pid].get("LinkedIn") or "").strip())
                for pid in order[:limit]
                if not _has_address(stash[pid]) and not stash[pid].get("PendingEmail")
            ]
            if wanting:
                eid = fullenrich_client.start_bulk(wanting, db=db)
                if eid:
                    _deck_ref(db, user_id, deck_id).update({"fe_job": {
                        "id": eid, "pids": [w[0] for w in wanting],
                    }})
    except Exception:
        logger.exception("people-deck prefetch failed for uid=%s", user_id)

    _track(db, "search", {
        "uid": user_id,
        "deck": deck_id,
        "provider": (_adjacency or {}).get("provider") or "pdl",
        "prompt": prompt[:120],
        "joined_after": parsed.get("joined_after") or "",
        "companies": [c.get("name") if isinstance(c, dict) else c for c in (parsed.get("companies") or [])][:3],
        "shown": min(len(order), limit),
        "stash_total": len(order),
    })

    return _batch_payload(db, user_id, deck_id, order, stash, offset=0, limit=limit), 200


def _serve_next_batch(db, user_id: str, cursor: str, limit: int) -> Tuple[Dict[str, Any], int]:
    """Hand back the next slice of an already-bought deck. Costs nothing."""
    deck_id, _, offset_raw = (cursor or "").partition(":")
    try:
        offset = max(0, int(offset_raw or 0))
    except ValueError:
        return {"error": "bad_cursor", "message": "That search expired."}, 400

    snap = _deck_ref(db, user_id, deck_id).get() if deck_id else None
    if not snap or not snap.exists:
        return {"error": "expired", "message": "That search expired."}, 404
    deck = snap.to_dict() or {}
    if _deck_expired(deck):
        return {"error": "expired", "message": "That search expired."}, 404

    return _batch_payload(
        db, user_id, deck_id, deck.get("order") or [], deck.get("people") or {}, offset, limit
    ), 200


def _batch_payload(
    db,
    user_id: str,
    deck_id: str,
    order: List[str],
    stash: Dict[str, Any],
    offset: int,
    limit: int,
) -> Dict[str, Any]:
    slice_ids = order[offset : offset + limit]
    people = [
        _public_person(stash[pid], pid, offset + i)
        for i, pid in enumerate(slice_ids)
        if pid in stash
    ]
    next_offset = offset + len(slice_ids)
    has_more = next_offset < len(order)
    try:
        _deck_ref(db, user_id, deck_id).update({"delivered": next_offset})
    except Exception:
        # Bookkeeping only. The cursor the client holds is what actually pages.
        pass
    return {
        "deck_id": deck_id,
        "people": people,
        "next_cursor": f"{deck_id}:{next_offset}" if has_more else None,
    }


def _deck_expired(deck: Dict[str, Any]) -> bool:
    created = deck.get("createdAt")
    if not created:
        return False
    try:
        if isinstance(created, str):
            created = datetime.fromisoformat(created.replace("Z", "+00:00"))
        if created.tzinfo is None:
            created = created.replace(tzinfo=timezone.utc)
        return datetime.now(timezone.utc) - created > timedelta(hours=DECK_TTL_HOURS)
    except Exception:
        return False


def _firestore_user(db, user_id: str) -> Dict[str, Any]:
    """The raw user doc, which is what search_contacts_from_prompt expects for
    `user_profile` (it reads dreamCompanies / school off it to rank). Empty dict
    on any trouble: the search must still run for a user we cannot read."""
    if db is None or not user_id:
        return {}
    try:
        doc = db.collection("users").document(user_id).get()
        return (doc.to_dict() or {}) if doc.exists else {}
    except Exception:
        logger.exception("people-deck could not load user doc for uid=%s", user_id)
        return {}


def _user_profile(db, user_id: str, user_email: Optional[str]) -> Dict[str, Any]:
    """The writer's own profile, as batch_generate_emails and the warmth scorer
    expect it. Same construction as the prompt-search pipeline, kept short: the
    fields either exist on the user doc or they do not, and a missing one just
    makes the email less personal, never wrong."""
    profile: Dict[str, Any] = {"name": "", "email": user_email or ""}
    if db is None or not user_id:
        return profile
    user_data = {}
    try:
        doc = db.collection("users").document(user_id).get()
        if doc.exists:
            user_data = doc.to_dict() or {}
    except Exception:
        logger.exception("people-deck could not load user doc for uid=%s", user_id)
        return profile

    try:
        prof = (
            db.collection("users").document(user_id)
            .collection("professionalInfo").document("info").get()
        )
        if prof.exists:
            pi = prof.to_dict() or {}
            profile.update({
                "name": f"{pi.get('firstName', '')} {pi.get('lastName', '')}".strip() or profile["name"],
                "university": pi.get("university", ""),
                "major": pi.get("fieldOfStudy", ""),
                "year": pi.get("graduationYear", ""),
                "graduationYear": pi.get("graduationYear", ""),
                "degree": pi.get("currentDegree", ""),
            })
    except Exception:
        pass

    for key in ("resumeParsed", "academics", "goals", "careerTrack",
                "dreamCompanies", "hometown", "location", "pastCompanies"):
        if key in user_data and key not in profile:
            profile[key] = user_data[key]

    # Prefer the .edu as the outreach identity, same as every other send path.
    outreach = get_outreach_email(user_data)
    if outreach:
        profile["email"] = outreach
    profile["_userData"] = user_data
    return profile


def reveal_person(
    *,
    user_id: str,
    user_email: Optional[str],
    auth_display_name: str,
    deck_id: str,
    person_id: str,
    action: str = "draft",
) -> Tuple[Dict[str, Any], int]:
    """The paid step: unlock this person's address and write to them.

    Charged UP FRONT and refunded on any outcome that did not deliver an
    address, matching the ordering prompt_search uses. Charging after the work
    leaves a window where a crash costs us the LLM call and the user nothing,
    but a client retry does it all again and charges twice.

    Returns (payload, http_status). The payload always says what actually
    happened (email / verified / charged / drafted / sent) rather than what was
    requested, because the app renders from it.
    """
    from app.extensions import get_db

    db = get_db()
    if db is None:
        return {"error": "Database unavailable"}, 503
    if not deck_id or not person_id:
        return {"error": "deck_id and person_id are required"}, 400

    attach_request_context(user_id=user_id)

    snap = _deck_ref(db, user_id, deck_id).get()
    if not snap.exists:
        return {"error": "expired", "message": "That search expired."}, 404
    deck = snap.to_dict() or {}
    if _deck_expired(deck):
        return {"error": "expired", "message": "That search expired."}, 404
    contact = (deck.get("people") or {}).get(person_id)
    if not contact:
        return {"error": "not_found", "message": "We no longer have that person."}, 404

    price = CREDIT_COSTS.get("reveal_person", CREDIT_COSTS.get("find_contact", 10))

    # Already bought. A double-tap, a retry after a dropped response, or a card
    # that came back on an undo must not charge twice for one human. The address
    # is handed back free, because the user already paid for it.
    already = (deck.get("revealed") or {}).get(person_id)
    if already:
        return {"email": _address_of(contact), "verified": True, "charged": False,
                "drafted": bool(contact.get("emailBody")), "sent": False}, 200

    # No address means nothing to sell. Answer before touching credits rather
    # than charging and refunding, so the ledger has no phantom pair in it.
    address = _address_of(contact)

    # Crustdata TEST rung: their contacts surface address-less on purpose
    # (search is 0.03/result); the paid enrich happens HERE, on the swipe,
    # and only a deliverable-labeled email counts as an address at all.
    if not address and contact.get("_provider") == "crustdata":
        try:
            from app.services import crustdata_client
            enriched = crustdata_client.enrich_deliverable_email(
                # The urn-form URL is what their enrich matches on; LinkedIn
                # holds the flagship URL for the card button since 2026-08-19.
                (contact.get("LinkedInUrn") or contact.get("LinkedIn") or "").strip(), db,
            )
        except Exception:
            logger.exception("people-deck crustdata enrich failed uid=%s", user_id)
            enriched = None
        if enriched and enriched.get("email"):
            address = enriched["email"]
            contact["Email"] = address
            contact["EmailSource"] = "crustdata_deliverable"
            contact["EmailVerified"] = True

    # Coresignal TEST rung: a matched-tier address was collected up front but
    # held unsold until this SMTP check (benchmark 2026-08-20: matched went
    # 4 of 5 valid, so one check turns "plausible" into "sendable"). Costs no
    # Coresignal credits; NeverBounce when configured, Hunter otherwise.
    if not address and contact.get("_provider") == "coresignal":
        pending = (contact.get("PendingEmail") or "").strip().lower()
        if pending:
            ok = False
            try:
                if neverbounce_client.is_configured():
                    verdict = neverbounce_client.verify_email(pending)
                    ok = verdict.get("result") == neverbounce_client.RESULT_VALID
                    logger.info("people-deck coresignal neverbounce %s -> %s", pending, verdict.get("result"))
                else:
                    from app.services.crustdata_client import _hunter_says_deliverable
                    ok = _hunter_says_deliverable(pending)
            except Exception:
                logger.exception("people-deck coresignal verify failed uid=%s", user_id)
            if ok:
                address = pending
                contact["Email"] = address
                contact["EmailSource"] = "coresignal_smtp_valid"
                contact["EmailVerified"] = True

    fe_checked = False
    fe_covered = False
    # Prefetched waterfall result first: the deck-serve started one bulk
    # enrichment for these people. A fast swiper reaches the reveal before
    # the waterfall finishes (Rylan 2026-08-26: five reveals in 22 seconds,
    # every one raced past a 10-second wait, then the live fallback 429ed
    # on the burst and a whole deck reported no emails that WERE coming).
    # So the reveal now waits for the job it already paid for, up to 45s,
    # instead of abandoning it to re-ask the same question the slow way.
    if not address:
        try:
            from app.services import fullenrich_client
            fe_job = deck.get("fe_job") or {}
            fe_covered = str(person_id) in [str(p) for p in (fe_job.get("pids") or [])]
            if fe_job.get("id"):
                ready, results = fullenrich_client.fetch_bulk(
                    fe_job["id"], wait_seconds=45 if fe_covered else 10, db=db)
                # Authoritative only when the job FINISHED: then a missing
                # pid is a real miss and the live fallback would waste 30s
                # rediscovering it. A still-running job falls through.
                fe_checked = bool(ready)
                hit_pre = results.get(str(person_id))
                if hit_pre:
                    ok = hit_pre["status"] == "DELIVERABLE"
                    if not ok:
                        try:
                            if neverbounce_client.is_configured():
                                ok = neverbounce_client.verify_email(hit_pre["email"]).get("result") == neverbounce_client.RESULT_VALID
                            else:
                                from app.services.crustdata_client import _hunter_says_deliverable
                                ok = _hunter_says_deliverable(hit_pre["email"])
                        except Exception:
                            ok = False
                    if ok:
                        address = hit_pre["email"]
                        contact["Email"] = address
                        contact["EmailSource"] = f"fullenrich_prefetch_{hit_pre['status'].lower()}"
                        contact["EmailVerified"] = True
        except Exception:
            logger.exception("people-deck prefetch lookup failed uid=%s", user_id)

    # Crustdata v2 (enterprise path, dormant unless CRUSTDATA_V2_ENABLED=1):
    # deliverable-labeled business email at 1 credit per matched person.
    if not address:
        try:
            from app.services import crustdata_v2_client
            if crustdata_v2_client.enabled():
                hit_v2 = crustdata_v2_client.deliverable_business_email(
                    (contact.get("LinkedInUrn") or contact.get("LinkedIn") or "").strip())
                if hit_v2:
                    address = hit_v2["email"]
                    contact["Email"] = address
                    contact["EmailSource"] = "crustdata_v2_deliverable"
                    contact["EmailVerified"] = True
        except Exception:
            logger.exception("people-deck crustdata-v2 failed uid=%s", user_id)

    # FullEnrich waterfall (2026-08-24, the chosen email layer): when no
    # provider handed us a sellable address, hunt one at reveal time. Works
    # for ANY provider's contact. 1 credit only when an email is found.
    # DELIVERABLE sells as-is (their measured ~2% bounce); HIGH_PROBABILITY
    # must also pass our SMTP gate; everything else stays a miss.
    # fe_covered skips it too: a person already in the running bulk job
    # would just be asked twice (second start 429s under swipe bursts and
    # can double-bill when both finish).
    if not address and not fe_checked and not fe_covered:
        try:
            from app.services import fullenrich_client
            hit = fullenrich_client.find_work_email(
                first_name=(contact.get("FirstName") or "").strip(),
                last_name=(contact.get("LastName") or "").strip(),
                company=(contact.get("Company") or "").strip(),
                linkedin_url=(contact.get("LinkedIn") or "").strip(),
                db=db,
            )
        except Exception:
            logger.exception("people-deck fullenrich failed uid=%s", user_id)
            hit = None
        if hit:
            ok = hit["status"] == "DELIVERABLE"
            if not ok:
                try:
                    if neverbounce_client.is_configured():
                        ok = neverbounce_client.verify_email(hit["email"]).get("result") == neverbounce_client.RESULT_VALID
                    else:
                        from app.services.crustdata_client import _hunter_says_deliverable
                        ok = _hunter_says_deliverable(hit["email"])
                except Exception:
                    logger.exception("people-deck fullenrich verify failed uid=%s", user_id)
                    ok = False
            if ok:
                address = hit["email"]
                contact["Email"] = address
                contact["EmailSource"] = f"fullenrich_{hit['status'].lower()}"
                contact["EmailVerified"] = True

    if not address:
        _track(db, "reveal", {
            "uid": user_id, "deck": deck_id, "pid": person_id,
            "outcome": "no_email", "source": "", "provider": contact.get("_provider") or "",
            "fe_prefetch_checked": bool(locals().get("fe_checked")),
        })
        return {"email": None, "verified": False, "charged": False,
                "drafted": False, "sent": False}, 200
    _track(db, "reveal", {
        "uid": user_id, "deck": deck_id, "pid": person_id,
        "outcome": "email_found", "source": contact.get("EmailSource") or "provider_direct",
        "provider": contact.get("_provider") or "",
    })

    # Cross-deck guard (2026-08-18). The `revealed` map above is PER DECK, and
    # a re-run of the same prompt mints a new deck_id, so without this the
    # same human could be charged again and written into the tracker again
    # (the "Margot x3" bug). If they are already a contact, hand the address
    # back free and stamp this deck's revealed map so the cheap guard catches
    # the next tap.
    try:
        contacts_col = db.collection("users").document(user_id).collection("contacts")
        existing = None
        for key_field, key_val in (
            ("email", address),
            ("email", address.strip().lower()),
            ("linkedinUrl", (contact.get("LinkedIn") or "").strip()),
        ):
            if not key_val:
                continue
            hits = list(contacts_col.where(key_field, "==", key_val).limit(1).stream())
            if hits:
                existing = hits[0].to_dict() or {}
                break
        if existing is not None:
            try:
                _deck_ref(db, user_id, deck_id).update(
                    {f"revealed.{person_id}": datetime.utcnow().isoformat() + "Z"}
                )
            except Exception:
                pass
            return {"email": address, "verified": True, "charged": False,
                    "drafted": bool(existing.get("emailBody") or existing.get("gmailDraftId")),
                    "sent": bool(existing.get("emailSentAt"))}, 200
    except Exception:
        # A broken guard must never block a legitimate reveal.
        logger.exception("people-deck cross-deck guard failed for uid=%s", user_id)

    user_ref = db.collection("users").document(user_id)
    try:
        user_doc = user_ref.get()
        user_data = user_doc.to_dict() if user_doc.exists else {}
        credits_available = check_and_reset_credits(user_ref, user_data)
    except Exception:
        logger.exception("people-deck could not read credits for uid=%s", user_id)
        return {"error": "Could not load your account. Try again."}, 500

    if credits_available < price:
        return {"error": "Insufficient credits", "credits_needed": price,
                "current_credits": credits_available}, 400

    charged = False
    try:
        ok, _remaining = deduct_credits_atomic(user_id, price, "people_deck_reveal")
        charged = bool(ok)
        if not ok:
            return {"error": "Insufficient credits", "credits_needed": price,
                    "current_credits": credits_available}, 400
    except Exception:
        # Transient Firestore trouble: run uncharged rather than block the user,
        # matching the prompt-search pipeline's forgiveness on deduct errors.
        logger.exception("people-deck credit deduction failed for uid=%s", user_id)

    def _refund(reason: str) -> None:
        if not charged:
            return
        try:
            from app.services.auth import refund_credits_atomic
            refund_credits_atomic(user_id, price, reason)
        except Exception:
            traceback.print_exc()

    # Verification is what the charge is FOR, so a bad address is refunded
    # rather than sold. NeverBounce degrades to "unknown" when unconfigured or
    # unreachable, and unknown is not a failure: we hold the address either way,
    # and refusing to deliver on a verifier outage would be the app breaking,
    # not the data.
    verified = True
    try:
        if neverbounce_client.is_configured():
            check = neverbounce_client.verify_email(address)
            if check.get("result") == neverbounce_client.RESULT_INVALID:
                verified = False
    except Exception:
        logger.exception("people-deck verification failed for %s", address)

    if not verified:
        _refund("people_deck_unverified")
        return {"email": None, "verified": False, "charged": False,
                "drafted": False, "sent": False}, 200

    # ---- The write. From here the address is delivered no matter what, so a
    # failure past this point reports what the user DID get rather than
    # pretending the whole call failed.
    profile = _user_profile(db, user_id, user_email)
    user_data = profile.pop("_userData", {}) or {}

    resume_text = user_data.get("resumeText")
    resume_url = user_data.get("resumeUrl") or user_data.get("resumeURL")
    resume_content = None
    resume_filename = None
    if (not resume_text or len(resume_text.strip()) <= 50) and resume_url:
        try:
            resume_content, resume_filename = download_resume_from_url(resume_url)
            if resume_content:
                resume_text = extract_text_from_pdf_bytes(resume_content)
        except Exception:
            logger.exception("people-deck resume fetch failed for uid=%s", user_id)

    from app.routes.runs import _resolve_email_template
    template_instructions, purpose, subject_line, signoff_config = _resolve_email_template(
        None, user_id, db, user_data=user_data
    )

    subject = body = ""
    try:
        results = batch_generate_emails(
            contacts=[contact],
            resume_text=resume_text,
            user_profile=profile,
            career_interests=user_data.get("careerInterests", []),
            fit_context=None,
            pre_parsed_user_info=user_data.get("resumeParsed"),
            template_instructions=template_instructions,
            email_template_purpose=purpose,
            resume_filename=user_data.get("resumeFileName"),
            subject_line=subject_line,
            signoff_config=signoff_config,
            auth_display_name=auth_display_name or "",
            warmth_data={0: {
                "tier": contact.get("warmth_tier", ""),
                "score": contact.get("warmth_score", 0),
                "label": contact.get("warmth_label", ""),
                "signals": contact.get("warmth_signals", []),
            }},
            uid=user_id,
            enrichment_data=None,
        )
        out = results.get(0) or results.get("0") or {}
        subject = out.get("subject", "") or ""
        body = out.get("plain_body") or out.get("body", "") or ""
    except Exception:
        logger.exception("people-deck email generation failed for uid=%s", user_id)

    if not subject or not body:
        # The address is unlocked and the charge stands (we delivered the thing
        # the price is for). Say what they got.
        _record_reveal(db, user_id, deck_id, person_id, contact, address, None, None, sent=False)
        return {"email": address, "verified": True, "charged": charged,
                "drafted": False, "sent": False}, 200

    contact["emailSubject"] = subject
    contact["emailBody"] = body
    item = {
        "index": 0,
        "contact": contact,
        "email_subject": subject,
        "email_body": body,
        "attach_resume": (purpose in PURPOSES_INCLUDE_RESUME) or email_body_mentions_resume(body),
    }

    drafted = False
    sent = False
    draft_id = None
    draft_url = None
    try:
        creds = _load_user_gmail_creds(user_id)
        if creds:
            user_info = {"name": profile.get("name", ""), "email": profile.get("email", ""),
                         "phone": "", "linkedin": ""}
            tier = user_data.get("subscriptionTier", user_data.get("tier", "free"))
            if tier not in TIER_CONFIGS:
                tier = "free"
            if action == "send":
                from app.services.gmail_client import send_emails_parallel
                results = send_emails_parallel(
                    [item], resume_bytes=resume_content, resume_filename=resume_filename,
                    user_info=user_info, user_id=user_id, tier=tier, user_email=user_email,
                    resume_url=resume_url,
                )
                first = results[0] if results else None
                sent = bool(first and (first.get("message_id") if isinstance(first, dict) else first))
            else:
                from app.services.gmail_client import create_drafts_parallel
                results = create_drafts_parallel(
                    [item], resume_bytes=resume_content, resume_filename=resume_filename,
                    user_info=user_info, user_id=user_id, tier=tier, user_email=user_email,
                    resume_url=resume_url,
                )
                first = results[0] if results else None
                draft_id = (first.get("draft_id") if isinstance(first, dict) else first) or None
                draft_url = first.get("draft_url") if isinstance(first, dict) else None
                drafted = bool(draft_id and not str(draft_id).startswith("mock_"))
    except Exception:
        logger.exception("people-deck gmail step failed for uid=%s", user_id)

    _record_reveal(db, user_id, deck_id, person_id, contact, address, draft_id, draft_url, sent=sent)

    return {"email": address, "verified": True, "charged": charged,
            "drafted": drafted, "sent": sent}, 200


def _record_reveal(db, user_id, deck_id, person_id, contact, address,
                   draft_id, draft_url, *, sent: bool) -> None:
    """Save the person into My Network / the Inbox, and mark them spent on the
    deck so a second swipe cannot charge twice for the same human.

    Writes the same contact doc shape the prompt-search pipeline writes, so this
    person appears in the Inbox and the tracker exactly like every other one. A
    failure here costs bookkeeping, never the user's money or their draft, so it
    never raises."""
    now_iso = datetime.utcnow().isoformat() + "Z"
    today = datetime.now().strftime("%m/%d/%Y")
    try:
        doc = {
            "firstName": (contact.get("FirstName") or "").strip(),
            "lastName": (contact.get("LastName") or "").strip(),
            "email": (address or "").strip().lower(),
            "linkedinUrl": (contact.get("LinkedIn") or "").strip(),
            "company": (contact.get("Company") or "").strip(),
            "jobTitle": (contact.get("Title") or "").strip(),
            "college": (contact.get("College") or "").strip(),
            "city": (contact.get("City") or "").strip(),
            "state": (contact.get("State") or "").strip(),
            "firstContactDate": today,
            "lastContactDate": today,
            "status": "Not Contacted",
            "userId": user_id,
            "createdAt": now_iso,
            "source": "people_deck",
            "emailVerified": True,
            "inOutbox": True,
            "draftToEmail": address,
            "lastActivityAt": now_iso,
            "hasUnreadReply": False,
        }
        if contact.get("emailSubject"):
            doc["emailSubject"] = contact["emailSubject"]
        if contact.get("emailBody"):
            doc["emailBody"] = contact["emailBody"]
            doc["emailGeneratedAt"] = now_iso
        if draft_id:
            doc["gmailDraftId"] = draft_id
            doc["pipelineStage"] = "draft_created"
            doc["draftCreatedAt"] = now_iso
            doc["draftStillExists"] = True
        if draft_url:
            doc["gmailDraftUrl"] = draft_url
        if sent:
            doc["pipelineStage"] = "waiting_on_reply"
            doc["emailSentAt"] = now_iso
            doc["draftStillExists"] = False
        if contact.get("briefing"):
            doc["briefing"] = contact["briefing"]
        db.collection("users").document(user_id).collection("contacts").add(doc)
    except Exception:
        logger.exception("people-deck contact save failed for uid=%s", user_id)

    try:
        _deck_ref(db, user_id, deck_id).update({f"revealed.{person_id}": now_iso})
    except Exception:
        pass
