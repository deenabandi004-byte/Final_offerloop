import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Menu, X, ArrowRight, Linkedin } from 'lucide-react';
import { useFirebaseAuth } from "@/contexts/FirebaseAuthContext";
import OfferloopLogo from '@/assets/offerloop_logo2.png';

const AboutUs = () => {
  const navigate = useNavigate();
  const { user } = useFirebaseAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [navbarScrolled, setNavbarScrolled] = useState(false);

  // Navbar scroll behavior
  useEffect(() => {
    const handleScroll = () => {
      setNavbarScrolled(window.scrollY > 50);
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

  const scrollToFeatures = () => {
    const element = document.getElementById('features');
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div className="min-h-screen w-full" style={{ fontFamily: 'var(--font-body)', background: 'var(--bg-white)' }}>
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
          <div className="flex flex-col p-6 gap-4">
            <button
              onClick={() => {
                scrollToFeatures();
                setMobileMenuOpen(false);
              }}
              className="text-left text-sm font-medium"
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
                setMobileMenuOpen(false);
              }}
              className="text-left text-sm font-medium"
              style={{
                color: 'var(--text-secondary)',
                fontFamily: 'var(--font-body)',
              }}
            >
              Reviews
            </button>
            <div className="flex flex-col gap-3 pt-4 border-t" style={{ borderColor: 'var(--border-light)' }}>
              {user ? (
                <button
                  onClick={() => {
                    navigate('/contact-search');
                    setMobileMenuOpen(false);
                  }}
                  className="btn-ghost w-full text-left px-4 py-3"
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
                    style={{
                      background: '#2563EB',
                    }}
                  >
                    Create account
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Spacer after navbar */}
      <div className="h-16" />

      {/* Hero Section */}
      <section
        className="relative py-[100px] px-6 md:px-12"
        style={{ background: 'var(--bg-white)' }}
      >
        <div className="max-w-7xl mx-auto">
          {/* Subtle radial glow */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: 'radial-gradient(ellipse at center, rgba(37, 99, 235, 0.08) 0%, transparent 70%)',
              transform: 'scale(1.3)',
              filter: 'blur(40px)',
              zIndex: 0,
            }}
          />
          
          <div className="relative z-10 text-center max-w-[780px] mx-auto reveal">
            <h1
              style={{
                fontFamily: "'Instrument Serif', Georgia, serif",
                fontSize: '52px',
                fontWeight: 400,
                letterSpacing: '-0.03em',
                color: 'var(--text-primary)',
                marginBottom: '20px',
                lineHeight: 1.1,
              }}
            >
              About <span style={{ color: '#2563EB' }}>Offerloop</span>
            </h1>
            <p
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: '17px',
                lineHeight: 1.7,
                color: 'var(--text-secondary)',
                maxWidth: '640px',
                margin: '0 auto',
              }}
            >
              Built by students, for students — making networking feel less like work and more like opportunity.
            </p>
          </div>
        </div>
      </section>

      {/* Mission Section */}
      <section
        className="py-[100px] px-6 md:px-12"
        style={{ background: 'var(--bg-white)' }}
      >
        <div className="max-w-7xl mx-auto">
          <h2
            className="text-center mb-12 reveal"
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '40px',
              fontWeight: 400,
              letterSpacing: '-0.025em',
              color: 'var(--text-primary)',
            }}
          >
            Our Mission
          </h2>
          
          <div className="max-w-[640px] mx-auto text-center reveal">
            <p
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: '17px',
                lineHeight: 1.7,
                color: 'var(--text-secondary)',
                marginBottom: '48px',
              }}
            >
              To make it easier for students and young professionals to connect, stand out and land better opportunities. By cutting down the time to send emails and prep for calls by <span style={{ fontWeight: 600, color: '#2563EB' }}>90%</span>, we save our users hundreds of hours of work and stress, giving them back time to focus on what matters: learning, growing and enjoying your best years.
            </p>
            
            {/* Stats */}
            <div className="grid grid-cols-3 gap-8 pt-8 border-t" style={{ borderColor: 'var(--border-light)' }}>
              <div className="text-center reveal">
                <p
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: '36px',
                    fontWeight: 400,
                    color: '#2563EB',
                    marginBottom: '4px',
                  }}
                >
                  90%
                </p>
                <p
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: '13px',
                    color: 'var(--text-tertiary)',
                  }}
                >
                  Time saved on outreach
                </p>
              </div>
              <div className="text-center reveal">
                <p
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: '36px',
                    fontWeight: 400,
                    color: '#2563EB',
                    marginBottom: '4px',
                  }}
                >
                  100+
                </p>
                <p
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: '13px',
                    color: 'var(--text-tertiary)',
                  }}
                >
                  Hours given back
                </p>
              </div>
              <div className="text-center reveal">
                <p
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: '36px',
                    fontWeight: 400,
                    color: '#2563EB',
                    marginBottom: '4px',
                  }}
                >
                  1000s
                </p>
                <p
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: '13px',
                    color: 'var(--text-tertiary)',
                  }}
                >
                  Connections made
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Values Section */}
      <section
        className="py-[100px] px-6 md:px-12"
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
            Our Values
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-[960px] mx-auto">
            {[
              {
                title: 'High-Impact Connections',
                description: 'We make it easier to reach the people that can move you forward. Quality over quantity, always.',
              },
              {
                title: 'Innovation First',
                description: "We're constantly building and refining Offerloop with feedback from students and recruiters to make networking faster, smarter, and more personal.",
              },
              {
                title: 'Human Connection',
                description: 'AI makes things easier, but people make them meaningful. We keep human connection at the center of everything we create.',
              },
            ].map((value, i) => (
              <div
                key={i}
                className="reveal rounded-[14px] transition-all"
                style={{
                  background: 'rgba(248, 250, 255, 0.88)',
                  backdropFilter: 'blur(8px)',
                  border: '1px solid var(--border-light)',
                  padding: '32px 28px',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-6px)';
                  e.currentTarget.style.boxShadow = '0 12px 40px rgba(37, 99, 235, 0.10)';
                  e.currentTarget.style.borderColor = 'rgba(37, 99, 235, 0.18)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = 'none';
                  e.currentTarget.style.borderColor = 'var(--border-light)';
                }}
              >
                <h3
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: '15px',
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                    marginBottom: '12px',
                  }}
                >
                  {value.title}
                </h3>
                <p
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: '13.5px',
                    lineHeight: 1.65,
                    color: 'var(--text-secondary)',
                    opacity: 0.85,
                  }}
                >
                  {value.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Founders Section */}
      <section
        className="py-[100px] px-6 md:px-12"
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
            Meet the Founders
          </h2>
          
          <div className="flex flex-col md:flex-row items-center justify-center gap-12 md:gap-[60px] reveal">
            {[
              { name: 'Nicholas Wittig', role: 'CEO', linkedin: 'https://www.linkedin.com/in/nicholas-wittig/?lipi=urn%3Ali%3Apage%3Ad_flagship3_feed%3BMpfI1bzxQU%2BEihVXMlnMCw%3D%3D' },
              { name: 'Deena Siddharth Bandi', role: 'CTO', linkedin: 'https://www.linkedin.com/in/deena-siddharth-bandi-7489b2236/' },
              { name: 'Rylan Bohnett', role: 'CMO', linkedin: 'https://www.linkedin.com/in/the-rylan-bohnett/' },
            ].map((founder, i) => (
              <div key={i} className="text-center relative">
                {i > 0 && (
                  <div
                    className="hidden md:block absolute"
                    style={{
                      width: '1px',
                      height: '40px',
                      background: 'var(--border)',
                      left: '-30px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                    }}
                  />
                )}
                <h3
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: '16px',
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                    letterSpacing: '-0.01em',
                    marginBottom: '3px',
                  }}
                >
                  {founder.name}
                </h3>
                <p
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: '13px',
                    fontWeight: 500,
                    color: '#2563EB',
                    marginTop: '3px',
                    marginBottom: '8px',
                  }}
                >
                  {founder.role}
                </p>
                <a
                  href={founder.linkedin}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    color: 'var(--text-tertiary)',
                    display: 'inline-block',
                    transition: 'color 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = '#2563EB';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = 'var(--text-tertiary)';
                  }}
                >
                  <Linkedin className="w-[18px] h-[18px]" />
                </a>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Our Story Section */}
      <section
        className="py-[100px] px-6 md:px-12"
        style={{ background: 'var(--bg-white)' }}
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
            Our Story
          </h2>
          
          <div className="max-w-[640px] mx-auto reveal">
            <p
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: '17px',
                lineHeight: 1.7,
                color: 'var(--text-secondary)',
                marginBottom: '24px',
              }}
            >
              Offerloop is a platform built by students, for students and young professionals with one goal: to make it easier to connect with professionals, stand out, and land great opportunities.
            </p>
            
            <p
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: '17px',
                lineHeight: 1.7,
                color: 'var(--text-secondary)',
                marginBottom: '24px',
              }}
            >
              At USC, we saw countless students spending hours filling out spreadsheets and sending emails, and we went through the same thing ourselves. With so many applicants for every competitive role, networking is essential but the process is slow, stressful, and exhausting. Worst of all it takes away from what's supposed to be the most exciting time of your life.
            </p>
            
            <p
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: '17px',
                lineHeight: 1.7,
                color: 'var(--text-secondary)',
              }}
            >
              We built Offerloop to fix that. Our platform automates the outreach process, helping students spend less time on tedious work and more time building real connections and preparing for what truly matters in their careers.
            </p>
          </div>
          
          {/* Timeline */}
          <div className="mt-16 pt-16 border-t max-w-2xl mx-auto" style={{ borderColor: 'var(--border-light)' }}>
            <div className="flex flex-col md:flex-row items-center justify-between gap-4 md:gap-0 relative">
              {[
                { period: 'Spring 2025', label: 'Idea born' },
                { period: 'Summer 2025', label: 'First prototype' },
                { period: 'Fall 2025', label: 'Beta Launch' },
                { period: 'Now', label: 'Growing daily' },
              ].map((milestone, i) => (
                <div key={i} className="text-center reveal relative flex-1">
                  <div
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: 'var(--border)',
                      margin: '0 auto 12px',
                    }}
                  />
                  <p
                    style={{
                      fontFamily: 'var(--font-body)',
                      fontSize: '14px',
                      fontWeight: 600,
                      color: 'var(--text-primary)',
                      marginBottom: '4px',
                    }}
                  >
                    {milestone.period}
                  </p>
                  <p
                    style={{
                      fontFamily: 'var(--font-body)',
                      fontSize: '13px',
                      color: 'var(--text-tertiary)',
                    }}
                  >
                    {milestone.label}
                  </p>
                  {i < 3 && (
                    <div
                      className="hidden md:block absolute"
                      style={{
                        width: 'calc(100% - 60px)',
                        height: '1px',
                        background: 'var(--border-light)',
                        top: '4px',
                        left: 'calc(50% + 30px)',
                      }}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Built at USC Section */}
      <section
        className="py-[100px] px-6 md:px-12"
        style={{ background: 'var(--bg-off)' }}
      >
        <div className="max-w-[640px] mx-auto text-center reveal">
          <h3
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '32px',
              fontWeight: 400,
              letterSpacing: '-0.025em',
              color: 'var(--text-primary)',
              marginBottom: '16px',
            }}
          >
            Built at USC, for students everywhere
          </h3>
          <p
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: '17px',
              lineHeight: 1.7,
              color: 'var(--text-secondary)',
              marginBottom: '24px',
            }}
          >
            What started as a side project in a dorm room has grown into a platform helping students across the country land their dream opportunities. We're still students ourselves, which means we understand the challenges firsthand.
          </p>
        </div>
      </section>

      {/* CTA Section */}
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
            {/* Decorative circles */}
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
              Ready to Transform Your Recruiting Journey?
            </h2>
            <p
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: '15px',
                color: 'var(--text-secondary)',
                marginBottom: '32px',
              }}
            >
              Join thousands of aspiring professionals in discovering their dream opportunities through Offerloop.
            </p>
            <div>
              <button
                onClick={() => navigate('/signin?mode=signup')}
                className="btn-primary-lg"
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
            © 2025 Offerloop. All rights reserved.
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
    </div>
  );
};

export default AboutUs;
