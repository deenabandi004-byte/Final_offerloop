// src/pages/Index.tsx
import { useState, useEffect, useRef } from 'react';
import { Helmet } from 'react-helmet-async';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowRight, Menu, X, ChevronDown } from 'lucide-react';
import { useFirebaseAuth } from "../contexts/FirebaseAuthContext";
import OfferloopLogo from '@/assets/offerloop_logo2.png';
import ChromeExtensionPic from '@/assets/Chrome_extensionpic.png';
import GoogleLogo from '@/assets/Googlelogo.png';
import HowItWorksVideo from '@/assets/ChatGPT of Email Outreach.mp4';
import FindCompanyImg from '@/assets/findcompanylandingpage.png';
import FindHiringManagerImg from '@/assets/findhiringmanagerlandingpage.png';
import EmailOutreachImg from '@/assets/emailoutreach.png.png';
import CoffeeChatImg from '@/assets/coffeechatlandingpage.png';

const CHROME_EXTENSION_URL = 'https://chromewebstore.google.com/detail/offerloop/aabnjgecmobcnnhkilbeocggbmgilpcl';

const RULED_LINES = 'repeating-linear-gradient(to bottom, transparent, transparent 27px, rgba(37,99,235,.04) 27px, rgba(37,99,235,.04) 28px)';

const Index = () => {
  const navigate = useNavigate();
  const { user } = useFirebaseAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [navbarScrolled, setNavbarScrolled] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [konamiActivated, setKonamiActivated] = useState(false);
  const [resourcesOpen, setResourcesOpen] = useState(false);
  const [currentChapter, setCurrentChapter] = useState('Preface');
  const heroRef = useRef<HTMLDivElement>(null);
  const dashboardRef = useRef<HTMLDivElement>(null);
  const statsRef = useRef<HTMLDivElement>(null);
  const statsAnimated = useRef(false);
  const [animatedStats, setAnimatedStats] = useState({ contacts: 0, rate: 0, students: 0, prep: 0 });

  // Navbar scroll behavior, scroll progress, back to top, and chapter tracking
  useEffect(() => {
    const handleScroll = () => {
      setNavbarScrolled(window.scrollY > 50);
      setShowBackToTop(window.scrollY > 600);

      const totalHeight = document.documentElement.scrollHeight - window.innerHeight;
      const progress = (window.scrollY / totalHeight) * 100;
      setScrollProgress(progress);

      // Chapter tracking
      const sections = [
        { id: 'how-it-works', label: 'Chapter I \u00b7 How It Works' },
        { id: 'comparison', label: 'Chapter II \u00b7 The Difference' },
        { id: 'features', label: 'Chapter III \u00b7 Five Tools' },
        { id: 'testimonials', label: 'Chapter IV \u00b7 Reviews' },
      ];
      let chapter = 'Preface';
      for (const s of sections) {
        const el = document.getElementById(s.id);
        if (el) {
          const rect = el.getBoundingClientRect();
          if (rect.top <= 120) chapter = s.label;
        }
      }
      setCurrentChapter(chapter);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Hero 3D tilt effect
  useEffect(() => {
    if (!dashboardRef.current || window.innerWidth <= 900) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!heroRef.current || !dashboardRef.current) return;
      const rect = heroRef.current.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width - 0.5;
      const y = (e.clientY - rect.top) / rect.height - 0.5;

      const productElement = dashboardRef.current.querySelector('.hero-product') as HTMLElement;
      if (productElement) {
        productElement.style.transform = `rotateY(${x * 3}deg) rotateX(${-y * 2}deg)`;
      }
    };

    const handleMouseLeave = () => {
      if (dashboardRef.current) {
        const productElement = dashboardRef.current.querySelector('.hero-product') as HTMLElement;
        if (productElement) {
          productElement.style.transform = 'rotateY(0deg) rotateX(0deg)';
        }
      }
    };

    const hero = heroRef.current;
    if (hero) {
      hero.addEventListener('mousemove', handleMouseMove);
      hero.addEventListener('mouseleave', handleMouseLeave);
      return () => {
        hero.removeEventListener('mousemove', handleMouseMove);
        hero.removeEventListener('mouseleave', handleMouseLeave);
      };
    }
  }, []);

  // Scroll reveal animations
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
          }
        });
      },
      { threshold: 0.1, rootMargin: '0px 0px -30px 0px' }
    );

    const elements = document.querySelectorAll('.reveal');
    elements.forEach((el) => observer.observe(el));

    return () => {
      elements.forEach((el) => observer.unobserve(el));
    };
  }, []);

  // Konami code easter egg
  useEffect(() => {
    const konamiCode = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'KeyB', 'KeyA'];
    let konamiIndex = 0;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === konamiCode[konamiIndex]) {
        konamiIndex++;
        if (konamiIndex === konamiCode.length) {
          setKonamiActivated(true);
          konamiIndex = 0;
          setTimeout(() => setKonamiActivated(false), 3000);
        }
      } else {
        konamiIndex = 0;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Stats counter animation
  useEffect(() => {
    if (!statsRef.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !statsAnimated.current) {
          statsAnimated.current = true;
          const duration = 1600;
          const targets = { contacts: 2.2, rate: 38, students: 2400, prep: 30 };
          const start = performance.now();
          const ease = (t: number) => 1 - Math.pow(1 - t, 3);
          const tick = (now: number) => {
            const elapsed = Math.min((now - start) / duration, 1);
            const e = ease(elapsed);
            setAnimatedStats({
              contacts: parseFloat((e * targets.contacts).toFixed(1)),
              rate: Math.round(e * targets.rate),
              students: Math.round(e * targets.students),
              prep: Math.round(e * targets.prep),
            });
            if (elapsed < 1) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        }
      },
      { threshold: 0.3 }
    );
    observer.observe(statsRef.current);
    return () => observer.disconnect();
  }, []);

  const scrollToFeatures = () => {
    const element = document.getElementById('features');
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) element.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="min-h-screen w-full" style={{ fontFamily: "'Inter', sans-serif", background: '#FFFFFF' }}>
      <Helmet>
        <title>Offerloop — AI Networking for College Students | Find, Reach & Track Professionals</title>
        <meta name="description" content="Offerloop helps college students find professionals, generate personalized cold emails, and track networking conversations. Search 2.2B verified contacts. Built for consulting, IB, and tech recruiting." />
        <link rel="canonical" href="https://offerloop.ai/" />
        <meta property="og:title" content="Offerloop — AI Networking for College Students" />
        <meta property="og:description" content="Search 2.2B verified contacts, generate AI-personalized outreach emails, and track your networking pipeline. Free to start." />
        <meta property="og:url" content="https://offerloop.ai/" />
        <meta property="og:type" content="website" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,600;0,700;1,400;1,600&family=Inter:wght@400;500;600&display=swap" rel="stylesheet" />
        <script type="application/ld+json">{JSON.stringify({
          "@context": "https://schema.org",
          "@type": "FAQPage",
          "mainEntity": [
            {
              "@type": "Question",
              "name": "How do I write a coffee chat email to someone I've never met?",
              "acceptedAnswer": {
                "@type": "Answer",
                "text": "A strong coffee chat email should be concise (3-5 sentences), mention a specific reason you're reaching out to that person, and propose a clear ask like a 15-minute virtual call. Personalization is critical — reference their career path, a recent project, or a shared alma mater. Offerloop uses AI to draft personalized coffee chat requests by pulling context from a contact's background, saving hours of manual research and writing."
              }
            },
            {
              "@type": "Question",
              "name": "What should I include in a cold email to a consultant at McKinsey, BCG, or Bain?",
              "acceptedAnswer": {
                "@type": "Answer",
                "text": "Your cold email to an MBB consultant should include a brief introduction (school, year, relevant interest), one specific reason you're reaching out to them personally, and a low-commitment ask such as a 15-minute call. Avoid generic flattery and instead reference something concrete like their office location, practice area, or a published insight. Offerloop's AI email writer generates personalized consulting outreach emails by analyzing each contact's firm, role, and background from its 2.2 billion contact database."
              }
            },
            {
              "@type": "Question",
              "name": "How do I cold email investment banking analysts and associates for networking?",
              "acceptedAnswer": {
                "@type": "Answer",
                "text": "When cold emailing IB professionals, keep your message under 100 words, lead with a shared connection point (alma mater, hometown, or mutual contact), and ask for a brief phone call rather than an in-person meeting. A subject line like 'Fellow [University] Student — Quick Question on [Group Name]' tends to perform well. Offerloop helps students find verified emails of bankers across bulge brackets and elite boutiques while generating tailored outreach."
              }
            },
            {
              "@type": "Question",
              "name": "How can I find the professional email address of someone I want to network with?",
              "acceptedAnswer": {
                "@type": "Answer",
                "text": "Professional email addresses can often be found through company email pattern recognition, LinkedIn profile clues, or dedicated lookup tools. Offerloop provides access to a database of over 2.2 billion verified contacts, allowing college students to instantly find professional email addresses for alumni, recruiters, and industry professionals without needing multiple free tools."
              }
            },
            {
              "@type": "Question",
              "name": "How do I reach out to alumni from my university for career advice?",
              "acceptedAnswer": {
                "@type": "Answer",
                "text": "Start by identifying alumni in your target industry through your university's alumni directory, LinkedIn, or a networking platform. Your outreach should mention your shared school, express genuine curiosity about their career path, and request a specific time commitment like a 15-minute call. Offerloop lets students search for alumni by university, company, and role, then auto-generates personalized emails sent directly through Gmail with conversation tracking built in."
              }
            },
            {
              "@type": "Question",
              "name": "What's the best strategy for networking to land an internship as a college freshman or sophomore?",
              "acceptedAnswer": {
                "@type": "Answer",
                "text": "Start early by building relationships before recruiting season — reach out to upperclassmen, recent alumni, and professionals in your target industry 3-6 months before application deadlines. Focus on learning rather than asking for referrals in your initial conversations, and aim to build a network of 15-20 meaningful contacts in your target field. Offerloop removes the biggest barriers to networking — finding contacts, writing compelling emails, and staying organized."
              }
            },
            {
              "@type": "Question",
              "name": "Is there a better alternative to LinkedIn for college students trying to network?",
              "acceptedAnswer": {
                "@type": "Answer",
                "text": "LinkedIn is useful for browsing profiles, but it wasn't designed for proactive outreach — students often hit connection request limits, get ignored in DMs, and lack access to direct email addresses. Offerloop is designed as a LinkedIn alternative for students, combining a 2.2 billion contact database with AI-powered email generation and Gmail integration so students can move beyond passive profile browsing into active, measurable networking."
              }
            },
            {
              "@type": "Question",
              "name": "What's a good networking email template for college students?",
              "acceptedAnswer": {
                "@type": "Answer",
                "text": "A strong networking template has four parts: a personalized opening line (shared school, mutual connection, or specific interest in their work), one sentence about you, a clear and low-commitment ask (15-minute call), and a gracious close. Offerloop's AI generates unique emails for each contact by analyzing their professional background — the efficiency of a template with the authenticity of a hand-written message."
              }
            },
            {
              "@type": "Question",
              "name": "Is offerloop.ai a personal email domain?",
              "acceptedAnswer": {
                "@type": "Answer",
                "text": "No — offerloop.ai is not a personal email service. Offerloop is an AI-powered networking platform for college students. It helps students find professional contacts, generate personalized outreach emails, and track their networking pipeline for recruiting in consulting, investment banking, and tech."
              }
            }
          ]
        })}</script>
      </Helmet>

      {/* Book spine */}
      <div style={{ position: 'fixed', left: 0, top: 0, bottom: 0, width: 4, background: 'linear-gradient(to bottom, #2563EB, #60A5FA, #2563EB)', zIndex: 200, opacity: 0.35, pointerEvents: 'none' }} />

      {/* Reading progress bar */}
      <div style={{ position: 'fixed', top: 64, left: 0, right: 0, height: 2, background: '#EEF2F8', zIndex: 101 }}>
        <div style={{ height: '100%', background: 'linear-gradient(90deg, #2563EB, #60A5FA)', width: `${scrollProgress}%`, transition: 'width .1s linear' }} />
      </div>

      {/* Konami Code Confetti */}
      {konamiActivated && (
        <>
          {[...Array(50)].map((_, i) => (
            <div
              key={i}
              className="confetti"
              style={{
                left: `${Math.random() * 100}vw`,
                backgroundColor: ['#2563EB', '#3B82F6', '#60A5FA', '#93C5FD', '#DBEAFE'][Math.floor(Math.random() * 5)],
                animationDelay: `${Math.random() * 0.5}s`,
                borderRadius: Math.random() > 0.5 ? '50%' : '0',
              }}
            />
          ))}
        </>
      )}

      {/* NAVBAR — centered pill with running header */}
      <div className="fixed top-0 left-0 right-0 z-50 flex justify-center" style={{ padding: '12px 24px 8px' }}>
        <header
          className="flex items-center justify-between w-full h-12 px-5 md:px-6"
          style={{
            maxWidth: '860px',
            width: '100%',
            boxSizing: 'border-box',
            marginBottom: '4px',
            background: navbarScrolled ? 'rgba(255,255,255,0.96)' : 'rgba(255,255,255,0.88)',
            backdropFilter: 'blur(16px) saturate(1.4)',
            WebkitBackdropFilter: 'blur(16px) saturate(1.4)',
            border: '1px solid rgba(37,99,235,0.1)',
            borderRadius: '100px',
            boxShadow: navbarScrolled ? '0 2px 16px rgba(37,99,235,0.08)' : '0 1px 8px rgba(0,0,0,0.03)',
            transition: 'all 0.3s ease',
            overflow: 'visible',
          }}
        >
          <div className="flex items-center">
            <img
              src={OfferloopLogo}
              alt="Offerloop"
              className="h-[44px] cursor-pointer logo-animate"
              onClick={() => navigate('/')}
            />
          </div>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-5" style={{ flexShrink: 1, minWidth: 0 }}>
            <button onClick={scrollToFeatures} className="nav-link text-sm relative" style={{ color: '#4A5E80', fontFamily: "'Lora', Georgia, serif", fontStyle: 'italic', fontWeight: 600 }}>
              Features
            </button>
            <button onClick={() => scrollToSection('extension')} className="nav-link text-sm relative" style={{ color: '#4A5E80', fontFamily: "'Lora', Georgia, serif", fontStyle: 'italic', fontWeight: 600 }}>
              Extension
            </button>
            <button onClick={() => scrollToSection('testimonials')} className="nav-link text-sm relative" style={{ color: '#4A5E80', fontFamily: "'Lora', Georgia, serif", fontStyle: 'italic', fontWeight: 600 }}>
              Reviews
            </button>
            <div className="relative" onMouseEnter={() => setResourcesOpen(true)} onMouseLeave={() => setResourcesOpen(false)}>
              <button className="nav-link text-sm relative flex items-center gap-1" style={{ color: '#4A5E80', fontFamily: "'Lora', Georgia, serif", fontStyle: 'italic', fontWeight: 600 }}>
                Resources <ChevronDown className="h-3.5 w-3.5" style={{ opacity: 0.6 }} />
              </button>
              {resourcesOpen && (
                <div className="absolute top-full left-1/2 pt-2" style={{ transform: 'translateX(-50%)' }}>
                  <div className="flex flex-col py-2" style={{ background: 'rgba(255,255,255,0.98)', border: '1px solid rgba(37,99,235,0.1)', boxShadow: '0 4px 24px rgba(37,99,235,0.08)', backdropFilter: 'blur(16px)', minWidth: '220px', borderRadius: 3, maxHeight: '70vh', overflowY: 'auto' }}>
                    {/* Guides */}
                    <p className="px-4 pt-1 pb-1.5 text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#94A3B8' }}>Guides</p>
                    {[
                      { to: '/networking/goldman-sachs', label: 'Networking: Goldman Sachs' },
                      { to: '/networking/mckinsey', label: 'Networking: McKinsey' },
                      { to: '/networking/google', label: 'Networking: Google' },
                      { to: '/coffee-chat/bain', label: 'Coffee Chat: Bain' },
                      { to: '/coffee-chat/morgan-stanley', label: 'Coffee Chat: Morgan Stanley' },
                      { to: '/cold-email/investment-banking', label: 'Cold Email: Investment Banking' },
                      { to: '/cold-email/tech', label: 'Cold Email: Tech' },
                    ].map((item) => (
                      <a key={item.to} href={item.to} target="_blank" rel="noopener noreferrer" className="px-4 py-1.5 text-sm font-medium hover:bg-gray-50 transition-colors" style={{ color: '#4A5E80', fontFamily: "'Lora', Georgia, serif", fontStyle: 'italic', textDecoration: 'none' }}>
                        {item.label}
                      </a>
                    ))}
                    {/* Divider */}
                    <div className="mx-3 my-2" style={{ borderTop: '1px solid rgba(37,99,235,0.08)' }} />
                    {/* Alumni */}
                    <p className="px-4 pt-0.5 pb-1.5 text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#94A3B8' }}>Alumni</p>
                    {[
                      { to: '/alumni/stanford', label: 'Stanford' },
                      { to: '/alumni/usc', label: 'USC' },
                      { to: '/alumni/berkeley', label: 'UC Berkeley' },
                      { to: '/alumni/ucla', label: 'UCLA' },
                      { to: '/alumni/ucsd', label: 'UC San Diego' },
                      { to: '/alumni/ucdavis', label: 'UC Davis' },
                      { to: '/alumni/ucsb', label: 'UC Santa Barbara' },
                      { to: '/alumni/uci', label: 'UC Irvine' },
                      { to: '/alumni/ucr', label: 'UC Riverside' },
                      { to: '/alumni/uc-santa-cruz', label: 'UC Santa Cruz' },
                      { to: '/alumni/uc-merced', label: 'UC Merced' },
                      { to: '/alumni/harvard', label: 'Harvard' },
                      { to: '/alumni/nyu', label: 'NYU' },
                      { to: '/alumni/michigan', label: 'University of Michigan' },
                      { to: '/alumni/georgetown', label: 'Georgetown' },
                      { to: '/alumni/upenn', label: 'UPenn' },
                      { to: '/alumni/notre-dame', label: 'Notre Dame' },
                      { to: '/alumni/duke', label: 'Duke' },
                      { to: '/alumni/northwestern', label: 'Northwestern' },
                    ].map((item) => (
                      <a key={item.to} href={item.to} target="_blank" rel="noopener noreferrer" className="px-4 py-1.5 text-sm font-medium hover:bg-gray-50 transition-colors" style={{ color: '#4A5E80', fontFamily: "'Lora', Georgia, serif", fontStyle: 'italic', textDecoration: 'none' }}>
                        {item.label}
                      </a>
                    ))}
                    {/* Divider */}
                    <div className="mx-3 my-2" style={{ borderTop: '1px solid rgba(37,99,235,0.08)' }} />
                    {/* Compare */}
                    <p className="px-4 pt-0.5 pb-1.5 text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#94A3B8' }}>Compare</p>
                    {[
                      { to: '/compare/handshake', label: 'Compare: vs Handshake' },
                      { to: '/compare/linkedin', label: 'Compare: vs LinkedIn' },
                    ].map((item) => (
                      <a key={item.to} href={item.to} target="_blank" rel="noopener noreferrer" className="px-4 py-1.5 text-sm font-medium hover:bg-gray-50 transition-colors" style={{ color: '#4A5E80', fontFamily: "'Lora', Georgia, serif", fontStyle: 'italic', textDecoration: 'none' }}>
                        {item.label}
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </nav>

          {/* Desktop CTA */}
          <div className="hidden md:flex items-center gap-3" style={{ flexShrink: 0 }}>
            {user ? (
              <button onClick={() => navigate('/find')} className="btn-ghost" style={{ fontSize: '13px', fontWeight: 700, padding: '8px 16px' }}>
                Find people
              </button>
            ) : (
              <>
                <button
                  onClick={() => navigate('/signin?mode=signin')}
                  style={{ background: 'transparent', color: '#0F172A', fontSize: '13px', fontWeight: 600, fontFamily: "'Lora', serif", fontStyle: 'italic', padding: '8px 20px', borderRadius: '100px', border: '1px solid rgba(37,99,235,0.2)', cursor: 'pointer', transition: 'all 0.15s ease' }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(0,0,0,0.03)'; e.currentTarget.style.borderColor = 'rgba(37,99,235,0.35)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'rgba(37,99,235,0.2)'; }}
                >
                  Sign in
                </button>
                <button
                  onClick={() => navigate('/signin?mode=signup')}
                  style={{ background: '#2563EB', color: '#fff', fontSize: '13px', fontWeight: 600, fontFamily: "'Lora', serif", fontStyle: 'italic', padding: '8px 20px', borderRadius: '3px', border: 'none', cursor: 'pointer', transition: 'background 0.15s ease', flexShrink: 0, whiteSpace: 'nowrap' }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = '#1D4ED8'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = '#2563EB'; }}
                >
                  Create account
                </button>
              </>
            )}
          </div>

          {/* Mobile Menu Button */}
          <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="md:hidden p-2" style={{ color: '#4A5E80' }}>
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </header>
      </div>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="fixed top-[72px] left-4 right-4 md:hidden z-40" style={{ background: 'rgba(255,255,255,0.98)', border: '1px solid rgba(37,99,235,0.1)', borderRadius: '16px', boxShadow: '0 4px 24px rgba(37,99,235,0.08)', backdropFilter: 'blur(16px)' }}>
          <nav className="flex flex-col p-3 gap-1">
            <button onClick={() => { scrollToFeatures(); setMobileMenuOpen(false); }} className="text-left px-4 py-3 text-sm font-medium rounded-lg hover:bg-gray-50" style={{ color: '#4A5E80', fontFamily: "'Lora', serif", fontStyle: 'italic' }}>Features</button>
            <button onClick={() => { scrollToSection('extension'); setMobileMenuOpen(false); }} className="text-left px-4 py-3 text-sm font-medium rounded-lg hover:bg-gray-50" style={{ color: '#4A5E80', fontFamily: "'Lora', serif", fontStyle: 'italic' }}>Extension</button>
            <button onClick={() => { scrollToSection('testimonials'); setMobileMenuOpen(false); }} className="text-left px-4 py-3 text-sm font-medium rounded-lg hover:bg-gray-50" style={{ color: '#4A5E80', fontFamily: "'Lora', serif", fontStyle: 'italic' }}>Reviews</button>
            <div className="border-t mt-1 pt-1" style={{ borderColor: 'rgba(37,99,235,0.08)' }}>
              {/* Guides */}
              <p className="px-4 py-2 text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#94A3B8' }}>Guides</p>
              {[
                { to: '/networking/goldman-sachs', label: 'Networking: Goldman Sachs' },
                { to: '/networking/mckinsey', label: 'Networking: McKinsey' },
                { to: '/networking/google', label: 'Networking: Google' },
                { to: '/coffee-chat/bain', label: 'Coffee Chat: Bain' },
                { to: '/coffee-chat/morgan-stanley', label: 'Coffee Chat: Morgan Stanley' },
                { to: '/cold-email/investment-banking', label: 'Cold Email: Investment Banking' },
                { to: '/cold-email/tech', label: 'Cold Email: Tech' },
              ].map((item) => (
                <a key={item.to} href={item.to} target="_blank" rel="noopener noreferrer" className="block text-left px-4 py-2.5 text-sm font-medium rounded-lg hover:bg-gray-50" style={{ color: '#4A5E80', fontFamily: "'Lora', serif", fontStyle: 'italic', textDecoration: 'none' }}>
                  {item.label}
                </a>
              ))}
              {/* Divider */}
              <div className="mx-3 my-2" style={{ borderTop: '1px solid rgba(37,99,235,0.08)' }} />
              {/* Alumni */}
              <p className="px-4 py-2 text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#94A3B8' }}>Alumni</p>
              {[
                { to: '/alumni/stanford', label: 'Stanford' },
                { to: '/alumni/usc', label: 'USC' },
                { to: '/alumni/berkeley', label: 'UC Berkeley' },
                { to: '/alumni/ucla', label: 'UCLA' },
                { to: '/alumni/ucsd', label: 'UC San Diego' },
                { to: '/alumni/ucdavis', label: 'UC Davis' },
                { to: '/alumni/ucsb', label: 'UC Santa Barbara' },
                { to: '/alumni/uci', label: 'UC Irvine' },
                { to: '/alumni/ucr', label: 'UC Riverside' },
                { to: '/alumni/uc-santa-cruz', label: 'UC Santa Cruz' },
                { to: '/alumni/uc-merced', label: 'UC Merced' },
                { to: '/alumni/harvard', label: 'Harvard' },
                { to: '/alumni/nyu', label: 'NYU' },
                { to: '/alumni/michigan', label: 'University of Michigan' },
                { to: '/alumni/georgetown', label: 'Georgetown' },
                { to: '/alumni/upenn', label: 'UPenn' },
                { to: '/alumni/notre-dame', label: 'Notre Dame' },
                { to: '/alumni/duke', label: 'Duke' },
                { to: '/alumni/northwestern', label: 'Northwestern' },
              ].map((item) => (
                <a key={item.to} href={item.to} target="_blank" rel="noopener noreferrer" className="block text-left px-4 py-2.5 text-sm font-medium rounded-lg hover:bg-gray-50" style={{ color: '#4A5E80', fontFamily: "'Lora', serif", fontStyle: 'italic', textDecoration: 'none' }}>
                  {item.label}
                </a>
              ))}
              {/* Divider */}
              <div className="mx-3 my-2" style={{ borderTop: '1px solid rgba(37,99,235,0.08)' }} />
              {/* Compare */}
              <p className="px-4 py-2 text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#94A3B8' }}>Compare</p>
              {[
                { to: '/compare/handshake', label: 'Compare: vs Handshake' },
                { to: '/compare/linkedin', label: 'Compare: vs LinkedIn' },
              ].map((item) => (
                <a key={item.to} href={item.to} target="_blank" rel="noopener noreferrer" className="block text-left px-4 py-2.5 text-sm font-medium rounded-lg hover:bg-gray-50" style={{ color: '#4A5E80', fontFamily: "'Lora', serif", fontStyle: 'italic', textDecoration: 'none' }}>
                  {item.label}
                </a>
              ))}
            </div>
            <button onClick={() => { navigate('/signin?mode=signup'); setMobileMenuOpen(false); }} className="text-left px-4 py-3 text-sm font-medium rounded-lg hover:bg-gray-50" style={{ color: '#4A5E80', fontFamily: "'Lora', serif", fontStyle: 'italic' }}>Get started</button>
            <div className="border-t mt-2 pt-2" style={{ borderColor: 'rgba(37,99,235,0.08)' }}>
              {user ? (
                <button onClick={() => { navigate('/find'); setMobileMenuOpen(false); }} className="btn-primary-lg w-full" style={{ borderRadius: '3px' }}>Find people</button>
              ) : (
                <button onClick={() => { navigate('/signin?mode=signup'); setMobileMenuOpen(false); }} className="w-full text-center py-3 text-sm font-semibold" style={{ background: '#2563EB', color: '#fff', borderRadius: '3px', fontFamily: "'Lora', serif", fontStyle: 'italic' }}>Create account</button>
              )}
            </div>
          </nav>
        </div>
      )}

      {/* Spacer for fixed header */}
      <div className="h-20" />

      {/* ═══════════════ HERO / TITLE PAGE ═══════════════ */}
      <section
        ref={heroRef}
        className="relative px-6 md:px-12"
        style={{
          paddingTop: '120px',
          paddingBottom: '80px',
          background: '#FFFFFF',
          backgroundImage: RULED_LINES,
        }}
      >
        {/* Ink splatter — hero */}
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden', zIndex: 0 }}>
          <svg width="100%" height="100%" viewBox="0 0 1200 700" fill="none" preserveAspectRatio="xMidYMid slice" style={{ position: 'absolute', inset: 0 }}>
            <path d="M 20 15 Q 90 -8 145 28 Q 192 58 185 112 Q 178 162 130 172 Q 78 182 38 148 Q 2 118 8 68 Q 12 35 20 15 Z" fill="#1D4ED8" opacity="0.11"/>
            <path d="M 55 168 Q 95 155 118 178 Q 138 198 122 222 Q 104 244 74 234 Q 46 224 44 198 Q 42 175 55 168 Z" fill="#2563EB" opacity="0.09"/>
            <circle cx="168" cy="18" r="11" fill="#1D4ED8" opacity="0.11"/>
            <circle cx="188" cy="36" r="6" fill="#2563EB" opacity="0.09"/>
            <circle cx="152" cy="8" r="5" fill="#1D4ED8" opacity="0.10"/>
            <circle cx="200" cy="54" r="4" fill="#3B82F6" opacity="0.08"/>
            <circle cx="22" cy="200" r="8" fill="#1D4ED8" opacity="0.09"/>
            <circle cx="8" cy="218" r="5" fill="#2563EB" opacity="0.08"/>
            <circle cx="38" cy="226" r="4" fill="#3B82F6" opacity="0.08"/>
            <circle cx="12" cy="236" r="3" fill="#60A5FA" opacity="0.07"/>
            <path d="M 1098 18 Q 1148 2 1188 34 Q 1220 62 1206 106 Q 1190 146 1148 150 Q 1102 154 1078 116 Q 1058 82 1074 46 Q 1084 24 1098 18 Z" fill="#1D4ED8" opacity="0.10"/>
            <path d="M 1158 148 Q 1188 138 1206 158 Q 1220 176 1208 196 Q 1194 214 1172 208 Q 1150 202 1148 180 Q 1146 160 1158 148 Z" fill="#2563EB" opacity="0.08"/>
            <circle cx="1192" cy="8" r="8" fill="#1D4ED8" opacity="0.10"/>
            <circle cx="1208" cy="24" r="5" fill="#2563EB" opacity="0.09"/>
            <circle cx="1200" cy="42" r="3.5" fill="#3B82F6" opacity="0.08"/>
            <circle cx="1060" cy="156" r="6" fill="#1D4ED8" opacity="0.09"/>
            <circle cx="1046" cy="168" r="3.5" fill="#2563EB" opacity="0.07"/>
            <circle cx="1068" cy="172" r="2.5" fill="#3B82F6" opacity="0.07"/>
            <circle cx="620" cy="32" r="4" fill="#2563EB" opacity="0.08"/>
            <circle cx="638" cy="44" r="2.5" fill="#3B82F6" opacity="0.07"/>
            <circle cx="608" cy="52" r="3" fill="#2563EB" opacity="0.07"/>
            <circle cx="840" cy="598" r="4" fill="#3B82F6" opacity="0.08"/>
            <circle cx="856" cy="612" r="2.5" fill="#60A5FA" opacity="0.07"/>
          </svg>
        </div>

        {/* Ghost page number */}
        <span style={{ position: 'absolute', right: 32, top: '50%', transform: 'translateY(-50%)', fontFamily: "'Lora', serif", fontStyle: 'italic', fontSize: 11, color: '#CBD5E1', zIndex: 1 }}>p. i</span>

        {/* Subtle radial glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] rounded-full pointer-events-none" style={{ background: 'radial-gradient(ellipse at center, rgba(37,99,235,0.06) 0%, transparent 70%)', zIndex: 1 }} />

        <div className="relative max-w-3xl mx-auto text-center" style={{ zIndex: 1 }}>
          {/* Table of Contents */}
          <div style={{ display: 'flex', border: '1px solid #E2E8F0', borderRadius: 3, overflow: 'hidden', background: '#fff', maxWidth: 560, margin: '0 auto 44px' }}>
            {[
              { ch: 'Ch. I', title: 'How It Works', target: 'how-it-works' },
              { ch: 'Ch. II', title: 'The Difference', target: 'comparison' },
              { ch: 'Ch. III', title: 'Five Tools', target: 'features' },
              { ch: 'Ch. IV', title: 'Reviews', target: 'testimonials' },
            ].map((item, idx) => (
              <button
                key={item.ch}
                onClick={() => scrollToSection(item.target)}
                style={{
                  flex: 1,
                  padding: '10px 14px',
                  borderRight: idx < 3 ? '1px solid #E2E8F0' : 'none',
                  cursor: 'pointer',
                  background: 'transparent',
                  border: 'none',
                  borderRight: idx < 3 ? '1px solid #E2E8F0' : 'none',
                  textAlign: 'left',
                  transition: 'background .15s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#FAFBFF'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              >
                <div style={{ fontFamily: "'Lora', serif", fontStyle: 'italic', fontSize: 9, color: '#93C5FD', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 2 }}>{item.ch}</div>
                <div style={{ fontFamily: "'Lora', serif", fontSize: 11.5, fontWeight: 600, color: '#4A5E80' }}>{item.title}</div>
              </button>
            ))}
          </div>

          {/* Section eyebrow */}
          <div className="hero-fade-up hero-fade-up-delay-1" style={{ fontFamily: "'Lora', serif", fontStyle: 'italic', fontSize: 13, color: '#93C5FD', letterSpacing: '.08em', marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
            The Career Networking Tool
            <div style={{ flex: 1, height: 1, maxWidth: 120, background: 'linear-gradient(90deg, #DBEAFE, transparent)' }} />
          </div>

          <h1
            className="hero-fade-up hero-fade-up-delay-1 hero-headline"
            style={{ fontFamily: "'Lora', Georgia, serif", fontSize: 'clamp(42px, 6vw, 68px)', fontWeight: 700, lineHeight: 1.1, letterSpacing: '-0.025em', color: '#0F172A', marginBottom: 0 }}
          >
            Recruiting takes long enough. <span style={{ color: '#2563EB', fontStyle: 'italic' }}>Stop wasting time on the busywork.</span>
          </h1>

          <div style={{ height: 1.5, background: 'linear-gradient(90deg, #2563EB, #60A5FA, transparent)', maxWidth: 320, margin: '12px auto 20px' }} />

          <p
            className="hero-fade-up hero-fade-up-delay-3 hero-drop-cap"
            style={{ fontFamily: "'Lora', Georgia, serif", fontStyle: 'italic', fontSize: '16px', lineHeight: 1.75, color: '#6B7280', maxWidth: '520px', margin: '0 auto 36px', textAlign: 'left' }}
          >
            Outreach that used to take hours: finding emails, writing messages, researching companies, done in minutes. Check out our <Link to="/blog/cold-email-mckinsey-consultant" style={{ color: '#2563EB', textDecoration: 'underline' }}>McKinsey cold email template</Link> to see how it works. Focus on the conversations that actually land offers.
          </p>

          {/* CTA Buttons */}
          <div className="hero-fade-up hero-fade-up-delay-4 flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={() => navigate('/signin?mode=signup')}
              style={{ background: '#2563EB', color: '#fff', fontFamily: "'Lora', serif", fontStyle: 'italic', fontWeight: 600, borderRadius: '3px', padding: '13px 28px', boxShadow: '0 2px 12px rgba(37,99,235,.25)', border: 'none', cursor: 'pointer', fontSize: '14px', transition: 'background 0.15s ease' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#1D4ED8'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = '#2563EB'; }}
            >
              Create account
            </button>
            <a
              href={CHROME_EXTENSION_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2"
              style={{ padding: '13px 24px', fontSize: '14px', fontWeight: 600, fontFamily: "'Lora', serif", fontStyle: 'italic', textDecoration: 'none', border: '1px solid #CBD5E1', borderRadius: '3px', color: '#4A5E80', cursor: 'pointer', transition: 'all 0.15s ease', background: 'transparent' }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#93C5FD'; e.currentTarget.style.color = '#0F172A'; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#CBD5E1'; e.currentTarget.style.color = '#4A5E80'; }}
            >
              <img src={GoogleLogo} alt="" style={{ width: 16, height: 16, objectFit: 'contain' }} />
              Download browser extension
            </a>
          </div>

          {/* Stats section */}
          <div ref={statsRef} style={{ position: 'relative', padding: '52px 0 48px', textAlign: 'center', maxWidth: 680, margin: '48px auto 0' }}>
            {/* Faint ruled lines */}
            <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', backgroundImage: 'repeating-linear-gradient(to bottom, transparent, transparent 27px, rgba(37,99,235,.04) 27px, rgba(37,99,235,.04) 28px)' }} />

            {/* Top rule with label */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 40, position: 'relative' }}>
              <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, transparent, #DBEAFE)' }} />
              <div style={{ fontFamily: "'Lora', serif", fontStyle: 'italic', fontSize: 10, color: '#93C5FD', letterSpacing: '.14em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>By the numbers</div>
              <div style={{ flex: 1, height: 1, background: 'linear-gradient(270deg, transparent, #DBEAFE)' }} />
            </div>

            {/* Four stats */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', position: 'relative', marginBottom: 40 }}>
              {/* Vertical separators */}
              {[25, 50, 75].map(pct => (
                <div key={pct} style={{ position: 'absolute', top: '10%', bottom: '10%', left: `${pct}%`, width: 1, background: 'linear-gradient(to bottom, transparent, #E2E8F0 30%, #E2E8F0 70%, transparent)' }} />
              ))}

              {[
                { num: `${animatedStats.contacts}B`, accent: true, label: 'verified professional\ncontacts indexed' },
                { num: `${animatedStats.rate}%`, accent: false, label: 'average open rate\non AI outreach' },
                { num: `${animatedStats.students.toLocaleString()}+`, accent: true, label: 'students across\ntop universities' },
                { num: `~${animatedStats.prep}s`, accent: false, label: 'to generate a full\ncoffee chat prep sheet' },
              ].map((stat) => (
                <div key={stat.num} style={{ padding: '0 16px', textAlign: 'center' }}>
                  <div style={{ fontFamily: "'Lora', Georgia, serif", fontSize: 'clamp(32px, 3.5vw, 48px)', fontWeight: 700, color: stat.accent ? '#2563EB' : '#0F172A', letterSpacing: '-.04em', lineHeight: 1, marginBottom: 10 }}>
                    {stat.num}
                  </div>
                  <div style={{ height: 1.5, background: 'linear-gradient(90deg, transparent, #2563EB, transparent)', maxWidth: 28, margin: '0 auto 10px', opacity: .6 }} />
                  <div style={{ fontFamily: "'Lora', serif", fontStyle: 'italic', fontSize: 12, color: '#94A3B8', lineHeight: 1.6, whiteSpace: 'pre-line' }}>
                    {stat.label}
                  </div>
                </div>
              ))}
            </div>

            {/* Bottom schools line */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, position: 'relative' }}>
              <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, transparent, #DBEAFE)' }} />
              <div style={{ fontFamily: "'Lora', serif", fontStyle: 'italic', fontSize: 12, color: '#CBD5E1', letterSpacing: '.06em', whiteSpace: 'nowrap' }}>USC · Michigan · NYU · Georgetown · Wharton</div>
              <div style={{ flex: 1, height: 1, background: 'linear-gradient(270deg, transparent, #DBEAFE)' }} />
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════ CHAPTER I: HOW IT WORKS ═══════════════ */}
      <section id="how-it-works" className="relative px-6 md:px-12" style={{ padding: '72px 64px 60px', borderTop: '1px solid #EEF2F8', background: '#fff' }}>
        {/* Ink splatter — Chapter I */}
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden', zIndex: 0 }}>
          <svg width="100%" height="100%" viewBox="0 0 1200 500" fill="none" preserveAspectRatio="xMidYMid slice">
            <path d="M 1098 8 Q 1152 -4 1192 28 Q 1224 56 1210 100 Q 1196 140 1154 144 Q 1108 148 1086 112 Q 1066 78 1080 42 Q 1088 18 1098 8 Z" fill="#1D4ED8" opacity="0.11"/>
            <circle cx="1196" cy="18" r="9" fill="#1D4ED8" opacity="0.10"/>
            <circle cx="1192" cy="40" r="5" fill="#2563EB" opacity="0.09"/>
            <circle cx="1200" cy="56" r="4" fill="#3B82F6" opacity="0.08"/>
            <circle cx="1074" cy="150" r="7" fill="#1D4ED8" opacity="0.09"/>
            <circle cx="1062" cy="164" r="4" fill="#2563EB" opacity="0.08"/>
            <circle cx="1080" cy="168" r="3" fill="#3B82F6" opacity="0.07"/>
          </svg>
        </div>

        <span style={{ position: 'absolute', top: 20, left: 40, fontFamily: "'Lora', serif", fontSize: 72, fontWeight: 700, color: '#F0F5FF', userSelect: 'none', pointerEvents: 'none', zIndex: 1 }}>I</span>
        <span style={{ position: 'absolute', right: 32, top: '50%', transform: 'translateY(-50%)', fontFamily: "'Lora', serif", fontStyle: 'italic', fontSize: 11, color: '#CBD5E1', zIndex: 1 }}>p. 1</span>

        <div style={{ position: 'relative', zIndex: 1, maxWidth: 760, margin: '0 auto', textAlign: 'center' }}>
          <div style={{ fontFamily: "'Lora', serif", fontStyle: 'italic', fontSize: 11, color: '#93C5FD', letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
            Chapter I
            <div style={{ flex: 1, height: 1, maxWidth: 120, background: 'linear-gradient(90deg, #DBEAFE, transparent)' }} />
          </div>
          <h2 style={{ fontFamily: "'Lora', Georgia, serif", fontSize: 'clamp(32px, 5vw, 52px)', fontWeight: 700, lineHeight: 1.1, letterSpacing: '-.025em', color: '#0F172A', marginBottom: 0 }}>
            The ChatGPT of Email Outreach
          </h2>
          <div style={{ height: 1.5, background: 'linear-gradient(90deg, #2563EB, #60A5FA, transparent)', maxWidth: 200, margin: '10px auto 16px' }} />
          <p style={{ fontFamily: "'Lora', serif", fontStyle: 'italic', fontSize: 16, lineHeight: 1.75, color: '#6B7280', maxWidth: 640, margin: '0 auto 48px' }}>
            Prompt the type of person you want to talk to and instantly have personalized emails created in your drafts ready to send. At the same time their information is stored into a networking tracker spreadsheet.
          </p>

          <div style={{ maxWidth: 900, margin: '0 auto', borderRadius: 4, overflow: 'hidden', border: '1px solid #E2E8F0', boxShadow: '0 2px 4px rgba(0,0,0,.03), 0 8px 24px rgba(37,99,235,.06)' }}>
            <video src={HowItWorksVideo} autoPlay loop muted playsInline style={{ width: '100%', display: 'block' }} />
          </div>
        </div>
      </section>

      {/* Chrome Extension */}
      <section id="extension" className="relative px-6 md:px-12" style={{ padding: '72px 64px 60px', borderTop: '1px solid #EEF2F8', background: '#fff' }}>
        {/* Ink splatter — Chrome Extension */}
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden', zIndex: 0 }}>
          <svg width="100%" height="100%" viewBox="0 0 1200 500" fill="none" preserveAspectRatio="xMidYMid slice">
            <path d="M 12 372 Q 62 348 108 374 Q 146 396 138 442 Q 128 484 84 490 Q 38 496 14 458 Q -6 424 4 390 Q 8 376 12 372 Z" fill="#1D4ED8" opacity="0.11"/>
            <circle cx="118" cy="362" r="8" fill="#1D4ED8" opacity="0.10"/>
            <circle cx="132" cy="350" r="5" fill="#2563EB" opacity="0.09"/>
            <circle cx="106" cy="352" r="4" fill="#3B82F6" opacity="0.08"/>
            <circle cx="4" cy="506" r="7" fill="#1D4ED8" opacity="0.09"/>
            <circle cx="20" cy="510" r="4" fill="#2563EB" opacity="0.08"/>
          </svg>
        </div>

        <span style={{ position: 'absolute', right: 32, top: '50%', transform: 'translateY(-50%)', fontFamily: "'Lora', serif", fontStyle: 'italic', fontSize: 11, color: '#CBD5E1', zIndex: 1 }}>p. 2</span>

        <div style={{ position: 'relative', zIndex: 1, maxWidth: 760, margin: '0 auto', textAlign: 'center' }}>
          <div style={{ fontFamily: "'Lora', serif", fontStyle: 'italic', fontSize: 11, color: '#93C5FD', letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
            Chrome Extension
            <div style={{ flex: 1, height: 1, maxWidth: 120, background: 'linear-gradient(90deg, #DBEAFE, transparent)' }} />
          </div>
          <h2 style={{ fontFamily: "'Lora', Georgia, serif", fontSize: 'clamp(32px, 5vw, 52px)', fontWeight: 700, lineHeight: 1.1, letterSpacing: '-.025em', color: '#0F172A', marginBottom: 0 }}>
            Works right inside LinkedIn
          </h2>
          <div style={{ height: 1.5, background: 'linear-gradient(90deg, #2563EB, #60A5FA, transparent)', maxWidth: 200, margin: '10px auto 16px' }} />
          <p style={{ fontFamily: "'Lora', serif", fontStyle: 'italic', fontSize: 16, lineHeight: 1.75, color: '#6B7280', maxWidth: 540, margin: '0 auto 32px' }}>
            Write emails to anyone from their profile. Find hiring managers on any job posting. All from a single Chrome extension.
          </p>

          <a
            href={CHROME_EXTENSION_URL}
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 10, background: '#0F172A', color: '#DBEAFE', textDecoration: 'none', fontFamily: "'Lora', serif", fontStyle: 'italic', fontWeight: 600, fontSize: 14, padding: '13px 28px', borderRadius: 3, border: 'none', cursor: 'pointer', transition: 'background 0.15s ease' }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = '#1E293B'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = '#0F172A'; }}
          >
            <img src={GoogleLogo} alt="" style={{ width: 18, height: 18, objectFit: 'contain' }} />
            Add to Chrome — it's free
          </a>

          <div style={{ maxWidth: 900, margin: '56px auto 0' }}>
            <div style={{ borderRadius: 4, overflow: 'hidden', border: '1px solid #E2E8F0', boxShadow: '0 2px 4px rgba(0,0,0,.03), 0 8px 24px rgba(37,99,235,.06)' }}>
              <img src={ChromeExtensionPic} alt="Offerloop Chrome extension on a LinkedIn profile" style={{ width: '100%', display: 'block', objectFit: 'cover', objectPosition: 'top left' }} />
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════ CHAPTER II: COMPARISON ═══════════════ */}
      <section id="comparison" className="relative px-6 md:px-12" style={{ padding: '72px 64px 60px', borderTop: '1px solid #EEF2F8', background: '#fff' }}>
        {/* Ink splatter — Chapter II */}
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden', zIndex: 0 }}>
          <svg width="100%" height="100%" viewBox="0 0 1200 500" fill="none" preserveAspectRatio="xMidYMid slice">
            <path d="M 8 12 Q 68 -6 118 26 Q 158 52 150 102 Q 140 148 96 156 Q 48 164 16 128 Q -8 96 2 52 Q 6 26 8 12 Z" fill="#1D4ED8" opacity="0.11"/>
            <circle cx="128" cy="18" r="9" fill="#1D4ED8" opacity="0.10"/>
            <circle cx="146" cy="36" r="5" fill="#2563EB" opacity="0.09"/>
            <circle cx="112" cy="8" r="4" fill="#3B82F6" opacity="0.08"/>
            <circle cx="6" cy="168" r="8" fill="#1D4ED8" opacity="0.09"/>
            <circle cx="22" cy="182" r="4" fill="#2563EB" opacity="0.08"/>
            <circle cx="36" cy="176" r="3" fill="#3B82F6" opacity="0.07"/>
          </svg>
        </div>

        <span style={{ position: 'absolute', top: 20, left: 40, fontFamily: "'Lora', serif", fontSize: 72, fontWeight: 700, color: '#F0F5FF', userSelect: 'none', pointerEvents: 'none', zIndex: 1 }}>II</span>
        <span style={{ position: 'absolute', right: 32, top: '50%', transform: 'translateY(-50%)', fontFamily: "'Lora', serif", fontStyle: 'italic', fontSize: 11, color: '#CBD5E1', zIndex: 1 }}>p. 3</span>

        <div style={{ position: 'relative', zIndex: 1, maxWidth: 760, margin: '0 auto', textAlign: 'center' }}>
          <div style={{ fontFamily: "'Lora', serif", fontStyle: 'italic', fontSize: 11, color: '#93C5FD', letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
            Chapter II
            <div style={{ flex: 1, height: 1, maxWidth: 120, background: 'linear-gradient(90deg, #DBEAFE, transparent)' }} />
          </div>
          <h2 className="reveal" style={{ fontFamily: "'Lora', Georgia, serif", fontSize: 'clamp(32px, 5vw, 52px)', fontWeight: 700, lineHeight: 1.1, letterSpacing: '-.025em', color: '#0F172A', marginBottom: 0 }}>
            Where your time actually goes
          </h2>
          <div style={{ height: 1.5, background: 'linear-gradient(90deg, #2563EB, #60A5FA, transparent)', maxWidth: 200, margin: '10px auto 48px' }} />
        </div>

        {/* Two-column book layout with column rule */}
        <div className="max-w-[900px] mx-auto" style={{ display: 'grid', gridTemplateColumns: '1fr 2px 1fr', gap: '0 32px', position: 'relative', zIndex: 1 }}>
          {/* Left: Without */}
          <div className="reveal-stagger" style={{ padding: '32px 0' }}>
            <h3 style={{ fontFamily: "'Lora', serif", fontSize: 13, letterSpacing: '.06em', textTransform: 'uppercase', color: '#94A3B8', marginBottom: 24 }}>Without Offerloop</h3>
            {[
              <>Effort spent writing an email to an email address that isn't real</>,
              <><strong>15 minutes</strong> writing a single personalized message</>,
              <><strong>5 minutes</strong> manually updating a spreadsheet after every email</>,
              <><strong>30 minutes to an hour</strong> researching a person and company before a call</>,
              <>Constantly refreshing your inbox to see if they responded</>,
              <><strong>3+ hours</strong> before you even land one coffee chat</>,
            ].map((text, i) => (
              <div key={i} className="relative mb-4 reveal" style={{ paddingLeft: 24, fontSize: 14, lineHeight: 1.75, color: '#374151', fontFamily: "'Lora', serif", fontStyle: 'italic' }}>
                <div className="absolute left-0 top-[9px] w-1.5 h-1.5 rounded-full" style={{ background: '#CBD5E1' }} />
                {text}
              </div>
            ))}
          </div>

          {/* Column rule */}
          <div style={{ background: 'linear-gradient(to bottom, transparent, #CBD5E1 20%, #CBD5E1 80%, transparent)' }} />

          {/* Right: With */}
          <div className="reveal-stagger" style={{ padding: '32px 0' }}>
            <h3 style={{ fontFamily: "'Lora', serif", fontSize: 13, letterSpacing: '.06em', textTransform: 'uppercase', color: '#2563EB', marginBottom: 24 }}>With Offerloop</h3>
            {[
              <>Verified, deliverable emails found <strong>instantly</strong> — no more bounced messages</>,
              <>Personalized emails drafted in <strong>seconds</strong>, not 15 minutes</>,
              <>Every contact and outreach logged to your dashboard <strong>automatically</strong> — no manual spreadsheets</>,
              <>AI-generated prep sheets with talking points and research for every call</>,
              <><strong>Real-time</strong> email tracking so you know exactly when someone opens or replies</>,
              <><strong>10 minutes</strong> of work that will almost guarantee you a coffee chat</>,
            ].map((text, i) => (
              <div key={i} className="relative mb-4 reveal" style={{ paddingLeft: 24, fontSize: 14, lineHeight: 1.75, color: '#374151', fontFamily: "'Lora', serif", fontStyle: 'italic' }}>
                <div className="absolute left-0 top-[9px] w-1.5 h-1.5 rounded-full" style={{ background: '#3B82F6', opacity: 0.6 }} />
                {text}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════ CHAPTER III: FEATURES ═══════════════ */}
      <section id="features" className="relative px-6 md:px-12" style={{ padding: '72px 64px 60px', borderTop: '1px solid #EEF2F8', background: '#fff' }}>
        {/* Ink splatter — Chapter III */}
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden', zIndex: 0 }}>
          <svg width="100%" height="100%" viewBox="0 0 1200 800" fill="none" preserveAspectRatio="xMidYMid slice">
            <path d="M 1094 6 Q 1152 -8 1194 28 Q 1228 58 1214 106 Q 1198 150 1152 156 Q 1102 162 1076 122 Q 1054 86 1072 44 Q 1082 16 1094 6 Z" fill="#1D4ED8" opacity="0.11"/>
            <circle cx="1196" cy="18" r="9" fill="#1D4ED8" opacity="0.10"/>
            <circle cx="1192" cy="40" r="5" fill="#2563EB" opacity="0.09"/>
            <circle cx="1062" cy="162" r="6" fill="#1D4ED8" opacity="0.09"/>
            <circle cx="1050" cy="174" r="3.5" fill="#2563EB" opacity="0.08"/>
            <path d="M 6 572 Q 58 548 104 572 Q 142 592 136 638 Q 128 680 82 686 Q 34 692 8 652 Q -12 618 2 586 Q 4 576 6 572 Z" fill="#2563EB" opacity="0.10"/>
            <circle cx="114" cy="562" r="8" fill="#1D4ED8" opacity="0.10"/>
            <circle cx="128" cy="550" r="5" fill="#2563EB" opacity="0.08"/>
            <circle cx="100" cy="552" r="4" fill="#3B82F6" opacity="0.08"/>
          </svg>
        </div>

        <span style={{ position: 'absolute', top: 20, left: 40, fontFamily: "'Lora', serif", fontSize: 72, fontWeight: 700, color: '#F0F5FF', userSelect: 'none', pointerEvents: 'none', zIndex: 1 }}>III</span>
        <span style={{ position: 'absolute', right: 32, top: '50%', transform: 'translateY(-50%)', fontFamily: "'Lora', serif", fontStyle: 'italic', fontSize: 11, color: '#CBD5E1', zIndex: 1 }}>p. 4</span>

        <div style={{ position: 'relative', zIndex: 1, maxWidth: 760, margin: '0 auto', textAlign: 'center' }}>
          <div style={{ fontFamily: "'Lora', serif", fontStyle: 'italic', fontSize: 11, color: '#93C5FD', letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
            Chapter III
            <div style={{ flex: 1, height: 1, maxWidth: 120, background: 'linear-gradient(90deg, #DBEAFE, transparent)' }} />
          </div>
          <h2 className="reveal" style={{ fontFamily: "'Lora', Georgia, serif", fontSize: 'clamp(32px, 5vw, 52px)', fontWeight: 700, lineHeight: 1.1, letterSpacing: '-.025em', color: '#0F172A', marginBottom: 0 }}>
            Everything You Need to Network Smarter
          </h2>
          <div style={{ height: 1.5, background: 'linear-gradient(90deg, #2563EB, #60A5FA, transparent)', maxWidth: 200, margin: '10px auto 16px' }} />
        </div>

        <div className="max-w-5xl mx-auto" style={{ display: 'flex', flexDirection: 'column', gap: 80, marginTop: 64, position: 'relative', zIndex: 1 }}>
          {[
            { numeral: 'i', title: 'Find Company', description: "Describe the type of companies you're looking for in plain English and we'll find them for you.", image: FindCompanyImg },
            { numeral: 'ii', title: 'Find Hiring Manager', description: "Paste a job posting URL and we'll find the recruiters and hiring managers for that role.", image: FindHiringManagerImg },
            { numeral: 'iii', title: 'Coffee Chat Prep', description: "Paste a LinkedIn URL and get a personalized prep sheet with talking points, recent news, and smart questions.", image: CoffeeChatImg },
            { numeral: 'iv', title: 'Manage Emails', description: "Track every email you've sent, see who opened it, who replied, and who needs a follow-up.", image: EmailOutreachImg },
          ].map((feature, i) => {
            const isTextLeft = i % 2 === 0;
            return (
              <div key={feature.title} className="reveal" style={{ display: 'flex', flexDirection: isTextLeft ? 'row' : 'row-reverse', alignItems: 'center', gap: 48, flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 340px', minWidth: 0 }}>
                  <div style={{ fontFamily: "'Lora', serif", fontStyle: 'italic', fontSize: 11, color: '#93C5FD', letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 8 }}>
                    {feature.numeral}. {feature.title}
                  </div>
                  <h3 style={{ fontFamily: "'Lora', serif", fontSize: 22, fontWeight: 700, color: '#0F172A', marginBottom: 0 }}>
                    {feature.title}
                  </h3>
                  <div style={{ height: 1, background: 'linear-gradient(90deg, #DBEAFE, transparent)', width: 80, margin: '8px 0 10px' }} />
                  <p style={{ fontFamily: "'Lora', serif", fontStyle: 'italic', fontSize: 15, lineHeight: 1.75, color: '#6B7280' }}>
                    {feature.description}
                  </p>
                </div>
                <div style={{ flex: '1 1 400px', minWidth: 0, maxWidth: 500, borderRadius: 4, overflow: 'hidden', border: '1px solid #E2E8F0', boxShadow: '0 2px 8px rgba(37,99,235,.05)' }}>
                  <img src={feature.image} alt={feature.title} style={{ width: '100%', display: 'block', objectFit: 'cover' }} />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ═══════════════ CHAPTER IV: TESTIMONIALS / PULL QUOTES ═══════════════ */}
      <section id="testimonials" className="relative px-6 md:px-12" style={{ padding: '72px 64px 60px', borderTop: '1px solid #EEF2F8', background: '#FAFBFF' }}>
        {/* Ink splatter — Chapter IV */}
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden', zIndex: 0 }}>
          <svg width="100%" height="100%" viewBox="0 0 1200 500" fill="none" preserveAspectRatio="xMidYMid slice">
            <path d="M 1090 4 Q 1152 -10 1196 30 Q 1230 62 1214 110 Q 1196 154 1148 158 Q 1096 162 1070 120 Q 1048 82 1068 40 Q 1078 14 1090 4 Z" fill="#1D4ED8" opacity="0.11"/>
            <circle cx="1198" cy="20" r="8" fill="#1D4ED8" opacity="0.10"/>
            <circle cx="1192" cy="42" r="5" fill="#2563EB" opacity="0.09"/>
            <circle cx="1058" cy="164" r="6" fill="#1D4ED8" opacity="0.09"/>
            <circle cx="1048" cy="176" r="3.5" fill="#2563EB" opacity="0.08"/>
          </svg>
        </div>

        <span style={{ position: 'absolute', top: 20, left: 40, fontFamily: "'Lora', serif", fontSize: 72, fontWeight: 700, color: '#F0F5FF', userSelect: 'none', pointerEvents: 'none', zIndex: 1 }}>IV</span>
        <span style={{ position: 'absolute', right: 32, top: '50%', transform: 'translateY(-50%)', fontFamily: "'Lora', serif", fontStyle: 'italic', fontSize: 11, color: '#CBD5E1', zIndex: 1 }}>p. 5</span>

        <div style={{ position: 'relative', zIndex: 1, maxWidth: 760, margin: '0 auto', textAlign: 'center' }}>
          <div style={{ fontFamily: "'Lora', serif", fontStyle: 'italic', fontSize: 11, color: '#93C5FD', letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
            Chapter IV
            <div style={{ flex: 1, height: 1, maxWidth: 120, background: 'linear-gradient(90deg, #DBEAFE, transparent)' }} />
          </div>
          <h2 className="reveal" style={{ fontFamily: "'Lora', Georgia, serif", fontSize: 'clamp(32px, 5vw, 52px)', fontWeight: 700, lineHeight: 1.1, letterSpacing: '-.025em', color: '#0F172A', marginBottom: 0 }}>
            People Like You Use This
          </h2>
          <div style={{ height: 1.5, background: 'linear-gradient(90deg, #2563EB, #60A5FA, transparent)', maxWidth: 200, margin: '10px auto 48px' }} />
        </div>

        {/* Two-column pull quotes with column rule */}
        <div className="max-w-[800px] mx-auto" style={{ position: 'relative', zIndex: 1 }}>
          {[
            { name: 'Dylan Roby', role: 'Investment Banking Analyst, Evercore', quote: 'Offerloop does the work I spent hundreds of hours doing to land my internship — in minutes.' },
            { name: 'Jackson Leck', role: 'Private Equity Intern, Blackstone', quote: "I had so many recruiting tabs open. Now I have one. Everything I need in a single place." },
            { name: 'Sarah Ucuzoglu', role: 'Financial Advisory Intern, PwC', quote: 'Automating cold outreach gave me more time spent face to face with professionals who could actually help.' },
          ].map((t, i) => (
            <div key={i} className="reveal" style={{ borderLeft: '3px solid #2563EB', padding: '20px 0 20px 28px', marginBottom: i < 2 ? 40 : 0 }}>
              <p style={{ fontFamily: "'Lora', serif", fontStyle: 'italic', fontSize: 16, color: '#374151', lineHeight: 1.8, marginBottom: 12 }}>
                {t.quote}
              </p>
              <div style={{ fontFamily: "'Lora', serif", fontSize: 12, color: '#94A3B8' }}>
                <span style={{ fontWeight: 700, fontStyle: 'normal', color: '#4A5E80' }}>{t.name}</span> — <span style={{ fontStyle: 'italic', color: '#2563EB' }}>{t.role}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ═══════════════ EPILOGUE / BACK COVER CTA ═══════════════ */}
      <section className="relative px-6 md:px-12" style={{ padding: '100px 48px 110px', background: 'linear-gradient(170deg, #0A1628, #102040)', backgroundImage: RULED_LINES.replace('rgba(37,99,235,.04)', 'rgba(255,255,255,.03)'), textAlign: 'center' }}>
        {/* Ink splatter — Epilogue (dark bg, higher opacity) */}
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden', zIndex: 0 }}>
          <svg width="100%" height="100%" viewBox="0 0 1200 500" fill="none" preserveAspectRatio="xMidYMid slice">
            <path d="M 14 10 Q 98 -12 168 38 Q 222 78 208 148 Q 194 212 132 220 Q 66 228 22 174 Q -14 126 4 62 Q 10 28 14 10 Z" fill="#3B82F6" opacity="0.18"/>
            <circle cx="192" cy="28" r="14" fill="#3B82F6" opacity="0.18"/>
            <circle cx="214" cy="50" r="8" fill="#60A5FA" opacity="0.16"/>
            <circle cx="172" cy="14" r="7" fill="#2563EB" opacity="0.18"/>
            <circle cx="10" cy="240" r="10" fill="#3B82F6" opacity="0.16"/>
            <circle cx="28" cy="256" r="6" fill="#60A5FA" opacity="0.14"/>
            <circle cx="44" cy="248" r="4" fill="#2563EB" opacity="0.14"/>
            <path d="M 1002 378 Q 1072 350 1138 388 Q 1192 420 1180 476 Q 1166 526 1106 530 Q 1040 534 1000 488 Q 966 448 980 408 Q 990 384 1002 378 Z" fill="#2563EB" opacity="0.18"/>
            <circle cx="1154" cy="366" r="12" fill="#3B82F6" opacity="0.18"/>
            <circle cx="1174" cy="386" r="7" fill="#60A5FA" opacity="0.16"/>
            <circle cx="1138" cy="352" r="6" fill="#2563EB" opacity="0.16"/>
            <circle cx="988" cy="546" r="8" fill="#3B82F6" opacity="0.16"/>
            <circle cx="974" cy="558" r="4.5" fill="#60A5FA" opacity="0.14"/>
          </svg>
        </div>

        <span style={{ position: 'absolute', right: 32, top: '50%', transform: 'translateY(-50%)', fontFamily: "'Lora', serif", fontStyle: 'italic', fontSize: 11, color: 'rgba(255,255,255,.15)', zIndex: 1 }}>p. 6</span>

        <div style={{ maxWidth: 640, margin: '0 auto', position: 'relative', zIndex: 1 }}>
          <div style={{ fontFamily: "'Lora', serif", fontStyle: 'italic', fontSize: 11, color: '#93C5FD', letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
            Epilogue
            <div style={{ flex: 1, height: 1, maxWidth: 120, background: 'linear-gradient(90deg, rgba(147,197,253,.4), transparent)' }} />
          </div>

          <p style={{ fontFamily: "'Lora', serif", fontStyle: 'italic', fontSize: 12, color: 'rgba(255,255,255,.25)', marginBottom: 20 }}>
            Join 400+ students from USC, Georgetown, NYU &amp; more
          </p>

          <h2 style={{ fontFamily: "'Lora', Georgia, serif", fontSize: 'clamp(32px, 5vw, 52px)', fontWeight: 700, lineHeight: 1.1, letterSpacing: '-.025em', color: '#fff', marginBottom: 0 }}>
            Start Today
          </h2>
          <div style={{ height: 1.5, background: 'linear-gradient(90deg, transparent, #2563EB, #60A5FA, transparent)', maxWidth: 200, margin: '10px auto 16px' }} />

          <p style={{ fontFamily: "'Lora', serif", fontStyle: 'italic', fontSize: 15, color: 'rgba(255,255,255,.45)', marginBottom: 32 }}>
            Free to start. Set up in under two minutes.
          </p>

          <button
            onClick={() => navigate('/signin?mode=signup')}
            className="btn-pulse"
            style={{ background: '#DBEAFE', color: '#0F172A', fontFamily: "'Lora', serif", fontStyle: 'italic', fontWeight: 600, fontSize: 14, padding: '13px 28px', borderRadius: 3, border: 'none', cursor: 'pointer', transition: 'background 0.15s ease' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#fff'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = '#DBEAFE'; }}
          >
            Create free account
          </button>
        </div>
      </section>

      {/* FAQ SECTION */}
      <section id="faq" style={{ padding: '64px 24px', maxWidth: 800, margin: '0 auto' }}>
        <span style={{ position: 'absolute', right: 32, fontFamily: "'Lora', serif", fontStyle: 'italic', fontSize: 11, color: '#CBD5E1' }}>p. 7</span>

        <div style={{ fontFamily: "'Lora', serif", fontStyle: 'italic', fontSize: 11, color: '#93C5FD', letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
          Common questions
          <div style={{ flex: 1, height: 1, maxWidth: 120, background: 'linear-gradient(90deg, #DBEAFE, transparent)' }} />
        </div>

        <h2 style={{ fontFamily: "'Lora', Georgia, serif", fontSize: 24, fontWeight: 700, letterSpacing: '-.025em', color: '#0F172A', marginBottom: 0 }}>
          Frequently Asked Questions
        </h2>
        <div style={{ height: 1.5, background: 'linear-gradient(90deg, #2563EB, #60A5FA, transparent)', maxWidth: 200, margin: '10px 0 24px' }} />

        <div style={{ border: '1px solid #E2E8F0', borderRadius: 3, overflow: 'hidden' }}>
          {[
            { q: "How do I write a coffee chat email to someone I've never met?", a: "A strong coffee chat email should be concise (3-5 sentences), mention a specific reason you're reaching out to that person, and propose a clear ask like a 15-minute virtual call. Personalization is critical — reference their career path, a recent project, or a shared alma mater. Offerloop uses AI to draft personalized coffee chat requests by pulling context from a contact's background, saving hours of manual research and writing." },
            { q: "What should I include in a cold email to a consultant at McKinsey, BCG, or Bain?", a: "Your cold email to an MBB consultant should include a brief introduction (school, year, relevant interest), one specific reason you're reaching out to them personally, and a low-commitment ask such as a 15-minute call. Avoid generic flattery and instead reference something concrete like their office location, practice area, or a published insight. Offerloop's AI email writer generates personalized consulting outreach emails by analyzing each contact's firm, role, and background from its 2.2 billion contact database." },
            { q: "How do I cold email investment banking analysts and associates for networking?", a: "When cold emailing IB professionals, keep your message under 100 words, lead with a shared connection point (alma mater, hometown, or mutual contact), and ask for a brief phone call rather than an in-person meeting. A subject line like 'Fellow [University] Student — Quick Question on [Group Name]' tends to perform well. Offerloop helps students find verified emails of bankers across bulge brackets and elite boutiques while generating tailored outreach." },
            { q: "How can I find the professional email address of someone I want to network with?", a: "Professional email addresses can often be found through company email pattern recognition, LinkedIn profile clues, or dedicated lookup tools. Offerloop provides access to a database of over 2.2 billion verified contacts, allowing college students to instantly find professional email addresses for alumni, recruiters, and industry professionals without needing multiple free tools." },
            { q: "How do I reach out to alumni from my university for career advice?", a: "Start by identifying alumni in your target industry through your university's alumni directory, LinkedIn, or a networking platform. Your outreach should mention your shared school, express genuine curiosity about their career path, and request a specific time commitment like a 15-minute call. Offerloop lets students search for alumni by university, company, and role, then auto-generates personalized emails sent directly through Gmail with conversation tracking built in." },
            { q: "What's the best strategy for networking to land an internship as a college freshman or sophomore?", a: "Start early by building relationships before recruiting season — reach out to upperclassmen, recent alumni, and professionals in your target industry 3-6 months before application deadlines. Focus on learning rather than asking for referrals in your initial conversations, and aim to build a network of 15-20 meaningful contacts in your target field. Offerloop removes the biggest barriers to networking — finding contacts, writing compelling emails, and staying organized." },
            { q: "Is there a better alternative to LinkedIn for college students trying to network?", a: "LinkedIn is useful for browsing profiles, but it wasn't designed for proactive outreach — students often hit connection request limits, get ignored in DMs, and lack access to direct email addresses. Offerloop is designed as a LinkedIn alternative for students, combining a 2.2 billion contact database with AI-powered email generation and Gmail integration so students can move beyond passive profile browsing into active, measurable networking." },
            { q: "What's a good networking email template for college students?", a: "A strong networking template has four parts: a personalized opening line (shared school, mutual connection, or specific interest in their work), one sentence about you, a clear and low-commitment ask (15-minute call), and a gracious close. Offerloop's AI generates unique emails for each contact by analyzing their professional background — the efficiency of a template with the authenticity of a hand-written message." },
            { q: "Is offerloop.ai a personal email domain?", a: "No — offerloop.ai is not a personal email service. Offerloop is an AI-powered networking platform for college students. It helps students find professional contacts, generate personalized outreach emails, and track their networking pipeline for recruiting in consulting, investment banking, and tech." },
          ].map((faq, i, arr) => (
            <div key={i} style={{ padding: '20px 24px', borderBottom: i < arr.length - 1 ? '1px solid #EEF2F8' : 'none' }}>
              <h3 style={{ fontFamily: "'Lora', Georgia, serif", fontSize: 16, fontWeight: 700, color: '#0F172A', marginBottom: 8 }}>{faq.q}</h3>
              <p style={{ fontFamily: "'Lora', serif", fontStyle: 'italic', fontSize: 14, lineHeight: 1.75, color: '#6B7280' }}>{faq.a}</p>
            </div>
          ))}
        </div>
      </section>

      {/* FOOTER */}
      <footer className="py-12 px-6 md:px-12" style={{ background: '#FFFFFF', borderTop: '1px solid #EEF2F8' }}>
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-sm" style={{ fontFamily: "'Lora', Georgia, serif", fontStyle: 'italic', fontSize: 13, color: '#CBD5E1' }}>
            © 2026 Offerloop. All rights reserved.
          </p>
          <div className="flex gap-6">
            {[
              { label: 'About', path: '/about' },
              { label: 'Contact', path: '/contact-us' },
              { label: 'Privacy', path: '/privacy' },
              { label: 'Terms', path: '/terms-of-service' },
            ].map((link) => (
              <Link key={link.path} to={link.path} className="footer-link text-sm relative" style={{ fontFamily: "'Lora', Georgia, serif", fontStyle: 'italic', fontSize: 13, color: '#94A3B8' }}>
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      </footer>

      {/* Back to Top Button */}
      <button
        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        className="fixed bottom-8 right-8 z-50 transition-all duration-300"
        style={{ width: 44, height: 44, borderRadius: '50%', background: '#FFFFFF', border: '1px solid #E2E8F0', boxShadow: '0 4px 20px rgba(0,0,0,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', opacity: showBackToTop ? 1 : 0, pointerEvents: showBackToTop ? 'auto' : 'none', transform: showBackToTop ? 'translateY(0)' : 'translateY(16px)' }}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(37,99,235,0.3)'; e.currentTarget.style.boxShadow = '0 6px 24px rgba(37,99,235,0.15)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#E2E8F0'; e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,0,0,0.08)'; }}
      >
        <ArrowRight className="h-5 w-5" style={{ color: '#4A5E80', transform: 'rotate(-90deg)' }} />
      </button>

      {/* Drop cap CSS */}
      <style>{`
        .hero-drop-cap::first-letter {
          font-size: 3.2em;
          font-weight: 700;
          font-style: normal;
          color: #0F172A;
          float: left;
          line-height: .78;
          margin: 4px 6px -4px 0;
        }
      `}</style>
    </div>
  );
};

export default Index;
