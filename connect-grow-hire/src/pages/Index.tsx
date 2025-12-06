// src/pages/Index.tsx
import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useTheme } from '@/contexts/ThemeContext';
import { Check, ArrowRight, Twitter, Linkedin, Instagram } from 'lucide-react';
import { ExpandablePrivacyLock } from '@/components/ExpandablePrivacyLock';
import { ProductTour } from '@/components/ProductTour';
import CircularGallery from '@/components/CircularGallery';
import DylanRoby from "@/assets/DylanRoby.png";
import SaraUcuzoglu from "@/assets/SaraU.png";
import JacksonLeck from "@/assets/JacksonLeck.png";
import FiveStarReview from "@/assets/5StarReview.png";
import EliHamou from "@/assets/EliHamou.png";
import LucasTurcuato from "@/assets/LucasTurcuato.png";
import Marquee from "react-fast-marquee";
import DynamicBackground from '@/components/background/DynamicBackground';
import { DynamicGradientBackground } from '@/components/background/DynamicGradientBackground';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Logo } from '@/components/Logo';
// TODO: Add your three background images to the assets folder and import them here:
// import cityscapeImage from '@/assets/cityscape.jpg';
// import officeImage from '@/assets/office.jpg';
// import coffeeShopImage from '@/assets/coffee-shop.jpg';

// Company Logos
import GoldmanSachsLogo from "@/assets/GoldmanSachs.png";
import MorganStanleyLogo from "@/assets/MorganStanley.png";
import JPMorganLogo from "@/assets/JPMorgan.png";
import BarclaysLogo from "@/assets/Barclays.png";
import EvercoreLogo from "@/assets/Evercore.png";
import BlackstoneLogo from "@/assets/Blackstone.png";
import PwCLogo from "@/assets/PwC.png";
import McKinseyLogo from "@/assets/McKinsey.png";
import BainLogo from "@/assets/McKinsey.png";

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
  const navigate = useNavigate();
  const { theme } = useTheme();
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
    <div className="min-h-screen text-foreground bg-background transition-colors duration-300">
      {/* ============================================
          Dynamic Gradient Background (Theme-aware)
          ============================================ */}
      <DynamicGradientBackground />
      
      {/* ============================================
          Dynamic Background - Cycles through office, coffee shop, and city
          ============================================ */}
      {backgroundImages.length > 0 && (
        <DynamicBackground 
          images={backgroundImages}
          transitionDuration={8} // Each image displays for 8 seconds
          fadeDuration={2} // 2 second crossfade transition
        />
      )}

      {/* Theme Toggle Button */}
      <ThemeToggle />

      {/* ============================================
          Content Layer
          ============================================ */}
      <div className="relative z-10">
        
        {/* Floating Glass Navigation */}
        <header className="fixed top-4 left-4 right-4 z-50 glass-nav rounded-2xl max-w-7xl mx-auto">
          <div className="px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-8">
              <Logo size="md" />
              <nav className="hidden md:flex items-center gap-6">
                {['Features', 'Pricing', 'Privacy', 'About'].map((item) => {
                  const href = item === 'Privacy' ? '#privacy-lock' : `#${item.toLowerCase()}`;
                  return (
                    <a
                      key={item}
                      href={href}
                      className="text-sm text-gray-300 hover:text-blue-400 transition-colors link-slide"
                    >
                      {item}
                    </a>
                  );
                })}
              </nav>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate("/signin?mode=signin")}
                className="btn-secondary-glass px-4 py-2 text-sm"
              >
                Sign in
              </button>
              <button
                onClick={() => navigate("/signin?mode=signup")}
                className="btn-primary-glass px-4 py-2 text-sm flex items-center gap-2"
              >
                Sign up <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </header>

        {/* Hero Section */}
        <section 
          ref={(el) => { sectionRefs.current[0] = el; }}
          className="min-h-screen pt-40 pb-24 relative"
          data-scene="0"
          style={{ overflow: 'clip' }}
        >
          {/* Hero Text - Full Width Centered */}
          <div className="max-w-7xl mx-auto px-12 text-center mb-20">
            <h1 className="text-hero mb-10 max-w-5xl mx-auto" style={{ overflow: 'visible', lineHeight: '1.2', padding: '0.5rem 1rem' }}>
              <span className="block text-white tracking-tight" style={{ padding: '0.25rem 0.5rem' }}>Recruiting</span>
              <span className="block tracking-tight" style={{ padding: '0.25rem 0.5rem' }}>
                <span className="text-white">On </span>
                <span className="text-autopilot-gradient italic" style={{ padding: '0.125rem 0.5rem', overflow: 'visible', marginRight: '0.25rem' }}>Autopilot</span>
              </span>
            </h1>
            <p className="text-2xl text-gray-300 mb-12 max-w-3xl mx-auto">
              We take the tedious, repetitive work out of recruiting.
            </p>
            <button
              onClick={() => navigate("/signin?mode=signup")}
              className="btn-primary-glass px-12 py-5 text-lg rounded-2xl pulse-glow inline-flex items-center gap-3"
            >
              Try it out <ArrowRight className="h-5 w-5" />
            </button>
            
            {/* CircularGallery Component - 3D circular gallery showing screenshots */}
            <div className="w-screen relative left-1/2 right-1/2 -ml-[50vw] -mr-[50vw] mt-12 overflow-visible" style={{ minHeight: '600px', height: '700px', zIndex: 100, isolation: 'isolate', transform: 'translateZ(0)', willChange: 'transform' }}>
              <CircularGallery
                items={[
                  { image: 'https://picsum.photos/seed/1/800/600', text: 'Screenshot 1' },
                  { image: 'https://picsum.photos/seed/2/800/600', text: 'Screenshot 2' },
                  { image: 'https://picsum.photos/seed/3/800/600', text: 'Screenshot 3' },
                  { image: 'https://picsum.photos/seed/4/800/600', text: 'Screenshot 4' },
                  { image: 'https://picsum.photos/seed/5/800/600', text: 'Screenshot 5' },
                ]}
                bend={3}
                textColor={theme === 'light' ? '#1e293b' : '#ffffff'}
                borderRadius={0.05}
                font="bold 24px sans-serif"
                scrollSpeed={2}
                scrollEase={0.05}
              />
            </div>
            
            {/* Title underneath carousel */}
            <div className="text-center mt-8 mb-16">
              <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-3 text-white dark:text-white text-slate-900 dark:text-white">
                <span className="text-cyan-400 dark:text-cyan-400 text-cyan-600 dark:text-cyan-400">Search</span> to <span className="text-cyan-400 dark:text-cyan-400 text-cyan-600 dark:text-cyan-400">success</span>
              </h2>
              <p className="text-lg md:text-xl text-gray-300 dark:text-gray-300 text-slate-600 dark:text-gray-300 max-w-2xl mx-auto">
                We guide you <span className="text-cyan-400 dark:text-cyan-400 text-cyan-600 dark:text-cyan-400">every step</span>
              </p>
            </div>
          </div>


        </section>

        {/* Product Tour Section */}
        <section 
          ref={(el) => { sectionRefs.current[1] = el; }}
          data-scene="1"
          className="relative"
          style={{ marginTop: '-1px' }}
        >
          <ProductTour />
        </section>

        {/* Testimonials Section */}
        <section 
          ref={(el) => { sectionRefs.current[3] = el; }}
          className="py-24 px-6 overflow-hidden relative"
          data-scene="3"
          style={{ marginTop: '-1px' }}
        >
          <div className="max-w-full mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-display-lg mb-4 text-white dark:text-white text-slate-900 dark:text-white">
                Hear from our <span className="gradient-text-teal">Real Customers</span>
              </h2>
              <p className="text-xl text-gray-400 dark:text-gray-400 text-slate-600 dark:text-gray-400">
                Used by hundreds of students across the country with offers received from top tier firms
              </p>
            </div>

            {/* Company Logos */}
            <div className="mb-16">
              <Marquee 
                gradient={true} 
                gradientColor="hsl(var(--background))" 
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
              gradientColor="hsl(var(--background))" 
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
                // All testimonials use the same blue color scheme
                const color = { light: 'rgba(59, 130, 246, 0.08)', border: 'rgba(59, 130, 246, 0.25)', class: 'testimonial-blue' };
                return (
                <div 
                  key={name} 
                  className={`glass-card rounded-2xl p-8 mx-4 w-[420px] h-[380px] flex flex-col justify-between relative overflow-hidden ${theme === 'light' ? color.class : ''}`}
                  style={{
                    borderColor: theme === 'light' ? color.border : 'var(--glass-border)',
                  }}
                >
                  {/* Color accent overlay for light mode */}
                  {theme === 'light' && (
                    <div 
                      className="absolute inset-0 pointer-events-none rounded-2xl"
                      style={{
                        background: `linear-gradient(135deg, ${color.light} 0%, transparent 50%)`,
                      }}
                    />
                  )}
                  <div className="relative z-10 flex flex-col h-full">
                    <div className="flex-1">
                      <img src={FiveStarReview} alt="5 star rating" className="w-24 mb-4" />
                      <p className="text-gray-300 dark:text-gray-300 text-slate-700 dark:text-gray-300 italic text-lg leading-relaxed">"{quote}"</p>
                    </div>
                    <div className="flex items-center gap-4 mt-auto pt-6">
                      <img 
                        src={img} 
                        alt={name} 
                        className="w-14 h-14 rounded-full object-cover border"
                        style={{
                          borderColor: theme === 'light' ? color.border : 'rgba(59, 130, 246, 0.3)',
                        }}
                      />
                      <div>
                        <div className="font-semibold text-white dark:text-white text-slate-900 dark:text-white">{name}</div>
                        <div className="text-sm text-gray-400 dark:text-gray-400 text-slate-600 dark:text-gray-400">{role}</div>
                      </div>
                    </div>
                  </div>
                </div>
                );
              })}
            </Marquee>
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
          <div className="max-w-5xl mx-auto">
            <h2 className="text-display-lg text-center mb-16 text-white dark:text-white text-slate-900 dark:text-white">
              Start <span className="gradient-text-teal">Connecting</span> Today
            </h2>

            <div className="grid md:grid-cols-2 gap-8">
              {/* Free Plan */}
              <div className="glass-card p-8 rounded-3xl">
                <div className="mb-6">
                  <h3 className="text-2xl font-bold text-white dark:text-white text-slate-900 dark:text-white">Free</h3>
                  <p className="text-gray-400 dark:text-gray-400 text-slate-600 dark:text-gray-400">Try out platform risk free</p>
                </div>
                <div className="space-y-3 mb-8">
                  {[
                    '150 credits (10 emails)',
                    'Estimated time saved: 250 minutes',
                    'Try out platform risk free',
                    'Limited Features'
                  ].map((item) => (
                    <div key={item} className="flex items-center gap-3">
                      <Check className="h-5 w-5 text-blue-400 dark:text-blue-400 text-blue-600 dark:text-blue-400" />
                      <span className="text-gray-300 dark:text-gray-300 text-slate-700 dark:text-gray-300">{item}</span>
                    </div>
                  ))}
                </div>
                <button 
                  onClick={() => navigate("/signin?mode=signup")}
                  className="btn-secondary-glass w-full py-4"
                >
                  Start for free
                </button>
              </div>

              {/* Pro Plan */}
              <div className="relative">
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 bg-gradient-to-r from-blue-500 to-cyan-500 dark:from-blue-500 dark:to-cyan-500 rounded-full text-xs font-semibold text-white z-10">
                  RECOMMENDED
                </div>
                <div className="glass-card p-8 rounded-3xl border-blue-500/30 dark:border-blue-500/30 border-blue-300/50 dark:border-blue-500/30 glow-teal">
                  <div className="mb-6">
                    <h3 className="text-2xl font-bold text-white dark:text-white text-slate-900 dark:text-white">Pro</h3>
                    <div className="flex items-baseline gap-2">
                      <span className="text-gray-500 dark:text-gray-500 text-slate-500 dark:text-gray-500 line-through">$34.99</span>
                      <span className="text-3xl font-bold text-blue-400 dark:text-blue-400 text-blue-600 dark:text-blue-400">$8.99</span>
                      <span className="text-gray-400 dark:text-gray-400 text-slate-600 dark:text-gray-400">/month</span>
                    </div>
                    <p className="text-gray-400 dark:text-gray-400 text-slate-600 dark:text-gray-400">1800 credits</p>
                  </div>
                  <div className="space-y-3 mb-8">
                    {[
                      '1800 credits (120 emails)',
                      'Estimated time saved: 2500 minutes',
                      'Everything in free plus:',
                      'Directory permanently saves',
                      'Priority Support',
                      'Advanced features'
                    ].map((item) => (
                      <div key={item} className="flex items-center gap-3">
                        <Check className="h-5 w-5 text-blue-400 dark:text-blue-400 text-blue-600 dark:text-blue-400" />
                        <span className="text-gray-300 dark:text-gray-300 text-slate-700 dark:text-gray-300">{item}</span>
                      </div>
                    ))}
                  </div>
                  <button 
                    onClick={() => navigate("/signin?mode=signup")}
                    className="btn-primary-glass w-full py-4"
                  >
                    Start now
                  </button>
                </div>
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
                <h2 className="text-4xl font-bold mb-6 text-white dark:text-white text-slate-900 dark:text-white">
                  Our <span className="gradient-text-teal">Mission</span>
                </h2>
                <p className="text-lg text-gray-300 dark:text-gray-300 text-slate-700 dark:text-gray-300 leading-relaxed mb-6">
                  To make it easier for students and young professionals to connect, stand out and land better opportunities.
                </p>
                <p className="text-gray-400 dark:text-gray-400 text-slate-600 dark:text-gray-400 leading-relaxed">
                  By cutting down the time to send emails and prep for calls by 90%, we save our users hundreds of hours of work and stress, giving them back time to focus on what matters: learning, growing and enjoying your best years.
                </p>
              </div>

              {/* Story */}
              <div className="glass-card p-10 rounded-3xl">
                <h3 className="text-3xl font-bold mb-6 text-white dark:text-white text-slate-900 dark:text-white">Our Story</h3>
                <div className="space-y-4 text-gray-300 dark:text-gray-300 text-slate-700 dark:text-gray-300 leading-relaxed">
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
        <footer className="py-16 px-6 border-t border-white/5 dark:border-white/5 border-slate-300/20 dark:border-white/5">
          <div className="max-w-7xl mx-auto">
            <div className="grid md:grid-cols-4 gap-8 mb-12">
              <div className="md:col-span-2" id="privacy-lock">
                <ExpandablePrivacyLock />
                <div className="flex items-center gap-2 mb-6">
                  <span className="text-2xl font-bold text-white dark:text-white text-slate-900 dark:text-white">
                    offer<span className="gradient-text-teal">loop</span>
                  </span>
                </div>
                <p className="text-gray-400 dark:text-gray-400 text-slate-600 dark:text-gray-400 mb-6 max-w-md">
                  Fundamentally changing how you recruit by taking the tedious, repetitive work out of the process. Connect with professionals and build the career you're excited about.
                </p>
                <div>
                  <h4 className="font-semibold text-white dark:text-white text-slate-900 dark:text-white mb-3">Follow Us</h4>
                  <div className="flex gap-4">
                    <a 
                      href="https://twitter.com/offerloop" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="w-10 h-10 glass-card-light rounded-lg flex items-center justify-center hover:bg-blue-500/10 hover:border-blue-400/30 transition-all group"
                    >
                      <Twitter className="h-4 w-4 text-gray-400 dark:text-gray-400 text-slate-600 dark:text-gray-400 group-hover:text-blue-400 transition-colors" />
                    </a>
                    <a 
                      href="https://linkedin.com/company/offerloop-ai" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="w-10 h-10 glass-card-light rounded-lg flex items-center justify-center hover:bg-blue-500/10 hover:border-blue-400/30 transition-all group"
                    >
                      <Linkedin className="h-4 w-4 text-gray-400 dark:text-gray-400 text-slate-600 dark:text-gray-400 group-hover:text-blue-400 transition-colors" />
                    </a>
                    <a 
                      href="https://instagram.com/offerloop.ai" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="w-10 h-10 glass-card-light rounded-lg flex items-center justify-center hover:bg-blue-500/10 hover:border-blue-400/30 transition-all group"
                    >
                      <Instagram className="h-4 w-4 text-gray-400 dark:text-gray-400 text-slate-600 dark:text-gray-400 group-hover:text-blue-400 transition-colors" />
                    </a>
                  </div>
                </div>
              </div>

              <div className="pt-16">
                <h3 className="font-semibold text-white dark:text-white text-slate-900 dark:text-white mb-4">Company</h3>
                <ul className="space-y-2">
                  <li>
                    <Link to="/about" className="text-gray-400 dark:text-gray-400 text-slate-600 dark:text-gray-400 hover:text-blue-400 transition-colors text-sm link-slide">About Us</Link>
                  </li>
                </ul>
              </div>

              <div className="pt-16">
                <h3 className="font-semibold text-white dark:text-white text-slate-900 dark:text-white mb-4">Support</h3>
                <ul className="space-y-2">
                  <li>
                    <Link to="/contact-us" className="text-gray-400 dark:text-gray-400 text-slate-600 dark:text-gray-400 hover:text-blue-400 transition-colors text-sm link-slide">Contact Us</Link>
                  </li>
                  <li>
                    <Link to="/contact-us" className="text-gray-400 dark:text-gray-400 text-slate-600 dark:text-gray-400 hover:text-blue-400 transition-colors text-sm link-slide">Help Center</Link>
                  </li>
                  <li>
                    <Link to="/privacy" className="text-gray-400 dark:text-gray-400 text-slate-600 dark:text-gray-400 hover:text-blue-400 transition-colors text-sm link-slide">Privacy Policy</Link>
                  </li>
                  <li>
                    <Link to="/terms-of-service" className="text-gray-400 dark:text-gray-400 text-slate-600 dark:text-gray-400 hover:text-blue-400 transition-colors text-sm link-slide">Terms of Service</Link>
                  </li>
                </ul>
              </div>
            </div>

            <p className="text-center text-gray-500 dark:text-gray-500 text-slate-500 dark:text-gray-500 text-sm">
              © 2025 offerloop. All rights reserved. Connecting talent with opportunity through intelligent recruiting solutions.
            </p>
          </div>
        </footer>

      </div>
    </div>
  );
};

export default Index;
