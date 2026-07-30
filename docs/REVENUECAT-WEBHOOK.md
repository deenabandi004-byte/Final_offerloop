# RevenueCat webhook — setup and behavior

Backend half of SPEC-iap-v2-pricing-and-credits.md section 5. Apple takes the
money for in-app purchases, so Stripe never fires. RevenueCat calls us instead,
and this endpoint is the **only** thing that grants credits for a mobile
purchase. The client never writes a balance.

## The endpoint

```
POST https://offerloop-staging.onrender.com/api/revenuecat/webhook
```

Paste that into RevenueCat → project → Integrations → Webhooks, and put the
shared secret in the **Authorization** field on the same screen.

## Environment variables

Set these on the Render service that serves the URL above
(`offerloop-staging`, `srv-d93d0fcvikkc73a1igmg`):

| Var | Value | Why |
|---|---|---|
| `REVENUECAT_WEBHOOK_SECRET` | the shared secret | Must match the Authorization field in the RC dashboard exactly. **Unset means every request 401s** — the endpoint fails closed rather than becoming an open credit faucet. |
| `REVENUECAT_API_KEY` | RC secret key (`sk_…`) | Used to read the authoritative subscriber snapshot instead of guessing tier from the event type. Optional: without it we fall back to the entitlements on the event itself. |
| `REVENUECAT_EXPECT_PRODUCTION` | unset on staging, `1` in production | Staging processes **SANDBOX** events only; production processes **PRODUCTION** events only. Both RC apps can safely point at the same URL with this set correctly on each service. |

## What it does with each event

| Event | Action |
|---|---|
| `NON_RENEWING_PURCHASE` on a known pack product | Grant those credits to the never-expiring `bonusCredits` bucket |
| `REFUND` / `CANCELLATION` on a pack product | Claw the credits back, clamped at zero |
| `INITIAL_PURCHASE`, `RENEWAL`, `PRODUCT_CHANGE`, `CANCELLATION`, `EXPIRATION`, `UNCANCELLATION`, `BILLING_ISSUE`, `REFUND` on a subscription | Re-read the subscriber from RevenueCat and set `subscriptionTier` / `maxCredits` / `subscriptionSource: apple` |
| `TEST`, `TRANSFER`, anything unrecognised | 200, no write |

Everything returns **200 even when ignored** — a non-2xx makes RevenueCat retry
an event we dropped on purpose. Genuine failures return 500 so the retry helps.

## Decisions worth knowing

**`app_user_id` is our Firebase uid.** The app calls
`Purchases.logIn(firebaseUid)` after auth, so every event carries it. A purchase
made *before* `logIn` arrives on a `$RCAnonymousID:…` instead and is dropped, not
credited — there is no safe way to guess whose it is.

**Idempotency is a claim, not a check.** Each grant/clawback first `.create()`s
`users/{uid}/iapPurchases/{transaction_id}`, which fails if it already exists.
That makes the claim itself the dedupe, with no read-then-write race between two
of RevenueCat's five retries landing on two gunicorn workers at once. If the
grant then fails, the claim is released so the retry can work.

Refunds key on `refund:{transaction_id}` rather than the bare id, because a
refund carries the *same* transaction id as the purchase it reverses — sharing a
key would make the clawback look already-applied and silently drop it.

**Subscription events don't derive tier from the event type.** They re-read the
subscriber snapshot from RevenueCat. One code path covers purchase, renewal,
upgrade, downgrade, cancel, expiry and refund instead of a truth table that's
easy to get wrong on `PRODUCT_CHANGE`. If that read fails we fall back to the
entitlements on the event, so a RevenueCat outage can't downgrade a paying user.

**Credits refill on tier CHANGE, not on renewal.** The monthly allowance resets
on the 1st. Refilling on Apple's renewal date too would hand two months of
credits to anyone billed mid-month.

**Apple never stomps an active Stripe subscription.** `subscriptionSource`
records who granted the tier; an Apple event on a user with a live
`stripeSubscriptionId` is skipped and logged.

**Refund clawback clamps at zero.** This was the open question in spec §5. If the
refunded credits were already spent we do *not* carry debt into the user's next
purchase — a booby-trapped top-up is a support ticket and a chargeback, over
single-digit dollars. The unrecovered amount is written to
`lastPackRefundShortfall` for support visibility instead.

## Pack ladder

Product ids are the source of truth for value. An id nobody mapped grants
nothing rather than guessing. Mapping lives in `IAP_CREDIT_PACKS`
(`backend/app/config.py`); `.preview` ids are the staging bundle's mirrors.

| Product | Credits | Price |
|---|---|---|
| `ai.offerloop.app.credits.150` | 150 | $2.99 |
| `ai.offerloop.app.credits.400` | 400 | $5.99 |
| `ai.offerloop.app.credits.1000` | 1,000 | $9.99 |

## One thing this change also closed

`firestore.rules` blocked clients from writing `credits` and `maxCredits` but
**not** `bonusCredits` or `promoCredits` — and `credit_ledger.deduct` spends
monthly → bonus → promo, so a signed-in user could set `bonusCredits: 999999`
from the SDK and never pay again. That bucket is exactly where this webhook
grants Apple purchases, so the rule now blocks both, plus `subscriptionSource`
(client-writable would let someone switch off the Apple-vs-Stripe guard).

**These rules need deploying separately** — `firebase deploy --only firestore:rules`.
Pushing the branch does not ship them.

## Still open (not solved by this code)

- **`/api/mobile/me` reports the monthly bucket only.** It returns `credits`
  straight from the user doc, so a pack bought in the app grants correctly but
  the balance the app displays won't move. Needs to report
  `credits + bonusCredits` (`credit_ledger.get_balance_breakdown` already
  computes it). Spending already drains monthly → bonus correctly.
- **Web and iOS pack ladders differ.** $4.99 buys 500 credits on the web,
  $2.99 buys 150 in the app, and the web's own main branch sells 1,500 for
  $9.99 where the app sells 1,000. Same wallet either way. Spec §9.2, for Nick.
- **The App Store Connect side.** Product records at "Ready to Submit", the
  consumables added in RevenueCat, sandbox testers. Apple-paced, unblocked by
  this.

## Tests

```bash
cd backend
pytest tests/test_revenuecat_webhook.py tests/test_revenuecat_route.py
```

54 tests. The pure decision logic (what to grant, to whom, under which key) is
covered exhaustively with literal RevenueCat payloads; the Firestore writes are
covered by the sandbox QA gate in spec section 7, same convention as
`test_credit_ledger.py`.
