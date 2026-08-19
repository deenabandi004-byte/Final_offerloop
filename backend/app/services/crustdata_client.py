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
    """Best-effort map of one search profile to the app-contact shape.

    Field names are defensive (the eval scripts are gone with their session):
    every read tolerates absence, and the caller logs one full raw record per
    search so the mapping can be calibrated from Render logs.
    """
    if not isinstance(p, dict):
        return None
    name = _first(p.get("name"), p.get("full_name"))
    first = _first(p.get("first_name"), (name.split(" ", 1)[0] if name else ""))
    last = _first(p.get("last_name"), (name.split(" ", 1)[1] if name and " " in name else ""))
    linkedin = _first(
        p.get("linkedin_profile_url"), p.get("linkedin_url"), p.get("linkedin"),
        (p.get("linkedin_profile") or {}).get("url") if isinstance(p.get("linkedin_profile"), dict) else "",
    )
    title = _first(p.get("current_title"), p.get("title"), p.get("headline"))
    company = _first(
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
    return {
        "FirstName": first,
        "LastName": last,
        "LinkedIn": linkedin,
        "Email": "",
        "Title": title,
        "Company": company,
        "City": city,
        "State": state,
        "College": _first(
            (p.get("education") or [{}])[0].get("school")
            if isinstance(p.get("education"), list) and p.get("education") else "",
        ),
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


def enrich_deliverable_email(linkedin_url: str, db) -> Optional[Dict[str, Any]]:
    """Contact enrich for one person; returns {email, verified: True} ONLY
    when Crustdata labels the address deliverable. Anything else is None:
    their unlabeled emails bounced in the eval, and a bounce costs more
    trust than a miss. Never raises."""
    if not linkedin_url or not enabled(db):
        return None
    try:
        r = requests.get(
            f"{BASE}{ENRICH_PATH}",
            headers=_headers(),
            params={
                "linkedin_profile_url": linkedin_url,
                # `fields`, never `include` (eval gotcha #1: include is
                # accepted, ignored, and charged).
                "fields": "basic_profile,contact",
            },
            timeout=25,
        )
        logger.info("crustdata enrich %s -> %s %s", linkedin_url, r.status_code, r.text[:2000])
        # 2.0 credits with contact data, 1.0 matched-no-email; estimate the
        # worst case so the guard errs toward stopping early.
        _add_spend(db, 2.0, "enrich")
        if r.status_code != 200:
            return None
        data = r.json()
        blob = data[0] if isinstance(data, list) and data else data
        if not isinstance(blob, dict):
            return None
        contact = blob.get("contact") or blob
        emails = contact.get("emails") or contact.get("business_emails") or []
        if isinstance(emails, dict):
            emails = [emails]
        for e in emails:
            if not isinstance(e, dict):
                continue
            addr = _first(e.get("email"), e.get("address"))
            label = str(_first(e.get("deliverability"), e.get("status"), e.get("label"))).lower()
            if addr and "deliverable" in label and "un" not in label:
                return {"email": addr.strip().lower(), "verified": True, "label": label}
        return None
    except Exception:
        logger.exception("crustdata: enrich failed")
        return None
