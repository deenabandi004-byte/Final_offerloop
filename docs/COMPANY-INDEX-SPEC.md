# Company canonicalization + index — spec for Sid (Pieces 0 & 1)

> **⚠️ START WITH PIECE 0 — it unblocks everything.** `canonicalize_company()` is
> a verified passthrough, so company names are fragmented in the pool. That one
> bug is currently breaking, all at once: (1) the **company page** — `search?company=openai`
> returns 0 of OpenAI's 641 roles; (2) **Scout's inventory-grounded suggestions**
> (Piece 2, already shipped) — counts miss on name mismatches, so it can only
> rank, not filter; (3) the **companies index** (Piece 1) — it'd be built on
> fragmented keys. Fix the normalizer + backfill and all three become correct.
> The rest of this doc depends on it. Everything on the app side (endpoint + Scout
> ranking) is already live and waiting on this.

Goal: make company identity consistent and give both surfaces a fast
"what do we have for company X" lookup. Prereq for pool-aware Scout suggestions
(surface real firms + their open roles) and it also fixes the company-page
attachment gap. Measured against prod 2026-07-15 (129,554 jobs).

## Piece 0 — Fix canonicalize_company, then apply it at write (the blocker)

Company names are fragmented in the live pool:
```
Openai   310   OpenAI 331   openai 0     ← one firm, three keys
DoorDash   1   Doordashusa 271           ← "DoorDash" finds ~none
```
**Root cause (verified):** `canonicalize_company()` in `backend/pipeline/
normalizer.py` is effectively a **passthrough** — it does NOT merge variants:
```
canonicalize_company:  'openai'->'openai'  'OpenAI'->'OpenAI'  'Openai'->'Openai'
                       'DoorDash'->'DoorDash'  'Doordashusa'->'Doordashusa'
```
So applying it wouldn't merge anything, AND the search-by-company path (company
page) that relies on it is case-broken today — searching "openai" returns 0.
(My earlier "100% canonical" note was wrong: passthrough trivially matches itself.)

**Ask — two parts:**
1. **Make `canonicalize_company()` a real normalizer:** deterministic casefold to
   ONE canonical display form, strip legal/geo suffixes (Inc, LLC, Ltd, PBC, USA,
   Technologies…), collapse whitespace/punctuation, so `openai / OpenAI / Openai /
   Open AI` → one key and `DoorDash / Doordashusa` → one. (There's prior art to
   reuse: `normalize_company_for_identity` in pdl_client and `normalize_company`
   in models/users.py.)
2. **Apply it at write** in the direct-ATS writer (`sync_board_jobs`) AND
   `pipeline/writer.py` before `batch.set` — store canonical in `company`, keep
   raw in `company_raw` (already present) — then a **one-time backfill** to
   re-canonicalize existing docs.

**Acceptance:** distinct-company count drops materially; the variant groups above
each collapse to one; `search?company=openai` returns OpenAI's roles.

## Piece 1 — A `companies` index collection

One doc per canonical company, rebuilt from the pool. Scout/company pages read it
O(1) instead of scanning 129k live.

```
companies/{slug}          # slug = canonicalize(company), lowercased, spaces→"-"
  name:        "Stripe"    # canonical display name
  jobCount:    { tier1: 12, tier2: 40, tier3: 662, total: 714 }
  topTitles:   ["Software Engineer", "Product Manager", ...]  # top ~8 by frequency
  sector:      null        # reserved for Piece 3 (LLM sector tag) — leave null now
  updatedAt:   <ts>
```

**Build:** an aggregation pass over `jobs` grouping by canonical `company`,
counting per `relevance_tier` and collecting top titles. Runs as a step at the
end of a pipeline run, or a standalone cron (~hourly is plenty — counts don't
move fast). Whichever is easier on your side; the app only needs the collection
to exist and stay roughly fresh.

**Where the app reads it:** the mobile `/api/mobile/company-counts` endpoint
(shipping now) reads `companies/{slug}.jobCount` when present and falls back to a
live `count()` until the index lands — so the app works before and after Piece 1,
and gets faster/cheaper when it arrives.

## Not in this spec
Piece 3 (LLM `sector` tag → pool-derived "companies like X" / "fintech") is a
separate effort; the `sector` field is reserved above so the index doesn't need a
reshape later.
