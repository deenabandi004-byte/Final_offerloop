"""
Greenhouse form-filler.

Hits the application form via Browserless-hosted Chromium. Verified against
the captured SpaceX fixture at backend/tests/fixtures/auto_apply/greenhouse_sample.html.

Field model (from the SpaceX fixture — Greenhouse forms are consistent):
  Standard text         : id="first_name" / "last_name" / "preferred_name"
                          id="email" / "phone" / "start-year--0" / "end-year--0"
  File uploads          : id="resume" / "cover_letter" (type=file, visually-hidden)
  Combobox (react-select): id="country" / "candidate-location" /
                            id="school--0" / "degree--0" / "discipline--0" /
                            id="gender" / "hispanic_ethnicity" /
                            id="veteran_status" / "disability_status"
  Custom questions      : id="question_XXXXXXXXX" with label[for=...]
                          label IDs end in "-label"

EEO option mapping is conservative — Greenhouse exposes "Decline to identify"
(or similar wording) as a stable option on the gender / race / veteran /
disability dropdowns. The Application Profile defaults sensitive fields to
"decline" which we translate to that option here.

Dry-run mode fills everything but does not click the Submit button. We always
return a full-page screenshot so the user can verify visually in the modal.
"""
from __future__ import annotations

import base64
import logging
import os
import re
from typing import Any, Callable, Dict, List, Optional

# NOTE: this module currently keeps its own copies of helpers that also
# live in `_form_filler_common.py` (id_selector, check_checkbox,
# fill_combobox, react_force_text, resolve_label_text, etc.). They are
# duplicated intentionally: greenhouse.py is the only filler shipping in
# production and we don't want to risk breaking it during the Lever/Ashby
# build-out. Once those land and stabilise, migrate greenhouse.py to use
# the shared module and delete the private duplicates here in a single
# clean refactor pass.


logger = logging.getLogger(__name__)

# Build marker so we can verify at runtime which revision of this module is
# loaded. Prints to stdout on import. When you Ctrl+C and restart the
# backend, this line should appear in the log — if it doesn't, the backend
# isn't actually reloading and any "test" is running against the old code.
_BUILD_TAG = "greenhouse-v19-needs-verification-route"
print(f"[auto_apply] greenhouse.py loaded — build={_BUILD_TAG}")


# Callback signature used by the runner to query the per-user answer library
# from inside the filler. The filler invokes it for any custom question its
# rule-based classifier couldn't resolve.
#   answer_lookup(label_text, field_type, options) -> Optional[Any]
AnswerLookup = Callable[[str, str, Optional[List[str]]], Optional[Any]]


# ---------- public entry point ----------

def run_greenhouse_filler(
    apply_url: str,
    preview: Dict[str, Any],
    edited_answers: Dict[str, str],
    resume_path: Optional[str],
    dry_run: bool,
    job_id: str = "",
    answer_lookup: Optional[AnswerLookup] = None,
    *,
    uid: str = "",
    resume_summary: str = "",
    job_data: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Drive the Greenhouse application form. Returns a result dict the
    runner persists to the autoApplyJobs doc."""
    candidate_urls = _candidate_apply_urls(apply_url, job_id)
    if not candidate_urls:
        return _failure("no usable apply_url for greenhouse")

    token = os.getenv("BROWSERLESS_API_KEY")
    if not token:
        return _failure("BROWSERLESS_API_KEY not set")

    ws_url = f"wss://production-sfo.browserless.io/playwright/chromium?token={token}"

    # Lazy import so the rest of the auto_apply package keeps loading even if
    # playwright isn't installed (e.g. during early dev / partial deploys).
    try:
        from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout
    except ImportError:
        return _failure("playwright not installed; pip install playwright")

    filled: Dict[str, str] = {}
    unmapped: List[Dict[str, str]] = []
    # Prepared answers — the set of {label, answer, source} records the
    # verification-required UX surfaces to the user when CAPTCHA blocks
    # submit. Populated lazily by _fill_custom_questions and the standard
    # field passes; empty for early-failure paths (no apply URL, etc).
    prepared_answers: List[Dict[str, Any]] = []
    from app.services.auto_apply import _form_filler_common as _common_for_captcha

    try:
        with sync_playwright() as p:
            browser = p.chromium.connect(ws_url, timeout=60_000)
            try:
                context = browser.new_context()
                page = context.new_page()

                # Some apply_urls point at the company's own careers page
                # (stripe.com/jobs/123, databricks.com/careers/...?gh_jid=X)
                # instead of Greenhouse — the Greenhouse Boards API returns
                # the company's custom URL when configured. We reconstruct
                # the direct Greenhouse URL from the job_id and try multiple
                # candidates. Whichever one actually renders #first_name wins.
                landed_on: Optional[str] = None
                attempt_log: List[Dict[str, str]] = []
                for candidate in candidate_urls:
                    try:
                        page.goto(candidate, wait_until="domcontentloaded", timeout=20_000)
                        # Early-exit if the page redirected off Greenhouse —
                        # the form is never going to appear, and waiting 25s
                        # for #first_name eats our Browserless session budget.
                        final_url = page.url
                        if "greenhouse.io" not in final_url.lower():
                            attempt_log.append({
                                "url": candidate,
                                "result": "redirected off greenhouse",
                                "final_url": final_url,
                            })
                            continue
                        page.wait_for_selector("#first_name", timeout=12_000)
                        landed_on = candidate
                        attempt_log.append({"url": candidate, "result": "ok"})
                        break
                    except PWTimeout:
                        try:
                            final_url = page.url
                        except Exception:
                            final_url = candidate
                        attempt_log.append({
                            "url": candidate,
                            "result": "no #first_name",
                            "final_url": final_url,
                        })
                    except Exception as exc:
                        attempt_log.append({
                            "url": candidate,
                            "result": f"nav error: {exc}",
                        })
                if not landed_on:
                    # Capture failure screenshot so Sid can SEE where we ended
                    # up. This is the single most useful piece of diagnostic
                    # info for the next debugging round.
                    failure_b64 = None
                    try:
                        failure_b64 = base64.b64encode(
                            page.screenshot(full_page=True)
                        ).decode("ascii")
                    except Exception:
                        pass
                    return _failure(
                        "Greenhouse form did not render at any candidate URL",
                        attempted_urls=candidate_urls,
                        attempt_log=attempt_log,
                        screenshot_b64=failure_b64,
                    )

                _fill_standard_fields(page, preview, filled, unmapped)
                _record_standard_prepared(preview, prepared_answers)
                _fill_eeo_section(page, preview, filled, unmapped)
                _upload_resume(page, resume_path, filled, unmapped)
                _fill_custom_questions(
                    page=page,
                    preview=preview,
                    edited_answers=edited_answers,
                    filled=filled,
                    unmapped=unmapped,
                    uid=uid,
                    resume_summary=resume_summary,
                    job=job_data or {},
                    prepared_answers=prepared_answers,
                )

                screenshot_bytes = page.screenshot(full_page=True)
                screenshot_b64 = base64.b64encode(screenshot_bytes).decode("ascii")

                # Needs-attention escalation: if any REQUIRED field is still
                # unanswered after profile + library + LLM, don't submit. The
                # runner will write status=needs_attention and surface
                # pending_questions to the user.
                pending = [u for u in unmapped if u.get("required") is True]
                if pending and not dry_run:
                    return {
                        "status": "needs_attention",
                        "filled": filled,
                        "unmapped": unmapped,
                        "pending_questions": pending,
                        "prepared_answers": prepared_answers,
                        "screenshot_b64": screenshot_b64,
                        "failure_reason": None,
                    }

                # Needs-verification escalation: Greenhouse ships invisible
                # reCAPTCHA + per-tenant email verification gate. After
                # rapid resubmits from the same Browserless session, the
                # email-verification path triggers (see dogfood logs from
                # 2026-06-15). Route to the verification UX so the user
                # finishes from their own browser/device — reCAPTCHA
                # scores them as human, no email code dance.
                captcha = _common_for_captcha.detect_captcha_challenge(page)
                if captcha and not dry_run:
                    return {
                        "status": "needs_verification",
                        "filled": filled,
                        "unmapped": unmapped,
                        "pending_questions": [],
                        "prepared_answers": prepared_answers,
                        "captcha": captcha,
                        "apply_url": page.url or apply_url,
                        "screenshot_b64": screenshot_b64,
                        "failure_reason": None,
                    }

                status = "dry_run_complete"
                failure_reason: Optional[str] = None
                if not dry_run:
                    try:
                        submit = page.query_selector('button[type="submit"]')
                        if not submit:
                            status = "submit_failed"
                            failure_reason = "no submit button found"
                        else:
                            submit.click()
                            page.wait_for_load_state("networkidle", timeout=30_000)
                            screenshot_bytes = page.screenshot(full_page=True)
                            screenshot_b64 = base64.b64encode(screenshot_bytes).decode("ascii")

                            # Real success detection: Greenhouse re-renders
                            # the SAME page with aria-invalid="true" markers
                            # when required fields are empty. networkidle fires
                            # either way, so we can't trust it alone. Three
                            # signals we cross-check:
                            #   1. Are there any aria-invalid="true" fields?
                            #      → validation error
                            #   2. Is #first_name still on the page?
                            #      → form didn't unmount → likely still on form
                            #   3. Did the URL change to a /thank_you /
                            #      /confirmation / /apply/confirmation path?
                            #      → real success
                            invalid_count = 0
                            try:
                                invalid_count = page.evaluate(
                                    "() => document.querySelectorAll('[aria-invalid=\"true\"]').length"
                                )
                            except Exception:
                                pass
                            form_still_present = page.query_selector("#first_name") is not None
                            url_after = (page.url or "").lower()
                            success_url = any(
                                kw in url_after
                                for kw in ("thank", "confirmation", "/success", "complete")
                            )

                            if success_url:
                                status = "submitted"
                            elif invalid_count > 0:
                                # Submit-and-learn: Greenhouse tells us which
                                # fields it needed via aria-invalid. Many of
                                # these are fields the pre-submit classifier
                                # missed because they don't use the
                                # question_X-label markup (Zscaler-style
                                # checkbox groups, custom-id Sex dropdowns,
                                # GDPR consent boxes). Run them back through
                                # the same brain that handles custom
                                # questions — slot match catches Sex,
                                # consent fast-path catches privacy /
                                # confidential / consent — and resubmit once
                                # before escalating to the drawer.
                                validation_pending = _extract_invalid_field_questions(page)
                                if validation_pending:
                                    status, validation_pending, screenshot_b64 = (
                                        _resolve_refill_and_resubmit(
                                            page=page,
                                            invalid_fields=validation_pending,
                                            preview=preview,
                                            uid=uid,
                                            resume_summary=resume_summary,
                                            job_data=job_data,
                                            filled=filled,
                                            unmapped=unmapped,
                                            current_screenshot_b64=screenshot_b64,
                                        )
                                    )
                                    if status == "submitted":
                                        # Retry succeeded — fall through to
                                        # the success return at the bottom.
                                        pass
                                    elif validation_pending:
                                        return {
                                            "status": "needs_attention",
                                            "filled": filled,
                                            "unmapped": unmapped,
                                            "pending_questions": validation_pending,
                                            "prepared_answers": prepared_answers,
                                            "screenshot_b64": screenshot_b64,
                                            "failure_reason": None,
                                        }
                                    else:
                                        # No pending and not submitted (e.g.
                                        # retry hit an exception). Fall
                                        # through to submit_failed.
                                        status = "submit_failed"
                                        failure_reason = (
                                            f"validation errors on {invalid_count} "
                                            "field(s); retry resolver did not "
                                            "complete cleanly"
                                        )
                                else:
                                    # Couldn't extract any field labels —
                                    # fall through to the original
                                    # submit_failed path.
                                    status = "submit_failed"
                                    failure_reason = (
                                        f"validation errors on {invalid_count} field(s) "
                                        "— most likely unmapped required questions. "
                                        "See the unmapped list."
                                    )
                            elif form_still_present:
                                status = "submit_failed"
                                failure_reason = (
                                    "form is still on the page after Submit click — "
                                    "submission was not accepted (likely silent validation)"
                                )
                            else:
                                # Form unmounted, no error markers, URL didn't
                                # change obviously — best-effort: assume success.
                                status = "submitted"
                    except PWTimeout:
                        status = "submit_failed"
                        failure_reason = "submit network-idle timeout"
                    except Exception as exc:
                        status = "submit_failed"
                        failure_reason = f"submit click failed: {exc}"

                return {
                    "status": status,
                    "filled": filled,
                    "unmapped": unmapped,
                    "pending_questions": [],
                    "prepared_answers": prepared_answers,
                    "screenshot_b64": screenshot_b64,
                    "failure_reason": failure_reason,
                }
            finally:
                try:
                    browser.close()
                except Exception:
                    pass
    except Exception as exc:
        logger.exception("greenhouse filler crashed")
        return _failure(f"{type(exc).__name__}: {exc}", filled=filled, unmapped=unmapped)


# ---------- standard fields ----------

def _record_standard_prepared(
    preview: Dict[str, Any], prepared_answers: List[Dict[str, Any]]
) -> None:
    """Snapshot the standard-field values from `preview.fields` into the
    prepared_answers list so the verification UX can show them to the
    user. Cheap and idempotent — doesn't actually inspect the page."""
    from app.services.auto_apply import _form_filler_common as _c
    fields = preview.get("fields") or {}
    plan = [
        ("first_name", "First Name"),
        ("last_name", "Last Name"),
        ("full_name", "Full Name"),
        ("email", "Email"),
        ("phone", "Phone"),
        ("location", "Location"),
        ("linkedin_url", "LinkedIn URL"),
        ("github_url", "GitHub URL"),
        ("portfolio_url", "Portfolio / Website URL"),
    ]
    for key, label in plan:
        value = fields.get(key)
        if value:
            _c.record_prepared_answer(
                prepared_answers, field_id=key, label=label,
                answer=value, field_type="text", source="profile",
            )


def _fill_standard_fields(
    page, preview: Dict[str, Any], filled: Dict[str, str], unmapped: List
) -> None:
    fields = preview.get("fields") or {}
    # Greenhouse customizes which "preferred name" inputs a tenant exposes.
    # Some tenants use a single `#preferred_name`, others split into
    # `#preferred_first_name` + `#preferred_last_name` (Samsara, etc.). We
    # try all the variants; only the ones the page actually renders get
    # filled (_fill_text_if_present is a no-op when the selector misses).
    plan = [
        ("#first_name", fields.get("first_name")),
        ("#last_name", fields.get("last_name")),
        ("#preferred_name", fields.get("first_name")),
        ("#preferred_first_name", fields.get("first_name")),
        ("#preferred_last_name", fields.get("last_name")),
        ("#email", fields.get("email")),
        ("#phone", fields.get("phone")),
    ]
    for selector, value in plan:
        if not value:
            continue
        _fill_text_if_present(page, selector, value, filled)

    # Label-driven pass for fields whose IDs vary by tenant (Samsara uses
    # different ids than Stripe for "Preferred First Name", etc). We match
    # label TEXT against canonical fields so the fill is robust to id
    # naming. Runs after the id-based plan above so explicit id matches
    # win when both apply.
    _fill_by_label_text(page, fields, filled)

    # #country is a react-select combobox on most Greenhouse forms (separate
    # from #candidate-location which is the city). Default "United States" —
    # almost all Offerloop students are US-based. When we eventually carry
    # explicit country on the Application Profile, swap to that.
    if page.query_selector("#country"):
        _fill_combobox(page, "#country", "United States", filled, unmapped)

    location = fields.get("location")
    if location and page.query_selector("#candidate-location"):
        _fill_combobox(page, "#candidate-location", location, filled, unmapped)


def _fill_by_label_text(
    page, fields: Dict[str, Any], filled: Dict[str, str]
) -> None:
    """Walk every text-style input on the page, resolve its label via three
    strategies (label[for=id], wrapping <label>, aria-labelledby), match the
    label text against canonical fields, and fill. Robust to per-tenant id
    naming AND to whether the form uses for= / wrapping / aria-labelledby."""
    first_name = (fields.get("first_name") or "").strip()
    last_name = (fields.get("last_name") or "").strip()
    full_name = (fields.get("full_name") or f"{first_name} {last_name}").strip()
    email = (fields.get("email") or "").strip()
    phone = (fields.get("phone") or "").strip()

    # (substring patterns to match against lower-cased label text, value to fill)
    label_rules: List[tuple] = [
        (("preferred first name", "preferred first"), first_name),
        (("preferred last name", "preferred last"), last_name),
        (("preferred name", "nickname", "go by", "what should we call"), first_name),
        (("full name", "legal name"), full_name),
        (("email address",), email),
        (("phone number", "mobile number", "cell phone"), phone),
    ]

    try:
        pairs = page.evaluate(
            """() => {
                const out = [];
                const seen = new Set();
                const inputs = document.querySelectorAll(
                    'input[type="text"], input[type="email"], input[type="tel"], input:not([type]), textarea'
                );
                inputs.forEach((el) => {
                    const id = el.id || el.name || '';
                    if (!id || seen.has(id)) return;
                    seen.add(id);

                    let label = '';
                    // 1. label[for=id]
                    try {
                        const esc = (window.CSS && CSS.escape) ? CSS.escape(id) : id;
                        const direct = document.querySelector(`label[for="${esc}"]`);
                        if (direct) label = (direct.textContent || '').trim();
                    } catch (e) {}
                    // 2. wrapping <label>
                    if (!label) {
                        const parent = el.closest && el.closest('label');
                        if (parent) label = (parent.textContent || '').trim();
                    }
                    // 3. aria-labelledby
                    if (!label) {
                        const lb = el.getAttribute && el.getAttribute('aria-labelledby');
                        if (lb) {
                            const node = document.getElementById(lb);
                            if (node) label = (node.textContent || '').trim();
                        }
                    }
                    if (label) out.push({id: id, label: label.toLowerCase()});
                });
                return out;
            }"""
        )
    except Exception:
        return

    if not isinstance(pairs, list):
        return

    for pair in pairs:
        try:
            input_id = pair.get("id")
            text = pair.get("label") or ""
        except AttributeError:
            continue
        if not input_id or not text:
            continue
        selector = _id_selector(input_id)
        # Skip if the id-based plan already touched this selector
        if selector in filled:
            continue
        if not page.query_selector(selector):
            continue
        for patterns, value in label_rules:
            if not value:
                continue
            if any(p in text for p in patterns):
                _fill_text_if_present(page, selector, value, filled)
                break


# ---------- EEO ----------

# Map our internal Application Profile values to the wording Greenhouse uses
# on the dropdowns. "decline" → the literal "Decline to identify" option.
_EEO_OPTION_MAP = {
    "gender": {
        "male": "Male",
        "female": "Female",
        "non_binary": "Non-binary",
        "decline": "Decline to identify",
    },
    "hispanic_ethnicity": {
        "hispanic": "Yes",
        "not_hispanic": "No",
        "decline": "Decline to identify",
    },
    "veteran_status": {
        "not_veteran": "I am not a protected veteran",
        "veteran": "I am a veteran",
        "disabled_veteran": "I am a disabled veteran",
        "decline": "I don't wish to answer",
    },
    "disability_status": {
        "yes": "Yes, I have a disability",
        "no": "No, I don't have a disability",
        "decline": "I don't wish to answer",
    },
}


def _fill_eeo_section(
    page, preview: Dict[str, Any], filled: Dict[str, str], unmapped: List
) -> None:
    answers = preview.get("structured_answers") or {}
    pairs = [
        ("#gender", "gender", answers.get("gender")),
        ("#hispanic_ethnicity", "hispanic_ethnicity", answers.get("ethnicity")),
        ("#veteran_status", "veteran_status", answers.get("veteran_status")),
        ("#disability_status", "disability_status", answers.get("disability_status")),
    ]
    for selector, key, internal_value in pairs:
        if not page.query_selector(selector):
            continue
        option_text = _EEO_OPTION_MAP.get(key, {}).get(
            internal_value or "decline",
            _EEO_OPTION_MAP[key].get("decline", "Decline to identify"),
        )
        _fill_combobox(page, selector, option_text, filled, unmapped)


# ---------- resume upload ----------

def _upload_resume(
    page, resume_path: Optional[str], filled: Dict[str, str], unmapped: List
) -> None:
    if not resume_path or not os.path.exists(resume_path):
        unmapped.append({"field_id": "resume", "label": "Resume",
                          "reason": "no resume file available"})
        return
    target = page.query_selector("#resume")
    if not target:
        unmapped.append({"field_id": "resume", "label": "Resume",
                          "reason": "Greenhouse resume input not found"})
        return
    try:
        page.set_input_files("#resume", resume_path)
        filled["resume"] = "uploaded"
    except Exception as exc:
        unmapped.append({"field_id": "resume", "label": "Resume",
                          "reason": f"upload failed: {exc}"})


# ---------- custom questions ----------

def _fill_custom_questions(
    page,
    preview: Dict[str, Any],
    edited_answers: Dict[str, str],
    filled: Dict[str, str],
    unmapped: List,
    *,
    uid: str,
    resume_summary: str,
    job: Dict[str, Any],
    prepared_answers: Optional[List[Dict[str, Any]]] = None,
) -> None:
    """Greenhouse custom questions: <label id="question_X-label" for="question_X">{text}</label>.

    V2 brain: walk every custom question on the form, classify each input,
    then resolve the whole batch through `auto_answer_form_questions`. That
    function handles sensitive profile paths, preferences (NEEDS_USER),
    library hits, and the single batched LLM call with truthfulness rules.

    No per-tenant keyword logic in this file anymore — the resolver works
    across Greenhouse, Lever, and Ashby on the same contract."""
    from app.services.auto_apply.screening_answers import auto_answer_form_questions

    profile = preview.get("_application_profile") or {}
    classified_fields: List[Dict[str, Any]] = []
    meta_by_id: Dict[str, Dict[str, Any]] = {}

    # Pass 1: Greenhouse-native custom questions with the standard
    # `label[id="question_X-label"]` wrapper. These are the most reliable
    # to classify because the label markup is explicit.
    labels = page.query_selector_all('label[id^="question_"][id$="-label"]')
    for label in labels:
        try:
            label_text = (label.inner_text() or "").strip()
            field_id = label.get_attribute("for")
        except Exception:
            continue
        if not field_id:
            continue
        # Attribute selector tolerates array-style ids like "question_X[]".
        selector = _id_selector(field_id)
        if not page.query_selector(selector):
            unmapped.append(_unmapped_entry(
                page, selector, field_id, label_text,
                reason="field not interactable",
            ))
            continue

        field_type = _detect_field_type(page, selector)
        options = _detect_options(page, selector)
        required = _detect_required(page, selector)
        is_combobox = field_type in ("select", "radio")

        classified_fields.append({
            "field_id": field_id,
            "label": label_text,
            "field_type": field_type,
            "options": options,
            "required": required,
        })
        print(
            f"[auto_apply.classify] pre-submit: field_id={field_id!r} "
            f"label={label_text!r} field_type={field_type!r} required={required}",
            flush=True,
        )
        meta_by_id[field_id] = {
            "selector": selector,
            "label": label_text,
            "field_type": field_type,
            "options": options,
            "required": required,
            "is_combobox": is_combobox,
        }

    # Pass 2: required fields that aren't wrapped in the question_X-label
    # markup. Tenant-specific custom EEO (Zscaler's `Sex` with a numeric
    # id), GDPR demographic consent checkboxes, multi-option checkbox
    # groups rendered as `<input id="question_X[]_Y">` with the label on
    # the parent fieldset's legend, and the standard `id="phone"` when
    # the user's profile didn't pre-fill it. Filling these in the same
    # initial pass — rather than catching them after submit-validation
    # fails — avoids the "field stuck in error state" problem where
    # Greenhouse's per-field aria-invalid flag persists across resubmits.
    already_classified = {f["field_id"] for f in classified_fields}
    extra_ids = _collect_unclassified_required_ids(page, already_classified)
    for field_id in extra_ids:
        selector = _id_selector(field_id)
        if not page.query_selector(selector):
            continue
        label_text = _resolve_label_text(page, field_id) or field_id
        field_type = _detect_field_type(page, selector)
        options = _detect_options(page, selector)
        if field_type == "select" and not options:
            options = _harvest_combobox_options(page, selector)
        is_combobox = field_type in ("select", "radio")
        classified_fields.append({
            "field_id": field_id,
            "label": label_text,
            "field_type": field_type,
            "options": options,
            "required": True,
        })
        print(
            f"[auto_apply.classify] pre-submit (wider): field_id={field_id!r} "
            f"label={label_text!r} field_type={field_type!r}",
            flush=True,
        )
        meta_by_id[field_id] = {
            "selector": selector,
            "label": label_text,
            "field_type": field_type,
            "options": options,
            "required": True,
            "is_combobox": is_combobox,
        }

    if not classified_fields:
        return

    try:
        resolved = auto_answer_form_questions(
            uid=uid,
            profile=profile,
            resume_summary=resume_summary,
            job=job,
            classified_fields=classified_fields,
        )
    except Exception as exc:
        logger.exception("auto_answer_form_questions crashed: %s", exc)
        # Degrade safely: everything becomes NEEDS_USER and escalates to
        # the Needs Attention drawer rather than submitting bad data.
        resolved = {
            f["field_id"]: {"answer": None, "source": "needs_user"}
            for f in classified_fields
        }

    for field_id, meta in meta_by_id.items():
        info = resolved.get(field_id) or {"answer": None, "source": "needs_user"}
        answer = info.get("answer")
        selector = meta["selector"]

        if answer is None or answer == "" or answer == "NEEDS_USER":
            unmapped.append({
                "field_id": field_id,
                "label": meta["label"],
                "reason": f"no answer (source={info.get('source', 'unknown')})",
                "field_type": meta["field_type"],
                "options": meta["options"],
                "required": meta["required"],
            })
            continue

        if meta["field_type"] == "checkbox":
            _check_checkbox(page, selector, answer, filled, unmapped, field_id, meta["label"])
        elif meta["is_combobox"]:
            _fill_combobox(page, selector, str(answer), filled, unmapped)
        else:
            _fill_text_if_present(page, selector, str(answer), filled)

        if prepared_answers is not None:
            from app.services.auto_apply import _form_filler_common as _c
            _c.record_prepared_answer(
                prepared_answers,
                field_id=field_id,
                label=meta["label"],
                answer=answer,
                field_type=meta["field_type"],
                source=info.get("source", "unknown"),
            )


def _unmapped_entry(
    page, selector: str, field_id: str, label_text: str, reason: str
) -> Dict[str, Any]:
    """Build an unmapped entry annotated with everything the Needs Attention
    drawer needs to render an input: field_type, options, required."""
    return {
        "field_id": field_id,
        "label": label_text,
        "reason": reason,
        "field_type": _detect_field_type(page, selector),
        "options": _detect_options(page, selector),
        "required": _detect_required(page, selector),
    }


def _detect_field_type(page, selector: str) -> str:
    """Best-effort classification of a Greenhouse form field."""
    try:
        result = page.evaluate(
            """(sel) => {
                const el = document.querySelector(sel);
                if (!el) return 'text';
                const tag = el.tagName?.toLowerCase() || '';
                if (tag === 'textarea') return 'textarea';
                if (tag === 'select') return 'select';
                // Greenhouse react-select renders a hidden input with role=combobox
                // wrapped in a div; if our selector matched that input, classify as select.
                if (el.getAttribute && el.getAttribute('role') === 'combobox') return 'select';
                const type = (el.getAttribute && el.getAttribute('type') || 'text').toLowerCase();
                if (type === 'number') return 'number';
                if (type === 'date') return 'date';
                if (type === 'radio') return 'radio';
                if (type === 'checkbox') return 'checkbox';
                return 'text';
            }""",
            selector,
        )
        return result or "text"
    except Exception:
        return "text"


def _detect_options(page, selector: str) -> Optional[List[str]]:
    """Extract select/radio option labels. Returns None for inputs without
    enumerated options."""
    try:
        result = page.evaluate(
            """(sel) => {
                const el = document.querySelector(sel);
                if (!el) return null;
                const tag = el.tagName?.toLowerCase();
                if (tag === 'select') {
                    return Array.from(el.options || [])
                        .map(o => (o.textContent || '').trim())
                        .filter(Boolean);
                }
                // Greenhouse react-select: the listbox is rendered on demand.
                // Best-effort: read aria-owns / aria-controls and grab options
                // if the dropdown happens to be open. Otherwise return null —
                // the Needs Attention drawer will fall back to a text input.
                const ownsId = el.getAttribute && (el.getAttribute('aria-owns') || el.getAttribute('aria-controls'));
                if (ownsId) {
                    const listbox = document.getElementById(ownsId);
                    if (listbox) {
                        return Array.from(listbox.querySelectorAll('[role="option"]'))
                            .map(o => (o.textContent || '').trim())
                            .filter(Boolean);
                    }
                }
                return null;
            }""",
            selector,
        )
        if isinstance(result, list) and result:
            return [str(x) for x in result]
        return None
    except Exception:
        return None


def _collect_unclassified_required_ids(page, already_classified: set) -> List[str]:
    """Find every required form input the question_X-label scan missed.

    Greenhouse forms vary by tenant — the standard custom-question wrapper
    `<label id="question_X-label" for="question_X">` is reliable when used,
    but tenants who customize their EEO section, GDPR consent flows, or
    multi-select checkbox groups often render fields outside that wrapper
    with their own bespoke ids. We scan the DOM directly:

      - `[aria-required="true"]` and `[required]` form inputs.
      - The standard Greenhouse `#phone` field — required on every form.

    Returns a deduplicated list of element ids (or names) that are NOT
    already in `already_classified` and don't belong to the standard fields
    already handled by `_fill_standard_fields` (first_name/last_name/email).
    """
    try:
        ids = page.evaluate(
            """() => {
                const out = [];
                const seen = new Set();
                // Standard-fields IDs handled directly by _fill_standard_fields.
                // We let those handlers run, then pick up #phone here only if
                // the standard handler didn't end up filling it.
                const handled = new Set([
                    'first_name', 'last_name', 'preferred_name',
                    'preferred_first_name', 'preferred_last_name',
                    'email', 'resume', 'cover_letter',
                    'country', 'candidate-location',
                ]);
                document.querySelectorAll(
                    'input[aria-required="true"], input[required], ' +
                    'select[aria-required="true"], select[required], ' +
                    'textarea[aria-required="true"], textarea[required], ' +
                    'input#phone'
                ).forEach((el) => {
                    const id = el.id || el.name || '';
                    if (!id) return;
                    if (handled.has(id)) return;
                    if (seen.has(id)) return;
                    seen.add(id);
                    out.push(id);
                });
                return out;
            }"""
        )
    except Exception as exc:
        logger.warning("_collect_unclassified_required_ids eval failed: %s", exc)
        return []
    if not isinstance(ids, list):
        return []
    return [str(x) for x in ids if str(x) not in already_classified]


def _resolve_refill_and_resubmit(
    page,
    invalid_fields: List[Dict[str, Any]],
    preview: Dict[str, Any],
    uid: str,
    resume_summary: str,
    job_data: Optional[Dict[str, Any]],
    filled: Dict[str, str],
    unmapped: List,
    current_screenshot_b64: str,
) -> tuple:
    """Second-chance pass over Greenhouse aria-invalid fields.

    The pre-submit classifier only walks `label[id^="question_"][id$="-label"]`
    custom-question markup. Greenhouse-rendered checkbox groups
    (`question_X[]_Y`), the standard EEO `Sex` dropdown when a tenant uses a
    custom numeric id, and GDPR demographic consent boxes don't match that
    selector, so they're never resolved. After submit they all show up as
    aria-invalid — at which point we already know the label and field_type,
    so we run them through `auto_answer_form_questions` (which gives us slot
    match for "Sex", consent fast-path for the agreement boxes, and the
    LLM for everything else), refill the page, and resubmit once.

    Returns `(status, remaining_pending, screenshot_b64)`:
      - `status`: "submitted" if resubmit reached a thank-you / success page,
        else "" (caller decides between needs_attention and submit_failed
        based on whether remaining_pending is non-empty).
      - `remaining_pending`: aria-invalid fields still unresolved after retry.
      - `screenshot_b64`: updated screenshot if we resubmitted, else the
        screenshot the caller passed in.
    """
    from app.services.auto_apply.screening_answers import auto_answer_form_questions

    profile = preview.get("_application_profile") or {}
    try:
        resolved = auto_answer_form_questions(
            uid=uid,
            profile=profile,
            resume_summary=resume_summary,
            job=job_data or {},
            classified_fields=invalid_fields,
        )
    except Exception as exc:
        logger.exception("retry resolver crashed: %s", exc)
        return ("", invalid_fields, current_screenshot_b64)

    filled_any = False
    for field in invalid_fields:
        fid = field.get("field_id")
        if not fid:
            continue
        field_type = field.get("field_type") or "text"
        label = field.get("label") or ""
        info = resolved.get(fid) or {}
        answer = info.get("answer")
        if not answer or answer == "NEEDS_USER":
            continue
        sel = _id_selector(str(fid))
        try:
            if field_type == "checkbox":
                _check_checkbox(page, sel, answer, filled, unmapped, str(fid), label)
                # React/Formik fix: page.check() mutates DOM .checked but
                # Greenhouse's Formik validator reads from its own state,
                # which is only updated when React's onChange fires on a
                # synthetic event React itself dispatched. The native setter
                # trick bypasses React's wrapped setter to force a state
                # update on Formik-tracked checkboxes.
                _react_force_checkbox(page, sel, _truthy(answer))
            elif field_type in ("select", "radio"):
                _fill_combobox(page, sel, str(answer), filled, unmapped)
                # Diagnostic: if the combobox didn't take a value, dump the
                # parent chain so we can see what wrapper class the EEO
                # react-select uses.
                _diagnose_unfilled_combobox(page, sel, str(fid))
            else:
                _fill_text_if_present(page, sel, str(answer), filled)
                # Same React/Formik trick for text inputs. page.fill mutates
                # DOM .value and fires an input event, but on phone-mask /
                # formatted-input fields Greenhouse's Formik handler may
                # never see it. Re-fire via the native setter to be sure.
                _react_force_text(page, sel, str(answer))
            filled_any = True
            # Diagnostic: confirm the DOM actually mutated. If `value`/`checked`
            # is still empty/false after the fill, we know the helper silently
            # no-op'd (most often: react-select needs a real listbox-click,
            # checkbox inputs are visually proxied so check() throws, or React
            # isn't picking up the synthetic change event).
            try:
                dom_state = page.evaluate(
                    """(sel) => {
                        const el = document.querySelector(sel);
                        if (!el) return {present: false};
                        return {
                            present: true,
                            tag: (el.tagName || '').toLowerCase(),
                            type: (el.getAttribute && el.getAttribute('type')) || null,
                            value: el.value !== undefined ? String(el.value).slice(0, 60) : null,
                            checked: el.checked === true,
                            aria_invalid: el.getAttribute && el.getAttribute('aria-invalid'),
                            visible: !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length),
                        };
                    }""",
                    sel,
                )
            except Exception:
                dom_state = {"error": "eval-failed"}
            print(
                f"[auto_apply.retry] refilled field_id={fid!r} "
                f"field_type={field_type!r} answer={str(answer)[:60]!r} "
                f"source={info.get('source')!r} dom={dom_state} "
                f"filled_entry={filled.get(sel)!r}",
                flush=True,
            )
        except Exception as exc:
            logger.warning("retry fill failed for %s: %s", fid, exc)

    if not filled_any:
        print(
            f"[auto_apply.retry] nothing to refill — "
            f"{len(invalid_fields)} field(s) escalating to drawer",
            flush=True,
        )
        return ("", invalid_fields, current_screenshot_b64)

    # Resubmit once.
    try:
        submit2 = page.query_selector('button[type="submit"]')
        if not submit2:
            print("[auto_apply.retry] no submit button on retry", flush=True)
            return ("", invalid_fields, current_screenshot_b64)
        submit2.click()
        page.wait_for_load_state("networkidle", timeout=30_000)
        new_screenshot_b64 = base64.b64encode(
            page.screenshot(full_page=True)
        ).decode("ascii")
        # Diagnostic: snapshot the same fields' DOM state after resubmit.
        # If values that we filled before submit are now empty/false, React
        # state was never updated and rendered them away. If values held
        # but aria-invalid is still true, Formik is validating against
        # internal state we never wrote to.
        for field in invalid_fields:
            fid = field.get("field_id")
            if not fid:
                continue
            sel2 = _id_selector(str(fid))
            try:
                dom_state2 = page.evaluate(
                    """(sel) => {
                        const el = document.querySelector(sel);
                        if (!el) return {present: false};
                        return {
                            present: true,
                            value: el.value !== undefined ? String(el.value).slice(0, 60) : null,
                            checked: el.checked === true,
                            aria_invalid: el.getAttribute && el.getAttribute('aria-invalid'),
                        };
                    }""",
                    sel2,
                )
            except Exception:
                dom_state2 = {"error": "eval-failed"}
            print(
                f"[auto_apply.retry] post-resubmit field_id={fid!r} dom={dom_state2}",
                flush=True,
            )
        invalid_count2 = 0
        try:
            invalid_count2 = page.evaluate(
                "() => document.querySelectorAll('[aria-invalid=\"true\"]').length"
            )
        except Exception:
            pass
        url_after2 = (page.url or "").lower()
        success_url2 = any(
            kw in url_after2
            for kw in ("thank", "confirmation", "/success", "complete")
        )
        if success_url2 or invalid_count2 == 0:
            print(
                f"[auto_apply.retry] resubmit succeeded "
                f"(invalid_count2={invalid_count2}, url={url_after2[:80]})",
                flush=True,
            )
            return ("submitted", [], new_screenshot_b64)
        # Some fields still invalid — re-extract and let caller escalate.
        remaining = _extract_invalid_field_questions(page)
        print(
            f"[auto_apply.retry] {invalid_count2} field(s) still invalid after "
            f"retry; {len(remaining)} resolved labels for drawer",
            flush=True,
        )
        return ("", remaining, new_screenshot_b64)
    except Exception as exc:
        logger.warning("retry submit failed: %s", exc)
        return ("", invalid_fields, current_screenshot_b64)


def _extract_invalid_field_questions(page) -> List[Dict[str, Any]]:
    """After Submit, Greenhouse marks rejected required fields with
    aria-invalid="true". For each one, resolve the label, classify the
    input type, and for combobox-style fields, click them open to harvest
    their actual options. Returns a pending_questions[] payload the runner
    persists for the Needs Attention drawer.

    Source of truth for "required" here is the form: if Greenhouse rejected
    it, it was required."""
    try:
        invalid_ids = page.evaluate(
            """() => {
                const seen = new Set();
                const ids = [];
                document.querySelectorAll('[aria-invalid="true"]').forEach((el) => {
                    const id = el.id || el.name || '';
                    if (id && !seen.has(id)) {
                        seen.add(id);
                        ids.push(id);
                    }
                });
                return ids;
            }"""
        )
    except Exception as exc:
        logger.warning("_extract_invalid_field_questions id-scan failed: %s", exc)
        return []

    if not isinstance(invalid_ids, list):
        return []

    results: List[Dict[str, Any]] = []
    for fid in invalid_ids:
        try:
            sel = _id_selector(str(fid))
            if not page.query_selector(sel):
                continue
            label = _resolve_label_text(page, str(fid))
            if not label:
                label = str(fid)
            field_type = _detect_field_type(page, sel)
            options = _detect_options(page, sel)
            # react-select widgets render their listbox on demand. If we saw
            # a select-style field with no options in the DOM, open the
            # widget to harvest them so the drawer can render a real
            # <select> instead of a guess-the-string text input.
            if field_type == "select" and not options:
                options = _harvest_combobox_options(page, sel)
            results.append({
                "field_id": str(fid),
                "label": label,
                "field_type": field_type,
                "options": options,
                "required": True,
            })
            print(
                f"[auto_apply.classify] post-submit aria-invalid: "
                f"field_id={str(fid)!r} label={label!r} field_type={field_type!r}",
                flush=True,
            )
        except Exception as exc:
            logger.warning("_extract_invalid_field_questions per-field failed: %s", exc)
            continue
    return results


def _resolve_label_text(page, field_id: str) -> str:
    """Find the visible question text for a given input id.

    Resolution priority:
      1. The input's `description` attribute (Greenhouse denormalizes the
         parent fieldset's legend onto each input — most reliable signal).
      2. The parent <fieldset>'s <legend>. Covers checkbox-group questions
         like "Zscaler Confidential Information" where the visible label
         is just "I Agree".
      3. <label for=id>. Only used when neither of the above is rich enough.
      4. aria-labelledby.
      5. Ancestor scan as last resort.

    If the resolved label is a generic acknowledgment phrase ("I Agree",
    "Yes", "I Acknowledge") AND a richer ancestor label exists, prefer the
    ancestor — the LLM cannot evaluate consent without the actual subject.
    Strips trailing `*` required markers from the final text."""
    try:
        text = page.evaluate(
            """(args) => {
                const fid = args.fid;
                const el = document.getElementById(fid);
                if (!el) return '';

                const generic = new Set([
                    'i agree', 'i acknowledge', 'i consent', 'i confirm',
                    'agree', 'acknowledge', 'consent', 'yes', 'no', 'ok',
                ]);
                const isGeneric = (s) => generic.has((s || '').toLowerCase().replace(/[*\\s]+/g, ' ').trim());
                const rich = (s) => (s || '').trim().length > 6 && !isGeneric(s);

                // 1. input.description — Greenhouse's denormalized fieldset legend
                const desc = el.getAttribute && el.getAttribute('description');
                if (rich(desc)) return desc.trim();

                // 2. Parent fieldset's legend (the actual question for I-Agree checkboxes)
                const fs = el.closest && el.closest('fieldset');
                if (fs) {
                    const legend = fs.querySelector('legend');
                    if (legend) {
                        const t = (legend.textContent || '').trim();
                        if (rich(t)) return t;
                    }
                }

                // 3. label[for=fid]
                const escaped = (window.CSS && CSS.escape) ? CSS.escape(fid) : fid;
                const direct = document.querySelector(`label[for="${escaped}"]`);
                let labelText = direct ? (direct.textContent || '').trim() : '';

                // 4. If label is generic, look harder for a richer ancestor label
                if (!rich(labelText)) {
                    const labelledBy = el.getAttribute && el.getAttribute('aria-labelledby');
                    if (labelledBy) {
                        const l = document.getElementById(labelledBy);
                        if (l) {
                            const t = (l.textContent || '').trim();
                            if (rich(t)) return t;
                        }
                    }
                    let parent = el.parentElement;
                    for (let i = 0; i < 6 && parent; i++) {
                        // Look for question-description block (Greenhouse pattern)
                        const qd = parent.querySelector && parent.querySelector('.question-description, [class*="description"]');
                        if (qd) {
                            const t = (qd.textContent || '').trim();
                            if (rich(t)) return t.slice(0, 400);
                        }
                        const lbl = parent.querySelector && parent.querySelector('label, .label, legend, [class*="label"]');
                        if (lbl) {
                            const t = (lbl.textContent || '').trim();
                            if (rich(t)) return t;
                        }
                        parent = parent.parentElement;
                    }
                }

                return labelText || '';
            }""",
            {"fid": field_id},
        )
        return (text or "").replace("*", "").strip()
    except Exception:
        return ""


def _harvest_combobox_options(page, selector: str) -> Optional[List[str]]:
    """Open a react-select widget, read its listbox options, close it.
    Returns None if no options surface.

    Greenhouse puts aria-invalid on the hidden internal input — clicking it
    doesn't trigger react-select's open handler. The reliable way to open
    is focus + ArrowDown (react-select's documented keyboard shortcut).
    If that fails, fall back to clicking the visible .select__control
    ancestor.

    Cost: ~400ms per combobox. Only called on the aria-invalid extraction
    path after a failed submit — never during the normal fill loop."""
    el = page.query_selector(selector)
    if not el:
        return None

    opened = False

    # Strategy 1: focus + ArrowDown (react-select keyboard shortcut to open)
    try:
        el.focus()
        page.keyboard.press("ArrowDown")
        page.wait_for_timeout(300)
        opened = _listbox_visible(page, selector)
    except Exception as exc:
        logger.debug("focus+ArrowDown failed: %s", exc)

    # Strategy 2: click the visible .select__control ancestor
    if not opened:
        try:
            page.evaluate(
                """(sel) => {
                    const el = document.querySelector(sel);
                    if (!el) return false;
                    // Walk up looking for the clickable control wrapper.
                    // react-select uses class names like "select__control"
                    // or "css-...-control". Match anything ending in
                    // "control" or with role=combobox / role=button.
                    let node = el.parentElement;
                    for (let i = 0; i < 6 && node; i++) {
                        const cls = (node.className || '').toString();
                        const role = node.getAttribute && node.getAttribute('role');
                        if (
                            /control$/.test(cls) ||
                            /select__control/.test(cls) ||
                            role === 'combobox' ||
                            role === 'button'
                        ) {
                            node.click();
                            return true;
                        }
                        node = node.parentElement;
                    }
                    return false;
                }""",
                selector,
            )
            page.wait_for_timeout(300)
            opened = _listbox_visible(page, selector)
        except Exception as exc:
            logger.debug("control-click fallback failed: %s", exc)

    if not opened:
        try:
            page.keyboard.press("Escape")
        except Exception:
            pass
        return None

    try:
        options = page.evaluate(
            """(sel) => {
                const el = document.querySelector(sel);
                if (!el) return null;
                const ownsId = el.getAttribute && (
                    el.getAttribute('aria-owns') || el.getAttribute('aria-controls')
                );
                let listbox = ownsId ? document.getElementById(ownsId) : null;
                if (!listbox) {
                    const all = document.querySelectorAll('[role="listbox"]');
                    if (all.length > 0) listbox = all[all.length - 1];
                }
                if (!listbox) return null;
                return Array.from(listbox.querySelectorAll('[role="option"]'))
                    .map(o => (o.textContent || '').trim())
                    .filter(Boolean);
            }""",
            selector,
        )
    except Exception:
        options = None

    try:
        page.keyboard.press("Escape")
    except Exception:
        pass
    page.wait_for_timeout(100)

    if isinstance(options, list) and options:
        return [str(o) for o in options]
    return None


def _listbox_visible(page, selector: str) -> bool:
    """Return True if a role=listbox is currently rendered on the page."""
    try:
        return bool(page.evaluate(
            """(sel) => {
                const el = document.querySelector(sel);
                if (!el) return false;
                const ownsId = el.getAttribute && (
                    el.getAttribute('aria-owns') || el.getAttribute('aria-controls')
                );
                if (ownsId && document.getElementById(ownsId)) return true;
                return document.querySelectorAll('[role="listbox"]').length > 0;
            }""",
            selector,
        ))
    except Exception:
        return False


def _detect_required(page, selector: str) -> bool:
    """Greenhouse marks required questions with aria-required='true' or a
    `required` attribute. Some custom questions also use a star-marked label
    that's only enforced on submit — we treat the explicit aria/required
    attributes as ground truth."""
    try:
        result = page.evaluate(
            """(sel) => {
                const el = document.querySelector(sel);
                if (!el) return false;
                if (el.required) return true;
                const aria = el.getAttribute && el.getAttribute('aria-required');
                if (aria === 'true') return true;
                // Greenhouse sometimes puts aria-required on a wrapping div for
                // react-select; check the nearest .field ancestor.
                let parent = el.parentElement;
                for (let i = 0; i < 4 && parent; i++) {
                    if (parent.getAttribute && parent.getAttribute('aria-required') === 'true') return true;
                    parent = parent.parentElement;
                }
                return false;
            }""",
            selector,
        )
        return bool(result)
    except Exception:
        return False


# ---------- low-level helpers ----------

def _id_selector(field_id: str) -> str:
    """Build a CSS selector that targets an element by id, tolerating ids
    that contain CSS-significant characters like `[`, `]`, `.`, `:`.

    Greenhouse uses array-style ids (`question_X[]`) for multi-select fields;
    `#question_X[]` is invalid CSS. The attribute-equals form `[id="..."]`
    avoids that whole class of escaping problems."""
    safe = field_id.replace("\\", "\\\\").replace('"', '\\"')
    return f'[id="{safe}"]'


def _fill_text_if_present(
    page, selector: str, value: str, filled: Dict[str, str]
) -> None:
    el = page.query_selector(selector)
    if not el or not value:
        return
    try:
        page.fill(selector, str(value))
        filled[selector] = "filled"
    except Exception as exc:
        filled[selector] = f"error: {exc}"


def _check_checkbox(
    page,
    selector: str,
    answer: Any,
    filled: Dict[str, str],
    unmapped: List,
    field_id: str,
    label: str,
) -> None:
    """Check or uncheck a checkbox based on the resolved answer.

    Truthy answers ("I Agree", "Yes", "True", true) → check the box.
    Falsy answers ("No", "False", false) → uncheck (or leave unchecked).

    Uses Playwright's `check()` / `uncheck()` rather than `click()` because
    they're idempotent: calling check() on an already-checked box is a no-op
    instead of toggling it off. Critical for cases where the worker re-runs
    after the user resolves drawer questions — we must not accidentally
    uncheck things we already checked on the prior pass."""
    should_check = _truthy(answer)
    el = page.query_selector(selector)
    if not el:
        return
    try:
        if should_check:
            page.check(selector, timeout=5_000)
            filled[selector] = f"checked:{answer}"
        else:
            page.uncheck(selector, timeout=5_000)
            filled[selector] = f"unchecked:{answer}"
    except Exception as exc:
        # Fall back to a raw click. Some Greenhouse checkbox renderings put
        # a custom icon over the real input so Playwright's check() can't
        # find a visible target — clicking the input by selector usually
        # still works via dispatch.
        try:
            el.click(timeout=3_000)
            filled[selector] = f"clicked:{answer}"
        except Exception as exc2:
            unmapped.append({
                "field_id": field_id,
                "label": label,
                "reason": f"checkbox toggle failed: {exc2}",
                "field_type": "checkbox",
                "options": None,
                "required": True,
            })


def _react_force_text(page, selector: str, value: str) -> None:
    """Force a React-controlled text input to update its parent component's
    state. Uses the native HTMLInputElement.value setter (bypassing React's
    wrapped setter, which would otherwise filter the change as "not from
    React") and dispatches a bubbling `input` event so React's onChange
    listener routes the update to setState / setFieldValue.

    This is the canonical pattern for poking React from outside (Playwright,
    Selenium, browser extensions). page.fill should do this, but on some
    Greenhouse tenants the Formik handler never sees the change — most
    visible on phone-mask inputs where a separate mask handler intercepts
    the value before Formik's onChange runs."""
    try:
        page.evaluate(
            """(args) => {
                const el = document.querySelector(args.sel);
                if (!el) return false;
                const proto = el.tagName === 'TEXTAREA'
                    ? HTMLTextAreaElement.prototype
                    : HTMLInputElement.prototype;
                const setter = Object.getOwnPropertyDescriptor(proto, 'value');
                if (setter && setter.set) {
                    setter.set.call(el, args.value);
                } else {
                    el.value = args.value;
                }
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
                el.dispatchEvent(new Event('blur', { bubbles: true }));
                return true;
            }""",
            {"sel": selector, "value": value},
        )
    except Exception as exc:
        logger.debug("_react_force_text failed for %s: %s", selector, exc)


def _react_force_checkbox(page, selector: str, should_check: bool) -> None:
    """Force a React-controlled checkbox to update its parent component's
    state. Same pattern as _react_force_text but for the checked property.

    The dispatched `click` event is what React's checkbox onChange listens
    for; a `change` event alone is not enough in some React versions. We
    set .checked via the native setter first so that by the time React's
    handler reads el.checked it gets the right value."""
    try:
        page.evaluate(
            """(args) => {
                const el = document.querySelector(args.sel);
                if (!el) return false;
                const setter = Object.getOwnPropertyDescriptor(
                    HTMLInputElement.prototype, 'checked'
                );
                if (setter && setter.set) {
                    setter.set.call(el, args.checked);
                } else {
                    el.checked = args.checked;
                }
                el.dispatchEvent(new Event('click', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
                return true;
            }""",
            {"sel": selector, "checked": bool(should_check)},
        )
    except Exception as exc:
        logger.debug("_react_force_checkbox failed for %s: %s", selector, exc)


def _diagnose_unfilled_combobox(page, selector: str, field_id: str) -> None:
    """If a combobox still has empty value after _fill_combobox ran, dump
    the input + 4 ancestors' outerHTML so we can see what wrapper class
    the form is using. Only logs when the value is empty — silent on
    success."""
    try:
        info = page.evaluate(
            """(sel) => {
                const el = document.querySelector(sel);
                if (!el) return null;
                if (el.value && el.value.length > 0) return null;
                const chain = [];
                let node = el;
                for (let i = 0; i < 5 && node; i++) {
                    chain.push({
                        i,
                        tag: (node.tagName || '').toLowerCase(),
                        id: node.id || null,
                        class: node.className || null,
                        role: node.getAttribute ? node.getAttribute('role') : null,
                    });
                    node = node.parentElement;
                }
                return {value: el.value, chain};
            }""",
            selector,
        )
        if info:
            print(
                f"[auto_apply.combodiag] field_id={field_id!r} "
                f"value={info.get('value')!r} chain={info.get('chain')}",
                flush=True,
            )
    except Exception:
        pass


def _truthy(value: Any) -> bool:
    """Coerce LLM / library answer to a checkbox state.

    Treats agreement phrasing ('i agree', 'yes', 'true', 'on', 'agreed') as
    True. Treats 'no'/'false'/empty as False. The LLM is instructed to
    return the explicit option label ("I Agree") for agreement checkboxes,
    but we accept booleans and yes/no too — the user's drawer might've
    saved any of these shapes."""
    if value is True:
        return True
    if value is False or value is None:
        return False
    s = str(value).strip().lower()
    if not s:
        return False
    return s in {
        "i agree", "agree", "agreed", "yes", "y", "true", "1", "on",
        "i acknowledge", "acknowledge", "i consent", "consent",
        "i confirm", "confirm", "ok", "checked",
    }


def _fill_combobox(
    page, selector: str, option_text: str, filled: Dict[str, str], unmapped: List
) -> None:
    """Greenhouse uses react-select. Click to open the listbox, type, click
    the option that matches. Falls back to keyboard Enter on the first
    matching option.

    The naive `el.click()` on the input found by `[id=...]` opens the
    listbox for most Greenhouse custom-question selects (which render with
    role=combobox on the input itself), but FAILS for the standard EEO
    react-selects (Sex, Race, etc.) where the input is hidden inside a
    wrapper div and only the parent `.select__control` is interactable.
    To cover both shapes we first try clicking the input; if no listbox
    opens, we walk up looking for the visible trigger element."""
    el = page.query_selector(selector)
    if not el:
        return
    try:
        el.click()
        page.wait_for_timeout(150)
        # If clicking the hidden input didn't open a listbox, walk up to
        # the visible react-select control (`.select__control` / etc.) and
        # click that instead. Start from the input's PARENT — the input
        # itself often carries role=combobox but clicking it is what got
        # us into this fallback branch in the first place; we need the
        # wrapper that owns the visual trigger.
        if not _listbox_visible(page, selector):
            try:
                opened = page.evaluate(
                    """(sel) => {
                        const input = document.querySelector(sel);
                        if (!input) return false;
                        let node = input.parentElement;
                        for (let i = 0; i < 6 && node; i++) {
                            if (node.classList && (
                                node.classList.contains('select__control') ||
                                node.classList.contains('react-select__control') ||
                                node.classList.contains('select__value-container')
                            )) {
                                node.click();
                                return true;
                            }
                            node = node.parentElement;
                        }
                        return false;
                    }""",
                    selector,
                )
                if opened:
                    page.wait_for_timeout(200)
            except Exception:
                pass
        page.keyboard.type(option_text, delay=20)
        page.wait_for_timeout(200)
        # Pick the highlighted option; react-select highlights the first match.
        page.keyboard.press("Enter")
        filled[selector] = f"combo:{option_text}"
    except Exception as exc:
        unmapped.append({"field_id": selector, "label": option_text,
                          "reason": f"combobox failure: {exc}"})


def _failure(reason: str, **extra: Any) -> Dict[str, Any]:
    out: Dict[str, Any] = {"status": "failed", "failure_reason": reason}
    out.update(extra)
    return out


def _candidate_apply_urls(apply_url: str, job_id: str) -> List[str]:
    """Return the URL(s) we should try to load the Greenhouse form from.

    The challenge: many companies (Stripe, Databricks, DoorDash, …)
    configure their Greenhouse boards so that visits to the canonical
    `boards.greenhouse.io/{slug}/jobs/{id}` URL get redirected to their own
    custom careers page (stripe.com/jobs/listing/...). The form is on a
    different URL.

    The two patterns that reliably reach the form regardless of custom-URL
    redirects:

      1. `https://boards.greenhouse.io/embed/job_app?for={slug}&token={ext_id}`
         This is the iframe-embed endpoint — returns ONLY the application
         form HTML. Companies have no way to redirect this; it's the
         endpoint they embed in their own page.

      2. `https://boards.greenhouse.io/{slug}/jobs/{ext_id}/applications/new`
         The explicit form path. Most companies don't redirect this either,
         since redirecting it would break their own custom careers page.

    We try those two first. The canonical `/jobs/{id}` URLs go LAST since
    they're the ones most commonly redirected away.
    """
    candidates: List[str] = []

    parts = (job_id or "").split("_", 2)
    if len(parts) == 3 and parts[0].lower() == "greenhouse":
        slug, ext_id = parts[1], parts[2]
        candidates.append(
            f"https://boards.greenhouse.io/embed/job_app?for={slug}&token={ext_id}"
        )
        candidates.append(
            f"https://boards.greenhouse.io/{slug}/jobs/{ext_id}/applications/new"
        )
        candidates.append(
            f"https://job-boards.greenhouse.io/{slug}/jobs/{ext_id}#app"
        )
        candidates.append(
            f"https://boards.greenhouse.io/{slug}/jobs/{ext_id}"
        )

    if apply_url:
        if "greenhouse.io" in apply_url.lower():
            candidates.insert(0, apply_url)
        else:
            candidates.append(apply_url)

    seen: set[str] = set()
    deduped: List[str] = []
    for url in candidates:
        if url and url not in seen:
            seen.add(url)
            deduped.append(url)
    return deduped
