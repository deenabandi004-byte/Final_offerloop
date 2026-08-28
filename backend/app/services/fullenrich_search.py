"""FullEnrich people-search as a budget discovery rung.

Probed live 2026-08-24: rich rows (employment.current with a full company
object, education, skills, location) at 0.25 credits per result, roughly a
ninth of a Coresignal profile. No photos exist in their schema, so this
rung suits photo-less surfaces and fallbacks, never the swipe deck's first
choice. Schema quirk their docs do not state: filters are TOP-LEVEL keys
whose values are arrays of {"value": ...} objects.

Env-gated by FULLENRICH_SEARCH_DISCOVERY=1 plus the shared
FULLENRICH_API_KEY. Spend is tracked into the same Firestore budget doc as
the enrich side (0.25 per returned row).
"""
import logging
import os
from typing import Any, Dict, List, Optional, Tuple

import requests

from app.services.fullenrich_client import BASE, _add_spend, _headers, _key, enabled

logger = logging.getLogger(__name__)


def discovery_enabled(db) -> bool:
    return os.getenv("FULLENRICH_SEARCH_DISCOVERY", "").strip() == "1" and enabled(db)


def _vals(items) -> List[Dict[str, str]]:
    return [{"value": str(v)} for v in items if v]


def search_contacts_from_prompt(
    parsed: Dict[str, Any],
    max_contacts: int,
    exclude_keys=None,
    user_profile: Optional[Dict[str, Any]] = None,
    db=None,
) -> Tuple[List[Dict[str, Any]], int, List[Dict[str, Any]], Optional[Dict[str, Any]]]:
    """PDL-compatible 4-tuple surface over FullEnrich /people/search."""
    if not _key():
        return [], 0, [], {"provider": "fullenrich_search", "error": "missing_api_key"}

    companies = [c.get("name") if isinstance(c, dict) else c for c in (parsed.get("companies") or [])]
    companies = [c for c in companies if c][:5]
    titles = [t for t in (parsed.get("title_variations") or []) if t][:8]
    locations = [l for l in (parsed.get("locations") or []) if l][:4]
    schools = [sc for sc in (parsed.get("schools") or []) if sc][:3]
    body: Dict[str, Any] = {"limit": max(10, min(int(max_contacts), 100))}
    if companies:
        body["current_company_names"] = _vals(companies)
    if titles:
        body["current_position_titles"] = _vals(titles)
    if locations:
        body["person_locations"] = _vals(locations)
    if schools:
        body["person_universities"] = _vals(schools)
    if len(body) == 1:
        return [], 0, [], {"provider": "fullenrich_search", "message": "no actionable filters"}

    try:
        r = requests.post(f"{BASE}/people/search", headers=_headers(), json=body, timeout=30)
        logger.info("fullenrich search -> %s %s", r.status_code, r.text[:150])
        if r.status_code != 200:
            return [], 0, [], {"provider": "fullenrich_search", "error": f"http_{r.status_code}"}
        payload = r.json()
        rows = payload.get("people") or []
        credits = float((payload.get("metadata") or {}).get("credits") or 0.25 * len(rows))
        if rows and db is not None:
            _add_spend(db, credits)
        contacts = []
        for p in rows[:max_contacts]:
            c = _to_contact(p)
            if c:
                contacts.append(c)
        meta = {"provider": "fullenrich_search", "raw_count": (payload.get("metadata") or {}).get("total"),
                "credits": credits}
        return contacts, 0, [], meta
    except Exception:
        logger.exception("fullenrich search failed")
        return [], 0, [], {"provider": "fullenrich_search", "error": "exception"}


def _to_contact(p: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    first = (p.get("first_name") or "").strip()
    last = (p.get("last_name") or "").strip()
    if not (first or last):
        return None
    emp = p.get("employment") or {}
    cur = emp.get("current") if isinstance(emp, dict) else {}
    cur = cur or {}
    comp = cur.get("company") or {}
    li = ""
    sp = p.get("social_profiles")
    if isinstance(sp, list):
        for item in sp:
            if isinstance(item, dict):
                url = item.get("url") or ""
                if "linkedin" in url:
                    li = url
                    break
    elif isinstance(sp, dict):
        li = sp.get("professional_network_url") or sp.get("url") or ""
    loc = p.get("location") or {}
    edus = p.get("educations") or []
    college = ""
    if edus and isinstance(edus[0], dict):
        college = (edus[0].get("school") or edus[0].get("school_name") or edus[0].get("name") or "").strip()
    return {
        "FirstName": first,
        "LastName": last,
        "LinkedIn": li,
        "Email": "",
        "Title": (cur.get("title") or p.get("headline") or "").strip(),
        "Company": (comp.get("name") if isinstance(comp, dict) else str(comp or "")).strip(),
        "City": (loc.get("city") or "").strip(),
        "State": (loc.get("region") or "").strip(),
        "College": college,
        # No photos in their schema: the card falls back to initials.
        "PhotoUrl": "",
        "EmailSource": "",
        "EmailVerified": False,
        "_provider": "fullenrich",
        "_source": "fullenrich_search",
    }
