import { useState, useEffect } from "react";
import { Check, ArrowLeft, CreditCard, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { useFirebaseAuth } from "../contexts/FirebaseAuthContext";
import { loadStripe } from "@stripe/stripe-js";
import { getAuth } from 'firebase/auth';
import { PageWrapper } from "@/components/PageWrapper";
import { GlassCard } from "@/components/GlassCard";

const stripePromise = loadStripe("pk_live_51S4BB8ERY2WrVHp1acXrKE6RBG7NBlfHcMZ2kf7XhCX2E5g8Lasedx6ntcaD1H4BsoUMBGYXIcKHcAB4JuohLa2B00j7jtmWnB");

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
  const { user, updateUser } = useFirebaseAuth();

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
        throw new Error('Failed to create portal session');
      }

      const { url } = await response.json();
      window.location.href = url;

    } catch (error) {
      console.error('Portal error:', error);
      alert('Failed to open subscription management. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleStripeCheckout = async () => {
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

      const response = await fetch(`${API_URL}/api/create-checkout-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          priceId: "price_1SQ0IJERY2WrVHp1Ul5OrP63",
          userId: user.uid,
          userEmail: user.email,
          successUrl: `${window.location.origin}/payment-success`,
          cancelUrl: `${window.location.origin}/pricing`,
        }),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to create checkout session: ${response.status} - ${errorText}`);
      }

      const { sessionId } = await response.json();

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

  const handleUpgrade = async (planType: 'free' | 'pro') => {
    if (!user) return;
  
    try {
      if (planType === 'free') {
        await updateUser({ 
          tier: 'free',
          credits: 150,
          maxCredits: 150
        }); 
        navigate("/home");
      } 
      else if (planType === 'pro') {
        await handleStripeCheckout();
      }
    } catch (error) {
      console.error("Error updating user:", error);
    }
  };

  const isProUser = subscriptionStatus?.tier === 'pro' && subscriptionStatus?.status === 'active';

  return (
    <PageWrapper>
      <div className="container mx-auto px-6 py-6 max-w-6xl">
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-10 max-w-6xl w-full">
            {/* Free Plan */}
            <GlassCard className="rounded-2xl p-10 transform transition-all hover:scale-[1.02] hover:glow-teal">
              <div className="text-center mb-8">
                <h3 className="text-3xl font-bold mb-3 text-white text-slate-900">Free</h3>
                <p className="text-gray-400 text-slate-600">Try out platform risk free</p>
              </div>

              <div className="space-y-4 mb-8">
                <div className="flex items-center gap-3">
                  <Check className="h-5 w-5 text-blue-400 flex-shrink-0" />
                  <span className="text-gray-300 text-slate-700">150 credits (10 emails) </span>
                </div>
                <div className="flex items-center gap-3">
                  <Check className="h-5 w-5 text-blue-400 flex-shrink-0" />
                  <span className="text-gray-300 text-slate-700">Estimated time saved: 250 minutes</span>
                </div>
                <div className="flex items-center gap-3">
                  <Check className="h-5 w-5 text-blue-400 flex-shrink-0" />
                  <span className="text-gray-300 text-slate-700">Try out platform risk free</span>
                </div>
                <div className="flex items-center gap-3">
                  <Check className="h-5 w-5 text-blue-400 flex-shrink-0" />
                  <span className="text-gray-300 text-slate-700">Limited Features</span>
                </div>
              </div>

              <Button 
                className="btn-secondary-glass w-full py-4 px-6 font-semibold"
                onClick={() => handleUpgrade('free')}
                disabled={isProUser}
              >
                {isProUser ? 'Current Plan: Pro' : 'Start for free'}
              </Button>
            </GlassCard>

            {/* Pro Plan */}
            <GlassCard className="relative rounded-2xl p-10 transform transition-all hover:scale-[1.02] hover:glow-teal border-2 border-blue-500/50">
              <div className="absolute top-4 right-4">
                <span className="px-3 py-1 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30 text-xs font-medium">
                  {isProUser ? 'ACTIVE' : 'RECOMMENDED'}
                </span>
              </div>
              
              <div className="text-center mb-8">
                <h3 className="text-3xl font-bold mb-3 gradient-text-teal">Pro</h3>
                <div className="mb-2">
                  <span className="text-gray-400 text-slate-600 text-xl line-through mr-2">$34.99</span>
                  <span className="text-3xl font-bold text-white text-slate-900">$8.99</span>
                  <span className="text-gray-400 text-slate-600 text-lg ml-1">/month</span>
                </div>
                <p className="text-gray-300 text-slate-700">1800 credits</p>
              </div>

              <div className="space-y-4 mb-8">
                <div className="flex items-center gap-3">
                  <Check className="h-5 w-5 text-blue-400 flex-shrink-0" />
                  <span className="text-gray-300 text-slate-700">1800 credits (120 emails) </span>
                </div>
                <div className="flex items-center gap-3">
                  <Check className="h-5 w-5 text-blue-400 flex-shrink-0" />
                  <span className="text-gray-300 text-slate-700">Estimated time saved: 2500 minutes</span>
                </div>
                <div className="flex items-center gap-3">
                  <Check className="h-5 w-5 text-blue-400 flex-shrink-0" />
                  <span className="text-gray-300 text-slate-700">Everything in free plus:</span>
                </div>
                <div className="flex items-center gap-3">
                  <Check className="h-5 w-5 text-blue-400 flex-shrink-0" />
                  <span className="text-gray-300 text-slate-700">Directory permanently saves</span>
                </div>
                <div className="flex items-center gap-3">
                  <Check className="h-5 w-5 text-blue-400 flex-shrink-0" />
                  <span className="text-gray-300 text-slate-700">Priority Support</span>
                </div>
                <div className="flex items-center gap-3">
                  <Check className="h-5 w-5 text-blue-400 flex-shrink-0" />
                  <span className="text-gray-300 text-slate-700">Advanced features</span>
                </div>
              </div>

              <Button 
                className="btn-primary-glass w-full py-6 px-6 text-lg font-semibold"
                onClick={isProUser ? handleManageSubscription : () => handleUpgrade('pro')}
                disabled={isLoading}
              >
                {isLoading ? 'Processing...' : isProUser ? 'Manage Subscription' : 'Start now'}
              </Button>
            </GlassCard>
          </div>
        </div>
      </div>
    </PageWrapper>
  );
};

export default Pricing;