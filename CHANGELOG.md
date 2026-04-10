# Changelog

All notable changes to Offerloop will be documented in this file.

## [0.1.1.0] - 2026-04-10

### Added
- "Find the Humans" button on each job board card that discovers the hiring team behind a job posting
- One-click flow: click the button, see 1-3 verified hiring contacts with evidence receipts and Gmail drafts
- FindHumansModal with stepped loading bar, per-candidate receipt cards using ContactCardBase primitives
- `derive_receipts()` engine producing title_match and location_match evidence with strength scoring
- `no_parse=true` flag to skip JD parser when structured job card data is already available
- `FEATURE_FIND_HUMANS` dual-layer feature flag (backend env var + frontend Vite flag, default OFF)
- Per-user hourly rate cap (20 requests/hour) using Firestore-backed cross-worker limiter
- Pro/Elite tier gate on Find the Humans endpoint (free users see upgrade toast)
- 11 backend integration tests including 2 regression tests ensuring existing recruiter-search-tab callers are unaffected

## [0.1.0.0] - 2026-04-08

### Added
- Warmth scoring engine that ranks contacts by relevance to the user (shared university, major, employer, hometown, career track, dream companies)
- Three email tone variants based on warmth tier: warm (conversational, shared connection lead), neutral (professional, industry interest), cold (concise, respect for time)
- Industry-specific vocabulary calibration for consulting, banking, and tech outreach
- Personalized subject lines generated per contact instead of one-size-fits-all
- Full PDL contact data (work history, education, skills) injected into email prompt context
- Onboarding profile data (goals, academics, career track) enriched into email generation
- `contact_analysis.py` module extracted from reply_generation.py to break circular import
- `score_contacts_for_email()` orchestration helper for consistent warmth scoring across all callers
- 22 new tests covering warmth scoring, contact analysis, and email personalization

### Fixed
- Tenure detection now returns structured dict with numeric `years` field (was returning unparseable string)
- Legacy `tier` field fallback in contact_import.py and scout_assistant.py (now reads `subscriptionTier` first)
- Email generation mock chain updated for Claude-first fallback pattern
- Pre-existing test failures in application_lab, exceptions, content_aggregator, fantasticjobs_fetcher

### Changed
- `batch_generate_emails` now accepts `warmth_data` parameter for per-contact tone selection
- Prompt explicitly bans forced "I came across your profile" opener pattern
- Email body limited to one question instead of forced two-question structure
