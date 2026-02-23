// src/pages/Index.tsx
import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowRight, Menu, X } from 'lucide-react';
import { useFirebaseAuth } from "../contexts/FirebaseAuthContext";
import OfferloopLogo from '@/assets/offerloop_logo2.png';
import ChromeExtensionPic from '@/assets/Chrome_extensionpic.png';
import GoogleLogo from '@/assets/Googlelogo.png';
import HowItWorksVideo from '@/assets/ChatGPT of Email Outreach.mp4';
import FindCompanyImg from '@/assets/findcompanylandingpage.png';
import FindHiringManagerImg from '@/assets/findhiringmanagerlandingpage.png';
import CoverLetterImg from '@/assets/coverletterlandingpage.png';
import ResumeImg from '@/assets/resumelandingpage.png';
import EmailOutreachImg from '@/assets/emailoutreach.png.png';
import InterviewPrepImg from '@/assets/interviewpreplandingpage.png';
import CoffeeChatImg from '@/assets/coffeechatlandingpage.png';

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
      
      {/* NAVBAR — centered pill */}
      <div className="fixed top-0 left-0 right-0 z-50 flex justify-center px-4 pt-4">
        <header
          className="flex items-center justify-between w-full max-w-4xl h-14 px-6 md:px-8"
          style={{
            background: navbarScrolled
              ? 'rgba(255, 255, 255, 0.95)'
              : 'rgba(255, 255, 255, 0.85)',
            backdropFilter: 'blur(16px) saturate(1.4)',
            WebkitBackdropFilter: 'blur(16px) saturate(1.4)',
            border: '1px solid rgba(214, 222, 240, 0.7)',
            borderRadius: '100px',
            boxShadow: navbarScrolled
              ? '0 2px 16px rgba(0,0,0,0.06)'
              : '0 1px 8px rgba(0,0,0,0.03)',
            transition: 'all 0.3s ease',
          }}
        >
          <div className="flex items-center">
            <img
              src={OfferloopLogo}
              alt="Offerloop"
              className="h-[80px] cursor-pointer logo-animate"
              onClick={() => navigate('/')}
            />
          </div>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-6">
            <button
              onClick={scrollToFeatures}
              className="nav-link text-sm font-bold relative"
              style={{
                color: 'var(--text-secondary)',
                fontFamily: 'var(--font-body)',
              }}
            >
              Features
            </button>
            <button
              onClick={() => {
                const element = document.getElementById('extension');
                if (element) element.scrollIntoView({ behavior: 'smooth' });
              }}
              className="nav-link text-sm font-bold relative"
              style={{
                color: 'var(--text-secondary)',
                fontFamily: 'var(--font-body)',
              }}
            >
              Extension
            </button>
            <button
              onClick={() => {
                const element = document.getElementById('testimonials');
                if (element) element.scrollIntoView({ behavior: 'smooth' });
              }}
              className="nav-link text-sm font-bold relative"
              style={{
                color: 'var(--text-secondary)',
                fontFamily: 'var(--font-body)',
              }}
            >
              Reviews
            </button>
            <button
              onClick={() => navigate('/signin?mode=signup')}
              className="nav-link text-sm font-bold relative"
              style={{
                color: 'var(--text-secondary)',
                fontFamily: 'var(--font-body)',
              }}
            >
              Get started
            </button>
          </nav>

          {/* Desktop CTA */}
          <div className="hidden md:flex items-center gap-3">
            {user ? (
              <button
                onClick={() => navigate('/contact-search')}
                className="btn-ghost"
                style={{ fontSize: '13px', fontWeight: 700, padding: '8px 16px' }}
              >
                Find people
              </button>
            ) : (
              <>
                <button
                  onClick={() => navigate('/signin?mode=signin')}
                  style={{
                    background: 'transparent',
                    color: 'var(--text-primary)',
                    fontSize: '13px',
                    fontWeight: 700,
                    fontFamily: 'var(--font-body)',
                    padding: '8px 20px',
                    borderRadius: '100px',
                    border: '1px solid rgba(214, 222, 240, 0.8)',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(0,0,0,0.03)';
                    e.currentTarget.style.borderColor = 'rgba(214, 222, 240, 1)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.borderColor = 'rgba(214, 222, 240, 0.8)';
                  }}
                >
                  Sign in
                </button>
                <button
                  onClick={() => navigate('/signin?mode=signup')}
                  style={{
                    background: '#2563EB',
                    color: '#fff',
                    fontSize: '13px',
                    fontWeight: 700,
                    fontFamily: 'var(--font-body)',
                    padding: '8px 20px',
                    borderRadius: '100px',
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'background 0.15s ease',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = '#1d4ed8'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = '#2563EB'; }}
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
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </header>
      </div>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div
          className="fixed top-[72px] left-4 right-4 md:hidden z-40"
          style={{
            background: 'rgba(255, 255, 255, 0.98)',
            border: '1px solid rgba(214, 222, 240, 0.7)',
            borderRadius: '16px',
            boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
            backdropFilter: 'blur(16px)',
          }}
        >
          <nav className="flex flex-col p-3 gap-1">
            <button
              onClick={() => {
                scrollToFeatures();
                setMobileMenuOpen(false);
              }}
              className="text-left px-4 py-3 text-sm font-medium rounded-lg hover:bg-gray-50"
              style={{ color: 'var(--text-secondary)' }}
            >
              Features
            </button>
            <button
              onClick={() => {
                const element = document.getElementById('extension');
                if (element) element.scrollIntoView({ behavior: 'smooth' });
                setMobileMenuOpen(false);
              }}
              className="text-left px-4 py-3 text-sm font-medium rounded-lg hover:bg-gray-50"
              style={{ color: 'var(--text-secondary)' }}
            >
              Extension
            </button>
            <button
              onClick={() => {
                const element = document.getElementById('testimonials');
                if (element) element.scrollIntoView({ behavior: 'smooth' });
                setMobileMenuOpen(false);
              }}
              className="text-left px-4 py-3 text-sm font-medium rounded-lg hover:bg-gray-50"
              style={{ color: 'var(--text-secondary)' }}
            >
              Reviews
            </button>
            <button
              onClick={() => {
                navigate('/signin?mode=signup');
                setMobileMenuOpen(false);
              }}
              className="text-left px-4 py-3 text-sm font-medium rounded-lg hover:bg-gray-50"
              style={{ color: 'var(--text-secondary)' }}
            >
              Get started
            </button>
            <div className="border-t mt-2 pt-2" style={{ borderColor: 'rgba(214, 222, 240, 0.5)' }}>
              {user ? (
                <button
                  onClick={() => {
                    navigate('/contact-search');
                    setMobileMenuOpen(false);
                  }}
                  className="btn-primary-lg w-full"
                  style={{ borderRadius: '12px' }}
                >
                  Find people
                </button>
              ) : (
                <button
                  onClick={() => {
                    navigate('/signin?mode=signup');
                    setMobileMenuOpen(false);
                  }}
                  className="w-full text-center py-3 text-sm font-semibold rounded-xl"
                  style={{ background: '#2563EB', color: '#fff' }}
                >
                  Create account
                </button>
              )}
            </div>
          </nav>
        </div>
      )}

      {/* Spacer for fixed header */}
      <div className="h-20" />

      {/* SECTION 1: HERO */}
      <section
        ref={heroRef}
        className="relative px-6 md:px-12"
        style={{
          paddingTop: '120px',
          paddingBottom: '80px',
          background: 'var(--bg-white)',
        }}
      >
        {/* Subtle radial glow */}
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] rounded-full pointer-events-none"
          style={{
            background: 'radial-gradient(ellipse at center, rgba(37, 99, 235, 0.06) 0%, transparent 70%)',
          }}
        />

        <div className="relative max-w-3xl mx-auto text-center">
          <h1
            className="hero-fade-up hero-fade-up-delay-1 hero-headline"
            style={{
              fontFamily: "'Instrument Serif', Georgia, serif",
              fontSize: 'clamp(48px, 7.5vw, 74px)',
              fontWeight: 700,
              lineHeight: 1.08,
              letterSpacing: '-0.025em',
              color: 'var(--text-primary)',
              marginBottom: '24px',
            }}
          >
            Recruiting takes long enough<br />
            <span style={{ color: '#2563EB' }}>Stop wasting time on the busywork</span>
          </h1>
          <p
            className="hero-fade-up hero-fade-up-delay-3"
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: '17px',
              lineHeight: 1.7,
              color: 'var(--text-secondary)',
              marginBottom: '36px',
              maxWidth: '520px',
              margin: '0 auto 36px',
            }}
          >
            Outreach that used to take hours: finding emails, writing messages, researching companies, done in minutes. So you can focus on the conversations that actually land offers.
          </p>

          {/* CTA Buttons */}
          <div className="hero-fade-up hero-fade-up-delay-4 flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={() => navigate('/signin?mode=signup')}
              className="btn-primary-lg"
              style={{
                background: '#2563EB',
                fontWeight: 800,
              }}
            >
              Create account
            </button>
            <a
              href={CHROME_EXTENSION_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-ghost inline-flex items-center justify-center gap-2"
              style={{
                padding: '13px 24px',
                fontSize: '14px',
                fontWeight: 800,
                textDecoration: 'none',
                border: '1px solid var(--border)',
                borderRadius: '11px',
              }}
            >
              <img src={GoogleLogo} alt="" style={{ width: 16, height: 16, objectFit: 'contain' }} />
              Download browser extension
            </a>
          </div>


        </div>
      </section>

      {/* HOW IT WORKS SECTION */}
      <section
        className="px-6 md:px-12"
        style={{
          padding: '80px 0 96px',
          background: 'var(--bg-white)',
          borderTop: '1px solid var(--border-light)',
        }}
      >
        <div className="max-w-4xl mx-auto text-center">
          <h2
            style={{
              fontFamily: "'Instrument Serif', Georgia, serif",
              fontSize: 'clamp(48px, 7.5vw, 74px)',
              fontWeight: 400,
              lineHeight: 1.08,
              letterSpacing: '-0.025em',
              color: 'var(--text-primary)',
              marginBottom: '24px',
            }}
          >
            The ChatGPT of Email Outreach
          </h2>

          <p
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: '16px',
              lineHeight: 1.7,
              color: 'var(--text-secondary)',
              maxWidth: '640px',
              margin: '0 auto 48px',
            }}
          >
            Prompt the type of person you want to talk to and instantly have personalized emails created in your drafts ready to send. At the same time their information is stored into a networking tracker spreadsheet.
          </p>

          <div
            style={{
              maxWidth: '900px',
              margin: '0 auto',
              borderRadius: '16px',
              overflow: 'hidden',
              border: '1px solid var(--border)',
              boxShadow: '0 1px 2px rgba(0,0,0,0.03), 0 8px 24px rgba(0,0,0,0.05), 0 24px 60px rgba(0,0,0,0.07)',
            }}
          >
            <video
              src={HowItWorksVideo}
              autoPlay
              loop
              muted
              playsInline
              style={{
                width: '100%',
                display: 'block',
              }}
            />
          </div>
        </div>
      </section>

      {/* CHROME EXTENSION SECTION */}
      <section
        id="extension"
        className="px-6 md:px-12"
        style={{
          padding: '80px 0 96px',
          background: 'var(--bg-white)',
          borderTop: '1px solid var(--border-light)',
        }}
      >
        <div className="max-w-4xl mx-auto text-center">
          <span
            style={{
              display: 'inline-block',
              fontSize: '11px',
              fontWeight: 700,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: '#2563EB',
              fontFamily: 'var(--font-body)',
              marginBottom: '16px',
            }}
          >
            Chrome Extension
          </span>

          <h2
            style={{
              fontFamily: "'Instrument Serif', Georgia, serif",
              fontSize: 'clamp(48px, 7.5vw, 74px)',
              fontWeight: 400,
              lineHeight: 1.08,
              letterSpacing: '-0.025em',
              color: 'var(--text-primary)',
              marginBottom: '24px',
            }}
          >
            Works right inside LinkedIn
          </h2>

          <p
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: '16px',
              lineHeight: 1.7,
              color: 'var(--text-secondary)',
              maxWidth: '540px',
              margin: '0 auto 32px',
            }}
          >
            Write emails to anyone from their profile. Find hiring managers on any job posting. Generate cover letters in one click. All from a single Chrome extension.
          </p>

          <a
            href={CHROME_EXTENSION_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-primary-lg"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '10px',
              background: '#2563EB',
              textDecoration: 'none',
            }}
          >
            <img src={GoogleLogo} alt="" style={{ width: 18, height: 18, objectFit: 'contain' }} />
            Add to Chrome — it's free
          </a>


          {/* Chrome Extension Screenshot */}
          <div
            style={{
              marginTop: '56px',
              maxWidth: '900px',
              margin: '56px auto 0',
            }}
          >
            <div
              style={{
                borderRadius: '14px',
                overflow: 'hidden',
                border: '1px solid var(--border)',
                boxShadow: '0 1px 2px rgba(0,0,0,0.03), 0 4px 12px rgba(0,0,0,0.04), 0 16px 40px rgba(0,0,0,0.06)',
              }}
            >
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
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 3: PROBLEM → SOLUTION */}
      <section
        className="py-[110px] px-6 md:px-12"
        style={{ background: 'var(--bg-white)' }}
      >
        <div className="max-w-7xl mx-auto">
          <h2
            className="text-center mb-16 reveal"
            style={{
              fontFamily: "'Instrument Serif', Georgia, serif",
              fontSize: 'clamp(48px, 7.5vw, 74px)',
              fontWeight: 400,
              lineHeight: 1.08,
              letterSpacing: '-0.025em',
              color: 'var(--text-primary)',
            }}
          >
            Where your time actually goes
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-[900px] mx-auto">
            {/* Left Column - Without Offerloop */}
            <div
              className="reveal-stagger rounded-2xl p-8"
              style={{
                background: '#F8F7F5',
                border: '1px solid rgba(0,0,0,0.06)',
              }}
            >
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
                WITHOUT OFFERLOOP
              </h3>
              {[
                { text: <>Effort spent writing an email to an email address that isn't real</> },
                { text: <><strong>15 minutes</strong> writing a single personalized message</> },
                { text: <><strong>5 minutes</strong> manually updating a spreadsheet after every email</> },
                { text: <><strong>30 minutes to an hour</strong> researching a person and company before a call</> },
                { text: <>Constantly refreshing your inbox to see if they responded</> },
                { text: <><strong>3+ hours</strong> before you even land one coffee chat</> },
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
                  {item.text}
                </div>
              ))}
            </div>

            {/* Right Column - With Offerloop */}
            <div
              className="reveal-stagger rounded-2xl p-8"
              style={{
                background: '#F0F5FF',
                border: '1px solid rgba(37, 99, 235, 0.08)',
              }}
            >
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
                { text: <>Verified, deliverable emails found <strong>instantly</strong> — no more bounced messages</> },
                { text: <>Personalized emails drafted in <strong>seconds</strong>, not 15 minutes</> },
                { text: <>Every contact and outreach logged to your dashboard <strong>automatically</strong> — no manual spreadsheets</> },
                { text: <>AI-generated prep sheets with talking points and research for every call</> },
                { text: <><strong>Real-time</strong> email tracking so you know exactly when someone opens or replies</> },
                { text: <><strong>10 minutes</strong> of work that will almost guarantee you a coffee chat</> },
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
                    style={{ background: 'var(--blue)', opacity: 0.5 }}
                  />
                  {item.text}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>


      {/* SECTION: WHAT ELSE WE DO */}
      <section
        id="features"
        className="px-6 md:px-12"
        style={{
          padding: '96px 0',
          background: 'var(--bg-white)',
          borderTop: '1px solid var(--border-light)',
        }}
      >
        <div className="max-w-5xl mx-auto">
          <h2
            className="text-center mb-20 reveal"
            style={{
              fontFamily: "'Instrument Serif', Georgia, serif",
              fontSize: 'clamp(48px, 7.5vw, 74px)',
              fontWeight: 400,
              lineHeight: 1.08,
              letterSpacing: '-0.025em',
              color: 'var(--text-primary)',
            }}
          >
            What Else We Do
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '80px' }}>
            {[
              {
                title: 'Find Company',
                description: "Describe the type of companies you're looking for in plain English and we'll find them for you.",
                image: FindCompanyImg,
              },
              {
                title: 'Find Hiring Manager',
                description: "Paste a job posting URL and we'll find the recruiters and hiring managers for that role.",
                image: FindHiringManagerImg,
              },
              {
                title: 'Write Cover Letter',
                description: "Generate personalized cover letters that make you stand out.",
                image: CoverLetterImg,
              },
              {
                title: 'Tailor Resume',
                description: "Optimize your resume to stand out and pass ATS screening.",
                image: ResumeImg,
              },
              {
                title: 'Manage Emails',
                description: "Track every email you've sent, see who opened it, who replied, and who needs a follow-up.",
                image: EmailOutreachImg,
              },
              {
                title: 'Interview Prep',
                description: "Paste a job posting URL and get a full interview guide with likely questions and a prep plan.",
                image: InterviewPrepImg,
              },
              {
                title: 'Coffee Chat Prep',
                description: "Paste a LinkedIn URL and get a personalized prep sheet with talking points, recent news, and smart questions.",
                image: CoffeeChatImg,
              },
            ].map((feature, i) => {
              const isTextLeft = i % 2 === 0;
              return (
                <div
                  key={feature.title}
                  className="reveal"
                  style={{
                    display: 'flex',
                    flexDirection: isTextLeft ? 'row' : 'row-reverse',
                    alignItems: 'center',
                    gap: '48px',
                    flexWrap: 'wrap',
                  }}
                >
                  <div style={{ flex: '1 1 340px', minWidth: 0 }}>
                    <h3
                      style={{
                        fontFamily: 'var(--font-body)',
                        fontSize: '22px',
                        fontWeight: 700,
                        color: 'var(--text-primary)',
                        marginBottom: '12px',
                      }}
                    >
                      {feature.title}
                    </h3>
                    <p
                      style={{
                        fontFamily: 'var(--font-body)',
                        fontSize: '16px',
                        lineHeight: 1.7,
                        color: 'var(--text-secondary)',
                      }}
                    >
                      {feature.description}
                    </p>
                  </div>
                  <div
                    style={{
                      flex: '1 1 400px',
                      minWidth: 0,
                      maxWidth: '500px',
                      borderRadius: '14px',
                      overflow: 'hidden',
                      border: '1px solid rgba(0,0,0,0.06)',
                      boxShadow: '0 1px 2px rgba(0,0,0,0.03), 0 4px 12px rgba(0,0,0,0.04)',
                    }}
                  >
                    <img
                      src={feature.image}
                      alt={feature.title}
                      style={{
                        width: '100%',
                        display: 'block',
                        objectFit: 'cover',
                      }}
                    />
                  </div>
                </div>
              );
            })}
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
              fontFamily: "'Instrument Serif', Georgia, serif",
              fontSize: 'clamp(48px, 7.5vw, 74px)',
              fontWeight: 400,
              lineHeight: 1.08,
              letterSpacing: '-0.025em',
              color: 'var(--text-primary)',
            }}
          >
            People Like You Use This
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
              Join 400+ students from USC, Georgetown, NYU &amp; more
            </p>
            <h2
              style={{
                fontFamily: "'Instrument Serif', Georgia, serif",
                fontSize: 'clamp(48px, 7.5vw, 74px)',
                fontWeight: 400,
                lineHeight: 1.08,
                letterSpacing: '-0.025em',
                color: 'var(--text-primary)',
                marginBottom: '12px',
              }}
            >
              Start Today
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