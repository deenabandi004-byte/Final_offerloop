"""iOS ranker — scored + diversified feed of people to reach out to.

Pure algorithm module. HTTP surface lives in routes/ranker.py. Rylan's
swipe-deck client hits that endpoint only; nothing in this file is
client-aware.

Data flow
---------
    uid
     → _load_user_context(uid, db)      user profile + resume in scorer shape
     → _already_known_keys(uid, db)     (first, last, company) exclude set
     → _fetch_candidates(user_ctx, db)  firm_employees query, App-shape dicts;
                                        falls through to bounded PDL warm-up
                                        (_pdl_warmup_candidates) when the
                                        cache pool is below threshold
     → _score_one(user_ctx, c)          {score, tier, reasons, briefing}
     → _diversify_people(scored, k)     MMR re-rank on company + role family
     → _to_response_dict(…)             trim to response contract (allowlist)

Sensitive-field posture
-----------------------
Three explicit allowlists sit between raw PDL data and Rylan's client:

  1. `firm_cache/schema.py:firm_employee_doc_from_pdl_person` — writer
     allowlist. Builds each firm_employees doc from a fixed 19-field set.
     sex / birth_date / birth_year never appear (grep-verified).
  2. `contacts.py:_RANKER_FIELDS` — Commit 3 write-path allowlist for
     the user's own contacts collection.
  3. `_to_response_dict` in this module — response-shape allowlist. Even
     if firm_employees schema drifts later, only fields named on the
     person-shape allowlist reach the client.

Known gaps (documented; not addressed here)
-------------------------------------------
* HometownSignal (extracted in Commit 2, persisted on user contacts in
  Commit 3) is NOT USED in scoring today. Two blockers:
    - firm_cache/schema.py's writer predates Commit 2 and does not
      persist hometownSignal on firm_employees docs. Candidates queried
      by this module therefore lack the verified hometown field.
    - warmth_scoring._score_shared_identity's `same_hometown` (+8)
      substring-matches user.hometown (from resume) against contact
      City/location. Policy-safe (see coffee_chat_prep.detect_commonality
      lines 76-86 — never derived from name or ethnicity) but weak.
  Wiring HometownSignal in requires: (i) extend firm_cache writer
  allowlist, (ii) update warmth_scoring.same_hometown to prefer
  contact.hometownSignal when present, (iii) optional backfill. Filed
  as a follow-up if ranking quality demands it.

* The write-path allowlist in contact_import.py and
  mcp_server/persist.py is not updated for the 9 typed ranker fields
  either — see Commit 3 message. Contacts written via those two paths
  won't carry ranker features on the user's own contacts collection.
  Not a person_ranker blocker (candidate source is firm_employees,
  not the user's contacts) but noted alongside for symmetry.

Reaching into private helpers
-----------------------------
This module imports leading-underscore helpers from personalization,
warmth_scoring, and student_job_ranker (e.g. `_detect_all_signals`,
`_upgrade_warmth_tier`, `_title_role_families`, `_normalize_company`,
`_build_user_comparison_data`). They are the shared implementations
used by the existing search / warmth / job flows; person_ranker uses
the same primitives so scoring is consistent across surfaces. If the
private-API coupling becomes painful, refactor those helpers to a
public shared module in a follow-up — do not fork the logic here.
"""
from __future__ import annotations

import logging
from typing import Optional

from app.services.firm_cache.schema import (
    FIRM_EMPLOYEES_COLLECTION,
    canonicalize_linkedin_url,
    slugify_company,
    slugify_school,
)
from app.services.firm_cache.reader import firm_employee_doc_to_app_contact
from app.services.student_job_ranker import _title_role_families
from app.utils.personalization import (
    _LEAD_TYPE_RANK,
    _detect_all_signals,
    _normalize_company,
    _upgrade_warmth_tier,
    build_contact_profile,
    build_user_profile,
)
from app.utils.warmth_scoring import (
    _build_user_comparison_data,
    build_briefing_line,
    compute_warmth_score,
)

logger = logging.getLogger(__name__)


# ── Tunables ──────────────────────────────────────────────────────────
# Warmth signal weights live in warmth_scoring.py (SHARED_IDENTITY_CAP,
# per-signal points, TIER_THRESHOLDS). Lead-type priorities live in
# personalization.py (LEAD_TYPE_PRIORITY, _TIER_UPGRADES). REUSE those —
# do not redefine. Only pool + diversify tunables live here.

DEFAULT_CANDIDATE_POOL_CAP = 400   # firm_employees docs pulled per query
DEFAULT_RANKED_LIMIT       = 50    # cap on response length
MAX_RANKED_LIMIT           = 100   # HTTP-level ceiling

# MMR diversify penalties (ported from student_job_ranker.diversify).
LAMBDA_COMPANY     = 3.0           # squared penalty per repeat company
LAMBDA_ROLE_FAMILY = 0.5           # squared penalty per repeat role family

# PDL warm-up bounds. When firm_employees returns a candidate pool below
# MIN_POOL_SIZE_BEFORE_PDL, we fall through to PDL per (company, school)
# combo — pdl_client.search_contacts_from_prompt hits pdl_search_cache
# first (30-day TTL, shared across all users) so cold-PDL only fires on
# genuinely-novel combos. Worst-case cold cost per user:
#     PDL_WARMUP_MAX_COMBOS × PDL_WARMUP_PEOPLE_PER_COMBO PDL credits.
# The write side of search_contacts_from_prompt seeds firm_employees, so
# subsequent decks for the same user (and any other user with an
# overlapping signal) hit cache for free.
MIN_POOL_SIZE_BEFORE_PDL   = 20
PDL_WARMUP_MAX_COMBOS      = 3
PDL_WARMUP_PEOPLE_PER_COMBO = 10


# ── Public entry point ────────────────────────────────────────────────


def rank_people_for_user(
    uid: str,
    db,
    limit: int = DEFAULT_RANKED_LIMIT,
) -> list[dict]:
    """Return a diversified, ranked feed of people uid should reach out to.

    Response element shape:
      {
        "person": {
          "id":          <linkedin-slug or pdlId>,   # non-null by construction
          "firstName", "lastName",
          "linkedinUrl", "pdlId",
          "company", "title",
          "college", "city", "state"
        },
        "score":    int,     # raw warmth score, uncapped
        "tier":     str,     # "warm" | "neutral" | "cold" after lead-type upgrade
        "reasons":  list,    # ordered by personalization.LEAD_TYPE_PRIORITY
        "briefing": str      # single-sentence pitch (may be "")
      }

    Returns [] on:
      * sparse profile (no dreamCompanies AND no academics.school) —
        logged so we can track how often this fires
      * no firm_employees hits for the user's signals
      * unexpected Firestore / scorer errors (never raises — the deck
        contract requires an empty deck rather than a 500)
    """
    limit = max(1, min(int(limit or DEFAULT_RANKED_LIMIT), MAX_RANKED_LIMIT))

    user_ctx = _load_user_context(uid, db)
    if user_ctx is None:
        return []

    if not user_ctx["dream_company_slugs"] and not user_ctx["school_slugs"]:
        logger.info(
            "person_ranker: sparse profile uid=%s "
            "dreamCompanies=0 school=None — returning empty deck",
            uid,
        )
        return []

    exclude_keys = _already_known_keys(uid, db)
    swiped_ids = _swiped_person_ids(uid, db)

    candidates = _fetch_candidates(
        user_ctx,
        db,
        cap=DEFAULT_CANDIDATE_POOL_CAP,
        exclude_keys=exclude_keys,
    )
    if not candidates:
        logger.info(
            "person_ranker: no firm_employees hits uid=%s "
            "dreamCompanies=%d schools=%d — returning empty deck",
            uid,
            len(user_ctx["dream_company_slugs"]),
            len(user_ctx["school_slugs"]),
        )
        return []

    scored: list[dict] = []
    for cand in candidates:
        _id = _candidate_id(cand)
        if _id is None:
            # Drop: Rylan uses id as a render key; a null or dup breaks the deck.
            continue
        if _id in swiped_ids:
            # User has already swiped left/skip on this person in a
            # prior deck. peoplePreferences is the "don't show again"
            # source of truth.
            continue
        item = _score_one(user_ctx, cand)
        if item is None:
            continue
        item["id"] = _id
        item["candidate"] = cand
        scored.append(item)

    scored.sort(key=lambda x: x["score"], reverse=True)
    diversified = _diversify_people(scored, k=limit)
    return [_to_response_dict(x) for x in diversified]


# ── Loaders ───────────────────────────────────────────────────────────


def _load_user_context(uid: str, db) -> Optional[dict]:
    """Read user profile + resumeParsed. Build the dict both scorers
    accept. None on missing user doc (not sparse — genuinely missing)."""
    try:
        snap = db.collection("users").document(uid).get()
    except Exception as exc:
        logger.warning("person_ranker: user fetch failed for uid=%s: %s", uid, exc)
        return None
    if not snap.exists:
        return None
    profile = snap.to_dict() or {}
    resume_parsed = profile.get("resumeParsed") or {}

    # dreamCompanies live under goals.dreamCompanies or top-level (legacy).
    # Entries may be strings or {"name": ...} dicts.
    dream_companies_raw = (
        (profile.get("goals") or {}).get("dreamCompanies")
        or profile.get("dreamCompanies")
        or []
    )
    dream_company_names: list[str] = []
    dream_company_slugs: list[str] = []
    for c in dream_companies_raw:
        name = c.get("name") if isinstance(c, dict) else c
        if not name:
            continue
        name = str(name).strip()
        if not name:
            continue
        dream_company_names.append(name)
        slug = slugify_company(name)
        if slug and slug not in dream_company_slugs:
            dream_company_slugs.append(slug)

    school = (profile.get("academics") or {}).get("school") or profile.get("school")
    school_slugs: list[str] = []
    if school:
        slug = slugify_school(str(school))
        if slug:
            school_slugs.append(slug)

    comparison = _build_user_comparison_data(profile)
    normalized_user = build_user_profile(
        resume_parsed=resume_parsed,
        user_profile=profile,
        personal_note="",
        dream_companies=dream_company_names,
    )

    # Preserve the raw school string alongside its slug so the PDL warm-up
    # path can pass display-form names to search_contacts_from_prompt
    # (which slugifies internally and needs the real name to match PDL's
    # education.school.name index).
    school_names: list[str] = []
    if school:
        s = str(school).strip()
        if s:
            school_names.append(s)

    return {
        "uid":                 uid,
        "profile":             profile,
        "resume_parsed":       resume_parsed,
        "comparison":          comparison,
        "normalized_user":     normalized_user,
        "dream_company_names": dream_company_names,
        "dream_company_slugs": dream_company_slugs,
        "school_names":        school_names,
        "school_slugs":        school_slugs,
    }


def _already_known_keys(uid: str, db) -> set:
    """(first_lower, last_lower, company_lower) tuples of the user's
    existing contacts — same dedupe key firm_cache.reader uses. Empty
    set on any Firestore error; never breaks the deck."""
    keys: set = set()
    try:
        contacts_ref = db.collection("users").document(uid).collection("contacts")
        for snap in contacts_ref.stream():
            d = snap.to_dict() or {}
            first = (d.get("firstName") or "").lower().strip()
            last = (d.get("lastName") or "").lower().strip()
            company = (d.get("company") or "").lower().strip()
            if first and last:
                keys.add((first, last, company))
    except Exception as exc:
        logger.debug("person_ranker: known-contacts fetch failed: %s", exc)
    return keys


def _swiped_person_ids(uid: str, db) -> set:
    """candidate_ids the user has already swiped LEFT or SKIP — excluded
    from future decks. Swipe-right is excluded elsewhere via
    _already_known_keys (right → saved to contacts → matched by
    (first, last, company)), so we intentionally do NOT read "right"
    signals here — that would double-suppress.

    peoplePreferences docs are keyed on the candidate_id we sent to the
    client (LinkedIn slug preferred, pdlId fallback), so lookup here
    matches the id we'll compute for fresh candidates in rank_people_for_user.

    Empty set on any Firestore error; never breaks the deck.
    """
    ids: set = set()
    try:
        prefs_ref = db.collection("users").document(uid).collection("peoplePreferences")
        for snap in prefs_ref.where("signal", "in", ["left", "skip"]).stream():
            ids.add(snap.id)
    except Exception as exc:
        logger.debug("person_ranker: swiped-ids fetch failed: %s", exc)
    return ids


# ── Candidate fetch ───────────────────────────────────────────────────


def _fetch_candidates(
    user_ctx: dict,
    db,
    cap: int,
    exclude_keys: Optional[set] = None,
) -> list[dict]:
    """Query firm_employees for candidate people. Uses indexed where()
    only — never in-memory filter on unindexed fields. Excludes anyone
    already in the user's contacts collection.

    Query strategy (highest specificity first, mirrors firm_cache.reader):
      companies + schools → company AND schools array-contains  (composite index)
      companies only      → company                             (single-field index)
      schools only        → schools array-contains              (single-field index)

    If the firm_employees pool comes up below MIN_POOL_SIZE_BEFORE_PDL for
    the user's signals, falls through to a bounded PDL warm-up. See
    _pdl_warmup_candidates for cost bounds.
    """
    exclude_keys = exclude_keys or set()
    pool = _fetch_from_firm_cache(user_ctx, db, cap, exclude_keys)

    if len(pool) >= MIN_POOL_SIZE_BEFORE_PDL:
        return pool

    # Cache pool is thin — warm from PDL. Results come back in App-shape
    # already; search_contacts_from_prompt's own JIT writer will backfill
    # firm_employees so the next /candidates call for this user (or any
    # user with an overlapping signal) hits cache for free.
    warmed = _pdl_warmup_candidates(user_ctx, exclude_keys)
    if not warmed:
        return pool

    # Dedupe merge: keep firm_cache entries first (they already have
    # canonical company_display / schools_display), then append PDL fills
    # whose LinkedIn slug isn't already in the pool.
    seen: set[str] = set()
    for c in pool:
        slug = _linkedin_slug(c.get("LinkedIn") or "")
        if slug:
            seen.add(slug)
    merged = list(pool)
    for c in warmed:
        slug = _linkedin_slug(c.get("LinkedIn") or "")
        if slug and slug in seen:
            continue
        merged.append(c)
        if slug:
            seen.add(slug)
        if len(merged) >= cap:
            break
    return merged


def _fetch_from_firm_cache(
    user_ctx: dict,
    db,
    cap: int,
    exclude_keys: set,
) -> list[dict]:
    """firm_employees query only. Extracted from _fetch_candidates so the
    PDL fallback path can measure pool size cleanly."""
    companies = user_ctx.get("dream_company_slugs") or []
    schools = user_ctx.get("school_slugs") or []
    if not companies and not schools:
        return []

    seen_ids: set[str] = set()
    docs: list[dict] = []

    def _stream(query) -> None:
        try:
            for snap in query.stream():
                _id = snap.id
                if _id in seen_ids:
                    continue
                seen_ids.add(_id)
                d = snap.to_dict() or {}
                d["_id"] = _id
                docs.append(d)
        except Exception as exc:
            logger.debug("person_ranker: firm_employees query failed: %s", exc)

    col = db.collection(FIRM_EMPLOYEES_COLLECTION)
    if companies and schools:
        for co in companies:
            for sch in schools:
                _stream(
                    col.where("company", "==", co)
                       .where("schools", "array_contains", sch)
                       .limit(cap)
                )
    elif companies:
        for co in companies:
            _stream(col.where("company", "==", co).limit(cap))
    else:
        for sch in schools:
            _stream(col.where("schools", "array_contains", sch).limit(cap))

    kept: list[dict] = []
    for doc in docs:
        first = (doc.get("first_name") or "").lower().strip()
        last = (doc.get("last_name") or "").lower().strip()
        company = (doc.get("company_display") or "").lower().strip()
        if (first, last, company) in exclude_keys:
            continue
        kept.append(doc)
        if len(kept) >= cap:
            break

    return [firm_employee_doc_to_app_contact(d) for d in kept]


def _pdl_warmup_candidates(user_ctx: dict, exclude_keys: set) -> list[dict]:
    """Bounded PDL fetch to seed the candidate pool when firm_employees
    is cold. One search_contacts_from_prompt call per (company, school)
    combo, capped at PDL_WARMUP_MAX_COMBOS combos × PDL_WARMUP_PEOPLE_PER_COMBO
    people.

    Cost path:
      * Each call routes through pdl_client's pdl_search_cache first —
        query-hash keyed, 30-day TTL, shared across all users. So if any
        user has run the same (company, school) query recently, this
        costs 0 PDL credits.
      * On true cold-PDL, one call costs ~PDL_WARMUP_PEOPLE_PER_COMBO
        credits. Worst case per fully cold user:
        PDL_WARMUP_MAX_COMBOS × PDL_WARMUP_PEOPLE_PER_COMBO credits.

    Never raises. Returns [] on any failure or when no combos are usable.
    """
    company_names = user_ctx.get("dream_company_names") or []
    school_names = user_ctx.get("school_names") or []
    if not company_names or not school_names:
        # Ranker requires at least one dream company for meaningful PDL
        # warm-up. School-only PDL sweep is too broad — would burn credits
        # returning random alumni whose companies the user hasn't targeted.
        return []

    # Cap combos: top-N dream companies × user's school.
    combos: list[tuple[str, str]] = []
    for co in company_names[:PDL_WARMUP_MAX_COMBOS]:
        for sch in school_names:
            combos.append((co, sch))
            if len(combos) >= PDL_WARMUP_MAX_COMBOS:
                break
        if len(combos) >= PDL_WARMUP_MAX_COMBOS:
            break

    if not combos:
        return []

    try:
        from app.services.pdl_client import search_contacts_from_prompt
    except Exception as exc:
        logger.warning("person_ranker: pdl_client import failed: %s", exc)
        return []

    merged: list[dict] = []
    seen_slugs: set[str] = set()
    for co_name, sch_name in combos:
        parsed_prompt = {
            "companies":        [{"name": co_name}],
            "schools":          [sch_name],
            "title_variations": [],
            "locations":        [],
            "industries":       [],
        }
        try:
            contacts, _rl, _saved, _meta = search_contacts_from_prompt(
                parsed_prompt,
                PDL_WARMUP_PEOPLE_PER_COMBO,
                exclude_keys=exclude_keys,
                user_profile=user_ctx.get("profile"),
            )
        except Exception as exc:
            logger.warning(
                "person_ranker: PDL warm-up failed co=%r sch=%r: %s",
                co_name, sch_name, exc,
            )
            continue

        for c in (contacts or []):
            slug = _linkedin_slug(c.get("LinkedIn") or "")
            if slug and slug in seen_slugs:
                continue
            if slug:
                seen_slugs.add(slug)
            merged.append(c)

    if merged:
        logger.info(
            "person_ranker: PDL warm-up returned %d contacts across %d combos "
            "(uid=%s)",
            len(merged), len(combos), user_ctx.get("uid"),
        )
    return merged


def _linkedin_slug(url: str) -> str:
    """Canonical linkedin slug for dedupe. Empty string on any failure."""
    if not url:
        return ""
    try:
        _canon, slug = canonicalize_linkedin_url(url)
        return slug or ""
    except Exception:
        return ""


# ── Scoring ───────────────────────────────────────────────────────────


def _score_one(user_ctx: dict, candidate: dict) -> dict:
    """Compose warmth_scoring + personalization signals for one candidate.

    Returns {score, tier, reasons, briefing}. On internal exception,
    returns a zero-score record rather than dropping the candidate —
    the deck should degrade gracefully on one bad record rather than gap.
    """
    try:
        warmth = compute_warmth_score(user_ctx["comparison"], candidate)
        base_score = int(warmth.get("score") or 0)
        base_tier = warmth.get("tier") or "cold"
        warmth_signals = warmth.get("signals") or []

        contact_profile = build_contact_profile(candidate)
        lead_signals = _detect_all_signals(user_ctx["normalized_user"], contact_profile) or []

        # personalization._detect_all_signals is NOT pre-sorted (per its
        # docstring). Sort by LEAD_TYPE_PRIORITY so the client sees the
        # strongest hook first.
        lead_signals = sorted(
            lead_signals,
            key=lambda s: _LEAD_TYPE_RANK.get(
                s.get("type", "") if isinstance(s, dict) else "",
                len(_LEAD_TYPE_RANK),
            ),
        )

        # Apply lead-type tier upgrades. _upgrade_warmth_tier never
        # downgrades and is monotone-capped, so accumulating is safe.
        tier = base_tier
        for sig in lead_signals:
            lt = sig.get("type") if isinstance(sig, dict) else None
            if lt:
                tier = _upgrade_warmth_tier(tier, lt)

        briefing = build_briefing_line(candidate, warmth_signals) or ""

        return {
            "score":    base_score,
            "tier":     tier,
            "reasons":  lead_signals,
            "briefing": briefing,
        }
    except Exception as exc:
        logger.warning(
            "person_ranker: scoring failed for candidate %s: %s",
            candidate.get("pdlId") or candidate.get("LinkedIn") or "?",
            exc,
        )
        return {"score": 0, "tier": "cold", "reasons": [], "briefing": ""}


# ── Diversify ─────────────────────────────────────────────────────────


def _diversify_people(scored: list[dict], k: int) -> list[dict]:
    """MMR re-rank ported from student_job_ranker.diversify (see that
    module for the original job-side version).

    Each round picks argmax of:
        adj = score
              - LAMBDA_COMPANY     * (company_count) ** 2
              - LAMBDA_ROLE_FAMILY * Σ(family_count ** 2 for f in families)

    Keys per candidate:
      * normalized company via personalization._normalize_company
      * title role families via student_job_ranker._title_role_families

    Soft-caps repeat companies at ~3-4 in the top ~20, so the swipe
    deck isn't eight identical Google SWE profiles in a row.
    """
    if not scored:
        return []
    remaining = list(scored)
    picked: list[dict] = []
    company_counts: dict[str, int] = {}
    family_counts: dict[str, int] = {}

    while remaining and len(picked) < k:
        best_i = 0
        best_adj = float("-inf")
        for i, item in enumerate(remaining):
            cand = item["candidate"]
            co = _normalize_company(cand.get("Company") or "") or "_unknown"
            fams = _title_role_families(cand.get("Title") or "")
            co_ct = company_counts.get(co, 0)
            fam_penalty = (
                sum(family_counts.get(f, 0) ** 2 for f in fams) if fams else 0
            )
            adj = (
                item["score"]
                - LAMBDA_COMPANY * (co_ct ** 2)
                - LAMBDA_ROLE_FAMILY * fam_penalty
            )
            if adj > best_adj:
                best_adj = adj
                best_i = i

        chosen = remaining.pop(best_i)
        cand = chosen["candidate"]
        co = _normalize_company(cand.get("Company") or "") or "_unknown"
        fams = _title_role_families(cand.get("Title") or "")
        company_counts[co] = company_counts.get(co, 0) + 1
        for f in fams:
            family_counts[f] = family_counts.get(f, 0) + 1
        picked.append(chosen)

    return picked


# ── ID + response ─────────────────────────────────────────────────────


def _candidate_id(candidate: dict) -> Optional[str]:
    """Stable id per candidate. LinkedIn slug preferred, pdlId fallback,
    None if both missing (caller drops the candidate — Rylan uses id as
    a render key, a null or duplicate breaks the deck)."""
    url = candidate.get("LinkedIn") or candidate.get("linkedin_url") or ""
    if url:
        _canon, slug = canonicalize_linkedin_url(url)
        if slug:
            return slug
    pdl_id = (candidate.get("pdlId") or candidate.get("pdl_id") or "").strip()
    return pdl_id or None


def _to_response_dict(scored_item: dict) -> dict:
    """Trim internal scored dict → response contract. EXPLICIT KEY
    ALLOWLIST — defense-in-depth against firm_employees schema drift.
    See module docstring 'Sensitive-field posture'.
    """
    cand = scored_item["candidate"]
    return {
        "person": {
            "id":          scored_item["id"],
            "firstName":   cand.get("FirstName") or "",
            "lastName":    cand.get("LastName") or "",
            "linkedinUrl": cand.get("LinkedIn") or "",
            "pdlId":       cand.get("pdlId") or "",
            "company":     cand.get("Company") or "",
            "title":       cand.get("Title") or "",
            "college":     cand.get("College") or "",
            "city":        cand.get("City") or "",
            "state":       cand.get("State") or "",
        },
        "score":    scored_item["score"],
        "tier":     scored_item["tier"],
        "reasons":  scored_item["reasons"],
        "briefing": scored_item["briefing"],
    }
