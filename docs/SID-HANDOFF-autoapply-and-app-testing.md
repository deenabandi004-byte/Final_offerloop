# Handoff: Auto-Apply + iOS App Testing

**Written 2026-07-13.** For Sid, taking over app testing + auto-apply from Rylan.
Everything here is verified against live systems, not assumed. Where something is
a guess, it says so.

---

## 0. The 60-second version

- The iOS app is in **TestFlight (Build 10)**, pointed at **staging**, pending App
  Store submission.
- **Auto-apply was working in June (5 real applications submitted), then stopped
  dead in July.** It was not a code rot — **Greenhouse changed underneath us**.
- Today we found and fixed the causes. Auto-apply now fills both Greenhouse and
  Ashby forms completely, resume attached. **One wall remains: Greenhouse now
  emails an 8-character human-verification code** before it will accept a submit.
- **The single open decision** is how to handle that code (§7).

---

## 1. What auto-apply is, and how it runs NOW

The architecture changed today. Read this before touching anything.

```
app  ──POST /api/job-board/auto-apply/<job_id>/submit──►  WEB (Flask/gunicorn)
                                                            │  enqueues only.
                                                            │  NEVER starts a browser.
                                                            ▼
                                                      Redis (offerloop-queue)
                                                            │
                                                            ▼
                                              WORKER (offerloop-worker, RQ)
                                                 └─ Playwright ──► Browserbase (remote Chrome)
                                                       └─ fills the ATS form
```

**Why it moved.** Starting Playwright inside a gunicorn web worker **killed the
entire container ~23 seconds in, every time** (reproduced 3/3, including with no
deploy in flight). Render restarted the box, which took **drafts, Scout, the feed
and Gmail down with it**. A secondary feature was a loaded gun pointed at the hero.

`worker.py` + `services/rq_queue.py` **already existed** for Loop cycles — its
docstring literally says long work doesn't belong on the web workers. Auto-apply
now rides those same rails. We reused; we did not rebuild.

**The payoff is containment.** If the filler crashes now, it kills a *worker* (RQ
requeues) — the web service keeps serving. Verified: the app stayed up through
every failure we induced today.

**Safety default:** `rq_queue`'s dev fallback runs jobs *in-process* — which IS
the crash. So `submit` **refuses with 503 `AUTOAPPLY_UNAVAILABLE`** if no RQ
worker is configured, checked *before* the credit deduction so a refusal never
charges. No Redis ⇒ auto-apply is cleanly off, never box-killing.

### Files that matter
| File | What it does |
|---|---|
| `app/routes/auto_apply.py` | Endpoints. Enqueues only. Holds the **read-time stale reaper**. |
| `app/services/auto_apply/jobs.py` | The RQ entrypoint. Owns the wall-clock guard + refund. |
| `app/services/auto_apply/runner.py` | Dispatches to the right filler by ATS. |
| `app/services/auto_apply/greenhouse.py` | **Sid owns this.** The big one. |
| `app/services/auto_apply/ashby.py`, `lever.py` | Same shape, smaller. |
| `app/services/auto_apply/_form_filler_common.py` | Shared helpers (incl. dead-posting detection). |
| `app/services/rq_queue.py` | `enqueue()` + JOB_REGISTRY. |

### Two watchdogs (both needed — learn from our scars)
1. **In-worker wall-clock (240s)** — `jobs.py`. Catches a hung fill.
2. **Read-time stale reaper (300s)** — `auto_apply.py::_reap_if_stale`. Runs when
   the client polls `/status` or `/list`. **This one survives worker death** — if
   the worker is killed mid-fill, nothing in-process is alive to finalize the doc,
   and a job would sit at `running/filling_form` **forever** with credits held.
   We had 4 such zombies. Refunds are idempotent (`credits_refunded`) so the two
   guards can't double-refund.

---

## 2. What actually broke (the July regression)

Rylan was right that it "used to work." Data across all users, all time:

```
June:  5 submitted, 3 failed     ← working (Zscaler, Bugcrowd, Discord, Chime, Databricks)
July:  0 submitted, 35 failed    ← stopped dead
```

**Greenhouse changed on their side. Two things:**

1. **They migrated to `job-boards.greenhouse.io`**, where the bare job page **no
   longer renders the application form inline**. Our filler waits for
   `#first_name` and it simply isn't there anymore → "form did not render at any
   candidate URL" appeared everywhere, looking like our bug.

2. **They added an emailed 8-character human-verification code.** The form fills
   perfectly, Submit clicks, and Greenhouse **silently refuses** — no
   `aria-invalid`, no error text. This is the wall we're at now (§7).

A third, self-inflicted issue compounded it: **form URLs were derived from
`job_id`**, but job ids are namespaced by **source** (`simplify_…`,
`fantasticjobs_…`), not by ATS. So the reliable fallback URLs (Greenhouse's embed
endpoint, Ashby's `/application`) **were never even built** for most jobs.

---

## 3. What we fixed today (all pushed to `staging/mobile-field`)

| Commit | Fix |
|---|---|
| `f365aecc` | Auto-apply runs in the **RQ worker**, never the web process |
| `c074c5d0` | Firebase creds via **env JSON** — RQ forks a child per job and the child couldn't read Render's mounted secret file |
| `cdf1aee2` | **Greenhouse**: derive form URLs from `apply_url`, not `job_id`; embed endpoint first |
| `1b051a60` | **Ashby**: use `/application` (where the form actually is); bare page has **no form** |
| `ae84c7d7` | **School matching** — see §4, this one is serious |
| `8ed24cab` | Greenhouse code-gate → `needs_verification`; **dead postings reported honestly**; Lever form-first |
| `b7947fb4` | Ingestion rejects junk company names (a Simplify record had `company: "Internship"`) |

**Result — verified by live dry-runs:**
- **Greenhouse (FFE Inc):** `dry_run_complete`, **17 fields** filled — name, email,
  phone, country, **resume**, school, degree, discipline, all 4 EEO fields, and 3
  custom screening questions.
- **Ashby (Airbyte):** `dry_run_complete`, resume attached, custom questions answered.

---

## 4. ⚠️ The bug Sid most needs to know about

A **real application to Docugami went out with School = "Vanguard University of
Southern California."** Rylan attended **University of Southern California**.
Vanguard is a *different institution*. **We were putting false information on real
job applications in a user's name.**

Cause, in greenhouse.py's react-select option scorer:
```js
if (t.includes(wantedFull)) return 800;   // any option CONTAINING the answer
```
"Vanguard University of Southern California" *contains* "University of Southern
California", so when the exact option hadn't loaded into the async-filtered list,
the impostor won.

**The rule was conceptually wrong for institutions:**
- extra **trailing** words = same entity, more detail (`"… – Marshall"`) → fine
- extra **leading** words = a **different entity** (`"Vanguard University of…"`,
  `"Northeastern Illinois University"`) → **not fine**

Now: `startsWith` → 800 (accept). `contains`-but-not-`startsWith` → **350, below
the 400 accept bar** → field left blank for the user.

> **The principle to keep: a blank field beats a false one.** When the filler
> can't confidently identify something, it must decline rather than guess. We are
> writing to real employers under a real person's name.

Ironically, **Greenhouse's verification code saved us** — those wrong-school
applications were being rejected before they went out.

---

## 5. Testing the app (Sid's day-to-day)

### Get the build
- **TestFlight → Offerloop → Build 10.** Delete + reinstall for a clean run
  (fresh onboarding, no stale local state).
- Build 10 contains: **resume upload**, notifications gate, profile-persistence fix.
- ⚠️ **Native modules can't OTA.** `expo-document-picker` moved the runtime
  fingerprint, so JS-only changes OTA fine but native ones need a new build.

### The demo/reviewer account
- **`applereview@offerloop.ai`** — password is in `APP-STORE-METADATA.md` (not
  duplicated here). uid `DPiaCKOnHghLl4CwzrCZd2N7cOp2`.
- **Free tier, on purpose.** The app is a **limit-model**: free gets *every*
  feature (draft, send, auto-apply, preps), bounded by credits (300/mo ≈ 30
  swipes at 10 cr) — **not** feature-walled. If you see a feature refuse for
  "tier" reasons on the app, that's a bug.
- Gmail connected as **`offerloop0@gmail.com`** — drafts land in *that* mailbox's
  **Drafts folder** (not the Inbox; people look in the wrong place).
- Application profile + a real resume are already on the account, so auto-apply
  has everything it needs.

### The app points at STAGING
`offerloop-staging.onrender.com`, deployed from branch **`staging/mobile-field`**.
**Do not merge that branch to `main`** — the app and the web are deliberately
**separate economic entities** (different tier rules, different limits). `main` is
the web.

### Testing auto-apply without hunting for a job card
Drive the API directly with a **dry run** (fills the form, does NOT submit a real
application to a real company — never test with real submits):

```bash
# mint an ID token for the demo user, then:
POST https://offerloop-staging.onrender.com/api/job-board/auto-apply/<job_id>/submit
     {"dry_run": true}
```
Then read the result from Firestore: `users/<uid>/autoApplyJobs/<auto_apply_id>` —
look at `status`, `filled_summary`, `unmapped`, `failure_reason`.

**`screenshot_b64` on the doc is the single most valuable debugging artifact** —
it's a full-page PNG of what the browser actually saw. The school bug and the
verification-code gate were both found by *looking at it*. Decode and open it
before theorizing.

---

## 6. Diagnosing (do this before guessing)

### Worker logs (where the browser actually runs)
`RENDER_API_KEY` is in the root `.env`. Worker service id:
**`srv-d9a0e8l7vvec738cocjg`** (`offerloop-worker`), owner `tea-d3213fmr433s738u62j0`.

```bash
curl -s -H "Authorization: Bearer $RENDER_API_KEY" \
  "https://api.render.com/v1/logs?ownerId=tea-d3213fmr433s738u62j0&resource=srv-d9a0e8l7vvec738cocjg&limit=200"
```
The filler logs every step with `[auto_apply]` — candidate URLs tried, Browserbase
session id, which fields filled. **Web logs will show you nothing about a fill** —
the browser doesn't run there anymore.

### Render services
| Service | id |
|---|---|
| `offerloop-staging` (web) | `srv-d93d0fcvikkc73a1igmg` |
| `offerloop-worker` (RQ) | `srv-d9a0e8l7vvec738cocjg` |
| `offerloop-queue` (Redis, free) | `red-d9a0dt57vvec738cnt2g` |

Worker env needs `REDIS_URL` **and** `FIREBASE_SERVICE_ACCOUNT_JSON` (the raw
service-account JSON — *not* the secret-file path; forked RQ children can't read
Render's mounted secret files). Start command must put **both** the repo root and
`backend/` on `PYTHONPATH` — the codebase mixes `from app.…` and
`from backend.app.…` imports.

---

## 7. ⛔ The open decision: Greenhouse's verification code

Greenhouse emails the applicant an 8-character code and will not accept a submit
without it. **We cannot and should not defeat that headlessly.** Today it routes to
**`needs_verification`** → the app shows a "Finish in browser" card, everything we
filled is preserved, and the user types the code themselves.

**The option on the table:** the code is emailed **to the user**, and their Gmail
is **already connected with read scope**. So we could **read the code from their
own inbox, enter it, and submit** — their email, their application, their explicit
intent. That restores true end-to-end auto-apply.

**This is a judgment call for the founders, not an engineering detail.** It is the
difference between "auto-apply gets you to the one-yard line" and "auto-apply
actually applies." It is also, arguably, exactly the human-intent check Greenhouse
wants — the user *did* ask to apply. Decide deliberately.

---

## 8. Still open (ranked)

1. **The verification-code decision** (§7) — blocks true end-to-end.
2. **Stale job pool.** `expires_at` flagged only **3 of 7,980** jobs as expired,
   yet several we tried **404'd** (Doctors Without Borders, Multiply Labs). Users
   swipe ghosts. Fillers now stamp **`job_gone`** — wire that to auto-expire a job
   from the feed the moment a filler proves it's dead. Cheap and self-healing.
   **Raise freshness/expiry signals with the new data provider.**
3. **Remove-resume button** — committed, needs the next build.
4. **LinkedIn field mapping** — minor; shows as `unmapped` on some forms.
5. **Duplicate-draft flicker** — a draft briefly appears in the Inbox then
   vanishes (optimistic insert + rollback). Cosmetic, unconfirmed, lowest priority.
6. **Submission** — reviewer sign-in verified on a real build → submit for review.

## 9. Pool facts (for the provider call)
- **7,980 jobs. 62% (4,993) are auto-apply eligible** (Greenhouse/Ashby/Lever).
- Sources: greenhouse 5,598 · simplify 1,278 · ashby 742 · fantasticjobs 313 · lever 49.
- ~3,000 have **custom career-page URLs** (stripe.com, databricks.com…) that are
  Greenhouse-backed — these rely on the `job_id` path, so **both** URL derivation
  paths must keep working.
- **Ask any new provider for:** trustworthy freshness/expiry, the **real ATS
  `apply_url`** (not a redirect wrapper — auto-apply lives or dies on it), and
  clean company fields.
