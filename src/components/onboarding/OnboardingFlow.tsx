import { useState } from "react";
import { OnboardingWelcome } from "./OnboardingWelcome";
import { OnboardingLocationPreferences } from "./OnboardingLocationPreferences";
import { OnboardingProfile } from "./OnboardingProfile";
import { OnboardingAcademics } from "./OnboardingAcademics";
import { User, GraduationCap, MapPin } from "lucide-react";

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

  const getStepTitle = (): string => {
    switch (currentStep) {
      case 'profile':
        return 'Create Your Profile';
      case 'academics':
        return 'Academic Information';
      case 'location':
        return 'Location Preferences';
      default:
        return '';
    }
  };

  const renderStepIndicator = () => {
    if (currentStep === 'welcome') return null;

    const steps = [
      { step: 'profile', icon: User, title: 'Create Your Profile', number: 1 },
      { step: 'academics', icon: GraduationCap, title: 'Academic Information', number: 2 },
      { step: 'location', icon: MapPin, title: 'Location Preferences', number: 3 },
    ];

    return (
      <div className="flex items-center justify-center space-x-8 mb-8">
        {steps.map(({ step, icon: Icon, title, number }, index) => {
          const isActive = currentStep === step;
          const isCompleted = getStepNumber(currentStep) > getStepNumber(step as OnboardingStep);
          
          return (
            <div key={step} className="flex flex-col items-center">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center border-2 transition-all ${
                isActive
                  ? 'bg-primary text-primary-foreground border-primary'
                  : isCompleted
                  ? 'bg-primary/10 text-primary border-primary'
                  : 'bg-muted text-muted-foreground border-muted-foreground/30'
              }`}>
                {isCompleted ? (
                  <div className="w-3 h-3 rounded-full bg-primary" />
                ) : (
                  <span className="text-sm font-semibold">{number}</span>
                )}
              </div>
              <p className={`text-sm font-medium mt-2 transition-colors ${
                isActive ? 'text-foreground' : 'text-muted-foreground'
              }`}>
                {title}
              </p>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      {currentStep === 'welcome' ? (
        <OnboardingWelcome onNext={handleNext} />
      ) : (
        <div className="flex min-h-screen">
          {/* Left side content */}
          <div className="w-1/2 p-12 flex flex-col">
            {renderStepIndicator()}
            
            <div className="flex-1">
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
          </div>
          
          {/* Right side - empty white space */}
          <div className="w-1/2 bg-muted/20"></div>
        </div>
      )}
    </div>
  );
};