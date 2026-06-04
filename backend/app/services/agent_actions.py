"""
Agent Actions — real executors that wrap existing services.

Each action (find, find_jobs, discover_companies, find_hiring_managers)
calls the actual PDL / Perplexity / Firecrawl / email generation services.
SerpAPI fallback for job search is gated by ENABLE_SERPAPI_FALLBACK
(off by default). Contacts are saved to Firestore and emails are generated
immediately.
"""
from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timedelta, timezone

from app.extensions import get_db
from app.services.pdl_client import search_contacts_from_prompt, get_contact_identity
from app.services.reply_generation import batch_generate_emails
from app.services.auth import deduct_credits_atomic
from app.services.loop_budget import CREDIT_COSTS
from app.utils.exceptions import RateLimitError
from app.utils.warmth_scoring import score_contacts_for_email
from email_templates import get_template_instructions, roles_mode_template_instructions

logger = logging.getLogger(__name__)


def _perplexity_only(uid: str) -> bool:
    """Phase 8.5 — read the AGENT_MODE_PERPLEXITY_ONLY flag. When on, Agent
    Mode swaps Firecrawl + Apify for Perplexity-equivalent calls. Default
    off so legacy paths remain primary until rollout completes."""
    try:
        from app.services.feature_flags import is_enabled
        return is_enabled("AGENT_MODE_PERPLEXITY_ONLY", uid=uid, default=False)
    except Exception:
        return False


def _try_auto_send(
    uid: str,
    config: dict,
    user_data: dict,
    contact_doc: dict,
    email: str,
    email_subject: str,
    email_body: str,
    now_iso: str,
) -> int:
    """Phase 9 — run the send gate, and if allowed, actually send the email
    from the student's Gmail. Mutates `contact_doc` in place to stamp either
    successful-send fields (gmailMessageId, gmailThreadId, emailSentAt,
    pipelineStage="email_sent") or the autoSendPausedReason / autoSendError
    that drives the /tracker pause pill.

    Args:
        config: synthetic_config built by loop_jobs.run_loop_cycle_job;
            carries autoSendMode + first-N counters + hardDailySendCap.
        contact_doc: the contact doc being assembled before Firestore .add().
            Verification cache fields (emailVerifiedAt + emailVerificationStatus)
            are read from here and written back on every gate call so the
            30-day cache window is always refreshed.

    Returns:
        Credit cost to bill for this contact. AUTO_SEND_CREDIT_COST when a
        real send fired; 0 when the gate denied, the atomic reservation lost
        a race, or Gmail returned an error.
    """
    if not email.strip() or not email_body.strip():
        logger.info(
            "auto_send_skipped uid=%s reason=blank_email_or_body has_email=%s has_body=%s",
            uid, bool(email.strip()), bool(email_body.strip()),
        )
        return 0  # No email to send — nothing to gate.

    from app.services.agent_send_gate import can_auto_send
    from app.services.auth import increment_sends_today_atomic
    from app.services.gmail_client import send_email_for_user
    from app.services.loop_budget import AUTO_SEND_CREDIT_COST

    tier = (
        user_data.get("subscriptionTier")
        or user_data.get("tier")
        or "free"
    )
    user_tz = user_data.get("timezone") or user_data.get("tz")

    # Build minimal loop + contact views from config / the in-flight doc.
    # config carries the auto-send state via loop_jobs.synthetic_config.
    loop_view = {
        "autoSendMode": config.get("autoSendMode", "draft_only"),
        "autoSendApprovedCount": config.get("autoSendApprovedCount", 0),
        # 0 = no warmup gate (the shipping default). Legacy "5" here was a
        # latent regression-trap: when the user actually had 0 in Firestore,
        # `loop.get(k, 5)` returned 0 correctly, but downstream `or 5`
        # patterns silently turned it back into 5. We now default to the
        # same value the schema does.
        "autoSendApprovedAfter": config.get("autoSendApprovedAfter", 0),
        "hardDailySendCap": config.get("hardDailySendCap"),
    }
    contact_view = {
        "email": email,
        "emailVerifiedAt": contact_doc.get("emailVerifiedAt"),
        "emailVerificationStatus": contact_doc.get("emailVerificationStatus"),
    }

    logger.info(
        "auto_send_gate_start uid=%s tier=%s autoSendMode=%s approvedCount=%s approvedAfter=%s hardCap=%s",
        uid, tier, loop_view["autoSendMode"], loop_view["autoSendApprovedCount"],
        loop_view["autoSendApprovedAfter"], loop_view["hardDailySendCap"],
    )

    gate = can_auto_send(
        uid=uid,
        tier=tier,
        loop=loop_view,
        contact=contact_view,
        user_timezone=user_tz,
    )

    # Persist Hunter's verdict whenever it was consulted (fresh or cached)
    # so the next cycle's gate hits the cache instead of paying again.
    verification = gate.get("verification")
    if verification:
        contact_doc["emailVerifiedAt"] = verification.get("verifiedAt")
        contact_doc["emailVerificationStatus"] = verification.get("status")

    if not gate["allowed"]:
        contact_doc["autoSendPausedReason"] = gate.get("reason") or "unknown"
        if gate.get("effective_cap") is not None:
            contact_doc["autoSendDailyCap"] = gate["effective_cap"]
        logger.info(
            "auto_send_denied uid=%s reason=%s effective_cap=%s verification_status=%s",
            uid, gate.get("reason"), gate.get("effective_cap"),
            (verification or {}).get("status"),
        )
        return 0

    # Atomic per-user daily-cap reservation. The pre-flight read in the
    # gate is non-atomic; this is the race-safe commit. A simultaneous
    # send may pass the gate but lose this race — in which case we don't
    # send and stamp daily_cap.
    reserved, _new_count, effective_cap = increment_sends_today_atomic(
        uid,
        tier,
        hard_cap=loop_view.get("hardDailySendCap"),
    )
    if not reserved:
        contact_doc["autoSendPausedReason"] = "daily_cap"
        contact_doc["autoSendDailyCap"] = effective_cap
        logger.info(
            "auto_send_denied uid=%s reason=daily_cap_race effective_cap=%s",
            uid, effective_cap,
        )
        return 0

    try:
        send_result = send_email_for_user(
            uid,
            to=email,
            subject=email_subject,
            body_html=email_body,
        )
    except Exception as e:
        # Gmail flapped (quota / auth / network). Don't refund the daily-cap
        # slot — if Gmail is unhappy, we don't want to immediately retry.
        logger.warning(
            "auto_send_failed uid=%s contact_email=%s err=%s",
            uid, email, e,
        )
        contact_doc["autoSendError"] = str(e)
        contact_doc["autoSendPausedReason"] = "send_error"
        return 0

    contact_doc["gmailMessageId"] = send_result.get("id", "")
    contact_doc["gmailThreadId"] = send_result.get("threadId", "")
    contact_doc["emailSentAt"] = now_iso
    contact_doc["pipelineStage"] = "email_sent"
    contact_doc["inOutbox"] = True
    logger.info(
        "auto_send_ok uid=%s contact_email=%s message_id=%s",
        uid, email, send_result.get("id", ""),
    )
    return AUTO_SEND_CREDIT_COST

# ── Common domain mapping for Clearbit logos ──────────────────────────────

_COMPANY_DOMAINS = {
    "goldman sachs": "goldmansachs.com",
    "jpmorgan": "jpmorgan.com",
    "jp morgan": "jpmorgan.com",
    "morgan stanley": "morganstanley.com",
    "bank of america": "bankofamerica.com",
    "mckinsey": "mckinsey.com",
    "bain": "bain.com",
    "bcg": "bcg.com",
    "boston consulting group": "bcg.com",
    "deloitte": "deloitte.com",
    "pwc": "pwc.com",
    "ey": "ey.com",
    "ernst & young": "ey.com",
    "kpmg": "kpmg.com",
    "google": "google.com",
    "meta": "meta.com",
    "facebook": "meta.com",
    "amazon": "amazon.com",
    "apple": "apple.com",
    "microsoft": "microsoft.com",
    "netflix": "netflix.com",
    "tesla": "tesla.com",
    "lazard": "lazard.com",
    "evercore": "evercore.com",
    "centerview": "centerviewpartners.com",
    "blackstone": "blackstone.com",
    "kkr": "kkr.com",
    "carlyle": "carlyle.com",
    "citadel": "citadel.com",
    "bridgewater": "bridgewater.com",
    "two sigma": "twosigma.com",
    "jane street": "janestreet.com",
}


# ── Cost-aware caching for roles mode ─────────────────────────────────────
#
# Each cache check is a Firestore subcollection scan, scoped by loopId, with a
# TTL chosen per the data's volatility (per the Slice 2 plan):
#   - companies: 7 days (slow-moving discovery list)
#   - jobs:      3 days (postings rotate fast)
#   - HMs:      30 days (a founder identified once stays valid for a month)
#
# Misses are silent — when loopId is absent (e.g. legacy callers without the
# new synthetic_config plumbing) the check returns False and the action runs
# its full external-API path, preserving today's behavior.

_CACHE_TTL_COMPANIES = timedelta(days=7)
_CACHE_TTL_JOBS = timedelta(days=3)
_CACHE_TTL_HMS = timedelta(days=30)
# A cache "hit" needs at least one fresh row. We don't try to refill partial
# caches — the planner re-emits the action next cycle if results are thin.
_CACHE_MIN_ROWS = 1


def _is_cache_fresh(created_at, ttl: timedelta) -> bool:
    """Treat any non-empty ISO/datetime field within TTL as fresh."""
    if not created_at:
        return False
    try:
        if isinstance(created_at, str):
            dt = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
        else:
            dt = created_at
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return (datetime.now(timezone.utc) - dt) < ttl
    except Exception:
        return False


def _has_fresh_cached_rows(
    db, uid: str, subcollection: str, loop_id: str, ttl: timedelta,
    company: str | None = None,
) -> bool:
    """Returns True if `users/{uid}/{subcollection}/` has at least one row
    matching loop_id (+ optional company) created within TTL. False on any
    Firestore error so the action falls back to the live API path."""
    if not loop_id:
        return False
    try:
        ref = db.collection("users").document(uid).collection(subcollection) \
                .where("loopId", "==", loop_id)
        if company:
            ref = ref.where("company", "==", company)
        fresh = 0
        for doc in ref.stream():
            data = doc.to_dict() or {}
            if _is_cache_fresh(data.get("createdAt"), ttl):
                fresh += 1
                if fresh >= _CACHE_MIN_ROWS:
                    return True
        return False
    except Exception:
        logger.warning(
            "cache lookup failed: subcollection=%s loop=%s company=%s",
            subcollection, loop_id, company, exc_info=True,
        )
        return False


# Brief-dependent caches. agent_companies and agent_jobs are derived from
# briefParsed.companies / briefParsed.roles, so a brief edit invalidates them.
# HM cache (contacts/) stays — once a founder is identified at a small company,
# their identity doesn't change with a brief edit.
_BRIEF_DEPENDENT_CACHE_SUBCOLLECTIONS = ("agent_companies", "agent_jobs")


def purge_brief_dependent_caches(db, uid: str, loop_id: str) -> int:
    """Delete cached company + job rows scoped to this Loop. Called when the
    Loop's brief changes so the next cycle re-discovers against the new brief
    instead of serving stale cache. Returns the number of docs deleted."""
    if not loop_id:
        return 0
    deleted = 0
    for subcollection in _BRIEF_DEPENDENT_CACHE_SUBCOLLECTIONS:
        try:
            ref = (
                db.collection("users").document(uid).collection(subcollection)
                  .where("loopId", "==", loop_id)
            )
            for doc in ref.stream():
                doc.reference.delete()
                deleted += 1
        except Exception:
            logger.warning(
                "cache purge failed: subcollection=%s loop=%s",
                subcollection, loop_id, exc_info=True,
            )
    return deleted


def _company_to_domain(company_name: str) -> str | None:
    """Map company name to domain for Clearbit logo."""
    if not company_name:
        return None
    key = company_name.strip().lower()
    if key in _COMPANY_DOMAINS:
        return _COMPANY_DOMAINS[key]
    # Fallback: lowercase, remove spaces/special chars, add .com
    cleaned = "".join(c for c in key if c.isalnum())
    return f"{cleaned}.com" if cleaned else None


# ── HM provenance (mode-aware template selection) ──────────────────────────
#
# Each saved HM contact gets a `discoveredVia` tag that records WHY the planner
# surfaced them. Two values today:
#   "role_search" — surfaced because the student is hunting open postings,
#                   typically at a small / founder-led company where direct
#                   founder outreach beats applying through an ATS. Draft uses
#                   the roles-mode founder-voice template.
#   "networking"  — surfaced to support the networking goal (the student
#                   wants to talk to current HMs / leaders). Draft uses the
#                   people-mode voice (the user's preset template, unmodified).
#
# Resolution rules (per the PR1 plan, D7):
#   - Pure people mode → all HMs default to "networking" (legacy behavior).
#   - Pure roles mode  → all HMs default to "role_search" (foundation behavior).
#   - Both mode        → the planner is instructed to emit a per-HM-action
#                        `discoveredVia` field. We read it here and fall back
#                        to "networking" if the LLM forgets (safer default —
#                        the people-voice draft works for either context, the
#                        founder-voice draft would feel off without a posting).
_VALID_HM_PROVENANCE = frozenset({"role_search", "networking"})


def _resolve_hm_provenance(loop_mode: str, action: dict) -> str:
    """Pick the HM contact's discoveredVia value. See block comment above."""
    if loop_mode == "roles":
        return "role_search"
    if loop_mode == "both":
        raw = (action or {}).get("discoveredVia")
        # Only strings are valid candidates — guards against the LLM
        # emitting a list / dict / number for this field.
        if isinstance(raw, str) and raw in _VALID_HM_PROVENANCE:
            return raw
        return "networking"  # safer default in both mode (see comment above)
    # people mode + anything unknown
    return "networking"


# ── FIND executor ─────────────────────────────────────────────────────────


def execute_find_and_draft(
    uid: str,
    action: dict,
    config: dict,
    user_data: dict,
) -> dict:
    """Find contacts via PDL and generate email drafts for them.

    Returns dict with contactsFound, emailsDrafted, contacts, creditsSpent.
    """
    db = get_db()
    company = action.get("company", "")
    title = action.get("title", "Software Engineer")
    count = min(action.get("count", 3), 5)

    # Build parsed prompt for PDL (must match prompt_parser output format)
    parsed_prompt = {
        "companies": [{"name": company}] if company else [],
        "title_variations": [title.lower()] if title else [],
        "schools": [],
        "locations": [],
    }

    # Add alumni preference (schools expects plain strings)
    prof = user_data.get("professionalInfo") or {}
    if config.get("preferAlumni") and prof.get("university"):
        parsed_prompt["schools"] = [prof["university"]]

    # Add location preference (locations expects plain strings)
    locations = config.get("targetLocations", [])
    if locations:
        parsed_prompt["locations"] = [loc for loc in locations[:2]]

    # Build exclusion set (dedup against existing contacts)
    exclusion_data = _build_exclusion_sets(uid, db)
    exclude_keys = exclusion_data["identity_set"]

    # Search PDL
    max_contacts = count
    tier_max = 15  # Elite tier
    user_profile = _build_user_profile(user_data)

    try:
        logger.info(
            "Agent find: uid=%s company=%s title=%s count=%d schools=%s locations=%s",
            uid, company, title, count,
            parsed_prompt.get("schools", []),
            parsed_prompt.get("locations", []),
        )
        result = search_contacts_from_prompt(
            parsed_prompt=parsed_prompt,
            max_contacts=min(max_contacts, tier_max),
            exclude_keys=exclude_keys,
            user_profile=user_profile,
        )
        # Returns (filtered_list, retry_level, already_saved, adjacency_metadata)
        raw_contacts = result[0] if isinstance(result, tuple) else result
        logger.info("Agent find first attempt: %d contacts for %s", len(raw_contacts) if raw_contacts else 0, company)

        # If no results found with alumni+location filters, retry with just company+title
        if not raw_contacts and (parsed_prompt.get("schools") or parsed_prompt.get("locations")):
            logger.info("Agent retry without alumni/location filters for %s", company)
            relaxed_prompt = {
                "companies": parsed_prompt["companies"],
                "title_variations": parsed_prompt.get("title_variations", []),
                "schools": [],
                "locations": [],
            }
            result = search_contacts_from_prompt(
                parsed_prompt=relaxed_prompt,
                max_contacts=min(max_contacts, tier_max),
                exclude_keys=exclude_keys,
                user_profile=user_profile,
            )
            raw_contacts = result[0] if isinstance(result, tuple) else result
            logger.info("Agent find relaxed retry: %d contacts for %s", len(raw_contacts) if raw_contacts else 0, company)

    except Exception as e:
        logger.exception("PDL search failed for agent uid=%s company=%s", uid, company)
        return {
            "contactsFound": 0,
            "emailsDrafted": 0,
            "contacts": [],
            "creditsSpent": 0,
            "error": f"{type(e).__name__}: {e}",
        }

    if not raw_contacts:
        return {
            "contactsFound": 0,
            "emailsDrafted": 0,
            "contacts": [],
            "creditsSpent": 0,
        }

    # Filter duplicates
    filtered = []
    for c in raw_contacts:
        email = (c.get("Email") or c.get("WorkEmail") or c.get("email") or "").strip().lower()
        fn = (c.get("FirstName") or c.get("firstName") or "").strip().lower()
        ln = (c.get("LastName") or c.get("lastName") or "").strip().lower()
        co = (c.get("Company") or c.get("company") or "").strip().lower()
        if email and email in exclusion_data["email_set"]:
            continue
        if fn and ln and co and f"{fn}_{ln}_{co}" in exclusion_data["name_company_set"]:
            continue
        filtered.append(c)
        if len(filtered) >= count:
            break

    if not filtered:
        return {
            "contactsFound": 0,
            "emailsDrafted": 0,
            "contacts": [],
            "creditsSpent": 0,
        }

    # Enrich contacts with non-LinkedIn web presence (Perplexity)
    enrichment_data = {}
    try:
        from app.services.perplexity_client import batch_enrich_contacts
        enrichment_data = batch_enrich_contacts(filtered)
        for idx, c in enumerate(filtered):
            enrich = enrichment_data.get(idx, {})
            c["enrichment_talking_points"] = enrich.get("talking_points", [])
            c["enrichment_recent_activity"] = enrich.get("recent_activity", "")
            if enrich.get("media_appearances"):
                c["perplexity_media_appearances"] = enrich["media_appearances"]
            if enrich.get("published_writing"):
                c["perplexity_published_writing"] = enrich["published_writing"]
            if enrich.get("news_mentions"):
                c["perplexity_news_mentions"] = enrich["news_mentions"]
    except Exception:
        logger.warning("Contact enrichment failed, continuing without", exc_info=True)

    # Recent posts / public activity (Apify legacy; Perplexity when flag on)
    if _perplexity_only(uid):
        try:
            from app.services.perplexity_client import enrich_professional_presence
            presence_results = enrich_professional_presence(filtered) or {}
            for idx, c in enumerate(filtered):
                payload = presence_results.get(idx, {})
                if payload.get("linkedin_recent_posts"):
                    c["linkedin_recent_posts"] = payload["linkedin_recent_posts"]
        except Exception:
            logger.warning("Perplexity professional-presence enrichment failed, continuing", exc_info=True)
    else:
        try:
            from app.services.apify_client import batch_enrich_linkedin_posts_via_apify
            apify_results = batch_enrich_linkedin_posts_via_apify(filtered) or {}
            for idx, c in enumerate(filtered):
                payload = apify_results.get(idx, {})
                if payload.get("linkedin_recent_posts"):
                    c["linkedin_recent_posts"] = payload["linkedin_recent_posts"]
        except Exception:
            logger.warning("Apify LinkedIn enrichment failed, continuing", exc_info=True)

    # Company news (Perplexity, batched per company)
    try:
        from app.services.perplexity_client import batch_enrich_company_news
        co_results = batch_enrich_company_news(filtered) or {}
        for idx, c in enumerate(filtered):
            co = co_results.get(idx, {})
            if co.get("company_recent_news"):
                c["company_recent_news"] = co["company_recent_news"]
            if co.get("company_description"):
                c["company_description"] = co["company_description"]
    except Exception:
        logger.warning("Perplexity company enrichment failed, continuing", exc_info=True)

    try:
        _apify_post_count = sum(len(c.get("linkedin_recent_posts") or []) for c in filtered)
        _pplx_person_hits = sum(
            1 for c in filtered
            if c.get("perplexity_media_appearances")
            or c.get("perplexity_published_writing")
            or c.get("perplexity_news_mentions")
            or c.get("enrichment_talking_points")
        )
        _unique_companies = len({
            (c.get("Company") or "").strip().lower()
            for c in filtered if (c.get("Company") or "").strip()
        })
        logger.info(
            f"[Enrich] uid={uid} contacts={len(filtered)} apify_posts={_apify_post_count} "
            f"perplexity_person_hits={_pplx_person_hits} perplexity_company_unique={_unique_companies}"
        )
    except Exception:
        pass

    # Generate emails
    resume_text = user_data.get("resumeText") or ""
    career_interests = user_data.get("careerInterests") or []
    pre_parsed = user_data.get("resumeParsed")

    # Resolve email template from agent config
    template_instructions = _resolve_agent_template(config, user_data, db, uid)

    # Warmth scoring — returns a dict keyed by index, NOT the contact list
    warmth_data = {}
    try:
        warmth_data = score_contacts_for_email(user_profile, filtered)
    except Exception:
        logger.warning("Warmth scoring failed, continuing without")

    # Attach warmth data to each contact
    for i, c in enumerate(filtered):
        wd = warmth_data.get(i)
        if wd:
            c["warmth_score"] = wd.get("score")
            c["warmth_tier"] = wd.get("tier", "")
            c["warmth_label"] = wd.get("label", "")

    try:
        email_results = batch_generate_emails(
            contacts=filtered,
            resume_text=resume_text,
            user_profile=user_profile,
            career_interests=career_interests,
            pre_parsed_user_info=pre_parsed,
            template_instructions=template_instructions,
            email_template_purpose=config.get("emailTemplatePurpose"),
            signoff_config={
                "signoffPhrase": config.get("signoffPhrase") or "Best,",
                "signatureBlock": config.get("signatureBlock") or "",
            },
            auth_display_name=user_data.get("name") or prof.get("name") or "",
            enrichment_data=enrichment_data,
        )
    except Exception as e:
        logger.exception("Email generation failed for agent uid=%s", uid)
        email_results = {}

    user_email = user_data.get("email", "")

    # Save contacts to Firestore
    contacts_ref = db.collection("users").document(uid).collection("contacts")
    now_iso = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    today = datetime.now().strftime("%m/%d/%Y")
    saved_contacts = []
    # Phase 9 — accumulates AUTO_SEND_CREDIT_COST per contact whose send
    # actually fired. Added to credits_spent at the bottom.
    auto_send_credits = 0

    for idx, contact in enumerate(filtered):
        email = (contact.get("Email") or contact.get("WorkEmail") or contact.get("email") or "").strip()
        first_name = (contact.get("FirstName") or contact.get("firstName") or "").strip()
        last_name = (contact.get("LastName") or contact.get("lastName") or "").strip()
        contact_key = f"{first_name} {last_name}"

        contact_doc = {
            "firstName": first_name,
            "lastName": last_name,
            "email": email,
            "linkedinUrl": (contact.get("LinkedIn") or contact.get("linkedinUrl") or "").strip(),
            "company": (contact.get("Company") or contact.get("company") or "").strip(),
            "jobTitle": (contact.get("Title") or contact.get("jobTitle") or "").strip(),
            "college": (contact.get("College") or contact.get("college") or "").strip(),
            "location": contact.get("location") or "",
            "city": contact.get("City") or "",
            "state": contact.get("State") or "",
            "firstContactDate": today,
            "status": "Not Contacted",
            "lastContactDate": today,
            "userId": uid,
            "createdAt": now_iso,
            "pdlId": contact.get("pdlId") or "",
            "source": "agent",
            "agentCycleId": action.get("cycleId"),
            # Phase 9 — loopId lets the approve-send endpoint verify a
            # contact belongs to the Loop being approved. HM contacts
            # already had this; backfill here for parity.
            "loopId": config.get("loopId", ""),
            "inOutbox": True,
            "draftCreatedAt": now_iso,
            "emailGeneratedAt": now_iso,
            "draftStillExists": True,
            "lastActivityAt": now_iso,
            "hasUnreadReply": False,
        }

        # Add email content if generated
        email_data = email_results.get(idx)
        if email_data:
            contact_doc["emailSubject"] = email_data.get("subject", "")
            contact_doc["emailBody"] = email_data.get("body", "")
            contact_doc["pipelineStage"] = "draft_created"
        else:
            contact_doc["pipelineStage"] = "not_contacted"

        # Add warmth data
        if contact.get("warmth_score") is not None:
            contact_doc["warmthScore"] = contact["warmth_score"]
            contact_doc["warmthTier"] = contact.get("warmth_tier", "")
            contact_doc["warmthLabel"] = contact.get("warmth_label", "")

        # Add enrichment data from Perplexity
        enrich = enrichment_data.get(idx, {})
        if enrich.get("talking_points"):
            contact_doc["enrichmentTalkingPoints"] = enrich["talking_points"][:5]
        if enrich.get("recent_activity"):
            contact_doc["enrichmentRecentActivity"] = enrich["recent_activity"][:1000]
        if enrich.get("citations"):
            contact_doc["enrichmentCitations"] = enrich["citations"][:5]
        if enrich:
            contact_doc["enrichedAt"] = now_iso
        if contact.get("perplexity_media_appearances"):
            contact_doc["perplexityMediaAppearances"] = contact["perplexity_media_appearances"][:5]
        if contact.get("perplexity_published_writing"):
            contact_doc["perplexityPublishedWriting"] = contact["perplexity_published_writing"][:5]
        if contact.get("perplexity_news_mentions"):
            contact_doc["perplexityNewsMentions"] = contact["perplexity_news_mentions"][:5]
        if contact.get("linkedin_recent_posts"):
            contact_doc["linkedinRecentPosts"] = contact["linkedin_recent_posts"][:5]
        if contact.get("company_recent_news"):
            contact_doc["companyRecentNews"] = contact["company_recent_news"][:5]
        if contact.get("company_description"):
            contact_doc["companyDescription"] = contact["company_description"][:1000]

        # Create Gmail draft if possible
        if email_data and email.strip():
            try:
                from app.services.gmail_client import create_gmail_draft_for_user
                draft_result = create_gmail_draft_for_user(
                    contact=contact,
                    email_subject=email_data.get("subject", ""),
                    email_body=email_data.get("body", ""),
                    tier="elite",
                    user_email=user_email,
                    user_id=uid,
                )
                if draft_result and isinstance(draft_result, dict):
                    contact_doc["gmailDraftId"] = draft_result.get("id", "")
                    contact_doc["gmailDraftUrl"] = draft_result.get("url", "")
            except Exception as e:
                logger.warning("Gmail draft creation failed: %s", e)

        # Phase 9 — auto-send gate. No-op unless the Loop is in
        # autoSendMode="send_for_me" and all six gate checks pass. Mutates
        # contact_doc in place to stamp either successful-send fields or
        # autoSendPausedReason. Returns credits to charge (0 or 1).
        auto_send_credits += _try_auto_send(
            uid=uid,
            config=config,
            user_data=user_data,
            contact_doc=contact_doc,
            email=email,
            email_subject=email_data.get("subject", "") if email_data else "",
            email_body=email_data.get("body", "") if email_data else "",
            now_iso=now_iso,
        )

        doc_ref = contacts_ref.add(contact_doc)
        contact_id = doc_ref[1].id if isinstance(doc_ref, tuple) else ""
        saved_contacts.append({
            "id": contact_id,
            "contactId": contact_id,  # explicit field for activity-feed deep links
            "name": contact_key,
            "title": contact_doc.get("Title", ""),
            "company": contact_doc["company"],
            "hasEmail": bool(email_data),
            "emailSubject": email_data.get("subject", "") if email_data else "",
            "emailBodyPreview": (email_data.get("body", "") if email_data else "")[:200],
            "gmailDraftId": contact_doc.get("gmailDraftId", ""),
            "gmailDraftUrl": contact_doc.get("gmailDraftUrl", ""),
        })

    # Per-contact credit cost — see CREDIT_COSTS in loop_budget.py.
    # auto_send_credits is the Phase 9 per-send overhead (+1 per actually
    # sent email; 0 for draft-only and for denied/failed sends).
    credits_spent = len(saved_contacts) * CREDIT_COSTS["contact"] + auto_send_credits
    try:
        deduct_credits_atomic(uid, credits_spent, "agent_find")
    except Exception:
        logger.warning("Credit deduction failed for agent uid=%s", uid)

    return {
        "contactsFound": len(saved_contacts),
        "emailsDrafted": sum(1 for c in saved_contacts if c["hasEmail"]),
        "contacts": saved_contacts,
        "creditsSpent": credits_spent,
    }


# ── FIND_JOBS executor ────────────────────────────────────────────────────


def execute_find_jobs(
    uid: str,
    action: dict,
    config: dict,
    user_data: dict,
) -> dict:
    """Find jobs matching user's target roles + companies.

    Primary: Perplexity + Firecrawl for enriched job data.
    Fallback: SerpAPI google_jobs if Perplexity is unavailable.
    """
    company = action.get("company", "")
    role = action.get("role", "")
    count = min(action.get("count", 5), 10)
    location = config.get("targetLocations", ["United States"])
    location = location[0] if location else "United States"

    db = get_db()
    loop_id = config.get("loopId") or ""

    # Cost-aware cache: postings change faster than companies (3-day TTL).
    # Scoped per loop + company so a different company in the same Loop still
    # hits the API.
    if company and _has_fresh_cached_rows(
        db, uid, "agent_jobs", loop_id, _CACHE_TTL_JOBS, company=company,
    ):
        logger.info(
            "Agent find_jobs: uid=%s loop=%s company=%s cache hit, skipping Perplexity",
            uid, loop_id, company,
        )
        return {"jobsFound": 0, "jobs": [], "creditsSpent": 0, "cacheHit": True}

    query = f"{role} at {company}" if company else role
    if not query:
        query = "internship"

    jobs = []
    source = "serpapi"
    rate_limited = False

    # PRIMARY: Perplexity job search + structured enrichment (Perplexity or Firecrawl per flag)
    try:
        from app.services.perplexity_client import search_jobs_live

        raw_jobs = search_jobs_live(
            query=query, location=location, limit=10,
            domain_filter=["linkedin.com", "greenhouse.io", "lever.co", "workday.com"],
        )

        if raw_jobs:
            use_perplexity_enrich = _perplexity_only(uid)
            if not use_perplexity_enrich:
                from app.services.firecrawl_client import extract_job_posting
            else:
                from app.services.perplexity_client import enrich_job_posting_live

            # Enrich top 5 with structured extraction
            enriched_jobs = []
            for job in raw_jobs[:5]:
                enriched = dict(job)
                try:
                    if use_perplexity_enrich:
                        structured = enrich_job_posting_live(
                            url=job.get("url"),
                            title=job.get("title", ""),
                            company=job.get("company", company),
                            location=job.get("location", location),
                        )
                    elif job.get("url"):
                        structured = extract_job_posting(job["url"])
                    else:
                        structured = {}
                    if structured:
                        enriched.update(structured)
                except Exception:
                    pass
                enriched_jobs.append(enriched)
            # Add remaining un-enriched jobs
            enriched_jobs.extend(raw_jobs[5:count])
            jobs = enriched_jobs
            source = "perplexity"
    except RateLimitError:
        # Surface rate-limit signal so loop_jobs can bump the 3-strike streak.
        # Don't crash the cycle — partial results from other actions still ship.
        rate_limited = True
        logger.warning("Perplexity job search rate-limited for uid=%s", uid)
    except Exception:
        logger.warning("Perplexity job search failed; SerpAPI fallback gated by ENABLE_SERPAPI_FALLBACK", exc_info=True)

    # FALLBACK: SerpAPI (kept until Phase 8 removes it, gated by ENABLE_SERPAPI_FALLBACK)
    if not jobs and os.getenv("ENABLE_SERPAPI_FALLBACK"):
        try:
            from app.routes.job_board import fetch_jobs_from_serpapi
            serpapi_jobs, _ = fetch_jobs_from_serpapi(query, location, num_results=10, user_id=uid)
            jobs = serpapi_jobs or []
            source = "serpapi"
        except Exception as e:
            logger.exception("SerpAPI job search also failed for agent uid=%s", uid)
            return {"jobsFound": 0, "jobs": [], "creditsSpent": 0, "error": str(e)}

    if not jobs:
        result = {"jobsFound": 0, "jobs": [], "creditsSpent": 0}
        if rate_limited:
            result["rateLimited"] = True
        return result

    # Generate match reasons via LLM
    scored_jobs = _generate_job_reasons(jobs[:count], user_data)

    # Visa-aware + profile-aware ranking. The ranker hard-filters obvious
    # mismatches (e.g. F-1 students vs companies that don't sponsor, undergrads
    # vs senior-only roles) and diversifies across companies so the saved set
    # isn't 8 postings at one employer. Falls back to LLM-scored order if the
    # ranker hard-filters every job — better to surface noisy results than
    # zero results.
    try:
        from app.services.student_job_ranker import rank_for_student
        from app.utils.student_profile import build_student_dict
        student = build_student_dict(user_data or {})
        ranked = rank_for_student(student, scored_jobs, top_k=count)
        if ranked:
            scored_jobs = [
                {**job, "_rankerScore": score, "_rankerReasons": reasons}
                for (job, score, reasons) in ranked
            ]
    except Exception:
        logger.warning(
            "student_job_ranker failed for uid=%s loop=%s — falling back to LLM order",
            uid, loop_id, exc_info=True,
        )

    # Save to Firestore (db already loaded for the cache check above)
    jobs_ref = db.collection("users").document(uid).collection("agent_jobs")
    now_iso = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    saved = []

    for job in scored_jobs:
        doc = {
            "cycleId": action.get("cycleId"),
            "loopId": loop_id,
            "title": job.get("title", ""),
            "company": job.get("company_name", job.get("company", company)),
            "location": job.get("location", ""),
            "description": (job.get("description", job.get("summary", "")))[:500],
            "applyLink": job.get("apply_link", "") or job.get("link", "") or job.get("url", ""),
            "matchReasons": job.get("_matchReasons", []),
            "source": source,
            # Enriched fields from Firecrawl (empty if SerpAPI fallback)
            "requirements": job.get("requirements", [])[:10],
            "salaryRange": job.get("salary_range", ""),
            "teamOrDepartment": job.get("team_or_department", ""),
            "hiringManagerName": job.get("hiring_manager", ""),
            "sourceUrl": job.get("url", ""),
            "enrichedAt": now_iso if source == "perplexity" else "",
            "hmFound": False,
            "hmContactId": None,
            "createdAt": now_iso,
            "status": "new",
        }
        ref = jobs_ref.add(doc)
        saved.append({
            "id": ref[1].id,
            "title": doc["title"],
            "company": doc["company"],
            "location": doc["location"],
            "matchReasons": doc["matchReasons"],
        })

    # Per-job credit cost — see CREDIT_COSTS in loop_budget.py.
    credits = len(saved) * CREDIT_COSTS["job"]
    if credits > 0:
        try:
            deduct_credits_atomic(uid, credits, "agent_find_jobs")
        except Exception:
            logger.warning("Credit deduction failed for agent_find_jobs uid=%s", uid)

    logger.info("Agent find_jobs: uid=%s found %d jobs for %s", uid, len(saved), query)
    result = {"jobsFound": len(saved), "jobs": saved, "creditsSpent": credits}
    if rate_limited:
        result["rateLimited"] = True
    return result


# ── DISCOVER_COMPANIES executor ───────────────────────────────────────────


def execute_discover_companies(
    uid: str,
    action: dict,
    config: dict,
    user_data: dict,
) -> dict:
    """Discover companies with live market intelligence.

    Primary: Perplexity discovers + Firecrawl enriches.
    Fallback: static recommendation engine.
    """
    db = get_db()
    loop_id = config.get("loopId") or ""

    # Cost-aware cache: roles cycles run discover_companies frequently — skip
    # the Perplexity + Firecrawl spend if we already have fresh rows for this
    # Loop. People-mode Loops also benefit; the cache key is loopId only.
    if _has_fresh_cached_rows(db, uid, "agent_companies", loop_id, _CACHE_TTL_COMPANIES):
        logger.info(
            "Agent discover_companies: uid=%s loop=%s cache hit, skipping Perplexity",
            uid, loop_id,
        )
        return {"companiesDiscovered": 0, "companies": [], "creditsSpent": 0, "cacheHit": True}

    companies = []
    rate_limited = False

    # PRIMARY: Perplexity-powered discovery (enrich via Perplexity or Firecrawl per flag)
    try:
        from app.services.perplexity_client import discover_companies_live

        prof = user_data.get("professionalInfo") or {}
        perplexity_companies = discover_companies_live(
            industries=config.get("targetIndustries", []),
            locations=config.get("targetLocations", []),
            roles=config.get("targetRoles", []),
            similar_to=config.get("targetCompanies", []),
            university=prof.get("university", ""),
            career_track=prof.get("careerTrack", ""),
        )

        use_perplexity_enrich = _perplexity_only(uid)
        if not use_perplexity_enrich:
            from app.services.firecrawl_client import extract_company_profile
        else:
            from app.services.perplexity_client import enrich_company_profile_live

        # Enrich top 5 with structured extraction
        for co in perplexity_companies[:5]:
            try:
                if use_perplexity_enrich:
                    profile = enrich_company_profile_live(
                        name=co.get("name", ""),
                        website=co.get("website"),
                    )
                else:
                    website = co.get("website")
                    profile = extract_company_profile(website) if website else {}
                if profile:
                    co.update(profile)
            except Exception:
                pass

        if perplexity_companies:
            companies = perplexity_companies
    except RateLimitError:
        rate_limited = True
        logger.warning("Perplexity company discovery rate-limited for uid=%s", uid)
    except Exception:
        logger.warning("Perplexity company discovery failed, falling back to recommendations", exc_info=True)

    # FALLBACK: static recommendation engine
    if not companies:
        try:
            from app.services.company_recommendations import get_recommendations
            result = get_recommendations(user_data)
            companies = result.get("companies", [])
        except Exception as e:
            logger.exception("Company recommendations also failed for agent uid=%s", uid)
            return {"companiesDiscovered": 0, "companies": [], "creditsSpent": 0, "error": str(e)}

    # Filter out companies user already targets
    target_set = {c.lower() for c in config.get("targetCompanies", [])}
    new_companies = [c for c in companies if c.get("name", "").lower() not in target_set]

    cos_ref = db.collection("users").document(uid).collection("agent_companies")
    now_iso = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    saved = []

    for co in new_companies[:5]:
        domain = _company_to_domain(co.get("name", ""))
        logo_url = f"https://logo.clearbit.com/{domain}" if domain else None

        # Extract industry — field is "sector" in recommendation engine
        industry = co.get("industry") or co.get("sector", "")

        # Extract reason — scout sentence is nested: scout.short or scout.headline
        scout = co.get("scout") or {}
        if isinstance(scout, dict):
            reason = scout.get("short") or scout.get("headline") or scout.get("detail") or ""
        else:
            reason = co.get("scout_sentence", co.get("reason", ""))

        doc = {
            "cycleId": action.get("cycleId"),
            "loopId": loop_id,
            "name": co.get("name", ""),
            "industry": industry,
            "reason": reason,
            "sourceCompany": action.get("sourceCompany", ""),
            "score": co.get("score", 0) if isinstance(co.get("score"), (int, float)) else 0,
            "logoUrl": logo_url,
            "jobsFound": 0,
            "createdAt": now_iso,
            "status": "new",
            # Enriched fields from Perplexity/Firecrawl
            "hiringSignal": co.get("hiring_signal", ""),
            "recentNews": co.get("recent_news", ""),
            "website": co.get("website", "") or co.get("careers_url", ""),
            "description": (co.get("description", ""))[:500],
            "cultureKeywords": co.get("culture_keywords", [])[:5],
        }
        ref = cos_ref.add(doc)
        saved.append({
            "id": ref[1].id,
            "name": doc["name"],
            "industry": doc["industry"],
            "reason": doc["reason"],
            "logoUrl": doc["logoUrl"],
        })

    # Per-company credit cost — see CREDIT_COSTS in loop_budget.py.
    credits = len(saved) * CREDIT_COSTS["company"]
    if credits > 0:
        try:
            deduct_credits_atomic(uid, credits, "agent_discover_companies")
        except Exception:
            logger.warning("Credit deduction failed for agent_discover_companies uid=%s", uid)

    logger.info("Agent discover_companies: uid=%s found %d companies", uid, len(saved))
    result = {"companiesDiscovered": len(saved), "companies": saved, "creditsSpent": credits}
    if rate_limited:
        result["rateLimited"] = True
    return result


# ── FIND_HIRING_MANAGERS executor ─────────────────────────────────────────


def execute_find_hiring_managers(
    uid: str,
    action: dict,
    config: dict,
    user_data: dict,
) -> dict:
    """Find hiring managers for a specific job and draft personalized emails."""
    from app.services.recruiter_finder import find_hiring_manager

    job_title = action.get("jobTitle", "")
    company = action.get("company", "")
    location = action.get("location", "")
    max_count = min(action.get("count", 2), 3)
    loop_mode = config.get("loopMode") or "people"

    # Provenance — which goal surfaced this HM. Used for two things:
    #   (1) Template selection: role_search → roles-mode founder voice;
    #       networking → people voice.
    #   (2) Tagged on the saved contact doc so downstream surfaces (alerts,
    #       My Network filters) can show the user WHY this person showed up.
    discovered_via = _resolve_hm_provenance(loop_mode, action)

    db = get_db()
    loop_id = config.get("loopId") or ""

    # Cost-aware cache: once a Loop has identified a founder/HM at a small
    # company, we don't re-identify for a month. 30-day TTL per the plan.
    if company and _has_fresh_cached_rows(
        db, uid, "contacts", loop_id, _CACHE_TTL_HMS, company=company,
    ):
        logger.info(
            "Agent find_hiring_managers: uid=%s loop=%s company=%s cache hit, skipping recruiter_finder",
            uid, loop_id, company,
        )
        return {"hmsFound": 0, "contacts": [], "creditsSpent": 0, "cacheHit": True}

    template_instructions = _resolve_agent_template(config, user_data, db, uid)

    # If this HM was surfaced by the roles pipeline, prepend the posting-
    # specific founder outreach instructions so the draft references the
    # actual role. We concatenate rather than replace — any user-configured
    # style preset still applies (voice rules, signoff, banned-phrase
    # coverage). Empty user template is fine. The provenance check below
    # collapses to today's behavior for pure people / pure roles modes
    # (where discovered_via is fully determined by loop_mode) and to per-
    # action template selection for "both" mode.
    if discovered_via == "role_search":
        roles_block = roles_mode_template_instructions(role_title=job_title, company=company)
        template_instructions = (
            f"{roles_block}\n\n{template_instructions}"
            if (template_instructions or "").strip()
            else roles_block
        )

    try:
        result = find_hiring_manager(
            company_name=company,
            job_title=job_title,
            job_description=action.get("jobDescription", ""),
            location=location,
            max_results=max_count,
            generate_emails=True,
            user_resume=user_data.get("resumeParsed"),
            resume_text=user_data.get("resumeText", ""),
            template_instructions=template_instructions,
            role_type="hiring_manager",
        )
    except Exception as e:
        logger.exception("find_hiring_manager failed for agent uid=%s", uid)
        return {"hmsFound": 0, "contacts": [], "creditsSpent": 0, "error": str(e)}

    hms = result.get("hiringManagers", result.get("hiring_managers", []))
    emails_list = result.get("emails", [])

    # Verify HMs are still active via Perplexity
    try:
        from app.services.perplexity_client import verify_hiring_managers
        verifications = verify_hiring_managers(hms, company, job_title)
        # Filter out HMs who have left the company
        active_hms = []
        active_emails = []
        for i, (hm, v) in enumerate(zip(hms, verifications)):
            if v.get("verified", True):
                active_hms.append(hm)
                if i < len(emails_list):
                    active_emails.append(emails_list[i])
        if active_hms:
            hms = active_hms
            emails_list = active_emails
            logger.info("HM verification: %d/%d verified active at %s",
                        len(active_hms), len(verifications), company)
    except Exception:
        logger.warning("HM verification failed, using all candidates", exc_info=True)

    contacts_ref = db.collection("users").document(uid).collection("contacts")
    now_iso = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    today = datetime.now().strftime("%m/%d/%Y")
    user_email = user_data.get("email", "")
    saved = []
    # Phase 9 — see execute_find_and_draft for rationale.
    auto_send_credits = 0

    for idx, hm in enumerate(hms):
        # Get email data from the emails list if available
        email_data = emails_list[idx] if idx < len(emails_list) else {}
        email_body = email_data.get("body", hm.get("email_body", ""))
        email_subject = email_data.get("subject", hm.get("email_subject", ""))
        hm_email = (hm.get("Email") or hm.get("email") or hm.get("WorkEmail") or "").strip()
        first_name = (hm.get("FirstName") or hm.get("firstName") or hm.get("first_name") or "").strip()
        last_name = (hm.get("LastName") or hm.get("lastName") or hm.get("last_name") or "").strip()

        contact_doc = {
            "firstName": first_name,
            "lastName": last_name,
            "email": hm_email,
            "company": company,
            "jobTitle": (hm.get("Title") or hm.get("title") or hm.get("jobTitle") or "").strip(),
            "source": "agent",
            "agentCycleId": action.get("cycleId"),
            # Why this HM surfaced. "role_search" = pulled in by find_jobs at
            # a small/founder-led company (founder-voice draft). "networking"
            # = pulled in to support the networking goal (people-voice
            # draft). Foundation: people-mode HMs default to "networking",
            # roles-mode HMs default to "role_search", both-mode HMs read
            # the planner-supplied tag with "networking" fallback.
            "discoveredVia": discovered_via,
            # Foreign key into the find_jobs activity item this HM was paired
            # with — only set for role_search HMs. The activity feed groups
            # by this key so the founder-draft sub-card renders inline below
            # its source posting. Networking-mode HMs leave it empty so they
            # render as standalone rows (today's people-mode behavior).
            "sourceJobId": action.get("sourceJobId", "") if discovered_via == "role_search" else "",
            "loopId": loop_id,
            "pipelineStage": "draft_created" if email_body else "not_contacted",
            "emailSubject": email_subject,
            "emailBody": email_body,
            "inOutbox": True,
            "createdAt": now_iso,
            "firstContactDate": today,
            "lastContactDate": today,
            "status": "Not Contacted",
            "isHiringManager": True,
            "userId": uid,
            "emailGeneratedAt": now_iso,
            "draftCreatedAt": now_iso,
            "draftStillExists": True,
            "lastActivityAt": now_iso,
            "hasUnreadReply": False,
            "linkedinUrl": (hm.get("LinkedIn") or hm.get("linkedinUrl") or "").strip(),
        }

        # Create Gmail draft
        if email_body and hm_email:
            try:
                from app.services.gmail_client import create_gmail_draft_for_user
                draft = create_gmail_draft_for_user(
                    contact=hm,
                    email_subject=email_subject,
                    email_body=email_body,
                    tier="elite",
                    user_email=user_email,
                    user_id=uid,
                )
                if draft and isinstance(draft, dict):
                    contact_doc["gmailDraftId"] = draft.get("id", "")
                    contact_doc["gmailDraftUrl"] = draft.get("url", "")
            except Exception as e:
                logger.warning("Gmail draft creation for HM failed: %s", e)

        # Phase 9 — auto-send gate. Same pattern as execute_find_and_draft.
        auto_send_credits += _try_auto_send(
            uid=uid,
            config=config,
            user_data=user_data,
            contact_doc=contact_doc,
            email=hm_email,
            email_subject=email_subject,
            email_body=email_body,
            now_iso=now_iso,
        )

        ref = contacts_ref.add(contact_doc)
        contact_id = ref[1].id
        saved.append({
            "id": contact_id,
            "contactId": contact_id,  # explicit field for activity-feed deep links
            "name": f"{first_name} {last_name}",
            "title": contact_doc.get("Title", ""),
            "company": company,
            "hasEmail": bool(email_body),
            "emailSubject": email_subject,
            "emailBodyPreview": email_body[:200] if email_body else "",
            "isHiringManager": True,
            "gmailDraftId": contact_doc.get("gmailDraftId", ""),
            "gmailDraftUrl": contact_doc.get("gmailDraftUrl", ""),
        })

    # Per-HM credit cost — see CREDIT_COSTS in loop_budget.py.
    # auto_send_credits is the Phase 9 per-send overhead (+1 per actually
    # sent HM email; 0 for draft-only and for denied/failed sends).
    credits = len(saved) * CREDIT_COSTS["hiring_manager"] + auto_send_credits
    if credits > 0:
        try:
            deduct_credits_atomic(uid, credits, "agent_find_hm")
        except Exception:
            logger.warning("HM credit deduction failed for agent uid=%s", uid)

    logger.info("Agent find_hiring_managers: uid=%s found %d HMs at %s", uid, len(saved), company)
    return {"hmsFound": len(saved), "contacts": saved, "creditsSpent": credits}


# ── FOLLOW_UP executor ────────────────────────────────────────────────────


def execute_follow_up(
    uid: str,
    action: dict,
    config: dict,
    user_data: dict,
) -> dict:
    """Generate follow-up nudges for stale outreach."""
    from app.services.nudge_service import _generate_nudge_text

    db = get_db()
    contact_ids = action.get("contact_ids", [])
    if not contact_ids:
        return {"followUpsSent": 0, "contacts": [], "creditsSpent": 0}

    contacts_ref = db.collection("users").document(uid).collection("contacts")
    now_iso = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    sent = []

    for cid in contact_ids[:5]:  # max 5 follow-ups per cycle
        try:
            doc = contacts_ref.document(cid).get()
            if not doc.exists:
                continue
            contact = doc.to_dict()

            # Get recent company news for follow-up hook
            news_hook = ""
            company = contact.get("company", "")
            if company:
                try:
                    from app.services.perplexity_client import get_company_news_brief
                    news = get_company_news_brief(company, timeframe="week")
                    if news:
                        news_hook = news[0]
                except Exception:
                    pass

            nudge = _generate_nudge_text(contact, user_data, news_hook=news_hook)
            if not nudge:
                continue

            # Update contact with nudge
            update_fields = {
                "lastNudgeAt": now_iso,
                "nudgeSuggestion": nudge.get("suggestion", ""),
                "followUpDraft": nudge.get("followUpDraft", ""),
                "lastActivityAt": now_iso,
            }
            if news_hook:
                update_fields["followUpNewsHook"] = news_hook
            contacts_ref.document(cid).update(update_fields)
            sent.append({
                "id": cid,
                "name": f"{contact.get('firstName', '')} {contact.get('lastName', '')}".strip(),
                "company": contact.get("company", ""),
            })
        except Exception as e:
            logger.warning("Follow-up failed for contact %s: %s", cid, e)

    logger.info("Agent follow_up: uid=%s sent %d nudges", uid, len(sent))
    return {"followUpsSent": len(sent), "contacts": sent, "creditsSpent": 0}


# ── Helper: generate job match reasons ────────────────────────────────────


def _generate_job_reasons(jobs: list, user_data: dict) -> list:
    """LLM generates 'why this job?' reasons for each job.
    Falls back to empty reasons on LLM failure (non-blocking).
    """
    if not jobs:
        return jobs

    from app.config import CLAUDE_API_KEY
    if not CLAUDE_API_KEY:
        # Return jobs without reasons
        for j in jobs:
            j["_matchReasons"] = []
        return jobs

    prof = user_data.get("professionalInfo") or {}
    resume_text = user_data.get("resumeText") or ""
    interests = user_data.get("careerInterests") or []

    # Build a compact user profile for the prompt
    user_summary = f"""Student at {prof.get('university', 'unknown')} studying {prof.get('major', 'unknown')}.
Career track: {prof.get('careerTrack', 'unknown')}.
Interests: {', '.join(interests) if interests else 'not specified'}.
Resume highlights: {resume_text[:300] if resume_text else 'not available'}"""

    jobs_text = "\n".join(
        f"{i+1}. {j.get('title', '')} at {j.get('company_name', '')} in {j.get('location', '')}. "
        f"Description: {(j.get('description', ''))[:150]}"
        for i, j in enumerate(jobs)
    )

    prompt = f"""Given this student profile and job listings, generate 1-2 brief reasons (each under 15 words) why each job is a good match.

## Student
{user_summary}

## Jobs
{jobs_text}

Return a JSON array where each element is an array of reason strings, one per job. Example:
[["Matches your React skills", "Located in target city"], ["Alumni network at this company"]]

Return ONLY the JSON array."""

    try:
        import anthropic
        client = anthropic.Anthropic(api_key=CLAUDE_API_KEY)
        message = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=1024,
            messages=[{"role": "user", "content": prompt}],
        )
        raw = message.content[0].text.strip()
        if raw.startswith("```"):
            lines = raw.split("\n")
            lines = [l for l in lines if not l.strip().startswith("```")]
            raw = "\n".join(lines)

        reasons_list = json.loads(raw)
        if isinstance(reasons_list, list):
            for i, job in enumerate(jobs):
                if i < len(reasons_list) and isinstance(reasons_list[i], list):
                    job["_matchReasons"] = reasons_list[i]
                else:
                    job["_matchReasons"] = []
        else:
            for j in jobs:
                j["_matchReasons"] = []
    except Exception:
        logger.warning("Job reason generation failed, continuing without reasons")
        for j in jobs:
            j["_matchReasons"] = []

    return jobs


# ── Shared helpers ────────────────────────────────────────────────────────


def _build_exclusion_sets(uid: str, db) -> dict:
    """Build dedup sets from existing contacts."""
    identity_set = set()
    email_set = set()
    name_company_set = set()

    contacts_ref = db.collection("users").document(uid).collection("contacts")
    for doc in contacts_ref.select(
        ["firstName", "lastName", "email", "linkedinUrl", "company"]
    ).stream():
        cd = doc.to_dict() or {}
        first = (cd.get("firstName") or "").strip()
        last = (cd.get("lastName") or "").strip()
        company = (cd.get("company") or "").strip()
        email = (cd.get("email") or "").strip().lower()

        standardized = {
            "FirstName": first,
            "LastName": last,
            "Email": email,
            "Company": company,
        }
        identity_set.add(get_contact_identity(standardized))
        if email:
            email_set.add(email)
        fn = first.lower()
        ln = last.lower()
        co = company.lower()
        if fn and ln and co:
            name_company_set.add(f"{fn}_{ln}_{co}")

    return {
        "identity_set": identity_set,
        "email_set": email_set,
        "name_company_set": name_company_set,
    }


def _build_user_profile(user_data: dict) -> dict:
    """Build user profile dict for PDL/email gen."""
    prof = user_data.get("professionalInfo") or {}
    return {
        "name": user_data.get("name") or prof.get("name") or "",
        "university": prof.get("university") or "",
        "major": prof.get("major") or "",
        "graduationYear": prof.get("graduationYear") or "",
        "careerTrack": prof.get("careerTrack") or "",
        "careerInterests": user_data.get("careerInterests") or [],
    }


def _resolve_agent_template(config: dict, user_data: dict, db, uid: str) -> str:
    """Resolve email template instructions from agent config or user defaults."""
    purpose = config.get("emailTemplatePurpose")
    style_preset = config.get("emailStylePreset")
    custom_instructions = config.get("customInstructions") or ""

    # Fall back to user's saved template
    if not purpose:
        t = (user_data.get("emailTemplate") or {})
        purpose = t.get("purpose")
        style_preset = style_preset or t.get("stylePreset")
        custom_instructions = custom_instructions or (t.get("customInstructions") or "")

    return get_template_instructions(
        purpose=purpose,
        style_preset=style_preset,
        custom_instructions=custom_instructions,
    )
