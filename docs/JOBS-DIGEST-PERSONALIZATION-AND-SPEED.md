# Jobs pipeline — shared state + open items

App (`staging/mobile-field`) and website (`main`) read/write **one Firestore
`jobs` collection**. This is the short list of decisions in effect (so neither
side undoes them) and the work nobody's done yet. Not a spec — a state note.
Last verified against prod 2026-07-15 (118,434 jobs).

## Decisions in effect — don't break these
- **Contract fields every job needs:** `company` (canonical), `search_terms`,
  `posted_at`, `relevance_tier`. The app's feed + company pages depend on all four.
- **Tier gating (website writers):** only `relevance_tier=1` gets
  `enrichment_status=pending`; tiers 2–3 get `skipped_low_priority`. Bounds
  Firecrawl cost. Working — no backfill needed (100% of jobs carry the field).
- **App ranked feed = `relevance_tier IN [1,2]` only** (`jobs.py`,
  `_FEED_RELEVANCE_TIERS`). Cut the 118k cold-rank read 17s→6s. Tier-3 stays out
  of the deck but is folded into the **explore pool** (id-only sample) and is
  unfiltered on **company pages** — so nothing goes dark. Composite index
  (relevance_tier, posted_at) deployed.
- **Company pages must stay un-tier-filtered** — that's now the only place tier-3
  depth is browsable.

## Open items (nobody's built these)
1. **Preference-aware, positive US-detection for location.** Today it's a hard
   global blocklist of non-US keywords (expanded, but a blocklist can't keep up
   with a global crawl). Real fix: keep affirmatively-US locations, and let users
   who list an international city / opt into relocation *see* those jobs instead
   of filtering them out for everyone.
2. **Lazy structured-enrichment on click.** 91% of the pool is
   `skipped_low_priority` with no Firecrawl `structured` data, so those cards
   render thin (title/company/location). Fix: on click into a skipped job, kick
   off enrichment inline and upgrade the card. Post-launch, both surfaces. (The
   app already lazy-fetches the *description*; this extends that to structured.)
