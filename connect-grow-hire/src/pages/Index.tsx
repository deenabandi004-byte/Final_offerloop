// src/pages/Index.tsx
import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Check, ArrowRight, Twitter, Linkedin, Instagram, Menu } from 'lucide-react';
// Removed SidebarProvider and AppSidebar - landing page should be public without sidebar
import { BackToHomeButton } from "@/components/BackToHomeButton";
import { CreditPill } from "@/components/credits";
import { useFirebaseAuth } from "../contexts/FirebaseAuthContext";
import { ExpandablePrivacyLock } from '@/components/ExpandablePrivacyLock';
import { ProductTour } from '@/components/ProductTour';
import DynamicBackground from '@/components/background/DynamicBackground';
import { DynamicGradientBackground } from '@/components/background/DynamicGradientBackground';
import { Logo } from '@/components/Logo';
import OfferloopLogo from '@/assets/Offerloop_logo.png';
import RotatingImage from '@/components/RotatingImage';
import AnimatedDots from '@/components/AnimatedDots';
import TextType from '@/components/TextType';
import { AnimatedMadeForText } from '@/components/AnimatedMadeForText';
import FeatureCards from '@/components/FeatureCards';
import ScoutAsleep from '@/assets/ScoutAsleep.mp4';
import ScaredScout from '@/assets/scaredscout.mp4';
import ScoutGirlSad from '@/assets/Scoutgirlsad.mp4';
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
  const sectionRefs = useRef<(HTMLElement | null)[]>([]);

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
    <div className="min-h-screen w-full bg-transparent text-foreground">
      {/* Public Landing Page - No Sidebar */}
        <div className="flex-1 flex flex-col">
        <header className="fixed top-4 left-4 right-4 h-16 flex items-center justify-between px-6 bg-[#ECF4FF] backdrop-blur-md shadow-xl rounded-2xl border border-blue-200/50 z-50">
          <div className="flex items-center gap-4">
            <img 
              src={OfferloopLogo} 
              alt="Offerloop" 
              className="h-[60px] cursor-pointer"
              onClick={() => navigate("/")}
            />
          </div>
          <nav className="flex items-center gap-6">
            <button
              onClick={() => {
                const element = document.getElementById('features');
                if (element) {
                  element.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
              }}
              className="text-sm font-medium text-slate-700 hover:text-blue-600 transition-colors"
            >
              Features
            </button>
            <button
              onClick={() => {
                const element = document.getElementById('pricing');
                if (element) {
                  element.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
              }}
              className="text-sm font-medium text-slate-700 hover:text-blue-600 transition-colors"
            >
              Pricing
            </button>
            <button
              onClick={() => {
                const element = document.getElementById('about');
                if (element) {
                  element.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
              }}
              className="text-sm font-medium text-slate-700 hover:text-blue-600 transition-colors"
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
              }}
              className="text-sm font-medium text-slate-700 hover:text-blue-600 transition-colors"
            >
              Privacy
            </button>
          </nav>
            <div className="flex items-center gap-4">
            {user ? (
              <button
                onClick={() => navigate("/home")}
                className="btn-secondary-glass px-4 py-2"
              >
                Go to Dashboard
              </button>
            ) : (
              <>
                <button
                  onClick={() => navigate("/signin?mode=signin")}
                  className="btn-secondary-glass px-4 py-2"
                >
                  Sign In
                </button>
                <button
                  onClick={() => navigate("/signin?mode=signup")}
                  className="btn-primary-glass px-4 py-2"
                >
                  Sign Up
                </button>
              </>
            )}
          </div>
        </header>
        
        {/* Spacer to account for fixed header with margin */}
        <div className="h-24"></div>

          <div className="flex-1 relative z-10">

        {/* Hero Section */}
        <section 
          ref={(el) => { sectionRefs.current[0] = el; }}
          className="min-h-screen pt-40 pb-24 relative"
          data-scene="0"
          style={{ overflow: 'clip' }}
        >
          {/* Hero Text - Left-Aligned Linear Style */}
          <div className="max-w-7xl mx-auto px-12 mb-20">
            <div className="max-w-5xl">
              <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold mb-6" style={{ overflow: 'visible', lineHeight: '1.1', letterSpacing: '-0.02em' }}>
                <span className="text-hero-primary tracking-tight">
                  Offerloop is your <span
                    style={{
                      color: '#3B82F6',
                      fontStyle: 'italic',
                    }}
                  >
                    AI co-pilot
                  </span> for competitive recruiting.
              </span>
            </h1>
              <p className="text-lg md:text-xl text-hero-subtitle mb-4 max-w-3xl leading-relaxed">
                Automate research, outreach, and interview prep all in one place.
              </p>
              <p className="text-lg md:text-xl text-hero-subtitle mb-12 max-w-3xl leading-relaxed">
                Work smarter. Network faster. Land better opportunities.
            </p>
            <button
              onClick={() => navigate("/signin?mode=signup")}
              className="btn-primary-glass px-12 py-5 text-lg rounded-2xl pulse-glow inline-flex items-center gap-3"
            >
              Try it out <ArrowRight className="h-5 w-5" />
            </button>
            </div>
            
            {/* 3D Rotating Image */}
            <RotatingImage />
            
            {/* Title section */}
            <div className="text-center mt-8 mb-16" style={{ marginTop: '100px' }}>
              <h2 className="text-3xl md:text-4xl lg:text-5xl xl:text-6xl font-bold mb-3 text-section-heading whitespace-nowrap">
                The Entire Recruiting Process, <span style={{ color: '#3B82F6' }}>Automated</span>
              </h2>
              <p className="text-lg md:text-xl text-section-body max-w-2xl mx-auto">
                Cuts job search time by <strong className="text-red-600 text-xl md:text-2xl">90%</strong>
              </p>
            </div>
          </div>
        </section>

        {/* FeatureCards Section */}
        <section className="py-16 px-6 relative">
          <FeatureCards />
        </section>

          {/* No More Header */}
          <div className="text-center mt-16 mb-8">
            <h2 className="text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-bold text-section-heading flex items-baseline justify-center">
              No More
              <AnimatedDots />
            </h2>
          </div>

          {/* Three Videos Section */}
          <section className="mt-[82px] max-w-5xl mx-auto px-4">
            <div className="flex flex-col gap-6">
              {/* Row 1 - First Video on Left, Text Space on Right */}
              <div className="flex flex-col md:flex-row items-center gap-6">
                <video 
                  src={ScoutAsleep}
                  autoPlay 
                  loop 
                  muted 
                  playsInline
                  className="rounded-3xl shadow-lg w-full md:w-1/2 h-64 md:h-80 object-cover border-8 border-black"
                />
                <div className="w-full md:w-1/2 flex items-center justify-center">
                  <RetriggerableTextType
                    text="Burnout"
                    className="gradient-text-teal text-6xl md:text-7xl lg:text-8xl font-bold"
                  />
                </div>
              </div>
              {/* Row 2 - Text Space on Left, Second Video on Right */}
              <div className="flex flex-col md:flex-row items-center gap-6">
                <div className="w-full md:w-1/2 flex items-center justify-center">
                  <RetriggerableTextType
                    text="Stress"
                    className="gradient-text-teal text-6xl md:text-7xl lg:text-8xl font-bold"
                  />
                </div>
                <video 
                  src={ScaredScout}
                  autoPlay 
                  loop 
                  muted 
                  playsInline
                  className="rounded-3xl shadow-lg w-full md:w-1/2 h-64 md:h-80 object-cover border-8 border-black"
                />
              </div>
              {/* Row 3 - Third Video on Left, Text Space on Right */}
              <div className="flex flex-col md:flex-row items-center gap-6">
                <div className="w-full md:w-1/2 h-64 md:h-80 overflow-hidden rounded-3xl border-8 border-black">
                  <video 
                    src={ScoutGirlSad}
                    autoPlay 
                    loop 
                    muted 
                    playsInline
                    className="w-full h-full object-cover shadow-lg"
                    style={{ transform: 'scale(1.15)', objectPosition: 'center' }}
                  />
                </div>
                <div className="w-full md:w-1/2 flex items-center justify-end md:justify-center">
                  <RetriggerableTextType
                    text="FOMO"
                    className="gradient-text-teal text-6xl md:text-7xl lg:text-8xl font-bold md:ml-[100px]"
                  />
                </div>
              </div>
            </div>
          </section>

        {/* Made for Section */}
        <section className="py-24 px-6 relative overflow-visible">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-16 overflow-visible">
              <AnimatedMadeForText />
            </div>
          </div>
        </section>

        {/* Product Tour Section */}
        <section 
          ref={(el) => { sectionRefs.current[1] = el; }}
          id="features"
          data-scene="1"
          className="relative"
          style={{ marginTop: '-1px' }}
        >
          <ProductTour />
        </section>

        {/* Works With Section */}
        <section>
          {/* Works With Header */}
          <div className="text-center mt-16 mb-8">
            <h2 className="text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-bold text-section-heading">
              Works With
            </h2>
            <p className="text-lg md:text-xl text-section-body max-w-4xl mx-auto mt-6 px-4">
              Our product seamlessly integrates with your existing workflow: connect with professionals on LinkedIn, manage outreach through Gmail or Outlook, organize data in Google Sheets or Excel, schedule meetings via Apple or Google Calendar, and connect on Zoom.
            </p>
          </div>

          {/* Works With Logos - Pyramid Layout */}
          <div className="max-w-6xl mx-auto px-4 mb-16">
            {/* First Row - 5 Logos */}
            <div className="flex flex-wrap justify-center items-center gap-8 md:gap-12 mb-6">
              <img src={LinkedInLogo} alt="LinkedIn" className="h-16 md:h-24 lg:h-28 w-auto object-contain opacity-95 hover:opacity-100 transition-opacity" />
              <img src={GoogleLogo} alt="Google" className="h-16 md:h-24 lg:h-28 w-auto object-contain opacity-95 hover:opacity-100 transition-opacity" />
              <img src={ExcelLogo} alt="Excel" className="h-16 md:h-24 lg:h-28 w-auto object-contain opacity-95 hover:opacity-100 transition-opacity" />
              <img src={OutlookLogo} alt="Outlook" className="h-16 md:h-24 lg:h-28 w-auto object-contain opacity-95 hover:opacity-100 transition-opacity" />
              <img src={ZoomLogo} alt="Zoom" className="h-16 md:h-24 lg:h-28 w-auto object-contain opacity-95 hover:opacity-100 transition-opacity" />
            </div>
            {/* Second Row - 6 Logos */}
            <div className="flex flex-wrap justify-center items-center gap-8 md:gap-12">
              <img src={AppleMailLogo} alt="Apple Mail" className="h-16 md:h-24 lg:h-28 w-auto object-contain opacity-95 hover:opacity-100 transition-opacity" />
              <img src={AppleNumbersLogo} alt="Apple Numbers" className="h-16 md:h-24 lg:h-28 w-auto object-contain opacity-95 hover:opacity-100 transition-opacity" />
              <img src={AppleCalendarLogo} alt="Apple Calendar" className="h-16 md:h-24 lg:h-28 w-auto object-contain opacity-95 hover:opacity-100 transition-opacity" />
              <img src={GoogleCalendarLogo} alt="Google Calendar" className="h-16 md:h-24 lg:h-28 w-auto object-contain opacity-95 hover:opacity-100 transition-opacity" />
              <img src={GmailLogo} alt="Gmail" className="h-16 md:h-24 lg:h-28 w-auto object-contain opacity-95 hover:opacity-100 transition-opacity" />
              <img src={GoogleSheetsLogo} alt="Google Sheets" className="h-16 md:h-24 lg:h-28 w-auto object-contain opacity-95 hover:opacity-100 transition-opacity" />
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
            <h2 className="text-display-lg text-center mb-16 text-section-heading">
              Start <span className="gradient-text-teal">Connecting</span> Today
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
                    '1 Coffee Chat Prep',
                    '1 Interview Prep',
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
                <h2 className="text-4xl font-bold mb-6 text-section-heading">
                  Our <span className="gradient-text-teal">Mission</span>
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
                <h3 className="text-3xl font-bold mb-6 text-section-heading">Our Story</h3>
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
              <div className="md:col-span-2" id="privacy-lock">
                <ExpandablePrivacyLock />
                <div className="flex items-center gap-2 mb-6">
                  <span className="text-2xl font-bold text-section-heading">
                    offer<span className="gradient-text-teal">loop</span>
                  </span>
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
  );
};

export default Index;
