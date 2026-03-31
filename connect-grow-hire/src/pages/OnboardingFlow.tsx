import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { OnboardingShell } from "@/components/OnboardingShell";
import { OnboardingWelcome } from "./OnboardingWelcome";
import { OnboardingProfile } from "./OnboardingProfile";
import { OnboardingAcademics } from "./OnboardingAcademics";
import { OnboardingGoals } from "./OnboardingGoals";
import { OnboardingLocationPreferences } from "./OnboardingLocationPreferences";
import { useFirebaseAuth } from "@/contexts/FirebaseAuthContext";
import { BACKEND_URL } from "@/services/api";
import { toast } from "sonner";
import { auth } from "@/lib/firebase";

interface OnboardingData {
  profile?: any;
  academics?: any;
  goals?: { careerTrack: string; dreamCompanies: string[]; personalNote: string };
  skippedGoals?: boolean;
  location?: any;
}

interface OnboardingFlowProps {
  onComplete: (data: OnboardingData) => void;
}

export const OnboardingFlow = ({ onComplete }: OnboardingFlowProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { completeOnboarding, refreshUser } = useFirebaseAuth();

  const sp = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const returnTo = useMemo(() => sp.get("returnTo") || "", [sp]);

  const [currentStep, setCurrentStep] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [onboardingData, setOnboardingData] = useState<OnboardingData>({
    profile: {},
    academics: {},
    goals: undefined,
    skippedGoals: false,
    location: {},
  });

  // Step 1 → 2
  const handleProfileData = (profileData: any) => {
    setOnboardingData((prev) => ({ ...prev, profile: profileData }));
    setCurrentStep(2);
  };

  // Step 2 → 3
  const handleAcademicsData = (academicsData: any) => {
    setOnboardingData((prev) => ({ ...prev, academics: academicsData }));
    setCurrentStep(3);
  };

  // Step 3 → 4 (Goals continue)
  const handleGoalsData = (goalsData: { careerTrack: string; dreamCompanies: string[]; personalNote: string }) => {
    setOnboardingData((prev) => ({ ...prev, goals: goalsData, skippedGoals: false }));
    setCurrentStep(4);
  };

  // Step 3 → 4 (Goals skip)
  const handleGoalsSkip = () => {
    setOnboardingData((prev) => ({ ...prev, skippedGoals: true }));
    setCurrentStep(4);
  };

  // Step 4 → complete (Preferences / final submit)
  const handlePreferencesData = async (preferencesData: any) => {
    if (isSubmitting) return;
    setIsSubmitting(true);

    try {
      // 1. Process resume if uploaded during onboarding
      if (onboardingData.profile.resume && onboardingData.profile.resume instanceof File) {
        try {
          const file = onboardingData.profile.resume;
          const extension = file.name.split(".").pop()?.toLowerCase();
          const validExtensions = ["pdf", "docx", "doc"];
          if (!extension || !validExtensions.includes(extension)) {
            toast.warning("Resume must be a PDF, DOCX, or DOC file. You can upload it later in Account Settings.");
          } else {
            const formData = new FormData();
            formData.append("resume", file);
            const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
            const response = await fetch(`${BACKEND_URL}/api/parse-resume`, {
              method: "POST",
              headers: token ? { Authorization: `Bearer ${token}` } : {},
              body: formData,
            });
            const result = await response.json();
            if (!response.ok) {
              throw new Error(result.error || "Failed to parse resume");
            }
            const parsed = {
              name: result.data.name || "",
              year: result.data.year || "",
              major: result.data.major || "",
              university: result.data.university || "",
              fileName: file.name,
              uploadDate: new Date().toISOString(),
            };
            localStorage.setItem("resumeData", JSON.stringify(parsed));
          }
        } catch (resumeError) {
          console.error("Error processing resume:", resumeError);
          toast.error("Resume upload failed, but you can upload it later in Account Settings");
        }
      }

      // 2. Transform data
      const finalData = {
        profile: {
          fullName: `${onboardingData.profile.firstName} ${onboardingData.profile.lastName}`,
          firstName: onboardingData.profile.firstName,
          lastName: onboardingData.profile.lastName,
          email: onboardingData.profile.email,
          phone: onboardingData.profile.phone,
        },
        academics: {
          university: onboardingData.academics.university,
          college: onboardingData.academics.university,
          degree: onboardingData.academics.degree,
          major: onboardingData.academics.major,
          graduationMonth: onboardingData.academics.graduationMonth,
          graduationYear: onboardingData.academics.graduationYear,
        },
        location: {
          jobTypes: preferencesData.jobTypes,
          preferredLocation: preferencesData.preferredLocation,
        },
        goals: {
          careerTrack: onboardingData.goals?.careerTrack || "",
          dreamCompanies: onboardingData.goals?.dreamCompanies || [],
          personalNote: onboardingData.goals?.personalNote || "",
        },
        onboarding: {
          skippedGoals: onboardingData.skippedGoals ?? false,
          completedAt: new Date().toISOString(),
        },
      };

      // 3. Persist to Firestore
      await completeOnboarding(finalData);

      // 4. Session flag
      sessionStorage.setItem("onboarding_just_completed", "true");

      // 5. Propagation delay
      await new Promise((resolve) => setTimeout(resolve, 500));

      // 6. Refresh user
      await refreshUser();

      // 7. Analytics callback
      try {
        onComplete(finalData);
      } catch (e) {
        console.error("Analytics error:", e);
      }

      // 8. Navigate
      let destination = "/home";
      if (returnTo) {
        try {
          let decoded = returnTo;
          while (decoded !== decodeURIComponent(decoded)) {
            decoded = decodeURIComponent(decoded);
          }
          if (!decoded.includes("/onboarding") && !decoded.includes("/signin")) {
            destination = decoded;
          }
        } catch (e) {
          console.error("Failed to decode returnTo:", e);
        }
      }
      navigate(destination, { replace: true });
    } catch (e) {
      console.error("Onboarding failed:", e);
      toast.error("Failed to complete onboarding. Please try again.");
      setIsSubmitting(false);
    }
  };

  return (
    <OnboardingShell currentStep={currentStep}>
      {currentStep === 0 && (
        <OnboardingWelcome onNext={() => setCurrentStep(1)} />
      )}

      {currentStep === 1 && (
        <OnboardingProfile
          onNext={handleProfileData}
          initialData={onboardingData.profile}
        />
      )}

      {currentStep === 2 && (
        <OnboardingAcademics
          onNext={handleAcademicsData}
          initialData={onboardingData.academics}
        />
      )}

      {currentStep === 3 && (
        <OnboardingGoals
          onNext={handleGoalsData}
          onSkip={handleGoalsSkip}
          initialData={onboardingData.goals}
        />
      )}

      {currentStep === 4 && (
        <OnboardingLocationPreferences
          onNext={handlePreferencesData}
          isSubmitting={isSubmitting}
        />
      )}
    </OnboardingShell>
  );
};
