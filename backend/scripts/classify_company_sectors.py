"""
Piece 3: LLM sector-tag classifier for companies/{slug} docs.

Reads each company (name + topTitles), classifies into ONE of ~16 controlled
sectors, writes the value back to companies/{slug}.sector.

Idempotent: skips companies with `sector` already set unless --force. That
makes the incremental case (2h cron catching newly-added companies) cheap.

Controlled vocab: kept short + orthogonal so the LLM doesn't dither. Companies
that genuinely fit multiple sectors get the dominant one; edge cases → "other".

Run:
    cd ~/work/Offerloop
    GOOGLE_APPLICATION_CREDENTIALS=firebase-sa.json OPENAI_API_KEY=... \
        python -m backend.scripts.classify_company_sectors

    # incremental (only unclassified):
    ... python -m backend.scripts.classify_company_sectors
    # full re-classification:
    ... python -m backend.scripts.classify_company_sectors --force
    # small batch test:
    ... python -m backend.scripts.classify_company_sectors --limit=50

Cost: ~$0.25-1.00 for the full 7,474 companies (GPT-4o-mini, batched
20 companies per call, ~150 API calls total).
"""
from __future__ import annotations

import argparse
import json
import logging
import os
import sys
import time
from collections import Counter
from typing import Iterable

import firebase_admin
from firebase_admin import credentials, firestore

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

BATCH_SIZE = 25          # companies per LLM call
BATCH_WRITE_SIZE = 400   # Firestore batch write cap
MODEL = "gpt-4o-mini"    # cheap + fast; sector is a low-nuance task

# Controlled sector vocabulary. Kept to 16 categories — enough resolution
# for user-facing filters, few enough that the LLM commits to one confidently.
SECTORS = [
    "fintech",           # Stripe, Plaid, Ramp, Robinhood, Coinbase
    "saas_enterprise",   # Salesforce, HubSpot, Zendesk, ServiceNow
    "ai_ml",             # OpenAI, Anthropic, Cohere, Hugging Face
    "devtools_infra",    # GitHub, Vercel, Databricks, Snowflake, Cloudflare
    "consumer_social",   # Meta, TikTok, Reddit, Discord, Pinterest
    "consumer_marketplace", # Airbnb, DoorDash, Uber, Instacart, Etsy
    "healthtech",        # Oscar, Devoted, One Medical, Hims, Ro
    "biotech_pharma",    # Recursion, Ginkgo, Moderna, Illumina
    "climate_energy",    # Tesla, Rivian, Sunrun, Redwood Materials
    "defense_aerospace", # SpaceX, Anduril, Palantir, Shield AI
    "gaming",            # Riot, Epic, Roblox, EA, Ubisoft
    "media_entertainment", # Netflix, Spotify, Disney, HBO
    "edtech",            # Duolingo, Chegg, Coursera, Khan Academy
    "cybersecurity",     # CrowdStrike, Okta, Zscaler, Cloudflare Security
    "consulting_professional", # McKinsey, BCG, Bain, Deloitte, PwC
    "finance_investment_bank", # Goldman, JPM, Morgan Stanley, Citadel, Two Sigma
    "other",             # Fallback — MLM/scam/blue-collar/unknown-domain
]

SECTOR_LIST_STR = ", ".join(SECTORS)

SYSTEM_PROMPT = (
    "You classify companies into ONE sector from this controlled list:\n"
    f"{SECTOR_LIST_STR}\n\n"
    "Rules:\n"
    "- Pick the DOMINANT sector. If a company clearly does two, pick the "
    "one most students would associate with the brand.\n"
    "- CRITICAL — services companies that mass-hire agents/reps/contractors "
    "go to 'other', NOT the sector their clients operate in. Examples:\n"
    "  * Insurance sales agent networks (Horace Mann, AO Garcia, Symmetry "
    "Financial) → 'other' (NOT finance_investment_bank)\n"
    "  * Personal-injury law firms (Morgan & Morgan, Cellino) → 'other' "
    "(NOT consulting_professional)\n"
    "  * B2B lead-gen / demand-gen agencies (INFUSE) → 'other' (NOT edtech "
    "or saas_enterprise)\n"
    "  * Sports betting / gambling data (Genius Sports, Betsson, Bjak) → "
    "'other' (NOT gaming — that's for video-game studios)\n"
    "  * Construction / utility contractors (Michels) → 'other' (NOT "
    "climate_energy — that's for clean-energy PRODUCT companies)\n"
    "  * Healthcare staffing / in-home care agencies (BAYADA, Bntria, "
    "LifeStance's in-home network) → 'other' (NOT healthtech — that's "
    "for digital-health PRODUCT companies)\n"
    "- Consumer product brands (Monster Energy, Red Bull) → "
    "'consumer_marketplace' or 'media_entertainment' based on business, "
    "NOT 'consumer_social'.\n"
    "- Rideshare / delivery / marketplace (Lyft, Uber, DoorDash, Instacart) "
    "→ 'consumer_marketplace', NOT 'consumer_social'.\n"
    "- AI companies: only 'ai_ml' if their CORE PRODUCT is AI/ML "
    "infrastructure or models (OpenAI, Anthropic, Harvey AI, LangChain). "
    "Companies that USE AI in their product (Omada Health uses AI for "
    "clinical guidance → 'healthtech'; CHAOS Industries builds AI-enabled "
    "defense hardware → 'defense_aerospace') go to their vertical sector.\n"
    "- Use 'other' when a company is genuinely outside all listed sectors "
    "(MLM, unknown/vague, staffing).\n"
    "- Return JSON: {\"classifications\": [{\"name\": ..., \"sector\": ...}, ...]}\n"
    "- Preserve input names exactly."
)


def _init_db():
    if not firebase_admin._apps:
        cred_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS", "firebase-sa.json")
        firebase_admin.initialize_app(credentials.Certificate(cred_path))
    return firestore.client()


def _build_batch_prompt(batch: list[dict]) -> str:
    """One LLM call = one JSON payload of companies. Keeps prompts short."""
    lines = ["Classify each of these companies. Return JSON as instructed."]
    for c in batch:
        titles_str = ", ".join(c["topTitles"][:5]) if c.get("topTitles") else "(no titles available)"
        lines.append(f"- name: {c['name']}\n  top_titles: {titles_str}")
    return "\n".join(lines)


def _call_llm(client, batch: list[dict]) -> dict[str, str]:
    """Batch-classify. Returns {name: sector} for the batch."""
    prompt = _build_batch_prompt(batch)
    try:
        resp = client.chat.completions.create(
            model=MODEL,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": prompt},
            ],
            response_format={"type": "json_object"},
            temperature=0,
        )
        payload = json.loads(resp.choices[0].message.content or "{}")
        result: dict[str, str] = {}
        for row in payload.get("classifications", []):
            name = (row.get("name") or "").strip()
            sector = (row.get("sector") or "").strip().lower()
            if name and sector in SECTORS:
                result[name] = sector
            elif name:
                # LLM returned invalid sector — coerce to other
                result[name] = "other"
        return result
    except Exception as e:
        logger.warning("LLM batch failed: %s", e)
        return {}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--force", action="store_true",
                        help="reclassify companies that already have a sector")
    parser.add_argument("--limit", type=int, default=None,
                        help="stop after N companies classified (smoke test)")
    parser.add_argument("--dry-run", action="store_true",
                        help="classify but don't write back to Firestore")
    args = parser.parse_args()

    if not os.environ.get("OPENAI_API_KEY"):
        logger.error("OPENAI_API_KEY not set")
        sys.exit(1)

    from openai import OpenAI
    client = OpenAI()
    db = _init_db()
    coll = db.collection("companies")

    # Load candidates
    logger.info("scanning companies collection...")
    candidates: list[dict] = []
    for doc in coll.stream():
        data = doc.to_dict() or {}
        if not args.force and data.get("sector"):
            continue
        name = data.get("name") or ""
        if not name:
            continue
        candidates.append({
            "id": doc.id,
            "name": name,
            "topTitles": data.get("topTitles") or [],
        })
    logger.info("candidates to classify: %d (force=%s)", len(candidates), args.force)

    if args.limit:
        candidates = candidates[: args.limit]
        logger.info("limited to %d", len(candidates))

    if not candidates:
        print("nothing to classify. exiting.")
        return

    # Batch classify + per-batch write (progress visible in prod as it runs).
    # Trade: ~300 Firestore commits instead of ~20, but each is tiny (25 docs)
    # and we can watch progress in real time.
    classifications: dict[str, str] = {}  # doc_id → sector (running total)
    id_by_name: dict[str, str] = {c["name"]: c["id"] for c in candidates}
    total = len(candidates)
    completed = 0
    written = 0
    start = time.time()
    for i in range(0, total, BATCH_SIZE):
        batch = candidates[i : i + BATCH_SIZE]
        name_to_sector = _call_llm(client, batch)

        # Write this batch immediately
        if name_to_sector and not args.dry_run:
            fs_batch = db.batch()
            for name, sector in name_to_sector.items():
                doc_id = id_by_name.get(name)
                if doc_id:
                    fs_batch.update(coll.document(doc_id), {"sector": sector})
                    classifications[doc_id] = sector
            fs_batch.commit()
            written += len(name_to_sector)
        elif name_to_sector:
            # Dry-run: just track the classifications
            for name, sector in name_to_sector.items():
                doc_id = id_by_name.get(name)
                if doc_id:
                    classifications[doc_id] = sector

        completed += len(batch)
        # Log every batch — we want visibility on this run
        rate = completed / max(time.time() - start, 0.1)
        logger.info("  batch %d/%d done: %d/%d classified (%.1f/s)",
                    i // BATCH_SIZE + 1, (total + BATCH_SIZE - 1) // BATCH_SIZE,
                    completed, total, rate)
        sys.stdout.flush()  # defeat any stdout buffering

    # Summary
    dist = Counter(classifications.values())
    print()
    print("=" * 60)
    print(f"SECTOR CLASSIFICATION {'(DRY RUN)' if args.dry_run else ''}")
    print("=" * 60)
    print(f"  candidates scanned:    {total:,}")
    print(f"  classified:            {len(classifications):,}")
    print(f"  writes committed:      {written:,}")
    print()
    print("sector distribution:")
    for sector, n in dist.most_common():
        print(f"  {sector:28s} {n:>5d}  ({100*n/max(total,1):.1f}%)")


if __name__ == "__main__":
    main()
