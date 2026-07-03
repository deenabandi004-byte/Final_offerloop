# Changelog

All notable changes to Offerloop will be documented in this file.

## [0.1.9.0] - 2026-07-03

### Added
- Weekly win report lifecycle campaign (Plan #13, the highest-lift Phase 4 P1 campaign per `docs/EMAIL_CAMPAIGN_SYSTEM_PLAN.md`). Fires only on Sunday between UTC 18:00 and 22:00 (11am–3pm Pacific / 2pm–6pm Eastern), once per user per ISO week. Per-user recap uses three real numbers pulled from the contacts subcollection (contacts added, emails sent, replies received in the last 7 days) via the same aggregation pattern as `networking_roadmap.compute_weekly_progress`. Peer comparison line appears only when at least 5 eligible users exist, using the median across the eligible cohort (no small-sample skew). Next-week nudge is data-driven: chooses the CTA based on which stat is 0 (no contacts → run a search, contacts but no sends → send one email, sends but no replies → send more, replies → tend the pipeline). Skips users with zero total activity for the week (activation campaigns already cover that funnel stage). Gated by `WEEKLY_WIN_REPORT_LAUNCH_DATE = 2026-07-03` on `signupAt` so the ~270 backfilled users are excluded, plus a natural `profileConfirmedAt` filter and a "signed up 7+ days ago" gate. Wired into `process_all_pending_emails()`.

## [0.1.8.0] - 2026-07-02

### Added
- Three Phase 2 P1 lifecycle campaigns (per `docs/EMAIL_CAMPAIGN_SYSTEM_PLAN.md` §"Phase 4 — P1"):
  - **Coffee chat prep discovery (#10):** fires within 24h of `firstReplyReceivedAt` for free-tier users who haven't used Meeting Prep yet. Frames prep as "you got a reply, time to prep so you don't fumble the actual call."
  - **Job board discovery (#11):** fires 240-264h after `profileConfirmedAt` for users who haven't visited `/job-board` yet. Frames Job Board as "the other half of Offerloop" with hiring team contacts pre-attached to listings.
  - **Free ceiling (#12):** fires when free user has used 90%+ of monthly credits. Data-driven copy naming their actual used/total counts. Idempotency scoped per calendar month so a user can re-trigger next month.
- New `jobBoardVisitedAt` field on user documents, stamped on first `/job-board` mount. Powers the exclusion filter for Campaign #11.
- New `POST /api/lifecycle/job-board-view` endpoint (Firebase-auth'd, one-shot idempotent stamp).
- New `stamp_job_board_visited(uid)` helper in `lifecycle_signals.py`.
- Frontend hook in `JobBoardPage.redesign.tsx` fires the stamp endpoint once per component mount for signed-in users. Fire-and-forget.
- Three new `_LAUNCH_DATE` constants (COFFEE_CHAT_DISCOVERY, JOB_BOARD_DISCOVERY, FREE_CEILING = 2026-07-02) as safety filters. All 270 backfilled users are excluded because their `signupAt` predates the launch date.

## [0.1.7.0] - 2026-07-02

### Added
- Welcome + onboarding drip lifecycle campaign. Six emails from Deena over the first 30 days for every new signup. Day 0 (immediate): personal intro asking industry + school with a reply CTA. Day 1: activation nudge to Find. Day 3: industry-personalized cold-email pattern with a working template. Day 7: "5 things that separate students who land offers" playbook. Day 14: honest Pro vs Free read (skipped if user is already Pro/Elite). Day 30: month-1 recap with month-2 direction. Gated by `WELCOME_DRIP_LAUNCH_DATE = 2026-07-02` on `signupAt` so all ~270 backfilled users are excluded. Wired into `process_all_pending_emails()`. This is the last of the five P0 Phase 2 lifecycle campaigns per `docs/EMAIL_CAMPAIGN_SYSTEM_PLAN.md`.

## [0.1.6.0] - 2026-07-02

### Added
- First-send activation lifecycle campaign. Fires for users who ran a first search but haven't sent an email, addressing the "found the contact but afraid to hit send" freeze that stops most first-time cold outreach. Day 3 (72-96h after `firstSearchAt`): "the send is the whole game" with the shortest working template pattern spelled out. Day 7 (168-192h): "what's the block?" as a pure reply CTA (Deena asking what's holding them up). Gated by `FIRST_SEND_ACTIVATION_LAUNCH_DATE = 2026-07-01` on `signupAt`, plus the natural `firstSearchAt`-must-be-set filter, so backfilled users can't retro-enroll. Wired into `process_all_pending_emails()`.

## [0.1.5.0] - 2026-07-01

### Added
- First-search activation lifecycle campaign. Fires for users who confirmed their profile but haven't run a first search, personalizing the copy with `targetIndustries` and `targetCompanies` from onboarding. Day 2 (48-72h after `profileConfirmedAt`): "the one thing to do this week" with a CTA to `/find`. Day 5 (120-144h): "one specific thing to try" with a concrete query template built from the user's target industry and company. Gated by `FIRST_SEARCH_ACTIVATION_LAUNCH_DATE = 2026-07-01` on `signupAt` so backfilled users can't retro-enroll. Wired into `process_all_pending_emails()` and appears in the cron tick response as `first_search_activation`.

## [0.1.4.1] - 2026-07-01

### Changed
- Lifecycle sender identity switched from `bandis@offerloop.ai` to `sid@offerloop.ai` (mailbox was deleted from Workspace). Friendly-From stays as "Deena from Offerloop" (Deena is Sid's real name) to preserve the small amount of Gmail-side sender reputation earned from the first day of test sends. `LIFECYCLE_FROM_EMAIL` env var on Render must be updated to `Deena from Offerloop <sid@offerloop.ai>` for the switch to take effect in prod; code changes update the default and tests but env var wins.

## [0.1.4.0] - 2026-07-01

### Added
- Onboarding drop-off lifecycle campaign. Two emails from Deena to users who signed up but never completed the profile-confirm step: Day 1 "you're 60 seconds from being set up" (with a link back to onboarding) and Day 3 "anything i can help with?" (reply CTA, no button). Fires only for free-tier users who haven't confirmed. `ONBOARDING_DROPOFF_LAUNCH_DATE` in `backend/app/config.py` gates the campaign to users who signed up on or after 2026-07-01 so the ~270 backfilled users don't retro-enroll. New `_parse_ts_or_dt` helper in `lifecycle_emails.py` normalizes both ISO-string and native Firestore Timestamp values.

## [0.1.3.0] - 2026-07-01

### Added
- Rewired pricing abandonment lifecycle campaign. New `POST /api/lifecycle/pricing-view` endpoint (Firebase-auth'd) captures signed-in non-paying visitors as `pricing_abandon` leads when they land on `/pricing`, replacing the removed `PricingExitPopup` capture point. The existing Day 0 / Day 2 / Day 5 sequence in `lifecycle_emails.py` fires from these leads with no other changes. Backend skips users already on Pro or Elite. Frontend fires the capture once per component mount from `Pricing.tsx`. Anonymous visitors aren't captured (deferred design decision).

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
