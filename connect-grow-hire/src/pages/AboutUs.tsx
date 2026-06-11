import { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowRight, ArrowLeft, Linkedin, User, Users } from 'lucide-react';
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

const AboutUs = () => {
  const navigate = useNavigate();
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
        <title>About Offerloop | AI Networking Platform for College Students</title>
        <meta name="description" content="Offerloop was founded in 2025 by USC students to help college students network into consulting, investment banking, and tech. Meet the team." />
        <link rel="canonical" href="https://offerloop.ai/about" />
        <meta property="og:title" content="About Offerloop | AI Networking Platform for College Students" />
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
          <img src={OfferloopLogo} alt="Offerloop" className="h-16 cursor-pointer logo-animate" onClick={() => navigate('/')} />
        </div>
      </header>

      <div className="h-16" />

      {/* Back to home */}
      <div className="px-6 md:px-12 pt-8">
        <div className="max-w-[1200px] mx-auto">
          <button
            onClick={() => navigate('/')}
            style={{
              background: '#1E40AF',
              color: '#FFFFFF',
              fontSize: '14px',
              fontWeight: 500,
              fontFamily: 'var(--font-body)',
              padding: '10px 18px',
              borderRadius: '8px',
              border: 'none',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              transition: 'background 0.15s ease',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#1E3A8A'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = '#1E40AF'; }}
          >
            <ArrowLeft className="w-4 h-4" />
            Back to home
          </button>
        </div>
      </div>

      {/* Our Story */}
      <section className="pt-[60px] pb-[110px] px-6 md:px-12" style={{ background: 'var(--bg-white)' }}>
        <div className="max-w-[1200px] mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-start">
            {/* Image placeholder */}
            <div className="reveal order-1 lg:order-1">
              <div
                style={{
                  aspectRatio: '4 / 5',
                  width: '100%',
                  background: 'var(--bg-off)',
                  border: '1px solid var(--border-light)',
                  borderRadius: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Users className="w-16 h-16" style={{ color: 'var(--border-light)', opacity: 0.9 }} strokeWidth={1} />
              </div>
            </div>

            {/* Text */}
            <div className="reveal order-2 lg:order-2 lg:pt-2">
              <h2
                style={{
                  fontFamily: "'Lora', Georgia, serif",
                  fontSize: 'clamp(52px, 7vw, 84px)',
                  fontWeight: 400,
                  letterSpacing: '-0.03em',
                  color: 'var(--text-primary)',
                  lineHeight: 1.05,
                  marginBottom: '36px',
                }}
              >
                Our Story
              </h2>
              <p style={{ fontFamily: 'var(--font-body)', fontSize: '17px', lineHeight: 1.75, color: 'var(--text-secondary)', marginBottom: '22px' }}>
                During recruiting season at USC, we spent hundreds of hours doing the same thing every other student was doing. Searching for professionals on LinkedIn, guessing email addresses, writing personalized outreach messages one by one, and tracking everything in messy spreadsheets. It was exhausting, inefficient, and it took away from the experiences that make college worth it.
              </p>
              <p style={{ fontFamily: 'var(--font-body)', fontSize: '17px', lineHeight: 1.75, color: 'var(--text-secondary)', marginBottom: '22px' }}>
                We realized the tools that existed (LinkedIn, Handshake, Apollo) weren't built for students. LinkedIn doesn't give you email addresses. Handshake only has job postings. Apollo costs $50 to $500 per month and is designed for enterprise sales teams. There was nothing that helped a college student find the right person, write a great email, send it, and track the response, all in one place.
              </p>
              <p style={{ fontFamily: 'var(--font-body)', fontSize: '17px', lineHeight: 1.75, color: 'var(--text-secondary)' }}>
                So we built Offerloop. What started as a side project in a dorm room in 2025 has grown to 300+ users across USC, UCLA, Michigan, NYU, Georgetown, UPenn, and more. We're still students ourselves, which means we use Offerloop every day and understand the challenges firsthand.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Our Mission */}
      <section className="py-[120px] px-6 md:px-12" style={{ background: 'var(--bg-off)' }}>
        <div className="max-w-[860px] mx-auto text-center reveal">
          <h2
            style={{
              fontFamily: "'Lora', Georgia, serif",
              fontSize: 'clamp(52px, 7vw, 84px)',
              fontWeight: 400,
              letterSpacing: '-0.03em',
              color: 'var(--text-primary)',
              lineHeight: 1.05,
              marginBottom: '36px',
            }}
          >
            Our Mission
          </h2>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: '19px', lineHeight: 1.7, color: 'var(--text-secondary)' }}>
            We believe professional networking should be accessible to every college student. Recruiting for competitive roles in consulting, investment banking, and tech shouldn't require hundreds of hours of manual work. Offerloop automates the busywork of finding contacts, writing emails, and tracking conversations, so students can focus on building real relationships and preparing for the opportunities that matter.
          </p>
        </div>
      </section>

      {/* The Team */}
      <section className="py-[120px] px-6 md:px-12" style={{ background: 'var(--bg-white)' }}>
        <div className="max-w-[1100px] mx-auto">
          <h2
            className="text-center mb-20 reveal"
            style={{
              fontFamily: "'Lora', Georgia, serif",
              fontSize: 'clamp(52px, 7vw, 84px)',
              fontWeight: 400,
              letterSpacing: '-0.03em',
              color: 'var(--text-primary)',
              lineHeight: 1.05,
            }}
          >
            The Team
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-x-10 gap-y-14 max-w-[960px] mx-auto">
            {founders.map((founder, i) => (
              <div key={i} className="reveal">
                <a
                  href={founder.linkedin}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block group"
                  style={{ textDecoration: 'none' }}
                >
                  <div
                    style={{
                      aspectRatio: '1 / 1',
                      width: '100%',
                      background: 'var(--bg-off)',
                      border: '1px solid var(--border-light)',
                      borderRadius: '10px',
                      marginBottom: '20px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'border-color 0.2s ease, background 0.2s ease',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(59, 130, 246, 0.25)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-light)'; }}
                  >
                    <User className="w-10 h-10" style={{ color: 'var(--border-light)', opacity: 0.9 }} strokeWidth={1.25} />
                  </div>
                  <h3 style={{ fontFamily: "'Lora', Georgia, serif", fontSize: '22px', fontWeight: 400, color: 'var(--text-primary)', letterSpacing: '-0.015em', marginBottom: '4px' }}>
                    {founder.name}
                  </h3>
                </a>
                <p style={{ fontFamily: 'var(--font-body)', fontSize: '14px', fontWeight: 500, color: '#3B82F6', marginBottom: '4px' }}>
                  {founder.role}
                </p>
                <p style={{ fontFamily: 'var(--font-body)', fontSize: '13px', color: 'var(--text-tertiary)', marginBottom: '14px' }}>
                  {founder.classYear}
                </p>
                <a
                  href={founder.linkedin}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: 'var(--text-tertiary)', display: 'inline-flex', alignItems: 'center', gap: 6, transition: 'color 0.2s', fontFamily: 'var(--font-body)', fontSize: '13px', textDecoration: 'none' }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = '#3B82F6'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-tertiary)'; }}
                >
                  <Linkedin className="w-[15px] h-[15px]" />
                  <span>LinkedIn</span>
                </a>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Let's Connect */}
      <section className="py-[100px] px-6 md:px-12" style={{ background: 'var(--bg-off)' }}>
        <div className="max-w-[640px] mx-auto text-center reveal">
          <p style={{ fontFamily: 'var(--font-body)', fontSize: '13px', fontWeight: 500, color: '#3B82F6', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '16px' }}>
            Get in Touch
          </p>
          <h2 className="mb-6" style={{ fontFamily: "'Lora', Georgia, serif", fontSize: '36px', fontWeight: 400, letterSpacing: '-0.02em', color: 'var(--text-primary)', lineHeight: 1.2 }}>
            Let's connect.
          </h2>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: '17px', lineHeight: 1.7, color: 'var(--text-secondary)', marginBottom: '28px' }}>
            We're always looking to hear from students, builders, and anyone working on making recruiting feel less like a grind. Say hi anytime.
          </p>
          <Link
            to="/contact-us"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              fontFamily: 'var(--font-body)',
              fontSize: '15px',
              fontWeight: 500,
              color: '#3B82F6',
              textDecoration: 'none',
              borderBottom: '1px solid rgba(59, 130, 246, 0.3)',
              paddingBottom: '2px',
              transition: 'border-color 0.2s ease',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderBottomColor = '#3B82F6'; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderBottomColor = 'rgba(59, 130, 246, 0.3)'; }}
          >
            Get in touch
            <ArrowRight className="w-4 h-4" />
          </Link>
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
