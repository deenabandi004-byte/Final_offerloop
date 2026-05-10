# Recommender Engine — Implementation Status

Last updated: 2026-05-10

Plan file: `.claude/plans/jaunty-spinning-owl.md`

---

## Pre-Phase 0 — COMPLETE

All tracks shipped and smoke-tested on production.

### Track A: Goals Data Capture (Frontend)

**Commit `be65d32`** — Pre-Phase-0 Track A: re-add Goals step + legacy user banner

- **A1: Goals step re-added to onboarding (skippable)**
  - `OnboardingFlow.tsx` — added `"goals"` step between academics and location, wired `handleGoalsData` and `handleGoalsSkip`
  - `OnboardingGoals.tsx` — trimmed to 2 fields: `careerTrack` (select, 8 options) and `dreamCompanies` (tag input). Removed `personalNote`.
  - `OnboardingShell.tsx` — updated step count from 3 to 4
  - `OnboardingWelcome.tsx` — fixed stale copy ("3. Career" to "3. Goals")
  - Goals fields written as flat top-level keys on user doc (`careerTrack`, `dreamCompanies`), not nested under `goals.*`

- **A2: Find page banner for legacy users**
  - `GoalsPromptBanner.tsx` (new) — dismissible banner on Find page, shows when `!user.careerTrack && onboarding complete`, links to Account Settings, localStorage dismiss with 7-day re-show
  - `FindPage.tsx` — renders `GoalsPromptBanner` after `<AppHeader>`

### dreamCompanies Bug Fix

**Commit `fa50157`** — fix: flush pending dreamCompanies input on Goals submit

- `OnboardingGoals.tsx` — flushes any text in `companyInput` into `dreamCompanies` array at submit time, so typing a company and clicking Continue without pressing Enter no longer loses the entry

### Track B: Cooldown Writes (Backend)

**Commit `9029530`** — feat: add global contact cooldown tracking (Track B)

- `cooldown_service.py` (new) — `record_outreach(email, uid)` and `get_outreach_count(email)`. Uses `global_contact_outreach/{contact_email}` Firestore collection with 30-day rolling window, pruned on read and write. Fire-and-forget.
- `gmail_webhook.py` — hooked `record_outreach(to_email, uid)` into send detection path, right after existing `email_actually_sent` metric event

**Schema note:** The plan specified `outreach_user_ids_30d` (flat array of UIDs). The implementation uses `outreach_entries` (array of `{uid, ts}` objects) instead. This is an intentional improvement — preserving per-send timestamps enables time-decay weighting in the Phase 2 heuristic scorer and makes debugging easier. `outreach_count_30d` remains as a denormalized count for fast reads at scoring time.

---

## Stashed

- **AgentSetupInline styling changes** — pre-existing work, unrelated to recommender. Recover via `git stash list` then `git stash pop` or `git stash apply`.

---

## Observations for Phase 1

These were discovered during Pre-Phase-0 implementation and should be addressed when building `feature_service.py`:

1. **Empty `interests`/`careerInterests` arrays** — collected during onboarding Location step but never consumed by any backend service. Plan says wire them into `target_industries`/`target_functions` features.
2. **`linkedinResumeParsed` vs `resumeParsed` precedence** — both may exist on user docs from different enrichment paths. `feature_service.py` needs a clear precedence rule when extracting user features.
3. **Conditional spread `?.length` pattern** — `OnboardingFlow.tsx:174` silently drops empty arrays (e.g. `dreamCompanies: []` becomes absent from the Firestore write). Not a bug now (the flush fix ensures the array is non-empty when companies are entered), but fragile. Revisit if more array fields are added to the onboarding write.

---

## Next Up

### Track C: Event Logger + Request Context Middleware (Backend)

- `recommendation_events.py` (new) — `log_recommendation_event()` writing to Firestore `recommendation_events` collection with full 18-field schema
- `request_context.py` (new) — Flask `@app.before_request` middleware generating `request_id` (UUID) and reading `session_id` from `X-Session-Id` header
- `wsgi.py` — register request_context middleware
- `runs.py` — instrument contact search results as `recommendation_shown` events
- `gmail_webhook.py` — route send/reply detection to also write recommendation events
- `api.ts` (frontend) — generate `session_id` on app mount, send as `X-Session-Id` header

### Track A Bonus: Onboarding Analytics

- Add `onboarding_step_completed` and `onboarding_step_viewed` to `metrics_events.py` valid event types
- New endpoint or hook in `users.py` to accept `{ step, skipped }` from frontend
- Frontend onboarding step components call the step-event endpoint on mount and advancement

### Remaining Phases

- Phase 1: Feature Computation + Embedding Cache (Weeks 2-4)
- Phase 2: Heuristic Baseline (Weeks 4-6)
- Phase 3: Data Accumulation + Dashboard (Weeks 6-8)
- Phase 4: Learned Model (Weeks 8-11)
- Phase 5: Automation (Weeks 11-12)

---

## Protocol

- Every commit must be followed by `git push origin main`.
- Every smoke test must target production (`offerloop.ai`), not localhost.
- Render auto-deploys on push to main (2-5 min).
