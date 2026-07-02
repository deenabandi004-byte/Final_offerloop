# Changelog

All notable changes to Offerloop will be documented in this file.

## [0.1.2.4] - 2026-07-01

### Added
- `profileConfirmedAt` field on user documents, stamped when the profile-confirm endpoint completes. Powers the trigger for two Phase 2 lifecycle campaigns: onboarding drop-off (fires if signup > 24h ago and this field is still null) and first-search activation (fires 48h after profile confirm if no first search yet). Pre-existing users leave the field null and are excluded from these campaigns via the per-campaign launch-date filter that will ship with each Phase 2 campaign.

## [0.1.2.3] - 2026-07-01

### Changed
- Lifecycle email copy and internal comments in `lifecycle_emails.py` no longer use em dashes. 32 occurrences swapped for commas, periods, colons, or parentheses depending on context. Matches Sid's founder voice rules. The two `— {SIGNATURE_NAME}` signature markers are preserved as email signoff convention.

## [0.1.2.2] - 2026-07-01

### Changed
- Lifecycle email CTA link now uses an explicit `color:#1F2937` instead of `color:inherit`. Gmail's viewer was overriding the inherit rule with its default anchor color (blue underlined), so the CTA still visually rendered as a marketing button. Explicit dark text sticks.

## [0.1.2.1] - 2026-07-01

### Changed
- Lifecycle email template now renders CTA links as plain inline text (color inherited from body prose, no bold weight) and drops the centered marketing container. Reduces Gmail Promotions-tab signal so lifecycle sends land closer to Primary. Applies to every campaign (pricing abandonment, checkout abandonment, trial ending, low credits, win-back).

## [0.1.2.0] - 2026-07-01

### Added
- Email lifecycle campaign system: `bandis@offerloop.ai` now sends pricing-page follow-ups, checkout abandonment, trial-ending nudges, low-credit alerts, and win-back mail via Resend, with HMAC-signed unsubscribe links and a CAN-SPAM postal-address footer
- Beehiiv newsletter integration: signup and profile-change events sync subscriber attributes (school, target industry, class year, tier) into the `Offerloop Recruiting Tips` audience; inbound unsubscribes from Beehiiv mirror back into user preferences
- Newsletter opt-in step in onboarding (default checked) so new signups auto-join the newsletter unless they decline
- Email preferences panel in Account Settings with per-channel toggles (product tips, recruiting playbook, weekly recap, activity digest)
- `lastLoginAt` field on user documents, stamped whenever an authenticated request lands after a 30-minute activity gap, which powers dormancy and streak logic in upcoming campaigns
- New backend services: `beehiiv_client.py`, `beehiiv_webhook.py`, `lifecycle_signals.py`
- Operational scripts: `audit_users_for_outreach.py` reports on user activity buckets, `backfill_lifecycle_fields.py` fills `signupAt`/`lastActiveAt`/`lastLoginAt`/`newsletterSubscribed` on pre-existing users
- Docs: `EMAIL_CAMPAIGN_SYSTEM_PLAN.md` (six-phase rollout plan) and `EMAIL_DELIVERABILITY_DNS_CHECKLIST.md` (SPF/DKIM/DMARC setup runbook)

### Changed
- Stripe webhook now syncs tier changes to the Beehiiv subscriber record on subscription create/update/cancel
- User document creation stamps `lastLoginAt` alongside `signupAt` and `lastActiveAt` on every new signup

## [0.1.1.1] - 2026-06-24

### Added
- PostHog analytics now route through the `data.offerloop.ai` reverse proxy so events keep firing for users on ad-blockers and DNS filters that block `posthog.com`
- `defaults: '2026-05-30'` flag on the PostHog init to opt into the latest defaults bundle
- `feature_action_completed` PostHog events for onboarding, email generation, and job board flows

### Changed
- Pricing page back button always lands on the dashboard (logged-in) or landing page (logged-out) instead of `history.back()` so a Stripe-cancel bounce never dumps users back on Stripe checkout

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
