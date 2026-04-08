import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { OnboardingWelcome } from "./OnboardingWelcome";
import { OnboardingLocationPreferences } from "./OnboardingLocationPreferences";
import { OnboardingProfile } from "./OnboardingProfile";
import { OnboardingAcademics } from "./OnboardingAcademics";
import { User, GraduationCap, MapPin, Loader2 } from "lucide-react";
import { useFirebaseAuth } from "@/contexts/FirebaseAuthContext";
import { BACKEND_URL, enrichLinkedInOnboarding, mergeLinkedInData } from "@/services/api";
import { toast } from "sonner";
import { auth } from "@/lib/firebase";

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
  const { completeOnboarding, refreshUser, user } = useFirebaseAuth();

  const sp = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const returnTo = useMemo(() => sp.get("returnTo") || "", [sp]);

  const [currentStep, setCurrentStep] = useState<OnboardingStep>("welcome");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [linkedinLoading, setLinkedinLoading] = useState(false);
  const [linkedinAcademics, setLinkedinAcademics] = useState<{
    university?: string;
    major?: string;
    degree?: string;
    graduationYear?: string;
  } | null>(null);
  const [onboardingData, setOnboardingData] = useState<OnboardingData>({
    location: {},
    profile: {},
    academics: {},
  });

  const handleProfileData = async (profileData: any) => {
    setOnboardingData((prev) => ({ ...prev, profile: profileData }));

    // Use enrichment result already fetched on Profile page (onBlur)
    if (profileData.linkedinEnrichment?.academics) {
      setLinkedinAcademics(profileData.linkedinEnrichment.academics);
    } else if (profileData.linkedinUrl && profileData.linkedinUrl.includes("linkedin.com/in/")) {
      // Fallback: fetch if not already done on Profile page
      setLinkedinLoading(true);
      try {
        const result = await Promise.race([
          enrichLinkedInOnboarding(profileData.linkedinUrl),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000)),
        ]) as any;
        if (result?.success && result?.academics) {
          setLinkedinAcademics(result.academics);
        } else {
          setLinkedinAcademics(null);
        }
      } catch {
        setLinkedinAcademics(null);
      } finally {
        setLinkedinLoading(false);
      }
    }

    setCurrentStep("academics");
  };

  const handleAcademicsData = (academicsData: any) => {
    setOnboardingData((prev) => ({ ...prev, academics: academicsData }));
    setCurrentStep("location");
  };

  const handleLocationData = async (locationData: any) => {
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

            // Merge LinkedIn enrichment data with resume data
            if (onboardingData.profile.linkedinUrl) {
              await mergeLinkedInData();
            }
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
          linkedinUrl: onboardingData.profile.linkedinUrl || "",
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
          country: locationData.country,
          state: locationData.state,
          city: locationData.city,
          jobTypes: locationData.jobTypes,
          interests: locationData.interests,
          careerInterests: locationData.interests,
          career_interests: locationData.interests,
          preferredLocation: locationData.preferredLocation,
        },
        onboarding: {
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

  const handleBack = () => {
    if (currentStep === "academics") setCurrentStep("profile");
    else if (currentStep === "location") setCurrentStep("academics");
  };

  return (
    <div className="min-h-screen bg-background">
      {linkedinLoading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-lg font-medium text-foreground">Personalizing your experience...</p>
          </div>
        </div>
      )}
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

        {/* Steps */}
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
              linkedinData={linkedinAcademics}
            />
          )}

          {currentStep === "location" && (
            <OnboardingLocationPreferences
              onNext={handleLocationData}
              onBack={handleBack}
              initialData={onboardingData.location}
              isSubmitting={isSubmitting}
            />
          )}
        </div>
      </div>
    </div>
  );
};
