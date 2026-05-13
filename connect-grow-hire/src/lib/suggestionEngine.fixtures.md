# Suggestion Engine Fixtures

Manual validation contract for `generateSuggestions()`. Walk through each fixture
before merge to confirm engine logic matches expected output.

All fixtures use `context: 'find'` and `dismissed: new Set()` unless noted.

---

## Fixture 1: dream_company -- no outreach at all

**Goals:**
```json
{ "dreamCompanies": ["Goldman Sachs", "McKinsey"] }
```

**Outbox threads:** `[]`

**Expected output (2 cards):**
1. `{ type: "dream_company", title: "No outreach to Goldman Sachs yet", subtitle: "Start a search to find contacts", company: "Goldman Sachs" }`
2. `{ type: "dream_company", title: "No outreach to McKinsey yet", subtitle: "Start a search to find contacts", company: "McKinsey" }`

**pipeline_gap should NOT fire:** fewer than 3 dreamCompanies.

---

## Fixture 2: dream_company -- partial outreach, under threshold

**Goals:**
```json
{ "dreamCompanies": ["JPMorgan"] }
```

**Outbox threads:**
```json
[
  { "id": "c1", "company": "JPMorgan", "pipelineStage": "waiting_on_reply", "followUpCount": 0, "emailSentAt": "2026-05-01T10:00:00Z", "inOutbox": true, "updatedAt": "2026-05-01T10:00:00Z" },
  { "id": "c2", "company": "JPMorgan", "pipelineStage": "draft_created", "followUpCount": 0, "emailSentAt": null, "inOutbox": true, "updatedAt": "2026-05-02T10:00:00Z" }
]
```

**Expected output (1 card):**
1. `{ type: "dream_company", title: "No outreach to JPMorgan yet", company: "JPMorgan" }`

(2 threads < 3 threshold, no success-stage thread)

**Also expected: follow_up card.** Thread c1 is waiting_on_reply with emailSentAt 11+ days ago
and followUpCount === 0, so a follow_up card should fire:
`{ type: "follow_up", title: "1 contact hasn't replied in 7+ days" }`

**Final ordering (by priority):** dream_company (9) first, then follow_up (8).

---

## Fixture 3: dream_company -- should NOT fire (3+ threads)

**Goals:**
```json
{ "dreamCompanies": ["Bain"] }
```

**Outbox threads:**
```json
[
  { "id": "c1", "company": "Bain", "pipelineStage": "waiting_on_reply", "followUpCount": 1, "emailSentAt": "2026-05-10T10:00:00Z", "inOutbox": true, "updatedAt": "2026-05-10T10:00:00Z" },
  { "id": "c2", "company": "Bain", "pipelineStage": "draft_created", "followUpCount": 0, "emailSentAt": null, "inOutbox": true, "updatedAt": "2026-05-09T10:00:00Z" },
  { "id": "c3", "company": "bain", "pipelineStage": "email_sent", "followUpCount": 0, "emailSentAt": "2026-05-08T10:00:00Z", "inOutbox": true, "updatedAt": "2026-05-08T10:00:00Z" }
]
```

**Expected output:** `[]` (empty)

3 threads at Bain (case-insensitive match on "bain"). dream_company does not fire.
No follow_up: c1 has followUpCount 1 (already followed up), c3 is email_sent not waiting_on_reply.

---

## Fixture 4: dream_company -- should NOT fire (success stage)

**Goals:**
```json
{ "dreamCompanies": ["Deloitte"] }
```

**Outbox threads:**
```json
[
  { "id": "c1", "company": "Deloitte", "pipelineStage": "replied", "followUpCount": 0, "emailSentAt": "2026-05-01T10:00:00Z", "inOutbox": true, "updatedAt": "2026-05-05T10:00:00Z" }
]
```

**Expected output:** `[]`

Only 1 thread (under 3), but pipelineStage is "replied" (success stage). dream_company skips.

---

## Fixture 5: pipeline_gap -- one missing company

**Goals:**
```json
{ "dreamCompanies": ["Goldman Sachs", "Morgan Stanley", "JPMorgan"] }
```

**Outbox threads:**
```json
[
  { "id": "c1", "company": "Goldman Sachs", "pipelineStage": "email_sent", "followUpCount": 0, "emailSentAt": "2026-05-10T10:00:00Z", "inOutbox": true, "updatedAt": "2026-05-10T10:00:00Z" },
  { "id": "c2", "company": "Goldman Sachs", "pipelineStage": "waiting_on_reply", "followUpCount": 0, "emailSentAt": "2026-05-09T10:00:00Z", "inOutbox": true, "updatedAt": "2026-05-09T10:00:00Z" },
  { "id": "c3", "company": "Goldman Sachs", "pipelineStage": "replied", "followUpCount": 0, "emailSentAt": "2026-05-08T10:00:00Z", "inOutbox": true, "updatedAt": "2026-05-08T10:00:00Z" },
  { "id": "c4", "company": "Morgan Stanley", "pipelineStage": "draft_created", "followUpCount": 0, "emailSentAt": null, "inOutbox": true, "updatedAt": "2026-05-07T10:00:00Z" }
]
```

**Expected output (2 cards):**
1. `{ type: "dream_company", priority: 9, title: "No outreach to JPMorgan yet" }` -- JPMorgan has 0 threads
2. `{ type: "pipeline_gap", priority: 7, title: "No outreach to JPMorgan, one of your dream companies", subtitle: "Search for JPMorgan contacts to close the gap" }`

**Why dream_company also fires for JPMorgan:** 0 threads < 3, no success stage. Both types can fire for the same company.

**Goldman Sachs dream_company should NOT fire:** 3 threads (>= 3 threshold).
**Morgan Stanley dream_company fires:** 1 thread, no success stage. So actually 3 cards total:
1. `dream_company` for Morgan Stanley (priority 9)
2. `dream_company` for JPMorgan (priority 9)
3. `pipeline_gap` for JPMorgan (priority 7)

Cap at 3, all three show.

---

## Fixture 6: pipeline_gap -- should NOT fire (fewer than 3 dreamCompanies)

**Goals:**
```json
{ "dreamCompanies": ["BCG", "McKinsey"] }
```

**Outbox threads:**
```json
[
  { "id": "c1", "company": "BCG", "pipelineStage": "email_sent", "followUpCount": 0, "emailSentAt": "2026-05-10T10:00:00Z", "inOutbox": true, "updatedAt": "2026-05-10T10:00:00Z" }
]
```

**Expected output (1 card):**
1. `{ type: "dream_company", title: "No outreach to McKinsey yet" }`

**pipeline_gap should NOT fire:** only 2 dreamCompanies (threshold is 3+).

---

## Fixture 7: follow_up -- multiple stale contacts

**Goals:**
```json
{ "dreamCompanies": [] }
```

**Outbox threads:**
```json
[
  { "id": "c1", "company": "Google", "pipelineStage": "waiting_on_reply", "followUpCount": 0, "emailSentAt": "2026-04-30T10:00:00Z", "inOutbox": true, "updatedAt": "2026-04-30T10:00:00Z" },
  { "id": "c2", "company": "Meta", "pipelineStage": "waiting_on_reply", "followUpCount": 0, "emailSentAt": "2026-04-28T10:00:00Z", "inOutbox": true, "updatedAt": "2026-04-28T10:00:00Z" },
  { "id": "c3", "company": "Amazon", "pipelineStage": "waiting_on_reply", "followUpCount": 1, "emailSentAt": "2026-04-25T10:00:00Z", "inOutbox": true, "updatedAt": "2026-04-25T10:00:00Z" }
]
```

**Expected output (1 card):**
1. `{ type: "follow_up", title: "2 contacts haven't replied in 7+ days", subtitle: "Follow up to keep the momentum" }`

**c3 excluded:** followUpCount is 1 (already followed up).
**No dream_company/pipeline_gap:** dreamCompanies is empty.

---

## Fixture 8: follow_up -- should NOT fire (recent send)

**Goals:**
```json
{ "dreamCompanies": [] }
```

**Outbox threads:**
```json
[
  { "id": "c1", "company": "Google", "pipelineStage": "waiting_on_reply", "followUpCount": 0, "emailSentAt": "2026-05-11T10:00:00Z", "inOutbox": true, "updatedAt": "2026-05-11T10:00:00Z" }
]
```

**Expected output:** `[]`

emailSentAt is 1 day ago (< 7 days). follow_up does not fire.

---

## Fixture 9: dismissed cards filtered out

**Goals:**
```json
{ "dreamCompanies": ["Goldman Sachs", "McKinsey"] }
```

**Outbox threads:** `[]`

**Dismissed:** `new Set(["dream_company_goldman sachs"])`

**Expected output (1 card):**
1. `{ type: "dream_company", title: "No outreach to McKinsey yet" }`

Goldman Sachs card filtered by dismissed set (id is `dream_company_goldman sachs`).

---

## Fixture 10: empty goals -- no cards

**Goals:**
```json
{ "dreamCompanies": [] }
```

**Outbox threads:** `[]`

**Expected output:** `[]`

No dreamCompanies, no threads. All three generators return empty.
