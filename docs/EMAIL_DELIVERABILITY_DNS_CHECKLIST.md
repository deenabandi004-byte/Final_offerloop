# Email Deliverability — DNS Setup Checklist

Owner: whoever holds DNS access for `offerloop.ai`
Purpose: verify SPF, DKIM, DMARC, and BIMI are correctly set up before
Phase 2 (lifecycle campaigns) ships. Gmail and Yahoo enforce these since
Feb 2024 — failing checks quietly land your emails in spam.

Time to complete: **~30 minutes** if records already exist; **~2 hours** if
starting from `p=none` and warming up.

---

## Sender identities that need coverage

| Sender | Domain | Vendor |
|---|---|---|
| `Deena from Offerloop <sid@offerloop.ai>` | offerloop.ai | Resend (lifecycle) |
| `Offerloop Newsletter <hello@offerloop.ai>` | offerloop.ai | Beehiiv (newsletter) |
| `Offerloop <noreply@offerloop.ai>` | offerloop.ai | Resend (system + transactional) |
| `Offerloop Loops <loops@offerloop.ai>` | offerloop.ai | Resend (agent loop alerts) |

All four share the root domain, so a single DMARC record covers everything.
SPF and DKIM need per-vendor entries.

---

## 1. SPF — Sender Policy Framework

**What**: tells receivers which servers are allowed to send mail claiming to be from `offerloop.ai`.

**Check current state**:
```bash
dig TXT offerloop.ai +short | grep spf1
```

**Target record** (single line, TXT record on `offerloop.ai`):
```
v=spf1 include:_spf.resend.com include:_spf.beehiiv.com include:_spf.google.com ~all
```

Include Google if you use Google Workspace for `sid@offerloop.ai` (which you should, per the plan). If Google Workspace isn't used, drop that include.

Notes:
- `~all` (soft-fail) not `-all` (hard-fail) during warm-up. Switch to `-all` after 2 weeks of clean sends.
- Only **one** SPF record allowed per domain — merge all vendors into a single record.
- 10-lookup limit — each `include:` counts as one. We're at 3, which is fine.

---

## 2. DKIM — DomainKeys Identified Mail

**What**: vendor cryptographically signs outbound mail; receivers verify using a public key at a known DNS path.

**Resend DKIM**:
- In Resend dashboard: Domains → `offerloop.ai` → shows 3 records to add (`resend._domainkey`, `resend2._domainkey`, and MX for return-path).
- After adding, hit **Verify** in Resend — must show green before sending real traffic.

**Beehiiv DKIM**:
- Beehiiv dashboard: Settings → Custom Sending Domain → walk through the wizard for `offerloop.ai`.
- Add the TXT records it prints, hit **Verify**.

**Google Workspace DKIM** (for `sid@offerloop.ai` outbound replies):
- Google Admin → Apps → Google Workspace → Gmail → Authenticate email → Generate new record → 2048-bit.
- Add the TXT record at `google._domainkey.offerloop.ai`.
- Start authentication after the record propagates.

**Verify all**:
```bash
dig TXT resend._domainkey.offerloop.ai +short
dig TXT beehiiv._domainkey.offerloop.ai +short   # actual selector name varies
dig TXT google._domainkey.offerloop.ai +short
```

Each should return a `v=DKIM1; k=rsa; p=...` value.

---

## 3. DMARC — Domain-based Message Authentication

**What**: tells receivers what to do when SPF or DKIM fails, and where to send reports.

**Current state**:
```bash
dig TXT _dmarc.offerloop.ai +short
```

**Target record** (TXT at `_dmarc.offerloop.ai`):

Week 1 (monitoring only, catch any leftover misconfigured senders):
```
v=DMARC1; p=none; rua=mailto:dmarc-reports@offerloop.ai; ruf=mailto:dmarc-reports@offerloop.ai; sp=none; adkim=r; aspf=r; pct=100
```

Week 2 (after clean reports come in, tighten to quarantine):
```
v=DMARC1; p=quarantine; rua=mailto:dmarc-reports@offerloop.ai; sp=quarantine; adkim=r; aspf=r; pct=100
```

Week 4+ (after stable quarantine reports, go to reject):
```
v=DMARC1; p=reject; rua=mailto:dmarc-reports@offerloop.ai; sp=reject; adkim=s; aspf=s; pct=100
```

**Do NOT ship at `p=reject` on day 1.** Any misaligned sender you forgot about (analytics tools, calendar invites, CRM integrations) will bounce hard and someone will lose important mail.

**Set up dmarc-reports@offerloop.ai**: create the mailbox in Google Workspace, or route to a free service like Postmark's DMARC monitoring or dmarcian for parsed reports. Aggregate reports arrive daily.

---

## 4. Bulk-sender compliance (Gmail/Yahoo, Feb 2024)

Only relevant once you exceed **5,000 emails/day to Gmail addresses**. At current scale (~9k/month) you're safely under.

If/when you cross the threshold:
- [x] Authenticated (SPF + DKIM aligned) — covered above
- [x] DMARC at `p=quarantine` or `p=reject` — after week 2
- [x] `List-Unsubscribe` header with mailto + one-click POST — Resend adapter already sets this
- [x] Complaint rate <0.3% (Google Postmaster Tools) — monitor
- [ ] Register at [Google Postmaster Tools](https://postmaster.google.com/) to track this domain's reputation

---

## 5. Test the whole chain before going live

**Send a test lifecycle email to a Gmail address**:

1. Point `LIFECYCLE_CRON_SECRET`, `RESEND_API_KEY`, `LIFECYCLE_FROM_EMAIL=sid@offerloop.ai`, `LIFECYCLE_POSTAL_ADDRESS=<real address>` on staging.
2. Create a test lead in `lifecycle_leads` with `captured_at` = now.
3. Hit `POST /api/lifecycle/tick` with the cron secret.
4. Open the received Gmail message → click **⋮** → **Show original**.

**What to check in "Show original"**:
- `SPF: PASS` ✅
- `DKIM: PASS` for `d=offerloop.ai` ✅
- `DMARC: PASS` ✅
- `From:` shows `Deena from Offerloop <sid@offerloop.ai>` with no `via` warning ✅
- Body contains a real postal address in the footer ✅
- Click the Unsubscribe link → confirms unsubscribed ✅

If any of those fail, fix before Phase 2.

---

## 6. Postal address (CAN-SPAM)

Every commercial email must contain a real physical postal address in the footer. Options for Offerloop:

- **Delaware LLC registered agent** (if incorporated) — cleanest, professional, safe
- **USC campus PO box** — legitimate but potentially confusing for non-student recipients
- **Founder home address** — legal but not recommended (privacy + doxxing risk)
- **Virtual mailbox** service (Earth Class Mail, Anytime Mailbox) — ~$15/mo, forwards physical mail

Once chosen, set on Render:
```
LIFECYCLE_POSTAL_ADDRESS=Offerloop Inc., 251 Little Falls Drive, Wilmington, DE 19808
```

Until this is set, all lifecycle emails print a **visible placeholder** in the footer (`⚠ Set LIFECYCLE_POSTAL_ADDRESS env var…`) so a QA reviewer catches it instantly. Do not go live without a real address.

---

## Env vars summary (Render → Environment)

Required before Phase 2 lifecycle campaigns ship:

| Var | Where to get | Example |
|---|---|---|
| `LIFECYCLE_FROM_EMAIL` | The plan | `Deena from Offerloop <sid@offerloop.ai>` |
| `LIFECYCLE_SIGNATURE_NAME` | The plan | `Deena` |
| `LIFECYCLE_POSTAL_ADDRESS` | Section 6 above | see example |
| `LIFECYCLE_CRON_SECRET` | Generate: `openssl rand -hex 32` | `<64 hex chars>` |
| `LIFECYCLE_UNSUBSCRIBE_SECRET` | Generate: `openssl rand -hex 32` | `<64 hex chars>` |
| `RESEND_API_KEY` | Resend dashboard | `re_...` |
| `RESEND_WEBHOOK_SECRET` | Resend dashboard webhook | `whsec_...` |
| `BEEHIIV_API_KEY` | Beehiiv → Settings → API | `<key>` |
| `BEEHIIV_PUBLICATION_ID` | Beehiiv publication URL | `pub_...` |
| `BEEHIIV_WEBHOOK_SECRET` | Generate: `openssl rand -hex 32` | `<64 hex chars>` |

Also set up **Render cron** to POST `https://offerloop.ai/api/lifecycle/tick` hourly with header `X-Cron-Secret: <LIFECYCLE_CRON_SECRET>`.
