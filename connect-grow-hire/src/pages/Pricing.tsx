import { useState, useEffect } from "react";
import { Helmet } from "react-helmet-async";
import { Check, ArrowLeft, Settings, Shield, ChevronDown, X, Menu } from "lucide-react";
import { useNavigate, Link } from "react-router-dom";
import { useFirebaseAuth } from "../contexts/FirebaseAuthContext";
import OfferloopLogo from '@/assets/offerloop_logo2.png';
import { loadStripe } from "@stripe/stripe-js";
import { getAuth } from 'firebase/auth';
import { BACKEND_URL } from '@/services/api';
import { trackUpgradeClick } from "../lib/analytics";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { AppHeader } from "@/components/AppHeader";
import { MainContentWrapper } from "@/components/MainContentWrapper";
import { ScribbleUnderline } from "@/components/ScribbleUnderline";

const STRIPE_PUBLISHABLE_KEY = "pk_live_51S4BB8ERY2WrVHp1acXrKE6RBG7NBlfHcMZ2kf7XhCX2E5g8Lasedx6ntcaD1H4BsoUMBGYXIcKHcAB4JuohLa2B00j7jtmWnB";
const stripePromise = loadStripe(STRIPE_PUBLISHABLE_KEY);

// Monthly Stripe price IDs (existing, live)
const STRIPE_PRO_PRICE_ID = "price_1ScLXrERY2WrVHp1bYgdMAu4"; // Pro $14.99/mo
const STRIPE_ELITE_PRICE_ID = "price_1ScLcfERY2WrVHp1c5rcONJ3"; // Elite $34.99/mo

// Annual Stripe price IDs - set these in env when annual SKUs are created in Stripe dashboard.
// Until then, annual CTA falls back to monthly checkout.
const STRIPE_PRO_ANNUAL_PRICE_ID = (import.meta.env.VITE_STRIPE_PRO_ANNUAL_PRICE_ID as string | undefined) || null;
const STRIPE_ELITE_ANNUAL_PRICE_ID = (import.meta.env.VITE_STRIPE_ELITE_ANNUAL_PRICE_ID as string | undefined) || null;
const ANNUAL_ENABLED = Boolean(STRIPE_PRO_ANNUAL_PRICE_ID && STRIPE_ELITE_ANNUAL_PRICE_ID);

// Display prices - student is the real price, list is the public anchor (used for strikethrough)
const PRICES = {
  pro: { listMonthly: 29, studentMonthly: 14.99, studentAnnual: 149 },
  elite: { listMonthly: 59, studentMonthly: 34.99, studentAnnual: 349 },
} as const;

interface SubscriptionStatus {
  tier: string;
  status: string;
  hasSubscription: boolean;
  currentPeriodEnd?: number;
  cancelAtPeriodEnd?: boolean;
}

// ============================================================
// Feature row — uses semantic ink + accent tokens, no cyan/green soup.
// ============================================================
interface FeatureItemProps {
  children: React.ReactNode;
  highlight?: boolean;
  muted?: boolean;
}

const FeatureItem: React.FC<FeatureItemProps> = ({ children, highlight, muted }) => (
  <div className="flex items-start gap-3">
    <div
      className="w-5 h-5 rounded-[3px] flex items-center justify-center flex-shrink-0 mt-0.5"
      style={{
        background: muted
          ? 'var(--line-2)'
          : highlight
            ? 'rgba(59,130,246,0.12)'
            : 'var(--paper-2)',
      }}
    >
      <Check
        className="w-3 h-3"
        style={{ color: muted ? 'var(--ink-3)' : '#3B82F6' }}
      />
    </div>
    <span
      className="text-sm"
      style={{
        color: muted ? 'var(--ink-3)' : highlight ? 'var(--ink)' : 'var(--ink-2)',
        fontWeight: highlight ? 600 : 400,
      }}
    >
      {children}
    </span>
  </div>
);

const DisabledFeatureItem: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="flex items-start gap-3">
    <div
      className="w-5 h-5 rounded-[3px] flex items-center justify-center flex-shrink-0 mt-0.5"
      style={{ background: 'var(--line-2)' }}
    >
      <X className="w-3 h-3" style={{ color: 'var(--ink-3)' }} />
    </div>
    <span className="text-sm" style={{ color: 'var(--ink-3)' }}>{children}</span>
  </div>
);

// ============================================================
// FAQ row — quiet divider line, ink-2 question, ink-3 answer.
// ============================================================
interface FAQItemProps {
  question: string;
  answer: string;
  isProminent?: boolean;
}

const FAQItem: React.FC<FAQItemProps> = ({ question, answer, isProminent = false }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div style={{ borderBottom: '1px solid var(--line-2)' }}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between py-4 text-left transition-colors"
        style={{ background: 'transparent' }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--paper-2)'; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
      >
        <span
          style={{
            color: 'var(--ink)',
            fontWeight: isProminent ? 600 : 500,
            fontSize: 14,
          }}
        >
          {question}
        </span>
        <ChevronDown
          className={`w-4 h-4 transition-transform duration-200 flex-shrink-0 ml-4 ${isOpen ? 'rotate-180' : ''}`}
          style={{ color: 'var(--ink-3)' }}
        />
      </button>

      {isOpen && (
        <div
          className="pb-4 leading-relaxed"
          style={{ color: 'var(--ink-2)', fontSize: isProminent ? 15 : 14 }}
        >
          {answer}
        </div>
      )}
    </div>
  );
};

// ============================================================
// Comparison row.
// ============================================================
interface ComparisonRowProps {
  feature: string;
  free: boolean | string;
  pro: boolean | string;
  elite: boolean | string;
}

const ComparisonRow: React.FC<ComparisonRowProps> = ({ feature, free, pro, elite }) => (
  <tr style={{ borderTop: '1px solid var(--line-2)' }}>
    <td className="py-4 px-6" style={{ color: 'var(--ink)', fontSize: 14 }}>{feature}</td>
    <td className="text-center py-4 px-6">
      {typeof free === 'boolean' ? (
        free
          ? <Check className="w-4 h-4 mx-auto" style={{ color: 'var(--signal-pos)' }} />
          : <X className="w-4 h-4 mx-auto" style={{ color: 'var(--ink-3)' }} />
      ) : (
        <span style={{ color: 'var(--ink-2)', fontSize: 14 }}>{free}</span>
      )}
    </td>
    <td className="text-center py-4 px-6" style={{ background: 'var(--paper-2)' }}>
      {typeof pro === 'boolean' ? (
        pro
          ? <Check className="w-4 h-4 mx-auto" style={{ color: '#3B82F6' }} />
          : <X className="w-4 h-4 mx-auto" style={{ color: 'var(--ink-3)' }} />
      ) : (
        <span style={{ color: 'var(--ink)', fontSize: 14, fontWeight: 600 }}>{pro}</span>
      )}
    </td>
    <td className="text-center py-4 px-6">
      {typeof elite === 'boolean' ? (
        elite
          ? <Check className="w-4 h-4 mx-auto" style={{ color: 'var(--signal-pos)' }} />
          : <X className="w-4 h-4 mx-auto" style={{ color: 'var(--ink-3)' }} />
      ) : (
        <span style={{ color: 'var(--ink-2)', fontSize: 14 }}>{elite}</span>
      )}
    </td>
  </tr>
);

const Pricing = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [subscriptionStatus, setSubscriptionStatus] = useState<SubscriptionStatus | null>(null);
  const [billingCadence, setBillingCadence] = useState<'monthly' | 'annual'>('monthly');
  // showStudentPrice is a visual toggle for the public pricing page - it lets visitors
  // SEE the .edu discount before signing up. Actual checkout still uses the student
  // Stripe Price IDs (only ones wired); list-price checkout will be wired when
  // STRIPE_*_LIST_PRICE_ID env vars are added.
  const [showStudentPrice, setShowStudentPrice] = useState(true);
  const [navbarScrolled, setNavbarScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const navigate = useNavigate();
  const { user, updateUser, checkCredits } = useFirebaseAuth();
  // isStudent is on the Firestore user doc; not yet typed on the auth-context User shape.
  const isStudent = Boolean((user as { isStudent?: boolean } | null)?.isStudent);
  // Trial badge follows the toggle (visual). Real trial length in Stripe is set
  // server-side from the Firestore isStudent flag (see backend/app/services/stripe_client.py).
  const trialDays = showStudentPrice ? 30 : 14;

  useEffect(() => {
    if (user) {
      fetchSubscriptionStatus();
    }
  }, [user]);

  useEffect(() => {
    const handleScroll = () => setNavbarScrolled(window.scrollY > 50);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const fetchSubscriptionStatus = async () => {
    try {
      const auth = getAuth();
      const firebaseUser = auth.currentUser;

      if (!firebaseUser) return;

      const token = await firebaseUser.getIdToken();
      const response = await fetch(`${BACKEND_URL}/api/subscription-status`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        setSubscriptionStatus(data);
      }
    } catch (error) {
      console.error('Failed to fetch subscription status:', error);
    }
  };

  const handleManageSubscription = async () => {
    if (!user) return;

    setIsLoading(true);
    try {
      const auth = getAuth();
      const firebaseUser = auth.currentUser;

      if (!firebaseUser) {
        throw new Error('No Firebase user found');
      }

      const token = await firebaseUser.getIdToken();
      const response = await fetch(`${BACKEND_URL}/api/create-portal-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          returnUrl: `${window.location.origin}/pricing`,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        const errorMessage = errorData.details || errorData.error || 'Failed to create portal session';
        throw new Error(errorMessage);
      }

      const { url } = await response.json();
      if (!url) {
        throw new Error('No portal URL received from server');
      }

      window.location.href = url;

    } catch (error) {
      console.error('Portal error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to open subscription management. Please try again.';

      if (errorMessage.includes('mode mismatch') || errorMessage.includes('test mode') || errorMessage.includes('live mode')) {
        alert('Stripe Configuration Error: There is a mismatch between test and live mode keys. Please contact support or check your Stripe configuration.');
      } else {
        alert(`Failed to open subscription management: ${errorMessage}`);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetCredits = async (tier: 'free' | 'pro' | 'elite') => {
    if (!user) return;

    // Credit amounts based on tier (matches backend/app/config.py TIER_CONFIGS)
    const creditMap = { 'free': 500, 'pro': 3000, 'elite': 12000 };
    const maxCredits = creditMap[tier];

    try {
      await updateUser({ credits: maxCredits, maxCredits: maxCredits });
      if (checkCredits) {
        await checkCredits();
      }
    } catch (error) {
      console.error("Error resetting credits:", error);
    }
  };

  const handleSubscriptionUpgrade = async (newTier: 'pro' | 'elite') => {
    if (!user) return;

    setIsLoading(true);
    try {
      const auth = getAuth();
      const firebaseUser = auth.currentUser;
      if (!firebaseUser) throw new Error('No Firebase user found');

      const token = await firebaseUser.getIdToken();
      const useAnnualUpgrade = billingCadence === 'annual' && ANNUAL_ENABLED;
      const priceId = newTier === 'elite'
        ? (useAnnualUpgrade ? STRIPE_ELITE_ANNUAL_PRICE_ID! : STRIPE_ELITE_PRICE_ID)
        : (useAnnualUpgrade ? STRIPE_PRO_ANNUAL_PRICE_ID! : STRIPE_PRO_PRICE_ID);

      const response = await fetch(`${BACKEND_URL}/api/update-subscription`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ priceId }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || 'Failed to update subscription');
      }

      await response.json();

      if (checkCredits) await checkCredits();
      await fetchSubscriptionStatus();

      alert(`Successfully upgraded to ${newTier === 'elite' ? 'Elite' : 'Pro'}! Your credits have been updated.`);
    } catch (error) {
      console.error('Subscription upgrade error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      alert(`Failed to upgrade: ${errorMessage}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpgrade = async (planType: 'free' | 'pro' | 'elite', fromFeature?: string) => {
    // Public pricing page - visitors without an account get bounced to sign-in
    // and brought back to /pricing with the plan they tapped pre-selected.
    if (!user) {
      navigate(`/signin?next=/pricing&plan=${planType}`);
      return;
    }

    try {
      if (planType === 'free') {
        await updateUser({ tier: 'free', credits: 500, maxCredits: 500 });
        navigate("/find");
      }
      else if (planType === 'pro' || planType === 'elite') {
        trackUpgradeClick(fromFeature || 'pricing', {
          from_location: 'pricing_page',
          plan_selected: planType,
        });

        if (hasActiveSubscription) {
          await handleSubscriptionUpgrade(planType);
        } else {
          await handleStripeCheckout(planType);
        }
      }
    } catch (error) {
      console.error("Error updating user:", error);
    }
  };

  const handleStripeCheckout = async (tier: 'pro' | 'elite' = 'pro') => {
    if (!user) {
      console.error("User not authenticated");
      return;
    }

    setIsLoading(true);

    try {
      const auth = getAuth();
      const firebaseUser = auth.currentUser;

      if (!firebaseUser) {
        throw new Error('No Firebase user found');
      }

      const token = await firebaseUser.getIdToken();

      // Annual price IDs come from env vars; if not set, fall back to monthly so checkout still works.
      const useAnnual = billingCadence === 'annual' && ANNUAL_ENABLED;
      const priceId = tier === 'elite'
        ? (useAnnual ? STRIPE_ELITE_ANNUAL_PRICE_ID! : STRIPE_ELITE_PRICE_ID)
        : (useAnnual ? STRIPE_PRO_ANNUAL_PRICE_ID! : STRIPE_PRO_PRICE_ID);

      const response = await fetch(`${BACKEND_URL}/api/create-checkout-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          priceId: priceId,
          userId: user.uid,
          userEmail: user.email,
          successUrl: `${window.location.origin}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
          cancelUrl: `${window.location.origin}/pricing`,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Checkout session creation failed:', response.status, errorText);
        throw new Error(`Failed to create checkout session: ${response.status} - ${errorText}`);
      }

      const responseData = await response.json();
      const sessionId = responseData.sessionId;
      if (!sessionId) {
        throw new Error('Invalid response from server: missing sessionId');
      }

      const stripe = await stripePromise;
      if (!stripe) {
        throw new Error('Stripe failed to initialize');
      }

      const { error } = await stripe.redirectToCheckout({ sessionId });

      if (error) {
        console.error('Stripe redirect error:', error);
        alert('Payment error: ' + error.message);
      }
    } catch (error) {
      console.error('Checkout error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      alert(`Something went wrong: ${errorMessage}`);
    } finally {
      setIsLoading(false);
    }
  };

  const isProUser = subscriptionStatus?.tier === 'pro' && (subscriptionStatus?.status === 'active' || subscriptionStatus?.status === 'trialing');
  const isEliteUser = subscriptionStatus?.tier === 'elite' && (subscriptionStatus?.status === 'active' || subscriptionStatus?.status === 'trialing');
  const hasActiveSubscription = isProUser || isEliteUser;
  const currentTier = subscriptionStatus?.tier || 'free';

  // Format renewal date
  const renewalDate = subscriptionStatus?.currentPeriodEnd
    ? new Date(subscriptionStatus.currentPeriodEnd * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null;

  // ============================================================
  // Shared body — used in both signed-in (app shell) and signed-out
  // (marketing chrome) renders.
  // ============================================================
  const subscriptionBanner = hasActiveSubscription ? (
    <div
      className="mb-12 rounded-[10px] px-6 py-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 animate-fadeInUp"
      style={{
        background: 'var(--paper-2)',
        border: '1px solid var(--line)',
        animationDelay: '50ms',
      }}
    >
      <div className="flex items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 style={{ fontFamily: 'Inter, sans-serif', fontWeight: 600, color: 'var(--ink)', fontSize: 15 }}>
              {isEliteUser ? 'Elite' : 'Pro'} Subscription{subscriptionStatus?.status === 'trialing' ? ' — Free Trial' : ' Active'}
            </h3>
            {subscriptionStatus?.status === 'trialing' ? (
              <span
                className="px-2 py-0.5 text-[11px] font-semibold rounded-[3px]"
                style={{ background: 'var(--action-bg)', color: 'var(--action-fg)' }}
              >
                Trial
              </span>
            ) : (
              <span
                className="px-2 py-0.5 text-[11px] font-semibold rounded-[3px]"
                style={{ background: 'rgba(22,163,74,0.10)', color: 'var(--signal-pos)' }}
              >
                Active
              </span>
            )}
          </div>
          <p className="text-sm mt-1" style={{ color: 'var(--ink-2)' }}>
            {user?.credits ?? 0} credits remaining
            {renewalDate && !subscriptionStatus?.cancelAtPeriodEnd && ` · Renews ${renewalDate}`}
            {subscriptionStatus?.cancelAtPeriodEnd && renewalDate && ` · Cancels ${renewalDate}`}
          </p>
        </div>
      </div>

      <button
        onClick={handleManageSubscription}
        disabled={isLoading}
        className="flex items-center gap-2 px-4 py-2 rounded-[3px] text-sm font-medium transition-all disabled:opacity-50"
        style={{ background: 'var(--ink)', color: '#FFFFFF' }}
      >
        <Settings className="w-4 h-4" />
        Manage Subscription
      </button>
    </div>
  ) : null;

  const pricingBody = (
    <div className="w-full px-3 py-6 sm:px-8 sm:py-10" style={{ maxWidth: 1024, margin: '0 auto' }}>

      {/* Header — plain "Pricing" in serif with scribble accent */}
      <div className="mb-10" style={{ textAlign: 'center' }}>
        <h1
          className="font-serif relative inline-block"
          style={{
            color: 'var(--ink)',
            fontSize: 56,
            fontWeight: 400,
            letterSpacing: '-0.015em',
            lineHeight: 1.05,
          }}
        >
          Pricing
          <ScribbleUnderline />
        </h1>
        <p className="mt-4 mx-auto" style={{ color: 'var(--ink-2)', fontSize: 15, maxWidth: 540, lineHeight: 1.5 }}>
          {isStudent
            ? 'Welcome, student — your .edu unlocks ~50% off and a 30-day free trial.'
            : 'Use a .edu email to unlock ~50% off and a 30-day trial.'}
        </p>

        {/* Toggles */}
        <div className="flex flex-col items-center gap-3 mt-7">

          {/* .edu Student Price toggle */}
          <div
            className="flex items-center gap-3 px-4 py-2.5 rounded-[3px] transition-all"
            style={{
              background: showStudentPrice ? 'var(--paper-2)' : 'var(--paper)',
              border: `1px solid ${showStudentPrice ? '#3B82F6' : 'var(--line)'}`,
            }}
          >
            <span className="text-base">🎓</span>
            <span
              className="text-sm"
              style={{
                color: showStudentPrice ? 'var(--ink)' : 'var(--ink-2)',
                fontWeight: 600,
              }}
            >
              {showStudentPrice ? '.edu student price — save ~50%' : 'Show .edu student price (~50% off)'}
            </span>
            <button
              onClick={() => setShowStudentPrice(!showStudentPrice)}
              role="switch"
              aria-checked={showStudentPrice}
              aria-label="Toggle student price display"
              className="relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors"
              style={{ background: showStudentPrice ? '#3B82F6' : 'var(--ink-3)' }}
            >
              <span
                className="inline-block h-4 w-4 transform rounded-full bg-white shadow transition"
                style={{ transform: showStudentPrice ? 'translateX(18px)' : 'translateX(2px)' }}
              />
            </button>
          </div>

          {/* Monthly / Annual toggle — segmented control style matching Find tab feel */}
          <div
            className="inline-flex items-center p-1 rounded-[3px]"
            style={{ background: 'var(--paper-2)', border: '1px solid var(--line)' }}
          >
            <button
              onClick={() => setBillingCadence('monthly')}
              className="px-4 py-1.5 text-sm font-semibold rounded-[3px] transition-all"
              style={{
                background: billingCadence === 'monthly' ? 'var(--ink)' : 'transparent',
                color: billingCadence === 'monthly' ? '#FFFFFF' : 'var(--ink-2)',
              }}
            >
              Monthly
            </button>
            <button
              onClick={() => setBillingCadence('annual')}
              className="px-4 py-1.5 text-sm font-semibold rounded-[3px] transition-all flex items-center gap-2"
              style={{
                background: billingCadence === 'annual' ? 'var(--ink)' : 'transparent',
                color: billingCadence === 'annual' ? '#FFFFFF' : 'var(--ink-2)',
              }}
            >
              Annual
              <span
                className="text-[10px] font-bold px-1.5 py-0.5 rounded-[3px] tracking-wider"
                style={{
                  background: billingCadence === 'annual' ? 'rgba(255,255,255,0.18)' : 'rgba(22,163,74,0.12)',
                  color: billingCadence === 'annual' ? '#FFFFFF' : 'var(--signal-pos)',
                }}
              >
                2 MOS FREE
              </span>
            </button>
          </div>

        </div>
      </div>

      {/* Pricing Cards */}
      <div
        className="grid grid-cols-1 md:grid-cols-3 gap-5 lg:gap-6 mb-16 animate-fadeInUp"
        style={{ animationDelay: '200ms', maxWidth: 1024, marginInline: 'auto' }}
      >

        {/* Free Plan Card */}
        <div
          className="rounded-[10px] p-7 flex flex-col h-full transition-all duration-300"
          style={{
            background: 'var(--paper)',
            border: '1px solid var(--line)',
            boxShadow: 'var(--shadow-sm)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'var(--ink-3)';
            e.currentTarget.style.boxShadow = 'var(--shadow-md)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'var(--line)';
            e.currentTarget.style.boxShadow = 'var(--shadow-sm)';
          }}
        >
          <div className="text-center mb-5">
            <h2 className="font-serif text-[28px] mb-1" style={{ color: 'var(--ink)', fontWeight: 400 }}>Free</h2>
            <p className="text-sm" style={{ color: 'var(--ink-3)' }}>Try it out for free</p>
          </div>

          <div className="text-center mb-5">
            <div className="flex items-baseline justify-center gap-1">
              <span className="font-serif text-[44px] leading-none" style={{ color: 'var(--ink)', fontWeight: 400 }}>$0</span>
              <span style={{ color: 'var(--ink-3)', fontSize: 14 }}>/forever</span>
            </div>
            <p className="text-xs mt-2" style={{ color: 'var(--ink-3)' }}>500 credits / month (~33 contacts)</p>
          </div>

          <div style={{ borderTop: '1px solid var(--line-2)' }} className="my-5" />

          <div className="flex-1 space-y-3">
            <FeatureItem>500 credits / month (~33 contacts)</FeatureItem>
            <FeatureItem>Up to 5 contacts per search</FeatureItem>
            <FeatureItem>AI email drafting</FeatureItem>
            <FeatureItem>Custom email templates</FeatureItem>
            <FeatureItem>Gmail integration + outreach tracking</FeatureItem>
            <FeatureItem>Meeting Prep</FeatureItem>
            <FeatureItem>Smart filters</FeatureItem>
            <DisabledFeatureItem>Find Hiring Managers</DisabledFeatureItem>
            <DisabledFeatureItem>Bulk drafting + Export</DisabledFeatureItem>
            <DisabledFeatureItem>Firm search</DisabledFeatureItem>
            <DisabledFeatureItem>The Agent</DisabledFeatureItem>
          </div>

          <div className="mt-7">
            <button
              onClick={() => {
                if (!user) {
                  navigate('/signin?next=/pricing&plan=free');
                } else if (currentTier === 'free') {
                  handleResetCredits('free');
                } else {
                  handleUpgrade('free', 'pricing_page');
                }
              }}
              className="w-full py-3 px-5 rounded-[3px] font-semibold text-sm transition-all"
              style={{
                background: 'var(--paper)',
                color: 'var(--ink)',
                border: '1px solid var(--line)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--paper-2)';
                e.currentTarget.style.borderColor = 'var(--ink-3)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'var(--paper)';
                e.currentTarget.style.borderColor = 'var(--line)';
              }}
            >
              {!user ? 'Sign up free' : currentTier === 'free' ? 'Current Plan' : 'Start for Free'}
            </button>
          </div>
        </div>

        {/* Pro Plan Card — featured. 2px brand-blue outer ring on a white inner card. */}
        <div
          className="relative rounded-[10px] p-[2px] flex flex-col transition-all duration-300"
          style={{ background: '#3B82F6', boxShadow: '0 4px 14px rgba(59,130,246,0.18)' }}
        >
          <div
            className="rounded-[8px] p-7 flex flex-col h-full"
            style={{ background: 'var(--paper)' }}
          >
            <div className="text-center mb-5">
              <div
                className="inline-flex items-center gap-1.5 px-3 py-1 mb-3 text-[10px] font-bold tracking-wider uppercase rounded-[3px]"
                style={{ background: '#3B82F6', color: '#FFFFFF' }}
              >
                {currentTier === 'pro' ? '✓ Your Plan' : '★ Most Popular'}
              </div>
              <h2 className="font-serif text-[28px] mb-1" style={{ color: '#3B82F6', fontWeight: 400 }}>Pro</h2>
              <p className="text-sm" style={{ color: 'var(--ink-3)' }}>Best for Students</p>
            </div>

            <div className="text-center mb-5">
              {showStudentPrice ? (
                <div className="flex items-baseline justify-center gap-2">
                  <span className="text-base line-through" style={{ color: 'var(--ink-3)' }}>${PRICES.pro.listMonthly}</span>
                  <span className="font-serif text-[44px] leading-none" style={{ color: 'var(--ink)', fontWeight: 400 }}>
                    ${billingCadence === 'annual' ? (PRICES.pro.studentAnnual / 12).toFixed(2) : PRICES.pro.studentMonthly}
                  </span>
                  <span style={{ color: 'var(--ink-3)', fontSize: 14 }}>/mo</span>
                </div>
              ) : (
                <div className="flex items-baseline justify-center gap-2">
                  <span className="font-serif text-[44px] leading-none" style={{ color: 'var(--ink)', fontWeight: 400 }}>${PRICES.pro.listMonthly}</span>
                  <span style={{ color: 'var(--ink-3)', fontSize: 14 }}>/mo</span>
                </div>
              )}
              <p className="text-xs mt-2" style={{ color: 'var(--ink-3)' }}>
                {billingCadence === 'annual' && showStudentPrice
                  ? `Billed yearly at $${PRICES.pro.studentAnnual} · save $30/yr`
                  : '3,000 credits / month (~200 contacts)'}
              </p>
              <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                {showStudentPrice && (
                  <span
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[3px] text-xs font-semibold"
                    style={{ background: 'var(--paper-2)', border: '1px solid #BFDBFE', color: '#1D4ED8' }}
                  >
                    🎓 .edu required
                  </span>
                )}
                <span
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[3px] text-xs font-semibold"
                  style={{ background: 'rgba(22,163,74,0.10)', border: '1px solid rgba(22,163,74,0.25)', color: 'var(--signal-pos)' }}
                >
                  {trialDays}-day free trial · no credit card
                </span>
              </div>
            </div>

            <div style={{ borderTop: '1px solid var(--line-2)' }} className="my-5" />

            <div className="flex-1 space-y-3">
              <FeatureItem highlight>3,000 credits / month (~200 contacts)</FeatureItem>
              <FeatureItem>Up to 30 contacts per search</FeatureItem>
              <FeatureItem><span style={{ fontWeight: 600 }}>Everything in Free, plus:</span></FeatureItem>
              <FeatureItem>Single agent use</FeatureItem>
              <FeatureItem>Find Hiring Managers</FeatureItem>
              <FeatureItem>Firm Search</FeatureItem>
              <FeatureItem>Bulk drafting + Export (CSV & Gmail)</FeatureItem>
              <FeatureItem>Unlimited directory saving</FeatureItem>
              <DisabledFeatureItem>Run multiple agents at once (Elite)</DisabledFeatureItem>
              <DisabledFeatureItem>Priority queue + support</DisabledFeatureItem>
              <FeatureItem highlight>Save ~210 hours/mo on research</FeatureItem>
            </div>

            <div className="mt-7">
              <button
                onClick={
                  isLoading ? undefined :
                  currentTier === 'pro'
                    ? (e: React.MouseEvent) => {
                        if (e.shiftKey) {
                          handleResetCredits('pro');
                        } else {
                          handleManageSubscription();
                        }
                      }
                    : () => handleUpgrade('pro', 'pricing_page')
                }
                disabled={isLoading || currentTier === 'elite'}
                title={currentTier === 'pro' ? 'Click to manage subscription. Hold Shift+Click to reset credits.' : currentTier === 'elite' ? 'You are on Elite plan' : undefined}
                className="w-full py-3 px-5 rounded-[3px] font-semibold text-sm transition-all disabled:opacity-50"
                style={
                  currentTier === 'elite'
                    ? { background: 'var(--line-2)', color: 'var(--ink-3)', cursor: 'not-allowed' }
                    : { background: '#3B82F6', color: '#FFFFFF', border: 'none' }
                }
                onMouseEnter={(e) => {
                  if (currentTier !== 'elite' && !isLoading) {
                    e.currentTarget.style.background = '#2563EB';
                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(59,130,246,0.30)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (currentTier !== 'elite' && !isLoading) {
                    e.currentTarget.style.background = '#3B82F6';
                    e.currentTarget.style.boxShadow = 'none';
                  }
                }}
              >
                {isLoading ? 'Processing...' : currentTier === 'pro' ? 'Manage Subscription' : currentTier === 'elite' ? 'On Elite Plan' : 'Start Free Trial'}
              </button>
            </div>
          </div>
        </div>

        {/* Elite Plan Card */}
        <div
          className="relative rounded-[10px] p-7 flex flex-col h-full transition-all duration-300"
          style={{
            background: 'var(--paper)',
            border: `1px solid ${currentTier === 'elite' ? '#3B82F6' : 'var(--line)'}`,
            boxShadow: 'var(--shadow-sm)',
          }}
          onMouseEnter={(e) => {
            if (currentTier !== 'elite') {
              e.currentTarget.style.borderColor = 'var(--ink-3)';
            }
            e.currentTarget.style.boxShadow = 'var(--shadow-md)';
          }}
          onMouseLeave={(e) => {
            if (currentTier !== 'elite') {
              e.currentTarget.style.borderColor = 'var(--line)';
            }
            e.currentTarget.style.boxShadow = 'var(--shadow-sm)';
          }}
        >
          {currentTier === 'elite' && (
            <div className="absolute -top-3 right-6">
              <span
                className="px-3 py-1 text-[11px] font-semibold rounded-[3px]"
                style={{ background: 'rgba(22,163,74,0.12)', color: 'var(--signal-pos)', border: '1px solid rgba(22,163,74,0.25)' }}
              >
                ACTIVE
              </span>
            </div>
          )}

          <div className="text-center mb-5">
            <h2 className="font-serif text-[28px] mb-1" style={{ color: 'var(--ink)', fontWeight: 400 }}>Elite</h2>
            <p className="text-sm" style={{ color: 'var(--ink-3)' }}>For serious recruiting season</p>
          </div>

          <div className="text-center mb-5">
            {showStudentPrice ? (
              <div className="flex items-baseline justify-center gap-2">
                <span className="text-base line-through" style={{ color: 'var(--ink-3)' }}>${PRICES.elite.listMonthly}</span>
                <span className="font-serif text-[44px] leading-none" style={{ color: 'var(--ink)', fontWeight: 400 }}>
                  ${billingCadence === 'annual' ? (PRICES.elite.studentAnnual / 12).toFixed(2) : PRICES.elite.studentMonthly}
                </span>
                <span style={{ color: 'var(--ink-3)', fontSize: 14 }}>/mo</span>
              </div>
            ) : (
              <div className="flex items-baseline justify-center gap-2">
                <span className="font-serif text-[44px] leading-none" style={{ color: 'var(--ink)', fontWeight: 400 }}>${PRICES.elite.listMonthly}</span>
                <span style={{ color: 'var(--ink-3)', fontSize: 14 }}>/mo</span>
              </div>
            )}
            <p className="text-xs mt-2" style={{ color: 'var(--ink-3)' }}>
              {billingCadence === 'annual' && showStudentPrice
                ? `Billed yearly at $${PRICES.elite.studentAnnual} · save $70/yr`
                : '12,000 credits / month (~800 contacts)'}
            </p>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
              {showStudentPrice && (
                <span
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[3px] text-xs font-semibold"
                  style={{ background: 'var(--paper-2)', border: '1px solid #BFDBFE', color: '#1D4ED8' }}
                >
                  🎓 .edu required
                </span>
              )}
              <span
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[3px] text-xs font-semibold"
                style={{ background: 'rgba(22,163,74,0.10)', border: '1px solid rgba(22,163,74,0.25)', color: 'var(--signal-pos)' }}
              >
                {trialDays}-day free trial · no credit card
              </span>
            </div>
          </div>

          <div style={{ borderTop: '1px solid var(--line-2)' }} className="my-5" />

          <div className="flex-1 space-y-3">
            <FeatureItem highlight>Run up to 5 Agents simultaneously</FeatureItem>
            <FeatureItem highlight>12,000 credits / month (~800 contacts)</FeatureItem>
            <FeatureItem>Up to 30 contacts per search</FeatureItem>
            <FeatureItem><span style={{ fontWeight: 600 }}>Everything in Pro, plus:</span></FeatureItem>
            <FeatureItem>Priority queue for contact generation</FeatureItem>
            <FeatureItem>Personalized templates tailored to your resume</FeatureItem>
            <FeatureItem>Weekly personalized firm insights</FeatureItem>
            <FeatureItem>Early access to new AI tools</FeatureItem>
            <FeatureItem>Priority support</FeatureItem>
            <FeatureItem highlight>Save ~1,120 hours/mo at max usage</FeatureItem>
          </div>

          <div className="mt-7">
            <button
              onClick={
                isLoading ? undefined :
                currentTier === 'elite'
                  ? (e: React.MouseEvent) => {
                      if (e.shiftKey) {
                        handleResetCredits('elite');
                      } else {
                        handleManageSubscription();
                      }
                    }
                  : () => handleUpgrade('elite', 'pricing_page')
              }
              disabled={isLoading}
              title={currentTier === 'elite' ? 'Click to manage subscription. Hold Shift+Click to reset credits.' : undefined}
              className="w-full py-3 px-5 rounded-[3px] font-semibold text-sm transition-all"
              style={
                currentTier === 'elite'
                  ? { background: 'var(--paper)', color: '#3B82F6', border: '1px solid var(--line)' }
                  : { background: 'var(--ink)', color: '#FFFFFF', border: 'none' }
              }
              onMouseEnter={(e) => {
                if (currentTier === 'elite') {
                  e.currentTarget.style.background = 'var(--paper-2)';
                } else {
                  e.currentTarget.style.background = '#1E293B';
                  e.currentTarget.style.boxShadow = 'var(--shadow-md)';
                }
              }}
              onMouseLeave={(e) => {
                if (currentTier === 'elite') {
                  e.currentTarget.style.background = 'var(--paper)';
                } else {
                  e.currentTarget.style.background = 'var(--ink)';
                  e.currentTarget.style.boxShadow = 'none';
                }
              }}
            >
              {isLoading ? 'Processing...' : currentTier === 'elite' ? 'Manage Subscription' : currentTier === 'pro' ? 'Upgrade to Elite' : 'Try Elite Free'}
            </button>
          </div>
        </div>
      </div>

      {/* Subscription Status Banner — sits below the three tiers so the
          tier comparison is the first thing visitors see. */}
      {subscriptionBanner}

      {/* Money-Back Guarantee Banner */}
      <div className="max-w-2xl mx-auto mb-16 animate-fadeInUp" style={{ animationDelay: '300ms' }}>
        <div
          className="rounded-[3px] p-6 text-center"
          style={{ background: 'var(--paper-2)', border: '1px solid var(--line)' }}
        >
          <div
            className="w-11 h-11 rounded-[3px] flex items-center justify-center mx-auto mb-3"
            style={{ background: 'rgba(22,163,74,0.10)' }}
          >
            <Shield className="w-5 h-5" style={{ color: 'var(--signal-pos)' }} />
          </div>
          <h3
            className="font-serif text-[22px] mb-2"
            style={{ color: 'var(--ink)', fontWeight: 400, lineHeight: 1.25 }}
          >
            30 days free with .edu (14 otherwise) · 7-day money-back guarantee
          </h3>
          <p className="text-sm" style={{ color: 'var(--ink-2)', lineHeight: 1.55 }}>
            Students with a .edu email get a full 30-day Pro trial — no credit card.
            Non-student trial is 14 days. After that, not satisfied within 7 days? Full refund, no questions asked.
          </p>
        </div>
      </div>

      {/* Comparison Table */}
      <div className="mb-16 animate-fadeInUp" style={{ animationDelay: '400ms' }}>
        <h2
          className="font-serif text-center mb-7"
          style={{ color: 'var(--ink)', fontSize: 32, fontWeight: 400, letterSpacing: '-0.01em' }}
        >
          Compare all features
        </h2>

        <div
          className="rounded-[3px] overflow-hidden overflow-x-auto"
          style={{ background: 'var(--paper)', border: '1px solid var(--line)' }}
        >
          <table className="w-full min-w-[600px]">
            <thead>
              <tr style={{ background: 'var(--paper-2)', borderBottom: '1px solid var(--line)' }}>
                <th
                  className="text-left py-3.5 px-6 text-[11px] uppercase tracking-wider"
                  style={{ color: 'var(--ink-2)', fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}
                >
                  Feature
                </th>
                <th
                  className="text-center py-3.5 px-6 text-[11px] uppercase tracking-wider"
                  style={{ color: 'var(--ink-2)', fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}
                >
                  Free
                </th>
                <th
                  className="text-center py-3.5 px-6 text-[11px] uppercase tracking-wider"
                  style={{ color: '#3B82F6', fontFamily: "'JetBrains Mono', monospace", fontWeight: 700 }}
                >
                  Pro
                </th>
                <th
                  className="text-center py-3.5 px-6 text-[11px] uppercase tracking-wider"
                  style={{ color: 'var(--ink-2)', fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}
                >
                  Elite
                </th>
              </tr>
            </thead>
            <tbody>
              <ComparisonRow feature="Monthly Credits" free="500" pro="3,000" elite="12,000" />
              <ComparisonRow feature="Contacts per Search" free="5" pro="15" elite="30" />
              <ComparisonRow feature="Concurrent Agents" free=" — " pro="1" elite="Up to 5" />
              <ComparisonRow feature="Find Companies" free="Credit-limited" pro={true} elite={true} />
              <ComparisonRow feature="Find Hiring Managers" free={false} pro={true} elite={true} />
              <ComparisonRow feature="Email Outreach Tracking" free={true} pro={true} elite={true} />
              <ComparisonRow feature="Gmail Integration" free={true} pro={true} elite={true} />
              <ComparisonRow feature="Custom Email Templates" free={true} pro={true} elite={true} />
              <ComparisonRow feature="Export to CSV" free={false} pro={true} elite={true} />
              <ComparisonRow feature="Bulk Drafting" free={false} pro={true} elite={true} />
              <ComparisonRow feature="Firm Search" free={false} pro={true} elite={true} />
              <ComparisonRow feature="Priority Queue + Support" free={false} pro={false} elite={true} />
              <ComparisonRow feature="Time Saved / Month" free="~28 hrs" pro="~210 hrs" elite="~1,120 hrs" />
            </tbody>
          </table>
        </div>
      </div>

      {/* FAQ Section */}
      <div className="max-w-3xl mx-auto mb-16 animate-fadeInUp" style={{ animationDelay: '500ms' }}>
        <h2
          className="font-serif mb-5"
          style={{ color: 'var(--ink)', fontSize: 32, fontWeight: 400, letterSpacing: '-0.01em' }}
        >
          Frequently asked questions
        </h2>

        <div>
          <FAQItem
            question="How does the free trial work?"
            answer="If you sign up with a .edu email, you get 30 days of full Pro access — no credit card required. Without .edu, the trial is 14 days. Either way you can cancel anytime, and at the end of the trial you drop to the Free plan automatically (no surprise charges)."
            isProminent
          />
          <FAQItem
            question="What's the .edu student discount?"
            answer="The student price is the price you see — roughly 50% off the public list rate. As long as you signed up with a verified .edu email, you keep that student price for life, even after you graduate."
            isProminent
          />
          <FAQItem
            question="What happens when I run out of credits?"
            answer="Searches pause until your plan renews (the 1st of the next month) or you upgrade. No waiting, no emails — just upgrade when you're ready. All your saved contacts and drafts stay put."
            isProminent
          />
          <FAQItem
            question="Can I change plans anytime?"
            answer="Yep, anytime. Upgrading? You get access immediately. Downgrading? Takes effect at your next billing cycle. Takes 10 seconds to switch."
            isProminent
          />
          <FAQItem
            question="Monthly vs annual — which should I pick?"
            answer="Annual saves ~17% — that's roughly two months free. If you're committed to recruiting for the year, annual is the better deal. If you're testing it out, start monthly and switch later."
          />
          <FAQItem
            question="Do credits roll over?"
            answer="Nope, they reset on the 1st of each month. Use 'em or lose 'em — but honestly, most students use them up well before the month is over during peak recruiting."
          />
          <FAQItem
            question="What if I don't have a .edu email?"
            answer="You can still sign up and use Offerloop — you'll just get the 14-day trial instead of 30 days and pay the public list price. Already a paid alumni? Reach out and we'll verify your old school manually."
          />
          <FAQItem
            question="How do I cancel?"
            answer="Cancel anytime from your subscription page. You keep access until the end of your billing period — no tricks."
          />
        </div>
      </div>

      {/* Footer Note */}
      <div className="max-w-3xl mx-auto text-sm pb-8 animate-fadeInUp" style={{ animationDelay: '600ms', color: 'var(--ink-3)' }}>
        <p>
          Still unsure?{' '}
          <button
            onClick={() => window.open('mailto:support@offerloop.ai', '_blank')}
            className="font-medium hover:underline"
            style={{ color: '#3B82F6', background: 'transparent', border: 'none', padding: 0, cursor: 'pointer' }}
          >
            Talk to us
          </button>
        </p>
      </div>

    </div>
  );

  const helmet = (
    <Helmet>
      <title>Offerloop Pricing - Student Plans for College Networking</title>
      <meta name="description" content="Students save ~50% with a .edu email. Pro $14.99/mo, Elite $34.99/mo, plus annual plans. Offerloop helps college students network into consulting, investment banking, and tech." />
      <link rel="canonical" href="https://offerloop.ai/pricing" />
    </Helmet>
  );

  // ============================================================
  // Signed-in render: wrap in the same app shell every other page
  // uses (sidebar + header + white rounded MainContentWrapper).
  // ============================================================
  if (user) {
    return (
      <SidebarProvider>
        {helmet}
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <AppHeader />
          <MainContentWrapper>
            <div className="flex-1 overflow-y-auto">
              {/* In-app back-to-Home button — dark-blue pill, white text */}
              <div className="px-3 sm:px-8 pt-6">
                <button
                  onClick={() => navigate("/dashboard")}
                  className="inline-flex items-center gap-2 text-sm transition-all group rounded-[10px]"
                  style={{
                    background: '#1B2A44',
                    color: '#FFFFFF',
                    border: '1px solid #1B2A44',
                    padding: '8px 16px',
                    fontWeight: 500,
                    cursor: 'pointer',
                    boxShadow: '0 1px 2px rgba(15,23,42,0.08)',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = '#243656';
                    e.currentTarget.style.borderColor = '#243656';
                    e.currentTarget.style.boxShadow = '0 2px 6px rgba(15,23,42,0.12)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = '#1B2A44';
                    e.currentTarget.style.borderColor = '#1B2A44';
                    e.currentTarget.style.boxShadow = '0 1px 2px rgba(15,23,42,0.08)';
                  }}
                >
                  <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                  <span>Home</span>
                </button>
              </div>
              {pricingBody}
            </div>
          </MainContentWrapper>
        </div>
      </SidebarProvider>
    );
  }

  // ============================================================
  // Signed-out render: marketing chrome (pill nav) on top of a
  // faint blue page background.
  // ============================================================
  return (
    <div style={{ background: 'var(--paper-2)', minHeight: '100vh' }}>
      {helmet}

      <div className="fixed top-0 left-0 right-0 z-50 flex justify-center" style={{ padding: '12px 24px 8px' }}>
        <header
          className="flex items-center justify-between w-full h-12 px-5 md:px-6"
          style={{
            maxWidth: '860px',
            width: '100%',
            boxSizing: 'border-box',
            marginBottom: '4px',
            background: navbarScrolled ? 'rgba(255,255,255,0.96)' : 'rgba(255,255,255,0.88)',
            backdropFilter: 'blur(16px) saturate(1.4)',
            WebkitBackdropFilter: 'blur(16px) saturate(1.4)',
            border: '1px solid var(--line)',
            borderRadius: '100px',
            boxShadow: navbarScrolled
              ? '0 2px 16px rgba(15,23,42,0.06)'
              : '0 1px 8px rgba(15,23,42,0.04)',
            transition: 'all 0.3s ease',
            overflow: 'visible',
          }}
        >
          <div className="flex items-center">
            <img
              src={OfferloopLogo}
              alt="Offerloop"
              className="h-16 cursor-pointer logo-animate"
              onClick={() => navigate('/')}
            />
          </div>

          <nav className="hidden md:flex items-center gap-6" style={{ flexShrink: 1, minWidth: 0 }}>
            <Link
              to="/for-students"
              className="nav-link text-sm relative font-serif"
              style={{ color: 'var(--ink-2)', fontWeight: 600, textDecoration: 'none' }}
            >
              For Students
            </Link>
            <Link
              to="/pricing"
              className="nav-link text-sm relative font-serif"
              style={{ color: '#3B82F6', fontWeight: 600, textDecoration: 'none' }}
            >
              Pricing
            </Link>
            <Link
              to="/about"
              className="nav-link text-sm relative font-serif"
              style={{ color: 'var(--ink-2)', fontWeight: 600, textDecoration: 'none' }}
            >
              About
            </Link>
          </nav>

          <div className="hidden md:flex items-center gap-2" style={{ flexShrink: 0 }}>
            <button
              onClick={() => navigate('/signin?mode=signin')}
              style={{
                background: 'transparent',
                color: 'var(--ink)',
                fontSize: '13px',
                fontWeight: 600,
                padding: '8px 18px',
                borderRadius: '100px',
                border: '1px solid var(--line)',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--paper-2)';
                e.currentTarget.style.borderColor = 'var(--ink-3)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.borderColor = 'var(--line)';
              }}
            >
              Sign in
            </button>
            <button
              onClick={() => navigate('/signin?mode=signup')}
              style={{
                background: 'var(--ink)',
                color: '#FFFFFF',
                fontSize: '13px',
                fontWeight: 600,
                padding: '8px 18px',
                borderRadius: '100px',
                border: 'none',
                cursor: 'pointer',
                transition: 'background 0.15s ease',
                whiteSpace: 'nowrap',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#1E293B'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--ink)'; }}
            >
              Create account
            </button>
          </div>

          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2"
            style={{ color: 'var(--ink-2)', background: 'transparent', border: 'none' }}
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </header>
      </div>

      {mobileMenuOpen && (
        <div
          className="fixed top-[72px] left-4 right-4 md:hidden z-40"
          style={{
            background: 'rgba(255,255,255,0.98)',
            border: '1px solid var(--line)',
            borderRadius: '14px',
            boxShadow: '0 4px 24px rgba(15,23,42,0.08)',
            backdropFilter: 'blur(16px)',
          }}
        >
          <nav className="flex flex-col p-3 gap-1">
            <Link
              to="/for-students"
              onClick={() => setMobileMenuOpen(false)}
              className="text-left px-4 py-3 text-sm font-medium rounded-[3px] font-serif"
              style={{ color: 'var(--ink-2)', textDecoration: 'none' }}
            >
              For Students
            </Link>
            <Link
              to="/pricing"
              onClick={() => setMobileMenuOpen(false)}
              className="text-left px-4 py-3 text-sm font-medium rounded-[3px] font-serif"
              style={{ color: '#3B82F6', textDecoration: 'none' }}
            >
              Pricing
            </Link>
            <Link
              to="/about"
              onClick={() => setMobileMenuOpen(false)}
              className="text-left px-4 py-3 text-sm font-medium rounded-[3px] font-serif"
              style={{ color: 'var(--ink-2)', textDecoration: 'none' }}
            >
              About
            </Link>
            <div className="border-t mt-2 pt-2" style={{ borderColor: 'var(--line-2)' }}>
              <button
                onClick={() => { navigate('/signin?mode=signup'); setMobileMenuOpen(false); }}
                className="w-full text-center py-3 text-sm font-semibold rounded-[3px]"
                style={{ background: 'var(--ink)', color: '#FFFFFF', border: 'none' }}
              >
                Create account
              </button>
            </div>
          </nav>
        </div>
      )}

      <div className="h-20" />

      {pricingBody}
    </div>
  );
};

export default Pricing;
