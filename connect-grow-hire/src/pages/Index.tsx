// src/pages/Index.tsx
import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowRight, Menu, X } from 'lucide-react';
import { useFirebaseAuth } from "../contexts/FirebaseAuthContext";
import OfferloopLogo from '@/assets/offerloop_logo2.png';
import CoffeeChatPrepSS from '@/assets/coffeechatprepss.png';
import SearchIcon from '@/assets/sidebaricons/icons8-magnifying-glass-50.png';
import TrackIcon from '@/assets/sidebaricons/icons8-important-mail-48.png';
import CoffeeIcon from '@/assets/sidebaricons/icons8-cup-48.png';
import InterviewIcon from '@/assets/sidebaricons/icons8-briefcase-48.png';
import ChromeExtensionPic from '@/assets/Chrome_extensionpic.png';
import ExtensionLogo from '@/assets/extension.png';

const CHROME_EXTENSION_URL = 'https://chromewebstore.google.com/detail/offerloop/aabnjgecmobcnnhkilbeocggbmgilpcl';

const Index = () => {
  const navigate = useNavigate();
  const { user } = useFirebaseAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [navbarScrolled, setNavbarScrolled] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [konamiActivated, setKonamiActivated] = useState(false);
  const heroRef = useRef<HTMLDivElement>(null);
  const dashboardRef = useRef<HTMLDivElement>(null);

  // Navbar scroll behavior, scroll progress, and back to top
  useEffect(() => {
    const handleScroll = () => {
      setNavbarScrolled(window.scrollY > 50);
      setShowBackToTop(window.scrollY > 600); // Show after scrolling past hero
      
      // Scroll progress tracking
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
          // Reset after animation
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

  return (
    <div className="min-h-screen w-full" style={{ fontFamily: 'var(--font-body)', background: 'var(--bg-white)' }}>
      {/* Scroll Progress Bar */}
      <div 
        className="scroll-progress" 
        style={{ width: `${scrollProgress}%` }} 
      />
      
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
      
      {/* NAVBAR */}
      <header
        className="fixed top-0 left-0 right-0 z-50 h-16 flex items-center justify-between px-6 md:px-12"
        style={{
          background: navbarScrolled
            ? 'rgba(248, 250, 255, 0.96)'
            : 'rgba(248, 250, 255, 0.88)',
          backdropFilter: 'blur(16px) saturate(1.4)',
          WebkitBackdropFilter: 'blur(16px) saturate(1.4)',
          borderBottom: `1px solid ${navbarScrolled ? 'rgba(214, 222, 240, 0.8)' : 'rgba(214, 222, 240, 0.6)'}`,
          transition: 'all 0.3s ease',
        }}
      >
        <div className="flex items-center">
          <img
            src={OfferloopLogo}
            alt="Offerloop"
            className="h-12 cursor-pointer logo-animate"
            onClick={() => navigate('/')}
          />
        </div>

        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center gap-8">
          <button
            onClick={scrollToFeatures}
            className="nav-link text-sm font-medium relative"
            style={{
              color: 'var(--text-secondary)',
              fontFamily: 'var(--font-body)',
            }}
          >
            Features
          </button>
          <button
            onClick={() => {
              const element = document.getElementById('testimonials');
              if (element) element.scrollIntoView({ behavior: 'smooth' });
            }}
            className="nav-link text-sm font-medium relative"
            style={{
              color: 'var(--text-secondary)',
              fontFamily: 'var(--font-body)',
            }}
          >
            Reviews
          </button>
          <button
            onClick={() => navigate('/signin?mode=signup')}
            className="nav-link text-sm font-medium relative"
            style={{
              color: 'var(--text-secondary)',
              fontFamily: 'var(--font-body)',
            }}
          >
            Get started
          </button>
        </nav>

        {/* Desktop Auth Buttons */}
        <div className="hidden md:flex items-center gap-4">
          {user ? (
            <button
              onClick={() => navigate('/contact-search')}
              className="btn-ghost"
            >
              Find people
            </button>
          ) : (
            <>
              <button
                onClick={() => navigate('/signin?mode=signin')}
                className="btn-ghost"
              >
                Sign in
              </button>
              <button
                onClick={() => navigate('/signin?mode=signup')}
                className="btn-primary-lg"
                style={{
                  background: '#2563EB',
                }}
              >
                Create account
              </button>
            </>
          )}
        </div>

        {/* Mobile Menu Button */}
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="md:hidden p-2"
          style={{ color: 'var(--text-secondary)' }}
        >
          {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </header>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div
          className="fixed top-16 left-0 right-0 md:hidden z-40"
          style={{
            background: 'var(--bg-white)',
            borderBottom: '1px solid var(--border-light)',
            backdropFilter: 'blur(16px)',
          }}
        >
          <nav className="flex flex-col p-4 gap-2">
            <button
              onClick={() => {
                scrollToFeatures();
                setMobileMenuOpen(false);
              }}
              className="text-left px-4 py-3 text-sm font-medium"
              style={{ color: 'var(--text-secondary)' }}
            >
              Features
            </button>
            <button
              onClick={() => {
                const element = document.getElementById('testimonials');
                if (element) element.scrollIntoView({ behavior: 'smooth' });
                setMobileMenuOpen(false);
              }}
              className="text-left px-4 py-3 text-sm font-medium"
              style={{ color: 'var(--text-secondary)' }}
            >
              Reviews
            </button>
            <button
              onClick={() => {
                navigate('/signin?mode=signup');
                setMobileMenuOpen(false);
              }}
              className="text-left px-4 py-3 text-sm font-medium"
              style={{ color: 'var(--text-secondary)' }}
            >
              Get started
            </button>
            <div className="border-t border-light mt-2 pt-2 flex flex-col gap-2">
              {user ? (
                <button
                  onClick={() => {
                    navigate('/contact-search');
                    setMobileMenuOpen(false);
                  }}
                  className="btn-primary-lg w-full"
                >
                  Find people
                </button>
              ) : (
                <>
                  <button
                    onClick={() => {
                      navigate('/signin?mode=signin');
                      setMobileMenuOpen(false);
                    }}
                    className="btn-ghost w-full text-left px-4 py-3"
                  >
                    Sign in
                  </button>
                  <button
                    onClick={() => {
                      navigate('/signin?mode=signup');
                      setMobileMenuOpen(false);
                    }}
                    className="btn-primary-lg w-full"
                  >
                    Create account
                  </button>
                </>
              )}
            </div>
          </nav>
        </div>
      )}

      {/* Spacer for fixed header */}
      <div className="h-16" />

      {/* SECTION 1: HERO */}
      <section
        ref={heroRef}
        className="relative pt-[72px] pb-[100px] px-6 md:px-12"
        style={{
          background: 'var(--bg-white)',
        }}
      >
        {/* Subtle radial glow - soft color accents */}
        <div
          className="absolute top-[-120px] right-[-200px] w-[700px] h-[700px] rounded-full pointer-events-none"
          style={{
            background: 'radial-gradient(circle, rgba(37, 99, 235, 0.08) 0%, rgba(59, 130, 246, 0.04) 40%, transparent 70%)',
          }}
        />
        <div
          className="absolute top-[150px] left-[-100px] w-[400px] h-[400px] rounded-full pointer-events-none opacity-60"
          style={{
            background: 'radial-gradient(circle, rgba(6, 182, 212, 0.05) 0%, transparent 70%)',
          }}
        />

        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-[1fr_1.15fr] gap-[72px] items-center">
          {/* Left Column - Text */}
          <div style={{ marginTop: '-40px' }}>
            <h1
              className="hero-fade-up hero-fade-up-delay-1 hero-headline"
              style={{
                fontFamily: "'Instrument Serif', Georgia, serif",
                fontSize: '68px',
                fontWeight: 400,
                lineHeight: 1.04,
                letterSpacing: '-0.035em',
                color: 'var(--text-primary)',
                marginBottom: '28px',
              }}
            >
              Get connected.<br />
              <span style={{ color: '#2563EB' }}>Get recruited.</span>
            </h1>
            <p
              className="hero-fade-up hero-fade-up-delay-3"
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: '17px',
                lineHeight: 1.7,
                color: 'var(--text-secondary)',
                marginBottom: 40,
                maxWidth: '440px',
              }}
            >
              Find the right people, send the right message, and walk into every conversation prepared. Offerloop replaces your spreadsheets, your browser tabs, and your guesswork.
            </p>
            <div className="hero-fade-up hero-fade-up-delay-4 flex flex-col sm:flex-row gap-3">
              <button
                onClick={() => navigate('/signin?mode=signup')}
                className="btn-primary-lg"
                style={{
                  background: '#2563EB',
                }}
              >
                Create free account
              </button>
              <button
                onClick={scrollToFeatures}
                className="btn-ghost flex items-center gap-2 group"
                style={{
                  padding: '14px 12px',
                  fontSize: '14px',
                }}
              >
                See how it works
                <ArrowRight className="h-3.5 w-3.5 group-hover:translate-y-[3px] transition-transform" />
              </button>
            </div>
            <div className="hero-fade-up hero-fade-up-delay-4" style={{ marginTop: '32px', display: 'flex', alignItems: 'center', gap: '16px' }}>
              <a
                href={CHROME_EXTENSION_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="group inline-flex items-center gap-3"
                style={{
                  padding: '13px 24px',
                  borderRadius: '11px',
                  background: 'white',
                  border: '1px solid rgba(37, 99, 235, 0.15)',
                  color: '#2563EB',
                  fontSize: '14px',
                  fontWeight: 600,
                  fontFamily: 'var(--font-body)',
                  textDecoration: 'none',
                  boxShadow: '0 1px 4px rgba(0, 0, 0, 0.04)',
                  transition: 'all 0.2s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(37, 99, 235, 0.3)';
                  e.currentTarget.style.boxShadow = '0 4px 16px rgba(37, 99, 235, 0.12)';
                  e.currentTarget.style.transform = 'translateY(-1px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(37, 99, 235, 0.15)';
                  e.currentTarget.style.boxShadow = '0 1px 4px rgba(0, 0, 0, 0.04)';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                <img src={ExtensionLogo} alt="" style={{ width: 18, height: 18, objectFit: 'contain' }} />
                Add to Chrome — it's free
                <ArrowRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
              </a>
              <span style={{ fontSize: '13px', color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}>
                Works on any LinkedIn profile
              </span>
            </div>
          </div>

          {/* Right Column - Product Visual */}
          <div
            ref={dashboardRef}
            className="hero-fade-up hero-fade-up-delay-3 relative"
            style={{
              perspective: '1200px',
              transition: 'transform 0.3s ease-out',
            }}
          >
            {/* Soft glow behind screenshot */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background: 'radial-gradient(ellipse at center, rgba(37, 99, 235, 0.08) 0%, transparent 70%)',
                transform: 'scale(1.3)',
                filter: 'blur(40px)',
                zIndex: 0,
              }}
            />
            <div
              className="hero-product relative rounded-[14px] overflow-hidden"
              style={{
                background: 'var(--bg-off)',
                border: '1px solid var(--border)',
                boxShadow: '0 1px 2px rgba(0,0,0,0.03), 0 4px 12px rgba(0,0,0,0.04), 0 16px 40px rgba(0,0,0,0.06)',
                display: 'flex',
                flexDirection: 'column',
                transition: 'transform 0.4s ease, box-shadow 0.4s ease',
                position: 'relative',
                zIndex: 1,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.04), 0 8px 24px rgba(0,0,0,0.06), 0 24px 60px rgba(37, 99, 235, 0.12)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,0.03), 0 4px 12px rgba(0,0,0,0.04), 0 16px 40px rgba(0,0,0,0.06)';
              }}
            >
              {/* Screenshot */}
              <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
                <img
                  src={ChromeExtensionPic}
                  alt="Offerloop Chrome extension on a LinkedIn profile"
                  style={{
                    width: '100%',
                    display: 'block',
                    objectFit: 'cover',
                    objectPosition: 'top left',
                  }}
                />
                {/* Soft bottom fade */}
                <div
                  style={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    height: 80,
                    background: 'linear-gradient(to top, var(--bg-off) 0%, transparent 100%)',
                    pointerEvents: 'none',
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 2: TRUST */}
      <section
        className="px-6 md:px-12"
        style={{
          padding: '56px 0 64px',
          background: 'var(--bg-white)',
          borderTop: '1px solid var(--border-light)',
        }}
      >
        <div className="max-w-7xl mx-auto">
          <p
            className="text-center reveal"
            style={{
              fontSize: '12px',
              fontWeight: 600,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--text-tertiary)',
              marginBottom: '24px',
            }}
          >
            TRUSTED BY STUDENTS FROM
          </p>
            <div className="flex flex-wrap items-center justify-center reveal" style={{ gap: '32px 44px', marginBottom: '16px' }}>
            {[
              { name: 'USC', colors: ['#990000', '#FFCC00'] }, // Cardinal Red & Gold
              { name: 'UCLA', colors: ['#2774AE', '#FFD100'] }, // Blue & Gold
              { name: 'NYU', colors: ['#57068C'] }, // Purple
              { name: 'Michigan', colors: ['#00274C', '#FFCB05'] }, // Blue & Maize
              { name: 'UC Berkeley', colors: ['#003262', '#FDB515'] }, // Blue & Gold
              { name: 'UCSD', colors: ['#182B49', '#C69214'] }, // Blue & Gold
              { name: 'UC Irvine', colors: ['#0064A4', '#FFC72C'] }, // Blue & Gold
            ].map((school, index) => (
              <div
                key={school.name}
                className="stagger-item text-base font-bold transition-all cursor-default"
                style={{
                  opacity: 0.7,
                  fontFamily: 'var(--font-body)',
                  fontWeight: 600,
                  letterSpacing: '-0.01em',
                  background: school.colors.length > 1 
                    ? `linear-gradient(135deg, ${school.colors[0]} 0%, ${school.colors[1]} 100%)`
                    : school.colors[0],
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                  color: 'transparent',
                  animationDelay: `${index * 60}ms`,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.opacity = '1';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.opacity = '0.7';
                }}
              >
                {school.name}
              </div>
            ))}
          </div>
          <div
            className="reveal"
            style={{ 
              width: '40px', 
              height: '2px',
              background: 'linear-gradient(90deg, transparent, var(--border), transparent)',
              margin: '36px auto',
            }}
          />
          <p
            className="text-center reveal"
            style={{
              fontSize: '12px',
              fontWeight: 600,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--text-tertiary)',
              marginBottom: '24px',
            }}
          >
            PREPARING FOR ROLES AT
          </p>
          <div className="flex flex-wrap items-center justify-center reveal" style={{ gap: '32px 44px', marginBottom: '16px' }}>
            {[
              'Goldman Sachs',
              'McKinsey',
              'Evercore', 
              'Blackstone',
              'J.P. Morgan',
              'PwC',
              'Barclays',
              'Morgan Stanley',
            ].map((company, index) => (
              <div
                key={company}
                className="stagger-item transition-all cursor-default"
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: '15px',
                  fontWeight: 600,
                  letterSpacing: '-0.02em',
                  color: 'var(--text-primary)',
                  opacity: 0.25,
                  animationDelay: `${(index + 7) * 60}ms`, // Continue from schools
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.opacity = '0.6';
                  e.currentTarget.style.transform = 'translateY(-1px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.opacity = '0.25';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                {company}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* SECTION 3: PROBLEM → SOLUTION */}
      <section
        className="py-[110px] px-6 md:px-12"
        style={{ background: 'var(--bg-white)' }}
      >
        <div className="max-w-7xl mx-auto">
          <p
            className="text-center reveal"
            style={{
              fontSize: '12px',
              fontWeight: 600,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--text-tertiary)',
              fontFamily: 'var(--font-body)',
              marginBottom: '12px',
            }}
          >
            How it works
          </p>
          <div className="flex flex-wrap items-center justify-center gap-8 md:gap-12 mb-16 reveal" style={{ fontFamily: 'var(--font-body)' }}>
            <div className="flex items-center gap-2">
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--blue)' }}>01</span>
              <span style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>Search</span>
              <span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>— Find contacts at any company</span>
            </div>
            <div className="flex items-center gap-2">
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--blue)' }}>02</span>
              <span style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>Reach out</span>
              <span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>— Send personalized emails in seconds</span>
            </div>
            <div className="flex items-center gap-2">
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--blue)' }}>03</span>
              <span style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>Prepare</span>
              <span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>— Walk into every conversation ready</span>
            </div>
          </div>
          <h2
            className="text-center mb-16 reveal"
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '40px',
              fontWeight: 400,
              letterSpacing: '-0.025em',
              color: 'var(--text-primary)',
            }}
          >
            Why this exists
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-[1fr_48px_1fr] gap-8 max-w-[860px] mx-auto">
            {/* Left Column - Problem */}
            <div className="reveal-stagger">
              <h3
                className="text-xs font-bold mb-6 reveal"
                style={{
                  fontSize: '13px',
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: 'var(--text-tertiary)',
                  fontFamily: 'var(--font-body)',
                }}
              >
                RECRUITING TODAY
              </h3>
              {[
                "LinkedIn for contacts, but no emails",
                "Spreadsheets to track who you've reached out to",
                "Google to research every company before a call",
                "ChatGPT to draft each email individually",
                "Sticky notes, calendar reminders, and hope",
                "Hours lost before talking to a single person",
              ].map((item, i) => (
                <div
                  key={i}
                  className="relative mb-4 reveal"
                  style={{
                    paddingLeft: '24px',
                    fontSize: '15px',
                    lineHeight: 1.7,
                    color: 'var(--text-secondary)',
                    fontFamily: 'var(--font-body)',
                  }}
                >
                  <div
                    className="absolute left-0 top-[9px] w-1.5 h-1.5 rounded-full"
                    style={{ background: 'var(--border)' }}
                  />
                  <span
                    className="relative"
                    onMouseEnter={(e) => {
                      const text = e.currentTarget;
                      text.style.color = 'var(--text-tertiary)';
                      const line = text.querySelector('.strikethrough') as HTMLElement;
                      if (line) line.style.width = '100%';
                    }}
                    onMouseLeave={(e) => {
                      const text = e.currentTarget;
                      text.style.color = 'var(--text-secondary)';
                      const line = text.querySelector('.strikethrough') as HTMLElement;
                      if (line) line.style.width = '0%';
                    }}
                  >
                    {item}
                    <span
                      className="strikethrough absolute left-0 top-1/2 h-px transition-all"
                      style={{
                        background: 'var(--text-tertiary)',
                        opacity: 0.35,
                        width: '0%',
                        transform: 'translateY(-50%)',
                      }}
                    />
                  </span>
                </div>
              ))}
            </div>

            {/* Center Divider */}
            <div className="hidden md:block reveal">
              <div
                className="w-px h-full mx-auto"
                style={{
                  background: 'linear-gradient(180deg, var(--border-light) 0%, var(--border) 50%, var(--border-light) 100%)',
                }}
              />
            </div>

            {/* Right Column - Solution */}
            <div className="reveal-stagger">
              <h3
                className="text-xs font-bold mb-6 reveal"
                style={{
                  fontSize: '13px',
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: 'var(--blue)',
                  fontFamily: 'var(--font-body)',
                }}
              >
                WITH OFFERLOOP
              </h3>
              {[
                "Search contacts with verified emails in one step",
                "Track every outreach, follow-up, and response",
                "Get AI-generated prep for every coffee chat",
                "Draft personalized emails in seconds, not hours",
                "One dashboard for your entire pipeline",
                "More conversations, less busywork",
              ].map((item, i) => (
                <div
                  key={i}
                  className="relative mb-4 reveal transition-all"
                  style={{
                    paddingLeft: '24px',
                    fontSize: '15px',
                    lineHeight: 1.7,
                    color: 'var(--text-secondary)',
                    fontFamily: 'var(--font-body)',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateX(4px)';
                    e.currentTarget.style.color = 'var(--text-primary)';
                    const bullet = e.currentTarget.querySelector('.bullet') as HTMLElement;
                    if (bullet) {
                      bullet.style.opacity = '0.8';
                      bullet.style.transform = 'scale(1.4)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateX(0)';
                    e.currentTarget.style.color = 'var(--text-secondary)';
                    const bullet = e.currentTarget.querySelector('.bullet') as HTMLElement;
                    if (bullet) {
                      bullet.style.opacity = '0.4';
                      bullet.style.transform = 'scale(1)';
                    }
                  }}
                >
                  <div
                    className="bullet absolute left-0 top-[9px] w-1.5 h-1.5 rounded-full transition-all"
                    style={{
                      background: 'var(--blue)',
                      opacity: 0.4,
                    }}
                  />
                  {item}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 4: CORE WORKFLOWS */}
      <section
        id="features"
        className="py-[110px] px-6 md:px-12 bg-dots section-fade-top relative"
        style={{ background: 'var(--bg-off)' }}
      >
        <div className="max-w-7xl mx-auto relative z-10">
          <h2
            className="text-center mb-4 reveal"
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '40px',
              fontWeight: 400,
              letterSpacing: '-0.025em',
              color: 'var(--text-primary)',
            }}
          >
            Everything you need, nothing you don't
          </h2>
          <p
            className="text-center mb-16 reveal"
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: '16px',
              color: 'var(--text-secondary)',
              maxWidth: '460px',
              margin: '0 auto',
            }}
          >
            Four workflows that mirror how recruiting actually works.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 max-w-[960px] mx-auto" style={{ marginTop: '24px' }}>
            {[
              {
                icon: SearchIcon,
                title: 'Find people & companies',
                description: "Search by firm, role, school, or location. Get verified contact info without digging through LinkedIn.",
                accent: 'rgba(37, 99, 235, 0.08)',
              },
              {
                icon: TrackIcon,
                title: 'Track outreach & follow-ups',
                description: "See who you've emailed, who replied, and who needs a nudge. No more spreadsheet chaos.",
                accent: 'rgba(59, 130, 246, 0.08)',
              },
              {
                icon: CoffeeIcon,
                title: 'Coffee chat prep',
                description: "AI-generated talking points, background research, and conversation starters for every call.",
                accent: 'rgba(96, 165, 250, 0.08)',
              },
              {
                icon: InterviewIcon,
                title: 'Interview prep',
                description: "Company-specific questions, behavioral prompts, and guides personalized to each role.",
                accent: 'rgba(6, 182, 212, 0.08)',
              },
            ].map((workflow, i) => {
              return (
                <div
                  key={i}
                  className="reveal relative overflow-hidden p-6 rounded-[14px] transition-all cursor-pointer"
                  style={{
                    background: 'rgba(248, 250, 255, 0.88)',
                    backdropFilter: 'blur(8px)',
                    border: '1px solid var(--border-light)',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-6px)';
                    e.currentTarget.style.borderColor = 'rgba(37, 99, 235, 0.18)';
                    e.currentTarget.style.boxShadow = '0 12px 40px rgba(37, 99, 235, 0.10), 0 0 0 1px rgba(37, 99, 235, 0.05)';
                    e.currentTarget.style.background = `linear-gradient(135deg, rgba(248, 250, 255, 0.95) 0%, ${workflow.accent} 100%)`;
                    const iconContainer = e.currentTarget.querySelector('.icon-container') as HTMLElement;
                    const topLine = e.currentTarget.querySelector('.top-line') as HTMLElement;
                    if (iconContainer) {
                      iconContainer.style.background = 'var(--blue-subtle)';
                      iconContainer.style.transform = 'scale(1.05)';
                    }
                    if (topLine) {
                      topLine.style.transform = 'scaleX(1)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.borderColor = 'var(--border-light)';
                    e.currentTarget.style.boxShadow = 'none';
                    e.currentTarget.style.background = 'rgba(248, 250, 255, 0.88)';
                    const iconContainer = e.currentTarget.querySelector('.icon-container') as HTMLElement;
                    const topLine = e.currentTarget.querySelector('.top-line') as HTMLElement;
                    if (iconContainer) {
                      iconContainer.style.background = 'var(--border-light)';
                      iconContainer.style.transform = 'scale(1)';
                    }
                    if (topLine) {
                      topLine.style.transform = 'scaleX(0)';
                    }
                  }}
                >
                  <div
                    className="top-line absolute top-0 left-0 right-0 h-0.5 transition-transform origin-left"
                    style={{
                      background: 'var(--blue)',
                      transform: 'scaleX(0)',
                      borderRadius: '14px 14px 0 0',
                    }}
                  />
                  <div
                    className="icon-container w-10 h-10 rounded-[10px] flex items-center justify-center mb-4 transition-all"
                    style={{ background: 'var(--border-light)', transition: 'all 0.2s ease' }}
                  >
                    <img src={workflow.icon} alt="" style={{ width: 28, height: 28 }} />
                  </div>
                  <h3
                    className="text-base font-semibold mb-2"
                    style={{
                      fontFamily: 'var(--font-body)',
                      fontSize: '15px',
                      color: 'var(--text-primary)',
                    }}
                  >
                    {workflow.title}
                  </h3>
                  <p
                    className="text-sm leading-relaxed"
                    style={{
                      fontFamily: 'var(--font-body)',
                      fontSize: '13.5px',
                      lineHeight: 1.65,
                      color: 'var(--text-secondary)',
                      opacity: 0.85,
                    }}
                  >
                    {workflow.description}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Second product screenshot */}
          <div
            className="max-w-[700px] mx-auto mt-20 reveal"
            style={{ perspective: '1000px', position: 'relative' }}
          >
            {/* Soft glow behind screenshot */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background: 'radial-gradient(ellipse at center, rgba(37, 99, 235, 0.06) 0%, transparent 70%)',
                transform: 'scale(1.2)',
                filter: 'blur(40px)',
                zIndex: 0,
              }}
            />
            <div
              className="rounded-[14px] overflow-hidden"
              style={{
                background: 'var(--bg-white)',
                border: '1px solid var(--border)',
                boxShadow: '0 1px 2px rgba(0,0,0,0.03), 0 4px 12px rgba(0,0,0,0.04), 0 16px 40px rgba(0,0,0,0.06)',
                position: 'relative',
                zIndex: 1,
              }}
            >
              {/* Browser chrome bar */}
              <div style={{
                height: 36,
                background: 'var(--bg-white)',
                borderBottom: '1px solid var(--border-light)',
                display: 'flex',
                alignItems: 'center',
                padding: '0 14px',
                gap: 6,
                flexShrink: 0,
              }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#FCA5A5' }} />
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#FDE68A' }} />
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#86EFAC' }} />
                <div style={{
                  flex: 1,
                  height: 22,
                  background: 'var(--border-light)',
                  borderRadius: 5,
                  marginLeft: 12,
                  maxWidth: 220,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  <span style={{
                    fontSize: 11,
                    fontWeight: 500,
                    color: 'var(--text-tertiary)',
                    letterSpacing: '0.01em',
                    fontFamily: 'var(--font-body)',
                  }}>offerloop.ai/coffee-chat</span>
                </div>
              </div>

              {/* Screenshot with bottom fade */}
              <div style={{ overflow: 'hidden', position: 'relative' }}>
                <img
                  src={CoffeeChatPrepSS}
                  alt="Offerloop Coffee Chat Prep"
                  style={{
                    width: '100%',
                    display: 'block',
                    objectFit: 'cover',
                    objectPosition: 'top center',
                  }}
                />
                <div
                  style={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    height: 80,
                    background: 'linear-gradient(to top, var(--bg-white) 0%, transparent 100%)',
                    pointerEvents: 'none',
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 5: TESTIMONIALS */}
      <section
        id="testimonials"
        className="py-[110px] px-6 md:px-12 bg-dots"
        style={{ background: 'var(--bg-off)' }}
      >
        <div className="max-w-7xl mx-auto">
          <h2
            className="text-center mb-14 reveal"
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '40px',
              fontWeight: 400,
              letterSpacing: '-0.025em',
              color: 'var(--text-primary)',
            }}
          >
            People like you use this
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 max-w-[960px] mx-auto" style={{ gap: '20px', padding: '0 24px' }}>
            {[
              {
                name: 'Dylan Roby',
                role: 'Investment Banking Analyst, Evercore',
                quote: 'Offerloop does the work I spent hundreds of hours doing to land my internship — in minutes.',
              },
              {
                name: 'Jackson Leck',
                role: 'Private Equity Intern, Blackstone',
                quote: "I had so many recruiting tabs open. Now I have one. Everything I need in a single place.",
              },
              {
                name: 'Sarah Ucuzoglu',
                role: 'Financial Advisory Intern, PwC',
                quote: 'Automating cold outreach gave me more time spent face to face with professionals who could actually help.',
              },
            ].map((testimonial, i) => (
              <div
                key={i}
                className="reveal rounded-[14px] transition-all"
                style={{
                  background: 'var(--bg-white)',
                  border: '1px solid var(--border-light)',
                  padding: '32px 28px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-6px)';
                  e.currentTarget.style.boxShadow = '0 12px 40px rgba(37, 99, 235, 0.08)';
                  e.currentTarget.style.borderColor = 'rgba(37, 99, 235, 0.2)';
                  const quote = e.currentTarget.querySelector('.quote-mark') as HTMLElement;
                  if (quote) quote.style.color = 'rgba(37, 99, 235, 0.35)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = 'none';
                  e.currentTarget.style.borderColor = 'var(--border-light)';
                  const quote = e.currentTarget.querySelector('.quote-mark') as HTMLElement;
                  if (quote) quote.style.color = 'var(--blue-soft)';
                }}
              >
                <div>
                  <div
                    className="quote-mark text-5xl font-normal transition-colors"
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontSize: '48px',
                      color: 'var(--blue-soft)',
                      lineHeight: 1,
                      marginBottom: '8px',
                      userSelect: 'none',
                    }}
                  >
                    "
                  </div>
                  <p
                    className="text-base leading-relaxed"
                    style={{
                      fontFamily: 'var(--font-body)',
                      fontSize: '15px',
                      lineHeight: 1.75,
                      color: 'var(--text-secondary)',
                      opacity: 0.85,
                      marginBottom: '28px',
                    }}
                  >
                    {testimonial.quote}
                  </p>
                </div>
                <div>
                  <div
                    className="text-sm font-semibold"
                    style={{
                      fontFamily: 'var(--font-body)',
                      fontSize: '14px',
                      fontWeight: 600,
                      color: 'var(--text-primary)',
                      letterSpacing: '-0.01em',
                    }}
                  >
                    {testimonial.name}
                  </div>
                  <div
                    className="text-sm font-medium"
                    style={{
                      fontFamily: 'var(--font-body)',
                      fontSize: '13px',
                      color: '#2563EB',
                      marginTop: '3px',
                      fontWeight: 500,
                    }}
                  >
                    {testimonial.role}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* SECTION 7: FINAL CTA */}
      <section
        className="py-[100px] pb-[110px] px-6 md:px-12"
        style={{ background: 'var(--bg-white)' }}
      >
        <div className="max-w-[640px] mx-auto">
            <div
              className="relative rounded-[20px] transition-all reveal"
              style={{
                background: 'linear-gradient(135deg, rgba(37, 99, 235, 0.04) 0%, rgba(59, 130, 246, 0.06) 50%, rgba(37, 99, 235, 0.04) 100%)',
                border: '1px solid rgba(37, 99, 235, 0.12)',
                padding: '80px 48px',
                textAlign: 'center',
                maxWidth: '640px',
                margin: '0 auto',
                position: 'relative',
                overflow: 'hidden',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'rgba(37, 99, 235, 0.22)';
                e.currentTarget.style.boxShadow = '0 12px 48px rgba(37, 99, 235, 0.14)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'rgba(37, 99, 235, 0.12)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
            {/* Decorative circles - soft blue accents */}
            <div
              className="absolute pointer-events-none"
              style={{
                width: '80px',
                height: '80px',
                border: '1.5px solid rgba(37, 99, 235, 0.15)',
                borderRadius: '50%',
                opacity: 0.4,
                top: '-30px',
                right: '-30px',
                background: 'radial-gradient(circle, rgba(37, 99, 235, 0.05) 0%, transparent 70%)',
              }}
            />
            <div
              className="absolute pointer-events-none"
              style={{
                width: '60px',
                height: '60px',
                border: '1.5px solid rgba(59, 130, 246, 0.15)',
                borderRadius: '50%',
                opacity: 0.4,
                bottom: '-25px',
                left: '-25px',
                background: 'radial-gradient(circle, rgba(59, 130, 246, 0.05) 0%, transparent 70%)',
              }}
            />
            <p
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: '13px',
                fontWeight: 500,
                color: 'var(--text-tertiary)',
                letterSpacing: '0.02em',
                marginBottom: 20,
              }}
            >
              Join 113 students from USC, Georgetown, NYU &amp; more
            </p>
            <h2
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: '38px',
                fontWeight: 400,
                letterSpacing: '-0.025em',
                color: 'var(--text-primary)',
                marginBottom: '12px',
              }}
            >
              Start recruiting with clarity.
            </h2>
            <p
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: '15px',
                color: 'var(--text-secondary)',
                marginBottom: '32px',
              }}
            >
              Free to start. Set up in under two minutes.
            </p>
            <div>
              <button
                onClick={() => navigate('/signin?mode=signup')}
                className="btn-primary-lg btn-pulse"
                style={{
                  background: '#2563EB',
                }}
              >
                Create free account
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer
        className="py-12 px-6 md:px-12"
        style={{
          background: 'var(--bg-white)',
          borderTop: '1px solid var(--border-light)',
        }}
      >
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <p
            className="text-sm"
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: '13px',
              color: 'var(--text-tertiary)',
            }}
          >
            © 2026 Offerloop. All rights reserved.
          </p>
          <div className="flex gap-6">
            {[
              { label: 'About', path: '/about' },
              { label: 'Contact', path: '/contact-us' },
              { label: 'Privacy', path: '/privacy' },
              { label: 'Terms', path: '/terms-of-service' },
            ].map((link) => (
              <Link
                key={link.path}
                to={link.path}
                className="footer-link text-sm relative"
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: '13px',
                  color: 'var(--text-tertiary)',
                }}
              >
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
        style={{
          width: 44,
          height: 44,
          borderRadius: '50%',
          background: 'var(--bg-white)',
          border: '1px solid var(--border)',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          opacity: showBackToTop ? 1 : 0,
          pointerEvents: showBackToTop ? 'auto' : 'none',
          transform: showBackToTop ? 'translateY(0)' : 'translateY(16px)',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = 'rgba(37, 99, 235, 0.3)';
          e.currentTarget.style.boxShadow = '0 6px 24px rgba(37, 99, 235, 0.15)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = 'var(--border)';
          e.currentTarget.style.boxShadow = '0 4px 20px rgba(0, 0, 0, 0.08)';
        }}
      >
        <ArrowRight 
          className="h-5 w-5" 
          style={{ 
            color: 'var(--text-secondary)',
            transform: 'rotate(-90deg)',
          }} 
        />
      </button>
    </div>
  );
};

export default Index;
