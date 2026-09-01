"""Nightly warehouse warming: the cache works the night shift.

Two jobs, both demand-prioritized (Rylan 2026-08-30: "prioritization of
mainstream people that people are searching... faster for a new user who
just hops on"):

  run_target_predig   Fills the wells BEFORE anyone asks: for the firms most
                      users target (their saved dreamCompanies, weighted, plus
                      the canonical new-user firms every fresh account reaches
                      for first), make sure the warehouse holds a real bench,
                      collected with the roles students actually search
                      (analysts, engineers, recruiters).

  run_warehouse_groom Keeps what's cached true: re-collects rows with no
                      photo (the pre-2026-08-26 legacy) or grown stale, again
                      in demand order so the mainstream names stay
                      showroom-fresh and the long tail waits its turn.

Every collect goes through the same metered door as live traffic (grant tank
incremented, provider_calls row written) and both jobs refuse to run past 90%
of the tank. Caps are per-night and deliberately modest: this is a drip that
compounds, not a crawl.

Scheduling: wsgi.py runs _warehouse_warm_loop hourly on the daemons service;
the target-hour check plus a Firestore date guard make it fire once per
night even across restarts.
"""

from __future__ import annotations

import logging
import os
import re
from datetime import datetime, timedelta, timezone

logger = logging.getLogger("warehouse_warm")

# The firms a brand-new user reaches for first: mirrors the app's suggestion
# chips and the head of the curated autocomplete list. Seeds get a demand
# bonus so launch-day cold starts are warm even before any user saves targets.
SEED_FIRMS = [
    "Goldman Sachs", "JPMorgan", "Morgan Stanley", "Bank of America",
    "Barclays", "Evercore", "Lazard", "Jefferies", "Citi",
    "McKinsey", "Bain", "Boston Consulting Group", "Deloitte", "EY",
    "Blackstone", "KKR", "Citadel", "Jane Street", "BlackRock",
    "Google", "Apple", "Microsoft", "Amazon", "Meta", "Nvidia",
    "Stripe", "OpenAI", "Anthropic", "Palantir", "Salesforce",
]

# The roles students actually type, by firm flavor. Collecting a mix per firm
# means the common queries ("IB analysts at X", "recruiters at Y") hit cache.
_FINANCE = {"goldman", "jpmorgan", "morgan", "barclays", "evercore", "lazard",
            "jefferies", "citi", "blackstone", "kkr", "citadel", "jane",
            "blackrock", "bank"}
_CONSULT = {"mckinsey", "bain", "boston", "deloitte", "ey"}


def _roles_for(firm: str) -> list[str]:
    f = firm.lower()
    if any(t in f for t in _FINANCE):
        return ["investment banking analyst", "recruiter"]
    if any(t in f for t in _CONSULT):
        return ["consultant", "recruiter"]
    return ["software engineer", "recruiter"]


def _slug(name: str) -> str:
    try:
        from app.models.users import normalize_company
        return normalize_company(name) or ""
    except Exception:
        return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def _tank_ok(db) -> bool:
    try:
        doc = db.collection("meta").document("coresignalTestBudget").get().to_dict() or {}
        spent = float(doc.get("spent_estimate") or 0)
        limit = float(os.getenv("CORESIGNAL_TEST_BUDGET", "30000"))
        if spent >= 0.9 * limit:
            logger.warning("warm: tank at %.0f/%.0f (>=90%%), skipping tonight", spent, limit)
            return False
        return True
    except Exception:
        logger.exception("warm: tank check failed, skipping to be safe")
        return False


def _demand_ranked_firms(db, cap_users: int = 2000) -> list[tuple[str, str, int]]:
    """[(display_name, slug, score)] sorted by demand. Score = 3 per user who
    saved the firm as a target + 2 for being a new-user seed."""
    counts: dict[str, tuple[str, int]] = {}
    for name in SEED_FIRMS:
        s = _slug(name)
        if s:
            counts[s] = (name, 2)
    try:
        scanned = 0
        for snap in db.collection("users").select(["dreamCompanies"]).limit(cap_users).stream():
            scanned += 1
            for name in (snap.to_dict() or {}).get("dreamCompanies") or []:
                if not isinstance(name, str) or not name.strip():
                    continue
                s = _slug(name)
                if not s:
                    continue
                disp, score = counts.get(s, (name.strip(), 0))
                counts[s] = (disp, score + 3)
        logger.info("warm: demand scan covered %d users, %d distinct firms", scanned, len(counts))
    except Exception:
        logger.exception("warm: demand scan failed, seeds only")
    # Live search demand (2026-08-31): every surface logs the firms users
    # actually search into meta/warehouseDemand. A search is a stronger
    # signal than a saved target (they wanted the person NOW), so it adds
    # 2 per occurrence over the trailing week on top of the profile scan.
    try:
        from app.services.warehouse_metrics import recent_demand_firms
        searched = recent_demand_firms(days=7)
        for dslug, n in searched.items():
            if not dslug or n <= 0:
                continue
            disp, score = counts.get(dslug, (dslug.replace("-", " ").title(), 0))
            counts[dslug] = (disp, score + 2 * int(n))
        if searched:
            logger.info("warm: search-demand merge added %d firms", len(searched))
    except Exception:
        logger.exception("warm: search-demand merge failed, profile scan only")
    ranked = [(disp, s, score) for s, (disp, score) in counts.items()]
    ranked.sort(key=lambda t: -t[2])
    return ranked


def _exact_firm_filter(firm: str, contacts: list[dict]) -> list[dict]:
    """Keep only true employees: 'Stripe' must not cache Kleen Stripe."""
    pat = re.compile(r"^\s*" + re.escape(firm.lower()) + r"\b", re.I)
    return [c for c in contacts if pat.match((c.get("Company") or ""))]


def _mirror(db, collected: int) -> None:
    if collected <= 0:
        return
    try:
        from google.cloud import firestore as _fs
        db.collection("meta").document("coresignalTestBudget").set(
            {"spent_estimate": _fs.Increment(20.0 * collected),
             "collect_count": _fs.Increment(collected)}, merge=True)
        from app.services.metering import log_provider_spend
        log_provider_spend("coresignal", "member_collect", collected, returned=collected)
    except Exception:
        pass


def run_target_predig(db) -> None:
    """Stock the demand-ranked wells before morning."""
    if not _tank_ok(db):
        return
    from app.services import coresignal_client
    if not getattr(coresignal_client, "CORESIGNAL_API_KEY", ""):
        logger.warning("predig: no CORESIGNAL_API_KEY on this service")
        return
    from app.services.firm_cache.writer import cache_pdl_contacts

    min_rows = int(os.getenv("PREDIG_MIN_ROWS", "12"))
    budget = int(os.getenv("PREDIG_MAX_COLLECTS", "80"))
    dug = 0
    for disp, slug, score in _demand_ranked_firms(db):
        if dug >= budget:
            break
        try:
            have = len(list(db.collection("firm_employees")
                            .where("company", "==", slug).limit(min_rows).get()))
            if have >= min_rows:
                continue
            need = min(min_rows - have, budget - dug)
            for role in _roles_for(disp):
                if need <= 0 or dug >= budget:
                    break
                take = max(2, need // 2)
                contacts, _rl, _sv, meta = coresignal_client.search_contacts_from_prompt(
                    {"companies": [{"name": disp}],
                     "title_variations": [role], "locations": ["United States"]},
                    take,
                )
                contacts = _exact_firm_filter(disp, contacts or [])
                collected = int(((meta or {}).get("collected_count")) or 0)
                _mirror(db, collected)
                dug += collected
                need -= len(contacts)
                if contacts:
                    cache_pdl_contacts(contacts, shape="app", async_write=False)
            logger.info("predig: %s (score %d) topped up, %d/%d collects used",
                        disp, score, dug, budget)
        except Exception:
            logger.exception("predig: %s failed, continuing", disp)
    logger.info("predig: done, %d collects", dug)


def run_warehouse_groom(db) -> None:
    """Re-collect rows that rotted: no photo, or stale. Demand order."""
    if not _tank_ok(db):
        return
    from app.services.linkedin_enrich import enrich_linkedin_profile_engine

    budget = int(os.getenv("GROOM_MAX_COLLECTS", "60"))
    stale_days = int(os.getenv("GROOM_STALE_DAYS", "45"))
    cutoff = (datetime.now(timezone.utc) - timedelta(days=stale_days)).isoformat()
    done = 0
    for disp, slug, _score in _demand_ranked_firms(db):
        if done >= budget:
            break
        try:
            rows = list(db.collection("firm_employees")
                        .where("company", "==", slug).limit(40).get())
            for snap in rows:
                if done >= budget:
                    break
                d = snap.to_dict() or {}
                needs = (not (d.get("photo_url") or "").strip()
                         or str(d.get("last_seen_at") or "") < cutoff)
                if not needs:
                    continue
                # One call collects fresh data, re-feeds the warehouse (photo
                # included), and meters the spend.
                if enrich_linkedin_profile_engine(snap.id, db=db):
                    done += 1
        except Exception:
            logger.exception("groom: %s failed, continuing", disp)
    logger.info("groom: done, %d rows refreshed", done)


def run_nightly_warm(db) -> None:
    """Once-per-night gate + both jobs. Safe to call hourly."""
    hour = int(os.getenv("WARM_HOUR_UTC", "9"))
    now = datetime.now(timezone.utc)
    if now.hour != hour:
        return
    guard = db.collection("meta").document("warehouseWarm")
    today = now.strftime("%Y-%m-%d")
    if (guard.get().to_dict() or {}).get("lastRun") == today:
        return
    guard.set({"lastRun": today, "startedAt": now.isoformat()}, merge=True)
    logger.info("nightly warm: starting (%s)", today)
    run_target_predig(db)
    run_warehouse_groom(db)
    guard.set({"finishedAt": datetime.now(timezone.utc).isoformat()}, merge=True)
    logger.info("nightly warm: finished")
