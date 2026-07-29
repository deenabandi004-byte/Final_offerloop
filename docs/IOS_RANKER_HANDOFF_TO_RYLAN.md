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
| `GET /api/jobs/<job_id>` — job detail | No separate detail endpoint; the full `person` dict + scoring metadata is already in the feed payload | ✅ ready (via feed) |
| Swipe-right on job (add to applications / draft) | Add to user's contacts via existing `POST /api/contacts/bulk` (pass a contact-shape dict built from `person`) | ⚠️ **endpoint exists, client wiring is yours** |
| Swipe-left on job → `POST /api/jobs/feedback` `{job_id, signal: "negative"}` | Same shape, but **no `/api/ranker/feedback` endpoint exists yet** | ❌ **not built** |
| Swipe-right positive training signal | Same endpoint gap | ❌ **not built** |
| Reveal contact info / open profile | Ranker returns `linkedinUrl` + `pdlId` but **NO email** (firm_employees stores no PII we can recompute) | ❌ **not built — reveal-email needs a new endpoint** |
| Saved jobs list | `GET /api/contacts` returns saved contacts. Ranker also **implicitly** excludes already-saved people from future decks | ✅ ready (implicit "seen") |
| Filter chips (`GET /api/jobs/filters`) | No filter endpoint by design — ranker takes zero query params, sources everything from profile | ✅ intentional (no client filters) |

---

## 2. What's DONE server-side vs what needs server support

**Done — Rylan can build against these today:**
- `GET /api/ranker/candidates?limit=<1-100>` (Firebase auth; deterministic per uid + firm_employees state)
- Response contract stable and covered by 14 tests including one end-to-end through the real scorer
- Diversify prevents 8 identical Google SWE cards in a row (LAMBDA_COMPANY=3.0, LAMBDA_ROLE_FAMILY=0.5)
- Empty-deck contract (`count=0, reason="no_candidates"`) — see §3
- Already-saved people auto-excluded from future decks

**Not built — ping me before you need these, don't invent client workarounds:**
1. **`POST /api/ranker/feedback`** (swipe-left / swipe-right training signal). Mirror the job feedback shape: `{person_id, signal: "positive"|"negative"}`. Powers (a) "don't show me this again", (b) later ranker training data. Blocking for a real swipe deck — without this, swipe-left is a client-only illusion.
2. **`POST /api/ranker/candidates/<id>/reveal-email`** (or `GET`, TBD). Firm cache is emailless by design. On swipe-right you'll want to draft an email — that requires a Hunter lookup keyed on `firstName + lastName + company`. Not built. Suggested response: `{email, source, verified, score}`.
3. **`POST /api/ranker/candidates/<id>/save`** (combined save + optional draft) — nice-to-have. Today you'd chain `POST /api/contacts/bulk` (persist) + whatever email-generation endpoint the job flow currently uses (draft). If chaining is ugly on the client, a single endpoint here is easy to add.

None of these are hard — flag which you need first and I'll turn them around.

---

## 3. Empty-state and error contract

| Status | Body | What Rylan does |
|---|---|---|
| **200** with `candidates: [...]` | Normal deck. `count = candidates.length`. | Render deck. |
| **200** with `candidates: []`, `count: 0`, `reason: "no_candidates"` | Deck empty. Two causes: sparse profile OR zero firm_employees hits. Both non-error. | Render empty-state screen. Prompt onboarding completion if sparse profile suspected. **Never treat as error.** |
| **401** | Firebase auth failed. | Standard re-auth flow — same as every other endpoint. Not ranker-specific. |
| **500** with `{"error": "Database not initialized"}` | Backend health issue, not user issue. | Retry with backoff, log for observability. Not expected in normal operation. |
| Anything else 5xx | Unexpected. Ranker never raises internally — an unexpected 5xx means Flask/auth broke upstream. | Retry with backoff, surface generic error state, log. |

Same call from the same user returns the same deck (deterministic). If Rylan needs "reshuffle" or "give me a different deck," that's a follow-up.

---

## 4. Known gaps — do NOT build against these

- **No `hometown` field on `person`.** `HometownSignal` is extracted upstream (per-contact) but not wired into scoring or the response payload. Don't render a hometown chip. When wiring lands it'll be a deliberate contract addition — the strict-equality allowlist tests will fail loudly so you're told to update the client rather than the field silently appearing.
- **Sparse-profile users get an empty deck.** If a user has no `dreamCompanies` AND no `academics.school`, ranker returns `count=0`. Not a bug — refusing to full-scan `firm_employees` for a broad "everyone" query is safety, not incompleteness. Client fix: nudge user to complete onboarding.
- **No fresh-PDL fallback.** When `firm_employees` has zero hits for a user's signals, we return an empty deck rather than firing a live PDL search. Live search would need a query and would burn credits. If empty-deck rate looks high in metrics we'll wire a targeted PDL follow-through, but for now, don't assume the deck is ever backfilled by a live provider.
- **Ranker exclude-known-contacts uses `(firstName, lastName, company)` triple.** If two people share all three at a company you've saved, both get suppressed. Rare enough to ignore for MVP; flag if you see it in the wild.

---

## Quick reference

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
    generatedAt: ISO8601
  }

→ 200 { candidates: [], count: 0, reason: "no_candidates", generatedAt }
```

Ping me (Deena) as soon as you know which of §2's three gaps blocks your
first working prototype. That'll be the next server ticket.
