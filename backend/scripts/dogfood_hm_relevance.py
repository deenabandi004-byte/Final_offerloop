"""Dogfood the hiring manager relevance overhaul against live APIs.

Runs six scenarios covering: consulting/IB (partner-level tight query),
international role (country inference), product at a scaleup, obscure
company (reachable-people fallback), Firecrawl seed, and the
job_company_website routing for BCG.

Prints concise summaries — cohort mix, top 3 titles, whether fallback
fired. Kept small on max_results to cap PDL spend (~5 credits per
scenario worst case).

Usage:  python backend/scripts/dogfood_hm_relevance.py
"""
from __future__ import annotations

import json
import os
import sys
import time

# Ensure both `app.*` (test style) and `backend.app.*` (module style)
# imports resolve — different files in this repo mix the two.
HERE = os.path.dirname(os.path.abspath(__file__))
BACKEND = os.path.dirname(HERE)
REPO_ROOT = os.path.dirname(BACKEND)
sys.path.insert(0, BACKEND)
sys.path.insert(0, REPO_ROOT)

# Load .env into os.environ (dotenv already in requirements).
try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(os.path.dirname(BACKEND), ".env"))
except Exception:
    pass


def _summarize(name: str, result: dict) -> None:
    hms = result.get("hiringManagers") or []
    meta = result.get("enrichment_meta") or {}
    print(f"\n=== {name} ===")
    print(f"  company_cleaned:    {result.get('company_cleaned')}")
    print(f"  job_type_detected:  {result.get('job_type_detected')}")
    print(f"  search_tier_used:   {result.get('search_tier_used')}")
    print(f"  total_found (raw):  {result.get('total_found')}")
    print(f"  hiringManagers:     {len(hms)}")
    if meta:
        print(
            f"  meta: tight={meta.get('tight_pdl_used')} "
            f"count={meta.get('tight_pdl_count')} role={meta.get('tight_pdl_role')} "
            f"mix={meta.get('mix_mode')} "
            f"seed={meta.get('firecrawl_seed_used')} "
            f"dropped={meta.get('candidates_dropped')} "
            f"title_corrections={meta.get('candidates_title_corrected')}"
        )
    if result.get("fallback_message"):
        print(f"  fallback_message:   {result['fallback_message']}")
    for i, hm in enumerate(hms, start=1):
        cohort = hm.get("_cohort", "?")
        verified = hm.get("EmailVerified") or hm.get("is_verified_email") or hm.get("email_verified")
        still = hm.get("_perplexity_still_at_company") or "-"
        print(
            f"  {i}. [{cohort:9}] {hm.get('FirstName', '')} {hm.get('LastName', '')} "
            f"— {hm.get('Title', '?')} — {hm.get('Company', '?')} "
            f"[email={'y' if verified else '-'} still={still}]"
        )


def _run(name: str, **kwargs) -> None:
    from app.services.recruiter_finder import find_hiring_manager
    print(f"\n>>> Running: {name}")
    t0 = time.time()
    try:
        result = find_hiring_manager(**kwargs)
    except Exception as e:
        print(f"  ERROR: {type(e).__name__}: {e}")
        return
    dt = time.time() - t0
    _summarize(name, result)
    print(f"  elapsed:            {dt:.1f}s")


def _run_reachable_composition(name: str, hm_result: dict, uid: str, company: str,
                                job_title: str, location: str | None) -> None:
    """Simulate the route's reachable-people fallback path against live APIs."""
    from app.services.alumni_discovery import discover_alumni
    from app.services.perplexity_client import discover_hiring_leads
    print(f"\n>>> Reachable-people composition for: {name}")
    print("  (simulating route: alumni_discovery + discover_hiring_leads)")

    # Alumni step
    try:
        alumni_resp = discover_alumni(
            uid=uid,
            job={
                "company": company,
                "title": job_title,
                "job_id": f"hm-dogfood:{company.lower()}:{job_title.lower()}",
            },
            tier="pro",
            allow_drop_title=True,
        )
        print(f"  alumni: ok={alumni_resp.get('ok')} code={alumni_resp.get('code')} "
              f"contacts={len(alumni_resp.get('contacts') or [])} "
              f"rung={alumni_resp.get('rung')} cache={alumni_resp.get('cache_hit')}")
        for row in (alumni_resp.get("contacts") or [])[:3]:
            print(f"    - {row.get('first_name')} {row.get('last_name')} "
                  f"— {row.get('title')} — school={row.get('school')} "
                  f"strength={row.get('match_strength')}")
    except Exception as e:
        print(f"  alumni: ERROR {type(e).__name__}: {e}")

    # Perplexity discovery step
    try:
        job_type = hm_result.get("job_type_detected")
        leads = discover_hiring_leads(
            company=hm_result.get("company_cleaned") or company,
            job_title=job_title,
            location=location,
            department_hint=job_type,
            max_leads=3,
        )
        print(f"  perplexity leads: {len(leads)}")
        for lead in leads:
            print(f"    - {lead.get('name')} — {lead.get('title')} "
                  f"— li={'y' if lead.get('linkedin_url') else '-'} "
                  f"reason={lead.get('reason', '')[:80]}")
    except Exception as e:
        print(f"  perplexity: ERROR {type(e).__name__}: {e}")


def main() -> None:
    # Fingerprint API keys (last 4 chars) so we know we're hitting real APIs.
    keys = {
        "PDL": (os.environ.get("PEOPLE_DATA_LABS_API_KEY") or "")[-4:],
        "PERPLEXITY": (os.environ.get("PERPLEXITY_API_KEY") or "")[-4:],
        "FIRECRAWL": (os.environ.get("FIRECRAWL_API_KEY") or "")[-4:],
        "HUNTER": (os.environ.get("HUNTER_API_KEY") or "")[-4:],
    }
    print("API key fingerprints (last 4):", keys)

    # SCENARIO 1: Consulting at BCG. Validates job type detection (consulting),
    # tight query with partner level, job_company_website routing.
    _run(
        "1. Consulting @ BCG (partner-level, website routing)",
        company_name="BCG",
        job_title="Consulting Associate",
        job_description="Join our strategy consulting practice. MBB firm.",
        location="New York, NY",
        max_results=3,
        generate_emails=False,
    )

    # SCENARIO 2: IB analyst at Goldman. Validates IB detection → finance
    # PDL role, partner level, and _JOB_TYPE_TO_PDL_ROLE mapping.
    _run(
        "2. IB Analyst @ Goldman Sachs",
        company_name="Goldman Sachs",
        job_title="Investment Banking Analyst",
        job_description="M&A group analyst role. Investment banking division.",
        location="New York, NY",
        max_results=3,
        generate_emails=False,
    )

    # SCENARIO 3: International product role. Validates country inference (UK),
    # product job type.
    _run(
        "3. Product Manager @ Revolut (London — international, country=UK)",
        company_name="Revolut",
        job_title="Senior Product Manager",
        job_description="Product manager for the retail banking product line.",
        location="London, UK",
        max_results=3,
        generate_emails=False,
    )

    # SCENARIO 4: Firecrawl seed via known ATS posting. Passes seed name directly
    # to simulate what the route does with extract_job_posting output.
    _run(
        "4. Firecrawl-seeded HM (skips tight PDL)",
        company_name="Anthropic",
        job_title="Software Engineer",
        job_description="Backend infrastructure work at Anthropic.",
        location="San Francisco, CA",
        max_results=3,
        generate_emails=False,
        seed_hiring_manager_name="Dario Amodei",  # public co-founder name; expected to resolve
    )

    # SCENARIO 5: Obscure/small company where PDL will likely thin out —
    # triggers reachable-people composition.
    result_5 = None
    try:
        from app.services.recruiter_finder import find_hiring_manager
        print(f"\n>>> Running: 5. Obscure small company (fallback expected)")
        t0 = time.time()
        result_5 = find_hiring_manager(
            company_name="Ramp",  # mid-size fintech, should have data but modest
            job_type=None,
            job_title="Product Designer",
            job_description="Design for financial products.",
            location="New York, NY",
            max_results=3,
            generate_emails=False,
        )
        _summarize("5. Product Designer @ Ramp", result_5)
        print(f"  elapsed:            {time.time() - t0:.1f}s")
    except Exception as e:
        print(f"  ERROR: {type(e).__name__}: {e}")

    # For scenario 5, also test the reachable-people composition path
    # (route logic) since that's the biggest new surface. We use a
    # placeholder uid — discover_alumni will return no_school without a
    # real user profile, which is the honest degraded behavior for a
    # first-time user, but we still exercise discover_hiring_leads.
    if result_5:
        _run_reachable_composition(
            "5. Product Designer @ Ramp",
            hm_result=result_5,
            uid="dogfood-test-uid-does-not-exist",
            company=result_5.get("company_cleaned") or "Ramp",
            job_title="Product Designer",
            location="New York, NY",
        )


if __name__ == "__main__":
    main()
