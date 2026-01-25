// src/pages/Index.tsx
import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Check, ArrowRight, Twitter, Linkedin, Instagram, Menu, X, Calendar as CalendarIconLucide, ChevronDown, Play } from 'lucide-react';
// Removed SidebarProvider and AppSidebar - landing page should be public without sidebar
import { useFirebaseAuth } from "../contexts/FirebaseAuthContext";
import { ExpandablePrivacyLock } from '@/components/ExpandablePrivacyLock';
import { GranolaBackground } from '@/components/GranolaBackground';
import OfferloopLogo from '@/assets/offerloop_logo2.png';
import AnimatedDots from '@/components/AnimatedDots';
import TextType from '@/components/TextType';
import Marquee from "react-fast-marquee";
import UniversityLogos from '@/components/UniversityLogos';
import ExtensionShowcase from '@/components/ExtensionShowcase';
import ScoutAsleep from '@/assets/ScoutAsleep.mp4';
import ScaredScout from '@/assets/scaredscout.mp4';
import ScoutGirlSad from '@/assets/Scoutgirlsad.mp4';
import WebsiteFeatureWalkthrough from '@/assets/Website Feature Walkthrough.mp4';
// How It Works video imports
import HowItWorksCompanies from '@/assets/howitworkscompanies.mp4';
import HowItWorksContactSearch from '@/assets/howitworkscontactsearch.mp4';
import HowItWorksCoffeeChat from '@/assets/howitworkscoffeechat.mp4';
import HowItWorksHiringManager from '@/assets/howitworkshiringmanager.mp4';
import HowItWorksResumeCV from '@/assets/howitworksresume&cv.mp4';
import HowItWorksInterviewPrep from '@/assets/howitworksinterviewprep.mp4';
// Testimonials imports
import DylanRoby from "@/assets/DylanRoby.png";
import SaraUcuzoglu from "@/assets/SaraU.png";
import JacksonLeck from "@/assets/JacksonLeck.png";
import FiveStarReview from "@/assets/5StarReview.png";
import EliHamou from "@/assets/EliHamou.png";
import LucasTurcuato from "@/assets/LucasTurcuato.png";
import McKinseyLogo from "@/assets/McKinsey.png";
import EvercoreLogo from "@/assets/Evercore.png";
import GoldmanSachsLogo from "@/assets/GoldmanSachs.png";
import BainLogo from "@/assets/McKinsey.png";
import MorganStanleyLogo from "@/assets/MorganStanley.png";
import BlackstoneLogo from "@/assets/Blackstone.png";
import PwCLogo from "@/assets/PwC.png";
import JPMorganLogo from "@/assets/JPMorgan.png";
import BarclaysLogo from "@/assets/Barclays.png";
// Logo imports for Works With section
import LinkedInLogo from '@/assets/LinkedIn_logo.png';
import GoogleLogo from '@/assets/Googlelogo.png';
import ExcelLogo from '@/assets/excel_logo.png';
import OutlookLogo from '@/assets/outlook_logo.png';
import ZoomLogo from '@/assets/zoom_logo.png';
import AppleMailLogo from '@/assets/applemail.png';
import AppleNumbersLogo from '@/assets/applenumberslogo-removebg-preview.png';
import AppleCalendarLogo from '@/assets/applecalendarlogo.png';
import GoogleCalendarLogo from '@/assets/Googlecalendar.png';
import GmailLogo from '@/assets/Gmaillogopng.png';
import GoogleSheetsLogo from '@/assets/sheetslogo.png';

// Sidebar icons for Features mega-menu
import BriefcaseIcon from '@/assets/sidebaricons/icons8-briefcase-48.png';
import BuildingIcon from '@/assets/sidebaricons/icons8-building-50.png';
import BuildingIcon2 from '@/assets/sidebaricons/icons8-building-50 2.png';
import CupIcon from '@/assets/sidebaricons/icons8-cup-48.png';
import FindUserIcon from '@/assets/sidebaricons/icons8-find-user-male-48 (1).png';
import MailIcon from '@/assets/sidebaricons/icons8-important-mail-48.png';
import MagnifyingGlassIcon from '@/assets/sidebaricons/icons8-magnifying-glass-50.png';
import PaperIcon from '@/assets/sidebaricons/icons8-paper-48.png';
import PeopleIcon from '@/assets/sidebaricons/icons8-people-working-together-48.png';
import WriteIcon from '@/assets/sidebaricons/icons8-write-48.png';
import ScheduleIcon from '@/assets/icons8-schedule-50.png';

// Feature item component for mega-menu
const FeatureItem = ({ icon, title, description, onClick }: { icon: string; title: string; description: string; onClick?: () => void }) => (
  <button
    onClick={onClick}
    className="flex items-start gap-3 p-2 rounded-lg hover:bg-gray-50 transition-colors w-full text-left group"
  >
    <div className="w-10 h-10 rounded-lg bg-[#3B82F6] flex items-center justify-center flex-shrink-0">
      <img 
        src={icon} 
        alt="" 
        className="w-5 h-5"
        style={{ filter: 'brightness(0) invert(1)' }}
      />
    </div>
    <div className="flex flex-col min-w-0">
      <span className="font-medium text-gray-800 group-hover:text-[#3B82F6] transition-colors">{title}</span>
      <span className="text-sm text-gray-500 line-clamp-3">{description}</span>
    </div>
  </button>
);

// Calendar icon feature item (using custom schedule icon)
const FeatureItemCalendar = ({ title, description, onClick }: { title: string; description: string; onClick?: () => void }) => (
  <button
    onClick={onClick}
    className="flex items-start gap-3 p-2 rounded-lg hover:bg-gray-50 transition-colors w-full text-left group"
  >
    <div className="w-10 h-10 rounded-lg bg-[#3B82F6] flex items-center justify-center flex-shrink-0">
      <img 
        src={ScheduleIcon} 
        alt="" 
        className="w-5 h-5"
        style={{ filter: 'brightness(0) invert(1)' }}
      />
    </div>
    <div className="flex flex-col min-w-0">
      <span className="font-medium text-gray-800 group-hover:text-[#3B82F6] transition-colors">{title}</span>
      <span className="text-sm text-gray-500 line-clamp-3">{description}</span>
    </div>
  </button>
);

// Wrapper component to retrigger typing animation on scroll
const RetriggerableTextType = ({ text, className, ...props }: { text: string; className?: string; [key: string]: any }) => {
  const [key, setKey] = useState(0);
  const wasOutOfViewRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            // If it was previously out of view and now comes back, retrigger the animation
            if (wasOutOfViewRef.current) {
              setKey((prev) => prev + 1);
              wasOutOfViewRef.current = false;
            }
          } else {
            // Mark that it went out of view
            wasOutOfViewRef.current = true;
          }
        });
      },
      { threshold: 0.1 }
    );

    observer.observe(containerRef.current);

    return () => observer.disconnect();
  }, []);

  return (
    <div ref={containerRef}>
      <TextType
        key={key}
        text={text}
        as="span"
        className={className}
        typingSpeed={100}
        loop={false}
        startOnVisible={true}
        showCursor={false}
        {...props}
      />
    </div>
  );
};
// TODO: Add your three background images to the assets folder and import them here:
// import cityscapeImage from '@/assets/cityscape.jpg';
// import officeImage from '@/assets/office.jpg';
// import coffeeShopImage from '@/assets/coffee-shop.jpg';


// Environment scene backgrounds - Visible cityscape layers for glass effect (unused but kept for potential future use)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const SCENE_BACKGROUNDS = [
  `radial-gradient(ellipse 800px 600px at 25% 65%, rgba(13, 148, 136, 0.4) 0%, transparent 50%),
   radial-gradient(ellipse 600px 500px at 75% 55%, rgba(6, 182, 212, 0.35) 0%, transparent 50%),
   radial-gradient(ellipse 500px 400px at 50% 75%, rgba(16, 185, 129, 0.3) 0%, transparent 45%),
   linear-gradient(180deg, #0a2e2e 0%, #0d3838 50%, #0a2a2a 100%)`,
  `radial-gradient(ellipse 700px 550px at 20% 70%, rgba(16, 185, 129, 0.38) 0%, transparent 48%),
   radial-gradient(ellipse 650px 500px at 80% 50%, rgba(13, 148, 136, 0.36) 0%, transparent 47%),
   radial-gradient(ellipse 550px 450px at 45% 80%, rgba(6, 182, 212, 0.32) 0%, transparent 46%),
   linear-gradient(180deg, #0c2f2f 0%, #0e3636 50%, #0b2b2b 100%)`,
  `radial-gradient(ellipse 750px 600px at 50% 60%, rgba(6, 182, 212, 0.42) 0%, transparent 50%),
   radial-gradient(ellipse 600px 480px at 30% 50%, rgba(13, 148, 136, 0.35) 0%, transparent 48%),
   radial-gradient(ellipse 520px 420px at 70% 70%, rgba(16, 185, 129, 0.33) 0%, transparent 45%),
   linear-gradient(180deg, #0a2d2d 0%, #0d3535 50%, #0a2929 100%)`,
  `radial-gradient(ellipse 680px 580px at 60% 68%, rgba(13, 148, 136, 0.39) 0%, transparent 49%),
   radial-gradient(ellipse 620px 510px at 35% 55%, rgba(16, 185, 129, 0.34) 0%, transparent 46%),
   radial-gradient(ellipse 560px 460px at 75% 75%, rgba(6, 182, 212, 0.31) 0%, transparent 44%),
   linear-gradient(180deg, #0b2e2e 0%, #0e3737 50%, #0b2a2a 100%)`,
  `radial-gradient(ellipse 720px 590px at 40% 65%, rgba(6, 182, 212, 0.4) 0%, transparent 50%),
   radial-gradient(ellipse 660px 520px at 72% 58%, rgba(13, 148, 136, 0.37) 0%, transparent 48%),
   radial-gradient(ellipse 580px 470px at 55% 78%, rgba(16, 185, 129, 0.32) 0%, transparent 46%),
   linear-gradient(180deg, #0a2c2c 0%, #0d3434 50%, #0a2828 100%)`,
  `radial-gradient(ellipse 690px 570px at 48% 67%, rgba(16, 185, 129, 0.38) 0%, transparent 49%),
   radial-gradient(ellipse 630px 505px at 68% 52%, rgba(6, 182, 212, 0.35) 0%, transparent 47%),
   radial-gradient(ellipse 570px 465px at 32% 73%, rgba(13, 148, 136, 0.33) 0%, transparent 45%),
   linear-gradient(180deg, #0b2d2d 0%, #0e3636 50%, #0b2929 100%)`,
];


const Index = () => {
  console.log("🏠 [INDEX] Component rendering");
  const navigate = useNavigate();
  const { user } = useFirebaseAuth();
  console.log("🏠 [INDEX] User state:", { hasUser: !!user, email: user?.email || "none" });
  const effectiveUser = user || {
    credits: 0,
    maxCredits: 0,
    name: "User",
    email: "user@example.com",
    tier: "free",
  } as const;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [activeScene, setActiveScene] = useState(0);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [parallaxOffset, setParallaxOffset] = useState(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [featuresMenuOpen, setFeaturesMenuOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const featuresMenuTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const sectionRefs = useRef<(HTMLElement | null)[]>([]);
  
  // Helper functions for features menu hover
  const handleFeaturesMenuEnter = () => {
    if (featuresMenuTimeoutRef.current) {
      clearTimeout(featuresMenuTimeoutRef.current);
      featuresMenuTimeoutRef.current = null;
    }
    setFeaturesMenuOpen(true);
  };
  
  const handleFeaturesMenuLeave = () => {
    featuresMenuTimeoutRef.current = setTimeout(() => {
      setFeaturesMenuOpen(false);
    }, 150);
  };

  // Track window size for responsive zigzag effect
  useEffect(() => {
    const checkDesktop = () => {
      setIsDesktop(window.innerWidth >= 768);
    };
    
    checkDesktop();
    window.addEventListener('resize', checkDesktop);
    return () => window.removeEventListener('resize', checkDesktop);
  }, []);

  // Handle scroll for scene transitions and parallax
  useEffect(() => {
    const handleScroll = () => {
      const scrollY = window.scrollY;
      const windowHeight = window.innerHeight;
      
      // Parallax effect (Layer 1 moves slower)
      setParallaxOffset(scrollY * 0.3);
      
      // Determine active scene based on scroll position
      sectionRefs.current.forEach((section, index) => {
        if (section) {
          const rect = section.getBoundingClientRect();
          if (rect.top <= windowHeight * 0.5 && rect.bottom >= windowHeight * 0.5) {
            setActiveScene(index);
          }
        }
      });
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Background images array - add your three images here once they're in the assets folder
  const backgroundImages: string[] = [
    // Uncomment and update these once you add the images:
    // cityscapeImage,
    // officeImage,
    // coffeeShopImage,
  ];

  return (
    <GranolaBackground>
      {/* Fixed Floating Privacy Lock */}
      <ExpandablePrivacyLock />
      
      <div className="min-h-screen w-full text-slate-900">
        {/* Public Landing Page - No Sidebar */}
        <div className="flex-1 flex flex-col">
        <header className="fixed top-4 left-1/2 -translate-x-1/2 h-14 md:h-16 flex items-center justify-between px-6 md:px-8 bg-white/90 backdrop-blur-md shadow-lg rounded-full border border-slate-200/50 z-50 w-[90%] max-w-4xl">
          <div className="flex items-center gap-2 md:gap-4">
            <img 
              src={OfferloopLogo} 
              alt="Offerloop" 
              className="h-12 md:h-[80px] cursor-pointer"
              onClick={() => navigate("/")}
            />
          </div>
          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-6">
            {/* Features Mega Menu */}
            <div 
              className="relative"
              onMouseEnter={handleFeaturesMenuEnter}
              onMouseLeave={handleFeaturesMenuLeave}
            >
              <button
                className="text-base font-medium text-slate-700 hover:text-blue-600 transition-colors flex items-center gap-1"
              >
                Features
                <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${featuresMenuOpen ? 'rotate-180' : ''}`} />
              </button>
              
              {/* Mega Menu Dropdown */}
              <div 
                className={`fixed left-1/2 -translate-x-1/2 top-20 bg-white rounded-2xl shadow-xl border border-gray-100 p-6 transition-all duration-200 ${
                  featuresMenuOpen 
                    ? 'opacity-100 visible translate-y-0' 
                    : 'opacity-0 invisible -translate-y-2'
                }`}
                style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1.5rem', width: '1020px' }}
                onMouseEnter={handleFeaturesMenuEnter}
                onMouseLeave={handleFeaturesMenuLeave}
              >
                {/* Column 1: Find */}
                <div className="space-y-1">
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 whitespace-nowrap">Find</h3>
                  <FeatureItem 
                    icon={MagnifyingGlassIcon} 
                    title="People"
                    description="Discover professionals at your target companies"
                    onClick={() => {
                      navigate('/contact-search');
                      setFeaturesMenuOpen(false);
                    }}
                  />
                  <FeatureItem 
                    icon={BuildingIcon} 
                    title="Companies"
                    description="Research companies hiring for your dream roles"
                    onClick={() => {
                      navigate('/firm-search');
                      setFeaturesMenuOpen(false);
                    }}
                  />
                  <FeatureItem 
                    icon={FindUserIcon} 
                    title="Hiring Managers"
                    description="Connect directly with decision makers"
                    onClick={() => {
                      navigate('/recruiter-spreadsheet');
                      setFeaturesMenuOpen(false);
                    }}
                  />
                </div>
                
                {/* Column 2: Prepare */}
                <div className="space-y-1">
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 whitespace-nowrap">Prepare</h3>
                  <FeatureItem 
                    icon={CupIcon} 
                    title="Coffee Chat"
                    description="Get smart talking points for any conversation"
                    onClick={() => {
                      navigate('/coffee-chat-prep');
                      setFeaturesMenuOpen(false);
                    }}
                  />
                  <FeatureItem 
                    icon={BriefcaseIcon} 
                    title="Interview"
                    description="Ace interviews with personalized prep"
                    onClick={() => {
                      navigate('/interview-prep');
                      setFeaturesMenuOpen(false);
                    }}
                  />
                </div>
                
                {/* Column 3: Write */}
                <div className="space-y-1">
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 whitespace-nowrap">Write</h3>
                  <FeatureItem 
                    icon={PaperIcon} 
                    title="Resume"
                    description="Craft tailored resumes that stand out"
                    onClick={() => {
                      navigate('/write/resume');
                      setFeaturesMenuOpen(false);
                    }}
                  />
                  <FeatureItem 
                    icon={WriteIcon} 
                    title="Cover Letter"
                    description="Generate compelling letters for each role"
                    onClick={() => {
                      navigate('/write/cover-letter');
                      setFeaturesMenuOpen(false);
                    }}
                  />
                </div>
                
                {/* Column 4: Track */}
                <div className="space-y-1">
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 whitespace-nowrap">Track</h3>
                  <FeatureItem 
                    icon={MailIcon} 
                    title="Email Outreach"
                    description="Send personalized emails that get responses"
                    onClick={() => {
                      navigate('/outbox');
                      setFeaturesMenuOpen(false);
                    }}
                  />
                  <FeatureItemCalendar 
                    title="Calendar"
                    description="Never miss a deadline or follow-up"
                    onClick={() => {
                      navigate('/calendar');
                      setFeaturesMenuOpen(false);
                    }}
                  />
                  <FeatureItem 
                    icon={PeopleIcon} 
                    title="Networking"
                    description="Manage all your professional connections"
                    onClick={() => {
                      navigate('/contact-directory');
                      setFeaturesMenuOpen(false);
                    }}
                  />
                  <FeatureItem 
                    icon={FindUserIcon} 
                    title="Hiring Managers"
                    description="Track outreach to key decision makers"
                    onClick={() => {
                      navigate('/hiring-manager-tracker');
                      setFeaturesMenuOpen(false);
                    }}
                  />
                  <FeatureItem 
                    icon={BuildingIcon2} 
                    title="Companies"
                    description="Monitor application status across all targets"
                    onClick={() => {
                      navigate('/company-tracker');
                      setFeaturesMenuOpen(false);
                    }}
                  />
                </div>
              </div>
            </div>
            <button
              onClick={() => {
                const element = document.getElementById('pricing');
                if (element) {
                  element.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
                setMobileMenuOpen(false);
              }}
              className="text-base font-medium text-slate-700 hover:text-blue-600 transition-colors"
            >
              Pricing
            </button>
            <button
              onClick={() => {
                const element = document.getElementById('about');
                if (element) {
                  element.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
                setMobileMenuOpen(false);
              }}
              className="text-base font-medium text-slate-700 hover:text-blue-600 transition-colors"
            >
              About Us
            </button>
            <button
              onClick={() => {
                // Scroll to privacy lock and set hash to trigger animation
                window.location.hash = '#privacy-lock';
                const element = document.getElementById('privacy-lock');
                if (element) {
                  element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
                setMobileMenuOpen(false);
              }}
              className="text-base font-medium text-slate-700 hover:text-blue-600 transition-colors"
            >
              Privacy
            </button>
          </nav>
          {/* Desktop Auth Buttons */}
          <div className="hidden md:flex items-center gap-4">
            {user ? (
              <button
                onClick={() => navigate("/dashboard")}
                className="btn-secondary-glass px-4 py-2 text-sm font-bold"
              >
                Go to Dashboard
              </button>
            ) : (
              <>
                <button
                  onClick={() => navigate("/signin?mode=signin")}
                  className="btn-secondary-glass px-4 py-2 text-sm font-bold"
                >
                  Sign In
                </button>
                <button
                  onClick={() => navigate("/signin?mode=signup")}
                  className="btn-primary-glass px-4 py-2 text-sm font-bold"
                >
                  Sign Up
                </button>
              </>
            )}
          </div>
          {/* Mobile Menu Button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 text-slate-700 hover:text-blue-600 transition-colors"
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </header>
        
        {/* Mobile Menu Overlay */}
        {mobileMenuOpen && (
          <div className="fixed inset-0 bg-black/50 z-40 md:hidden" onClick={() => setMobileMenuOpen(false)} />
        )}
        
        {/* Mobile Menu */}
        <div className={`fixed top-16 left-2 right-2 md:hidden bg-[#ECF4FF] backdrop-blur-md shadow-xl rounded-xl border border-blue-200/50 z-50 transition-all duration-300 ${
          mobileMenuOpen ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4 pointer-events-none'
        }`}>
          <nav className="flex flex-col p-4 gap-2">
            <button
              onClick={() => {
                const element = document.getElementById('features');
                if (element) {
                  element.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
                setMobileMenuOpen(false);
              }}
              className="text-left px-4 py-3 text-sm font-medium text-slate-700 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
            >
              Features
            </button>
            <button
              onClick={() => {
                const element = document.getElementById('pricing');
                if (element) {
                  element.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
                setMobileMenuOpen(false);
              }}
              className="text-left px-4 py-3 text-sm font-medium text-slate-700 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
            >
              Pricing
            </button>
            <button
              onClick={() => {
                const element = document.getElementById('about');
                if (element) {
                  element.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
                setMobileMenuOpen(false);
              }}
              className="text-left px-4 py-3 text-sm font-medium text-slate-700 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
            >
              About Us
            </button>
            <button
              onClick={() => {
                window.location.hash = '#privacy-lock';
                const element = document.getElementById('privacy-lock');
                if (element) {
                  element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
                setMobileMenuOpen(false);
              }}
              className="text-left px-4 py-3 text-sm font-medium text-slate-700 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
            >
              Privacy
            </button>
            <div className="border-t border-blue-200/50 mt-2 pt-2 flex flex-col gap-2">
              {user ? (
                <button
                  onClick={() => {
                    navigate("/dashboard");
                    setMobileMenuOpen(false);
                  }}
                  className="btn-secondary-glass px-4 py-2 text-sm font-bold w-full"
                >
                  Go to Dashboard
                </button>
              ) : (
                <>
                  <button
                    onClick={() => {
                      navigate("/signin?mode=signin");
                      setMobileMenuOpen(false);
                    }}
                    className="btn-secondary-glass px-4 py-2 text-sm font-bold w-full"
                  >
                    Sign In
                  </button>
                  <button
                    onClick={() => {
                      navigate("/signin?mode=signup");
                      setMobileMenuOpen(false);
                    }}
                    className="btn-primary-glass px-4 py-2 text-sm font-bold w-full"
                  >
                    Sign Up
                  </button>
                </>
              )}
            </div>
          </nav>
        </div>
        
        {/* Spacer to account for fixed header with margin */}
        <div className="h-20 md:h-24"></div>

          <div className="flex-1 relative z-10">

        {/* Hero, Tagline, and How It Works Container - Unified Blue Gradient Background */}
        <div className="relative overflow-hidden">
          {/* Background gradient */}
          <div className="absolute inset-0 bg-gradient-to-b from-blue-50 via-blue-100/50 to-white" />
          
          {/* Decorative blue blotches/blobs */}
          <div className="absolute top-0 left-0 w-[500px] h-[500px] bg-blue-200/30 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/4" />
          <div className="absolute top-1/4 right-0 w-[600px] h-[600px] bg-blue-300/20 rounded-full blur-3xl translate-x-1/3" />
          <div className="absolute top-1/2 left-1/4 w-[400px] h-[400px] bg-blue-200/25 rounded-full blur-3xl" />
          <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-blue-100/30 rounded-full blur-3xl" />

          {/* Hero Section */}
          <section 
            ref={(el) => { sectionRefs.current[0] = el; }}
            className="min-h-screen pt-12 md:pt-24 pb-12 md:pb-24 relative z-10 w-full overflow-hidden"
            data-scene="0"
          >
            {/* Hero Text - Centered */}
            <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-12 mb-12 md:mb-20">
              <div className="max-w-5xl mx-auto text-center">
                <h1 className="text-[70px] md:text-[84px] lg:text-[96px] font-bold mb-6 font-instrument" style={{ overflow: 'visible', lineHeight: '1.1', letterSpacing: '-0.02em' }}>
                  <span className="text-hero-primary tracking-tight">
                    Land Job Offers.
                    <br />
                    <span style={{ color: '#3B82F6' }}>No busywork.</span>
                </span>
              </h1>
                <p className="text-lg md:text-xl text-slate-500 font-semibold mb-12 max-w-3xl mx-auto leading-relaxed">
                  Stop wasting time finding contact information, writing emails, scouring company websites, writing cover letters, etc. Just use Offerloop.
              </p>
              <button
                onClick={() => navigate("/signin?mode=signup")}
                className="btn-primary-glass px-10 md:px-16 py-3 md:py-4 text-base md:text-lg font-bold rounded-full pulse-glow inline-flex items-center gap-3"
              >
                Try it out <ArrowRight className="h-4 w-4 md:h-5 md:w-5 stroke-[3]" />
              </button>
              </div>
            </div>
            
            {/* Website Feature Walkthrough Video */}
            <div className="w-full overflow-hidden">
              <div className="max-w-[1400px] mx-auto px-4 md:px-[60px]">
                <div className="aspect-video rounded-lg md:rounded-2xl overflow-hidden border border-blue-500/20 border-blue-300/60 bg-gradient-to-br from-blue-500/5 to-cyan-500/5 shadow-lg shadow-blue-100/50">
                  <video
                    src={WebsiteFeatureWalkthrough}
                    autoPlay
                    loop
                    muted
                    playsInline
                    className="w-full h-full object-cover"
                  >
                    Your browser does not support the video tag.
                  </video>
                </div>
              </div>
            </div>
          </section>

          {/* How It Works Section */}
          <section className="py-20 px-6 relative z-10">
          <div className="max-w-7xl mx-auto">
            <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold text-center mb-4 text-section-heading">
              How It Works
            </h2>
            <p className="text-lg md:text-xl text-slate-600 max-w-2xl mx-auto text-center mb-16">
              Offerloop replaces scattered recruiting work with one clear system, so progress feels manageable instead of overwhelming.
            </p>
            
            {[
              {
                title: "Find Your Target Companies",
                description: "Discover companies that match your goals. Search by industry, location, and size to build a focused list of dream employers.",
                number: "01",
                videoSrc: HowItWorksCompanies
              },
              {
                title: "Find the Right Contacts",
                description: "Search our database of professionals by company, role, and school to find the perfect people to reach out to.",
                number: "02",
                videoSrc: HowItWorksContactSearch
              },
              {
                title: "Prep for Coffee Chats",
                description: "Get AI-generated talking points, conversation starters, and background research so you walk into every coffee chat confident and prepared.",
                number: "03",
                videoSrc: HowItWorksCoffeeChat
              },
              {
                title: "Find Hiring Managers",
                description: "Identify the decision-makers at your target companies. Skip the gatekeepers and connect directly with people who can hire you.",
                number: "04",
                videoSrc: HowItWorksHiringManager
              },
              {
                title: "Generate Resumes & Cover Letters",
                description: "Create tailored resumes and cover letters optimized for each opportunity—personalized by AI in seconds.",
                number: "05",
                videoSrc: HowItWorksResumeCV
              },
              {
                title: "Ace Your Interviews",
                description: "Prepare with AI-powered interview prep: company-specific questions, practice prompts, and guidance to help you land the offer.",
                number: "06",
                videoSrc: HowItWorksInterviewPrep
              }
            ].map((feature, index) => {
              const isEven = index % 2 === 1;
              // Zigzag offset: each row shifts slightly to create diagonal effect
              const offsetAmount = index * 1.5; // Percentage offset for zigzag
              
              return (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 50 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-100px" }}
                  transition={{ duration: 0.6, ease: "easeOut" }}
                  className={`flex flex-col md:flex-row items-center gap-8 md:gap-12 mb-16 md:mb-20 ${
                    isEven ? 'md:flex-row-reverse' : ''
                  }`}
                >
                  {/* Video Container */}
                  <div 
                    className="w-full md:w-[55%] relative"
                    style={{
                      transform: isDesktop 
                        ? `translateX(${isEven ? offsetAmount : -offsetAmount}%)` 
                        : 'none'
                    }}
                  >
                    <div className="aspect-video rounded-2xl overflow-hidden border border-blue-500/20 border-blue-300/60 bg-gradient-to-br from-blue-500/10 to-cyan-500/10 shadow-lg shadow-blue-100/50 relative">
                      {/* Video Element */}
                      <video
                        src={feature.videoSrc}
                        className="w-full h-full object-cover"
                        autoPlay
                        loop
                        muted
                        playsInline
                      >
                        Your browser does not support the video tag.
                      </video>
                      {/* Decorative blur effect */}
                      <div className="absolute -bottom-4 -left-4 w-24 h-24 bg-blue-500/10 rounded-full blur-3xl"></div>
                    </div>
                  </div>
                  
                  {/* Text Container */}
                  <div className="w-full md:w-[45%] space-y-4">
                    <div className="text-sm font-semibold text-blue-600 mb-2">
                      {feature.number}
                    </div>
                    <h3 className="text-3xl md:text-4xl font-bold text-section-heading">
                      {feature.title}
                    </h3>
                    <p className="text-lg text-section-body leading-relaxed">
                      {feature.description}
                    </p>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </section>
        </div>

        {/* University Logos Section */}
        <UniversityLogos />

        {/* Extension Showcase Section */}
        <ExtensionShowcase />

        {/* Hear from our Customers Section */}
        <section className="py-24 px-6 overflow-hidden bg-white">
          <div className="max-w-full mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-4 text-section-heading">
                Hear from our <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-500 to-teal-500">Real Customers</span>
              </h2>
              <p className="text-xl text-section-body">
                Used by hundreds of students across the country with offers received from top tier firms
              </p>
            </div>

            {/* Company Logos */}
            <div className="mb-16">
              <Marquee 
                gradient={true} 
                gradientColor="#ffffff" 
                gradientWidth={200} 
                speed={50} 
                direction="right"
              >
                {[
                  { src: McKinseyLogo, alt: 'McKinsey' },
                  { src: EvercoreLogo, alt: 'Evercore' },
                  { src: GoldmanSachsLogo, alt: 'Goldman Sachs' },
                  { src: BainLogo, alt: 'Bain' },
                  { src: MorganStanleyLogo, alt: 'Morgan Stanley' },
                  { src: BlackstoneLogo, alt: 'Blackstone' },
                  { src: PwCLogo, alt: 'PwC' },
                  { src: JPMorganLogo, alt: 'J.P. Morgan' },
                  { src: BarclaysLogo, alt: 'Barclays' },
                ].map(({ src, alt }) => (
                  <div key={alt} className="flex items-center mx-12">
                    <img src={src} alt={alt} className="h-12 md:h-14 w-auto opacity-60 hover:opacity-100 transition-opacity" />
                  </div>
                ))}
              </Marquee>
            </div>

            {/* Reviews */}
            <Marquee 
              gradient={true} 
              gradientColor="#ffffff" 
              gradientWidth={300} 
              speed={80} 
              pauseOnHover={true}
            >
              {[
                { name: 'Dylan Roby', role: 'Evercore, Investment Banking Analyst', img: DylanRoby, quote: "Offerloop does the work that I had spent hundreds of hours doing to land my internship… in mere minutes." },
                { name: 'Sarah Ucuzoglu', role: 'PwC, Financial Advisory Intern', img: SaraUcuzoglu, quote: "Having the ability to automate the cold reach out process allows for more time spent face to face with a professional." },
                { name: 'Jackson Leck', role: 'Blackstone, Private Equity Intern', img: JacksonLeck, quote: "I would have so many recruiting tabs open... with Offerloop I have one. Everything I need in a single place." },
                { name: 'Eli Hamou', role: 'Deloitte, Audit Intern', img: EliHamou, quote: "This platform completely transformed how I approach networking. The time I save allows me to focus on what really matters." },
                { name: 'Lucas Turcuato', role: 'Barclays, Investment Banking Analyst', img: LucasTurcuato, quote: "Game changer for recruiting season. I went from stressed to organized in minutes." },
              ].map(({ name, role, img, quote }) => {
                const color = { light: 'rgba(59, 130, 246, 0.08)', border: 'rgba(59, 130, 246, 0.25)' };
                return (
                  <div 
                    key={name} 
                    className="bg-white rounded-2xl p-8 mx-4 w-[420px] h-[380px] flex flex-col justify-between relative overflow-hidden shadow-sm border"
                    style={{
                      borderColor: color.border,
                    }}
                  >
                    {/* Color accent overlay */}
                    <div 
                      className="absolute inset-0 pointer-events-none rounded-2xl"
                      style={{
                        background: `linear-gradient(135deg, ${color.light} 0%, transparent 50%)`,
                      }}
                    />
                    <div className="relative z-10 flex flex-col h-full">
                      <div className="flex-1">
                        <img src={FiveStarReview} alt="5 star rating" className="w-24 mb-4" />
                        <p className="text-section-body italic text-lg leading-relaxed">"{quote}"</p>
                      </div>
                      <div className="flex items-center gap-4 mt-auto pt-6">
                        <img 
                          src={img} 
                          alt={name} 
                          className="w-14 h-14 rounded-full object-cover border"
                          style={{
                            borderColor: color.border,
                          }}
                        />
                        <div>
                          <div className="font-semibold text-section-heading">{name}</div>
                          <div className="text-sm text-section-body">{role}</div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </Marquee>
          </div>
        </section>

        {/* Works With Section - White Background */}
        <section className="relative">
          {/* White background container */}
          <div className="absolute inset-0 bg-white" style={{ top: '-50px', bottom: '-50px' }} />
          
          <div className="relative z-10 py-24">
            {/* Works With Header */}
            <div className="text-center mb-8">
              <h2 className="text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-bold text-section-heading font-instrument">
                Works With
              </h2>
              <p className="text-lg md:text-xl text-section-body max-w-4xl mx-auto mt-6 px-4">
                Our product seamlessly integrates with your existing workflow: connect with professionals on LinkedIn, manage outreach through Gmail or Outlook, organize data in Google Sheets or Excel, schedule meetings via Apple or Google Calendar, and connect on Zoom.
              </p>
            </div>

            {/* Works With Logos - Sliding Marquee */}
            <div className="relative overflow-hidden">
              {/* Left fade gradient */}
              <div className="absolute left-0 top-0 bottom-0 w-32 bg-gradient-to-r from-white to-transparent z-10 pointer-events-none" />
              {/* Right fade gradient */}
              <div className="absolute right-0 top-0 bottom-0 w-32 bg-gradient-to-l from-white to-transparent z-10 pointer-events-none" />
              
              {/* Scrolling container */}
              <div className="flex animate-marquee">
                {/* First set of logos */}
                <div className="flex items-center gap-12 px-6 shrink-0">
                  <img src={LinkedInLogo} alt="LinkedIn" className="h-10 md:h-12 lg:h-14 w-auto object-contain" />
                  <img src={GoogleLogo} alt="Google" className="h-10 md:h-12 lg:h-14 w-auto object-contain" />
                  <img src={ExcelLogo} alt="Excel" className="h-10 md:h-12 lg:h-14 w-auto object-contain" />
                  <img src={OutlookLogo} alt="Outlook" className="h-10 md:h-12 lg:h-14 w-auto object-contain" />
                  <img src={ZoomLogo} alt="Zoom" className="h-10 md:h-12 lg:h-14 w-auto object-contain" />
                  <img src={AppleMailLogo} alt="Apple Mail" className="h-10 md:h-12 lg:h-14 w-auto object-contain" />
                  <img src={AppleNumbersLogo} alt="Apple Numbers" className="h-10 md:h-12 lg:h-14 w-auto object-contain" />
                  <img src={AppleCalendarLogo} alt="Apple Calendar" className="h-10 md:h-12 lg:h-14 w-auto object-contain" />
                  <img src={GoogleCalendarLogo} alt="Google Calendar" className="h-10 md:h-12 lg:h-14 w-auto object-contain" />
                  <img src={GmailLogo} alt="Gmail" className="h-10 md:h-12 lg:h-14 w-auto object-contain" />
                  <img src={GoogleSheetsLogo} alt="Google Sheets" className="h-10 md:h-12 lg:h-14 w-auto object-contain" />
                </div>
                {/* Duplicate set for seamless loop */}
                <div className="flex items-center gap-12 px-6 shrink-0">
                  <img src={LinkedInLogo} alt="LinkedIn" className="h-10 md:h-12 lg:h-14 w-auto object-contain" />
                  <img src={GoogleLogo} alt="Google" className="h-10 md:h-12 lg:h-14 w-auto object-contain" />
                  <img src={ExcelLogo} alt="Excel" className="h-10 md:h-12 lg:h-14 w-auto object-contain" />
                  <img src={OutlookLogo} alt="Outlook" className="h-10 md:h-12 lg:h-14 w-auto object-contain" />
                  <img src={ZoomLogo} alt="Zoom" className="h-10 md:h-12 lg:h-14 w-auto object-contain" />
                  <img src={AppleMailLogo} alt="Apple Mail" className="h-10 md:h-12 lg:h-14 w-auto object-contain" />
                  <img src={AppleNumbersLogo} alt="Apple Numbers" className="h-10 md:h-12 lg:h-14 w-auto object-contain" />
                  <img src={AppleCalendarLogo} alt="Apple Calendar" className="h-10 md:h-12 lg:h-14 w-auto object-contain" />
                  <img src={GoogleCalendarLogo} alt="Google Calendar" className="h-10 md:h-12 lg:h-14 w-auto object-contain" />
                  <img src={GmailLogo} alt="Gmail" className="h-10 md:h-12 lg:h-14 w-auto object-contain" />
                  <img src={GoogleSheetsLogo} alt="Google Sheets" className="h-10 md:h-12 lg:h-14 w-auto object-contain" />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Pricing Section */}
        <section 
          ref={(el) => { sectionRefs.current[4] = el; }}
          id="pricing" 
          className="py-24 px-6 relative"
          data-scene="4"
          style={{ marginTop: '-1px' }}
        >
          <div className="max-w-7xl mx-auto">
            <h2 className="text-display-lg text-center mb-16 text-section-heading font-instrument">
              Start <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-cyan-500">Connecting</span> Today
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {/* Free Plan */}
              <div className="glass-card p-8 rounded-3xl">
                <div className="mb-6">
                  <h3 className="text-2xl font-bold text-section-heading">Free</h3>
                  <p className="text-section-body">Try it out for free</p>
                </div>
                <div className="space-y-3 mb-8">
                  {[
                    '300 credits (~20 contacts)',
                    'Basic contact search',
                    'AI-powered email drafts',
                    'Gmail integration',
                    'Directory saves all contacts',
                    '10 alumni searches',
                    '3 Coffee Chat Preps',
                    '2 Interview Preps',
                    'Exports disabled',
                    'Estimated time saved: ~300 minutes'
                  ].map((item) => (
                    <div key={item} className="flex items-center gap-3">
                      <Check className="h-5 w-5 text-blue-400 text-blue-600" />
                      <span className="text-section-body">{item}</span>
                    </div>
                  ))}
                </div>
                <button 
                  onClick={() => navigate("/signin?mode=signup")}
                  className="btn-secondary-glass w-full py-4"
                >
                  Start for Free
                </button>
              </div>

              {/* Pro Plan - Emphasized */}
              <div className="relative">
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-full text-xs font-semibold text-white z-10">
                  MOST POPULAR
                </div>
                <div className="glass-card p-8 rounded-3xl border-blue-500/30 border-blue-300/50 glow-teal shadow-xl scale-105">
                  <div className="mb-6">
                    <h3 className="text-2xl font-bold text-section-heading">Pro</h3>
                    <p className="text-section-body mb-2">Best for Students</p>
                    <div className="flex items-baseline gap-2">
                      <span className="text-muted-foreground line-through text-lg">$19.99</span>
                      <span className="text-3xl font-bold text-blue-400 text-blue-600">$14.99</span>
                      <span className="text-section-body">/month</span>
                    </div>
                    <p className="text-section-body">1,500 credits</p>
                  </div>
                  <div className="space-y-3 mb-8">
                    {[
                      '1,500 credits (~100 contacts)',
                      'Everything in Free, plus:',
                      'Full Firm Search',
                      '10 Coffee Chat Preps/month',
                      '5 Interview Preps/month',
                      'Smart school/major/career filters',
                      'Unlimited directory saving',
                      'Bulk drafting to Gmail',
                      'Export unlocked (CSV + Gmail Drafts)',
                      'Estimated time saved: ~2,500 minutes/month'
                    ].map((item) => (
                      <div key={item} className="flex items-center gap-3">
                        <Check className="h-5 w-5 text-blue-400 text-blue-600" />
                        <span className="text-section-body">{item}</span>
                      </div>
                    ))}
                  </div>
                  <button 
                    onClick={() => navigate("/signin?mode=signup")}
                    className="btn-primary-glass w-full py-4"
                  >
                    Upgrade to Pro
                  </button>
                </div>
              </div>

              {/* Elite Plan */}
              <div className="glass-card p-8 rounded-3xl">
                <div className="mb-6">
                  <h3 className="text-2xl font-bold text-section-heading">Elite</h3>
                  <p className="text-section-body">For serious recruiting season</p>
                </div>
                <div className="mb-4">
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-bold text-section-heading">$34.99</span>
                    <span className="text-section-body">/month</span>
                  </div>
                  <p className="text-section-body mt-1">3,000 credits</p>
                </div>
                <div className="space-y-3 mb-8">
                  {[
                    '3,000 credits (~200 contacts)',
                    'Everything in Pro, plus:',
                    'Unlimited Coffee Chat Prep',
                    'Unlimited Interview Prep',
                    'Priority queue for contact generation',
                    'Personalized outreach templates (tailored to resume)',
                    'Weekly personalized firm insights',
                    'Early access to new AI tools',
                    'Estimated time saved: ~5,000 minutes/month'
                  ].map((item) => (
                    <div key={item} className="flex items-center gap-3">
                      <Check className="h-5 w-5 text-blue-400 text-blue-600" />
                      <span className="text-section-body">{item}</span>
                    </div>
                  ))}
                </div>
                <button 
                  onClick={() => navigate("/signin?mode=signup")}
                  className="btn-secondary-glass w-full py-4"
                >
                  Go Elite
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* About Section */}
        <section 
          ref={(el) => { sectionRefs.current[5] = el; }}
          id="about" 
          className="py-24 px-6 relative"
          data-scene="5"
          style={{ marginTop: '-1px' }}
        >
          <div className="max-w-7xl mx-auto">
            <div className="grid md:grid-cols-2 gap-16">
              {/* Mission */}
              <div className="glass-card p-10 rounded-3xl">
                <h2 className="text-4xl font-bold mb-6 text-section-heading font-instrument">
                  Our <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-cyan-500">Mission</span>
                </h2>
                <p className="text-lg text-section-body leading-relaxed mb-6">
                  To make it easier for students and young professionals to connect, stand out and land better opportunities.
                </p>
                <p className="text-section-body leading-relaxed">
                  By cutting down the time to send emails and prep for calls by 90%, we save our users hundreds of hours of work and stress, giving them back time to focus on what matters: learning, growing and enjoying your best years.
                </p>
              </div>

              {/* Story */}
              <div className="glass-card p-10 rounded-3xl">
                <h3 className="text-3xl font-bold mb-6 text-section-heading font-instrument">Our Story</h3>
                <div className="space-y-4 text-section-body leading-relaxed">
                  <p>
                    Offerloop is a platform built by students, for students and young professionals, with one goal: to make it easier to connect with professionals, stand out, and land great opportunities.
                  </p>
                  <p>
                    At USC, we saw countless students spending hours filling out spreadsheets and sending emails. Networking is essential — but the process is slow, stressful, and exhausting.
                  </p>
                  <p>
                    We built Offerloop to fix that. Our platform automates outreach and organizes your recruiting workflow, helping you spend less time on tedious work and more time building real connections.
                  </p>
                </div>
                <button
                  onClick={() => navigate("/signin?mode=signup")}
                  className="btn-primary-glass mt-8 px-6 py-3"
                >
                  Get started today →
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="py-16 px-6 border-t border-white/5 border-slate-300/20">
          <div className="max-w-7xl mx-auto">
            <div className="grid md:grid-cols-4 gap-8 mb-12">
              <div className="md:col-span-2">
                <div className="flex items-center gap-2 mb-6">
                  <img 
                    src={OfferloopLogo} 
                    alt="Offerloop" 
                    className="h-10 md:h-12 cursor-pointer"
                    onClick={() => navigate("/")}
                  />
                </div>
                <p className="text-section-body mb-6 max-w-md">
                  Fundamentally changing how you recruit by taking the tedious, repetitive work out of the process. Connect with professionals and build the career you're excited about.
                </p>
                <div>
                  <h4 className="font-semibold text-section-heading mb-3">Follow Us</h4>
                  <div className="flex gap-4">
                    <a 
                      href="https://twitter.com/offerloop" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="w-10 h-10 glass-card-light rounded-lg flex items-center justify-center hover:bg-blue-500/10 hover:border-blue-400/30 transition-all group"
                    >
                      <Twitter className="h-4 w-4 text-section-body group-hover:text-blue-400 transition-colors" />
                    </a>
                    <a 
                      href="https://linkedin.com/company/offerloop-ai" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="w-10 h-10 glass-card-light rounded-lg flex items-center justify-center hover:bg-blue-500/10 hover:border-blue-400/30 transition-all group"
                    >
                      <Linkedin className="h-4 w-4 text-section-body group-hover:text-blue-400 transition-colors" />
                    </a>
                    <a 
                      href="https://instagram.com/offerloop.ai" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="w-10 h-10 glass-card-light rounded-lg flex items-center justify-center hover:bg-blue-500/10 hover:border-blue-400/30 transition-all group"
                    >
                      <Instagram className="h-4 w-4 text-section-body group-hover:text-blue-400 transition-colors" />
                    </a>
                  </div>
                </div>
              </div>

              <div className="pt-16">
                <h3 className="font-semibold text-section-heading mb-4">Company</h3>
                <ul className="space-y-2">
                  <li>
                    <Link to="/about" className="text-section-body hover:text-blue-400 transition-colors text-sm link-slide">About Us</Link>
                  </li>
                </ul>
              </div>

              <div className="pt-16">
                <h3 className="font-semibold text-section-heading mb-4">Support</h3>
                <ul className="space-y-2">
                  <li>
                    <Link to="/contact-us" className="text-section-body hover:text-blue-400 transition-colors text-sm link-slide">Contact Us</Link>
                  </li>
                  <li>
                    <Link to="/contact-us" className="text-section-body hover:text-blue-400 transition-colors text-sm link-slide">Help Center</Link>
                  </li>
                  <li>
                    <Link to="/privacy" className="text-section-body hover:text-blue-400 transition-colors text-sm link-slide">Privacy Policy</Link>
                  </li>
                  <li>
                    <Link to="/terms-of-service" className="text-section-body hover:text-blue-400 transition-colors text-sm link-slide">Terms of Service</Link>
                  </li>
                </ul>
              </div>
            </div>

            <p className="text-center text-muted-foreground text-sm">
              © 2025 offerloop. All rights reserved. Connecting talent with opportunity through intelligent recruiting solutions.
            </p>
          </div>
        </footer>

        </div>
      </div>
    </div>
    </GranolaBackground>
  );
};

export default Index;
