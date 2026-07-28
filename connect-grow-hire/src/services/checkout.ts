/**
 * One-click Stripe checkout — shared by the pricing page, upgrade modals, and
 * trial banners so every "upgrade" surface lands on the same payment page in
 * one tap instead of detouring through /pricing.
 *
 * 2026-07-27 pricing simplification: one price per tier (Pro $9.99 / Elite
 * $34.99, 2,000 / 5,000 credits), student pricing for everyone, 7-day
 * card-on-file trial handled server-side (no trial if already used).
 */
import { getAuth } from 'firebase/auth';
import { BACKEND_URL } from '@/services/api';

// Last-resort fallbacks if /api/tier-config is unreachable. Must match the
// defaults in backend/app/config.py STRIPE_PRICE_CATALOG.
const FALLBACK_PRICE_IDS: Record<'pro' | 'elite', string> = {
  pro: 'price_1TxzloERY2WrVHp15NcO6deA', // $9.99/mo — pro_monthly_999_2026
  elite: 'price_1ScLcfERY2WrVHp1c5rcONJ3', // $34.99/mo
};

const DEFAULT_CREDITS: Record<'pro' | 'elite', number> = {
  pro: 2000,
  elite: 5000,
};

interface StartCheckoutOptions {
  /** Where the click came from, for the Stripe cancel_url round-trip. */
  cancelPath?: string;
}

/**
 * Start a subscription checkout for the given tier and redirect the browser to
 * Stripe. Throws on failure — callers surface the error however fits their UI.
 */
export async function startCheckout(
  tier: 'pro' | 'elite',
  options: StartCheckoutOptions = {},
): Promise<void> {
  const fbUser = getAuth().currentUser;
  if (!fbUser) throw new Error('Not signed in');
  const token = await fbUser.getIdToken();

  // Resolve the live price ID from the public tier config; fall back to the
  // hardcoded default if the endpoint is unreachable.
  let priceId = FALLBACK_PRICE_IDS[tier];
  let credits = DEFAULT_CREDITS[tier];
  try {
    const cfgRes = await fetch(`${BACKEND_URL}/api/tier-config`);
    if (cfgRes.ok) {
      const cfg = await cfgRes.json();
      const stop = (cfg.slider_stops?.[tier] ?? []).find(
        (s: { default?: boolean }) => s.default,
      );
      if (stop?.credits) credits = stop.credits;
      const catalogId = cfg.stripe_catalog?.[tier]?.monthly?.student?.[credits];
      if (catalogId) priceId = catalogId;
    }
  } catch {
    /* fall back to hardcoded defaults */
  }

  const res = await fetch(`${BACKEND_URL}/api/create-checkout-session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      priceId,
      tier,
      credits,
      cadence: 'monthly',
      audience: 'student',
      successUrl: `${window.location.origin}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${window.location.origin}${options.cancelPath ?? '/pricing'}`,
    }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({} as Record<string, string>));
    throw new Error(body.message || body.error || `Checkout failed (${res.status})`);
  }
  const { url } = await res.json();
  if (!url) throw new Error('Checkout session missing redirect URL');
  window.location.href = url;
}
