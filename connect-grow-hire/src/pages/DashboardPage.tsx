// DashboardPage — redirects based on tier.
// Elite → /agent, Non-Elite → /find

import { Navigate } from "react-router-dom";
import { useFirebaseAuth } from "@/contexts/FirebaseAuthContext";
import { LoadingSkeleton } from "@/components/LoadingSkeleton";

export default function DashboardPage() {
  const { user, isLoading } = useFirebaseAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSkeleton />
      </div>
    );
  }

  const isElite = (user as { tier?: string } | null)?.tier === "elite";
  return <Navigate to={isElite ? "/agent" : "/find"} replace />;
}
