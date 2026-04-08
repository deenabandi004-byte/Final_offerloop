# Changelog

All notable changes to Offerloop will be documented in this file.

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
