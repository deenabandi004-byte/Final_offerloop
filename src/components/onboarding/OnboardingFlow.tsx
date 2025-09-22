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
        return 'Career Preferences';
      default:
        return '';
    }
  };

  const renderStepIndicator = () => {
    if (currentStep === 'welcome') return null;

    const steps = [
      { step: 'profile', icon: User, title: 'Create Your Profile', number: 1 },
      { step: 'academics', icon: GraduationCap, title: 'Academic Information', number: 2 },
      { step: 'location', icon: MapPin, title: 'Career Preferences', number: 3 },
    ];

    return (
      <div className="flex justify-start mb-8 ml-8 mr-16">
        <div className="flex items-center">
          {steps.map(({ step, icon: Icon, title, number }, index) => {
            const isActive = currentStep === step;
            const isCompleted = getStepNumber(currentStep) > getStepNumber(step as OnboardingStep);
            
            return (
              <div key={step} className="flex items-center">
                {/* Step circle and content */}
                <div className="flex flex-col items-center">
                  <div className={`w-14 h-14 rounded-full flex items-center justify-center border-2 transition-all duration-300 ${
                    isActive
                      ? 'bg-gradient-to-r from-primary to-secondary text-white border-primary shadow-lg'
                      : isCompleted
                      ? 'bg-gradient-to-r from-primary to-secondary text-white border-primary shadow-md'
                      : 'bg-card text-muted-foreground border-border'
                  }`}>
                    {isCompleted ? (
                      <div className="w-4 h-4 rounded-full bg-white animate-fade-in" />
                    ) : (
                      <span className="text-sm font-bold">{number}</span>
                    )}
                  </div>
                  <p className={`text-sm font-medium mt-3 transition-colors duration-300 whitespace-nowrap ${
                    isActive ? 'text-foreground font-semibold' : 'text-muted-foreground'
                  }`}>
                    {title}
                  </p>
                </div>
                
                {/* Connecting line - only show between circles, not after the last one */}
                {index < steps.length - 1 && (
                  <div className="flex-1 h-0.5 bg-border mx-8 relative w-24">
                    <div 
                      className={`absolute top-0 left-0 h-full bg-gradient-to-r from-primary to-secondary transition-all duration-500 ${
                        isCompleted || (isActive && index === 0) ? 'w-full' : 'w-0'
                      }`}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
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
          
          {/* Right side - empty space */}
          <div className="w-1/2 bg-background"></div>
        </div>
      )}
    </div>
  );
};