# Rylan Handoff — Job-Swipe → People-Swipe Migration Map

Purpose: swap the current job-swipe client path for a people-swipe one with
as few surprises as possible. Sections 2 and 4 are the ones to read
before you start building — they tell you what's ready and what isn't.

Companion docs: `IOS_RANKER_PREREQS_PLAN.md` (why the data layer changed),
`IOS_RANKER_COMMIT_2_PROPOSAL.md` (typed-field derivation reference).

---

## 1. Parallel mapping

| Job-swipe today | People-swipe equivalent | Status |
|---|---|---|
| `GET /api/jobs/feed` — ranked swipe deck | `GET /api/ranker/candidates?limit=<1-100>` (default 50) | ✅ ready |
| Job card fields (`title`, `company`, `salary`, `location`) | `person.title`, `person.company`, `person.city` + `state`, `person.college` — plus `score`, `tier`, `reasons`, `briefing` for card copy | ✅ ready |
| Card render key (`job_id`) | `person.id` — LinkedIn slug preferred, `pdlId` fallback, guaranteed non-null | ✅ ready |
| Deck-scope join key for feedback / reveal | `deck_id` — top-level field on the candidates response, string. Client must echo on every follow-up call from that deck (see §3) | ✅ ready |
| `GET /api/jobs/<job_id>` — job detail | No separate detail endpoint; the full `person` dict + scoring metadata is already in the feed payload | ✅ ready (via feed) |
| Swipe-right on job (add to applications / draft) | Save via existing `POST /api/contacts/bulk` (pass a contact-shape dict built from `person`). Reveal email via `POST /api/ranker/candidates/<id>/reveal-email` before drafting. | ✅ ready |
| Swipe-left on job → `POST /api/jobs/feedback` `{job_id, signal: "negative"}` | `POST /api/ranker/feedback` `{candidate_id, signal: "left" \| "right" \| "skip", deck_id, rank}` | ✅ ready |
| Swipe-right positive training signal | Same endpoint — `signal: "right"`. Powers the training data + auto-excludes-known via a save-to-contacts follow-up | ✅ ready |
| Reveal contact info / open profile | `POST /api/ranker/candidates/<id>/reveal-email` — metered (8 credits), cache-first, refund on unverified/low-confidence/no-hit. See §5. | ✅ ready |
| Saved jobs list | `GET /api/contacts` returns saved contacts. Ranker also **implicitly** excludes already-saved people from future decks | ✅ ready (implicit "seen") |
| Filter chips (`GET /api/jobs/filters`) | No filter endpoint by design — ranker takes zero query params, sources everything from profile | ✅ intentional (no client filters) |

---

## 2. What's DONE server-side

Everything the swipe deck needs is now shipped:

- **`GET /api/ranker/candidates?limit=<1-100>`** — the deck. Firebase auth. Response includes `deck_id` (top level).
- **`POST /api/ranker/feedback`** — swipe signals (`right` / `left` / `skip`). Writes two idempotent records: `peoplePreferences` (state for "don't show again") + `recommendation_events` (training label). `left` / `skip` auto-exclude the person from future decks. `right` doesn't auto-exclude — pair it with `POST /api/contacts/bulk` if you want the person saved to My Network.
- **`POST /api/ranker/candidates/<id>/reveal-email`** — metered Hunter lookup. Cache-first (30-day TTL). Refund on unverified / no-hit / provider error. See §5 for the exact charge rule.

Covered by 31 tests including refund and idempotency paths.

Nice-to-have not built (ping when needed): **combined save-with-draft** — chain `POST /api/contacts/bulk` (persist) + `POST /api/ranker/candidates/<id>/reveal-email` (email) + your current email-generation endpoint. Single-endpoint version is trivial to add if the chaining hurts.

---

## 3. Deck round-trip — `deck_id` capture and echo

**Every call from a deck must echo the `deck_id` returned by the deck.** Feedback 400s without it; reveal accepts it optionally for cross-endpoint attribution. Capture once on deck response, hold in swipe-deck state, echo on every follow-up call from that deck.

```
Client                                     Server

GET /api/ranker/candidates ─────────►
                             ◄───────────  200 {
                                             candidates: [
                                               {person: {id: "alice-smith", …},
                                                score: 63, tier: "warm",
                                                reasons: [...], briefing: "..."},
                                               …
                                             ],
                                             count: 50,
                                             deck_id: "b3c1a7e2ff8d9042",   ← CAPTURE
                                             generatedAt: "2026-07-28T..."
                                           }

(client stores deck_id in swipe-deck state; render 50 cards)

─── user swipes RIGHT on card 3 ───

POST /api/ranker/feedback  ─────────►  {
                                         candidate_id: "alice-smith",
                                         signal:       "right",
                                         deck_id:      "b3c1a7e2ff8d9042",  ← ECHO
                                         rank:         3,             (0-based)
                                         // recommended for training attribution:
                                         score:    63,
                                         tier:     "warm",
                                         reasons:  [{type:"alumni",...}],
                                         briefing: "..."
                                       }
                             ◄───────────  200 {ok: true}

POST /api/ranker/candidates/alice-smith/reveal-email ────►  {
                                                             deck_id: "b3c1a7e2ff8d9042"  ← ECHO (optional)
                                                           }
                                                ◄────────  200 {
                                                             email:      "alice@google.com",
                                                             verified:   true,
                                                             source:     "hunter_finder",
                                                             confidence: 94,
                                                             cached:     false,
                                                             charged:    true
                                                           }

(client opens Gmail draft prefilled with the address)

─── user swipes LEFT on card 4 ───

POST /api/ranker/feedback  ─────────►  {
                                         candidate_id: "bob-jones",
                                         signal:       "left",
                                         deck_id:      "b3c1a7e2ff8d9042",  ← same deck
                                         rank:         4
                                       }
                             ◄───────────  200 {ok: true}

(bob-jones now excluded from all future decks for this uid)
```

Feedback body validation — all four fields are required:

- `candidate_id` — `person.id` from the deck. Missing → 400.
- `signal` — must be `"right"`, `"left"`, or `"skip"`. Anything else → 400.
- `deck_id` — from the deck response. Missing → 400.
- `rank` — 0-based position in the deck. Missing / negative / non-int → 400.

Optional feedback fields (`score`, `tier`, `reasons`, `briefing`) go into the training row's `features_snapshot` for attribution — echoing them makes the training data joinable to what the user actually saw. If omitted, the row still writes but with an empty snapshot.

---

## 4. Empty-state and error contract

### `GET /api/ranker/candidates`

| Status | Body | What Rylan does |
|---|---|---|
| **200** with `candidates: [...]` | Normal deck. `count = candidates.length`. `deck_id` present. | Render deck. Store `deck_id`. |
| **200** with `candidates: []`, `count: 0`, `reason: "no_candidates"` | Deck empty. Two causes: sparse profile OR zero firm_employees hits. Both non-error. `deck_id` still present. | Render empty-state screen. Prompt onboarding completion if sparse profile suspected. **Never treat as error.** |
| **401** | Firebase auth failed. | Standard re-auth flow — not ranker-specific. |
| **500** with `{"error": "Database not initialized"}` | Backend health issue, not user issue. | Retry with backoff, log for observability. Not expected in normal operation. |
| Anything else 5xx | Unexpected. Ranker never raises internally — an unexpected 5xx means Flask/auth broke upstream. | Retry with backoff, surface generic error state, log. |

### `POST /api/ranker/feedback`

| Status | Body | Meaning |
|---|---|---|
| **200** | `{ok: true}` | Preferences + event written. |
| **400** | `{error: "..."}` | Validation failed. Message names the missing/bad field. |
| **500** | `{error: "..."}` | DB not initialized. |

### `POST /api/ranker/candidates/<id>/reveal-email`

| Status | Body | Meaning |
|---|---|---|
| **200** | `{email, verified: true, source, confidence, cached, charged: true}` | Deliverable email; user was charged (or cache-hit, `charged: false`). |
| **200** | `{email: null \| str, verified: false, source, confidence, reason: "no_email_found" \| "below_confidence_threshold" \| "provider_error", cached: false, charged: false}` | Either no email or below the charge-worthy bar. User was NOT charged. Client renders "email not found — try LinkedIn message." |
| **402** | `{error: "insufficient_credits", required: 8, have: <int>}` | Out of credits. Prompt upgrade / top-up. No Hunter call fired. |
| **404** | `{error: "candidate_not_found"}` | `candidate_id` doesn't map to a firm_employees doc. No deduction. |
| **500** | `{error: "..."}` | DB not initialized. |

---

## 5. Reveal-email metering — exactly when credits are charged

Reveal costs **8 credits** (see `config.CREDIT_COSTS["reveal_email"]`). Cache-first: subsequent calls within a **30-day TTL** are free. Refund logic errs toward the user — charged bounces hurt trust more than free misses.

**Charge is kept** (user pays 8 credits) when BOTH of:
1. Hunter returned an email, AND
2. Either:
   - `email_verified == true` (Hunter SMTP-confirmed deliverable — unconditional charge), OR
   - `email_source == "hunter_finder"` AND `confidence >= 90`

**Charge is refunded** when any of:
- No email found
- `email_source ∈ {pattern, domain_generated, pdl_fallback}` (synthesized/best-guess)
- `email_verified == false` AND `confidence < 90`
- Hunter API error / timeout

The refund happens inside the endpoint automatically — client just sees `charged: false` on the response.

Response always includes both `cached` and `charged` booleans so the client can render "verified" / "unverified" / "cached" states without guessing. Rylan wires the reveal call into the swipe-right handler ONLY — firing on card render burns credits unnecessarily (and if you do it accidentally, the 30-day cache limits the damage).

---

## 6. Known gaps — do NOT build against these

- **No `hometown` field on `person`.** `HometownSignal` is extracted upstream (per-contact) but not wired into scoring or the response payload. Don't render a hometown chip. When wiring lands it'll be a deliberate contract addition — the strict-equality allowlist tests will fail loudly so you're told to update the client rather than the field silently appearing.
- **Sparse-profile users get an empty deck.** If a user has no `dreamCompanies` AND no `academics.school`, ranker returns `count=0`. Not a bug — refusing to full-scan `firm_employees` for a broad "everyone" query is safety, not incompleteness. Client fix: nudge user to complete onboarding.
- **No fresh-PDL fallback.** When `firm_employees` has zero hits for a user's signals, we return an empty deck rather than firing a live PDL search. Live search would need a query and would burn credits. If empty-deck rate looks high in metrics we'll wire a targeted PDL follow-through, but for now, don't assume the deck is ever backfilled by a live provider.
- **Ranker exclude-known-contacts uses `(firstName, lastName, company)` triple.** If two people share all three at a company you've saved, both get suppressed. Rare enough to ignore for MVP; flag if you see it in the wild.
- **No `email_bounced` event.** Bounce tracking is part of the deferred attribution loop, not the swipe feedback set. If the client detects a bounce (SMTP error on send), that's currently client-side state — talk to me before wiring it back to the server.

---

## 7. Quick reference

### Deck

```
GET /api/ranker/candidates?limit=50
Authorization: Bearer <firebase-id-token>

→ 200 {
    candidates: [{
      person: { id, firstName, lastName, linkedinUrl, pdlId,
                company, title, college, city, state },
      score:    int,
      tier:     "warm" | "neutral" | "cold",
      reasons:  [ { type, hook, detail, ... } ],
      briefing: string
    }],
    count:       int,
    deck_id:     string,           ← capture this
    generatedAt: ISO8601
  }

→ 200 { candidates: [], count: 0, deck_id, reason: "no_candidates", generatedAt }
```

### Feedback

```
POST /api/ranker/feedback
Authorization: Bearer <firebase-id-token>

{
  candidate_id: "alice-smith",       // required
  signal:       "right"|"left"|"skip", // required
  deck_id:      "b3c1a7e2ff8d9042",  // required — echo from candidates
  rank:         3,                    // required, 0-based
  score:    63,       tier: "warm",   // recommended (attribution)
  reasons:  [...],    briefing: "..."
}

→ 200 { ok: true }
→ 400 { error: "..." }
```

### Reveal

```
POST /api/ranker/candidates/<candidate_id>/reveal-email
Authorization: Bearer <firebase-id-token>

{ deck_id: "b3c1a7e2ff8d9042" }    // optional

→ 200 { email, verified, source, confidence, cached, charged }
→ 402 { error: "insufficient_credits", required, have }
→ 404 { error: "candidate_not_found" }
```

Ping me (Deena) with anything unexpected in the wild. The system is designed to fail *toward* the empty-state / free-miss side rather than to error / charge — surface anything that violates that.
