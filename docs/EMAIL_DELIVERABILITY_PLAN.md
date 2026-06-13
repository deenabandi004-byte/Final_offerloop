# Email Deliverability — Bounce Reduction Plan

Goal: cut the bounce rate on Find People + Loops outreach. Root-cause analysis lives in the chat history; root causes summarized inline below.

## Status

| Phase | Scope | Status |
|---|---|---|
| 1 | See the problem (webhook bounce detection + suppression + metric) | ✅ shipped |
| 2.1 | Kill the PDL email short-circuit on stale records | ✅ shipped |
| 2.2 | Honor `email_quality="low"` — stop drafting pattern guesses | ✅ shipped |
| 2.3 | Drop NeverBounce catch-all addresses from candidate pool | ✅ shipped (scoped down) |
| 2.4 | Query suppression list before drafting | ✅ shipped |
| 2.5 | Explicit Hunter 429 detection (don't silently fall through to pattern synthesis) | ✅ shipped |
| 3a | PDL lazy topup — only fetch more when initial batch is short on verified | ✅ shipped |
| 3b | Tighter PDL query (work_email existence filter at issue time) | ⏭ next |
| 3c | Widen Find People `email_quality` gate (depends on 3a + 3b lifting verified-rate) | ⏭ blocked on telemetry |
| 3d | Architectural cleanup (consolidate Hunter entry points, send-time re-verify, UI suppression surface) | ⏭ later |

## Phase 1 — shipped

| File | Change |
|---|---|
| `backend/app/services/suppression.py` (new) | `record_bounce` / `is_suppressed` / `filter_suppressed`. Per-user (`users/{uid}/suppression/{email}`) + global (`global_suppression/{email}`). |
| `backend/app/routes/gmail_webhook.py` | Bounce branch after reply-strategy match. On DSN: stamps contact `pipelineStage="bounced"`, `emailVerificationStatus="bounced"`, `inOutbox=False`; dismisses nudges; calls `record_bounce`; fires `email_bounced` metric; skips reply-coach + notification doc push. |
| `backend/app/utils/metrics_events.py` | `email_bounced` added to `VALID_EVENT_TYPES`. |
| `backend/tests/test_suppression.py` (new) | 9 unit tests. |
| `backend/tests/test_gmail_webhook_bounce_integration.py` (new) | End-to-end webhook bounce path. |

Backfill: `backend/scripts/cleanup_bounce_notifications.py --execute` once Phase 1 hits prod, to clean historical "replied" bounces.

## Phase 2.1 — shipped

| File | Change |
|---|---|
| `backend/app/services/pdl_client.py` | New `_parse_pdl_date()` (ISO-8601 with `Z` / `+00:00` + partial dates). New `_pdl_email_is_fresh(person, max_age_days=180)` using only documented PDL fields: `job_last_updated` + `experience[is_current].last_updated`. Wired into `_all_have_pdl_email` short-circuit — stale PDL records fall through to Hunter batch verification. |
| `backend/tests/test_pdl_email_freshness.py` (new) | 15 tests covering ISO-8601 parsing + freshness gate edges. |

Why this matters: PDL `emails[]` are often 1–3 years stale. Old fix trusted them blindly when no target company was set (alumni / school-only / title-only searches). New fix only short-circuits when PDL has dated evidence the person is still at the current job.

Verified against official PDL docs via Perplexity (not relying on undocumented `emails[].last_seen`/`first_seen`).

## Phase 2.2 — shipped

| File | Change |
|---|---|
| `backend/app/services/agent_actions.py:execute_find_and_draft` | Captures `adjacency_metadata = result[3]` from the search tuple. New local `low_email_quality = adjacency_metadata.get("email_quality") == "low"`. When true: stamps `contact_doc["emailVerificationStatus"] = "needs_verification"` and skips the `create_gmail_draft_for_user` call. |
| `backend/tests/test_phase_2_2_to_2_5.py` (new) | Source-level pin: gate must capture `result[3]`, compute `low_email_quality`, gate the draft branch, and stamp `needs_verification`. The function is too I/O-heavy for full integration mocks. |

Net effect: pattern-synth / `domain_generated` / `pdl_fallback` / `hunter_finder_risky` contacts are still surfaced but no longer auto-drafted.

## Phase 2.3 — shipped (scoped down)

Investigation found that scores 70-79 (`hunter_finder_risky`) and catch-alls (`neverbounce_acceptall`) were already excluded from `HIGH_CONFIDENCE_EMAIL_SOURCES` and thus from `verified_contacts` (`pdl_client.py:3461`). Combined with Phase 2.2, those candidates no longer get drafted via the low-quality fallback either. Raising `RISKY_FINDER_SCORE` 70→80 would have *cost* signal (Hunter's name+domain match is stronger than blind pattern synthesis), so it was dropped.

| File | Change |
|---|---|
| `backend/app/services/hunter.py:1713` | NeverBounce `RESULT_ACCEPT_ALL` / `RESULT_CATCHALL` now **drops** the email (returns `email=None`), same as `RESULT_INVALID`. Was previously retained at score 60 with source `neverbounce_acceptall`. |
| `backend/tests/test_phase_2_2_to_2_5.py` | Catch-all NeverBounce result → `email=None, source=None`. |

## Phase 2.4 — shipped

| File | Change |
|---|---|
| `backend/app/services/gmail_client.py:create_gmail_draft_for_user` | Right after `recipient_email` is selected, calls `suppression.is_suppressed(user_id, recipient_email)`. If True, logs and returns `f"suppressed_{tier}_draft_{firstname}"` sentinel matching the existing `mock_..._no_email` shape. Suppression lookup failures are swallowed so they never block drafting. |
| `backend/tests/test_phase_2_2_to_2_5.py` | Suppressed → sentinel returned, no `drafts().create()` call. Unsuppressed → proceeds past the gate. |

## Phase 2.5 — shipped

| File | Change |
|---|---|
| `backend/app/services/hunter.py:find_email_with_hunter` | After 429 retries exhausted, returns `(None, -1)` sentinel instead of `(None, 0)`. Fires `hunter_rate_limited` metric. Docstring updated. |
| `backend/app/services/hunter.py:batch_verify_emails_for_contacts` | Detects `finder_score == -1` and **skips** T3 pattern synthesis + T4 domain-generated fallbacks. Returns `{email: None, reason: "hunter_rate_limited"}` for that contact. |
| `backend/app/utils/metrics_events.py` | `hunter_rate_limited` added to `VALID_EVENT_TYPES`. |
| `backend/tests/test_phase_2_2_to_2_5.py` | 429 mock → `(None, -1)`. Batch with rate-limited Hunter → no pattern synthesis, payload carries `reason="hunter_rate_limited"`. |

## Phase 3 — architectural cleanup (later, lower urgency)

- Consolidate the five Hunter entry points (`get_verified_email`, `get_verified_email_with_alternates`, `batch_verify_emails_for_contacts`, `enrich_contact_with_hunter`, `enrich_contacts_with_hunter`) into one policy function.
- Re-verify at send-time always, not just `send_for_me` (per `agent_send_gate.py:142`). NeverBounce single call is $0.005.
- Surface "address suppressed / bounced previously" in UI rather than silent skip.
- Bounce-rate dashboard (rolling 7-day from `metrics_events.email_bounced`) for admin and personal use.

## Phase 3a — shipped (PDL lazy topup)

| File | Change |
|---|---|
| `backend/app/services/pdl_client.py:build_query_from_prompt` | New `exclude_pdl_ids` param emits a `must_not: [{terms: {id: [...]}}]` clause so topup attempts return NEW people instead of paging through the same broad-rung results. |
| `backend/app/services/pdl_client.py:search_contacts_from_prompt` | Retry loop now accumulates contacts across attempts (was: replace per rung), breaks when verified count >= max_contacts OR records_fetched_total >= `PDL_BUDGET_CAP` (`= max_contacts * 2.0 + buffer`). Passes the cumulative pdlId list to `build_query_from_prompt` on each topup attempt. |
| `backend/app/utils/metrics_events.py` | New events: `pdl_topup_triggered`, `pdl_topup_records_fetched`, `pdl_budget_cap_hit`. |
| `backend/tests/test_pdl_lazy_topup.py` (new) | 4 cases: enough at level 0 → no topup; short → topup fills target; cumulative pdlIds excluded on each rung; budget cap stops further fetching. |

Cost shape: 0 extra credits on easy searches, +30–50% on average across all searches (only the short ones pay), capped at 2x per search. Vs. blind overfetch which would be +100% on every search.

### Find People — `email_quality` gate deferred (2026-06-12)

The Phase 2.2 `email_quality="low"` gate currently only fires in `agent_actions.execute_find_and_draft` (Loops + HM finder). The Find People draft path goes through `routes/runs.py` → `gmail_client.create_drafts_parallel` → `create_gmail_draft_for_user` and **does not read the flag**. A live dogfood bounce (`ahmademad@google.com`, 2026-06-12) confirmed Find People still ships pattern-synthesized guesses.

Why deferred — the obvious widening to the chokepoint trades a real cost we don't want without data:

- Today, `search_contacts_from_prompt` returns ONLY verified contacts when any exist (line ~3461). If the batch has 5 PDL hits and 1 is verified, the student gets 1 — and **we already paid PDL for the other 4 records that were silently dropped**. We're burning PDL credits on records we don't surface.
- Blindly widening the gate to Find People would surface those zero-draft cases as "contact, no draft" — a draft-volume regression for the student without recovering the PDL spend.
- Overfetching from PDL (1.5–2x) to top up the verified count multiplies the credit burn — worst margin path, especially for free tier.

Right next move (lower-cost, higher ROI): tighten the PDL query at issue time. PDL supports filtering by `work_email` existence — same per-record cost but a higher % of returned records carry a usable address. Combined with Phase 2.1's staleness gate, this should raise the verified-rate enough that the Find People gate is cheap to widen.

Plan:
1. **Telemetry first.** Log per-search `pdl_records_returned` vs `verified_returned` vs `dropped_unverified` to `metrics_events` so we can see the actual waste rate in production. ~1 hour.
2. **Tighter PDL query.** Add `work_email IS NOT NULL` (or PDL's equivalent) to the `search_contacts_from_prompt` filter. Measure verified-rate delta. ~2 hours + dogfood.
3. **Widen Phase 2.2 to Find People.** Once verified-rate is high enough that draft-volume regression is acceptable. Cleanest spot: per-contact `EmailSource` check inside `gmail_client.create_gmail_draft_for_user` (covers Find People + contact_import + linkedin_import + referral_email in one shot). ~30 min.
4. **Opt-in topup (later).** "Find more" button on Find People results that runs another PDL search and charges the credit transparently. Aligns incentives. Product call, not engineering blocker.

Don't widen the gate to Find People before step 2 lands. It's a clean draft-volume regression today.

## How to resume tomorrow

Phase 1 + all of Phase 2 are shipped to the working tree (uncommitted). Tomorrow:

1. Review the diff: `git diff backend/app/routes/gmail_webhook.py backend/app/services/pdl_client.py backend/app/services/hunter.py backend/app/services/gmail_client.py backend/app/services/agent_actions.py backend/app/utils/metrics_events.py` plus the new files (`suppression.py`, four test files, this plan).
2. Decide whether to commit as one large "deliverability" commit or split (e.g. one per phase). Easy to split: each phase touched distinct files.
3. After deploy: watch the `metrics_events` collection for `event_type` in `{"email_bounced", "hunter_rate_limited"}`. Both rates should be visible and trending — that's the Phase 1 instrument validating Phase 2's impact.
4. Optional Phase 3 follow-ups (see below) only if bounce rate doesn't drop enough.

## Decisions locked in

- **No feature flags.** Each phase ships as-is; rollback is `git revert`.
- **Test-then-dogfood, not API spend.** Unit + integration mocks first; light dogfood after merge.
- **PDL staleness cutoff = 180 days.** Tunable via `_PDL_EMAIL_MAX_AGE_DAYS` in `pdl_client.py`.
- **Suppression is per-user + global.** A bounce affecting one student suppresses for everyone (preserves the global signal).
