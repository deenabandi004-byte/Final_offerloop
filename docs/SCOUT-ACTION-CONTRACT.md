# Scout Action Contract v1.1

**The boundary between the Scout tab (app, Rylan/Claude) and the Scout brain
(backend, Nick).** This is the MOBILE dialect only — it describes what the
app renders and executes; web Scout keeps its own envelope ("one brain, two
dialects", Nick's translator owns both). The app renders and executes
whatever conforms to this shape; the brain can get infinitely smarter
without a single UI change.

**Status: blessed with amendments (Nick, 2026-07-07) — this revision applies
all four amendments + his answers.** Changes from v1: results payload +
search action types; send_outreach/create_loop moved to a reserved v1.1
enum pending explicit product decision; scope-option counts optional;
max one Confirm per response; endpoint locked as new `/api/scout/ask`;
non-streaming v1.

**Correction to Nick's review point 1:** the draft-job system DOES exist —
it shipped this week on the `staging/mobile-field` branch (not on main):
`backend/app/services/draft_jobs.py` (bounded pool, stage/progressPct/
foundContacts/stageTimings), `backend/app/routes/mobile.py` (`POST
/api/mobile/draft-jobs`, `GET /api/mobile/draft-jobs/{id}`, rate-limit
exempt), `backend/app/services/swipe_idempotency.py` (the per-gesture
dedupe store — the askId pattern can reuse it directly). Live-verified
under burst load. Nothing to rebuild — point the translator at that branch.

Companion docs: `PLAN-scout-voice.md` (product decisions), the interactive
mock (P0 sign-off artifact).

---

## Request — app → brain

`POST /api/scout/ask` (name negotiable — could also extend the existing
scout-assistant chat endpoint with a mode flag)

```json
{
  "ask": "send five emails to hiring managers in investment banking in LA",
  "source": "voice" | "typed" | "chip",
  "askId": "ask-<uuid>",            // idempotency, same pattern as swipe_id
  "conversationId": "…",            // optional: continue a thread
  "confirmedAction": null            // see Confirmation round-trip below
}
```

## Response — brain → app

```json
{
  "say": "On it — drafting 5 hiring managers in IB in LA.",
  "actions": [ Action, … ],          // zero or more
  "askId": "ask-<uuid>"
}
```

- `say` renders as Scout's reply (and later feeds TTS). Always present, even
  with no actions (pure conversation falls back to chat behavior).
- Zero actions = conversational answer only.
- **Say-text honesty rule (field-tested 2026-07-08):** `say` must NEVER claim
  work ("lining up managers for you", "I'll get on that") unless the same
  response carries the matching action. The web chat brain currently does
  this — the translator must strip/rephrase action-claiming language when it
  emits zero actions, or users watch Scout promise work that never runs.
  Corollary: mishears are corrected before parsing on the app side (firm-name
  autocorrect) and the corrected ask is what the brain receives.

### Action

```json
{
  "type": "draft_outreach" | "auto_apply" | "meeting_prep"
        | "find_contacts" | "discover_companies" | "find_hiring_managers"
        | "generate_cover_letter" | "tailor_resume_to_job",
  "params": { …type-specific… },
  "needsConfirm": false | Confirm,
  "jobRef": null | { "kind": "draft_job" | "auto_apply" | "meeting_prep", "id": "…" },
  "results": null | Results
}
```

**Resolved 2026-07-08 (Nick + Rylan):**
- `send_outreach` — **voice never sends in v1; always draft.** The app's
  honest downgrade ("drafts land in your Inbox — sending from here is
  coming soon") IS the spec. Enum stays reserved so adding
  send-with-receipt later doesn't break the shape.
- `create_loop` — **not from voice in v1.** A recurring credit commitment
  is the riskiest thing a mishear can do. Instead: voice may PROPOSE a
  loop — the brain returns an action that opens the loop-setup screen
  pre-filled; the commit happens in UI. (Action type
  `propose_loop { params: prefill }`, needsConfirm: false — navigation is
  free.) Keeps the demo moment without the failure mode.

**Max one action carrying a Confirm per response (v1)** — the brain may
chain reversible actions (find→draft) in one turn, but never two pending
confirms; the app renders exactly one receipt card at a time.

### Results — inline payload for search-type actions

The brain's most-used workflows return THINGS, not just prose. `results`
lets the app render them as cards (contact/company rows reusing the app's
existing card components); v1 may render them as plain text and upgrade
rendering later without contract change.

```json
{
  "kind": "contacts" | "companies" | "document",
  "items": [
    { "name": "Sarah Kim", "title": "VP Recruiting", "company": "Goldman Sachs",
      "linkedinUrl": "…", "contactId": "…" },
    …
  ],
  "documentRef": null | { "kind": "cover_letter" | "resume", "id": "…" }
}
```

**Execution rule (locked in design review):** reversible actions (drafts,
preps, all search types, document generation) run immediately —
`needsConfirm: false`, `jobRef`/`results` present in the SAME response.
Irreversible ones (auto_apply submit; send/loop when they land) always carry
a `Confirm` and NO jobRef until confirmed.

### Confirm — the receipt card, graduated (locked in design review)

```json
{
  "style": "targets" | "scope" | "recurring" | "clarify",
  "title": "Ready to send — 5 emails",
  "summary": "Hiring managers · Investment banking · Los Angeles",

  // style: "targets" (small concrete ask, ≤5): every name shown
  "targets": [ { "name": "Sarah Kim", "company": "Goldman Sachs" }, … ],

  // style: "scope" (big/vague ask): brain proposes options, FIRST is default.
  // `count` is OPTIONAL (Nick's point 4 — no cheap preview-count today):
  // v1 degrades to fixed tiers with credit estimates; real counts arrive
  // when the brain grows a preview path. Brain computes creditEstimate
  // (it owns the credit table + tier caps).
  "options": [
    { "id": "top5",  "label": "Top 5 matches",  "creditEstimate": 25 },
    { "id": "top10", "label": "Top 10 matches", "creditEstimate": 50 },
    { "id": "top20", "label": "Top 20 matches", "creditEstimate": 100 }
  ],
  "capNote": "20 applications per day — the rest queue for tomorrow",

  // style: "clarify" (broad/underspecified ask — Rylan field-test insight
  // 2026-07-08: coach the ask like web Find does, one light step, never an
  // interrogation): the brain asks ONE tightening question with quick-tap
  // refinement chips that append to the ask; free-form voice/typing also
  // accepted. Maps from the brain's internal clarify states (e.g.
  // COUNT_REQUIRED). Max one clarify round before acting on best effort.
  "question": "Which city should I focus on?",
  "refinements": [
    { "id": "la",   "label": "Los Angeles" },
    { "id": "sf",   "label": "San Francisco" },
    { "id": "any",  "label": "Anywhere" }
  ],

  // style: "recurring" (create_loop)
  "cadence": "weekly",
  "declineLabel": "Just once",   // declining recurring can still run once
  "confirmLabel": "Start weekly"
}
```

### Confirmation round-trip

User taps confirm → app POSTs the SAME endpoint:

```json
{ "askId": "…", "confirmedAction": { "type": "…", "params": { …, "scopeOptionId": "top20" } } }
```

Brain executes and responds with `say` + the action now carrying a `jobRef`.
Unconfirmed = nothing committed, ever (abandonment is safe by design).
`askId` idempotency: replaying a confirmed ask must NOT double-execute
(same discipline as swipe_id on prompt-search).

## jobRef → live progress (already built, reuse as-is)

- `draft_job` → poll `GET /api/mobile/draft-jobs/{id}` (2.5s, rate-limit
  exempt): status/stage/stageLabel/progressPct/foundContacts + stage timings.
- `auto_apply` → existing auto-apply status endpoint.
- `meeting_prep` → existing coffee-chat-prep polling.
The app renders these as action cards with REAL stages (never invented
progress). Push notifications on completion already fire from these systems.

## Re-hydration — BUILT (shipped on staging/mobile-field, commit ba8d001)

`GET /api/mobile/scout/active` (note the /mobile prefix — reconciled per
Nick's review 2026-07-08) → `{ items: [ { jobRef, title, stageLabel,
startedAt } ] }` — the app's Scout tab redraws in-flight cards after a full
app kill. Includes a zombie filter: only jobs that heartbeat'd within 8
minutes re-hydrate, so stuck 'running' docs never flash as ghost cards.
The app already calls this on tab mount. If the brain later exposes its own
active-work listing, keep this path as the app-facing alias.

## Errors

```json
{ "say": "I couldn't find anyone matching that — want me to widen it?",
  "actions": [], "error": { "code": "no_results" | "insufficient_credits" | "gmail_disconnected" | "cap_reached", "detail": "…" } }
```

Errors speak in `say` (user-facing words, no codes on screen); `error.code`
lets the app add the right affordance (top-up link, reconnect Gmail, etc.).

## Interim plan until the brain lands

The app ships P2 with a CLIENT-SIDE mapper for the top 3 intents calling the
existing endpoints directly, shaped as if a brain had returned this contract.
The day the real endpoint speaks this shape, the mapper is deleted — the UI
doesn't change. Anything the brain can't fill yet (scope options, say-text
quality) degrades gracefully: a generic scope card, a templated say line.

## Pricing (blessed 2026-07-08)

Search-only people preview stays **uncharged** (no emails shown, cap 5,
auth + rate-limited) — the email reveal is where the value is, so previews
don't cannibalize drafting. Caveat: previews still cost real PDL money per
lookup; keep the rate limit tight and watch PDL spend for a couple weeks.
If it grows, cap previews per day rather than charging credits.

## Resolved (Nick, 2026-07-07)

1. **Endpoint:** new `POST /api/scout/ask` — a thin wrapper on the same brain
   (ScoutAssistantService.handle_chat) with a translator to this envelope.
2. **Non-streaming v1.** Streaming `say` later is cheap; don't build for it.
3. **Action arrays allowed; at most ONE pending Confirm per response.**
4. **Brain computes credit estimates.** Real per-option counts: later,
   behind a preview path.
5. **askId dedupe:** per-user dedupe collection on Nick's side (the
   `swipe_idempotency.py` pattern on staging/mobile-field is reusable
   as-is). **`GET /api/scout/active`:** thin aggregator over job state
   already in Firestore.

## The spend gate (added after field test 2026-07-08)

Reversible-vs-irreversible wasn't the whole story: drafts are reversible
but their CREDITS aren't. A misheard voice ask ("Bay or anywhere that like
man is hiring") burned credits on a stranger. Mobile rule now: **voice asks
that spend credits confirm by default** (interpreted ask + cost, one tap);
a Settings toggle enables zero-touch; transcription-debris targets always
confirm regardless. Typed asks and taps are deliberate — instant. The brain
should mirror this: when confidence in the parse is low and the action
spends, prefer a clarify/confirm over execution.

## Consent model (mobile) — noted divergence

The mobile app ALWAYS confirms irreversible actions (receipt card). Web
Scout's rule (explicit ask = consent, execute + undo) stays web's. Nick's
translator owns the mapping (e.g. the brain's COUNT_REQUIRED clarify becomes
the app's scope card). The two surfaces will feel different — accepted.
