# iOS Ranker Prereqs — PDL Field Expansion + Attribution Loop (v2)

## Context

Prereqs for the iOS people-swiping / matching-ranker pivot. Backend only,
no web behavior changes. This revision folds in corrections on
HometownSignal derivation, seniority ordering, careerSpan units, null
handling of legitimate zeros, commit ordering for denormalized
attribution, and the corrected features-snapshot path.

Constraints (unchanged): no feature flags, no web-facing behavior
changes, one logical change per commit, do not touch
`student_job_ranker.py` or `/api/jobs/*`, hard exclusion on
`sex` / `birth_date` / `birth_year`.

---

## Answers to the six investigation questions

| # | Answer |
|---|---|
| Q1 | `PDL_DATA_INCLUDE` applied to Search only (3 sites: `pdl_client.py:3656`, `:3924`, `:3939`); Enrich (`:5821`, `:5899`) sends no filter. |
| Q2 | Silent drop at `contacts.py:498-509` (extraction) and `:586-607` (write dict). Single-contact `POST /api/contacts` is Pydantic-strict but not our flow. |
| Q3 | Web is safe. Named-field access everywhere. Backend returns raw `to_dict()`, but web ignores unknown fields. No iOS-specific route — both clients hit same endpoints. |
| Q4 | Webhook returns 200 before processing (`:826` after thread spawn at `:820`), so Pub/Sub ack deadline is not the risk. Real risk: existing `email_sent` writes use `.add()` — already producing duplicates on Pub/Sub redelivery today. |
| Q5 | Contact-doc writes are idempotent by construction. Recommendation-event writes are not; fixed via optional `doc_id` on `log_recommendation_event`. |
| Q6 | Absent = unknown, no backfill script, no sentinel values. iOS ranker handles nulls (standard for GBM). |

## Sensitive-field exclusion (do not delete)

Never add to `PDL_DATA_INCLUDE`, never persist, never derive:
`sex`, `birth_date`, `birth_year`. Enforced by comment above the
include list.

---

## What changed from v1

| # | Change | Reason |
|---|---|---|
| 1 | `OriginCity` → `HometownSignal` + `HometownSignalConfidence` | College city ≠ hometown; USC student from Bangalore was going to be recorded as Los Angeles, killing the exact match the field exists to enable |
| 2 | `SeniorityLevel` uses explicit MAX over a rank table | PDL doesn't document `job_title_levels` ordering |
| 3 | `YearsExperience` → `CareerSpanMonths`, computed in months from `start_date` deltas | Year-of subtraction lies by 12 months; ranker should also know we're measuring span with gaps, not net experience |
| 4 | Null-write predicate is `is not None`, not truthiness | Zero is legitimate for new grads and month-1 starts (Offerloop's core demographic) |
| 5 | Commit 4 and Commit 5 swapped | Denormalize at send. Reply/bounce reads off the contact doc, not via `_lookup_impression_context` which returns the LATEST impression (wrong attribution when a contact was recommended twice) |
| 6 | Signals read from `features_snapshot.warmth_signals`, not top-level `signals` | Verified in `recommendation_events.py:79` and `runs.py:1068-1071` |
| 7 | `fetch_size` reduction DROPPED from Commit 1 | Halving page size doubles round trips, `RETRY_WALL_TIME_BUDGET_SEC=9.0` (`pdl_client.py:5249`) → more escalations → more credits spent. Replaced with a measurement step. |
| 8 | Verification uses PDL dashboard, not response body | `charged_credits` may not exist on search responses. Dashboard is ground truth. |

---

## Outstanding question — duplicate `email_sent` audit

How many duplicate `email_sent` recommendation_events rows exist today
from Pub/Sub redelivery, with a date range?

**Script to run:** `backend/scripts/audit_duplicate_email_sent_events.py`

Group by `(uid, contact_email, event_date, impression_request_id)`.
Redelivery produces identical `impression_request_id` because the
lookup is deterministic per (uid, contact_email); a legitimate re-email
of the same person days later shows up as a different `event_date`.

```python
from collections import Counter
from app.extensions import get_db

db = get_db()
docs = db.collection("recommendation_events") \
          .where("event_type", "==", "email_sent").stream()

groups = Counter()
dates_with_dupes = Counter()
raw = []

for d in docs:
    data = d.to_dict() or {}
    key = (
        data.get("uid", ""),
        data.get("contact_email", ""),
        data.get("event_date", ""),
        data.get("impression_request_id", ""),
    )
    raw.append((key, data.get("event_date", "")))
    groups[key] += 1

for key, event_date in raw:
    if groups[key] > 1:
        dates_with_dupes[event_date] += 1

total = sum(groups.values())
dupe_groups = sum(1 for v in groups.values() if v > 1)
excess = sum(v - 1 for v in groups.values() if v > 1)
print(f"total email_sent events: {total}")
print(f"grouping keys with count > 1: {dupe_groups}")
print(f"excess duplicate rows: {excess}")
print(f"duplicate rate: {excess/total:.2%}" if total else "n/a")
if dates_with_dupes:
    print(f"first date with duplicates: {min(dates_with_dupes)}")
    print(f"last  date with duplicates: {max(dates_with_dupes)}")
```

**Decision gate on the output:**

- If excess < 5% of total: training data is fine, dedup on read.
- If 5% ≤ excess < 20%: dedup on read and stamp a `training_notes.md` warning.
- If ≥ 20%: re-derive `email_sent` labels from the contact docs
  (`emailSentAt`, `gmailThreadId`) instead of `recommendation_events`.

This script is one-off, not part of any commit. Run before Commit 5 lands.

---

## Proposed commits (order corrected)

### Commit 1 — PDL request shape (no page-size change)

**File:** `backend/app/services/pdl_client.py`

| Change | Where |
|---|---|
| Add new fields to `PDL_DATA_INCLUDE` with HARD-EXCLUSION comment | `:71-86` |
| Raise experience slice `[:2]` → `[:5]` | `:3510` |
| **Do NOT** reduce `fetch_size` from 100 | `:3653` untouched |
| **Do NOT** add `Accept-Encoding: gzip` header | `requests` library sends `Accept-Encoding: gzip, deflate` by default; verify by inspecting `_session.headers` at the session init and confirm before writing this off entirely |

Field additions (all Base bundle per the ask):

```
education.majors, education.minors, education.degrees,
education.start_date, education.end_date,
education.school.location.locality,
education.school.location.region,
education.school.location.country,
job_title_levels, job_title_role, job_title_sub_role, job_title_class,
experience.title.levels, experience.title.role,
experience.title.sub_role,
experience.start_date, experience.end_date,
experience.company.location.metro,
skills, interests,
job_start_date, job_last_changed,
location_names, location_metro, regions, countries
```

HARD-EXCLUSION comment (verbatim):

```python
# HARD EXCLUSION — do not add: sex, birth_date, birth_year.
# PDL's AUP prohibits profiling on protected characteristics, and the
# iOS ranker's training data must not contain them. Adding these fields
# is a policy violation, not a technical decision.
```

**Before-commit measurement (run once, delete):** temporary debug log
after `_session.post(...)` at `:3671` printing
`len(r.content)`, `len(r.text)`, `r.headers.get("Content-Encoding")`.
Fire one page-1 search with `size=100` and the wider include set.
If uncompressed body approaches 1MB, revisit `fetch_size`. If it's
well under (expected), leave it alone.

Also measure p50/p90 total call latency on 10 identical searches
before-and-after applying this commit against a staging user. If p90
rises meaningfully, or if the retry-chain escalation rate rises (grep
logs for `"Wall-time cap hit"` and `"[PDL Retry] Attempt"`), stop and
report the numbers before merging.

### Commit 2 — Extract typed fields from PDL response

**File:** `backend/app/services/pdl_client.py`,
`extract_contact_from_pdl_person_enhanced()` around `:3520`.

Add these keys to the returned contact dict (TitleCase, matching existing
convention):

| Key | Type | Derivation |
|---|---|---|
| `GradYear` | `int \| None` | `end_date.year` of most recent non-HS education entry |
| `Majors` | `list[str]` | `education[i].majors` from most recent college entry |
| `SeniorityLevel` | `str \| None` | See rank table below |
| `CareerSpanMonths` | `int \| None` | Months from `min(start_date across experience)` to today. May be 0 for new grads. |
| `CurrentTenureMonths` | `int \| None` | Months from `experience[0].start_date` to today. May be 0 for month-1 starts. |
| `HometownSignal` | `str \| None` | See derivation below |
| `HometownSignalConfidence` | `"high" \| "low" \| None` | high = from HS entry, low = from `location_names` |
| `Skills` | `list[str]` | `skills[:20]` filtered to strings |
| `Interests` | `list[str]` | `interests[:20]` filtered to strings |

**HometownSignal derivation:**

```
1. During the education loop at :3376-3402, capture HS entries too
   (the existing filter at :3400 only excludes HS from `college_name`,
   not from iteration; extract HS location alongside).
2. Primary: `hs_entry.school.location.locality` from the (first) HS
   entry that has a locality. Emit HometownSignal = that locality,
   HometownSignalConfidence = "high".
3. Fallback: chronologically earliest entry in `location_names`. But:
   PDL does not document `location_names` ordering. Before relying on
   index 0, probe five real profiles by hand (via a scratch script that
   dumps `location_names` alongside `experience` start_dates) to confirm
   ordering semantics. If ordering is not chronological, sort by whatever
   PDL uses (likely oldest→newest based on typical enrichment output).
   Emit HometownSignal = earliest locality, HometownSignalConfidence = "low".
4. No HS entry AND no location_names → both fields null.

DO NOT infer hometown from name, ethnicity, area code, or any other
proxy signal. Any inference from these fields is a policy violation and
would make the ranker discriminatory.
```

**SeniorityLevel derivation:**

PDL `job_title_levels` array ordering is NOT documented. Build an
explicit rank table from PDL's canonical Job Title Levels list. Take the
level with the highest rank in the returned array.

Rank table (verify against PDL's canonical list at
https://docs.peopledatalabs.com/docs/canonical-job-title-levels before
committing — the values below are placeholders that need to be
confirmed):

```python
_SENIORITY_RANK = {
    "training": 0, "unpaid": 0, "entry": 1,
    "senior": 2, "manager": 3, "director": 4,
    "vp": 5, "cxo": 6, "owner": 6, "partner": 6,
}
```

Function: return `max(levels, key=lambda l: _SENIORITY_RANK.get(l, -1))`
if any known level is present, else `None`. Unknown levels ranked at -1
so they never dominate a known level.

**Required comments in the extraction block:**

```python
# CareerSpanMonths is derived from experience[*].start_date, in months.
# NOT computed from paid `inferred_years_experience` bundle. It measures
# time from first job to today INCLUDING gaps — this is span, not net
# experience. Ranker must not treat it as net years worked.
```

```python
# HometownSignal is derived from the person's high-school entry (high
# confidence) or the earliest location_names entry (low confidence).
# It is NEVER inferred from name, ethnicity, area code, phone prefix,
# or any other proxy. Any such inference is a policy violation.
```

### Commit 3 — Persist typed fields via `bulk_create_contacts`

**File:** `backend/app/routes/contacts.py`

| Change | Where |
|---|---|
| Add extraction of 9 keys (TitleCase preferred, camelCase fallback matching existing pattern) | After `:509` |
| Add 9 new camelCase entries to the write dict | Inside/after the `contact = {...}` block at `:586-607` |

Names on the doc (camelCase, per `firebaseApi.ts`):

```
gradYear, majors, seniorityLevel, careerSpanMonths,
currentTenureMonths, hometownSignal, hometownSignalConfidence,
skills, interests
```

**Null handling (corrected):**

```python
# Only OMIT the key when the value is None (unknown). Zero is a
# legitimate value for careerSpanMonths (new grad) and
# currentTenureMonths (started this month) — our core demographic.
# Empty list [] for majors/skills/interests is also written as-is so
# downstream can distinguish "no data" from "unknown".
for key, value in _extracted_typed_fields.items():
    if value is not None:
        contact[key] = value
```

Where `_extracted_typed_fields` maps the 9 new keys to their extracted
values.

Existing 270 users' contacts stay untouched. No migration.

### Commit 4 — Denormalize recommendation attribution at SEND

**File:** `backend/app/routes/gmail_webhook.py`

Extend `_lookup_impression_context()` (`:42-74`) to also return the
signals list, reading from `features_snapshot.warmth_signals` on the
`recommendation_shown` doc (verified path — see `runs.py:1068-1071`
and `recommendation_events.py:79`):

```python
snap = data.get("features_snapshot") or {}
result["signals"] = snap.get("warmth_signals", [])
```

Then, on the sent path around `:536-555`, after `log_recommendation_event`,
write the same attribution values onto the contact doc so reply and
bounce can read them without ever calling `_lookup_impression_context`
again:

```python
contact_ref.update({
    "recommendationRank": impression_ctx.get("rank"),
    "recommendationScore": impression_ctx.get("score"),
    "recommendationSignals": impression_ctx.get("signals", []),
    "recommendationRequestId": impression_ctx.get("request_id", ""),
    "lastOutcome": "sent",
    "lastOutcomeAt": now_iso,
})
```

This is on the same contact doc already being written on the sent path,
so no extra round trip. Idempotent by construction (deterministic contact
ID, `.update()`).

If `impression_ctx.matched` is False (manual entry), we still write
`lastOutcome: "sent"` and leave the ranking fields as `None` / `[]` /
`""`. That's the correct signal for the ranker: "we know this was sent
but we don't have a recommendation to attribute it to."

### Commit 5 — Reply + bounce attribution, reading off contact doc

**Files:**
- `backend/app/utils/recommendation_events.py` — extend
  `log_recommendation_event(...)` with optional `doc_id: str | None`.
  When provided, use `.document(doc_id).set(...)` instead of `.add(...)`.
- `backend/app/routes/gmail_webhook.py`:

**Reply path (`:694-706`):** read attribution off the contact doc rather
than calling `_lookup_impression_context` again:

```python
log_recommendation_event(
    "email_replied",
    uid,
    contact_id=contact_id,
    contact_email=from_email,
    rank=contact_data.get("recommendationRank"),
    score=contact_data.get("recommendationScore"),
    surface="gmail_webhook",
    extra={
        "hours_since_send": hours_since,
        "impression_request_id": contact_data.get("recommendationRequestId", ""),
        "impression_signals": contact_data.get("recommendationSignals", []),
        "has_impression": bool(contact_data.get("recommendationRequestId")),
    },
    doc_id=f"email_replied_{msg_id}",
)
```

Then update the contact doc's outcome:

```python
contact_ref.update({"lastOutcome": "replied", "lastOutcomeAt": now_iso})
```

**Bounce path via `_apply_bounce()` (`:115-182`):**
- Add `msg_id: str` to the signature (already has `now_iso`).
- Log an `email_bounced` recommendation event (does not exist today):

```python
log_recommendation_event(
    "email_bounced",
    uid,
    contact_id=contact_id,
    contact_email=bounced_email,
    rank=contact_data.get("recommendationRank"),
    score=contact_data.get("recommendationScore"),
    surface="gmail_webhook",
    extra={
        "impression_request_id": contact_data.get("recommendationRequestId", ""),
        "impression_signals": contact_data.get("recommendationSignals", []),
        "has_impression": bool(contact_data.get("recommendationRequestId")),
        "from": from_email,
    },
    doc_id=f"email_bounced_{msg_id}",
)
```

- Add `lastOutcome: "bounced"` and `lastOutcomeAt: now_iso` to the
  existing `bounce_updates` dict at `:144-154` (not a second write).
- Also add `"email_bounced"` to `VALID_REC_EVENT_TYPES` in
  `recommendation_events.py:18-26` — it's not listed today.
- Update both `_apply_bounce(...)` call sites in `_process_gmail_notification`
  (grep `_apply_bounce(`) to pass `msg_id`.

**Idempotency:**
Deterministic doc IDs (`email_replied_{msg_id}`, `email_bounced_{msg_id}`)
mean Pub/Sub redelivery just re-writes the same doc. Fixes the class of
bug that already exists on `email_sent`.

---

## Migration / backfill implications

- New contacts get typed fields on write from Commit 3 onward.
- Existing 270 users' contacts untouched. Absent = null. iOS ranker handles.
- Historical `email_replied` / `email_bounced` events (pre-Commit 5)
  have no impression context; those rows drop out of the labeled set.
- No backfill script.
- Contacts sent an email before Commit 4 won't have `recommendationRank`
  etc. stamped. When their reply arrives after Commit 5 ships, the
  reply event will have `has_impression=false` and null ranks. Expected
  and correct — we don't know what recommendation surfaced those
  contacts.

---

## Verification (revised)

**Bundle check (before any commit lands):**

1. Note current PDL dashboard credit balance and today's usage. Run one
   identical Find search on `main` twice, targeting a common query
   (USC alumni at Google, 5 results). Refresh dashboard; record credits
   spent. This is the baseline.
2. Apply Commits 1 + 2 on a scratch branch. Run the identical search
   twice. Refresh dashboard; record credits spent.
3. Report both numbers before Commit 1 merges. If different,
   stop and identify which field caused it (by removing one field at a
   time from `PDL_DATA_INCLUDE` and re-running).

Do NOT rely on `charged_credits` in the response body — PDL search
responses may not include it. Dashboard is ground truth.

**Response-size + latency check (Commit 1 only):**

Add the temporary debug log described in Commit 1. Fire one page-1
search with `size=100` and the wider include set. Record:
- `Content-Encoding` header (must be `gzip` for the bytes-on-wire to
  actually be compressed; if it's absent, `requests` didn't send
  Accept-Encoding, and we need to explicitly set it).
- `len(r.content)` (compressed) and `len(r.text)` (decoded).
- p50 and p90 total call latency over 10 identical searches.
- Retry-chain escalation rate (count `"[PDL Retry] Attempt"` in logs
  divided by number of searches).

Report both to Sid. If p90 latency rises meaningfully, or escalation
rate rises, stop and discuss before merging Commit 1.

Delete the debug log before opening the PR.

**Attribution loop check (Commits 4 + 5, no credit cost):**

Local Gmail webhook tunnel + test account. Send yourself an email
through the app, confirm the sent contact doc has
`recommendationRank / Score / Signals / RequestId / lastOutcome=sent`.
Reply from a second account, confirm:

- exactly one `recommendation_events` doc with ID
  `email_replied_{msg_id}` exists (send Pub/Sub redelivery to verify
  idempotency by hand-hitting the webhook twice).
- `rank` and `score` fields populate from the contact doc, not from
  `recommendation_events` (verify by mutating a stale
  `recommendation_shown` doc between send and reply — the outcome must
  match the send-time snapshot).
- Contact doc has `lastOutcome=replied`.

Same drill for bounce via a manually-crafted DSN.

---

## Critical files (paths for execution)

- `backend/app/services/pdl_client.py` — Commits 1, 2
- `backend/app/routes/contacts.py` — Commit 3
- `backend/app/routes/gmail_webhook.py` — Commits 4, 5
- `backend/app/utils/recommendation_events.py` — Commit 5

## Files intentionally not touched

- `student_job_ranker.py`, `job_board.py`, `/api/jobs/*` — out of scope.
- `contacts.py:88-131` (single-contact POST) — user-typed entry, unrelated.
- Frontend — proved safe in Q3.
- Any feature-flag config — per constraint.

---

## Diff-list summary (for review)

| Commit | Files | Lines touched (approx) |
|---|---|---|
| 1 | `pdl_client.py` | +25 include list, +3 experience slice, +debug log (temp) |
| 2 | `pdl_client.py` | +80 extraction of typed fields inside existing function |
| 3 | `contacts.py` | +15 extract from `rc`, +15 write dict entries |
| 4 | `gmail_webhook.py` | +3 signals in impression lookup, +8 contact denorm write |
| 5 | `recommendation_events.py` +5 doc_id param + VALID_REC set. `gmail_webhook.py` +15 reply, +20 bounce, +2 signature edits |
