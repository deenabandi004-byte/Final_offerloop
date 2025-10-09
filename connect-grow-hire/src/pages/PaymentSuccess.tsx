import { CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useFirebaseAuth } from "../contexts/FirebaseAuthContext";
import { useEffect, useState } from "react";
import { getAuth } from 'firebase/auth';

export default function PaymentSuccess() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { user, refreshUser } = useFirebaseAuth();
  const [isProcessing, setIsProcessing] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const sessionId = params.get("session_id");

  useEffect(() => {
    async function verifyPayment() {
      if (!user || !sessionId) {
        setIsProcessing(false);
        return;
      }

      try {
        const auth = getAuth();
        const firebaseUser = auth.currentUser;
        
        if (!firebaseUser) {
          throw new Error('Not authenticated');
        }

        const token = await firebaseUser.getIdToken();
        
        const API_URL = window.location.hostname === 'localhost' 
          ? 'http://localhost:5001' 
          : 'https://www.offerloop.ai';

        let attempts = 0;
        const maxAttempts = 10;
        
        while (attempts < maxAttempts) {
          const response = await fetch(`${API_URL}/api/subscription-status`, {
            headers: {
              'Authorization': `Bearer ${token}`,
            },
          });

          if (response.ok) {
            const data = await response.json();
            
            if (data.tier === 'pro' && data.status === 'active') {
              await refreshUser();
              setIsProcessing(false);
              return;
            }
          }

          await new Promise(resolve => setTimeout(resolve, 2000));
          attempts++;
        }

        setError('Payment processing is taking longer than expected. Your account will be upgraded shortly.');
        setIsProcessing(false);

      } catch (e) {
        console.error("Payment verification failed:", e);
        setError('Unable to verify payment. Please contact support if your account is not upgraded within 5 minutes.');
        setIsProcessing(false);
      }
    }

    verifyPayment();
  }, [user, sessionId, refreshUser]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white px-6">
      <div className="max-w-md text-center">
        {isProcessing ? (
          <>
            <Loader2 className="h-16 w-16 text-blue-400 mx-auto mb-4 animate-spin" />
            <h1 className="text-3xl font-bold mb-2">Processing your payment...</h1>
            <p className="text-gray-400 mb-6">
              Please wait while we activate your Pro subscription.
            </p>
          </>
        ) : error ? (
          <>
            <CheckCircle2 className="h-16 w-16 text-yellow-400 mx-auto mb-4" />
            <h1 className="text-3xl font-bold mb-2">Payment Received</h1>
            <p className="text-gray-400 mb-6">{error}</p>
            <Button onClick={() => navigate("/home")} className="w-full">
              Go to Home
            </Button>
          </>
        ) : (
          <>
            <CheckCircle2 className="h-16 w-16 text-green-400 mx-auto mb-4" />
            <h1 className="text-3xl font-bold mb-2">Welcome to Pro!</h1>
            <p className="text-gray-400 mb-6">
              Your account has been upgraded to Pro. You now have access to all premium features.
            </p>
            <Button onClick={() => navigate("/home")} className="w-full">
              Go to Home
            </Button>
          </>
        )}
      </div>
    </div>
  );
}