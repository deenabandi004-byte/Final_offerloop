# Resume-First Onboarding — Design

**Date:** 2026-07-21
**Status:** Approved direction (Nick), spec pending review

## Summary

Replace the current 4-step onboarding (Profile → Resume & LinkedIn → How you found us → Plan) with:

1. **Intro slides** — 4 aesthetic click-through slides explaining what Offerloop does.
2. **One resume page** — "Add your resume or LinkedIn." The only data-collection step.

Everything the old flow collected is either parsed from the resume, pulled from the Google account, or dropped (with the Firestore write shape kept identical so the rest of the site functions unchanged).

Users without a resume get one built for them, free, in the Harvard one-page format:
- **LinkedIn URL only** → we generate a resume from their LinkedIn profile automatically.
- **Neither** → a "build my resume" page: empty Harvard outline + prompt box; they describe what they've done, we generate, they refine, they use it.

## What gets cut

- Profile-basics step (name/email/phone) — Google account + resume parse cover it.
- Manual academics form (`OnboardingManualEntry`).
- "How you found us" (`OnboardingIntent`) — `referralSource` simply won't be written; schema tolerates absence.
- Plan/trial step (`OnboardingTrial`) — trial pitch lives on /pricing only. `/api/users/start-trial` and checkout endpoints are untouched.
- The `eduEmail` add-a-.edu affordance (lived on the trial step). `isStudent` now derives only from the sign-up email ending in `.edu`.

## What stays identical

- The final Firestore write shape from `buildFinalData` (same keys: `profile`, `academics`, `university`, `userType`, `careerTrack*` empty shapes, `goals`, `onboarding.completedAt`, `isStudent`).
- `completeOnboarding()` contract, `onboarding_just_completed` sessionStorage flag, tour auto-start, `resolveDestination()` returnTo handling, sign-out-on-back-from-first-step behavior.
- Onboarding analytics events (`/api/users/onboarding-event`), with new step names: `slides`, `source`, `resume_builder`.
- `/api/parse-resume` and `/api/enrich-linkedin-onboarding` endpoints (reused as-is).

## Part 1: Intro slides

New component `OnboardingSlides.tsx` (in `src/pages/`, matching existing flat layout). Four full-bleed slides, then the resume page.

**Aesthetic:** brand blue surfaces, Lora serif headlines, Inter body, lucide line icons (no emoji), subtle fade/slide transition, progress dots bottom-center, "Skip" top-right always visible. Click anywhere (or arrow keys) to advance. Uses `onboardingTheme.ts` (`OB`) tokens.

**Copy (one headline + one sentence each):**

| # | Headline | Body | Icon |
|---|----------|------|------|
| 1 | Find the right people | Search 2.2B professionals — alumni from your school, people at your target firms. | Users/Search |
| 2 | Reach out like you mean it | AI-personalized emails from your actual background, drafted straight into Gmail. | Mail |
| 3 | Land the actual job | A job board matched to your resume — and auto-apply that submits applications for you. | Briefcase |
| 4 | Never drop a thread | Contacts, applications, and follow-ups tracked in one pipeline, with Scout nudging your next move. | KanbanSquare/Sparkles |

Each slide fires a `viewed` onboarding event (`slides_1`..`slides_4`); Skip fires `completed` with `skipped=true`.

## Part 2: The one resume page

Evolved from `OnboardingSource.tsx`. Headline: "First, let's get your story." Three affordances:

1. **Drop/upload resume** (PDF/DOCX/DOC) → `/api/parse-resume` → prefill via existing `resumePrefillFromParse` → complete onboarding immediately.
2. **LinkedIn URL field** → `/api/enrich-linkedin-onboarding` → prefill via `prefillFromLinkedin` → additionally kicks off resume generation (below) → complete onboarding.
3. **"No resume? We'll build you one." link** → resume builder page (Part 3).

**Completion logic (new `buildFinalData`):**
- `fullName`/`email`: resume parse → LinkedIn → Google account (`user.displayName` / `user.email`). Never empty because Google always has both.
- `phone`, `university`, `major`, `graduationYear`: parse/enrich results, empty string if missing (same tolerance as today's skip paths).
- `userType` is always `"student"` (the manual professional path is gone — historical default, same as today's resume path).
- After `completeOnboarding`, navigate to `resolveDestination()` (default `/home`).

Resume upload already saves file + text + parsed info to Storage/Firestore inside `/api/parse-resume` (authed call). Unchanged.

## Part 3: Resume generation (Harvard one-pager)

### Backend

New route file `backend/app/routes/resume_builder.py`, blueprint `resume_builder_bp` under `/api/resume-builder`, registered in `wsgi.py`.

Uses the existing canonical pipeline: LLM → `CanonicalResume` (contract in `services/resume_renderer/contract.py`) → `render_one_page()` → PDF bytes → upload via `upload_resume_to_firebase_storage`-equivalent → `save_resume_to_firebase(user_id, resume_text, resume_url, parsed_info, metadata)` so the rest of the app sees it exactly like an uploaded resume.

**Endpoints (all `@require_firebase_auth`):**

- `POST /api/resume-builder/from-linkedin` — body: `{ linkedinUrl }`. Server calls the LinkedIn enrichment internals (Apify profile data), maps to `CanonicalResume` via an LLM call using a tool schema (pattern copied from `resume_tailor.py`), renders, saves, returns `{ resumeUrl, parsed: {...} }`. Runs synchronously (single LLM call + render, ~10-20s) with a stepped loading state client-side.
- `POST /api/resume-builder/generate` — body: `{ prompt, previous: CanonicalResume | null }`. First call builds a `CanonicalResume` from the freeform description; subsequent calls refine `previous` per the new prompt. Returns `{ resume: CanonicalResume, html }` (HTML from `render_html` for live preview). Does NOT save.
- `POST /api/resume-builder/finalize` — body: `{ resume: CanonicalResume }`. Renders one-page PDF, uploads to Storage, saves to Firestore (text derived from the canonical fields), returns `{ resumeUrl, parsed }` in the same shape the parse route returns so the frontend reuses `resumePrefillFromParse`.

**Generation rules (system prompt):** Harvard one-page outline (the canonical template already encodes it): Education → Experience → Projects → Leadership → Skills. Never fabricate employers, schools, dates, or metrics the user didn't state; leave unknown fields empty rather than inventing. Bullets in accomplishment form (action verb + what + result).

**Abuse guard:** per-user counter `resumeBuilderGenerations` on the user doc; hard cap 10 lifetime generations via these endpoints (covers refinement iterations); 429-style JSON error past the cap. No credit deduction — this is free by design.

**LLM:** OpenAI primary with Claude fallback via the existing `openai_client.py` pattern (same as other services). Structured output enforced with a JSON/tool schema mirroring `_tool_input_schema()` in `resume_tailor.py`.

### Frontend

New step `builder` inside the onboarding flow (not a separate route — stays within `/onboarding` so guards/returnTo behave unchanged).

Layout: left = prompt box ("Tell us what you've done — school, jobs, clubs, projects. Plain words are fine.") with a running list of prior prompts; right = live Harvard outline. Before first generation the outline shows ghost placeholder sections (the "empty page"); after generation it shows the rendered HTML preview. Buttons: "Generate" / "Refine" (same box), "Use this resume" (calls finalize → completes onboarding), "Back".

The LinkedIn-only path shows a `SteppedLoadingBar` ("Reading your LinkedIn → Writing your resume → Formatting one page") and completes automatically; failure falls back to completing onboarding with the enrichment prefill alone (LinkedIn users are never blocked by generation failure — resume generation is best-effort on this path).

## Flow diagram

```
/onboarding
  └─ slides (1-4, skippable)
      └─ source page ("First, let's get your story")
           ├─ resume uploaded ──────────────► parse ► complete ► /home
           ├─ linkedin only ─► enrich ► generate resume (best-effort) ► complete ► /home
           └─ "build me one" ─► builder (prompt ⇄ preview loop)
                                  └─ "Use this resume" ► finalize ► complete ► /home
```

Back behavior: source→slides, builder→source, slides(first)→sign out (existing behavior).

## Error handling

- Parse failure: inline error on the source page, user can retry, switch to LinkedIn, or go to the builder.
- Enrichment failure (LinkedIn): toast + stay on page; user can still complete via upload or builder.
- Generation failure in builder: inline error, prompt preserved, retry allowed. The cap counts attempts, not successes (simpler and abuse-safe).
- Finalize failure: toast, resume stays in preview, retry.
- Onboarding write failure: existing toast + `submitting` reset (unchanged).

## Testing

Backend pytest (frontend has no test framework):
- `tests/test_resume_builder.py`: schema validation of `/generate` output mapping to `CanonicalResume`; finalize saves via mocked storage/Firestore and returns parse-shaped payload; generation cap returns error past 10; from-linkedin failure path returns clean error.
- LLM calls mocked (existing conftest patterns).

## Out of scope

- Post-onboarding resume editing UI (Account Settings already handles re-upload).
- Professional (non-student) onboarding variant.
- Referral-source analytics replacement.
- Any change to pricing/trial endpoints.
