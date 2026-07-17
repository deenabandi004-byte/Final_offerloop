// src/pages/HowItWorks.tsx
import { useState, useEffect, useRef } from 'react';
import { Helmet } from 'react-helmet-async';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import OfferloopLogo from '@/assets/offerloop_logo2.png';
import MarketingHeader from '@/components/MarketingHeader';
import FindCompanyImg from '@/assets/findcompanylandingpage.png';
import FindHiringManagerImg from '@/assets/findhiringmanagerlandingpage.png';
import EmailOutreachImg from '@/assets/emailoutreach.png.png';
import MeetingImg from '@/assets/meetinglandingpage.png';
import DavidJiPhoto from '@/assets/David-Ji.jpeg';
import SarahUcuzogluPhoto from '@/assets/Sarah-Ucuzoglu.jpeg';
import USCLogo from '@/assets/USC-Logo.png';
import UCLALogo from '@/assets/UCLA logo.png';
import StanfordLogo from '@/assets/Stanford logo.avif';
import BerkeleyLogo from '@/assets/UC Berkeley logo.png';
import MichiganLogo from '@/assets/Michigan logo.png';
import NotreDameLogo from '@/assets/Notre Dame logo.png';
import WhartonLogo from '@/assets/Wharton Logo .png';
import DartmouthLogo from '@/assets/Dartmouth logo.png';
import NYULogo from '@/assets/NYU Logo.png';
import GeorgetownLogo from '@/assets/Georgetown logo.png';
import MountainsLake from '@/assets/for-students/mountains-lake.png';
import HeroSearchCTA from '@/components/HeroSearchCTA';
import TimeComparison from '@/components/TimeComparison';
import BulletinBoard from '@/components/BulletinBoard';

const CHROME_EXTENSION_URL = 'https://chromewebstore.google.com/detail/offerloop/aabnjgecmobcnnhkilbeocggbmgilpcl';

const UNIVERSITY_LOGOS: { src: string; alt: string; h: number }[] = [
  { src: BerkeleyLogo, alt: 'UC Berkeley', h: 38 },
  { src: UCLALogo, alt: 'UCLA', h: 32 },
  { src: WhartonLogo, alt: 'Wharton', h: 38 },
  { src: NotreDameLogo, alt: 'Notre Dame', h: 50 },
  { src: GeorgetownLogo, alt: 'Georgetown', h: 50 },
  { src: MichiganLogo, alt: 'Michigan', h: 50 },
  { src: DartmouthLogo, alt: 'Dartmouth', h: 50 },
  { src: NYULogo, alt: 'NYU', h: 32 },
  { src: StanfordLogo, alt: 'Stanford', h: 32 },
  { src: USCLogo, alt: 'USC', h: 32 },
];

const BIG_TESTIMONIALS = [
  {
    name: 'David Ji',
    role: 'Incoming FedEx Intern',
    photo: DavidJiPhoto,
    quote:
      'As an international student, I had no pre-existing network, and Offerloop allowed me to find and connect with professionals that resulted in me landing an offer.',
  },
  {
    name: 'Sarah Ucuzoglu',
    role: 'Advisory Intern, PwC',
    photo: SarahUcuzogluPhoto,
    quote:
      'Automating cold outreach gave me more time spent face to face with professionals who could actually help.',
  },
];

type AnyoneStepKey = 'find' | 'draft' | 'track' | 'prep';

type AnyoneStep = {
  key: AnyoneStepKey;
  n: string;
  label: string;
  title: string;
  eyebrow: string;
  description: string;
  image: string;
};

const ANYONE_STEPS: AnyoneStep[] = [
  {
    key: 'find',
    n: '1',
    label: 'FIND',
    title: "Search anyone, sorted by who's most likely to reply.",
    eyebrow: '01 FIND',
    description:
      'Type a role, a company, or a school. We surface people who share your school, major, hometown, career path, etc. The ones with a reason to write back.',
    image: FindHiringManagerImg,
  },
  {
    key: 'draft',
    n: '2',
    label: 'DRAFT',
    title: 'Personalized emails, drafted into your Gmail.',
    eyebrow: '02 DRAFT',
    description:
      "We write the message using your commonalities. Drafts land in your real Gmail. Your account, your voice. Won't go to spam.",
    image: EmailOutreachImg,
  },
  {
    key: 'track',
    n: '3',
    label: 'TRACK',
    title: 'The moment someone replies, we take it from there.',
    eyebrow: '03 TRACK',
    description:
      'The tracker updates. A follow-up draft appears. Prep is ready before you need it.',
    image: FindCompanyImg,
  },
  {
    key: 'prep',
    n: '4',
    label: 'PREP',
    title: 'When the meeting gets booked, the prep is already done.',
    eyebrow: '04 PREP',
    description:
      'Research, talking points, and questions worth asking. Generated the moment they say yes.',
    image: MeetingImg,
  },
];

const HowItWorks = () => {
  const navigate = useNavigate();
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [anyoneStep, setAnyoneStep] = useState<AnyoneStepKey>('find');
  const currentAnyoneStep = ANYONE_STEPS.find((s) => s.key === anyoneStep) ?? ANYONE_STEPS[0];
  const heroRef = useRef<HTMLDivElement>(null);
  const dashboardRef = useRef<HTMLDivElement>(null);

  // Back to top visibility
  useEffect(() => {
    const handleScroll = () => setShowBackToTop(window.scrollY > 600);
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
      if (productElement) productElement.style.transform = `rotateY(${x * 3}deg) rotateX(${-y * 2}deg)`;
    };
    const handleMouseLeave = () => {
      if (dashboardRef.current) {
        const productElement = dashboardRef.current.querySelector('.hero-product') as HTMLElement;
        if (productElement) productElement.style.transform = 'rotateY(0deg) rotateX(0deg)';
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
          if (entry.isIntersecting) entry.target.classList.add('visible');
        });
      },
      { threshold: 0.1, rootMargin: '0px 0px -30px 0px' }
    );
    const elements = document.querySelectorAll('.reveal');
    elements.forEach((el) => observer.observe(el));
    return () => elements.forEach((el) => observer.unobserve(el));
  }, []);

  return (
    <div className="min-h-screen w-full" style={{ fontFamily: "'Inter', sans-serif", background: '#FFFFFF' }}>
      <Helmet>
        <title>How Offerloop Works: Find, Draft, Track, Prep</title>
        <meta name="description" content="See how Offerloop works, step by step. Find the right people, draft personalized outreach into your Gmail, track every reply, and walk into every meeting prepared." />
        <link rel="canonical" href="https://offerloop.ai/how-it-works" />
        <meta property="og:title" content="How Offerloop Works: Find, Draft, Track, Prep" />
        <meta property="og:description" content="Find the right people, draft personalized outreach into your Gmail, track every reply, and walk into every meeting prepared." />
        <meta property="og:url" content="https://offerloop.ai/how-it-works" />
        <meta property="og:type" content="website" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&display=swap" rel="stylesheet" />
      </Helmet>

      <MarketingHeader active="how-it-works" />

      {/* ═══════════════ HERO / TITLE PAGE ═══════════════ */}
      <style>{`
        @keyframes hero-drift-slow {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50%      { transform: translate(40px, -30px) scale(1.08); }
        }
        @keyframes hero-drift-reverse {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50%      { transform: translate(-30px, 20px) scale(1.05); }
        }
        @keyframes hero-ring-spin {
          0%   { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes hero-particle-float {
          0%, 100% { transform: translate(0, 0); opacity: 0.25; }
          50%      { transform: translate(22px, -36px); opacity: 0.7; }
        }
        @keyframes hero-sheen-shift {
          0%   { background-position: -100% 0; }
          100% { background-position: 200% 0; }
        }
      `}</style>
      <section
        ref={heroRef}
        className="relative"
        style={{
          paddingTop: '40px',
          paddingBottom: '40px',
          minHeight: 'calc(100vh - 96px)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          background:
            'radial-gradient(ellipse 90% 70% at 50% 35%, #EEF4FD 0%, #E5EFFB 60%, #DCE7F7 100%)',
          overflow: 'hidden',
        }}
      >
        {/* ─── Ambient depth layers - all non-interactive ─── */}

        {/* Mountains + lake backdrop — sits at the bottom of the hero with a
            long mask fade so it dissolves into the upper haze instead of
            cutting in. Matches the For Students hero treatment but tuned for
            this hero's softer blue base. */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: '70%',
            backgroundImage: `url(${MountainsLake})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center bottom',
            backgroundRepeat: 'no-repeat',
            opacity: 0.55,
            pointerEvents: 'none',
            zIndex: 0,
            maskImage:
              'linear-gradient(180deg, transparent 0%, #000 28%, #000 70%, rgba(0,0,0,0.6) 90%, transparent 100%)',
            WebkitMaskImage:
              'linear-gradient(180deg, transparent 0%, #000 28%, #000 70%, rgba(0,0,0,0.6) 90%, transparent 100%)',
          }}
        />

        {/* Large slow-drifting blue blob behind the headline */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            top: '-18%',
            left: '-10%',
            width: '62%',
            height: '110%',
            background:
              'radial-gradient(ellipse at center, rgba(37, 99, 235, 0.16) 0%, rgba(37, 99, 235, 0) 60%)',
            filter: 'blur(48px)',
            pointerEvents: 'none',
            zIndex: 0,
            animation: 'hero-drift-slow 18s ease-in-out infinite',
          }}
        />
        {/* Warmer indigo blob drifting the other way behind the panel */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            top: '-25%',
            right: '-15%',
            width: '66%',
            height: '130%',
            background:
              'radial-gradient(ellipse at center, rgba(129, 140, 248, 0.14) 0%, rgba(129, 140, 248, 0) 65%)',
            filter: 'blur(56px)',
            pointerEvents: 'none',
            zIndex: 0,
            animation: 'hero-drift-reverse 22s ease-in-out infinite',
          }}
        />

        {/* Concentric ring decoration behind the Gmail panel */}
        <svg
          aria-hidden
          width="720"
          height="720"
          viewBox="0 0 720 720"
          style={{
            position: 'absolute',
            top: '-120px',
            right: '-220px',
            pointerEvents: 'none',
            zIndex: 0,
            opacity: 0.32,
            animation: 'hero-ring-spin 120s linear infinite',
          }}
        >
          {[140, 200, 260, 320, 380].map((r) => (
            <circle
              key={r}
              cx="360"
              cy="360"
              r={r}
              fill="none"
              stroke="rgba(37, 99, 235, 0.08)"
              strokeWidth="1"
              strokeDasharray={r === 260 ? '4 8' : undefined}
            />
          ))}
        </svg>

        {/* Dot grid - very faint, just for texture */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage:
              'radial-gradient(rgba(15, 37, 69, 0.055) 1px, transparent 1px)',
            backgroundSize: '26px 26px',
            maskImage:
              'radial-gradient(ellipse 70% 60% at center, black 5%, transparent 90%)',
            WebkitMaskImage:
              'radial-gradient(ellipse 70% 60% at center, black 5%, transparent 90%)',
            pointerEvents: 'none',
            zIndex: 0,
          }}
        />

        {/* Subtle top highlight line - catches the eye */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            top: 0,
            left: '20%',
            right: '20%',
            height: 1,
            background:
              'linear-gradient(90deg, transparent, rgba(37, 99, 235, 0.25), transparent)',
            pointerEvents: 'none',
            zIndex: 0,
          }}
        />

        {/* Floating particles - slow-drifting blue dots for living background */}
        {[
          { left: '8%',  top: '18%', size: 4, dur: 14, delay: 0 },
          { left: '22%', top: '68%', size: 3, dur: 11, delay: 1.4 },
          { left: '38%', top: '12%', size: 5, dur: 16, delay: 0.6 },
          { left: '52%', top: '78%', size: 3, dur: 13, delay: 2.0 },
          { left: '66%', top: '22%', size: 4, dur: 15, delay: 0.2 },
          { left: '74%', top: '58%', size: 3, dur: 12, delay: 1.8 },
          { left: '88%', top: '32%', size: 5, dur: 17, delay: 0.9 },
          { left: '14%', top: '42%', size: 3, dur: 13, delay: 2.4 },
          { left: '92%', top: '78%', size: 4, dur: 14, delay: 1.1 },
          { left: '44%', top: '52%', size: 3, dur: 15, delay: 0.4 },
        ].map((p, i) => (
          <div
            key={i}
            aria-hidden
            style={{
              position: 'absolute',
              left: p.left,
              top: p.top,
              width: p.size,
              height: p.size,
              borderRadius: '50%',
              background: 'rgba(37, 99, 235, 0.55)',
              filter: 'blur(0.5px)',
              pointerEvents: 'none',
              zIndex: 0,
              animation: `hero-particle-float ${p.dur}s ease-in-out infinite`,
              animationDelay: `${p.delay}s`,
            }}
          />
        ))}

        <div className="hero-fade-up hero-fade-up-delay-1 relative" style={{ zIndex: 1 }}>
          <HeroSearchCTA />
        </div>
      </section>

      {/* ═══════════════ TESTIMONIALS ═══════════════ */}
      <style>{`
        @keyframes idx-logo-scroll { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
        .idx-logo-track {
          display: flex;
          gap: clamp(40px, 5vw, 76px);
          align-items: center;
          width: max-content;
          animation: idx-logo-scroll 38s linear infinite;
        }
        .idx-logo-track:hover { animation-play-state: paused; }
        .idx-mask-edges {
          -webkit-mask-image: linear-gradient(90deg, transparent 0%, #000 8%, #000 92%, transparent 100%);
                  mask-image: linear-gradient(90deg, transparent 0%, #000 8%, #000 92%, transparent 100%);
        }
        .idx-bigtest-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 28px;
          max-width: 1180px;
          margin: 0 auto;
        }
        .idx-bigtest-card {
          display: grid;
          grid-template-columns: minmax(220px, 1fr) 1.25fr;
          gap: 0;
          background: linear-gradient(180deg, #102E5C 0%, #0B2348 100%);
          border-radius: 16px;
          overflow: hidden;
          box-shadow: 0 1px 2px rgba(15, 37, 69, 0.06), 0 18px 36px rgba(15, 37, 69, 0.18);
        }
        .idx-bigtest-photo {
          width: 100%;
          height: 100%;
          min-height: 300px;
          object-fit: cover;
          object-position: center top;
          display: block;
        }
        @media (max-width: 880px) {
          .idx-bigtest-grid { grid-template-columns: 1fr !important; }
          .idx-bigtest-card { grid-template-columns: 1fr !important; }
          .idx-bigtest-photo { aspect-ratio: 16/10; min-height: 0; }
        }
      `}</style>
      <section
        id="testimonials"
        style={{
          background: '#ffffff',
          padding: '80px 32px 64px',
        }}
      >
        <div style={{ maxWidth: 1240, margin: '0 auto' }}>
          {/* University trust band */}
          <div className="reveal" style={{ textAlign: 'center', maxWidth: 820, margin: '0 auto 36px' }}>
            <h2
              style={{
                fontFamily: "'Libre Baskerville', Georgia, serif",
                fontSize: 'clamp(26px, 3.8vw, 38px)',
                fontWeight: 400,
                lineHeight: 1.15,
                letterSpacing: '-.02em',
                color: '#0f2545',
                margin: 0,
              }}
            >
              Trusted by students at the country&apos;s top universities
            </h2>
          </div>

          <div className="idx-mask-edges reveal" style={{ overflow: 'hidden', marginBottom: 88 }}>
            <div className="idx-logo-track">
              {[...UNIVERSITY_LOGOS, ...UNIVERSITY_LOGOS, ...UNIVERSITY_LOGOS].map(
                (logo, i) => (
                  <img
                    key={`${logo.alt}-${i}`}
                    src={logo.src}
                    alt={logo.alt}
                    style={{
                      height: logo.h,
                      width: 'auto',
                      objectFit: 'contain',
                      flexShrink: 0,
                    }}
                  />
                ),
              )}
            </div>
          </div>

          {/* Two big personable cards */}
          <div className="reveal idx-bigtest-grid">
            {BIG_TESTIMONIALS.map((p) => (
              <article key={p.name} className="idx-bigtest-card">
                <img
                  src={p.photo}
                  alt={p.name}
                  className="idx-bigtest-photo"
                />
                <div
                  style={{
                    padding: '32px 32px 28px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: 24,
                  }}
                >
                  <p
                    style={{
                      fontFamily: "'Inter', sans-serif",
                      fontSize: 17,
                      lineHeight: 1.65,
                      color: '#E2EAF7',
                      margin: 0,
                      flex: 1,
                    }}
                  >
                    “{p.quote}”
                  </p>
                  <div>
                    <p
                      style={{
                        fontFamily: "'Inter', sans-serif",
                        fontSize: 15,
                        fontWeight: 700,
                        color: '#FFFFFF',
                        margin: 0,
                        letterSpacing: '-0.005em',
                      }}
                    >
                      {p.name}
                    </p>
                    <p
                      style={{
                        fontFamily: "'Inter', sans-serif",
                        fontSize: 12.5,
                        color: '#93C5FD',
                        margin: '3px 0 0',
                        letterSpacing: '0.04em',
                      }}
                    >
                      {p.role}
                    </p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════ CHAPTER III: HOW IT WORKS (interactive) ═══════════════ */}
      <style>{`
        .idx-step-btn {
          all: unset;
          width: 100%;
          display: flex;
          gap: 16px;
          align-items: flex-start;
          padding: 18px 0;
          border-bottom: 2px solid rgba(15, 37, 69, 0.10);
          cursor: pointer;
          opacity: 0.42;
          transition: opacity 0.2s ease, transform 0.2s ease;
        }
        .idx-step-btn:hover { opacity: 0.7; transform: translateX(2px); }
        .idx-step-btn.is-active { opacity: 1; transform: translateX(0); }
        .idx-step-btn:focus-visible { outline: 2px solid #2563EB; outline-offset: 4px; border-radius: 6px; }
        @media (max-width: 880px) {
          .idx-steps-grid {
            grid-template-columns: 1fr !important;
            gap: 32px !important;
          }
        }
      `}</style>
      <section
        id="features"
        className="relative"
        style={{
          padding: '96px 32px 96px',
          borderTop: '1px solid #EEF2F8',
          background:
            'radial-gradient(ellipse 90% 60% at 50% 40%, #E8F1FB 0%, #DCE7F7 100%)',
          overflow: 'hidden',
        }}
      >
        {/* Soft ambient glows behind the section */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            top: '10%',
            left: '-12%',
            width: '50%',
            height: '60%',
            background:
              'radial-gradient(ellipse, rgba(37, 99, 235, 0.10), transparent 65%)',
            filter: 'blur(60px)',
            pointerEvents: 'none',
            zIndex: 0,
          }}
        />
        <div
          aria-hidden
          style={{
            position: 'absolute',
            bottom: '5%',
            right: '-15%',
            width: '55%',
            height: '70%',
            background:
              'radial-gradient(ellipse, rgba(129, 140, 248, 0.10), transparent 65%)',
            filter: 'blur(64px)',
            pointerEvents: 'none',
            zIndex: 0,
          }}
        />

        <div style={{ position: 'relative', zIndex: 1, maxWidth: 760, margin: '0 auto', textAlign: 'center' }}>
          <p
            className="reveal"
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: 14,
              fontWeight: 700,
              letterSpacing: '0.18em',
              color: '#2563EB',
              textTransform: 'uppercase',
              margin: '0 0 16px',
            }}
          >
            How it works
          </p>
          <h2 className="reveal" style={{ fontFamily: "'Libre Baskerville', Georgia, serif", fontSize: 'clamp(32px, 5vw, 52px)', fontWeight: 400, lineHeight: 1.1, letterSpacing: '-.025em', color: '#0f2545', marginBottom: 0 }}>
            Outreach, end to end.
          </h2>
          <div style={{ height: 1.5, background: 'linear-gradient(90deg, transparent, #2563EB, #60A5FA, transparent)', maxWidth: 240, margin: '14px auto 16px' }} />
        </div>

        <div
          className="reveal idx-steps-grid"
          style={{
            maxWidth: 1180,
            margin: '56px auto 0',
            display: 'grid',
            gridTemplateColumns: 'minmax(280px, 340px) minmax(0, 1fr)',
            gap: 64,
            alignItems: 'start',
            position: 'relative',
            zIndex: 1,
          }}
        >
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              paddingLeft: 8,
              borderLeft: '2px solid rgba(15, 37, 69, 0.10)',
            }}
          >
            {ANYONE_STEPS.map((step) => {
              const isActive = step.key === anyoneStep;
              return (
                <button
                  key={step.key}
                  type="button"
                  className={`idx-step-btn ${isActive ? 'is-active' : ''}`}
                  onClick={() => setAnyoneStep(step.key)}
                  onMouseEnter={() => setAnyoneStep(step.key)}
                  aria-pressed={isActive}
                >
                  <div
                    style={{
                      width: 50,
                      height: 50,
                      borderRadius: 10,
                      background: isActive ? '#DBEAFE' : '#F1F5F9',
                      border: `1px solid ${isActive ? '#93C5FD' : 'rgba(15, 37, 69, 0.10)'}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      transition: 'background 0.2s ease, border-color 0.2s ease',
                    }}
                  >
                    <span
                      style={{
                        fontFamily: "'Libre Baskerville', Georgia, serif",
                        fontSize: 26,
                        color: '#0f2545',
                      }}
                    >
                      {step.n}
                    </span>
                  </div>
                  <div style={{ flex: 1, textAlign: 'left' }}>
                    <p
                      style={{
                        fontFamily: "'Inter', sans-serif",
                        fontSize: 14,
                        fontWeight: isActive ? 700 : 600,
                        letterSpacing: '0.14em',
                        color: '#2563EB',
                        margin: '0 0 6px',
                      }}
                    >
                      {step.label}
                    </p>
                    <p
                      style={{
                        fontFamily: "'Libre Baskerville', Georgia, serif",
                        fontSize: 16,
                        lineHeight: 1.35,
                        color: '#0f2545',
                        margin: 0,
                      }}
                    >
                      {step.title}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>

          <div>
            <div
              key={currentAnyoneStep.key}
              style={{
                borderRadius: 16,
                overflow: 'hidden',
                border: '1px solid rgba(15, 37, 69, 0.08)',
                boxShadow:
                  '0 1px 2px rgba(15, 37, 69, 0.03), 0 20px 36px rgba(15, 37, 69, 0.10)',
                marginBottom: 28,
                background: '#ffffff',
              }}
            >
              <img
                src={currentAnyoneStep.image}
                alt={currentAnyoneStep.title}
                style={{ display: 'block', width: '100%', height: 'auto' }}
              />
            </div>
            <p
              style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: 14,
                fontWeight: 700,
                letterSpacing: '0.18em',
                color: '#2563EB',
                margin: '0 0 14px',
              }}
            >
              {currentAnyoneStep.eyebrow}
            </p>
            <p
              style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: 18,
                lineHeight: 1.6,
                color: '#475569',
                margin: 0,
                maxWidth: 720,
              }}
            >
              {currentAnyoneStep.description}
            </p>
          </div>
        </div>
      </section>

      {/* ═══════════════ TIME SAVINGS (moved down - was above features) ═══════════════ */}
      <section id="comparison" style={{ borderTop: '1px solid #EEF2F8', background: '#ffffff' }}>
        <TimeComparison />
      </section>

      {/* Bulletin wall transitions from two faces into wider volume of social proof */}
      <BulletinBoard />

      {/* ═══════════════ TRUST BAND ═══════════════ */}
      <section style={{ background: '#ffffff', padding: '88px 32px', borderTop: '1px solid #EEF2F8', textAlign: 'center' }}>
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          <h2
            style={{
              fontFamily: "'Libre Baskerville', Georgia, serif",
              fontSize: 'clamp(28px, 4.5vw, 44px)',
              fontWeight: 400,
              lineHeight: 1.2,
              letterSpacing: '-.02em',
              color: '#0f2545',
              margin: 0,
            }}
          >
            Used by thousands of users and growing.
          </h2>
          <div
            style={{
              height: 1.5,
              background:
                'linear-gradient(90deg, transparent, #2563EB, #60A5FA, transparent)',
              maxWidth: 200,
              margin: '20px auto 0',
            }}
          />
        </div>
      </section>

      {/* ═══════════════ FAQ ═══════════════ */}
      <section
        id="faq"
        style={{
          background: 'linear-gradient(180deg, #0B1F3D 0%, #0f2545 100%)',
          borderTop: '1px solid #EEF2F8',
          padding: '96px 32px 96px',
        }}
      >
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          <h2
            style={{
              fontFamily: "'Libre Baskerville', Georgia, serif",
              fontSize: 'clamp(32px, 5vw, 52px)',
              fontWeight: 400,
              lineHeight: 1.1,
              letterSpacing: '-.025em',
              color: '#FFFFFF',
              textAlign: 'center',
              margin: '0 0 56px',
            }}
          >
            Questions you probably have.
          </h2>

          <style>{`
            .faq-item summary { list-style: none; cursor: pointer; }
            .faq-item summary::-webkit-details-marker { display: none; }
            .faq-item summary::after {
              content: '+';
              float: right;
              font-family: 'Inter', sans-serif;
              font-size: 24px;
              font-weight: 300;
              color: #94A8C2;
              line-height: 1;
              transition: transform 0.2s ease;
            }
            .faq-item[open] summary::after { content: '−'; color: #60A5FA; }
            .faq-item summary:hover { color: #60A5FA; }
          `}</style>

          <div>
            {[
              {
                q: "How do you find people's emails?",
                a: "We pull from a database of 2.2 billion verified contacts and verify the email before showing it to you. If we can't verify, we tell you.",
              },
              {
                q: 'Is this just AI spam?',
                a: "No. Every draft is written from your resume and the contact's background. You review it in Gmail before it sends. AI handles the typing; the message is yours.",
              },
              {
                q: "What's free vs paid?",
                a: 'Free gives you 3 contacts per search and 300 credits a month. Pro and Elite raise the limits and unlock advanced search, resume tools, and prep. Full details on the pricing page.',
              },
              {
                q: 'How is this different from LinkedIn, Apollo, or coaching?',
                a: 'LinkedIn has the data but not the emails. Apollo has the emails but is built for sales teams. Coaching gives you advice in a PDF. Offerloop does all three.',
              },
              {
                q: 'Will my Gmail get flagged?',
                a: 'Drafts land in your own Gmail. You send them yourself, one at a time. Volume stays low enough that Gmail treats them like the personal emails they are.',
              },
              {
                q: 'What happens after someone replies?',
                a: 'The tracker advances, a follow-up draft is ready, and a prep PDF generates with research on the person. You walk in prepared.',
              },
              {
                q: 'Can I edit drafts before sending?',
                a: "Yes. The draft is in your Gmail. Rewrite, swap, scrap, start over. It's your account.",
              },
              {
                q: 'What does Offerloop cost?',
                a: 'Free is always free. Pro and Elite are monthly subscriptions. See the pricing page for current numbers.',
                pricingLink: true,
              },
            ].map((item) => (
              <details
                key={item.q}
                className="faq-item"
                style={{
                  borderBottom: '1px solid rgba(96, 165, 250, 0.18)',
                  padding: '24px 0',
                }}
              >
                <summary
                  style={{
                    fontFamily: "'Libre Baskerville', Georgia, serif",
                    fontSize: 19,
                    fontWeight: 400,
                    color: '#FFFFFF',
                    transition: 'color 0.15s ease',
                  }}
                >
                  {item.q}
                </summary>
                <p
                  style={{
                    fontFamily: "'Inter', sans-serif",
                    fontSize: 16,
                    lineHeight: 1.7,
                    color: '#94A8C2',
                    margin: '16px 0 0',
                    maxWidth: 640,
                  }}
                >
                  {item.a}
                  {item.pricingLink && (
                    <>
                      {' '}
                      <Link to="/pricing" style={{ color: '#60A5FA', textDecoration: 'underline', textUnderlineOffset: 3 }}>
                        See pricing
                      </Link>
                      .
                    </>
                  )}
                </p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════ FOOTER CTA ═══════════════ */}
      <section
        style={{
          background: 'radial-gradient(ellipse 90% 70% at 50% 50%, #EEF4FD 0%, #DCE7F7 100%)',
          borderTop: '1px solid #EEF2F8',
          padding: '120px 32px',
          textAlign: 'center',
        }}
      >
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          <h2
            style={{
              fontFamily: "'Libre Baskerville', Georgia, serif",
              fontSize: 'clamp(40px, 6vw, 64px)',
              fontWeight: 400,
              lineHeight: 1.1,
              letterSpacing: '-.025em',
              color: '#0f2545',
              margin: '0 0 40px',
            }}
          >
            Find them. Reach them. Hear back.
          </h2>
          <button
            onClick={() => navigate('/signin?mode=signup')}
            style={{
              background: '#2563EB',
              color: '#fff',
              fontFamily: "'Libre Baskerville', Georgia, serif",
              fontSize: 15,
              fontWeight: 600,
              padding: '14px 32px',
              borderRadius: 3,
              border: 'none',
              cursor: 'pointer',
              transition: 'background 0.15s ease',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#1D4ED8'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = '#2563EB'; }}
          >
            Create account
          </button>
          <p
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: 13,
              color: '#64748b',
              margin: '20px 0 0',
            }}
          >
            Free. No credit card. 5 contacts in your first search.
          </p>
        </div>
      </section>

      {/* FOOTER */}
      <footer style={{ background: '#ffffff', borderTop: '1px solid #EEF2F8' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '64px 32px 0' }}>
          {/* Top: Logo + Link Columns */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto auto', gap: 64, alignItems: 'start' }}>
            {/* Logo + brand line */}
            <div>
              <img src={OfferloopLogo} alt="Offerloop" style={{ height: 160, cursor: 'pointer' }} onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} />
              <p
                style={{
                  fontFamily: "'Libre Baskerville', Georgia, serif",
                  fontSize: 14,
                  color: '#64748b',
                  margin: '8px 0 0',
                  maxWidth: 280,
                  lineHeight: 1.5,
                }}
              >
                Find them. Reach them. Hear back.
              </p>
            </div>

            {/* Features */}
            <div>
              <p style={{ fontFamily: "'Libre Baskerville', Georgia, serif", fontSize: 13, fontWeight: 700, color: '#0f2545', marginBottom: 16 }}>Features</p>
              {[
                { label: 'Find People', path: '/find' },
                { label: 'Meeting Prep', path: '/meeting-prep' },
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

            {/* Resources (moved from header nav) */}
            <div>
              <p style={{ fontFamily: "'Libre Baskerville', Georgia, serif", fontSize: 13, fontWeight: 700, color: '#0f2545', marginBottom: 16 }}>Resources</p>
              {[
                { label: 'Networking Guides', path: '/networking/goldman-sachs' },
                { label: 'Meeting Prep', path: '/meeting/bain' },
                { label: 'Cold Email Guides', path: '/cold-email/investment-banking' },
                { label: 'Alumni Directory', path: '/alumni/usc' },
                { label: 'Compare Offerloop', path: '/compare/linkedin' },
              ].map((link) => (
                <Link key={link.label} to={link.path} style={{ display: 'block', fontFamily: "'Libre Baskerville', Georgia, serif", fontSize: 13, color: '#64748b', textDecoration: 'none', marginBottom: 12, transition: 'color .15s' }} onMouseEnter={(e) => { e.currentTarget.style.color = '#2563EB'; }} onMouseLeave={(e) => { e.currentTarget.style.color = '#64748b'; }}>{link.label}</Link>
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
              <a href="https://www.linkedin.com/company/offerloop-ai" target="_blank" rel="noopener noreferrer" aria-label="LinkedIn" style={{ color: '#94A3B8', transition: 'color .15s' }} onMouseEnter={(e) => { e.currentTarget.style.color = '#2563EB'; }} onMouseLeave={(e) => { e.currentTarget.style.color = '#94A3B8'; }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
              </a>
              <a href="https://twitter.com/offerloop" target="_blank" rel="noopener noreferrer" aria-label="X / Twitter" style={{ color: '#94A3B8', transition: 'color .15s' }} onMouseEnter={(e) => { e.currentTarget.style.color = '#2563EB'; }} onMouseLeave={(e) => { e.currentTarget.style.color = '#94A3B8'; }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
              </a>
              <a href="https://www.instagram.com/offerloop.ai" target="_blank" rel="noopener noreferrer" aria-label="Instagram" style={{ color: '#94A3B8', transition: 'color .15s' }} onMouseEnter={(e) => { e.currentTarget.style.color = '#2563EB'; }} onMouseLeave={(e) => { e.currentTarget.style.color = '#94A3B8'; }}>
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
    </div>
  );
};

export default HowItWorks;
