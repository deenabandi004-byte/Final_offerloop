// src/pages/Index.tsx
import { useState, useEffect, useRef } from 'react';
import { Helmet } from 'react-helmet-async';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowRight, Menu, X, ChevronDown } from 'lucide-react';
import { useFirebaseAuth } from "../contexts/FirebaseAuthContext";
import OfferloopLogo from '@/assets/offerloop_logo2.png';
import ChromeExtensionPic from '@/assets/Chrome_extensionpic.png';
import GoogleLogo from '@/assets/Googlelogo.png';
import HowItWorksVideo from '@/assets/Find People Insta Highlight part 1.mp4';
import FindCompanyImg from '@/assets/findcompanylandingpage.png';
import FindHiringManagerImg from '@/assets/findhiringmanagerlandingpage.png';
import EmailOutreachImg from '@/assets/emailoutreach.png.png';
import CoffeeChatImg from '@/assets/coffeechatlandingpage.png';
import FeatureShowcase from '@/components/FeatureShowcase';
import ChromeIcon from '@/assets/Google_Chrome_icon.png';
import LinkedInLogo from '@/assets/LinkedIn_Logo.png';
import uscLogo from '@/assets/USC-Logo.png';
import uclaLogo from '@/assets/UCLA logo.png';
import berkeleyLogo from '@/assets/UC Berkeley logo.png';
import stanfordLogo from '@/assets/Stanford logo.avif';
import uwLogo from '@/assets/UW Logo.png';
import nyuLogo from '@/assets/NYU Logo.png';
import georgetownLogo from '@/assets/Georgetown logo.png';
import michiganLogo from '@/assets/Michigan logo.png';
import whartonLogo from '@/assets/Wharton Logo .png';
import notreDameLogo from '@/assets/Notre Dame logo.png';
import dartmouthLogo from '@/assets/Dartmouth logo.png';
import TimeComparison from '@/components/TimeComparison';
import BulletinBoard from '@/components/BulletinBoard';

const CHROME_EXTENSION_URL = 'https://chromewebstore.google.com/detail/offerloop/aabnjgecmobcnnhkilbeocggbmgilpcl';


const Index = () => {
  const navigate = useNavigate();
  const { user } = useFirebaseAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [navbarScrolled, setNavbarScrolled] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [konamiActivated, setKonamiActivated] = useState(false);
  const [resourcesOpen, setResourcesOpen] = useState(false);
  const heroRef = useRef<HTMLDivElement>(null);
  const dashboardRef = useRef<HTMLDivElement>(null);

  // Navbar scroll behavior, scroll progress, back to top, and chapter tracking
  useEffect(() => {
    const handleScroll = () => {
      setNavbarScrolled(window.scrollY > 50);
      setShowBackToTop(window.scrollY > 600);

      const totalHeight = document.documentElement.scrollHeight - window.innerHeight;
      const progress = (window.scrollY / totalHeight) * 100;
      setScrollProgress(progress);

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
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&display=swap" rel="stylesheet" />
      </Helmet>


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
              className="h-16 cursor-pointer logo-animate"
              onClick={() => navigate('/')}
            />
          </div>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-5" style={{ flexShrink: 1, minWidth: 0 }}>
            <button onClick={scrollToFeatures} className="nav-link text-sm relative" style={{ color: '#4A5E80', fontFamily: "'Libre Baskerville', Georgia, serif", fontWeight: 600 }}>
              Features
            </button>
            <button onClick={() => scrollToSection('extension')} className="nav-link text-sm relative" style={{ color: '#4A5E80', fontFamily: "'Libre Baskerville', Georgia, serif", fontWeight: 600 }}>
              Extension
            </button>
            <button onClick={() => scrollToSection('testimonials')} className="nav-link text-sm relative" style={{ color: '#4A5E80', fontFamily: "'Libre Baskerville', Georgia, serif", fontWeight: 600 }}>
              Reviews
            </button>
            <div className="relative" onMouseEnter={() => setResourcesOpen(true)} onMouseLeave={() => setResourcesOpen(false)}>
              <button className="nav-link text-sm relative flex items-center gap-1" style={{ color: '#4A5E80', fontFamily: "'Libre Baskerville', Georgia, serif", fontWeight: 600 }}>
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
                      <a key={item.to} href={item.to} target="_blank" rel="noopener noreferrer" className="px-4 py-1.5 text-sm font-medium hover:bg-gray-50 transition-colors" style={{ color: '#4A5E80', fontFamily: "'Libre Baskerville', Georgia, serif", textDecoration: 'none' }}>
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
                      <a key={item.to} href={item.to} target="_blank" rel="noopener noreferrer" className="px-4 py-1.5 text-sm font-medium hover:bg-gray-50 transition-colors" style={{ color: '#4A5E80', fontFamily: "'Libre Baskerville', Georgia, serif", textDecoration: 'none' }}>
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
                      <a key={item.to} href={item.to} target="_blank" rel="noopener noreferrer" className="px-4 py-1.5 text-sm font-medium hover:bg-gray-50 transition-colors" style={{ color: '#4A5E80', fontFamily: "'Libre Baskerville', Georgia, serif", textDecoration: 'none' }}>
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
                  style={{ background: 'transparent', color: '#0F172A', fontSize: '13px', fontWeight: 600, fontFamily: "'Libre Baskerville', Georgia, serif", padding: '8px 20px', borderRadius: '100px', border: '1px solid rgba(37,99,235,0.2)', cursor: 'pointer', transition: 'all 0.15s ease' }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(0,0,0,0.03)'; e.currentTarget.style.borderColor = 'rgba(37,99,235,0.35)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'rgba(37,99,235,0.2)'; }}
                >
                  Sign in
                </button>
                <button
                  onClick={() => navigate('/signin?mode=signup')}
                  style={{ background: '#2563EB', color: '#fff', fontSize: '13px', fontWeight: 600, fontFamily: "'Libre Baskerville', Georgia, serif", padding: '8px 20px', borderRadius: '3px', border: 'none', cursor: 'pointer', transition: 'background 0.15s ease', flexShrink: 0, whiteSpace: 'nowrap' }}
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
            <button onClick={() => { scrollToFeatures(); setMobileMenuOpen(false); }} className="text-left px-4 py-3 text-sm font-medium rounded-lg hover:bg-gray-50" style={{ color: '#4A5E80', fontFamily: "'Libre Baskerville', Georgia, serif" }}>Features</button>
            <button onClick={() => { scrollToSection('extension'); setMobileMenuOpen(false); }} className="text-left px-4 py-3 text-sm font-medium rounded-lg hover:bg-gray-50" style={{ color: '#4A5E80', fontFamily: "'Libre Baskerville', Georgia, serif" }}>Extension</button>
            <button onClick={() => { scrollToSection('testimonials'); setMobileMenuOpen(false); }} className="text-left px-4 py-3 text-sm font-medium rounded-lg hover:bg-gray-50" style={{ color: '#4A5E80', fontFamily: "'Libre Baskerville', Georgia, serif" }}>Reviews</button>
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
                <a key={item.to} href={item.to} target="_blank" rel="noopener noreferrer" className="block text-left px-4 py-2.5 text-sm font-medium rounded-lg hover:bg-gray-50" style={{ color: '#4A5E80', fontFamily: "'Libre Baskerville', Georgia, serif", textDecoration: 'none' }}>
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
                <a key={item.to} href={item.to} target="_blank" rel="noopener noreferrer" className="block text-left px-4 py-2.5 text-sm font-medium rounded-lg hover:bg-gray-50" style={{ color: '#4A5E80', fontFamily: "'Libre Baskerville', Georgia, serif", textDecoration: 'none' }}>
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
                <a key={item.to} href={item.to} target="_blank" rel="noopener noreferrer" className="block text-left px-4 py-2.5 text-sm font-medium rounded-lg hover:bg-gray-50" style={{ color: '#4A5E80', fontFamily: "'Libre Baskerville', Georgia, serif", textDecoration: 'none' }}>
                  {item.label}
                </a>
              ))}
            </div>
            <button onClick={() => { navigate('/signin?mode=signup'); setMobileMenuOpen(false); }} className="text-left px-4 py-3 text-sm font-medium rounded-lg hover:bg-gray-50" style={{ color: '#4A5E80', fontFamily: "'Libre Baskerville', Georgia, serif" }}>Get started</button>
            <div className="border-t mt-2 pt-2" style={{ borderColor: 'rgba(37,99,235,0.08)' }}>
              {user ? (
                <button onClick={() => { navigate('/find'); setMobileMenuOpen(false); }} className="btn-primary-lg w-full" style={{ borderRadius: '3px' }}>Find people</button>
              ) : (
                <button onClick={() => { navigate('/signin?mode=signup'); setMobileMenuOpen(false); }} className="w-full text-center py-3 text-sm font-semibold" style={{ background: '#2563EB', color: '#fff', borderRadius: '3px', fontFamily: "'Libre Baskerville', Georgia, serif" }}>Create account</button>
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
          background: '#E8F1FB',
        }}
      >

        <div className="relative mx-auto text-center" style={{ zIndex: 1, maxWidth: 820 }}>

          <h1
            className="hero-fade-up hero-fade-up-delay-1 hero-headline"
            style={{ fontFamily: "'Libre Baskerville', Georgia, serif", fontSize: 'clamp(44px, 6.5vw, 72px)', fontWeight: 400, lineHeight: 1.15, letterSpacing: '-0.02em', color: '#0f2545', marginBottom: 0 }}
          >
            Outreach is hard enough.<br /><span style={{ color: '#2563EB' }}>Eliminate the busywork.</span>
          </h1>

          <p className="hero-fade-up hero-fade-up-delay-3" style={{ fontFamily: "'Inter', sans-serif", fontSize: 18, lineHeight: 1.6, color: '#6B7280', maxWidth: 560, margin: '24px auto 32px' }}>
            Find verified emails, generate personalized outreach, and track every conversation — all in one place.
          </p>

          {/* CTA Buttons */}
          <div className="hero-fade-up hero-fade-up-delay-4 flex justify-center">
            <button
              onClick={() => navigate('/signin?mode=signup')}
              style={{ background: '#2563EB', color: '#fff', fontFamily: "'Libre Baskerville', Georgia, serif", fontWeight: 600, borderRadius: '3px', padding: '13px 28px', boxShadow: '0 2px 12px rgba(37,99,235,.25)', border: 'none', cursor: 'pointer', fontSize: '14px', transition: 'background 0.15s ease' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#1D4ED8'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = '#2563EB'; }}
            >
              Create account
            </button>
          </div>

          <div style={{ marginTop: 48 }}>
            <FeatureShowcase />
          </div>

        </div>
      </section>

      {/* ═══════════════ UNIVERSITY LOGO CAROUSEL ═══════════════ */}
      <section style={{ background: '#ffffff', padding: '80px 0 40px', borderTop: '1px solid #EEF2F8', textAlign: 'center', overflow: 'hidden' }}>
        <div style={{ maxWidth: 700, margin: '0 auto', padding: '0 24px', marginBottom: 56 }}>
          <h2 style={{ fontFamily: "'Libre Baskerville', Georgia, serif", fontSize: 'clamp(28px, 4.5vw, 44px)', fontWeight: 400, lineHeight: 1.2, color: '#0f2545' }}>
            Trusted by students at<br />the country's top universities
          </h2>
        </div>
        <div style={{ position: 'relative' }}>
          {/* Fade edges */}
          <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 220, background: 'linear-gradient(90deg, #ffffff 20%, transparent)', zIndex: 1, pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 220, background: 'linear-gradient(270deg, #ffffff 20%, transparent)', zIndex: 1, pointerEvents: 'none' }} />
          <div className="logo-carousel" style={{ display: 'flex', gap: 20, width: 'max-content' }}>
            {[...Array(2)].map((_, setIdx) => (
              <div key={setIdx} className="logo-carousel-track" style={{ display: 'flex', gap: 20, flexShrink: 0 }}>
                {([
                  { name: 'USC', logo: uscLogo },
                  { name: 'UCLA', logo: uclaLogo },
                  { name: 'UC Berkeley', logo: berkeleyLogo },
                  { name: 'Stanford', logo: stanfordLogo },
                  { name: 'UW', logo: uwLogo },
                  { name: 'NYU', logo: nyuLogo },
                  { name: 'Georgetown', logo: georgetownLogo },
                  { name: 'Michigan', logo: michiganLogo },
                  { name: 'Wharton', logo: whartonLogo },
                  { name: 'Notre Dame', logo: notreDameLogo },
                  { name: 'Dartmouth', logo: dartmouthLogo },
                ] as const).map((school) => (
                  <div key={`${setIdx}-${school.name}`} style={{ borderRadius: 12, border: '0.5px solid #e5e7eb', padding: '12px 20px', background: '#fff', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', width: 160, height: 72 }}>
                    <img src={school.logo} alt={school.name} style={{ maxHeight: 44, maxWidth: 120, width: 'auto', height: 'auto', objectFit: 'contain', display: 'block' }} />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════ STATS CREST ═══════════════ */}
      <div style={{ background: '#ffffff', padding: '56px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        {/* Top ornament */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 28, width: '100%', maxWidth: 400 }}>
          <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, transparent, #cbd5e1)' }} />
          <svg width="20" height="12" viewBox="0 0 20 12" fill="none">
            <path d="M10 0L13 4H7L10 0Z" fill="#2563EB" opacity=".3"/>
            <path d="M10 12L7 8H13L10 12Z" fill="#2563EB" opacity=".3"/>
            <circle cx="3" cy="6" r="1.5" fill="#cbd5e1"/>
            <circle cx="17" cy="6" r="1.5" fill="#cbd5e1"/>
          </svg>
          <div style={{ flex: 1, height: 1, background: 'linear-gradient(270deg, transparent, #cbd5e1)' }} />
        </div>

        {/* Numbers */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 56, alignItems: 'center' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontFamily: "'Libre Baskerville', Georgia, serif", fontSize: 'clamp(36px, 5vw, 52px)', fontWeight: 400, color: '#2563EB', lineHeight: 1 }}>2.2B+</div>
            <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: '#94a3b8', marginTop: 8, letterSpacing: '.06em', textTransform: 'uppercase' }}>verified contacts</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 1, height: 20, background: 'linear-gradient(to bottom, transparent, #cbd5e1)' }} />
            <div style={{ width: 5, height: 5, borderRadius: '50%', border: '1px solid #cbd5e1' }} />
            <div style={{ width: 1, height: 20, background: 'linear-gradient(to top, transparent, #cbd5e1)' }} />
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontFamily: "'Libre Baskerville', Georgia, serif", fontSize: 'clamp(36px, 5vw, 52px)', fontWeight: 400, color: '#2563EB', lineHeight: 1 }}>2,400+</div>
            <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: '#94a3b8', marginTop: 8, letterSpacing: '.06em', textTransform: 'uppercase' }}>students</div>
          </div>
        </div>

        {/* Bottom ornament */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 28, width: '100%', maxWidth: 400 }}>
          <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, transparent, #cbd5e1)' }} />
          <svg width="20" height="8" viewBox="0 0 20 8" fill="none">
            <path d="M0 4Q5 0 10 4Q15 8 20 4" stroke="#cbd5e1" strokeWidth="1" fill="none"/>
          </svg>
          <div style={{ flex: 1, height: 1, background: 'linear-gradient(270deg, transparent, #cbd5e1)' }} />
        </div>
      </div>

      {/* ═══════════════ CHAPTER I: HOW IT WORKS ═══════════════ */}
      <section id="how-it-works" className="relative px-6 md:px-12" style={{ padding: '72px 64px 60px', background: '#ffffff' }}>

        <div style={{ position: 'relative', zIndex: 1, maxWidth: 760, margin: '0 auto', textAlign: 'center' }}>
          <h2 style={{ fontFamily: "'Libre Baskerville', Georgia, serif", fontSize: 'clamp(32px, 5vw, 52px)', fontWeight: 400, lineHeight: 1.1, letterSpacing: '-.025em', color: '#0f2545', marginBottom: 0 }}>
            How It Works
          </h2>
          <div style={{ height: 1.5, background: 'linear-gradient(90deg, #2563EB, #60A5FA, transparent)', maxWidth: 200, margin: '10px auto 16px' }} />
          <p style={{ fontFamily: "'Libre Baskerville', Georgia, serif", fontSize: 16, lineHeight: 1.75, color: '#6B7280', maxWidth: 640, margin: '0 auto 48px' }}>
            Prompt the type of person you want to talk to and instantly have personalized emails created in your drafts ready to send. At the same time their information is stored into a networking tracker spreadsheet.
          </p>

          <div style={{ maxWidth: 900, margin: '0 auto', borderRadius: 4, overflow: 'hidden', border: '1px solid #E2E8F0', boxShadow: '0 2px 4px rgba(0,0,0,.03), 0 8px 24px rgba(37,99,235,.06)' }}>
            <video src={HowItWorksVideo} autoPlay loop muted playsInline className="w-full rounded-xl" style={{ display: 'block' }} />
          </div>
        </div>
      </section>

      {/* Chrome Extension */}
      <section id="extension" className="relative px-6 md:px-12" style={{ padding: '72px 64px 60px', borderTop: '1px solid #EEF2F8', background: '#E8F1FB', overflow: 'hidden' }}>
        {/* Large faded Chrome logo */}

        <div style={{ position: 'relative', zIndex: 1, maxWidth: 760, margin: '0 auto', textAlign: 'center' }}>
          <h2 style={{ fontFamily: "'Libre Baskerville', Georgia, serif", fontSize: 'clamp(32px, 5vw, 52px)', fontWeight: 400, lineHeight: 1.1, letterSpacing: '-.025em', color: '#0f2545', marginBottom: 0 }}>
            Works right inside LinkedIn
          </h2>
          <div style={{ height: 1.5, background: 'linear-gradient(90deg, #2563EB, #60A5FA, transparent)', maxWidth: 200, margin: '10px auto 16px' }} />
          <p style={{ fontFamily: "'Libre Baskerville', Georgia, serif", fontSize: 16, lineHeight: 1.75, color: '#6B7280', maxWidth: 540, margin: '0 auto 32px' }}>
            Write emails to anyone from their profile. Find hiring managers on any job posting. All from a single Chrome extension.
          </p>

          <a
            href={CHROME_EXTENSION_URL}
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 10, background: '#2563EB', color: '#fff', textDecoration: 'none', fontFamily: "'Libre Baskerville', Georgia, serif", fontWeight: 600, fontSize: 14, padding: '13px 28px', borderRadius: 3, border: 'none', cursor: 'pointer', transition: 'background 0.15s ease' }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = '#1D4ED8'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = '#2563EB'; }}
          >
            <img src={ChromeIcon} alt="" style={{ width: 18, height: 18, objectFit: 'contain' }} />
            Add to Chrome — it's free
          </a>

          <div style={{ maxWidth: 900, margin: '56px auto 0' }}>
            <div style={{ borderRadius: 4, overflow: 'hidden', border: '1px solid #E2E8F0', boxShadow: '0 2px 4px rgba(0,0,0,.03), 0 8px 24px rgba(37,99,235,.06)' }}>
              <img src={ChromeExtensionPic} alt="Offerloop Chrome extension on a LinkedIn profile" style={{ width: '100%', display: 'block', objectFit: 'cover', objectPosition: 'top left' }} />
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════ COMPARISON ═══════════════ */}
      <section id="comparison" style={{ borderTop: '1px solid #EEF2F8', background: '#ffffff' }}>
        <TimeComparison />
      </section>

      {/* ═══════════════ CHAPTER III: FEATURES ═══════════════ */}
      <section id="features" className="relative px-6 md:px-12" style={{ padding: '72px 64px 60px', borderTop: '1px solid #EEF2F8', background: '#E8F1FB' }}>

        <div style={{ position: 'relative', zIndex: 1, maxWidth: 760, margin: '0 auto', textAlign: 'center' }}>
          <h2 className="reveal" style={{ fontFamily: "'Libre Baskerville', Georgia, serif", fontSize: 'clamp(32px, 5vw, 52px)', fontWeight: 400, lineHeight: 1.1, letterSpacing: '-.025em', color: '#0f2545', marginBottom: 0 }}>
            Everything You Need to Network Smarter
          </h2>
          <div style={{ height: 1.5, background: 'linear-gradient(90deg, #2563EB, #60A5FA, transparent)', maxWidth: 200, margin: '10px auto 16px' }} />
        </div>

        <div className="max-w-5xl mx-auto" style={{ display: 'flex', flexDirection: 'column', gap: 80, marginTop: 64, position: 'relative', zIndex: 1 }}>
          {[
            { title: 'Find Hiring Managers', description: "Paste a job posting URL and we'll find the recruiters and hiring managers for that role.", image: FindHiringManagerImg },
            { title: 'Manage Emails', description: "Track every email you've sent, see who opened it, who replied, and who needs a follow-up.", image: EmailOutreachImg },
            { title: 'Coffee Chat Prep', description: "Paste a LinkedIn URL and get a personalized prep sheet with talking points, recent news, and smart questions.", image: CoffeeChatImg },
            { title: 'Find Company', description: "Describe the type of companies you're looking for in plain English and we'll find them for you.", image: FindCompanyImg },
          ].map((feature, i) => {
            const isTextLeft = i % 2 === 0;
            return (
              <div key={feature.title} className="reveal" style={{ display: 'flex', flexDirection: isTextLeft ? 'row' : 'row-reverse', alignItems: 'center', gap: 48, flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 340px', minWidth: 0 }}>
                  <h3 style={{ fontFamily: "'Libre Baskerville', Georgia, serif", fontSize: 22, fontWeight: 400, color: '#0f2545', marginBottom: 0 }}>
                    {feature.title}
                  </h3>
                  <div style={{ height: 1, background: 'linear-gradient(90deg, #DBEAFE, transparent)', width: 80, margin: '8px 0 10px' }} />
                  <p style={{ fontFamily: "'Libre Baskerville', Georgia, serif", fontSize: 15, lineHeight: 1.75, color: '#6B7280' }}>
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

      {/* ═══════════════ BULLETIN BOARD ═══════════════ */}
      <BulletinBoard />

      {/* FOOTER */}
      <footer style={{ background: '#ffffff', borderTop: '1px solid #EEF2F8' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '64px 32px 0' }}>
          {/* Top: Logo + Link Columns */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 64, alignItems: 'start' }}>
            {/* Logo */}
            <div>
              <img src={OfferloopLogo} alt="Offerloop" style={{ height: 160, cursor: 'pointer' }} onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} />
            </div>

            {/* Features */}
            <div>
              <p style={{ fontFamily: "'Libre Baskerville', Georgia, serif", fontSize: 13, fontWeight: 700, color: '#0f2545', marginBottom: 16 }}>Features</p>
              {[
                { label: 'Find People', path: '/find' },
                { label: 'Coffee Chat Prep', path: '/coffee-chat-prep' },
                { label: 'Interview Prep', path: '/interview-prep' },
                { label: 'Chrome Extension', href: CHROME_EXTENSION_URL },
                { label: 'Job Board', path: '/job-board' },
              ].map((link) => (
                'href' in link ? (
                  <a key={link.label} href={link.href} target="_blank" rel="noopener noreferrer" style={{ display: 'block', fontFamily: "'Libre Baskerville', Georgia, serif", fontSize: 13, color: '#64748b', textDecoration: 'none', marginBottom: 12, transition: 'color .15s' }} onMouseEnter={(e) => { e.currentTarget.style.color = '#2563EB'; }} onMouseLeave={(e) => { e.currentTarget.style.color = '#64748b'; }}>{link.label}</a>
                ) : (
                  <Link key={link.label} to={link.path!} style={{ display: 'block', fontFamily: "'Libre Baskerville', Georgia, serif", fontSize: 13, color: '#64748b', textDecoration: 'none', marginBottom: 12, transition: 'color .15s' }} onMouseEnter={(e) => { e.currentTarget.style.color = '#2563EB'; }} onMouseLeave={(e) => { e.currentTarget.style.color = '#64748b'; }}>{link.label}</Link>
                )
              ))}
            </div>

            {/* Company */}
            <div>
              <p style={{ fontFamily: "'Libre Baskerville', Georgia, serif", fontSize: 13, fontWeight: 700, color: '#0f2545', marginBottom: 16 }}>Company</p>
              {[
                { label: 'About', path: '/about' },
                { label: 'Blog', path: '/blog' },
                { label: 'Contact Us', path: '/contact-us' },
                { label: 'Privacy', path: '/privacy' },
                { label: 'Terms of Service', path: '/terms-of-service' },
              ].map((link) => (
                <Link key={link.label} to={link.path} style={{ display: 'block', fontFamily: "'Libre Baskerville', Georgia, serif", fontSize: 13, color: '#64748b', textDecoration: 'none', marginBottom: 12, transition: 'color .15s' }} onMouseEnter={(e) => { e.currentTarget.style.color = '#2563EB'; }} onMouseLeave={(e) => { e.currentTarget.style.color = '#64748b'; }}>{link.label}</Link>
              ))}
            </div>
          </div>

          {/* Divider */}
          <div style={{ height: 1, background: '#EEF2F8', margin: '48px 0 24px' }} />

          {/* Bottom: Social + Copyright */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 32 }}>
            <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
              <a href="https://www.linkedin.com/company/offerloop" target="_blank" rel="noopener noreferrer" aria-label="LinkedIn" style={{ color: '#94A3B8', transition: 'color .15s' }} onMouseEnter={(e) => { e.currentTarget.style.color = '#2563EB'; }} onMouseLeave={(e) => { e.currentTarget.style.color = '#94A3B8'; }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
              </a>
              <a href="https://twitter.com/offerloop" target="_blank" rel="noopener noreferrer" aria-label="X / Twitter" style={{ color: '#94A3B8', transition: 'color .15s' }} onMouseEnter={(e) => { e.currentTarget.style.color = '#2563EB'; }} onMouseLeave={(e) => { e.currentTarget.style.color = '#94A3B8'; }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
              </a>
              <a href="https://www.instagram.com/offerloop" target="_blank" rel="noopener noreferrer" aria-label="Instagram" style={{ color: '#94A3B8', transition: 'color .15s' }} onMouseEnter={(e) => { e.currentTarget.style.color = '#2563EB'; }} onMouseLeave={(e) => { e.currentTarget.style.color = '#94A3B8'; }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
              </a>
              <a href="https://www.tiktok.com/@offerloop" target="_blank" rel="noopener noreferrer" aria-label="TikTok" style={{ color: '#94A3B8', transition: 'color .15s' }} onMouseEnter={(e) => { e.currentTarget.style.color = '#2563EB'; }} onMouseLeave={(e) => { e.currentTarget.style.color = '#94A3B8'; }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 00-.79-.05A6.34 6.34 0 003.15 15.2a6.34 6.34 0 0010.86 4.46V13a8.28 8.28 0 005.58 2.17V11.7a4.85 4.85 0 01-3.77-1.85V6.69h3.77z"/></svg>
              </a>
            </div>
            <p style={{ fontFamily: "'Libre Baskerville', Georgia, serif", fontSize: 12, color: '#CBD5E1' }}>
              © 2026 Offerloop. All rights reserved.
            </p>
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
        @keyframes logo-scroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-100%); }
        }
        .logo-carousel-track {
          animation: logo-scroll 30s linear infinite;
        }
        @keyframes testimonial-scroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-100%); }
        }
        .testimonial-carousel-track {
          animation: testimonial-scroll 45s linear infinite;
        }
        .hero-drop-cap::first-letter {
          font-size: 3.2em;
          font-weight: 700;
          font-style: normal;
          color: #0f2545;
          float: left;
          line-height: .78;
          margin: 4px 6px -4px 0;
        }
      `}</style>
    </div>
  );
};

export default Index;
