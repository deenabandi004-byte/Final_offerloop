# Offerloop Pricing — Canonical Spec

Last updated: 2026-07-27 (pricing simplification). This doc is the spec the
code mirrors. If you change pricing, change this file first, then follow
`.claude/skills/offerloop-pricing-update` to land it everywhere.

## Strategy (decided 2026-07-27)

Goal: **maximize the number of paying users** with the lowest possible
friction. Simplicity sells. That means:

- One price per tier. No credit slider, no student/list split, no annual toggle.
- Student pricing IS the pricing — everyone gets it, zero .edu verification.
- 7-day card-on-file free trial (card collected at checkout; billing starts
  day 8 unless canceled). One trial per account lifetime (`trialUsedAt`).
- Wallet payments on: Link, Apple Pay, Google Pay, Cash App (dashboard
  payment-method configuration governs; code passes no `payment_method_types`).
- Paywall at the moment of pain: UpgradeModal / TrialBanner go straight to
  Stripe Checkout via `src/services/checkout.ts`, not through /pricing.

## Live tiers

| | Free | Pro | Elite |
|---|---|---|---|
| Price | $0 | **$9.99/mo** | $34.99/mo |
| Credits/month | 300 | 2,000 | 5,000 |
| Contacts/search | 3 | 8 | 15 |
| Trial | — | 7 days, card on file | (checkout also grants 7 days) |

Also live: Season Pass ($99 one-time, 4 months, 3,000 cr/mo) and top-up packs
($4.99/500, $9.99/1,500, $24.99/3,000 — Pro/Elite only, credits never expire).

## Stripe SKUs

| SKU | Price ID | Status |
|---|---|---|
| Pro monthly $9.99 | `price_1TxzloERY2WrVHp15NcO6deA` (lookup_key `pro_monthly_999_2026`) | **Current** — default for `STRIPE_PRO_MONTHLY_STUDENT_2K` |
| Pro monthly $14.99 (legacy) | `price_1ScLXrERY2WrVHp1bYgdMAu4` | Existing subscribers only; resolved via legacy constant |
| Elite monthly $34.99 | `price_1ScLcfERY2WrVHp1c5rcONJ3` | Current |

Existing subscribers are grandfathered on whatever they pay today; nothing was
migrated. Old multi-stop inline subscriptions ($19.99/3K etc.) renew untouched.

**Render env check**: if `STRIPE_PRO_MONTHLY_STUDENT_2K` is set in Render it
overrides the code default — either unset it or set it to the $9.99 price ID.

## Retired (2026-07-27) — code kept dormant for possible revert

- Credit slider (SLIDER_STOPS collapsed to one default stop per tier)
- Annual cadence (toggle removed from /pricing; ANNUAL_PRICING dict unused)
- .edu student gate (`user_is_student_eligible` returns True for everyone)
- No-card 600-credit trial (`/api/users/start-trial` endpoint still live for
  pre-cutover trial users, but no UI calls it anymore)

## Mobile (RevenueCat) parity

The iOS/Android app bills through RevenueCat, not Stripe. Keep the structure
identical: Free tier → 7-day intro trial on Pro → $9.99/mo, Elite $34.99/mo,
no annual, no student verification. Configure the 7-day free-trial intro offer
on the Pro package in RevenueCat.

## Kill criteria (check ~60 days after launch, late Sept 2026)

- Free→paid conversion falls below the 22% baseline → the card-on-file trial
  is costing more than it converts; test a 7-day no-card variant.
- Trial-to-paid below 25% → trial isn't reaching activation; revisit
  onboarding, not price.
