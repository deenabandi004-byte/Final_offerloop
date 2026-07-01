# Email Campaign System — Comprehensive Plan

Owner: Deena (marketing + eng) with Nick / Sid / Rylan sign-off
Sender: `bandis@offerloop.ai` (signed "Deena")
Draft: 2026-07-01
Status: Proposed — needs founder sign-off before Phase 1 starts

---

## TL;DR

You already have most of what you need. Don't add Loops.so or Customer.io. Use the two tools already in the stack:

1. **Beehiiv** → weekly/bi-weekly newsletter (already have subscription, popup live at `BeehiivPopup.tsx`, form ID `e92d2565-d9af-4a75-bc9f-fcf4d0c6e952`).
2. **Resend + `lifecycle_emails.py`** → every behavioral / drop-off / activation / retention / upgrade / win-back email. This infrastructure is already live in prod with idempotency, rate limits, HMAC unsubscribe, and Resend webhook bounce handling.

What's missing is the *campaigns themselves* — not the plumbing. This plan is 80% content strategy + event wiring, 20% code.

**Recommended stack cost at current scale:** Beehiiv Growth (~$49/mo) + existing Resend usage (~$10-20/mo). Total ~$60-70/mo. Adding Loops.so or Customer.io would be $50-150/mo extra with no capability gained.

---

## What already exists (audit results)

### Live outbound email systems

| System | Sender | Purpose | File | State |
|---|---|---|---|---|
| System A — Agent daily digest | User's own Gmail (OAuth) | Loop agent daily activity summary | `backend/app/services/agent_service.py` + `wsgi.py:_agent_digest_loop` | Live, opt-out via `digestEnabled` |
| System B — Lifecycle emails | Resend, from Rylan @ Offerloop | 5 behavioral sequences | `backend/app/services/lifecycle_emails.py` | Live, 5 sequences deployed |
| System C — Loop alert emails | Resend | Outbox reply notifications | `backend/app/services/loop_notifications.py` | Live, webhook bounce/complaint handling |
| Beehiiv popup | Beehiiv iframe | Newsletter signup | `connect-grow-hire/src/components/BeehiivPopup.tsx` | Live on landing/blog only |

### Live lifecycle sequences in `lifecycle_emails.py`

1. **Pricing abandonment** (anonymous) — Day 0 / Day 2 / Day 5 from `lifecycle_leads` collection. Currently dormant (PricingExitPopup was removed).
2. **Checkout abandonment** (signed-in) — Hour 1 / Day 1 when `checkoutAbandonedAt` set.
3. **Trial ending** — 48h / 24h / at-expiry.
4. **Low credits** — Real-time from auth deduct path.
5. **Win-back** — 30 days post-cancel from `canceledAt`.

### Existing infrastructure to reuse

- **Idempotency**: `lifecycle_email_log` Firestore collection, composite key `{recipient_id}:{campaign}:{step}` → same send never fires twice.
- **Rate limit**: `MAX_LIFECYCLE_EMAILS_PER_7_DAYS = 2` per user. Not per campaign — global.
- **Unsubscribe**: HMAC-signed tokens, `/api/lifecycle/unsubscribe` endpoint, List-Unsubscribe header set by Resend adapter.
- **Bounce/complaint**: Resend webhook → `disable_for_bounce()` / `disable_for_complaint()`. Suppression list already global + per-user.
- **Cron**: `/api/lifecycle/tick` secret-guarded by `LIFECYCLE_CRON_SECRET`, runs time-based scans.
- **Attribution**: PostHog events `lifecycle_email_clicked`, `winback_clicked` already fire.
- **Voice preset**: `LIFECYCLE_SIGNATURE_NAME=Deena` — every campaign signed as a real founder, not a brand. Sender: `bandis@offerloop.ai`.

### Event streams we can trigger on

Available in Firestore today:

| Collection | What's in it | Useful for |
|---|---|---|
| `users/{uid}` | tier, credits, trialActive, canceledAt, checkoutAbandonedAt, school, subscriptionTier | segmentation, gating |
| `users/{uid}/events/*` (90d TTL) | EMAIL_SENT, CONTACT_ADDED, SEARCH_EXECUTED, PROFILE_CONFIRMED, PAGE_VIEW, RECOMMENDATION_CLICKED, COFFEE_CHAT_SCHEDULED | activation triggers |
| `metrics_events` (90d TTL) | onboarding_step_viewed/completed, search_performed, email_generated, email_actually_sent, briefing_viewed, reply_received | funnel + activation |
| `users/{uid}/agent_cycles` | loop runs, contacts found, emails drafted | agent-owner engagement |
| `users/{uid}/searchHistory` | past searches | interest signals |
| PostHog | pricing_page_exit, upgrade_clicked, checkout_completed, slider_dragged, feature_action_completed | intent signals |

---

## The three problems this system solves

1. **Newsletter** — stay in touch with users + leads on a regular cadence with genuinely useful content
2. **Drop-off recovery** — win back people who bounced (didn't finish signup, didn't pay, didn't return)
3. **Activation + retention** — nudge users through the aha-moment features and reward paid users for staying

---

## Track 1 — Newsletter (Beehiiv)

### Cadence

- **In-recruiting-season (Aug–Nov, Jan–Mar)**: 2× per week (Tue + Thu)
- **Off-season (Apr–Jul, Dec)**: 1× per week (Tue)

### Segments (Beehiiv custom fields)

- `school` — USC, UCLA, Michigan, NYU, Georgetown, UPenn, other
- `target_industry` — consulting, banking, tech, other, undecided
- `class_year` — 2026, 2027, 2028, 2029, grad
- `tier` — free, pro, elite, non-user (lead only)

Start with `target_industry` as the only segmentation dimension. Layer on `school` once you have >500 subs per school.

### Content mix per send

Fixed structure (Morning Brew / Handshake pattern):

| Section | Length | Example |
|---|---|---|
| **1. Hook** | 1 line | "Bulge brackets opened summer 2027 applications this week." |
| **2. What's happening in [industry] this week** | 3 bullets | Deadlines, hires, news |
| **3. Playbook of the week** | 100 words | "The cold email pattern that gets 40% reply rates at MBB" |
| **4. 3–5 hand-picked roles** | 5 items | Curated by industry (link into Offerloop job board) |
| **5. Product corner** | 40 words | 1 feature spotlight w/ screenshot (link into product) |
| **6. Referral CTA** | 1 line | "Forward to a friend recruiting for [industry]" (Beehiiv referral tracking) |

### Growth mechanics

- **Beehiiv referrals** — reward tiers: 3 refs = Elite 1 month free, 10 refs = Elite 3 months free, 25 refs = "Rylan will look at your resume."
- **Boost network** — enable Boost for reciprocal cross-promotion with other student-focused newsletters
- **Signup surfaces** to add:
  - Onboarding step 6 (optional): "Get the recruiting newsletter"
  - Account settings toggle
  - Post-signup toast: "Newsletter opt-in — smart students already read it"
  - Blog post footer opt-in
  - Sidebar dropdown link in AppSidebar

### Beehiiv ↔ Firestore sync

The current popup writes to Beehiiv only. Add:

1. **Signup → Beehiiv**: On user signup (or newsletter opt-in during onboarding), backend calls Beehiiv API to add subscriber with custom fields (`school`, `target_industry`, `class_year`, `tier`).
2. **Tier change → Beehiiv**: On Stripe subscription webhook, update Beehiiv custom field so paid users get a different segment.
3. **Unsubscribe → Firestore**: Beehiiv webhook back into `/api/beehiiv/webhook` (new) → mark `users/{uid}.newsletterSubscribed = false`.

Effort: ~1 day. New file: `backend/app/services/beehiiv_client.py`. Env vars: `BEEHIIV_API_KEY`, `BEEHIIV_PUBLICATION_ID`.

---

## Track 2 — Lifecycle campaigns (Resend)

### Design principle

Every new campaign must:
- Have exactly one trigger event
- Be idempotent via `lifecycle_email_log`
- Fit the founder-direct voice (Rylan, plain English, no fake stats)
- Include a functional unsubscribe link
- Log a PostHog event on click

### The campaign map

Current sequences plus what to build. Priority ordering = ship order.

| # | Campaign | Trigger | Steps | Priority | Effort |
|---|---|---|---|---|---|
| 1 | **Welcome + onboarding drip** | signup | Day 0, 1, 3, 7, 14, 30 | P0 | 3d |
| 2 | Pricing abandonment | anonymous popup capture | Day 0, 2, 5 | P0 (rewire) | 1d |
| 3 | Checkout abandonment | `checkoutAbandonedAt` set | Hour 1, Day 1 | Live | — |
| 4 | Trial ending | trial < 48h | 48h, 24h, expiry | Live | — |
| 5 | Low credits | credits < 20% real-time | 1 email | Live | — |
| 6 | Win-back (30d post-cancel) | `canceledAt` + 30d | 1 email | Live | — |
| 7 | **Onboarding drop-off** | signed up but no `PROFILE_CONFIRMED` in 24h | Day 1, 3 | P0 | 2d |
| 8 | **First-search activation** | `PROFILE_CONFIRMED` but no `SEARCH_EXECUTED` in 48h | Day 2, 5 | P0 | 2d |
| 9 | **First-send activation** | `SEARCH_EXECUTED` but no `EMAIL_SENT` in 3d | Day 3, 7 | P0 | 2d |
| 10 | **Feature discovery — coffee chat prep** | Sent 5+ emails but never `COFFEE_CHAT_SCHEDULED` in 7d | Day 7 | P1 | 1d |
| 11 | **Feature discovery — job board** | 3 searches without job board visit in 5d | Day 5 | P1 | 1d |
| 12 | **Free tier hit ceiling** | credits used > 90% before month end | Real-time | P1 | 1d |
| 13 | **Weekly win report (all users)** | Sun 6pm local | Every Sun | P1 | 3d |
| 14 | **Dormancy nudge — 14d** | no login 14d | Day 14 | P2 | 1d |
| 15 | **Dormancy nudge — 30d** | no login 30d | Day 30 | P2 | 1d |
| 16 | **Semester-reset (60d dormant)** | no login 60d | Day 60 | P2 | 1d |
| 17 | **Pro retention — monthly recap** | tier=pro, monthly | 1st of month | P1 | 2d |
| 18 | **Pro → Elite upgrade nudge** | Pro user hits 2500+ credits used in month | Real-time | P2 | 1d |
| 19 | **Referral loop — 3 replies milestone** | 3 `reply_received` in 30d | 1 email | P2 | 1d |
| 20 | **Renewal reminder** | subscription renewal in 3d | Day -3 | P1 | 1d |

Total new campaigns to build: 14. Total effort: ~22 dev days across 3 phases.

### Detailed specs for the P0 campaigns

#### 1. Welcome + onboarding drip

**Trigger**: Firebase Auth signup (fires via existing signup handler).

**Steps** (all from Deena):

- **Day 0 (immediate, plain text)**
  Subject: *"You just signed up — can I ask you something?"*
  Body: 3 lines. "I'm Deena, one of the founders. What industry are you recruiting for, and what school? Reply and I'll send back a personalized plan for the next 30 days."
  CTA: reply

- **Day 1 (HTML, activation)**
  Subject: *"Your recruiting dashboard is ready"*
  Body: 1 screenshot of Find tab, 1 CTA "Run your first search — takes 30 seconds"
  CTA: /find

- **Day 3 (plain text, playbook)**
  Subject: *"The cold email pattern that works at [industry inferred from onboarding]"*
  Body: 3 short paragraphs. 1 concrete example from real Offerloop data (anonymized). 1 CTA to Send an email in-product. Signed Deena.

- **Day 7 (HTML, peer comparison)**
  Subject: *"How you're doing vs. other [school] students this week"*
  Body: Their stats vs anonymized peer aggregate. Only send if we have enough peer data. Otherwise substitute a "5 things top recruiters do differently" tip.

- **Day 14 (plain text, upgrade soft-touch)**
  Subject: *"Should you go Pro?"*
  Body: Deena-voice, honest. "If you're doing X, Pro is worth it. If not, stay on Free — no pressure."

- **Day 30 (HTML, monthly recap)**
  Subject: *"Your first month at Offerloop"*
  Body: Stats. Next-month plan. CTA into Meeting Prep or Job Board depending on which they haven't used.

**Data model**:
- Log key: `{uid}:welcome_drip:day_0` ... `day_30`
- Skip step if user already unsubscribed
- Skip Day 14 upgrade email if user already on Pro/Elite
- Insert into `process_all_pending_emails()` scan loop

#### 7. Onboarding drop-off

**Trigger**: signup > 24h ago AND no `PROFILE_CONFIRMED` event.

**Steps**:
- **Day 1**: "Finish setting up in 60 seconds" — plain text, one link to resume onboarding
- **Day 3**: "Anything I can help with?" — plain text from Deena, reply CTA. If no reply, sequence ends.

#### 8. First-search activation

**Trigger**: `PROFILE_CONFIRMED` fired > 48h ago AND no `SEARCH_EXECUTED` event.

**Steps**:
- **Day 2**: "The one thing to do this week" — 1 CTA to Find. Include a pre-filled example search based on their target industry.
- **Day 5**: Deena drops in with a specific search recommendation. "Search for '[title]s at [firm]' — that's how [name] found their first coffee chat."

#### 9. First-send activation

**Trigger**: `SEARCH_EXECUTED` in last 3d AND no `EMAIL_SENT` event.

**Steps**:
- **Day 3**: "You searched but didn't send — here's why students freeze." Address the fear directly. Include the shortest working template.
- **Day 7**: Case study from a real user (anonymized) who was scared and now has an offer. Real, or don't send.

### Detailed specs for P1 campaigns (summary)

**#13 Weekly win report** — biggest lever after the drip. Every Sunday 6pm local:
- If any activity that week: "This week you sent X emails, got Y replies, saved Z contacts. Keep the streak."
- If no activity: "Quiet week — here's what to do in 30 min tomorrow."
- Free users get "on Pro you'd also see: [X metric they can't see now]" (Grammarly-style)
- Pro users get benchmarks vs Free-tier average (aspirational)
- Elite users get a 1-line personal note from Deena every 4th week

**#10 Coffee chat prep discovery** — trigger when user has sent 5+ emails but hasn't opened Meeting Prep. Frame as: "You've got outreach going — now don't fumble the actual conversation."

**#12 Free ceiling** — when free user hits 90% of monthly credits, one email with real "here's what you'd get on Pro this month based on YOUR usage" (data-driven, no marketing fluff).

**#17 Pro retention monthly recap** — 1st of month, Pro-users only. Stats + 1 new feature they haven't tried + 1 "did you know" tip.

**#20 Renewal reminder** — 3 days before renewal. Neutral tone, "here's what's coming up." Reduces surprise cancels and refund requests.

---

## Track 3 — Event taxonomy

The lifecycle system triggers on Firestore events. Define these formally so the scan loop is deterministic.

### New Firestore fields to add on `users/{uid}`

| Field | Type | Meaning |
|---|---|---|
| `signupAt` | Timestamp | signup time (backfill from Firebase Auth) |
| `newsletterSubscribed` | bool | Beehiiv opt-in state |
| `lastActiveAt` | Timestamp | last event of any kind |
| `lastSearchAt` | Timestamp | last `SEARCH_EXECUTED` |
| `lastEmailSentAt` | Timestamp | last `EMAIL_SENT` |
| `lastLoginAt` | Timestamp | on frontend load if auth valid |
| `firstSearchAt` | Timestamp | one-shot |
| `firstEmailSentAt` | Timestamp | one-shot |
| `firstReplyReceivedAt` | Timestamp | one-shot |
| `profileConfirmedAt` | Timestamp | onboarding done |
| `checkoutAbandonedAt` | Timestamp | existing |
| `canceledAt` | Timestamp | existing |

Backend updates these on their respective event log entries (cheap — no new event source needed).

### New Firestore field per campaign

Store the last time we scanned each user for each campaign, so the scan loop is O(active users) not O(all users × campaigns):

```
users/{uid}/lifecycle_state:
  {
    welcome_drip_next_step: "day_1",
    welcome_drip_next_check: <timestamp>,
    dormancy_last_email_at: <timestamp>,
    ...
  }
```

### Frontend event coverage

`analytics.ts` already covers PostHog. Add these events to `users/{uid}/events/*` write path so they show up in Firestore for lifecycle scans:

- `PRICING_PAGE_VIEWED` (already tracked in PostHog, mirror to Firestore for lifecycle triggers)
- `NEWSLETTER_OPTED_IN` / `NEWSLETTER_OPTED_OUT`

---

## Track 4 — Deliverability + compliance

Most of this is already handled. Diff from current state:

### Compliance checklist

- ✅ CAN-SPAM: physical address (get from Rylan — needs to be in every footer)
- ✅ CAN-SPAM: 10-business-day unsub honor (HMAC token → Firestore write, immediate)
- ✅ CAN-SPAM: clear unsub link (already in Resend adapter)
- ✅ Gmail/Yahoo Feb 2024: List-Unsubscribe header (already set)
- ⚠️ **Need**: DMARC policy at `p=quarantine` or `p=reject` (currently unknown — Sid to verify DNS)
- ⚠️ **Need**: Postal address in Beehiiv sender settings (school PO box or LLC address)
- ✅ CASL (Canada): if we get Canadian students, express opt-in — currently newsletter is opt-in, transactional/lifecycle is arguable but safe if we add "You're getting this because you signed up for Offerloop" line

### Deliverability guardrails

- **Rate limit**: keep the existing `MAX_LIFECYCLE_EMAILS_PER_7_DAYS = 2`. Do NOT raise this even as we add campaigns. The scan loop will pick the highest-priority pending email per user per scan.
- **Priority order** when multiple campaigns are pending for one user (deterministic):
  1. Trial ending / renewal (transactional-adjacent, always ships)
  2. Checkout abandonment
  3. Low credits
  4. Onboarding drop-off
  5. First-N activation (search, send)
  6. Welcome drip
  7. Feature discovery
  8. Weekly recap
  9. Dormancy
- **Suppression**: reuse existing suppression list. Bounce/complaint → user suppressed for BOTH transactional and marketing.
- **Preferences center**: expose in Account Settings — separate toggles for "product tips", "recruiting playbook", "weekly recap", "activity digest". Keep transactional (receipt, password reset, security) always on.

### Sender identity

- `Deena @ Offerloop <bandis@offerloop.ai>` for lifecycle
- `Offerloop Newsletter <hello@offerloop.ai>` for Beehiiv (unchanged)
- `Offerloop <noreply@offerloop.ai>` for transactional (receipts, password reset)

All three from the same root domain, all DKIM/SPF signed via Resend and Beehiiv. `bandis@offerloop.ai` must be a real mailbox (or forward to one) — Day 0 welcome emails have reply CTAs and someone needs to actually answer.

---

## Track 5 — Analytics + KPIs

### Metrics to track per campaign

| Metric | Where | Target |
|---|---|---|
| Open rate | Resend / Beehiiv API | Lifecycle: >35%, Newsletter: >30% |
| CTR | Resend / Beehiiv API | Lifecycle: >5%, Newsletter: >3% |
| Unsub rate per send | Resend webhook | <0.5% (>1% = red flag) |
| Bounce rate | Resend webhook | <2% |
| Complaint rate | Resend webhook | <0.1% |
| Attributed conversion | PostHog `lifecycle_email_clicked` → `checkout_completed` join | Welcome drip: 10% first-search rate, Free ceiling: 5% upgrade rate |

### Dashboards to build

- Admin-only route `/admin/email-metrics` reading from a new `email_campaign_stats` Firestore collection updated by a nightly job.
- PostHog board saved with campaign attribution funnels.

### A/B testing

Only after Phase 3. Two variants per campaign, split 50/50 by `hash(uid) mod 2`. Winner: >20 pp CTR delta over 200 sends per arm. Don't test everything — pick subject lines only for the highest-volume campaigns (welcome drip Day 0, weekly recap).

---

## Track 6 — Rollout phases

### Phase 1 — foundations (week 1, ~5 days)

- Wire signup → Beehiiv audience sync (`backend/app/services/beehiiv_client.py`)
- Add `signupAt`, `lastActiveAt`, `lastLoginAt`, `firstSearchAt`, `firstEmailSentAt`, `newsletterSubscribed` Firestore fields + backfill
- Add newsletter opt-in step to onboarding (optional, default checked)
- Add preferences center to Account Settings (product tips / playbook / weekly recap / activity — separate toggles)
- Add postal address to sender footer
- Verify DMARC + DKIM

### Phase 2 — P0 lifecycle campaigns (weeks 2–3, ~10 days)

- Ship #1 Welcome + onboarding drip (6 emails)
- Ship #7 Onboarding drop-off
- Ship #8 First-search activation
- Ship #9 First-send activation
- Rewire #2 Pricing abandonment now that PricingExitPopup is gone — hook into `/pricing` PostHog `pricing_page_exit` event via a new `/api/lifecycle/pricing-view` endpoint that mirrors the removed popup capture

### Phase 3 — newsletter launch (week 3, ~3 days)

- Write first 4 issues in advance (safety margin)
- Set up Beehiiv Boost network
- Configure referral tiers
- Launch cross-app signup surfaces (dashboard toast, sidebar link, blog footer)
- First send: Tue of week 4

### Phase 4 — P1 lifecycle campaigns (weeks 4–5, ~8 days)

- #10 Coffee chat prep discovery
- #11 Job board discovery
- #12 Free ceiling
- #13 Weekly win report (biggest lift — pull data from `metrics_events`)
- #17 Pro retention monthly recap
- #20 Renewal reminder

### Phase 5 — retention + expansion (week 6, ~4 days)

- #14–#16 Dormancy nudges (14d / 30d / 60d)
- #18 Pro → Elite upgrade nudge
- #19 Referral milestone

### Phase 6 — measurement (week 7, ~3 days)

- Admin dashboard
- PostHog attribution funnels
- First A/B test set up (welcome Day 0 subject line)

**Total**: ~33 dev days across 7 weeks. Backend-heavy — no new tooling to learn.

---

## Track 7 — What NOT to build

Explicit no-list to prevent scope creep:

- ❌ Loops.so / Customer.io / Klaviyo — we have all their features via `lifecycle_emails.py` + Resend
- ❌ In-app notification center — separate concern, has its own project
- ❌ SMS notifications — no clear ROI at student price points
- ❌ Push notifications via web — pre-mature until Chrome extension usage patterns settle
- ❌ AI-generated newsletter content — user is CMO for a reason; hand-written wins for this audience
- ❌ Personalized per-user newsletter (Notion-style) — not until we're at 2000+ subs per segment
- ❌ Email preview modal per campaign — dogfood in a real inbox instead

---

## Open decisions to lock before Phase 1

1. **Physical address for CAN-SPAM footer** — school PO box? Delaware LLC address? Home address is legal but not ideal.
2. **Beehiiv API key access** — who provisions? Does the current Beehiiv plan include API? (Growth plan does; Launch doesn't)
3. **Deena's send/reply cadence** — Day 0 welcome expects replies. Is Deena checking `bandis@offerloop.ai` (or wherever it forwards) daily? Set up auto-forward to primary inbox if needed.
4. **Sender email `bandis@offerloop.ai`** — ✅ locked. Needs to be provisioned in Google Workspace (or wherever offerloop.ai mail lives) with either a mailbox or forward to Deena's real inbox before Phase 2 ships.
5. **Weekly recap = every user forever, or opt-in?** — default = opt-in via onboarding step, prefs center toggle
6. **Peer comparison data threshold** — how many peers per (school, industry, class year) tuple before we surface it? Recommendation: 20

---

## Risks + mitigations

| Risk | Mitigation |
|---|---|
| Rate limit (2 emails / 7 days) blocks important campaigns | Priority-ordered scan (spec'd above). Also raise to 3 / 7d after 60d of stable metrics. |
| Users get spammed by overlapping campaigns | Idempotency table + priority ordering. Weekly recap opts out of that user's other lifecycle scans that same week. |
| Deliverability drops as volume grows | DMARC hard, warm-up new sender identity for `bandis@offerloop.ai` slowly (start w/ 100 sends/day for 2 weeks). Monitor Resend reputation dashboard weekly. |
| Newsletter starts strong then dies | Editorial calendar 4 weeks ahead, non-negotiable Tue+Thu ship, one dedicated writing block per week for whoever writes the newsletter. |
| Beehiiv referral gets abused (fake signups for rewards) | Only count refs who confirm email + hit `PROFILE_CONFIRMED` before rewards apply. |
| Reply volume on Day 0 welcome overwhelms Deena | Cap Day 0 replies at 20/day early on; if it becomes a firehose, add a shared inbox + auto-triage. |

---

## Success criteria (12 weeks from Phase 1)

- Newsletter: 1500 subs, 30%+ open, 3%+ CTR, <0.3% unsub
- Welcome drip: 40%+ users hit `firstSearchAt` within 7 days
- First-search activation: lift `firstSearchAt` conversion by 25 pp over pre-drip baseline
- Weekly recap: 25%+ open among Pro users, 15%+ among Free
- Free tier ceiling → Pro conversion: 5%+ of triggered users upgrade within 7 days
- Zero deliverability incidents (bounce rate stays <2%, complaint <0.1%)
- Overall free → paid conversion: 22% baseline → 28%+ (via lifecycle lift alone, not Beehiiv)

---

## Appendix A — Companies whose playbooks we're borrowing from

- **Handshake** — bi-weekly segmented newsletter per school
- **Superhuman** — plain-text founder welcome, ask a question, reply CTA
- **Notion** — feature-usage → adjacent feature nudges
- **Duolingo** — streaks (weekly recap "keep the streak alive")
- **Grammarly** — weekly performance report, "what Pro would show you"
- **Morning Brew** — newsletter voice, referral reward tiers, section structure
- **Ramp** — outcome-framed subject lines (interviews landed, not "features used")
- **Linear** — clean, minimal product emails
- **Wellfound** — profile completion nudges, saved-search alerts

---

## Appendix B — File map (what changes)

**New backend files:**
- `backend/app/services/beehiiv_client.py` — API wrapper (upsert subscriber, update custom fields, unsubscribe)
- `backend/app/routes/beehiiv_webhook.py` — inbound unsubscribe sync
- `backend/app/services/lifecycle_campaigns/` — one module per campaign (welcome_drip.py, onboarding_dropoff.py, weekly_recap.py, etc.) to keep `lifecycle_emails.py` from ballooning past 2k lines

**Modified backend files:**
- `backend/app/services/lifecycle_emails.py` — extend `process_all_pending_emails()` to include new campaigns via priority-ordered scan
- `backend/app/routes/lifecycle.py` — add `/pricing-view` endpoint for signed-in pricing tracking
- `backend/app/utils/metrics_events.py` — add campaign_sent / campaign_clicked event types
- `backend/wsgi.py` — register `beehiiv_webhook_bp`
- Firebase Auth signup handler — call `beehiiv_client.upsert_subscriber` + write `signupAt` field
- Stripe webhook — update Beehiiv tier custom field on subscription change

**New frontend files:**
- `src/components/onboarding/OnboardingNewsletterOptIn.tsx` — Step 6
- `src/components/settings/EmailPreferencesPanel.tsx` — Account Settings section

**Modified frontend files:**
- `src/pages/AccountSettings.tsx` — mount preferences panel
- `src/pages/Pricing.tsx` — fire `PRICING_PAGE_VIEWED` for signed-in users to Firestore

**New env vars:**
- `BEEHIIV_API_KEY`
- `BEEHIIV_PUBLICATION_ID`
- `BEEHIIV_WEBHOOK_SECRET`
- `LIFECYCLE_SIGNATURE_NAME=Deena` (override existing `Rylan` default)
- `LIFECYCLE_FROM_EMAIL=bandis@offerloop.ai` (needs to be added to Resend adapter — currently hardcoded)

**No new services / no new vendors.**
