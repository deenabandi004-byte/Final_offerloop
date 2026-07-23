// src/pages/Index.tsx
import { useState, useEffect, useRef } from 'react';
import { Helmet } from 'react-helmet-async';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowRight, Menu, X } from 'lucide-react';
import OfferloopLogo from '@/assets/offerloop_logo2.png';
import HeroVideo from '@/assets/person-couch-swipe-apply-pass-wide-v2-blurred.mp4';
const companyIconModules = import.meta.glob('@/assets/company-icons/*.png', {
  eager: true,
  import: 'default',
}) as Record<string, string>;

const COMPANY_ICONS: { src: string; alt: string }[] = Object.entries(companyIconModules).map(
  ([path, src]) => {
    const slug = (path.split('/').pop() ?? '').replace('.png', '');
    return {
      src,
      alt: slug
        .split('-')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' '),
    };
  },
);


// Animated count-up stat that fires once when scrolled into view
const CountUpStat = ({
  target,
  suffix,
  label,
  format,
}: {
  target: number;
  suffix: string;
  label: string;
  format: (n: number) => string;
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const [value, setValue] = useState(0);
  const started = useRef(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !started.current) {
            started.current = true;
            const duration = 1800;
            let startTime = 0;
            const tick = (now: number) => {
              if (!startTime) startTime = now;
              const progress = Math.min((now - startTime) / duration, 1);
              // easeOutExpo for a fast start that settles gently
              const eased = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
              setValue(target * eased);
              if (progress < 1) requestAnimationFrame(tick);
              else setValue(target);
            };
            requestAnimationFrame(tick);
          }
        });
      },
      { threshold: 0.4 }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [target]);

  return (
    <div ref={ref} style={{ textAlign: 'center', flex: '1 1 240px', minWidth: 200 }}>
      <div
        style={{
          fontFamily: "'Libre Baskerville', Georgia, serif",
          fontSize: 'clamp(30px, 3.6vw, 48px)',
          fontWeight: 700,
          lineHeight: 1,
          letterSpacing: '-0.02em',
          color: '#3B82F6',
          margin: '0 0 10px',
        }}
      >
        {format(value)}
        <span style={{ color: '#3B82F6' }}>{suffix}</span>
      </div>
      <div
        style={{
          fontFamily: "'Inter', sans-serif",
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          color: '#64748B',
        }}
      >
        {label}
      </div>
    </div>
  );
};

const Index = () => {
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [konamiActivated, setKonamiActivated] = useState(false);

  // Navbar scroll behavior, back to top
  useEffect(() => {
    const handleScroll = () => {
      setShowBackToTop(window.scrollY > 600);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
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
        <title>Offerloop: Find anyone. Reach anyone. Track every conversation.</title>
        <meta name="description" content="Find the people you want to talk to. We draft the message, manage every reply, and prep you for the meeting." />
        <link rel="canonical" href="https://offerloop.ai/" />
        <meta property="og:title" content="Offerloop: Find anyone. Reach anyone. Track every conversation." />
        <meta property="og:description" content="Find the people you want to talk to. We draft the message, manage every reply, and prep you for the meeting." />
        <meta property="og:url" content="https://offerloop.ai/" />
        <meta property="og:type" content="website" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&display=swap" rel="stylesheet" />
      </Helmet>


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

      {/* NAVBAR - centered pill with running header */}
      {/* ═══════════════ NEW HERO (video, framed) ═══════════════ */}
      <style>{`
        .idx-hero-nav-link {
          font-family: 'Libre Baskerville', Georgia, serif;
          font-size: 14px;
          font-weight: 600;
          text-decoration: none;
          color: rgba(255, 255, 255, 0.92);
          transition: color 0.15s ease;
        }
        .idx-hero-nav-link:hover { color: #FFFFFF; }
      `}</style>
      <section style={{ background: '#FFFFFF', padding: 12 }}>
        <div
          style={{
            position: 'relative',
            height: 'calc(100vh - 24px)',
            overflow: 'hidden',
            borderRadius: 24,
            background: '#0B1F3D',
          }}
        >
          <video
            src={HeroVideo}
            autoPlay
            muted
            loop
            playsInline
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
            }}
          />

          {/* Subtle scrim to dull the footage */}
          <div
            aria-hidden
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(11, 31, 61, 0.22)',
              pointerEvents: 'none',
            }}
          />

          {/* Nav overlaid on the video */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              zIndex: 10,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '16px 28px',
            }}
          >
            <img
              src={OfferloopLogo}
              alt="Offerloop"
              className="h-24 cursor-pointer"
              style={{ filter: 'brightness(0) invert(1)' }}
              onClick={() => navigate('/')}
            />

            <nav className="hidden md:flex items-center" style={{ gap: 36 }}>
              <Link to="/how-it-works" className="idx-hero-nav-link">How It Works</Link>
              <Link to="/for-students" className="idx-hero-nav-link">For Students</Link>
              <Link to="/pricing" className="idx-hero-nav-link">Pricing</Link>
              <Link to="/about" className="idx-hero-nav-link">About</Link>
              <button
                onClick={() => navigate('/signin')}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  background: '#FFFFFF',
                  color: '#0F172A',
                  fontSize: '14px',
                  fontWeight: 600,
                  fontFamily: "'Libre Baskerville', Georgia, serif",
                  padding: '10px 22px',
                  borderRadius: '100px',
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'transform 0.15s ease, background 0.15s ease',
                  whiteSpace: 'nowrap',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#F1F5F9'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = '#FFFFFF'; e.currentTarget.style.transform = 'translateY(0)'; }}
              >
                Sign in
                <ArrowRight size={16} strokeWidth={2.2} />
              </button>
            </nav>

            {/* Mobile Menu Button */}
            <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="md:hidden p-2" style={{ color: '#FFFFFF' }}>
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>

          {/* Hero copy over the video */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 5,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              padding: '0 24px',
            }}
          >
            <h1
              style={{
                fontFamily: "'Libre Baskerville', Georgia, serif",
                fontSize: 'clamp(34px, 5vw, 62px)',
                fontWeight: 400,
                lineHeight: 1.18,
                letterSpacing: '-0.02em',
                color: '#FFFFFF',
                margin: '0 0 18px',
                maxWidth: 940,
                textShadow: '0 2px 28px rgba(0, 0, 0, 0.4)',
              }}
            >
              Your entire job search.
              <br />
              One assistant.
            </h1>
            <p
              style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: 'clamp(16px, 1.8vw, 20px)',
                lineHeight: 1.5,
                color: 'rgba(255, 255, 255, 0.92)',
                margin: '0 0 34px',
                textShadow: '0 1px 16px rgba(0, 0, 0, 0.4)',
              }}
            >
              It finds the jobs, applies for you, emails the right people, and preps you for every interview.
            </p>
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                justifyContent: 'center',
                alignItems: 'center',
                gap: 14,
              }}
            >
              <button
                onClick={() => navigate('/signin?mode=signup')}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 10,
                  background: '#FFFFFF',
                  color: '#0F172A',
                  fontSize: '16px',
                  fontWeight: 600,
                  fontFamily: "'Libre Baskerville', Georgia, serif",
                  padding: '14px 30px',
                  borderRadius: '100px',
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'transform 0.15s ease, background 0.15s ease',
                  whiteSpace: 'nowrap',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#F1F5F9'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = '#FFFFFF'; e.currentTarget.style.transform = 'translateY(0)'; }}
              >
                Get started free
                <ArrowRight size={18} strokeWidth={2.2} />
              </button>

              {/* App Store download button. Routes to the waitlist until the iOS app is live. */}
              <button
                onClick={() => navigate('/waitlist')}
                aria-label="Download on the App Store"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 10,
                  background: '#000000',
                  color: '#FFFFFF',
                  padding: '10px 22px',
                  borderRadius: '100px',
                  border: '1px solid rgba(255,255,255,0.28)',
                  cursor: 'pointer',
                  transition: 'transform 0.15s ease, background 0.15s ease',
                  whiteSpace: 'nowrap',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#1A1A1A'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = '#000000'; e.currentTarget.style.transform = 'translateY(0)'; }}
              >
                <svg width="22" height="22" viewBox="0 0 384 512" fill="currentColor" aria-hidden>
                  <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z"/>
                </svg>
                <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: 1.1, fontFamily: "'Inter', sans-serif" }}>
                  <span style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.02em', opacity: 0.85 }}>Download on the</span>
                  <span style={{ fontSize: 17, fontWeight: 600, letterSpacing: '-0.01em' }}>App Store</span>
                </span>
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="fixed top-[84px] left-4 right-4 md:hidden z-40" style={{ background: 'rgba(255,255,255,0.98)', border: '1px solid rgba(37,99,235,0.1)', borderRadius: '16px', boxShadow: '0 4px 24px rgba(37,99,235,0.08)', backdropFilter: 'blur(16px)' }}>
          <nav className="flex flex-col p-3 gap-1">
            <Link to="/how-it-works" onClick={() => setMobileMenuOpen(false)} className="text-left px-4 py-3 text-sm font-medium rounded-lg hover:bg-gray-50" style={{ color: '#4A5E80', fontFamily: "'Libre Baskerville', Georgia, serif", textDecoration: 'none' }}>How It Works</Link>
            <Link to="/for-students" onClick={() => setMobileMenuOpen(false)} className="text-left px-4 py-3 text-sm font-medium rounded-lg hover:bg-gray-50" style={{ color: '#4A5E80', fontFamily: "'Libre Baskerville', Georgia, serif", textDecoration: 'none' }}>For Students</Link>
            <Link to="/pricing" onClick={() => setMobileMenuOpen(false)} className="text-left px-4 py-3 text-sm font-medium rounded-lg hover:bg-gray-50" style={{ color: '#4A5E80', fontFamily: "'Libre Baskerville', Georgia, serif", textDecoration: 'none' }}>Pricing</Link>
            <Link to="/about" onClick={() => setMobileMenuOpen(false)} className="text-left px-4 py-3 text-sm font-medium rounded-lg hover:bg-gray-50" style={{ color: '#4A5E80', fontFamily: "'Libre Baskerville', Georgia, serif", textDecoration: 'none' }}>About</Link>
            <div className="border-t mt-2 pt-2" style={{ borderColor: 'rgba(37,99,235,0.08)' }}>
              <button onClick={() => { navigate('/signin'); setMobileMenuOpen(false); }} className="w-full text-center py-3 text-sm font-semibold" style={{ background: '#2563EB', color: '#fff', borderRadius: '100px', fontFamily: "'Libre Baskerville', Georgia, serif" }}>Sign in</button>
            </div>
          </nav>
        </div>
      )}


      {/* ═══════════════ DREAM JOB COMPANIES ═══════════════ */}
      <style>{`
        .idx-dream-tile {
          width: 64px;
          height: 64px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 12px;
          overflow: hidden;
        }
        .idx-dream-tile img {
          max-width: 100%;
          max-height: 100%;
          object-fit: contain;
          opacity: 0.6;
          filter: saturate(0.5);
          transition: opacity 0.3s ease, filter 0.3s ease;
        }
        .idx-dream-tile:hover img {
          opacity: 1;
          filter: none;
        }
        @media (max-width: 640px) {
          .idx-dream-tile { width: 48px; height: 48px; }
        }
      `}</style>
      <section style={{ background: '#FFFFFF', padding: '15px 32px 96px' }}>
        <div style={{ maxWidth: 1180, margin: '0 auto' }}>
          <div className="reveal" style={{ textAlign: 'center', maxWidth: 780, margin: '0 auto 56px' }}>
            <h2
              style={{
                fontFamily: "'Libre Baskerville', Georgia, serif",
                fontSize: 'clamp(28px, 4vw, 42px)',
                fontWeight: 700,
                lineHeight: 1.15,
                letterSpacing: '-.02em',
                color: '#2563EB',
                margin: '0 0 18px',
              }}
            >
              Where our users land their dream jobs
            </h2>
            <p
              style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: 17,
                lineHeight: 1.6,
                color: '#475569',
                margin: 0,
              }}
            >
              From Fortune 500 companies to elite finance and consulting firms, our users
              consistently land interviews and offers at the world&apos;s most desirable workplaces.
            </p>
          </div>

          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'center',
              gap: 'clamp(28px, 4vw, 52px)',
            }}
          >
            {COMPANY_ICONS.map((logo, i) => (
              <div
                key={logo.alt}
                className="idx-dream-tile reveal"
                style={{ transitionDelay: `${(i % 8) * 45 + Math.floor(i / 8) * 90}ms` }}
                title={logo.alt}
              >
                <img src={logo.src} alt={logo.alt} loading="lazy" />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════ REACH / STATS COUNTER ═══════════════ */}
      <section style={{ background: '#FFFFFF', padding: '40px 32px 104px' }}>
        <div style={{ maxWidth: 980, margin: '0 auto' }}>
          <h2
            className="reveal"
            style={{
              fontFamily: "'Libre Baskerville', Georgia, serif",
              fontSize: 'clamp(22px, 3vw, 34px)',
              fontWeight: 400,
              lineHeight: 1.25,
              letterSpacing: '-0.02em',
              color: '#0f2545',
              textAlign: 'center',
              margin: '0 auto 48px',
              maxWidth: 680,
            }}
          >
            Our platform connects talented individuals with people and
            opportunities at leading companies.
          </h2>

          <div
            className="reveal"
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'center',
              alignItems: 'flex-start',
              gap: 'clamp(32px, 5vw, 72px)',
              marginBottom: 72,
            }}
          >
            <CountUpStat
              target={2.2}
              suffix="B+"
              label="Contacts"
              format={(n) => n.toFixed(1)}
            />
            <CountUpStat
              target={450000}
              suffix="+"
              label="Jobs"
              format={(n) => Math.round(n).toLocaleString()}
            />
            <CountUpStat
              target={3}
              suffix="M+"
              label="Recruiters"
              format={(n) => Math.round(n).toString()}
            />
          </div>

          {/* Logo */}
          <div
            className="reveal"
            style={{ display: 'flex', justifyContent: 'center', marginBottom: 28 }}
          >
            <img
              src={OfferloopLogo}
              alt="Offerloop"
              style={{ height: 'clamp(96px, 12vw, 150px)', width: 'auto' }}
            />
          </div>

          {/* Socials */}
          <div
            className="reveal"
            style={{ display: 'flex', justifyContent: 'center', gap: 24, alignItems: 'center' }}
          >
            <a href="https://www.instagram.com/offerloop.ai" target="_blank" rel="noopener noreferrer" aria-label="Instagram" style={{ color: '#94A3B8', transition: 'color .15s' }} onMouseEnter={(e) => { e.currentTarget.style.color = '#2563EB'; }} onMouseLeave={(e) => { e.currentTarget.style.color = '#94A3B8'; }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
            </a>
            <a href="https://www.tiktok.com/@offerloop" target="_blank" rel="noopener noreferrer" aria-label="TikTok" style={{ color: '#94A3B8', transition: 'color .15s' }} onMouseEnter={(e) => { e.currentTarget.style.color = '#2563EB'; }} onMouseLeave={(e) => { e.currentTarget.style.color = '#94A3B8'; }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 00-.79-.05A6.34 6.34 0 003.15 15.2a6.34 6.34 0 0010.86 4.46V13a8.28 8.28 0 005.58 2.17V11.7a4.85 4.85 0 01-3.77-1.85V6.69h3.77z"/></svg>
            </a>
            <a href="https://www.linkedin.com/company/offerloop-ai" target="_blank" rel="noopener noreferrer" aria-label="LinkedIn" style={{ color: '#94A3B8', transition: 'color .15s' }} onMouseEnter={(e) => { e.currentTarget.style.color = '#2563EB'; }} onMouseLeave={(e) => { e.currentTarget.style.color = '#94A3B8'; }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
            </a>
            <a href="https://twitter.com/offerloop" target="_blank" rel="noopener noreferrer" aria-label="X / Twitter" style={{ color: '#94A3B8', transition: 'color .15s' }} onMouseEnter={(e) => { e.currentTarget.style.color = '#2563EB'; }} onMouseLeave={(e) => { e.currentTarget.style.color = '#94A3B8'; }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
            </a>
          </div>
        </div>
      </section>


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
