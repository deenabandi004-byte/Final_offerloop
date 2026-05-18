# Tomorrow's job-board TODOs

## ✅ Resolved tonight (after the original list was written)

- **GitHub Actions free-tier overrun** → commit `d46a409` (`15 * * * *`, fits free tier)
- **titleEmbedding bloats every jobs query** → commit `9c73a2f` + migration (388 embeddings moved to `job_embeddings/{job_id}` collection)
- **Backfill scan transfers ~166MB** → resolved by the embedding refactor (jobs docs are now small again; `_collect_backfill` is still useful for future legacy scans, no longer expensive)
- **Firestore security rules** → commit `6dbc2ac` (added `resumeEmbedding`, `resumeEmbeddingHash`, `credits`, `lastCreditReset`, usage counters, `jobFeedCache` to the blocklist; deployed via `firebase deploy --only firestore:rules`)
- **Sequential gate counts mislead the SPA banner** → commit `6dbc2ac` (independent per-gate evaluation + new `dropped` field for the headline count)

## 🔜 Still open

### Dream company adoption (~3.3% real)

Onboarding asks for dreamCompanies but ~92% of users skip. Adding a typeahead
input wired to `companies.ts` would likely 5-10× adoption. ~30-45 min of UX work.

**Files**:
- `connect-grow-hire/src/pages/OnboardingGoals.tsx` (lines 182-209: free-text Input + helper text "Press Enter or comma after each company")
- `connect-grow-hire/src/data/companies.ts` (if exists per CLAUDE.md's mention of 8 static data files)

**Value**: deterministic ranker already gives `+15` score for dream-company matches; higher adoption immediately improves feed quality even without Phase 3.

### Phase 3 (Perplexity dream-company spotlight) — DEFERRED

The probe showed Perplexity returns "no results" / vendor jobs for
company-specific queries. Don't build until:
1. Perplexity quality improves for company-specific search, OR
2. dreamCompanies adoption is high enough that a polished fallback experience
   (e.g., "We hunted for X jobs at Stripe today — none found") is worth it

### Phase 7 WIP still unstaged in working tree

Files modified but not committed in any session (need attention or stash):
- `backend/app/routes/job_board.py`
- `backend/app/services/coffee_chat.py`
- `backend/app/services/scout_service.py`
- `backend/app/utils/linkedin_enrichment.py`

These predate tonight's session — leftover from an earlier Phase 7 migration
attempt. Decide: commit, stash, or discard.

### Smaller items

- `_serialize_jobs:157` still has `doc.pop("titleEmbedding", None)` — harmless
  but dead code now that embeddings live in a separate collection. Drop on the
  next pass.
- Backwards-compat legacy-emb code in `get_job_embeddings` can be removed in
  ~1 week once we're confident no doc still has `titleEmbedding` (sample of
  2000 currently shows 0).
