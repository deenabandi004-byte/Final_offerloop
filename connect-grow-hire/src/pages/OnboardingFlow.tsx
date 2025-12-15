import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { OnboardingWelcome } from "./OnboardingWelcome";
import { OnboardingLocationPreferences } from "./OnboardingLocationPreferences";
import { OnboardingProfile } from "./OnboardingProfile";
import { OnboardingAcademics } from "./OnboardingAcademics";
import { User, GraduationCap, MapPin } from "lucide-react";
import { useFirebaseAuth } from "@/contexts/FirebaseAuthContext";
import { toast } from "sonner"; // Make sure you have sonner installed for toast notifications
import { auth } from '@/lib/firebase';

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
  const { completeOnboarding, refreshUser, user } = useFirebaseAuth(); // ← ADD refreshUser here

  const sp = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const returnTo = useMemo(() => sp.get("returnTo") || "", [sp]);

  const [currentStep, setCurrentStep] = useState<OnboardingStep>("welcome");
  const [isSubmitting, setIsSubmitting] = useState(false); // ← ADD THIS
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
    // Prevent double submission
    if (isSubmitting) return;
    setIsSubmitting(true);

    try {
      console.log('🎯 Starting onboarding completion...');
      
      // 1. Process resume if uploaded during onboarding
      // The backend API already handles: parsing, uploading to Firebase Storage, and saving to Firestore
      if (onboardingData.profile.resume && onboardingData.profile.resume instanceof File) {
        console.log('📄 Processing resume upload from onboarding...');
        try {
          const file = onboardingData.profile.resume;
          
          // Validate file type (backend only supports PDF)
          if (!file.name.toLowerCase().endsWith('.pdf')) {
            console.warn('⚠️ Resume must be a PDF file, skipping resume upload');
            toast.warning('Resume must be a PDF file. You can upload it later in Account Settings.');
          } else {
            // Parse and upload resume via backend API (backend handles Storage upload and Firestore save)
            const formData = new FormData();
            formData.append('resume', file);

            const API_URL = window.location.hostname === 'localhost'
              ? 'http://localhost:5001'
              : 'https://www.offerloop.ai';

            const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;

            const response = await fetch(`${API_URL}/api/parse-resume`, {
              method: 'POST',
              headers: token ? { 'Authorization': `Bearer ${token}` } : {},
              body: formData,
            });
            const result = await response.json();
            if (!response.ok) {
              throw new Error(result.error || 'Failed to parse resume');
            }

            // Backend already saved to Firestore, but we update localStorage for backward compatibility
            const parsed = {
              name: result.data.name || '',
              year: result.data.year || '',
              major: result.data.major || '',
              university: result.data.university || '',
              fileName: file.name,
              uploadDate: new Date().toISOString(),
            };
            localStorage.setItem('resumeData', JSON.stringify(parsed));

            console.log('✅ Resume processed and saved successfully');
            console.log('   Resume URL:', result.resumeUrl);
          }
        } catch (resumeError) {
          console.error('❌ Error processing resume:', resumeError);
          // Don't block onboarding if resume processing fails
          toast.error('Resume upload failed, but you can upload it later in Account Settings');
        }
      }
      
      // 2. Transform data to match backend expectations
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
          college: onboardingData.academics.university, // Backend fallback
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
          careerInterests: locationData.interests, // Backend expects this
          career_interests: locationData.interests, // Alternative
          preferredLocation: locationData.preferredLocation,
        },
      };

      // 3. Persist onboarding to Firestore via context
      console.log('💾 Calling completeOnboarding...');
      await completeOnboarding(finalData);
      console.log('✅ Onboarding saved to Firestore');
      
      // 3. Set a session flag to bypass route guard temporarily
      sessionStorage.setItem('onboarding_just_completed', 'true');
      console.log('✅ Session flag set');
      
      // 4. Give time for state to propagate
      await new Promise(resolve => setTimeout(resolve, 500));
      console.log('✅ State propagation delay complete');
      
      // 5. Refresh user data from Firestore to ensure we have latest state
      console.log('🔄 Refreshing user data...');
      await refreshUser();
      console.log('✅ User data refreshed');

      // 6. Optional: analytics callback
      try {
        onComplete(finalData);
      } catch (e) {
        console.error('Analytics error:', e);
      }

      // 7. Determine destination
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
      
      console.log('🧭 Navigating to:', destination);
      navigate(destination, { replace: true });
      
    } catch (e) {
      console.error("❌ Onboarding failed:", e);
      toast.error("Failed to complete onboarding. Please try again.");
      setIsSubmitting(false);
      // Don't navigate if onboarding failed!
    }
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
