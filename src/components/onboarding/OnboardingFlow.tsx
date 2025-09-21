import { useState } from "react";
import { OnboardingWelcome } from "./OnboardingWelcome";
import { OnboardingLocationPreferences } from "./OnboardingLocationPreferences";
import { OnboardingProfile } from "./OnboardingProfile";
import { OnboardingAcademics } from "./OnboardingAcademics";

import { Progress } from "@/components/ui/progress";

type OnboardingStep = 'welcome' | 'profile' | 'academics' | 'location';

interface OnboardingData {
  location?: any;
  profile?: any;
  academics?: any;
}

interface OnboardingFlowProps {
  onComplete: (data: OnboardingData) => void;
}

export const OnboardingFlow = ({ onComplete }: OnboardingFlowProps) => {
  const [currentStep, setCurrentStep] = useState<OnboardingStep>('welcome');
  const [onboardingData, setOnboardingData] = useState<OnboardingData>({});

  const getStepNumber = (step: OnboardingStep): number => {
    const steps: Record<OnboardingStep, number> = {
      welcome: 0,
      profile: 1,
      academics: 2,
      location: 3,
    };
    return steps[step];
  };

  const getProgress = (): number => {
    return (getStepNumber(currentStep) / 3) * 100;
  };

  const handleNext = () => {
    switch (currentStep) {
      case 'welcome':
        setCurrentStep('profile');
        break;
      case 'profile':
        setCurrentStep('academics');
        break;
      case 'academics':
        setCurrentStep('location');
        break;
    }
  };

  const handleBack = () => {
    switch (currentStep) {
      case 'profile':
        setCurrentStep('welcome');
        break;
      case 'academics':
        setCurrentStep('profile');
        break;
      case 'location':
        setCurrentStep('academics');
        break;
    }
  };

  const handleProfileData = (profileData: any) => {
    setOnboardingData(prev => ({ ...prev, profile: profileData }));
    handleNext();
  };

  const handleAcademicsData = (academicsData: any) => {
    setOnboardingData(prev => ({ ...prev, academics: academicsData }));
    handleNext();
  };

  const handleLocationData = (locationData: any) => {
    const finalData = { ...onboardingData, location: locationData };
    onComplete(finalData);
  };

  const handleComplete = () => {
    onComplete(onboardingData);
  };

  return (
    <div className="relative">
      {currentStep !== 'welcome' && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-sm border-b">
          <div className="container mx-auto px-4 py-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-muted-foreground">
                Step {getStepNumber(currentStep)} of 3
              </h3>
              <div className="flex-1 max-w-md mx-4">
                <Progress value={getProgress()} className="h-2" />
              </div>
              <span className="text-sm font-medium text-muted-foreground">
                {Math.round(getProgress())}%
              </span>
            </div>
          </div>
        </div>
      )}

      {currentStep === 'welcome' && (
        <OnboardingWelcome onNext={handleNext} />
      )}

      {currentStep === 'profile' && (
        <OnboardingProfile 
          onNext={handleProfileData} 
          onBack={handleBack}
          initialData={onboardingData.profile}
        />
      )}

      {currentStep === 'academics' && (
        <OnboardingAcademics 
          onNext={handleAcademicsData} 
          onBack={handleBack}
          initialData={onboardingData.academics}
        />
      )}

      {currentStep === 'location' && (
        <OnboardingLocationPreferences 
          onNext={handleLocationData} 
          onBack={handleBack}
          initialData={onboardingData.location}
        />
      )}

    </div>
  );
};