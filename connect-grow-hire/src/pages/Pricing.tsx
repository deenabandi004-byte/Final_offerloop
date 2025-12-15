import { useState, useEffect } from "react";
import { Check, ArrowLeft, CreditCard, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { useFirebaseAuth } from "../contexts/FirebaseAuthContext";
import { loadStripe } from "@stripe/stripe-js";
import { getAuth } from 'firebase/auth';
import { PageWrapper } from "@/components/PageWrapper";
import { GlassCard } from "@/components/GlassCard";

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

  const handleUpgrade = async (planType: 'free' | 'pro' | 'elite') => {
    if (!user) return;
  
    try {
      if (planType === 'free') {
        await updateUser({ 
          tier: 'free',
          credits: 300,
          maxCredits: 300
        }); 
        navigate("/home");
      } 
      else if (planType === 'pro' || planType === 'elite') {
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

  const isProUser = (subscriptionStatus?.tier === 'pro' || subscriptionStatus?.tier === 'elite') && subscriptionStatus?.status === 'active';
  const currentTier = subscriptionStatus?.tier || 'free';

  return (
    <PageWrapper>
      <div className="container mx-auto px-6 py-6 max-w-7xl">
        <Button
          variant="ghost"
          onClick={() => navigate("/home")}
          className="mb-8 text-gray-300 text-slate-700 hover:text-blue-400"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Home
        </Button>

        {isProUser && (
          <GlassCard className="mb-8 p-4 rounded-xl flex items-center justify-between border-blue-500/30">
            <div>
              <p className="font-semibold text-blue-400">Pro Subscription Active</p>
              {subscriptionStatus?.cancelAtPeriodEnd && (
                <p className="text-sm text-gray-400 text-slate-600">
                  Cancels on {new Date(subscriptionStatus.currentPeriodEnd! * 1000).toLocaleDateString()}
                </p>
              )}
            </div>
            <Button
              onClick={handleManageSubscription}
              disabled={isLoading}
              className="btn-primary-glass"
            >
              <Settings className="mr-2 h-4 w-4" />
              Manage Subscription
            </Button>
          </GlassCard>
        )}

        <div className="text-center mb-16">
          <div className="flex items-center justify-center gap-2 mb-6">
            <div className="flex items-center gap-2 bg-blue-500/20 px-3 py-1 rounded-full border border-blue-500/30">
              <CreditCard className="h-4 w-4 text-blue-400" />
              <span className="text-sm font-medium text-blue-400 uppercase tracking-wide">Our Pricing</span>
            </div>
          </div>
          <h1 className="text-display-lg mb-6 text-white text-slate-900">
            <span className="text-black">Choose</span> <span className="gradient-text-teal">your plan</span> <span className="text-black">today</span>
          </h1>
          <p className="text-gray-400 text-slate-600 text-lg mb-8">
            15 credits per contact. When you run out of credits, no more contacts.
          </p>
        </div>

        <div className="flex justify-center">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-10 max-w-7xl w-full">
            {/* Free Plan */}
            <GlassCard className="rounded-2xl p-10 transform transition-all hover:scale-[1.02] hover:glow-teal">
              <div className="text-center mb-8">
                <h3 className="text-3xl font-bold mb-3 text-white text-slate-900">Free</h3>
                <p className="text-gray-400 text-slate-600">Try it out for free</p>
              </div>

              <div className="space-y-4 mb-8">
                <div className="flex items-center gap-3">
                  <Check className="h-5 w-5 text-blue-400 flex-shrink-0" />
                  <span className="text-gray-300 text-slate-700">300 credits (~20 contacts)</span>
                </div>
                <div className="flex items-center gap-3">
                  <Check className="h-5 w-5 text-blue-400 flex-shrink-0" />
                  <span className="text-gray-300 text-slate-700">Basic contact search + AI email drafts</span>
                </div>
                <div className="flex items-center gap-3">
                  <Check className="h-5 w-5 text-blue-400 flex-shrink-0" />
                  <span className="text-gray-300 text-slate-700">Gmail integration</span>
                </div>
                <div className="flex items-center gap-3">
                  <Check className="h-5 w-5 text-blue-400 flex-shrink-0" />
                  <span className="text-gray-300 text-slate-700">Directory saves all contacts</span>
                </div>
                <div className="flex items-center gap-3">
                  <Check className="h-5 w-5 text-blue-400 flex-shrink-0" />
                  <span className="text-gray-300 text-slate-700">3 Coffee Chat Preps + 2 Interview Preps</span>
                </div>
                <div className="flex items-center gap-3">
                  <Check className="h-5 w-5 text-blue-400 flex-shrink-0" />
                  <span className="text-gray-300 text-slate-700">Exports disabled</span>
                </div>
              </div>

                <Button 
                  className="btn-secondary-glass w-full py-4 px-6 font-semibold"
                  onClick={() => currentTier === 'free' ? handleResetCredits('free') : handleUpgrade('free')}
                >
                  {currentTier === 'free' ? 'Current Plan' : 'Start for Free'}
                </Button>
            </GlassCard>

            {/* Pro Plan - Emphasized */}
            <div className="p-[3px] rounded-2xl bg-gradient-to-r from-blue-400 via-blue-600 to-cyan-400 shadow-[0_0_40px_rgba(59,130,246,0.5)] scale-105 z-10 transform transition-all hover:scale-[1.07]">
              <GlassCard className="relative rounded-xl h-full p-10">
                <div className="absolute top-4 right-4">
                  <span className="px-3 py-1 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30 text-xs font-medium">
                    {isProUser ? 'ACTIVE' : 'MOST POPULAR'}
                  </span>
                </div>
                
                <div className="text-center mb-8">
                  <h3 className="text-3xl font-bold mb-3 gradient-text-teal">Pro</h3>
                  <p className="text-gray-400 text-slate-600 mb-3">Best for Students</p>
                  <div className="mb-2">
                    <span className="text-gray-400 text-slate-600 text-lg line-through mr-2">$19.99</span>
                    <span className="text-4xl font-bold text-white text-slate-900">$14.99</span>
                    <span className="text-gray-600 text-lg ml-1">/month</span>
                  </div>
                  <p className="text-gray-500">1,500 credits (~100 contacts)</p>
                </div>

                <div className="space-y-4 mb-8">
                  <div className="flex items-center gap-3">
                    <Check className="h-5 w-5 text-blue-400 flex-shrink-0" />
                    <span className="text-gray-300 text-slate-700">1,500 credits (~100 contacts)</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Check className="h-5 w-5 text-blue-400 flex-shrink-0" />
                    <span className="text-gray-300 text-slate-700 font-bold">Everything in Free, plus:</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Check className="h-5 w-5 text-blue-400 flex-shrink-0" />
                    <span className="text-gray-300 text-slate-700">Full Firm Search</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Check className="h-5 w-5 text-blue-400 flex-shrink-0" />
                    <span className="text-gray-300 text-slate-700">Smart school/major/career filters</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Check className="h-5 w-5 text-blue-400 flex-shrink-0" />
                    <span className="text-gray-300 text-slate-700">10 Coffee Chat Preps/month</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Check className="h-5 w-5 text-blue-400 flex-shrink-0" />
                    <span className="text-gray-300 text-slate-700">5 Interview Preps/month</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Check className="h-5 w-5 text-blue-400 flex-shrink-0" />
                    <span className="text-gray-300 text-slate-700">Unlimited directory saving</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Check className="h-5 w-5 text-blue-400 flex-shrink-0" />
                    <span className="text-gray-300 text-slate-700">Bulk drafting + Export unlocked (CSV & Gmail)</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Check className="h-5 w-5 text-blue-400 flex-shrink-0" />
                    <span className="text-gray-300 text-slate-700">Estimated time saved: ~2,500 minutes/month</span>
                  </div>
                </div>

                <Button 
                  className="btn-primary-glass w-full py-6 px-6 text-lg font-semibold"
                  onClick={
                    isLoading ? undefined :
                    (currentTier === 'pro' || currentTier === 'elite') 
                      ? (e: React.MouseEvent) => {
                          // If holding Shift key, reset credits instead of managing subscription
                          if (e.shiftKey) {
                            handleResetCredits(currentTier === 'elite' ? 'elite' : 'pro');
                          } else {
                            handleManageSubscription();
                          }
                        }
                      : () => handleUpgrade('pro')
                  }
                  disabled={isLoading}
                  title={currentTier === 'pro' || currentTier === 'elite' ? 'Click to manage subscription. Hold Shift+Click to reset credits.' : undefined}
                >
                  {isLoading ? 'Processing...' : (currentTier === 'pro' || currentTier === 'elite') ? 'Manage Subscription' : 'Upgrade to Pro'}
                </Button>
              </GlassCard>
            </div>

            {/* Elite Plan */}
            <GlassCard className="rounded-2xl p-10 transform transition-all hover:scale-[1.02] hover:glow-teal">
              <div className="text-center mb-8">
                <h3 className="text-3xl font-bold mb-3 text-white text-slate-900">Elite</h3>
                <p className="text-gray-400 text-slate-600">For serious recruiting season</p>
              </div>

              <div className="mb-2 text-center">
                <span className="text-3xl font-bold text-white text-slate-900">$34.99</span>
                <span className="text-gray-400 text-slate-600 text-lg ml-1">/month</span>
              </div>
              <p className="text-gray-300 text-slate-700 text-center mb-8">3,000 credits (~200 contacts)</p>

              <div className="space-y-4 mb-8">
                <div className="flex items-center gap-3">
                  <Check className="h-5 w-5 text-blue-400 flex-shrink-0" />
                  <span className="text-gray-300 text-slate-700">3,000 credits (~200 contacts)</span>
                </div>
                <div className="flex items-center gap-3">
                  <Check className="h-5 w-5 text-blue-400 flex-shrink-0" />
                  <span className="text-gray-300 text-slate-700 font-bold">Everything in Pro, plus:</span>
                </div>
                <div className="flex items-center gap-3">
                  <Check className="h-5 w-5 text-blue-400 flex-shrink-0" />
                  <span className="text-gray-300 text-slate-700">Unlimited Coffee Chat Prep</span>
                </div>
                <div className="flex items-center gap-3">
                  <Check className="h-5 w-5 text-blue-400 flex-shrink-0" />
                  <span className="text-gray-300 text-slate-700">Unlimited Interview Prep</span>
                </div>
                <div className="flex items-center gap-3">
                  <Check className="h-5 w-5 text-blue-400 flex-shrink-0" />
                  <span className="text-gray-300 text-slate-700">Priority queue for contact generation</span>
                </div>
                <div className="flex items-center gap-3">
                  <Check className="h-5 w-5 text-blue-400 flex-shrink-0" />
                  <span className="text-gray-300 text-slate-700">Personalized outreach templates (tailored to resume)</span>
                </div>
                <div className="flex items-center gap-3">
                  <Check className="h-5 w-5 text-blue-400 flex-shrink-0" />
                  <span className="text-gray-300 text-slate-700">Weekly personalized firm insights</span>
                </div>
                <div className="flex items-center gap-3">
                  <Check className="h-5 w-5 text-blue-400 flex-shrink-0" />
                  <span className="text-gray-300 text-slate-700">Early access to new AI tools</span>
                </div>
                <div className="flex items-center gap-3">
                  <Check className="h-5 w-5 text-blue-400 flex-shrink-0" />
                  <span className="text-gray-300 text-slate-700">Estimated time saved: ~5,000 minutes/month</span>
                </div>
              </div>

              <Button 
                className="btn-secondary-glass w-full py-4 px-6 font-semibold"
                onClick={() => currentTier === 'elite' ? handleResetCredits('elite') : handleUpgrade('elite')}
                disabled={isLoading}
              >
                {isLoading ? 'Processing...' : currentTier === 'elite' ? 'Current Plan' : 'Go Elite'}
              </Button>
            </GlassCard>
          </div>
        </div>
      </div>
    </PageWrapper>
  );
};

export default Pricing;