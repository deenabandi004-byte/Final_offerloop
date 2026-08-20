"""
Crustdata TEST rung (2026-08-19, Rylan: "use another 30 to 35 trial credits
while we're testing on the phone").

Wired as an optional PRIMARY source for the mobile people-search, with
enrichment deferred to the reveal step, because that is both our product's
shape and the cheap way to spend a trial: per the eval handoff
(CRUSTDATA-EVAL-HANDOFF.md), a search costs 0.03 credits per RESULT (empty
and errored calls are free) while a contact enrich costs 2.0 (1.0 when the
person has no email). Surfacing twenty faces costs 0.6 credits; only a
right swipe spends real money.

Hard rules carried over from the eval:
  - `fields` is the enrich param. `include` is accepted, ignored, and
    CHARGED. Never send it.
  - The deliverability LABEL is the product. Only an email Crustdata labels
    deliverable counts as an address here; anything else is treated as
    no-email (their "unknown" emails were mostly junk).
  - Persist/log every raw response before truncating.
  - Budget ceiling, tracked in Firestore, checked before every paid call.

Entirely env-gated: no CRUSTDATA_API_KEY, no behavior change anywhere. The
key lives in Render's env only (never in this repo).
"""
import json
import logging
import os
from typing import Any, Dict, List, Optional

import requests

logger = logging.getLogger(__name__)

BASE = os.getenv("CRUSTDATA_BASE", "https://api.crustdata.com").rstrip("/")
SEARCH_PATH = os.getenv("CRUSTDATA_SEARCH_PATH", "/screener/person/search")
ENRICH_PATH = os.getenv("CRUSTDATA_ENRICH_PATH", "/screener/person/enrich")
CREDITS_PATH = os.getenv("CRUSTDATA_CREDITS_PATH", "/account/credits")

#: Trial spend ceiling for this test, in Crustdata credits. Estimated
#: client-side (0.03/search result, 2.0/enrich) and stored globally in
#: Firestore so multiple workers share one budget.
BUDGET = float(os.getenv("CRUSTDATA_TEST_BUDGET", "35"))

_BUDGET_DOC = ("meta", "crustdataTestBudget")


def _key() -> str:
    return (os.getenv("CRUSTDATA_API_KEY") or "").strip()


def _headers() -> Dict[str, str]:
    return {
        "Authorization": f"Token {_key()}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }


def _budget_ref(db):
    return db.collection(_BUDGET_DOC[0]).document(_BUDGET_DOC[1])


def _spent(db) -> float:
    try:
        snap = _budget_ref(db).get()
        return float((snap.to_dict() or {}).get("spent_estimate", 0.0)) if snap.exists else 0.0
    except Exception:
        # Unreadable budget counts as exhausted: never overspend a trial
        # because Firestore blinked.
        logger.exception("crustdata: budget read failed; treating as exhausted")
        return BUDGET


def _add_spend(db, amount: float, kind: str) -> None:
    try:
        from google.cloud import firestore as _fs
        _budget_ref(db).set(
            {
                "spent_estimate": _fs.Increment(amount),
                f"{kind}_count": _fs.Increment(1),
            },
            merge=True,
        )
    except Exception:
        logger.exception("crustdata: budget write failed (spend %.2f untracked)", amount)


def enabled(db) -> bool:
    """Key present AND trial budget remaining."""
    if not _key():
        return False
    spent = _spent(db)
    if spent >= BUDGET:
        logger.warning("crustdata: test budget exhausted (%.2f of %.2f)", spent, BUDGET)
        return False
    return True


def log_balance() -> None:
    """The credits endpoint is free; log the real balance for the record."""
    try:
        r = requests.get(f"{BASE}{CREDITS_PATH}", headers=_headers(), timeout=10)
        logger.info("crustdata: credits endpoint %s -> %s %s", CREDITS_PATH, r.status_code, r.text[:300])
    except Exception as exc:
        logger.warning("crustdata: credits check failed: %s", exc)


def _first(*vals):
    for v in vals:
        if v:
            return v
    return ""


def _map_profile(p: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Map one search profile to the app-contact shape.

    Calibrated 2026-08-19 against a live sample record from Render logs. The
    profile's current job lives in `employer` (a list of positions), matched
    to `default_position_company_linkedin_id` when possible; the person-level
    title is `default_position_title`. `headline` is the user-written
    LinkedIn tagline, kept only as a last resort because it reads like a
    slogan, not a job title. The old-guess keys stay as fallbacks in case
    other plans or endpoints shape records differently.
    """
    if not isinstance(p, dict):
        return None
    name = _first(p.get("name"), p.get("full_name"))
    first = _first(p.get("first_name"), (name.split(" ", 1)[0] if name else ""))
    last = _first(p.get("last_name"), (name.split(" ", 1)[1] if name and " " in name else ""))
    # The urn-style linkedin_profile_url is what enrich matches on; the
    # flagship URL is the human-readable one the card's button should open.
    urn_url = _first(
        p.get("linkedin_profile_url"), p.get("linkedin_url"), p.get("linkedin"),
        (p.get("linkedin_profile") or {}).get("url") if isinstance(p.get("linkedin_profile"), dict) else "",
    )
    linkedin = _first(p.get("flagship_profile_url"), urn_url)

    employers = p.get("employer") if isinstance(p.get("employer"), list) else []
    employers = [e for e in employers if isinstance(e, dict)]
    default_cid = str(p.get("default_position_company_linkedin_id") or "")
    current_emp: Dict[str, Any] = {}
    if default_cid:
        for e in employers:
            if str(e.get("company_linkedin_id") or "") == default_cid:
                current_emp = e
                break
    if not current_emp and employers:
        current_emp = employers[0]

    title = _first(
        p.get("default_position_title"),
        current_emp.get("title"),
        p.get("current_title"), p.get("title"), p.get("headline"),
    )
    company = _first(
        current_emp.get("company_name"),
        p.get("current_company"), p.get("company"),
        (p.get("current_employers") or [{}])[0].get("employer_name")
        if isinstance(p.get("current_employers"), list) and p.get("current_employers") else "",
    )
    if not (first or last) or not (title or company):
        return None
    location = _first(p.get("location"), p.get("region"))
    city, state = "", ""
    if location and "," in location:
        bits = [b.strip() for b in location.split(",")]
        city, state = bits[0], bits[1] if len(bits) > 1 else ""
    elif location:
        city = location

    education = p.get("education_background")
    if not isinstance(education, list):
        education = p.get("education") if isinstance(p.get("education"), list) else []
    education = [e for e in education if isinstance(e, dict)]
    schools = p.get("all_schools") if isinstance(p.get("all_schools"), list) else []
    college = _first(
        education[0].get("institute_name") if education else "",
        education[0].get("school") if education else "",
        schools[0] if schools and isinstance(schools[0], str) else "",
    )

    return {
        "FirstName": first,
        "LastName": last,
        "LinkedIn": linkedin,
        "LinkedInUrn": urn_url,
        "Email": "",
        "Title": title,
        "Company": company,
        "City": city,
        "State": state,
        "College": college,
        # snake_case on purpose: the app's candidate mapper already reads
        # photo_url, so the photo flows with no app change and no OTA.
        "PhotoUrl": _first(p.get("profile_picture_url"), p.get("profile_picture_permalink")),
        "CompanyLogoUrl": current_emp.get("company_logo_url") or "",
        "EmailSource": "crustdata_pending",
        "EmailVerified": False,
        "EmailConfidenceScore": 0,
        "_provider": "crustdata",
    }


def search_from_parsed(parsed: Dict[str, Any], limit: int, db) -> List[Dict[str, Any]]:
    """One person search from our parsed prompt. Never raises; empty on any
    failure (errored requests are free, per the eval)."""
    if not enabled(db):
        return []
    filters: List[Dict[str, Any]] = []
    titles = [t for t in (parsed.get("title_variations") or []) if t][:8]
    companies = [
        (c.get("name") if isinstance(c, dict) else c)
        for c in (parsed.get("companies") or [])
    ]
    companies = [c for c in companies if c][:5]
    locations = [l for l in (parsed.get("locations") or []) if l][:4]
    if titles:
        filters.append({"filter_type": "CURRENT_TITLE", "type": "in", "value": titles})
    if companies:
        filters.append({"filter_type": "CURRENT_COMPANY", "type": "in", "value": companies})
    if locations:
        filters.append({"filter_type": "REGION", "type": "in", "value": locations})
    if not filters:
        return []
    try:
        r = requests.post(
            f"{BASE}{SEARCH_PATH}",
            headers=_headers(),
            json={"filters": filters, "page": 1},
            timeout=25,
        )
        # Log the raw body BEFORE any truncation decisions (eval gotcha #2).
        logger.info("crustdata search %s -> %s %s", filters, r.status_code, r.text[:2000])
        if r.status_code != 200:
            # 400s are free and list every legal field; the log above is the
            # calibration tool.
            return []
        data = r.json()
        rows = data.get("profiles") or data.get("data") or data.get("results") or []
        if rows and isinstance(rows, list):
            logger.info("crustdata sample record: %s", json.dumps(rows[0])[:2000])
        mapped = [m for m in (_map_profile(p) for p in rows[: limit * 2]) if m]
        mapped = mapped[:limit]
        # 0.03 credits per RESULT RETURNED (not per mapped row).
        _add_spend(db, 0.03 * len(rows), "search")
        return mapped
    except Exception:
        logger.exception("crustdata: search failed")
        return []


def _labeled_email_candidates(blob: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Every address in an enrich response, each as {email, label}.

    Collects from the field names this endpoint actually offers
    (business_email, personal_contact_info.*) plus the older guesses, and
    tolerates strings, dicts, and lists of either. A bare string has no
    label; the caller decides what an unlabeled address is worth.
    """
    found: List[Dict[str, Any]] = []

    def _collect(v, default_label=""):
        if isinstance(v, str) and "@" in v:
            found.append({"email": v, "label": default_label})
        elif isinstance(v, dict):
            addr = _first(v.get("email"), v.get("address"), v.get("value"))
            label = str(_first(v.get("deliverability"), v.get("status"), v.get("label"))).lower()
            if addr:
                found.append({"email": addr, "label": label or default_label})
        elif isinstance(v, list):
            for item in v:
                _collect(item, default_label)

    contact = blob.get("contact") if isinstance(blob.get("contact"), dict) else {}
    for source in (blob, contact):
        if not isinstance(source, dict):
            continue
        _collect(source.get("business_email"))
        _collect(source.get("emails"))
        _collect(source.get("business_emails"))
        _collect(source.get("email"))
    pci = blob.get("personal_contact_info")
    if isinstance(pci, dict):
        for v in pci.values():
            _collect(v)
    elif pci is not None:
        _collect(pci)
    return found


def _hunter_says_deliverable(addr: str) -> bool:
    """One Hunter email-verifier check, the same SMTP-grade handshake the
    eval used as ground truth. Only 'deliverable' passes; 'risky' is usually
    an accept-all domain and unprovable without sending. Never raises."""
    key = (os.getenv("HUNTER_API_KEY") or "").strip()
    if not key or not addr:
        return False
    try:
        r = requests.get(
            "https://api.hunter.io/v2/email-verifier",
            params={"email": addr, "api_key": key},
            timeout=15,
        )
        status = ((r.json().get("data") or {}).get("status") or "") if r.status_code == 200 else ""
        logger.info("crustdata enrich hunter-verify %s -> %s %s", addr, r.status_code, status)
        return status == "deliverable"
    except Exception:
        logger.exception("crustdata: hunter verify failed")
        return False


def enrich_deliverable_email(linkedin_url: str, db) -> Optional[Dict[str, Any]]:
    """Contact enrich for one person; returns {email, verified: True} only
    for an address we can stand behind. Two ways in:

      1. Crustdata labels it deliverable (their labels passed independent
         SMTP verification 9 of 11 times in the eval).
      2. The address arrives unlabeled and NeverBounce confirms it valid
         (their unlabeled emails bounced in the eval, so an unlabeled
         address is worth nothing until an SMTP check says otherwise).

    Anything else is None: a bounce costs more trust than a miss. Never
    raises."""
    if not linkedin_url or not enabled(db):
        return None
    try:
        r = requests.get(
            f"{BASE}{ENRICH_PATH}",
            headers=_headers(),
            params={
                "linkedin_profile_url": linkedin_url,
                # `fields`, never `include` (eval gotcha #1: include is
                # accepted, ignored, and charged). Field names are from this
                # endpoint's own 400 listing (2026-08-19): the eval-era names
                # basic_profile/contact are invalid here and 400 on every
                # call, which is what "no one ever has an email" looks like.
                "fields": "business_email,personal_contact_info",
            },
            timeout=25,
        )
        logger.info("crustdata enrich %s -> %s %s", linkedin_url, r.status_code, r.text[:2000])
        if r.status_code != 200:
            # Errored requests are free (eval, section 2d). Counting them
            # used to eat 2.0 of the trial budget per failed call.
            return None
        # 2.0 credits with contact data, 1.0 matched-no-email; estimate the
        # worst case so the guard errs toward stopping early.
        _add_spend(db, 2.0, "enrich")
        data = r.json()
        blob = data[0] if isinstance(data, list) and data else data
        if not isinstance(blob, dict):
            return None

        candidates = _labeled_email_candidates(blob)
        unlabeled: List[str] = []
        for e in candidates:
            addr = (e["email"] or "").strip().lower()
            label = e["label"]
            if not addr:
                continue
            if "deliverable" in label and "un" not in label:
                return {"email": addr, "verified": True, "label": label}
            if not label:
                unlabeled.append(addr)

        # No label from Crustdata: let SMTP be the judge, same ground truth
        # the eval used. NeverBounce first when configured; otherwise Hunter's
        # email-verifier (the eval's own instrument; its key is already on the
        # service for the search rung). Both only ever run on a paid reveal.
        from app.services.neverbounce_client import RESULT_VALID, is_configured, verify_email
        for addr in unlabeled[:3]:
            if is_configured():
                verdict = verify_email(addr)
                logger.info("crustdata enrich neverbounce %s -> %s", addr, verdict.get("result"))
                if verdict.get("result") == RESULT_VALID:
                    return {"email": addr, "verified": True, "label": "neverbounce_valid"}
            elif _hunter_says_deliverable(addr):
                return {"email": addr, "verified": True, "label": "hunter_deliverable"}
        return None
    except Exception:
        logger.exception("crustdata: enrich failed")
        return None
