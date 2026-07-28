# JIT Cache — Plan for Cutting PDL Spend

**Status:** Phase 1 shipped (schema + Firestore indexes), Phase 2 (writer) next.
**Estimated impact:** 20–40% reduction in PDL contact-search spend within 6 months (~$1.1–2.3k/yr saved).
**Cost to build:** ~1.5 days of engineering, $0 in new API spend, ~$0/mo recurring.

---

## TL;DR

We're adding a **person-level cache** to the contact-search pipeline. Every time PDL returns a contact for someone's search, we quietly save that person to a new Firestore collection. On the next search, we check the cache *first* — if the person is already there, we skip PDL entirely and save the credit.

The cache **populates itself as a side effect** of searches we're already paying for ("just-in-time"). No new scraping, no new API integration, no upfront cost. It gets more valuable over time as more searches accumulate.

---

## The problem

**PDL contact search is our largest single API cost.** From 30 days of real metering data (`provider_calls` collection):

| Provider | Calls (30d) | Cost (30d) |
|---|---|---|
| **PDL** | **1,451** | **$476** |
| OpenAI | 21,215 | $2.11 |
| Apify | 548 | $2.15 |
| Anthropic | 263 | $3.77 |
| NeverBounce | 113 | $0.56 |

**98% of PDL cost is on `person_search`** — the endpoint that runs when a user searches for contacts. Extrapolated, that's ~$5.7k/yr today, and it scales linearly with active users. When MBB recruiting season hits and students start hammering the app, this line item grows fast.

### What we already do to control cost

We have a **query-level cache** at `pdl_search_cache` (`backend/app/services/pdl_cache.py`). If two students run the *identical* search — same company, same school, same title, same location — the second one gets served from the cache for free.

**The problem:** it only hits on *exact* query matches. As soon as one variable changes, cache miss:

```
Student A: "Bain associates in LA"                     → CACHE MISS, 8 credits
Student A: "Bain associates in LA"           (repeat)  → cache hit, 0 credits ✅
Student B: "Bain associates in LA + USC alumni"        → CACHE MISS ❌ (different query)
Student B: "Bain associates in NYC"                    → CACHE MISS ❌ (different location)
Student C: "Bain consultants in LA"                    → CACHE MISS ❌ (different title)
```

So the query cache helps for repeat traffic but does nothing for the long tail of query permutations. Which is where most of our spend actually goes.

---

## The solution: JIT (Just-In-Time) person cache

Add a **second cache layer** that keys on the *person*, not the query.

### How it works

Every time PDL returns contacts, we do two things:

1. **Return them to the user** (current behavior, unchanged)
2. **Also write them to a new `firm_employees` collection**, keyed by their LinkedIn slug, with structured fields (company, schools, title level, join year, city/state)

On the *next* search, we check `firm_employees` **first**:
- If we find enough matches to fill the user's tier limit → **skip PDL entirely** (0 credits)
- If we find some but not enough → get the rest from PDL, dedupe

### Concrete example — the same scenario, with JIT

```
Student A: "Bain associates in LA"
  → PDL, 8 credits, returns 8 people
  → SIDE EFFECT: writes 8 people to firm_employees (free write)

Student B: "Bain associates in LA + USC alumni"
  → Check firm_employees WHERE company=bain AND schools contains 'usc' AND office=LA
  → Find 2 of Student A's cached people who happen to be USC alumni
  → Only ask PDL for 6 more → 6 credits (was 8)  → writes 6 more people to cache

Student C: "Bain consultants in LA"
  → Check firm_employees WHERE company=bain AND title_level=consultant AND office=LA
  → Find 3 of Student A's people cached last week
  → Only ask PDL for 5 more → 5 credits
```

Every person we cache can serve *many* future queries — different school filters, different title filters, different tenure filters, all against the same person.

### Why "just-in-time"

The cache **populates as a side effect** of the searches we're already paying PDL for. There's no separate scraping job, no upfront spend, no dedicated infrastructure to load data. It warms itself organically against the queries our users actually make.

---

## Why not just scrape everyone from LinkedIn?

We considered this. Original plan was to **pre-scrape** MBB firms (McKinsey, BCG, Bain) from LinkedIn via Apify HarvestAPI, so day-1 MBB users would hit a fully warm cache. After honest cost analysis, we dropped it for MVP:

| | Pre-scrape (MBB only) | JIT (all firms) |
|---|---|---|
| Upfront cost | $170–230 backfill | $0 |
| Recurring cost | $170–230 per refresh (need semi-annual = $340–460/yr, or quarterly = $680–920/yr) | $0 |
| Coverage on day 1 | ~100% for MBB, 0% for everything else | 0% for everything, grows fast |
| Coverage after 60 days | ~100% for MBB, 0% for everything else | Estimated 25–50% overall (grows with traffic) |
| Legal risk (persisting scraped data) | Moderate — we own the DB | None new — same PDL data we already retrieve |
| Complexity | Apify actor + cron + cost governor + backfill run | Passive listener, ~50 lines of code |

**Verdict:** JIT is strictly cheaper, universal, and lower-risk. Pre-scrape is *only* better if we know a specific firm will get hammered before JIT warms up. We can revisit MBB pre-scrape at day 60 if the data supports it (see "Revisit criteria" below).

---

## What we're building

### Read/write flow after JIT

```
User submits search
  │
  ▼
1. Check pdl_search_cache  (query-hash lookup)
   → hit? return cached results, 0 credits
   │
   ▼ miss
2. Check firm_employees    (person-level indexed query)  ← NEW
   → returns ≥ tier limit? serve from cache, 0 credits
   → returns some but not enough? get the rest from PDL, merge
   │
   ▼ nothing cached
3. Call PDL person_search  (N credits)
   → SIDE EFFECT: write returned people to firm_employees  ← NEW
   → return results to user
```

### Firestore schema — `firm_employees/{linkedin_slug}`

One document per LinkedIn profile. Never contains email addresses — those still come from Hunter/PDL at outreach time.

```
linkedin_id       "sarah-chen"                      (doc ID)
linkedin_url      "https://www.linkedin.com/in/sarah-chen"
name              "Sarah Chen"
headline          "Senior Associate Consultant"
title_level       "consultant"                       (indexed filter)
company           "bain"                             (indexed filter)
company_display   "Bain & Company"
schools           ["usc"]                            (indexed array-contains)
schools_display   ["University of Southern California"]
joined_year       2023                               (indexed filter)
office_location   "los_angeles_ca"                   (indexed filter)
country_code      "US"                               (only US docs are written)
last_seen_at      <timestamp>
```

Composite indexes deployed for the common query shapes: `(company, schools)`, `(company, title_level)`, `(company, joined_year)`, `(company, office_location)`, `(schools, title_level)`.

**Access control:** `firm_employees` is server-only in `firestore.rules`. Clients can never read it directly — otherwise a user could enumerate every LinkedIn profile ever cached from anyone's search, bypassing tier limits.

### Code changes (small)

| File | Change |
|---|---|
| `backend/app/services/firm_cache/schema.py` | ✅ Shipped Phase 1 — normalizes PDL raw person → Firestore doc, handles URL canonicalization + company/school slugging (with alias table so "USC" and "University of Southern California" collide correctly), title-level bucketing, US-only filter |
| `backend/app/services/firm_cache/writer.py` | 📋 Phase 2 — batch upsert function called from `pdl_client.search_contacts_from_prompt` after PDL returns |
| `backend/app/services/firm_cache/reader.py` | 📋 Phase 3 — `search_firm_cache(parsed, max_contacts, exclude_keys)` — indexed Firestore queries only, drop-in replacement for `pdl_client.search()` |
| `backend/app/routes/runs.py` | 📋 Phase 3 — wire reader into `prompt_search` as the second cache layer |
| `firestore.indexes.json` | ✅ Shipped Phase 1 — 5 new composite indexes |
| `firestore.rules` | ✅ Shipped Phase 1 — deny all client access to `firm_employees` |

### Feature flags (safe rollout)

Two independent flags so we can turn either half on/off without redeploying:

- `ENABLE_FIRM_CACHE_WRITE` — populate the cache from PDL results. Turn this on first, let it accumulate for 2 weeks. No user-visible change.
- `ENABLE_FIRM_CACHE_LOOKUP` — actually serve from the cache. Turn on for Sid only, then 10% of users, then 100%.

If anything goes sideways (bad data, wrong dedup, stale hits) — flip the reader flag off. Writes keep going in the background, no data loss.

---

## Rollout plan

| Phase | What | Time | Ships |
|---|---|---|---|
| **Phase 1** ✅ | Schema + Firestore indexes + rules | Done | Ready for `firebase deploy --only firestore:indexes,firestore:rules` |
| **Phase 2** | JIT writer + hook into PDL client | ~2 hrs | PR |
| **Phase 3** | Reader + wire into runs.py | ~3 hrs | PR |
| **Phase 4** | Observability (cache hit rate, $ saved to `_meta/firm_cache_stats`) | ~2 hrs | PR |
| **Phase 5** | Staged rollout: write flag → 2 weeks accumulation → reader for Sid → 10% → 100% | passive | flags only |

**Success threshold:** overall cache hit rate > 25% within 30 days of full rollout. That would put us at ~$120/mo saved on current traffic, more as students ramp.

---

## Revisit criteria (day 60)

After 60 days of live traffic we'll have real numbers on:
- Overall JIT hit rate
- Per-firm hit rate (MBB specifically)
- Which query dimensions drive the most cache misses

**If MBB-specific hit rate > 50% AND MBB queries make up > 20% of company-scoped traffic** → greenlight MBB pre-scrape as a follow-up (~$200 one-time + ~$350/yr recurring). The infrastructure is already built by then — pre-scrape is just a `refresh_firm_cache.py` script + a GitHub Actions cron, ~4 hours of work.

If neither trigger fires, we stay on JIT-only and the deferred scrape spend stays deferred.

---

## Risks + open questions

**1. Dedup quality on company + school names.**
PDL returns "Bain & Company", "Bain & Co.", "Bain and Company" for the same firm — we normalize all three to `bain`. Same for schools: "University of Southern California" and "USC" both slug to `usc`. We built an alias table for the ~30 schools our target users attend. **Risk:** unknown schools/firms not in the alias table won't collide across variants. **Mitigation:** observability dashboard will surface these; we extend the table as misses accumulate.

**2. Staleness.**
Cached people might change jobs, get promoted, or leave. We're not currently invalidating old entries. **Mitigation:** the `last_seen_at` field tracks recency; we can add a TTL rule if hit-quality regressions appear (e.g., "if last_seen_at > 90 days, treat as expired"). Not building this in Phase 1 — measure first.

**3. PII / legal.**
No new surface area. We're only caching fields we already retrieve from PDL and show to users. Emails still come from Hunter/PDL at outreach time — never cached. If we ever go international, we'll need GDPR delete-request tooling before turning on non-US caching — that's why the current schema hard-drops non-US profiles.

**4. Result quality.**
A cached PDL result from 3 months ago is not the same as a fresh one. Person could have left the company. **Mitigation:** we double-check the `company` field on read and drop stale hits. Also: rollout is staged and cache hit rate is tracked with side-by-side result-quality sampling.

---

## What I need from you

- **Sanity-check the cost math** — my $476/mo PDL figure is from the last 30 days of `provider_calls` data. That was largely test traffic. If you have a different intuition about steady-state PDL burn once real student volume hits, let me know so I can rerun the ROI math.
- **Weigh in on the day-60 pre-scrape trigger** — I proposed >50% MBB hit rate + >20% MBB query share as the greenlight. Adjust if you think we should be more/less aggressive about pre-scrape.
- **Feedback on the two-flag rollout** — write flag on for 2 weeks before reader flag flips. That's conservative to make sure the cache doesn't get polluted before it starts serving. Comfortable with that pace, or want faster?

---

## Appendix — related infrastructure

- **`provider_calls`** — Firestore collection where every external API call is metered with cost, user, latency. Powers the audit scripts (`backend/scripts/audit_pdl_spend.py`) and will power the JIT hit-rate dashboard.
- **`pdl_search_cache`** — the existing query-level cache. JIT complements this; both stay in the pipeline.
- **`backend/scripts/audit_pdl_search_cache.py`** — one-off analysis script that reads `pdl_search_cache` and reports top-searched companies. Read-only, run anytime.
- **HarvestAPI actor** (`harvestapi/linkedin-company-employees`) — the LinkedIn employee scraper we validated for the (deferred) pre-scrape path. $8/1k profiles in Full mode, returns education + tenure + location. Ready to plug in when/if pre-scrape gets greenlit.
