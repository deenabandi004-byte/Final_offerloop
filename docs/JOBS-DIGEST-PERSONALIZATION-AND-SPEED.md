# Jobs: Digest, Personalization, Location, and Speed — spec for Sid

Written 2026-07-15. Context: the ATS crawl is scaling from ~34k jobs toward
100k+/day. This doc is how the app already digests, ranks, filters, and *serves
fast* — and what to wire up so your growing crawl flows in clean, plus how to
carry the app's speed tricks back to the website (whose personalization/serving
layer is currently behind the app's).

Everything below is grounded in live code in `backend/app/routes/jobs.py`,
`backend/app/utils/job_ranking.py`, `backend/pipeline/*`, and the app's feed
service. Nothing here needs a schema migration — it's additive.

---

## 1. How a job reaches a user today (the exposure path)

```
crawl → writer → `jobs` collection ──(live)──► feed candidate pool
                                                 │
                     rank vs user resume/profile │  (per-user, cached ~30m)
                                                 ▼
      filter international/senior → cap 10/company → space by company
                                                 ▼
              serve ≤300 cards, ~60/page, +3% explore, paginated by cursor
```

Two independent clocks, and this is the mental model to hold:

- **Exposure is LIVE.** The feed reads the `jobs` collection at rank time. Any
  job written with `company` (canonical), `search_terms`, and `posted_at` is a
  candidate on the next rank — no digest step, no deploy. Your 110k land and are
  swipeable immediately.
- **Enrichment TRAILS.** Rich fields (description, comp, work arrangement, level,
  quals) are filled by a separate batch (`pipeline/enricher.py`). Today the
  crawled jobs have 0% of these — that's the one real gap (see §2).

### "300 cards" and "cap 10/company", precisely
- **300** = one *serving window*, not a lifetime cap. Swipe through it and a
  re-rank pulls a fresh 300 *excluding what you've seen*. Over time a user works
  the whole catalog, 300 at a time.
- **Cap 10/company** = within that 300, one employer contributes ≤10 cards (now
  spaced ≥4 apart — `_space_by_company`). SpaceX's other ~1,880 roles live on the
  **company page Roles tab**, which is cursor-paginated (users can now load more
  and swipe as deep as they want).

---

## 2. Digesting your crawl + enrichment at scale (the one wiring step)

**Ask: stamp `enrichment_status='pending'` on every job the crawler writes.**

`pipeline/enricher.py` already runs on a cron every ~30 min, querying
`enrichment_status == 'pending'` (indexed), Firecrawl-extracting the JD, and
marking `completed`/`failed`. If your writer stamps `'pending'`, your jobs flow
through it hands-off. That's the entire digest wiring.

**But do NOT eagerly enrich all 100k** — Firecrawl has a per-run cap and real
cost. At crawl scale, enrich *by priority*, not by raw volume:

1. **Descriptions are already lazy.** The card fetches JD prose on demand
   (`GET /api/jobs/{id}/description`), so you don't need to pre-enrich text for
   jobs nobody opens.
2. **Prioritize the structured fields** (comp / arrangement / level / quals) for
   jobs that actually surface — recency-first is a fine proxy, or enrich a job
   the first time it enters any user's ranked deck. Everything else can wait.
3. **Cap per run, let the queue drain across cycles.** The cron model already
   does this; just feed it in priority order.

Until enrichment runs, cards render thin (title/company/location only) and the
comp/"landability" ranking signals sit neutral. Not a bug — just un-enriched.

---

## 3. Location: stop shipping Dubai/Malaysia to a USC student

**Done now:** the international blocklist (`NON_US_LOCATION_KEYWORDS`) was missing
Malaysia, Dubai, UAE, Abu Dhabi, Philippines, and dozens more. Expanded to cover
the major hubs. That plugs the immediate leak.

**The real fix (bigger, belongs with personalization):** a blocklist can never
keep up with a global crawl — every country we forget leaks. Flip to **positive
US-detection**: keep a job only if its location affirmatively reads US (a US
state name/abbrev, a known US city, "United States"/"USA", a US ZIP, or
"Remote — US"); treat unknown/foreign as non-US. Safer to tune against real data
than to enumerate the world.

**And make it preference-aware, not a hard global filter.** These international
jobs are valuable to (a) users who list an international city in their location
preferences, (b) users who opt into relocation/travel, (c) users who are simply
abroad. The filter should read the user's `preferredLocations` + a relocation
flag and *let those users through* to the matching geographies, while still
defaulting a US student to US-only. This is a ranking-layer decision, which is
the natural bridge to §4.

---

## 4. Personalization layer — where the app is ahead, and where to push

Today the ranker composes a few signals (`job_ranking.py:deterministic_score` +
a GPT rank on the shortlist): field/major alignment, preferred type, skills ∩
requirements, a soft geo signal from `preferredLocations`, saved-company and
saved-contact boosts. Good, but it under-uses what the user gives us.

**Maximize the inputs the user hands us:**
- **Resume** — already parsed (`resumeParsed`): skills, titles, seniority. Use it
  harder for level-matching (a rising junior ≠ new-grad ≠ intern) and for
  domain, not just keyword overlap.
- **LinkedIn** — enrich for current role/companies/trajectory; feeds "adjacent
  target companies" and seniority calibration.
- **Location preferences** — should be a *ranking* signal AND the gate for §3's
  preference-aware international, not just a soft nudge.
- **Free-text ("about you", goals, target roles/industries)** — the richest and
  most under-used signal. These are exactly what a GPT rank pass can read to
  understand intent that structured fields miss ("breaking into IB from a CS
  major," "want climate-tech," "open to relocation").

**Why the app is the reference implementation:** the app already runs the
per-user cached rerank, the pass-aware exclusion (dropped jobs never return), the
saved-company/contact boosts, and the whole-catalog candidate pool. The website's
serving/personalization is behind this — porting the app's model over is the
higher-leverage move than building a parallel one.

---

## 5. App ↔ website: they share one Firestore — use it as the bus

Same project (`offerloop-native`), same `jobs` collection, same `users/{uid}`
docs. So "talk to each other" is mostly *read the same fields*, not build a sync:

- **Crawl → both.** Your jobs land in `jobs`; both surfaces already read it.
  Canonical `company` + `search_terms` + `posted_at` are the contract — keep them
  100% (they are today).
- **Profile signals → both.** Resume, `preferredLocations`, `targetIndustries`
  (note: read `targetIndustries`, not `industries` — see the recent mobile fix),
  free-text — write once on the user doc, both surfaces rank against them.
- **Caveat (intentional):** the app is a different economic + workflow entity. It
  shouldn't absorb *everything* — payments/tier stay web-source-of-truth, and the
  app's job feed is its own boxed, ranked experience. "Talk to each other" means
  share the *data substrate* (jobs + profile), not merge the products.

---

## 6. How the app stays fast — techniques to port to the website

This is the part worth stealing. The app's feed open went from ~4.5s / 1.3MB to
fast/lean through a handful of moves, none exotic:

1. **Serve a page, not the pool.** Never return the whole ranked list — 300 max,
   ~60 per page, cursor-paginated (`?limit`/`?cursor`). The website tends to
   compute-and-return big result sets; page them instead.
2. **Slim the wire (`_slim_for_wire`).** 1.3MB → ~250KB by dropping the heavy
   `structured`/`description_raw` blob from every card past the first ~40, and
   dropping `search_terms` (no client reads it). Deep cards fill in on demand.
   **Lesson: only pay for what the user will actually see this scroll.**
3. **Lazy-load the expensive prose.** Descriptions are fetched per-card on demand,
   not shipped with the list. The website ships full JDs inline — don't.
4. **Cache the rank per user (~30 min) and rerank in the background.** The user
   gets the cached deck instantly; a `ThreadPoolExecutor` reranks off the request
   path (`_ranking_pool.submit(_background_rerank, uid)`) and swaps the cache in.
   No user ever waits on a rank.
5. **Parallelize the reads.** Prefetch dismissed-jobs + saved-companies + signals
   concurrently (`ThreadPoolExecutor(max_workers=3)`), and hydrate job batches in
   parallel chunks rather than a serial loop. Firestore latency is per-call, so
   fan out.
6. **Rank a shortlist, not the world.** GPT only scores a prefiltered shortlist;
   the cheap deterministic pass + Firestore filters do the culling first. Keep the
   expensive model off the hot path and off the long tail.
7. **Offload slow work to workers, not the web process.** Auto-apply and meeting
   prep run on the RQ worker (Redis-backed), with a *dedicated daemons service*
   for the background loops — so a 2-minute browser automation or a Firecrawl
   sweep never blocks a request and never dies on a web deploy. **At your scale,
   the crawl + enrich + expire sweeps belong on the same worker/daemon tier, not
   inline.**
8. **Cap candidate windows deliberately** (`_RERANK_CANDIDATE_LIMIT=20000`,
   `MAX_DISPLAY_TOP_JOBS=300`, filters cache TTL). Bounded work per request is
   what keeps p95 flat as the catalog grows from 34k to 100k+.

**Net translation for the website:** page + slim + lazy + cache + parallelize +
worker-offload. The catalog can 10× and a request stays O(page), not O(catalog).

---

## Status of the items in this doc
- ✅ International blocklist expanded (immediate Dubai/Malaysia fix) — shipped.
- ✅ Explore ratio 5% → 3% — shipped.
- ✅ Company Roles tab cursor-paginated "load more" (app) — shipped.
- ⏳ `enrichment_status='pending'` stamp on crawl writes — **Sid**.
- ⏳ Positive US-detection + preference-aware international — ranking layer.
- ⏳ Prioritized enrichment ordering at scale — **Sid** + pipeline.
- ⏳ Port the speed techniques (§6) to the website serving layer.
