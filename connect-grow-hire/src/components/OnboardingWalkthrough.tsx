import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, LayoutDashboard, Mail, Calendar, ChevronLeft } from 'lucide-react';
import { useFirebaseAuth } from '@/contexts/FirebaseAuthContext';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import onboardingScoutsImg from '@/assets/onboardingscouts.png';
import assistantScoutImg from '@/assets/assistant_scout.png';
import scoutWallstreetImg from '@/assets/scout_wallstreet.png';
import scoutWelcomeImg from '@/assets/scout_welcome.png';
import interviewScoutImg from '@/assets/interview_scout.png';
import coffeeScoutImg from '@/assets/coffee_scout.png';

interface WalkthroughStep {
  id: string;
  title: string;
  body: string | React.ReactNode;
  buttonText: string;
  navigateTo?: string;
  // For home base sub-steps
  isHomeBaseStep?: boolean;
  homeBaseSubStep?: number; // 0 = Dashboard, 1 = Outbox, 2 = Schedule
  icon?: React.ReactNode;
  noBlur?: boolean;
  positionLeft?: boolean;
  positionRight?: boolean;
  openScout?: boolean;
  showImage?: 'scouts' | 'assistant' | 'wallstreet' | 'interview' | 'coffee';
  wideContainer?: boolean;
}

const walkthroughSteps: WalkthroughStep[] = [
  {
    id: 'welcome',
    title: "Welcome to Offerloop!",
    body: (
      <p>
        We built Offerloop to remove the stress and annoying parts of getting a job, internship or just networking as a whole. Let me give you a quick tour of what you can do.
      </p>
    ),
    buttonText: "Let's go →",
    navigateTo: "/home?tab=dashboard",
  },
  // Home Base - Dashboard
  {
    id: 'home-dashboard',
    title: "Dashboard",
    body: (
      <p>
        Track your progress, see recent activity, and stay on top of your goals. This is your mission control for the job search.
      </p>
    ),
    buttonText: "Next →",
    navigateTo: "/home?tab=outbox",
    isHomeBaseStep: true,
    homeBaseSubStep: 0,
    icon: <LayoutDashboard className="w-6 h-6" />,
    noBlur: true,
    positionLeft: true,
  },
  // Home Base - Outbox
  {
    id: 'home-outbox',
    title: "Outbox",
    body: (
      <p>
        Manage all your email conversations. See what's drafted, sent, and who's replied. Never lose track of your outreach.
      </p>
    ),
    buttonText: "Next →",
    navigateTo: "/home?tab=calendar",
    isHomeBaseStep: true,
    homeBaseSubStep: 1,
    icon: <Mail className="w-6 h-6" />,
    noBlur: true,
    positionLeft: true,
  },
  // Home Base - Schedule
  {
    id: 'home-schedule',
    title: "Schedule",
    body: (
      <p>
        Keep your coffee chats and interviews organized. Syncs with Google Calendar so you never miss a meeting.
      </p>
    ),
    buttonText: "Next →",
    navigateTo: "/contact-search",
    isHomeBaseStep: true,
    homeBaseSubStep: 2,
    icon: <Calendar className="w-6 h-6" />,
    noBlur: true,
    positionLeft: true,
  },
  {
    id: 'contact-search',
    title: "Find People to Connect With",
    body: (
      <>
        <p className="mb-4">
          This is <strong>Contact Search</strong>, the core of Offerloop.
        </p>
        <p className="mb-4">
          Find professionals by job title, company, location or college they went to. When you find someone, we generate a personalized AI-written outreach email for each person that captures any mutual interests, experiences, company information, etc.
        </p>
        <p>The draft is instantly placed in your Gmail for each person ready for review and send.</p>
      </>
    ),
    buttonText: "Next →",
    navigateTo: "/home",
    noBlur: true,
    positionRight: true,
    showImage: 'scouts',
    wideContainer: true,
  },
  {
    id: 'scout',
    title: "Meet Scout, Your AI Assistant",
    body: (
      <>
        <p className="mb-4">
          <strong>Scout</strong> is your recruiting co-pilot.
        </p>
        <p className="mb-4">
          You can ask Scout to help you refine your search, find job listings that match your background, or just answer questions about how to use the platform.
        </p>
        <p className="mb-4">
          Since Scout has access to your profile and resume, the advice is personalized, not generic career tips.
        </p>
        <p>Access Scout anytime from the icon in the header.</p>
      </>
    ),
    buttonText: "Next →",
    navigateTo: "/interview-prep",
    noBlur: true,
    openScout: true,
    showImage: 'assistant',
    wideContainer: true,
  },
  {
    id: 'interview-prep',
    title: "Interview Prep",
    body: (
      <>
        <p className="mb-4">
          Paste in the job posting, and we'll generate a personalized interview prep PDF with:
        </p>
        <ul className="list-disc list-inside space-y-2 text-white/90">
          <li>Real past interview questions</li>
          <li>Tailored, structured answers tailored to you</li>
          <li>A complete interview process breakdown</li>
          <li>Company information, personal information of interviewer</li>
        </ul>
      </>
    ),
    buttonText: "Next →",
    navigateTo: "/coffee-chat-prep",
    noBlur: true,
    positionRight: true,
    showImage: 'interview',
    wideContainer: true,
  },
  {
    id: 'coffee-chat',
    title: "Come Prepared to Every Call",
    body: (
      <>
        <p className="mb-4">
          In our <strong>Coffee Chat Prep</strong>, paste in who you're meeting with and we'll generate a personal one page bio of the person with:
        </p>
        <ul className="list-disc list-inside space-y-2 text-white/90">
          <li>Summary of their background, hometown, projects and role</li>
          <li>Shared connections, interests or any overlaps</li>
          <li>Thoughtful, tailored questions to guide the conversation</li>
        </ul>
      </>
    ),
    buttonText: "Next →",
    navigateTo: "/firm-search",
    noBlur: true,
    positionRight: true,
    showImage: 'coffee',
    wideContainer: true,
  },
  {
    id: 'firm-search',
    title: "Find Companies",
    body: (
      <>
        <p className="mb-4">
          <strong>Firm Search</strong> helps you explore companies before you reach out.
        </p>
        <p className="mb-4">
          Get a snapshot of the company: what they do, their culture, recent news, and key talking points for your outreach or interviews.
        </p>
        <p>It's a quick way to do your homework without digging through a dozen browser tabs.</p>
      </>
    ),
    buttonText: "Finish Tour ✓",
    navigateTo: "/home",
    noBlur: true,
    positionRight: true,
    showImage: 'wallstreet',
    wideContainer: true,
  },
];

interface OnboardingWalkthroughProps {
  onComplete?: () => void;
}

const WALKTHROUGH_STEP_KEY = 'offerloop_walkthrough_step';
const WALKTHROUGH_FORCE_KEY = 'offerloop_walkthrough_force';

export const OnboardingWalkthrough: React.FC<OnboardingWalkthroughProps> = ({ onComplete }) => {
  const { user, updateUser } = useFirebaseAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  
  // Initialize step from sessionStorage to persist across page navigations
  const [currentStep, setCurrentStep] = useState(() => {
    const saved = sessionStorage.getItem(WALKTHROUGH_STEP_KEY);
    if (saved) {
      const parsed = parseInt(saved, 10);
      // Ensure saved step is within bounds
      return parsed >= 0 && parsed < walkthroughSteps.length ? parsed : 0;
    }
    return 0;
  });
  const [isVisible, setIsVisible] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);
  const [forceShow, setForceShow] = useState(() => {
    return sessionStorage.getItem(WALKTHROUGH_FORCE_KEY) === 'true';
  });

  // Persist step to sessionStorage whenever it changes
  useEffect(() => {
    sessionStorage.setItem(WALKTHROUGH_STEP_KEY, currentStep.toString());
  }, [currentStep]);

  // Show the walkthrough if user hasn't completed it OR if forceShow is true
  useEffect(() => {
    if (user && (!user.hasCompletedWalkthrough || forceShow) && !isNavigating) {
      const timer = setTimeout(() => {
        setIsVisible(true);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [user, isNavigating, forceShow]);

  // Handle navigation completion
  useEffect(() => {
    if (isNavigating) {
      const timer = setTimeout(() => {
        setIsNavigating(false);
        setIsVisible(true);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [location.pathname, searchParams, isNavigating]);

  // Open/close Scout when on the Scout step
  useEffect(() => {
    const step = walkthroughSteps[currentStep];
    if (isVisible && step?.openScout) {
      // Dispatch event to open Scout
      window.dispatchEvent(new CustomEvent('openScout'));
    }
    
    // When leaving this step or closing walkthrough, close Scout
    return () => {
      if (step?.openScout) {
        window.dispatchEvent(new CustomEvent('closeScout'));
      }
    };
  }, [currentStep, isVisible]);

  // Listen for event to manually open the onboarding tour
  useEffect(() => {
    const handleOpenTour = () => {
      setCurrentStep(0);
      sessionStorage.setItem(WALKTHROUGH_STEP_KEY, '0');
      setForceShow(true);
      sessionStorage.setItem(WALKTHROUGH_FORCE_KEY, 'true');
      setIsVisible(true);
    };

    window.addEventListener('openOnboardingTour', handleOpenTour);
    return () => window.removeEventListener('openOnboardingTour', handleOpenTour);
  }, []);

  const handleNext = async () => {
    const step = walkthroughSteps[currentStep];
    
    if (currentStep >= walkthroughSteps.length - 1) {
      await completeWalkthrough();
      return;
    }

    if (step.navigateTo) {
      const [path, query] = step.navigateTo.split('?');
      const currentPath = location.pathname;
      const currentTab = searchParams.get('tab');
      const targetTab = query?.split('=')[1];
      
      // Check if we need to navigate
      const needsNavigation = path !== currentPath || (targetTab && targetTab !== currentTab);
      
      if (needsNavigation) {
        setIsVisible(false);
        setIsNavigating(true);
        setCurrentStep(prev => prev + 1);
        navigate(step.navigateTo);
      } else {
        setCurrentStep(prev => prev + 1);
      }
    } else {
      setCurrentStep(prev => prev + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      const prevStepIndex = currentStep - 1;
      
      // Get the navigation target for the previous step (where it would have navigated FROM)
      // We need to go to where that step is displayed
      let backNavTarget: string | undefined;
      
      if (prevStepIndex === 0) {
        backNavTarget = "/home";
      } else {
        // Look at the step BEFORE the previous step to find where we came from
        const stepBeforePrev = walkthroughSteps[prevStepIndex - 1];
        backNavTarget = stepBeforePrev?.navigateTo;
      }
      
      if (backNavTarget) {
        const [path] = backNavTarget.split('?');
        if (path !== location.pathname || backNavTarget.includes('?')) {
          setIsVisible(false);
          setIsNavigating(true);
          setCurrentStep(prevStepIndex);
          navigate(backNavTarget);
          return;
        }
      }
      
      setCurrentStep(prevStepIndex);
    }
  };

  const handleSkip = async () => {
    await completeWalkthrough();
  };

  const completeWalkthrough = async () => {
    setIsVisible(false);
    setForceShow(false);
    
    // Clear the saved state from sessionStorage
    sessionStorage.removeItem(WALKTHROUGH_STEP_KEY);
    sessionStorage.removeItem(WALKTHROUGH_FORCE_KEY);
    
    if (user?.uid) {
      try {
        const userDocRef = doc(db, "users", user.uid);
        await updateDoc(userDocRef, {
          hasCompletedWalkthrough: true,
        });
        await updateUser({ hasCompletedWalkthrough: true });
      } catch (error) {
        console.error("Error completing walkthrough:", error);
      }
    }

    if (location.pathname !== '/home') {
      navigate('/home');
    }

    onComplete?.();
  };

  if (!isVisible || !user || (user.hasCompletedWalkthrough && !forceShow)) {
    return null;
  }

  const step = walkthroughSteps[currentStep];
  const isWelcomeStep = step.id === 'welcome';
  const isHomeBaseStep = step.isHomeBaseStep;

  // Calculate main step indicators (excluding sub-steps, group home base as 1)
  const mainStepIds = ['welcome', 'home-dashboard', 'contact-search', 'scout', 'interview-prep', 'coffee-chat', 'firm-search'];
  const getMainStepIndex = (stepId: string) => {
    if (stepId.startsWith('home-')) return 1; // All home steps count as step 1
    return mainStepIds.indexOf(stepId);
  };
  const currentMainStep = getMainStepIndex(step.id);

  return (
    <AnimatePresence>
      {isVisible && (
        <>
          {/* Backdrop - only show for welcome step */}
          {!step.noBlur && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm"
              onClick={handleSkip}
            />
          )}

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, x: step.positionLeft ? -20 : step.positionRight ? 20 : 0, y: (step.positionLeft || step.positionRight) ? 0 : 20 }}
            animate={{ opacity: 1, scale: 1, x: 0, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, x: step.positionLeft ? -20 : step.positionRight ? 20 : 0, y: (step.positionLeft || step.positionRight) ? 0 : 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className={`fixed z-[101] p-4 ${
              step.positionLeft 
                ? 'left-8 top-8' 
                : step.positionRight
                ? 'right-8 top-8'
                : 'inset-0 flex items-center justify-center'
            }`}
          >
            <div className={`relative rounded-2xl bg-gray-800/90 backdrop-blur-sm p-8 shadow-2xl border border-gray-600/50 ${
              step.positionLeft ? 'w-[380px]' : step.wideContainer ? 'w-[640px]' : step.positionRight ? 'w-[440px]' : 'w-full max-w-lg'
            }`}>
              {/* Close button */}
              <button
                onClick={handleSkip}
                className="absolute right-4 top-4 rounded-full p-1 text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
                aria-label="Skip tour"
              >
                <X className="h-5 w-5" />
              </button>

              {/* Main step indicator - only show for non-home-base steps or first home step */}
              {!isHomeBaseStep && (
                <div className="flex items-center gap-2 mb-6">
                  {[0, 1, 2, 3, 4, 5, 6].map((index) => (
                    <div
                      key={index}
                      className={`h-1.5 rounded-full transition-all ${
                        index === currentMainStep
                          ? 'w-8 bg-cyan-400'
                          : index < currentMainStep
                          ? 'w-4 bg-blue-500'
                          : 'w-4 bg-gray-600'
                      }`}
                    />
                  ))}
                </div>
              )}

              {/* Image for welcome step */}
              {isWelcomeStep && (
                <div className="flex justify-center mb-6">
                  <img 
                    src={scoutWelcomeImg} 
                    alt="Welcome Scout" 
                    className="w-36 h-36 object-contain"
                  />
                </div>
              )}

              {/* Icon for home base steps */}
              {isHomeBaseStep && step.icon && (
                <div className="flex justify-center mb-4">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center text-white">
                    {step.icon}
                  </div>
                </div>
              )}

              {/* Image for steps with showImage */}
              {step.showImage && (
                <div className="flex justify-center mb-4">
                  <img 
                    src={
                      step.showImage === 'scouts' 
                        ? onboardingScoutsImg 
                        : step.showImage === 'assistant' 
                        ? assistantScoutImg 
                        : step.showImage === 'interview'
                        ? interviewScoutImg
                        : step.showImage === 'coffee'
                        ? coffeeScoutImg
                        : scoutWallstreetImg
                    } 
                    alt={
                      step.showImage === 'scouts' 
                        ? "Offerloop Scouts" 
                        : step.showImage === 'assistant' 
                        ? "Scout Assistant" 
                        : step.showImage === 'interview'
                        ? "Interview Prep Scout"
                        : step.showImage === 'coffee'
                        ? "Coffee Chat Scout"
                        : "Scout Wall Street"
                    } 
                    className="w-36 h-36 object-contain"
                  />
                </div>
              )}

              {/* Title */}
              <h2 className={`font-bold text-cyan-400 mb-4 ${
                step.positionLeft ? 'text-xl text-center' : 'text-2xl text-center'
              }`}>
                {step.title}
              </h2>

              {/* Body */}
              <div className={`text-white/90 leading-relaxed ${
                isHomeBaseStep ? 'mb-6 text-center' : 'mb-8'
              }`}>
                {step.body}
              </div>

              {/* Home base sub-step dots */}
              {isHomeBaseStep && (
                <div className="flex justify-center gap-2 mb-6">
                  {[0, 1, 2].map((index) => (
                    <div
                      key={index}
                      className={`w-2.5 h-2.5 rounded-full transition-all ${
                        index === step.homeBaseSubStep
                          ? 'bg-cyan-400'
                          : index < (step.homeBaseSubStep || 0)
                          ? 'bg-blue-500'
                          : 'bg-gray-600'
                      }`}
                    />
                  ))}
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center justify-between">
                {/* Left side - Back button or Skip */}
                {currentStep > 0 ? (
                  <button
                    onClick={handleBack}
                    className="flex items-center gap-1 text-sm text-gray-400 hover:text-white transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    Back
                  </button>
                ) : (
                  <button
                    onClick={handleSkip}
                    className="text-sm text-gray-400 hover:text-white transition-colors"
                  >
                    Skip tour
                  </button>
                )}

                {/* Right side - Next button */}
                <button
                  onClick={handleNext}
                  className="px-6 py-3 rounded-xl bg-gradient-to-r from-blue-500 to-cyan-400 text-white font-semibold hover:from-blue-600 hover:to-cyan-500 transition-all shadow-lg hover:shadow-blue-500/25"
                >
                  {step.buttonText}
                </button>
              </div>

              {/* Skip link - show on all steps except first */}
              {currentStep > 0 && (
                <button
                  onClick={handleSkip}
                  className="w-full mt-4 text-sm text-gray-500 hover:text-gray-300 transition-colors text-center"
                >
                  Skip tour
                </button>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default OnboardingWalkthrough;
