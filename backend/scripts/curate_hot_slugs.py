"""
Phase 1 curation: expand hot_slugs.txt from ~270 to ~500 by matching a
curated list of Offerloop-target company names against the vendored jobhive
CSVs. Deterministic and re-runnable — dedupes against existing hot list.

Target audience: USC/UCLA/UMich/UPenn/etc students recruiting for tech, IB
(non-Workday), consulting (non-Workday), fintech, biotech, defense, quant.

Verticals covered:
  - Big tech & FAANG-adjacent    - Enterprise SaaS
  - AI / ML labs                 - Devtools / infra
  - Fintech & crypto             - Biotech / health
  - Quant trading                - Consumer / retail tech
  - Defense / aerospace          - Data / analytics
  - Design / product tools       - Media / entertainment
"""
import csv
from pathlib import Path

DATA_DIR = Path(__file__).parent.parent / "pipeline" / "data" / "ats_companies"
HOT = DATA_DIR / "hot_slugs.txt"

# Curated by product: names a target-audience student would recognize and
# reasonably apply to. Some may not exist in jobhive (unfindable) — that's
# fine, the script reports misses.
TARGET_NAMES = [
    # Big tech / consumer
    "Netflix", "Adobe", "Salesforce", "LinkedIn", "PayPal", "Uber", "Airbnb",
    "Snap", "Pinterest", "Etsy", "eBay", "Yelp", "Zillow", "Redfin",
    "Peloton", "Grubhub", "Postmates", "TaskRabbit", "Turo", "Roblox",
    "Unity Technologies", "Epic Games", "Zynga", "Electronic Arts",
    # AI / ML labs & platforms
    "Character AI", "Character.AI", "Inflection AI", "Adept",
    "Runway", "Midjourney", "Stability AI", "Hugging Face", "Weights & Biases",
    "LangChain", "Pinecone", "Weaviate", "Chroma", "Modal", "Replicate",
    "Together AI", "Fireworks AI", "Anyscale", "Groq", "SambaNova",
    "Contextual AI", "Sakana", "Sana", "Hebbia", "Glean", "Harvey", "Adept AI",
    # Fintech
    "Plaid", "Klarna", "Wise", "Revolut", "SoFi", "Nubank", "Toast", "Block",
    "Square", "Rippling", "Deel", "Ramp", "Mercury", "Modern Treasury",
    "Airwallex", "Nium", "Alloy", "Persona", "Truework", "Stash", "Public",
    "M1 Finance", "Wealthfront", "Betterment", "Acorns", "Chime", "Current",
    "Varo", "Dave", "Cash App",
    # Enterprise SaaS
    "ServiceNow", "Zoom", "Slack", "Miro", "Asana", "Monday.com", "ClickUp",
    "Notion", "Airtable", "Coda", "Zoominfo", "DocuSign", "PagerDuty",
    "New Relic", "Sumo Logic", "Splunk", "Twilio", "SendGrid", "Braze",
    "Iterable", "Klaviyo", "Amplitude", "Mixpanel", "Segment", "Rudderstack",
    # Devtools / infra / data
    "GitHub", "GitLab", "Postman", "JetBrains", "Vercel", "Netlify", "Render",
    "Fly.io", "Railway", "Supabase", "Neon", "PlanetScale", "Turso", "Xata",
    "Convex", "Retool", "Airplane", "Sourcegraph", "Sentry", "Rollbar",
    "LaunchDarkly", "Statsig", "PostHog", "Grafana", "InfluxData", "Datastax",
    "Snowflake", "Databricks", "Confluent", "Materialize",
    # Biotech / health
    "Recursion", "Ginkgo", "10x Genomics", "Illumina", "Moderna", "Regeneron",
    "Verily", "Roivant", "Insitro", "Recursion Pharma", "Freenome",
    "Oscar Health", "Devoted Health", "Cityblock", "One Medical", "Ro",
    "Hims", "Nurx", "Alto Pharmacy", "Capsule", "Truepill",
    # Defense / aerospace / robotics
    "SpaceX", "Anduril", "Palantir", "Shield AI", "Skydio", "Zipline",
    "Boston Dynamics", "Aurora", "Waymo", "Cruise", "Zoox", "Nuro",
    "Rivian", "Lucid Motors", "Joby", "Archer", "Boom Supersonic",
    "Firefly Aerospace", "Astranis", "Varda", "Impulse Space",
    # Consumer / retail tech / logistics
    "Warby Parker", "Allbirds", "Glossier", "Away", "Chewy", "Wayfair",
    "Instacart", "DoorDash", "Faire", "Whatnot", "GOAT", "StockX",
    "Ramp", "Flexport",
    # Media / entertainment
    "Spotify", "Reddit", "Discord", "Twitch", "SoundCloud", "Substack",
    "Beehiiv", "Ghost", "Medium", "Roblox", "Riot Games",
    # Design / product tools
    "Figma", "Framer", "Sketch", "Loom", "Descript", "Grain",
    # Fintech B2B / infra
    "Alchemy", "Fireblocks", "Chainalysis", "OpenSea", "Uniswap", "dYdX",
    # Consulting/finance-adjacent (non-Workday niche)
    "Alvarez & Marsal", "AlixPartners", "L.E.K. Consulting",
    # Quant / trading
    "Jump Trading", "Susquehanna", "SIG", "Millennium", "Point72", "Balyasny",
    "Verition", "Squarepoint", "PDT Partners", "DE Shaw", "Radix Trading",
    "XTX Markets", "Old Mission Capital", "Belvedere Trading",
]


def _load_csv(ats: str) -> list[dict]:
    with (DATA_DIR / f"{ats}.csv").open() as f:
        return list(csv.DictReader(f))


def _load_hot() -> tuple[set[str], list[str]]:
    """Return (existing_slug_keys, raw_lines)."""
    keys, lines = set(), []
    for raw in HOT.read_text().splitlines():
        lines.append(raw)
        s = raw.strip()
        if s and not s.startswith("#"):
            keys.add(s)
    return keys, lines


def _find(target: str, records: list[dict]) -> list[dict]:
    """Case-insensitive fuzzy match. Prefers exact name match, falls back to substring."""
    lo = target.lower().strip()
    exact = [r for r in records if r.get("name", "").lower().strip() == lo]
    if exact:
        return exact
    starts = [r for r in records if r.get("name", "").lower().startswith(lo)]
    if starts:
        return starts
    return [r for r in records if lo in r.get("name", "").lower()]


def main() -> None:
    csvs = {ats: _load_csv(ats) for ats in ("greenhouse", "lever", "ashby")}
    existing, existing_lines = _load_hot()
    additions: list[str] = []
    missed: list[str] = []

    for target in TARGET_NAMES:
        found_any = False
        for ats, records in csvs.items():
            matches = _find(target, records)
            # cap at top-1 per ATS to avoid pulling multiple similarly-named companies
            for r in matches[:1]:
                key = f"{ats}:{r['slug']}"
                if key not in existing:
                    additions.append(f"{key}  # {r['name']}")
                    existing.add(key)
                    found_any = True
        if not found_any:
            missed.append(target)

    print(f"existing hot slugs: {len(existing_lines)} lines")
    print(f"proposed additions: {len(additions)}")
    print(f"targets not found in any jobhive CSV: {len(missed)}")
    if missed:
        print("  missed:", ", ".join(missed[:20]) + (" ..." if len(missed) > 20 else ""))

    if not additions:
        print("nothing to add. exiting.")
        return

    # Append to hot_slugs.txt with a section marker so the diff is scannable
    with HOT.open("a") as f:
        f.write("\n# Phase 1 additions (2026-07-14) — curated from jobhive CSVs\n")
        for line in additions:
            f.write(line + "\n")
    print(f"appended {len(additions)} lines to {HOT}")


if __name__ == "__main__":
    main()
