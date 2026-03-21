import { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import { useNavigate, Link } from 'react-router-dom';
import { Menu, X, ArrowRight, Linkedin } from 'lucide-react';
import { useFirebaseAuth } from "@/contexts/FirebaseAuthContext";
import OfferloopLogo from '@/assets/offerloop_logo2.png';

const founders = [
  {
    name: 'Nick Wittig',
    role: 'CEO',
    classYear: 'USC Class of 2027',
    linkedin: 'https://www.linkedin.com/in/nicholas-wittig/',
  },
  {
    name: 'Deena Siddharth Bandi',
    role: 'CTO',
    classYear: 'USC Class of 2026',
    linkedin: 'https://www.linkedin.com/in/deena-siddharth-bandi-7489b2236/',
  },
  {
    name: 'Rylan Bohnett',
    role: 'CMO',
    classYear: 'USC Class of 2027',
    linkedin: 'https://www.linkedin.com/in/the-rylan-bohnett/',
  },
];

const tractionStats = [
  { value: '300+', label: 'Active student users' },
  { value: '41', label: 'Paying subscribers' },
  { value: '22%', label: 'Free-to-paid conversion' },
  { value: '$0', label: 'Customer acquisition cost' },
  { value: '6+', label: 'Universities represented' },
];

const AboutUs = () => {
  const navigate = useNavigate();
  const { user } = useFirebaseAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [navbarScrolled, setNavbarScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setNavbarScrolled(window.scrollY > 50);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

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
    return () => { elements.forEach((el) => observer.unobserve(el)); };
  }, []);

  return (
    <div className="min-h-screen w-full" style={{ fontFamily: 'var(--font-body)', background: 'var(--bg-white)' }}>
      <Helmet>
        <title>About Offerloop — AI Networking Platform for College Students</title>
        <meta name="description" content="Offerloop was founded in 2025 by USC students to help college students network into consulting, investment banking, and tech. Meet the team." />
        <link rel="canonical" href="https://offerloop.ai/about" />
        <meta property="og:title" content="About Offerloop — AI Networking Platform for College Students" />
        <meta property="og:description" content="Founded in 2025 by USC students. 300+ users across 6+ universities. Meet the team behind Offerloop." />
        <meta property="og:url" content="https://offerloop.ai/about" />
        <meta property="og:type" content="website" />
        <script type="application/ld+json">{JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Organization",
          "name": "Offerloop",
          "url": "https://offerloop.ai",
          "logo": "https://offerloop.ai/logo.png",
          "description": "AI-powered networking platform for college students recruiting in consulting, investment banking, and tech.",
          "foundingDate": "2025",
          "founders": [
            {
              "@type": "Person",
              "name": "Deena Siddharth Bandi",
              "jobTitle": "CTO",
              "alumniOf": { "@type": "CollegeOrUniversity", "name": "University of Southern California" },
              "sameAs": "https://www.linkedin.com/in/deena-siddharth-bandi-7489b2236/"
            },
            {
              "@type": "Person",
              "name": "Nick Wittig",
              "jobTitle": "CEO",
              "alumniOf": { "@type": "CollegeOrUniversity", "name": "University of Southern California" },
              "sameAs": "https://www.linkedin.com/in/nicholas-wittig/"
            },
            {
              "@type": "Person",
              "name": "Rylan Bohnett",
              "jobTitle": "CMO",
              "alumniOf": { "@type": "CollegeOrUniversity", "name": "University of Southern California" },
              "sameAs": "https://www.linkedin.com/in/the-rylan-bohnett/"
            }
          ],
          "sameAs": [
            "https://www.linkedin.com/company/offerloop",
            "https://twitter.com/offerloop"
          ]
        })}</script>
        {founders.map((f, i) => (
          <script key={i} type="application/ld+json">{JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Person",
            "name": f.name,
            "jobTitle": f.role,
            "worksFor": { "@type": "Organization", "name": "Offerloop", "url": "https://offerloop.ai" },
            "alumniOf": { "@type": "CollegeOrUniversity", "name": "University of Southern California" },
            "sameAs": f.linkedin
          })}</script>
        ))}
      </Helmet>

      {/* NAVBAR */}
      <header
        className="fixed top-0 left-0 right-0 z-50 h-16 flex items-center justify-between px-6 md:px-12"
        style={{
          background: navbarScrolled ? 'rgba(248, 250, 255, 0.96)' : 'rgba(248, 250, 255, 0.88)',
          backdropFilter: 'blur(16px) saturate(1.4)',
          WebkitBackdropFilter: 'blur(16px) saturate(1.4)',
          borderBottom: `1px solid ${navbarScrolled ? 'rgba(214, 222, 240, 0.8)' : 'rgba(214, 222, 240, 0.6)'}`,
          transition: 'all 0.3s ease',
        }}
      >
        <div className="flex items-center">
          <img src={OfferloopLogo} alt="Offerloop" className="h-12 cursor-pointer logo-animate" onClick={() => navigate('/')} />
        </div>
        <nav className="hidden md:flex items-center gap-8">
          <Link to="/pricing" className="nav-link text-sm font-medium relative" style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}>Pricing</Link>
          <Link to="/about" className="nav-link text-sm font-medium relative" style={{ color: '#3B82F6', fontFamily: 'var(--font-body)' }}>About</Link>
        </nav>
        <div className="hidden md:flex items-center gap-4">
          {user ? (
            <button onClick={() => navigate('/find')} className="btn-ghost">Find people</button>
          ) : (
            <>
              <button onClick={() => navigate('/signin?mode=signin')} className="btn-ghost">Sign in</button>
              <button onClick={() => navigate('/signin?mode=signup')} className="btn-primary-lg" style={{ background: '#3B82F6' }}>Create account</button>
            </>
          )}
        </div>
        <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="md:hidden p-2" style={{ color: 'var(--text-secondary)' }}>
          {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </header>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="fixed top-16 left-0 right-0 md:hidden z-40" style={{ background: 'var(--bg-white)', borderBottom: '1px solid var(--border-light)', backdropFilter: 'blur(16px)' }}>
          <div className="flex flex-col p-6 gap-4">
            <Link to="/pricing" className="text-left text-sm font-medium" style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }} onClick={() => setMobileMenuOpen(false)}>Pricing</Link>
            <div className="flex flex-col gap-3 pt-4 border-t" style={{ borderColor: 'var(--border-light)' }}>
              {user ? (
                <button onClick={() => { navigate('/find'); setMobileMenuOpen(false); }} className="btn-ghost w-full text-left px-4 py-3">Find people</button>
              ) : (
                <>
                  <button onClick={() => { navigate('/signin?mode=signin'); setMobileMenuOpen(false); }} className="btn-ghost w-full text-left px-4 py-3">Sign in</button>
                  <button onClick={() => { navigate('/signin?mode=signup'); setMobileMenuOpen(false); }} className="btn-primary-lg w-full" style={{ background: '#3B82F6' }}>Create account</button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="h-16" />

      {/* Hero */}
      <section className="relative py-[100px] px-6 md:px-12" style={{ background: 'var(--bg-white)' }}>
        <div className="max-w-7xl mx-auto">
          <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse at center, rgba(37, 99, 235, 0.08) 0%, transparent 70%)', transform: 'scale(1.3)', filter: 'blur(40px)', zIndex: 0 }} />
          <div className="relative z-10 text-center max-w-[780px] mx-auto reveal">
            <h1 style={{ fontFamily: "'Lora', Georgia, serif", fontSize: '52px', fontWeight: 400, letterSpacing: '-0.03em', color: 'var(--text-primary)', marginBottom: '20px', lineHeight: 1.1 }}>
              Built by students, <span style={{ color: '#3B82F6' }}>for students</span>
            </h1>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: '17px', lineHeight: 1.7, color: 'var(--text-secondary)', maxWidth: '640px', margin: '0 auto' }}>
              Offerloop is a networking and outreach platform — not an email provider. Founded in 2025 at the University of Southern California by three students who were frustrated with the manual grind of networking for internships, we built the tool we wished we had.
            </p>
          </div>
        </div>
      </section>

      {/* Founding Story */}
      <section className="py-[80px] px-6 md:px-12" style={{ background: 'var(--bg-white)' }}>
        <div className="max-w-[640px] mx-auto reveal">
          <h2 className="text-center mb-8" style={{ fontFamily: "'Lora', Georgia, serif", fontSize: '40px', fontWeight: 400, letterSpacing: '-0.025em', color: 'var(--text-primary)' }}>
            Our Story
          </h2>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: '17px', lineHeight: 1.7, color: 'var(--text-secondary)', marginBottom: '24px' }}>
            During recruiting season at USC, we spent hundreds of hours doing the same thing every other student was doing — searching for professionals on LinkedIn, guessing email addresses, writing personalized outreach messages one by one, and tracking everything in messy spreadsheets. It was exhausting, inefficient, and it took away from the experiences that make college worth it.
          </p>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: '17px', lineHeight: 1.7, color: 'var(--text-secondary)', marginBottom: '24px' }}>
            We realized the tools that existed — LinkedIn, Handshake, Apollo — weren't built for students. LinkedIn doesn't give you email addresses. Handshake only has job postings. Apollo costs $50-500/month and is designed for enterprise sales teams. There was nothing that helped a college student find the right person, write a great email, send it, and track the response — all in one place.
          </p>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: '17px', lineHeight: 1.7, color: 'var(--text-secondary)' }}>
            So we built Offerloop. What started as a side project in a dorm room in 2025 has grown to 300+ users across USC, UCLA, Michigan, NYU, Georgetown, UPenn, and more. We're still students ourselves, which means we use Offerloop every day and understand the challenges firsthand.
          </p>
        </div>
      </section>

      {/* Team */}
      <section className="py-[80px] px-6 md:px-12" style={{ background: 'var(--bg-off)' }}>
        <div className="max-w-7xl mx-auto">
          <h2 className="text-center mb-14 reveal" style={{ fontFamily: "'Lora', Georgia, serif", fontSize: '40px', fontWeight: 400, letterSpacing: '-0.025em', color: 'var(--text-primary)' }}>
            Meet the Founders
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-[900px] mx-auto">
            {founders.map((founder, i) => (
              <div key={i} className="reveal rounded-[14px] text-center transition-all" style={{ background: 'rgba(248, 250, 255, 0.88)', backdropFilter: 'blur(8px)', border: '1px solid var(--border-light)', padding: '36px 28px' }}
                onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-6px)'; e.currentTarget.style.boxShadow = '0 12px 40px rgba(37, 99, 235, 0.10)'; e.currentTarget.style.borderColor = 'rgba(37, 99, 235, 0.18)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = 'var(--border-light)'; }}
              >
                <a href={founder.linkedin} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
                  <h3 style={{ fontFamily: 'var(--font-body)', fontSize: '17px', fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '-0.01em', marginBottom: '4px' }}>
                    {founder.name}
                  </h3>
                </a>
                <p style={{ fontFamily: 'var(--font-body)', fontSize: '14px', fontWeight: 500, color: '#3B82F6', marginBottom: '6px' }}>
                  {founder.role}
                </p>
                <p style={{ fontFamily: 'var(--font-body)', fontSize: '13px', color: 'var(--text-tertiary)', marginBottom: '12px' }}>
                  {founder.classYear}
                </p>
                <a href={founder.linkedin} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--text-tertiary)', display: 'inline-block', transition: 'color 0.2s' }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = '#3B82F6'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-tertiary)'; }}
                >
                  <Linkedin className="w-[18px] h-[18px]" />
                </a>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Mission */}
      <section className="py-[80px] px-6 md:px-12" style={{ background: 'var(--bg-white)' }}>
        <div className="max-w-[640px] mx-auto text-center reveal">
          <h2 className="mb-6" style={{ fontFamily: "'Lora', Georgia, serif", fontSize: '40px', fontWeight: 400, letterSpacing: '-0.025em', color: 'var(--text-primary)' }}>
            Our Mission
          </h2>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: '17px', lineHeight: 1.7, color: 'var(--text-secondary)' }}>
            Our mission is to make professional networking accessible to every college student. Recruiting for competitive roles in consulting, investment banking, and tech shouldn't require hundreds of hours of manual work. Offerloop automates the busywork — finding contacts, writing emails, tracking conversations — so students can focus on building real relationships and preparing for the opportunities that matter.
          </p>
        </div>
      </section>

      {/* Traction */}
      <section className="py-[80px] px-6 md:px-12" style={{ background: 'var(--bg-off)' }}>
        <div className="max-w-[800px] mx-auto">
          <h2 className="text-center mb-12 reveal" style={{ fontFamily: "'Lora', Georgia, serif", fontSize: '40px', fontWeight: 400, letterSpacing: '-0.025em', color: 'var(--text-primary)' }}>
            Traction
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-6 reveal">
            {tractionStats.map((stat, i) => (
              <div key={i} className="text-center">
                <p style={{ fontFamily: "'Lora', Georgia, serif", fontSize: '32px', fontWeight: 400, color: '#3B82F6', marginBottom: '4px' }}>
                  {stat.value}
                </p>
                <p style={{ fontFamily: 'var(--font-body)', fontSize: '12px', color: 'var(--text-tertiary)', lineHeight: 1.4 }}>
                  {stat.label}
                </p>
              </div>
            ))}
          </div>
          <p className="text-center mt-8 reveal" style={{ fontFamily: 'var(--font-body)', fontSize: '14px', color: 'var(--text-tertiary)' }}>
            Launched and validated at USC. Growing organically across UCLA, University of Michigan, NYU, Georgetown, and UPenn.
          </p>
        </div>
      </section>

      {/* Timeline */}
      <section className="py-[80px] px-6 md:px-12" style={{ background: 'var(--bg-white)' }}>
        <div className="max-w-2xl mx-auto">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4 md:gap-0 relative reveal">
            {[
              { period: 'Spring 2025', label: 'Idea born at USC' },
              { period: 'Summer 2025', label: 'First prototype built' },
              { period: 'Fall 2025', label: 'Beta launch, first users' },
              { period: 'Now', label: '300+ users, growing daily' },
            ].map((milestone, i) => (
              <div key={i} className="text-center relative flex-1">
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: i === 3 ? '#3B82F6' : 'var(--border)', margin: '0 auto 12px' }} />
                <p style={{ fontFamily: 'var(--font-body)', fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>{milestone.period}</p>
                <p style={{ fontFamily: 'var(--font-body)', fontSize: '13px', color: 'var(--text-tertiary)' }}>{milestone.label}</p>
                {i < 3 && (
                  <div className="hidden md:block absolute" style={{ width: 'calc(100% - 60px)', height: '1px', background: 'var(--border-light)', top: '4px', left: 'calc(50% + 30px)' }} />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-[100px] pb-[110px] px-6 md:px-12" style={{ background: 'var(--bg-white)' }}>
        <div className="max-w-[640px] mx-auto">
          <div className="relative rounded-[20px] transition-all reveal" style={{ background: 'linear-gradient(135deg, rgba(37, 99, 235, 0.04) 0%, rgba(59, 130, 246, 0.06) 50%, rgba(37, 99, 235, 0.04) 100%)', border: '1px solid rgba(37, 99, 235, 0.12)', padding: '80px 48px', textAlign: 'center', maxWidth: '640px', margin: '0 auto', position: 'relative', overflow: 'hidden' }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(37, 99, 235, 0.22)'; e.currentTarget.style.boxShadow = '0 12px 48px rgba(37, 99, 235, 0.14)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(37, 99, 235, 0.12)'; e.currentTarget.style.boxShadow = 'none'; }}
          >
            <div className="absolute pointer-events-none" style={{ width: '80px', height: '80px', border: '1.5px solid rgba(37, 99, 235, 0.15)', borderRadius: '50%', opacity: 0.4, top: '-30px', right: '-30px', background: 'radial-gradient(circle, rgba(37, 99, 235, 0.05) 0%, transparent 70%)' }} />
            <div className="absolute pointer-events-none" style={{ width: '60px', height: '60px', border: '1.5px solid rgba(59, 130, 246, 0.15)', borderRadius: '50%', opacity: 0.4, bottom: '-25px', left: '-25px', background: 'radial-gradient(circle, rgba(59, 130, 246, 0.05) 0%, transparent 70%)' }} />
            <p style={{ fontFamily: 'var(--font-body)', fontSize: '13px', fontWeight: 500, color: 'var(--text-tertiary)', letterSpacing: '0.02em', marginBottom: 20 }}>
              Join 300+ students from USC, Georgetown, NYU &amp; more
            </p>
            <h2 style={{ fontFamily: "'Lora', Georgia, serif", fontSize: '38px', fontWeight: 400, letterSpacing: '-0.025em', color: 'var(--text-primary)', marginBottom: '12px' }}>
              Try Offerloop free
            </h2>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: '15px', color: 'var(--text-secondary)', marginBottom: '32px' }}>
              Free to start. Set up in under two minutes.
            </p>
            <div>
              <button onClick={() => navigate('/signin?mode=signup')} className="btn-primary-lg btn-pulse" style={{ background: '#3B82F6' }}>
                Create free account
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-6 md:px-12" style={{ background: 'var(--bg-white)', borderTop: '1px solid var(--border-light)' }}>
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-sm" style={{ fontFamily: 'var(--font-body)', fontSize: '13px', color: 'var(--text-tertiary)' }}>
            &copy; 2026 Offerloop. All rights reserved.
          </p>
          <div className="flex gap-6">
            {[
              { label: 'About', path: '/about' },
              { label: 'Contact', path: '/contact-us' },
              { label: 'Privacy', path: '/privacy' },
              { label: 'Terms', path: '/terms-of-service' },
            ].map((link) => (
              <Link key={link.path} to={link.path} className="footer-link text-sm relative" style={{ fontFamily: 'var(--font-body)', fontSize: '13px', color: 'var(--text-tertiary)' }}>
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
};

export default AboutUs;
