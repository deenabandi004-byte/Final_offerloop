"""
Launch shelf seed: grow firm_employees from ~1.3k to ~4k before launch.

Two passes, both through the same metered door the nightly warm uses
(warehouse_warm._mirror + firm_cache.writer.cache_pdl_contacts), so every
collect lands on the grant tank, in provider_calls, and on the shared shelf.

  alumni   USC alumni at the firms students target most. Rylan 2026-09-02:
           launch audience leans USC, cap this at ~1,000 collects so the
           general shelf is not starved.
  general  Recruiters and the role each firm is searched for, in demand
           order, until the general cap is hit.

Guard rails, all deliberate:
  - refuses to start, and stops mid-run, once the Coresignal tank passes 90%
    (warehouse_warm._tank_ok, same check the nightly job makes)
  - hard collect caps per pass and per firm, from the CLI
  - resumable: progress lives in meta/launchSeed, a re-run skips firms it
    already finished (Render one-off jobs can be killed; nothing is lost)
  - paced: Coresignal search bursts rate-limit at ~0.6s spacing
  - --dry-run prints the plan and touches nothing

Usage (from the repo root on a service that has CORESIGNAL_API_KEY):
  DRY RUN:  python backend/scripts/seed_launch_shelf.py --dry-run
  LIVE:     python backend/scripts/seed_launch_shelf.py --alumni 1000 --general 1700
  RESET:    python backend/scripts/seed_launch_shelf.py --reset   (forget progress)
"""
from __future__ import annotations

import argparse
import logging
import os
import sys
import time
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("seed_launch_shelf")

# The school strings Coresignal indexes for USC. match_phrase on
# education.institution_name, OR'd together (coresignal_client._build_es_query).
USC_SCHOOLS = [
    "University of Southern California",
    "USC Marshall School of Business",
    "USC Viterbi School of Engineering",
]

# Role per firm flavor for the ALUMNI pass. Young alumni reply to students;
# recruiters are covered by the general pass and ring 2 already.
_FINANCE = {"goldman", "jpmorgan", "morgan", "barclays", "evercore", "lazard",
            "jefferies", "citi", "blackstone", "kkr", "citadel", "jane",
            "blackrock", "bank", "wells", "deutsche", "ubs", "moelis", "pwp",
            "perella", "houlihan", "rbc", "guggenheim", "piper", "william"}
_CONSULT = {"mckinsey", "bain", "boston", "deloitte", "ey", "accenture",
            "kpmg", "pwc", "oliver", "kearney", "lek", "alixpartners"}

SEARCH_PACE_SECONDS = 0.7


def _alumni_roles(firm: str) -> list[str]:
    f = firm.lower()
    if any(t in f for t in _FINANCE):
        return ["analyst", "associate"]
    if any(t in f for t in _CONSULT):
        return ["analyst", "consultant", "associate"]
    return ["analyst", "software engineer", "associate", "product manager"]


def _shelf_count(db, slug: str, cap: int = 200) -> int:
    return len(list(db.collection("firm_employees")
                    .where("company", "==", slug).limit(cap).get()))


def _progress(db) -> dict:
    return db.collection("meta").document("launchSeed").get().to_dict() or {}


def _mark(db, key: str, collected: int) -> None:
    from google.cloud import firestore as _fs
    db.collection("meta").document("launchSeed").set(
        {key: _fs.Increment(int(collected)), "updated_at": _fs.SERVER_TIMESTAMP},
        merge=True,
    )


def _collect(db, disp: str, prompt: dict, take: int, dry_run: bool) -> tuple[int, int]:
    """One metered search+collect. Returns (collected, cached)."""
    from app.services import coresignal_client
    from app.services.firm_cache.writer import cache_pdl_contacts
    from app.services.warehouse_warm import _exact_firm_filter, _mirror

    if dry_run:
        logger.info("  dry-run: would collect up to %d for %s %s", take, disp, prompt.get("title_variations"))
        return 0, 0
    contacts, _rl, _sv, meta = coresignal_client.search_contacts_from_prompt(prompt, take)
    contacts = _exact_firm_filter(disp, contacts or [])
    collected = int(((meta or {}).get("collected_count")) or 0)
    _mirror(db, collected)
    cached = cache_pdl_contacts(contacts, shape="app", async_write=False) if contacts else 0
    time.sleep(SEARCH_PACE_SECONDS)
    return collected, cached


def run_alumni_pass(db, firms, cap_total: int, per_firm: int, dry_run: bool) -> int:
    from app.services.warehouse_warm import _tank_ok
    done = _progress(db)
    dug = 0
    for disp, slug, score in firms:
        if dug >= cap_total:
            break
        key = f"alumni.{slug}"
        if done.get(key, 0) >= per_firm:
            continue
        if not dry_run and not _tank_ok(db):
            logger.warning("alumni pass: tank guard tripped, stopping")
            break
        need = min(per_firm - int(done.get(key, 0)), cap_total - dug)
        roles = _alumni_roles(disp)
        share = max(2, need // len(roles))
        got = 0
        for role in roles:
            if got >= need or dug >= cap_total:
                break
            take = min(share, need - got)
            try:
                collected, cached = _collect(db, disp, {
                    "companies": [{"name": disp}],
                    "schools": USC_SCHOOLS,
                    "title_variations": [role],
                    "locations": ["United States"],
                }, take, dry_run)
            except Exception:
                logger.exception("alumni pass: %s / %s failed, continuing", disp, role)
                continue
            got += collected
            dug += collected
            if collected:
                _mark(db, key, collected)
        logger.info("alumni: %-28s score %3d  +%d collects (run total %d/%d)", disp, score, got, dug, cap_total)
    return dug


def run_general_pass(db, firms, cap_total: int, min_rows: int, dry_run: bool) -> int:
    from app.services.warehouse_warm import _roles_for, _tank_ok
    done = _progress(db)
    dug = 0
    for disp, slug, score in firms:
        if dug >= cap_total:
            break
        key = f"general.{slug}"
        if done.get(key, 0) > 0:
            continue
        if not dry_run and not _tank_ok(db):
            logger.warning("general pass: tank guard tripped, stopping")
            break
        have = _shelf_count(db, slug)
        need = min(max(0, min_rows - have), cap_total - dug)
        if need <= 0:
            _mark(db, key, 0) if not dry_run else None
            logger.info("general: %-28s already %d rows, skip", disp, have)
            continue
        roles = _roles_for(disp)
        share = max(2, need // len(roles))
        got = 0
        for role in roles:
            if got >= need or dug >= cap_total:
                break
            take = min(share, need - got)
            try:
                collected, cached = _collect(db, disp, {
                    "companies": [{"name": disp}],
                    "title_variations": [role],
                    "locations": ["United States"],
                }, take, dry_run)
            except Exception:
                logger.exception("general pass: %s / %s failed, continuing", disp, role)
                continue
            got += collected
            dug += collected
        if not dry_run:
            _mark(db, key, max(got, 1))
        logger.info("general: %-28s score %3d  had %d, +%d collects (run total %d/%d)",
                    disp, score, have, got, dug, cap_total)
    return dug


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--alumni", type=int, default=1000, help="max collects in the USC alumni pass")
    ap.add_argument("--alumni-per-firm", type=int, default=40)
    ap.add_argument("--alumni-firms", type=int, default=30, help="how many demand-ranked firms get the alumni pass")
    ap.add_argument("--general", type=int, default=1700, help="max collects in the general pass")
    ap.add_argument("--general-min-rows", type=int, default=45, help="top each firm up to this many rows")
    ap.add_argument("--general-firms", type=int, default=80)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--reset", action="store_true", help="forget meta/launchSeed progress and exit")
    args = ap.parse_args()

    from app.extensions import get_db
    from app.services import coresignal_client
    from app.services.warehouse_warm import _demand_ranked_firms, _tank_ok

    db = get_db()
    if args.reset:
        db.collection("meta").document("launchSeed").delete()
        logger.info("progress reset")
        return 0
    if not getattr(coresignal_client, "CORESIGNAL_API_KEY", ""):
        logger.error("CORESIGNAL_API_KEY is not set on this service; run on staging or daemons")
        return 2
    if not args.dry_run and not _tank_ok(db):
        logger.error("tank guard: Coresignal budget is at or past 90%%, refusing to seed")
        return 3
    if os.getenv("ENABLE_FIRM_CACHE_WRITE") != "1":
        logger.error("ENABLE_FIRM_CACHE_WRITE is not 1 here; collects would not land on the shelf")
        return 4

    firms = _demand_ranked_firms(db)
    logger.info("demand ranking: %d firms; top 10: %s", len(firms), [f[0] for f in firms[:10]])

    a = run_alumni_pass(db, firms[: args.alumni_firms], args.alumni, args.alumni_per_firm, args.dry_run)
    g = run_general_pass(db, firms[: args.general_firms], args.general, args.general_min_rows, args.dry_run)
    logger.info("seed %s: alumni %d + general %d = %d collects (~%d Coresignal credits)",
                "planned" if args.dry_run else "done", a, g, a + g, 20 * (a + g))
    return 0


if __name__ == "__main__":
    sys.exit(main())
