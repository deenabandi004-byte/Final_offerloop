import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useFirebaseAuth } from "../contexts/FirebaseAuthContext";
import { useEffect } from "react";

export default function PaymentSuccess() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { user, updateUser } = useFirebaseAuth();

  // Optional: grab session_id Stripe appends (?session_id=cs_test_...)
  const sessionId = params.get("session_id");

  // TEMP upgrade (since we don't have webhooks yet)
  useEffect(() => {
    async function tempUpgrade() {
      if (!user) return;
      try {
        await updateUser({
          tier: "pro",
          credits: 840,
          maxCredits: 840,
        });
      } catch (e) {
        console.error("Temp upgrade failed:", e);
      }
    }
    tempUpgrade();
  }, [user, updateUser]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white px-6">
      <div className="max-w-md text-center">
        <CheckCircle2 className="h-16 w-16 text-green-400 mx-auto mb-4" />
        <h1 className="text-3xl font-bold mb-2">Payment successful 🎉</h1>
        <p className="text-gray-400 mb-6">
          Thanks for upgrading to <span className="text-blue-400 font-semibold">Pro</span>.
          {sessionId ? <> (Session: <span className="font-mono">{sessionId}</span>)</> : null}
        </p>
        <Button onClick={() => navigate("/home")} className="w-full">
          Go to Home
        </Button>
      </div>
    </div>
  );
}
