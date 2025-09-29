import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { OnboardingWelcome } from "./OnboardingWelcome";
import { OnboardingLocationPreferences } from "./OnboardingLocationPreferences";
import { OnboardingProfile } from "./OnboardingProfile";
import { OnboardingAcademics } from "./OnboardingAcademics";
import { User, GraduationCap, MapPin } from "lucide-react";
import { useFirebaseAuth } from "@/contexts/FirebaseAuthContext";

type OnboardingStep = "welcome" | "profile" | "academics" | "location";

interface OnboardingData {
  location?: any;
  profile?: any;
  academics?: any;
}

interface OnboardingFlowProps {
  onComplete: (data: OnboardingData) => void;
}

export const OnboardingFlow = ({ onComplete }: OnboardingFlowProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { completeOnboarding, user } = useFirebaseAuth();

  const sp = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const returnTo = useMemo(() => sp.get("returnTo") || "", [sp]);

  const [currentStep, setCurrentStep] = useState<OnboardingStep>("welcome");
  const [onboardingData, setOnboardingData] = useState<OnboardingData>({
    location: {},
    profile: {},
    academics: {},
  });

  const handleProfileData = (profileData: any) => {
    setOnboardingData((prev) => ({ ...prev, profile: profileData }));
    setCurrentStep("academics");
  };

  const handleAcademicsData = (academicsData: any) => {
    setOnboardingData((prev) => ({ ...prev, academics: academicsData }));
    setCurrentStep("location");
  };

  const handleLocationData = async (locationData: any) => {
    const finalData = { ...onboardingData, location: locationData };

    // Persist onboarding to Firestore via context (authoritative)
    try {
      await completeOnboarding(finalData);
    } catch (e) {
      // optional: toast error here
    }

    // Optional: analytics callback
    try {
      onComplete(finalData);
    } catch {}

    // Go to where the user intended to go, or /home
    // Decode and validate the returnTo parameter
    let destination = "/home";
    if (returnTo) {
      try {
        // Decode the URL (it may be encoded multiple times)
        let decoded = returnTo;
        while (decoded !== decodeURIComponent(decoded)) {
          decoded = decodeURIComponent(decoded);
        }
        // Don't redirect back to onboarding or signin pages
        if (!decoded.includes("/onboarding") && !decoded.includes("/signin")) {
          destination = decoded;
        }
      } catch (e) {
        // If decoding fails, just go to home
        console.error("Failed to decode returnTo:", e);
      }
    }
    navigate(destination, { replace: true });
  };

  const handleBack = () => {
    if (currentStep === "academics") setCurrentStep("profile");
    else if (currentStep === "location") setCurrentStep("academics");
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        {/* Progress header */}
        <div className="flex items-center gap-2 mb-8">
          <span
            className={`w-8 h-8 rounded-full flex items-center justify-center ${
              currentStep !== "welcome" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
            }`}
          >
            <User className="w-4 h-4" />
          </span>
          <div
            className={`h-[2px] flex-1 ${["academics", "location"].includes(currentStep) ? "bg-primary" : "bg-muted"}`}
          />
          <span
            className={`w-8 h-8 rounded-full flex items-center justify-center ${
              ["academics", "location"].includes(currentStep)
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground"
            }`}
          >
            <GraduationCap className="w-4 h-4" />
          </span>
          <div className={`h-[2px] flex-1 ${currentStep === "location" ? "bg-primary" : "bg-muted"}`} />
          <span
            className={`w-8 h-8 rounded-full flex items-center justify-center ${
              currentStep === "location" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
            }`}
          >
            <MapPin className="w-4 h-4" />
          </span>
        </div>

        {/* Steps (no outer grid — let steps own their 50/50 layout) */}
        <div className="mt-8">
          {currentStep === "welcome" && (
            <OnboardingWelcome onNext={() => setCurrentStep("profile")} userName={user?.name || "there"} />
          )}

          {currentStep === "profile" && (
            <OnboardingProfile
              onNext={handleProfileData}
              onBack={() => setCurrentStep("welcome")}
              initialData={onboardingData.profile}
            />
          )}

          {currentStep === "academics" && (
            <OnboardingAcademics
              onNext={handleAcademicsData}
              onBack={handleBack}
              initialData={onboardingData.academics}
            />
          )}

          {currentStep === "location" && (
            <OnboardingLocationPreferences
              onNext={handleLocationData}
              onBack={handleBack}
              initialData={onboardingData.location}
            />
          )}
        </div>
      </div>
    </div>
  );
};
