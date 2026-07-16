# Backend enrichment backlog — running handoff for Sid

A living list of pipeline/data gaps the app surfaces. Rylan appends as we find
them; Sid drains them. Newest-relevant first. (Not blockers for the app
submission — these are quality/coverage.)

---

## 1. ATS coverage: crawl Workday (finance/consulting are ~empty) — HIGH
The pool is Greenhouse/Lever/Ashby only, so it's tech-heavy. Verified against prod:
```
TECH:     Stripe 702 · Anthropic 472 · Databricks 520 · Notion 157 · Snowflake 178
FINANCE:  Goldman 0 · JPMorgan 0 · Morgan Stanley 0 · McKinsey 0 · Bain 0 · BCG 0
          Blackstone 0 · Evercore 0   (only Jane Street 162 / Citadel 8 — they use Ashby)
```
Only **1,226 of 7,449 companies have ≥20 roles.** Offerloop's core audience recruits
for **consulting + IB + tech**, so a company page for any bank/MBB firm shows "no
open roles." Networking (PDL contacts) still works there; it's the *jobs* that are
missing. **Ask: add Workday** (and iCIMS/SmartRecruiters if cheap) to the crawl —
that's where finance/consulting post. Biggest single lever for the job side.

## 2. Sector classifier — services-vs-product mislabels (may be partly done)
Mass-hire services firms topping tech sectors by volume. Sid shipped a
SECTOR_OVERRIDES map that fixed the flagged cases; re-verify these stay correct and
extend the pattern to new ones as they appear:
Horace Mann → other · Morgan & Morgan → other · Genius Sports → other · Bjak → other
· Betsson → other · Harvey → ai_ml · Omada → healthtech · CHAOS → defense_aerospace
· Lyft/Monster Energy → consumer_marketplace. See SECTOR-QA-NOTES.md for the full list.

## 3. Companies index — prune zombie docs on rebuild (may be done)
After a canonical merge, the old fragmented company doc lingered with a stale count
(e.g. `monsterenergy` alongside `Monster Energy`, both showing 133). Sid added a
delete-first prune; confirm no stale zero-job docs persist after future merges.

## 4. Enrichment coverage — thin job cards
91% of pool jobs are `skipped_low_priority` (no Firecrawl `structured`), so most
cards show no description. Tier-gating is correct for cost, but consider lazy
enrichment on click (enrich a skipped job the first time a user opens it) so opened
cards fill in. Post-launch.

## 5. Canonicalization tail — scraper-suffix names
A few company names still carry scrape artifacts ("…glassdoor", "…fr", no-space
concatenations like `michelscorporation`). The app filters the obvious ones from
suggestions, but fixing at the normalizer helps the company page + counts too.
