# Auto-apply filler — bug handoff

> Found dogfooding the **mobile** auto-apply against **real Greenhouse forms**
> (Anthropic, Robinhood) as an Elite user. The app side is done — swipe →
> background submit → Applied tab → in-app "Needs your input" resolve all work,
> and answers flow back to the filler as `edited_answers`. Everything below is
> in the **backend filler** (`app/services/auto_apply/`), which is where the
> submissions are actually getting stuck.
>
> Test account uid: `iv7Rl3q0iGSLNekiylbKx200eDE2`. Jobs hit:
> Robinhood `greenhouse_robinhood_8003458` ("Assistant General Counsel"),
> Anthropic `greenhouse_anthropic_5271346008` ("Platform Security – OpenBMC").

## 1. react-select comboboxes never commit → infinite `needs_attention` loop  ⛔ TOP PRIORITY

**Symptom.** Any field rendered as a react-select combobox (Greenhouse "Location
(City)", country-of-residence, some Yes/No selects) gets the *right* answer typed
in, but the field stays `aria-invalid='true'` and is kicked to the Needs-Attention
drawer. The user answers it in the app, it resumes with `edited_answers`, and it
**fails the exact same way** — so it loops forever. No profile value or library
hit can fix it because the answer is correct; the *commit* is what fails.

**Evidence (Robinhood `candidate-location`, answer came from the user's drawer input):**
```
[auto_apply.retry] refilled field_id='candidate-location' field_type='select'
   answer='Los Angeles, California, United States' source='drawer'
   dom={... 'aria_invalid': 'true' ...}
[auto_apply.retry] post-resubmit field_id='candidate-location'
   dom={'present': True, 'value': '', 'checked': False, 'aria_invalid': 'true'}   ← still invalid
[auto_apply]   post-submit pending questions (deduped): 1
```
DOM chain (from `combodiag`):
```
input#candidate-location.select__input[role=combobox]
  └ div.select__value-container--has-value
     └ div.select__control--error.select__control--is-focused
```
Same failure on `question_67596436` (Robinhood "Have you ever worked here") and
`question_16622585008` (Anthropic "AI Policy for Application").

**Likely cause.** The fill types the value into the `select__input` but never
selects the option from the listbox, so react-select's internal state never
updates and `value` stays empty (`'value': ''`). The "Combobox v3" path isn't
landing on these tenants.

**Suggested fix (standard react-select via Playwright):**
1. Click the `.select__control` to open the menu.
2. Type the query into `.select__input`.
3. **Wait for options to render** — `[id^="react-select"][id*="option"]` (Greenhouse
   uses `react-select-*-option-N` ids).
4. Select by **clicking the matching `[role="option"]`** (or focus the input and
   press `ArrowDown` until the option is `aria-selected`, then `Enter`). A bare
   `.fill()` / `.type()` will never commit.
5. **Verify** the `.select__value-container--has-value` now contains a
   `.select__single-value` chip before moving on; retry once if not.

Until this lands, every combobox question loops — it's the single biggest blocker
to a successful submit.

## 2. EEO option-match fails on "decline"

**Symptom.** Anthropic `#disability_status` with answer `"I don't wish to answer"`:
```
unmapped: '#disability_status' ("I don't wish to answer")
   reason='no option matched any prefix of the answer'
```
**Cause.** `_match_option` doesn't treat decline-phrasings as equivalent.
**Fix.** Add decline-synonym matching: `"I don't wish to answer"`,
`"Decline to self-identify"`, `"Prefer not to answer"`, `"I do not wish to answer"`
should all match each other. (Same applies to gender/race/veteran selects.)

## 3. Submit fails silently with `aria-invalid: 0`

**Symptom (Anthropic `5271346008`):**
```
aria-invalid field count: 0
#first_name still on page (form not unmounted): True
STATUS: submit_failed — form is still on the page after Submit (likely silent validation)
unmapped: '#disability_status'  (see #2)
unmapped: question_16622592008 ('address from which you plan on working') reason='needs_user'
```
No field flags invalid, but Greenhouse didn't accept the submit. Probably the
unmatched disability select (#2) plus the unanswered work-address question (which
has no profile slot — the resolver mapped it to `preferences.openToRelocation`,
which is the wrong slot). Worth: (a) a real slot for "current/work location +
address," and (b) better post-submit failure detection so this reports *why*.

## 4. Confirmation screenshots are dropped every run

```
WARNING auto_apply screenshot too large for Firestore (2008448 bytes); dropping
```
Every run. The post-submit screenshot exceeds Firestore's ~1MB doc limit, so it's
silently dropped and there's **zero visual evidence** of why a submit failed
(which is exactly what's needed to debug #1 and #3). Store it in Cloud Storage and
put the URL on the doc, or downscale/JPEG-compress under 1MB.

## Cosmetic

- `FD from fork parent still in poll list: fd(17 …)` floods the logs — gRPC/Firebase
  fork noise from running Playwright in the same process. Not breaking, but it
  buries the useful `[auto_apply]` lines.

## Repro

1. uid above, Elite, Gmail connected, application profile complete (work auth set).
2. Auto-apply a Greenhouse job whose form has a **react-select "Location (City)"**
   (e.g. Robinhood `8003458`).
3. It reaches `needs_attention` on `candidate-location`. Answer it in the drawer →
   it resumes → fails identically. That's bug #1.

## Priority

1. **#1 combobox commit** — nothing submits cleanly until this works.
2. **#4 screenshot storage** — needed to debug #1/#3.
3. **#2 EEO decline-match** — easy win.
4. **#3 silent-fail detection + work-location slot.**

---

## UPDATE — 2026-06-22 runs (SpaceX / Stripe / Robinhood, parallel)

Re-ran with the current `_fill_combobox` (greenhouse.py:2015 — the prefix-try +
score-and-ArrowDown path). It is NOW half-working: on SpaceX, `candidate-location`,
all three GPA selects, and `Active Security Clearance(s)` recovered on retry
(`[idx=0]` → `aria_invalid='false'`). So the scoring + ArrowDown+Enter commit is
landing **when the listbox opens and an option matches**. The remaining failures
split cleanly into TWO distinct bugs:

### 1a. Listbox never opens on some selects → `[no-match]` on answers that WOULD match

`question_37031548002` "Are you legally authorized to work in the US?" — answer
`'Yes'`, options are Yes/No, exact match would score 1000 — yet:
```
[auto_apply.retry] refilled ... answer='Yes' source='profile'
   dom={'value':'', 'aria_invalid':'true'} filled_entry='combo:Yes[no-match]'
```
`[no-match]` means the scorer polled for `[role=option]` for 2s and saw **zero
options** — i.e. the menu never opened. Same shape on Robinhood `1255` gender
(`combo:Male[no-match]`). These are the hidden-input EEO/work-auth selects where
`el.click()` + the `.select__control` walk-up doesn't open the menu on the
post-submit retry pass. **The open step, not the match step, is failing here.**
Suggest: before typing, assert the menu opened (`[role=option]` count > 0 within
~1s); if not, retry the open via `.select__control` mousedown (react-select opens
on mousedown, not click) or `el.focus()` + `ArrowDown` (the same path
`harvest_combobox_options` uses successfully). Don't type until the menu is open.

### 1b. Resolver returns a non-option answer (separate from the commit bug)

- `question_37031549002` "Citizenship Status" — LLM returned `'I Acknowledge'`,
  options were the six `(a)…(f)` immigration statuses → dropped to NEEDS_USER.
  The LLM answered a different question. Resolver should be **option-aware**: pass
  the harvested option list into the LLM prompt and constrain the answer to one of
  them (for a US-authorized citizen, `(a) U.S. citizen…`).
- Gender `'Male'` vs option label `'Man'` → no-match. Add a synonym layer in the
  scorer / resolver: male↔man, female↔woman, plus the decline-synonyms from #2.

**Net:** 1a is a browser-open-timing fix (needs a live Browserbase loop to verify —
this is the one to nail this morning). 1b is a resolver/synonym fix, pure logic,
testable without a browser. They're independent; fixing only one still loops.

### #4 still firing
`auto_apply screenshot too large for Firestore (1463020 bytes); dropping` on every
run. Still zero visual evidence for 1a. Cloud Storage + URL, or JPEG< 1MB.
