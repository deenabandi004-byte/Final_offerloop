# Resume Page: Prompt-to-Edit Editor (default tab) + Tailor tab

Date: 2026-07-25. Approved by Nick in session.

## Goal

Bring the onboarding resume builder's "keep prompting to refine" experience into
the main Resume page (`/resume`). Two tabs:

1. **Edit resume** (default) — prompt box + edit history on the left, live
   resume preview on the right. Each prompt calls the resume-builder backend
   with the current resume and returns an updated resume + HTML preview.
   Buttons: Save (persists as the account resume: PDF to Storage +
   `resumeParsed` to Firestore) and Download PDF. If the user has no resume
   yet, the tab shows the onboarding sectioned inputs (Education, Experience,
   Projects, Leadership, Skills) and "Generate my resume".
2. **Tailor to a job** — the existing job-fit score/recommendation flow,
   unchanged, behind the second tab. Scout handoff (`?tab=tailor`) still
   selects it.

## Backend

- New endpoint `GET /api/resume-builder/current`: loads `users/{uid}.resumeParsed`,
  converts with `from_resume_parsed`, returns `{resume, html}`;
  `{resume: null}` when the user has no stored resume.
- `/api/resume-builder/generate` accepts `context: "editor"`. Editor calls are
  free and do NOT count against the lifetime onboarding cap
  (`resumeBuilderGenerations`, cap 10). Instead they get a daily cap of 30
  (`resumeEditorDate` + `resumeEditorCount` on the user doc, reset on date change).
- Save uses the existing `/api/resume-builder/finalize` (renders one-page PDF,
  uploads to Storage, saves parsed to Firestore).

## Frontend

- `ResumePage.tsx`: reintroduce a two-tab strip. Default tab `edit`; `?tab=tailor`
  and Scout prefill select `tailor`.
- New `src/components/resume/ResumeEditorTab.tsx`, modeled on
  `OnboardingBuilder.tsx` but styled with the app's Tailwind/shadcn conventions
  (no OB inline theme). Preview via backend-rendered HTML in a sandboxed iframe.
- Nothing is saved until the user hits Save; prompt experiments only touch the
  in-memory draft. After Save, ResumePage refreshes its shared `resumeData` so
  the Tailor tab sees the new resume.
- Delete the unreachable old Edit-tab render path (score-and-approve flow) per
  the in-file note from the 2026-07-10 redesign, keeping anything the Tailor
  tab still uses.

## Out of scope

- No credits charged anywhere on this page.
- No changes to the onboarding builder flow.
