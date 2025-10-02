import { useState } from "react";
import { Check, X, ArrowLeft, CreditCard, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router-dom";
import { useFirebaseAuth } from "../contexts/FirebaseAuthContext";
import { loadStripe } from "@stripe/stripe-js";
import { getAuth } from 'firebase/auth';

// Hardcoded Stripe Configuration - Replace these with your actual keys
const stripePromise = loadStripe("pk_live_51S4BB8ERY2WrVHp1acXrKE6RBG7NBlfHcMZ2kf7XhCX2E5g8Lasedx6ntcaD1H4BsoUMBGYXIcKHcAB4JuohLa2B00j7jtmWnB");

const Pricing = () => {
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const { user, updateUser, completeOnboarding } = useFirebaseAuth();

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
          priceId: "price_1S4VzUERY2WrVHp1AcWTRBDd",
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
        // Update user with free tier and reset credits to 120
        await updateUser({ 
          tier: 'free',
          credits: 120,
          maxCredits: 120
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

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="container mx-auto px-6 py-6 max-w-6xl">
        <Button
          variant="ghost"
          onClick={() => navigate("/home")}
          className="mb-8 text-gray-400 hover:text-white hover:bg-slate-800"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Home
        </Button>

        <div className="text-center mb-16">
          <div className="flex items-center justify-center gap-2 mb-6">
            <div className="flex items-center gap-2 bg-blue-600/20 px-3 py-1 rounded-full">
              <CreditCard className="h-4 w-4 text-blue-400" />
              <span className="text-sm font-medium text-blue-400 uppercase tracking-wide">Our Pricing</span>
            </div>
          </div>
          <h1 className="text-5xl lg:text-6xl font-bold mb-6 bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
            Choose a plan to match your needs
          </h1>
          <p className="text-gray-400 text-lg mb-8">
            15 credits per contact. When you run out of credits, no more contacts.
          </p>
        </div>

        <div className="flex justify-center">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl w-full">
            {/* Free Plan */}
            <div className="bg-slate-900/50 border border-slate-700 rounded-xl p-8 backdrop-blur-sm">
              <div className="text-center mb-8">
                <h3 className="text-3xl font-bold mb-3 text-white">Free</h3>
                <p className="text-gray-400">Try out platform risk free</p>
              </div>

              <div className="space-y-4 mb-8">
                <div className="flex items-center gap-3">
                  <Check className="h-5 w-5 text-blue-400 flex-shrink-0" />
                  <span className="text-gray-300">120 credits</span>
                </div>
                <div className="flex items-center gap-3">
                  <Check className="h-5 w-5 text-blue-400 flex-shrink-0" />
                  <span className="text-gray-300">Estimated time saved: 200 minutes</span>
                </div>
                <div className="flex items-center gap-3">
                  <Check className="h-5 w-5 text-blue-400 flex-shrink-0" />
                  <span className="text-gray-300">Try out platform risk free</span>
                </div>
                <div className="flex items-center gap-3">
                  <Check className="h-5 w-5 text-blue-400 flex-shrink-0" />
                  <span className="text-gray-300">Limited Features</span>
                </div>
              </div>

              <Button 
                className="w-full py-4 px-6 rounded-lg font-semibold text-white bg-slate-700 hover:bg-slate-600 transition-colors"
                onClick={() => handleUpgrade('free')}
              >
                Start for free
              </Button>
            </div>

            {/* Pro Plan */}
            <div className="relative bg-gradient-to-br from-blue-600/20 to-purple-600/20 border-2 border-blue-500/50 rounded-xl p-8 backdrop-blur-sm">
              <div className="absolute top-4 right-4">
                <span className="bg-blue-500 text-white text-xs px-2 py-1 rounded-full font-medium">RECOMMENDED</span>
              </div>
              
              <div className="text-center mb-8">
                <h3 className="text-3xl font-bold mb-3 text-blue-400">Pro</h3>
                <div className="mb-2">
                  <span className="text-gray-500 text-xl line-through mr-2">$34.99</span>
                  <span className="text-3xl font-bold text-white">$14.99</span>
                  <span className="text-gray-400 text-lg ml-1">/month</span>
                </div>
                <p className="text-gray-300">840 credits</p>
              </div>

              <div className="space-y-4 mb-8">
                <div className="flex items-center gap-3">
                  <Check className="h-5 w-5 text-blue-400 flex-shrink-0" />
                  <span className="text-gray-300">840 credits</span>
                </div>
                <div className="flex items-center gap-3">
                  <Check className="h-5 w-5 text-blue-400 flex-shrink-0" />
                  <span className="text-gray-300">Estimated time saved: 1200 minutes</span>
                </div>
                <div className="flex items-center gap-3">
                  <Check className="h-5 w-5 text-blue-400 flex-shrink-0" />
                  <span className="text-gray-300">Everything in free plus:</span>
                </div>
                <div className="flex items-center gap-3">
                  <Check className="h-5 w-5 text-blue-400 flex-shrink-0" />
                  <span className="text-gray-300">Directory permanently saves</span>
                </div>
                <div className="flex items-center gap-3">
                  <Check className="h-5 w-5 text-blue-400 flex-shrink-0" />
                  <span className="text-gray-300">Priority Support</span>
                </div>
                <div className="flex items-center gap-3">
                  <Check className="h-5 w-5 text-blue-400 flex-shrink-0" />
                  <span className="text-gray-300">Advanced features</span>
                </div>
              </div>

              <Button 
                className="w-full py-4 px-6 rounded-lg font-semibold text-white bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 transition-all shadow-lg"
                onClick={() => handleUpgrade('pro')}
                disabled={isLoading}
              >
                {isLoading ? 'Processing...' : 'Start now'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Pricing;