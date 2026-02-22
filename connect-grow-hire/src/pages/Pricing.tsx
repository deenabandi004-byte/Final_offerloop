import { useState, useEffect } from "react";
import { Check, ArrowLeft, Settings, Shield, ChevronDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { useFirebaseAuth } from "../contexts/FirebaseAuthContext";
import { loadStripe } from "@stripe/stripe-js";
import { getAuth } from 'firebase/auth';
import { trackUpgradeClick } from "../lib/analytics";

const STRIPE_PUBLISHABLE_KEY = "pk_live_51S4BB8ERY2WrVHp1acXrKE6RBG7NBlfHcMZ2kf7XhCX2E5g8Lasedx6ntcaD1H4BsoUMBGYXIcKHcAB4JuohLa2B00j7jtmWnB";
const stripePromise = loadStripe(STRIPE_PUBLISHABLE_KEY);

// Price IDs - Stripe price IDs for Pro and Elite tiers
const STRIPE_PRO_PRICE_ID = "price_1ScLXrERY2WrVHp1bYgdMAu4"; // Pro tier: $9.99/month
const STRIPE_ELITE_PRICE_ID = "price_1ScLcfERY2WrVHp1c5rcONJ3"; // Elite tier: $34.99/month

interface SubscriptionStatus {
  tier: string;
  status: string;
  hasSubscription: boolean;
  currentPeriodEnd?: number;
  cancelAtPeriodEnd?: boolean;
}

// Feature Item Component
interface FeatureItemProps {
  children: React.ReactNode;
  highlight?: boolean;
  muted?: boolean;
}

const FeatureItem: React.FC<FeatureItemProps> = ({ children, highlight, muted }) => (
  <div className="flex items-start gap-3">
    <div className={`
      w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5
      ${highlight ? 'bg-cyan-100' : muted ? 'bg-gray-100' : 'bg-blue-50'}
    `}>
      <Check className={`
        w-3 h-3
        ${highlight ? 'text-cyan-600' : muted ? 'text-gray-400' : 'text-blue-500'}
      `} />
    </div>
    <span className={`
      text-sm
      ${highlight ? 'font-semibold text-gray-900' : muted ? 'text-gray-400' : 'text-gray-600'}
    `}>
      {children}
    </span>
  </div>
);

// FAQ Item Component
interface FAQItemProps {
  question: string;
  answer: string;
  isProminent?: boolean;
}

const FAQItem: React.FC<FAQItemProps> = ({ question, answer, isProminent = false }) => {
  const [isOpen, setIsOpen] = useState(false);
  
  return (
    <div className="border-b border-gray-100 last:border-b-0">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between py-4 text-left hover:bg-gray-50/50 transition-colors"
      >
        <span className={`${isProminent ? 'font-semibold text-gray-900' : 'font-medium text-gray-700'}`}>{question}</span>
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform duration-200 flex-shrink-0 ml-4 ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      
      {isOpen && (
        <div className={`pb-4 text-gray-600 leading-relaxed ${isProminent ? 'text-base' : 'text-sm'}`}>
          {answer}
        </div>
      )}
    </div>
  );
};

// Comparison Row Component
interface ComparisonRowProps {
  feature: string;
  free: boolean | string;
  pro: boolean | string;
  elite: boolean | string;
}

const ComparisonRow: React.FC<ComparisonRowProps> = ({ feature, free, pro, elite }) => (
  <tr className="hover:bg-gray-50">
    <td className="py-4 px-6 text-gray-700">{feature}</td>
    <td className="text-center py-4 px-6">
      {typeof free === 'boolean' ? (
        free ? <Check className="w-5 h-5 text-green-500 mx-auto" /> : <X className="w-5 h-5 text-gray-300 mx-auto" />
      ) : (
        <span className="text-gray-600">{free}</span>
      )}
    </td>
    <td className="text-center py-4 px-6 bg-blue-50/30">
      {typeof pro === 'boolean' ? (
        pro ? <Check className="w-5 h-5 text-cyan-500 mx-auto" /> : <X className="w-5 h-5 text-gray-300 mx-auto" />
      ) : (
        <span className="font-medium text-gray-900">{pro}</span>
      )}
    </td>
    <td className="text-center py-4 px-6">
      {typeof elite === 'boolean' ? (
        elite ? <Check className="w-5 h-5 text-green-500 mx-auto" /> : <X className="w-5 h-5 text-gray-300 mx-auto" />
      ) : (
        <span className="text-gray-600">{elite}</span>
      )}
    </td>
  </tr>
);

const Pricing = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [subscriptionStatus, setSubscriptionStatus] = useState<SubscriptionStatus | null>(null);
  const navigate = useNavigate();
  const { user, updateUser, checkCredits } = useFirebaseAuth();

  useEffect(() => {
    if (user) {
      fetchSubscriptionStatus();
    }
  }, [user]);

  const fetchSubscriptionStatus = async () => {
    try {
      const auth = getAuth();
      const firebaseUser = auth.currentUser;
      
      if (!firebaseUser) return;

      const token = await firebaseUser.getIdToken();
      
      const API_URL = window.location.hostname === 'localhost' 
        ? 'http://localhost:5001' 
        : 'https://www.offerloop.ai';

      const response = await fetch(`${API_URL}/api/subscription-status`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
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
      
      const API_URL = window.location.hostname === 'localhost' 
        ? 'http://localhost:5001' 
        : 'https://www.offerloop.ai';

      const response = await fetch(`${API_URL}/api/create-portal-session`, {
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
      
      // Show more helpful error message
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
    
    // Credit amounts based on tier
    const creditMap = {
      'free': 300,
      'pro': 1500,
      'elite': 3000
    };
    
    const maxCredits = creditMap[tier];
    
    try {
      console.log(`🔄 Resetting credits for ${tier} tier to ${maxCredits}`);
      await updateUser({ 
        credits: maxCredits,
        maxCredits: maxCredits
      });
      
      // Refresh credits to update UI
      if (checkCredits) {
        await checkCredits();
      }
      
      // No popup - just silently reset credits
    } catch (error) {
      console.error("Error resetting credits:", error);
      // Silently fail - don't show popup
    }
  };

  const handleUpgrade = async (planType: 'free' | 'pro' | 'elite', fromFeature?: string) => {
    if (!user) return;
  
    try {
      if (planType === 'free') {
        await updateUser({ 
          tier: 'free',
          credits: 300,
          maxCredits: 300
        }); 
        navigate("/contact-search");
      } 
      else if (planType === 'pro' || planType === 'elite') {
        // Track PostHog event
        trackUpgradeClick(fromFeature || 'pricing', {
          from_location: 'pricing_page',
          plan_selected: planType,
        });
        await handleStripeCheckout(planType);
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
      
      const API_URL = window.location.hostname === 'localhost' 
       ? 'http://localhost:5001' 
       : 'https://www.offerloop.ai';

      // Select price ID based on tier
      const priceId = tier === 'elite' ? STRIPE_ELITE_PRICE_ID : STRIPE_PRO_PRICE_ID;

      const response = await fetch(`${API_URL}/api/create-checkout-session`, {
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
      console.log('Checkout session response:', responseData);
      
      const sessionId = responseData.sessionId;
      if (!sessionId) {
        console.error('No sessionId in response:', responseData);
        throw new Error('Invalid response from server: missing sessionId');
      }

      const stripe = await stripePromise;
      if (!stripe) {
        throw new Error('Stripe failed to initialize');
      }

      const { error } = await stripe.redirectToCheckout({
        sessionId: sessionId,
      });

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

  const isProUser = subscriptionStatus?.tier === 'pro' && subscriptionStatus?.status === 'active';
  const isEliteUser = subscriptionStatus?.tier === 'elite' && subscriptionStatus?.status === 'active';
  const hasActiveSubscription = isProUser || isEliteUser;
  const currentTier = subscriptionStatus?.tier || 'free';

  // Format renewal date
  const renewalDate = subscriptionStatus?.currentPeriodEnd 
    ? new Date(subscriptionStatus.currentPeriodEnd * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null;

  return (
    <div style={{ background: '#F8FAFF', minHeight: '100vh' }}>
      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '48px 24px' }}>
        
        {/* Back Navigation */}
        <div className="mb-8 animate-fadeInUp">
          <button
            onClick={() => navigate("/contact-search")}
            className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors group"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
            <span className="font-medium">Find people</span>
          </button>
        </div>

        {/* Subscription Status Banner */}
        {hasActiveSubscription && (
          <div className="mb-10 bg-gradient-to-r from-blue-600 to-cyan-500 rounded-2xl p-[2px] animate-fadeInUp" style={{ animationDelay: '50ms' }}>
            <div className="bg-white rounded-xl px-6 py-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-gray-900">{isEliteUser ? 'Elite' : 'Pro'} Subscription Active</h3>
                    <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs font-medium rounded-full">Active</span>
                  </div>
                  <p className="text-sm text-gray-500">
                    {user?.credits ?? 0} credits remaining
                    {renewalDate && !subscriptionStatus?.cancelAtPeriodEnd && ` • Renews ${renewalDate}`}
                    {subscriptionStatus?.cancelAtPeriodEnd && renewalDate && ` • Cancels ${renewalDate}`}
                  </p>
                </div>
              </div>
              
              <button 
                onClick={handleManageSubscription}
                disabled={isLoading}
                className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-blue-600 to-cyan-500 text-white font-medium rounded-xl hover:shadow-lg hover:shadow-blue-500/30 transition-all disabled:opacity-50"
              >
                <Settings className="w-4 h-4" />
                Manage Subscription
              </button>
            </div>
          </div>
        )}

        {/* Header Section */}
        <div style={{ textAlign: 'center', marginBottom: '48px' }}>
          <h1
            style={{
              fontFamily: "'Instrument Serif', Georgia, serif",
              fontSize: '42px',
              fontWeight: 400,
              letterSpacing: '-0.025em',
              color: '#0F172A',
              textAlign: 'center',
              marginBottom: '10px',
              lineHeight: 1.1,
            }}
          >
            Pricing
          </h1>
          <p
            style={{
              fontFamily: "'DM Sans', system-ui, sans-serif",
              fontSize: '16px',
              color: '#64748B',
              textAlign: 'center',
              marginBottom: '28px',
              lineHeight: 1.5,
            }}
          >
            Choose the plan that works best for you.
          </p>
        </div>

        {/* Pricing Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8 max-w-5xl mx-auto mb-16 animate-fadeInUp" style={{ animationDelay: '200ms' }}>
          
          {/* Free Plan Card */}
          <div className="bg-white rounded-2xl border border-gray-200 p-8 flex flex-col h-full hover:border-gray-300 hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
            {/* Plan Header */}
            <div className="text-center mb-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Free</h2>
              <p className="text-gray-500">Try it out for free</p>
            </div>
            
            {/* Price */}
            <div className="text-center mb-6">
              <div className="flex items-baseline justify-center gap-1">
                <span className="text-4xl font-bold text-gray-900">$0</span>
                <span className="text-gray-500">/month</span>
              </div>
              <p className="text-sm text-gray-500 mt-2">300 credits (~20 contacts)</p>
            </div>
            
            {/* Divider */}
            <div className="border-t border-gray-100 my-6"></div>
            
            {/* Features */}
            <div className="flex-1 space-y-4">
              <FeatureItem>300 credits (~20 contacts)</FeatureItem>
              <FeatureItem>Basic contact search + AI email drafts</FeatureItem>
              <FeatureItem>Gmail integration</FeatureItem>
              <FeatureItem>Directory saves all contacts</FeatureItem>
              <FeatureItem>3 Coffee Chat Preps + 2 Interview Preps</FeatureItem>
              <FeatureItem muted>Exports disabled</FeatureItem>
            </div>
            
            {/* CTA Button */}
            <div className="mt-8">
              <button 
                onClick={() => currentTier === 'free' ? handleResetCredits('free') : handleUpgrade('free', 'pricing_page')}
                className="w-full py-3.5 px-6 rounded-xl font-semibold border-2 border-gray-200 text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-all"
              >
                {currentTier === 'free' ? 'Current Plan' : 'Start for Free'}
              </button>
            </div>
          </div>

          {/* Pro Plan Card (Featured) */}
          <div className="relative bg-gradient-to-b from-cyan-500 to-blue-600 rounded-2xl p-[2px] flex flex-col hover:shadow-xl hover:shadow-blue-500/20 transition-all duration-300 md:scale-105 z-10 hover:-translate-y-1">
            {/* Most Popular Badge */}
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-20">
              <span
                style={{
                  padding: '6px 16px',
                  background: currentTier === 'pro' ? '#10B981' : '#0F172A',
                  color: 'white',
                  fontFamily: "'DM Sans', system-ui, sans-serif",
                  fontSize: '12px',
                  fontWeight: 600,
                  letterSpacing: '0.05em',
                  borderRadius: '8px',
                  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
                  textTransform: 'uppercase',
                }}
              >
                {currentTier === 'pro' ? 'Active' : 'Most Popular'}
              </span>
            </div>
            
            {/* Card Content */}
            <div className="bg-white rounded-2xl p-8 flex flex-col h-full">
              {/* Plan Header */}
              <div className="text-center mb-6 pt-2">
                <h2 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-500 to-blue-600 mb-2">Pro</h2>
                <p className="text-gray-500">Best for Students</p>
              </div>
              
              {/* Price */}
              <div className="text-center mb-6">
                <div className="flex items-baseline justify-center gap-2">
                  <span className="text-lg text-gray-400 line-through">$19.99</span>
                  <span className="text-4xl font-bold text-gray-900">$14.99</span>
                  <span className="text-gray-500">/month</span>
                </div>
                <p className="text-sm text-gray-500 mt-2">1,500 credits (~100 contacts)</p>
              </div>
              
              {/* Divider */}
              <div className="border-t border-gray-100 my-6"></div>
              
              {/* Features */}
              <div className="flex-1 space-y-4">
                <FeatureItem highlight>1,500 credits (~100 contacts)</FeatureItem>
                <FeatureItem><span className="font-semibold">Everything in Free, plus:</span></FeatureItem>
                <FeatureItem>Full Firm Search</FeatureItem>
                <FeatureItem>Smart school/major/career filters</FeatureItem>
                <FeatureItem>10 Coffee Chat Preps/month</FeatureItem>
                <FeatureItem>5 Interview Preps/month</FeatureItem>
                <FeatureItem>Unlimited directory saving</FeatureItem>
                <FeatureItem>Bulk drafting + Export unlocked (CSV & Gmail)</FeatureItem>
                <FeatureItem highlight>Estimated time saved: ~2,500 min/mo</FeatureItem>
              </div>
              
              {/* CTA Button */}
              <div className="mt-8">
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
                  className={`
                    w-full py-3.5 px-6 rounded-xl font-semibold transition-all
                    ${currentTier === 'elite' 
                      ? 'bg-gray-100 text-gray-500 cursor-not-allowed' 
                      : currentTier === 'pro'
                        ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white'
                        : 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white hover:shadow-lg hover:shadow-blue-500/30 hover:scale-[1.02] active:scale-100'
                    }
                    disabled:opacity-50
                  `}
                >
                  {isLoading ? 'Processing...' : currentTier === 'pro' ? 'Manage Subscription' : currentTier === 'elite' ? 'On Elite Plan' : 'Upgrade to Pro'}
                </button>
              </div>
            </div>
          </div>

          {/* Elite Plan Card */}
          <div className={`relative bg-white rounded-2xl border p-8 flex flex-col h-full hover:shadow-lg transition-all duration-300 hover:-translate-y-1 ${currentTier === 'elite' ? 'border-purple-300' : 'border-gray-200 hover:border-gray-300'}`}>
            {/* Active Badge if current plan */}
            {currentTier === 'elite' && (
              <div className="absolute -top-3 right-6">
                <span className="px-3 py-1 bg-green-100 text-green-700 text-xs font-semibold rounded-full border border-green-200">
                  ACTIVE
                </span>
              </div>
            )}
            
            {/* Plan Header */}
            <div className="text-center mb-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Elite</h2>
              <p className="text-gray-500">For serious recruiting season</p>
            </div>
            
            {/* Price */}
            <div className="text-center mb-6">
              <div className="flex items-baseline justify-center gap-1">
                <span className="text-4xl font-bold text-gray-900">$34.99</span>
                <span className="text-gray-500">/month</span>
              </div>
              <p className="text-sm text-gray-500 mt-2">3,000 credits (~200 contacts)</p>
            </div>
            
            {/* Divider */}
            <div className="border-t border-gray-100 my-6"></div>
            
            {/* Features */}
            <div className="flex-1 space-y-4">
              <FeatureItem highlight>3,000 credits (~200 contacts)</FeatureItem>
              <FeatureItem><span className="font-semibold">Everything in Pro, plus:</span></FeatureItem>
              <FeatureItem>Unlimited Coffee Chat Prep</FeatureItem>
              <FeatureItem>Unlimited Interview Prep</FeatureItem>
              <FeatureItem>Priority queue for contact generation</FeatureItem>
              <FeatureItem>Personalized outreach templates (tailored to resume)</FeatureItem>
              <FeatureItem>Weekly personalized firm insights</FeatureItem>
              <FeatureItem>Early access to new AI tools</FeatureItem>
              <FeatureItem highlight>Estimated time saved: ~5,000 min/mo</FeatureItem>
            </div>
            
            {/* CTA Button */}
            <div className="mt-8">
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
                className={`
                  w-full py-3.5 px-6 rounded-xl font-semibold transition-all
                  ${currentTier === 'elite' 
                    ? 'border-2 border-blue-200 text-blue-600 hover:bg-blue-50' 
                    : 'bg-gray-900 text-white hover:bg-gray-800 hover:shadow-lg'
                  }
                `}
              >
                {isLoading ? 'Processing...' : currentTier === 'elite' ? 'Manage Subscription' : 'Go Elite'}
              </button>
            </div>
          </div>
        </div>

        {/* Money-Back Guarantee Banner */}
        <div className="max-w-2xl mx-auto mb-16 animate-fadeInUp" style={{ animationDelay: '300ms' }}>
          <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-2xl p-6 border border-green-200 text-center">
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <Shield className="w-6 h-6 text-green-600" />
            </div>
            <h3 className="font-semibold text-gray-900 mb-1">7-Day Money Back Guarantee</h3>
            <p className="text-sm text-gray-600">
              Not satisfied? Get a full refund within 7 days of your purchase. No questions asked.
            </p>
          </div>
        </div>

        {/* Comparison Table */}
        <div className="mb-16 animate-fadeInUp" style={{ animationDelay: '400ms' }}>
          <h2 className="text-2xl font-bold text-gray-900 text-center mb-8">Compare all features</h2>
          
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden overflow-x-auto">
            <table className="w-full min-w-[600px]">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left py-4 px-6 font-semibold text-gray-900">Feature</th>
                  <th className="text-center py-4 px-6 font-semibold text-gray-900">Free</th>
                  <th className="text-center py-4 px-6 font-semibold text-transparent bg-clip-text bg-gradient-to-r from-cyan-500 to-blue-600">Pro</th>
                  <th className="text-center py-4 px-6 font-semibold text-gray-900">Elite</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                <ComparisonRow feature="Monthly Credits" free="300" pro="1,500" elite="3,000" />
                <ComparisonRow feature="Contact Search" free="Basic" pro="Full" elite="Full + Priority" />
                <ComparisonRow feature="Firm Search" free={false} pro={true} elite={true} />
                <ComparisonRow feature="Coffee Chat Prep" free="3/month" pro="10/month" elite="Unlimited" />
                <ComparisonRow feature="Interview Prep" free="2/month" pro="5/month" elite="Unlimited" />
                <ComparisonRow feature="Export to CSV" free={false} pro={true} elite={true} />
                <ComparisonRow feature="Gmail Integration" free={true} pro={true} elite={true} />
                <ComparisonRow feature="Bulk Drafting" free={false} pro={true} elite={true} />
                <ComparisonRow feature="Personalized Templates" free={false} pro={false} elite={true} />
                <ComparisonRow feature="Priority Support" free={false} pro={false} elite={true} />
              </tbody>
            </table>
          </div>
        </div>

        {/* FAQ Section */}
        <div className="max-w-3xl mb-16 animate-fadeInUp" style={{ animationDelay: '500ms' }}>
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Frequently Asked Questions</h2>
          
          <div>
            <FAQItem 
              question="What happens when I run out of credits?"
              answer="You'll hit a pause on new searches until your plan renews or you upgrade. No waiting, no emails—just upgrade when you're ready. All your saved contacts and drafts stay put."
              isProminent={true}
            />
            <FAQItem 
              question="Can I change plans anytime?"
              answer="Yep, anytime. Upgrading? You get access immediately. Downgrading? Takes effect at your next billing cycle. Takes 10 seconds to switch."
              isProminent={true}
            />
            <FAQItem 
              question="Do credits roll over?"
              answer="Nope, they reset each month. Use 'em or lose 'em—but honestly, most people use them up pretty quick."
            />
            <FAQItem 
              question="Student discount?"
              answer="Pro is already priced for students at $14.99/month. Just use your .edu email when you sign up."
            />
            <FAQItem 
              question="How do I cancel?"
              answer="Cancel anytime from your subscription page. You keep access until the end of your billing period—no tricks."
            />
          </div>
        </div>

        {/* Footer Note */}
        <div className="max-w-3xl text-sm text-gray-500 pb-8 animate-fadeInUp" style={{ animationDelay: '600ms' }}>
          <p>Still unsure? <button onClick={() => window.open('mailto:support@offerloop.ai', '_blank')} className="text-blue-600 hover:underline font-medium">Talk to us</button></p>
        </div>
        
      </div>
    </div>
  );
};

export default Pricing;
