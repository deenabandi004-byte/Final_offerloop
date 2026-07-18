// src/pages/Waitlist.tsx
// iOS app waitlist styled like an App Store product page: app icon, name,
// a GET-style "Join Waitlist" button, App Store info cells, and the app
// screenshots in a swipeable "Preview" gallery. Emails are recorded in
// Firestore via /api/waitlist/join.
import { useRef, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Check } from 'lucide-react';
import MarketingHeader from '@/components/MarketingHeader';
import { API_BASE_URL } from '@/services/api';

// Load and order the screenshots (01-… through 08-…).
const carouselModules = import.meta.glob('@/assets/app-carousel/*.png', {
  eager: true,
  import: 'default',
}) as Record<string, string>;
const SLIDES: string[] = Object.entries(carouselModules)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([, src]) => src);

// Apple-ish system font for the App Store chrome.
const SF = "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Inter', system-ui, sans-serif";

const INFO_CELLS = [
  { value: 'Coming Soon', label: 'Release' },
  { value: 'Business', label: 'Category' },
  { value: '4+', label: 'Age' },
  { value: 'Free', label: 'Price' },
];

const Waitlist = () => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [email, setEmail] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const openForm = () => {
    setExpanded(true);
    setTimeout(() => inputRef.current?.focus(), 60);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (status === 'loading') return;
    const trimmed = email.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(trimmed)) {
      setStatus('error');
      setMessage('Please enter a valid email address.');
      return;
    }
    setStatus('loading');
    setMessage('');
    try {
      const res = await fetch(`${API_BASE_URL}/waitlist/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmed, source: 'app-store' }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setStatus('done');
        setMessage(data.already_joined ? "You're already on the list." : "You're on the list.");
      } else {
        setStatus('error');
        setMessage(data.error || 'Something went wrong. Please try again.');
      }
    } catch {
      setStatus('error');
      setMessage('Something went wrong. Please try again.');
    }
  };

  return (
    <div className="min-h-screen w-full" style={{ fontFamily: SF, background: '#FFFFFF' }}>
      <Helmet>
        <title>Offerloop for iPhone: Join the Waitlist</title>
        <meta name="description" content="The Offerloop app is coming to iPhone. Join the waitlist and we'll email you the moment it launches." />
        <link rel="canonical" href="https://offerloop.ai/waitlist" />
        <meta property="og:title" content="Offerloop for iPhone: Join the Waitlist" />
        <meta property="og:description" content="The Offerloop app is coming to iPhone. Join the waitlist and we'll email you the moment it launches." />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&display=swap" rel="stylesheet" />
      </Helmet>

      <MarketingHeader />

      <style>{`
        .as-input:focus { outline: none; border-color: #2563EB; box-shadow: 0 0 0 4px rgba(37,99,235,0.12); }
        .as-scroller {
          display: flex;
          gap: 14px;
          overflow-x: auto;
          scroll-snap-type: x mandatory;
          -webkit-overflow-scrolling: touch;
          padding: 4px 22px 8px;
          scrollbar-width: none;
        }
        .as-scroller::-webkit-scrollbar { display: none; }
        .as-shot {
          scroll-snap-align: center;
          flex: 0 0 auto;
          width: clamp(230px, 66vw, 288px);
          border-radius: 18px;
          overflow: hidden;
          border: 1px solid #E6E6EA;
          background: #F2F2F4;
        }
        .as-shot img { display: block; width: 100%; height: auto; }
        .as-cells { display: flex; overflow-x: auto; scrollbar-width: none; }
        .as-cells::-webkit-scrollbar { display: none; }
      `}</style>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '0 22px' }}>
        {/* ═══════════ APP HEADER ═══════════ */}
        <section style={{ display: 'flex', gap: 'clamp(16px, 3vw, 24px)', alignItems: 'flex-start', padding: 'clamp(32px, 5vw, 52px) 0 24px' }}>
          {/* Icon */}
          <div
            style={{
              flex: '0 0 auto',
              width: 'clamp(88px, 20vw, 118px)',
              height: 'clamp(88px, 20vw, 118px)',
              borderRadius: 'clamp(20px, 4.6vw, 27px)',
              overflow: 'hidden',
              border: '1px solid rgba(0,0,0,0.08)',
              boxShadow: '0 6px 20px rgba(15,37,69,0.14)',
            }}
          >
            <img src="/favicon.png" alt="Offerloop app icon" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          </div>

          {/* Name + subtitle + GET */}
          <div style={{ flex: '1 1 auto', minWidth: 0 }}>
            <h1 style={{ fontFamily: SF, fontSize: 'clamp(22px, 4vw, 30px)', fontWeight: 700, letterSpacing: '-0.02em', color: '#1D1D1F', margin: '0 0 4px', lineHeight: 1.1 }}>
              Offerloop
            </h1>
            <p style={{ fontFamily: SF, fontSize: 'clamp(13px, 2vw, 16px)', color: '#6E6E73', margin: '0 0 4px', lineHeight: 1.35 }}>
              Find people. Send outreach. Land the offer.
            </p>
            <p style={{ fontFamily: SF, fontSize: 13, color: '#2563EB', fontWeight: 500, margin: '0 0 16px' }}>
              Networking for students
            </p>

            {status === 'done' ? (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: 100, padding: '9px 16px' }}>
                <Check size={16} strokeWidth={3} color="#059669" />
                <span style={{ fontFamily: SF, fontSize: 14, fontWeight: 600, color: '#047857' }}>{message}</span>
              </div>
            ) : expanded ? (
              <form onSubmit={submit} style={{ maxWidth: 420 }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  <input
                    ref={inputRef}
                    className="as-input"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    placeholder="you@school.edu"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); if (status === 'error') setStatus('idle'); }}
                    style={{ flex: '1 1 180px', minWidth: 0, fontFamily: SF, fontSize: 15, color: '#1D1D1F', background: '#FFFFFF', border: '1px solid #D6DEF0', borderRadius: 100, padding: '11px 18px', transition: 'border-color 0.15s ease, box-shadow 0.15s ease' }}
                  />
                  <button
                    type="submit"
                    disabled={status === 'loading'}
                    style={{ flex: '0 0 auto', background: '#2563EB', color: '#FFFFFF', fontFamily: SF, fontSize: 14, fontWeight: 700, padding: '11px 22px', borderRadius: 100, border: 'none', cursor: status === 'loading' ? 'default' : 'pointer', opacity: status === 'loading' ? 0.7 : 1, whiteSpace: 'nowrap' }}
                  >
                    {status === 'loading' ? 'Joining…' : 'Join'}
                  </button>
                </div>
                {status === 'error' && <p style={{ fontFamily: SF, fontSize: 13, color: '#DC2626', margin: '8px 2px 0' }}>{message}</p>}
              </form>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                <button
                  onClick={openForm}
                  style={{
                    background: '#2563EB',
                    color: '#FFFFFF',
                    fontFamily: SF,
                    fontSize: 15,
                    fontWeight: 700,
                    letterSpacing: '0.02em',
                    padding: '9px 30px',
                    borderRadius: 100,
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'transform 0.12s ease, background 0.12s ease',
                    minWidth: 130,
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = '#1D4ED8'; e.currentTarget.style.transform = 'scale(1.03)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = '#2563EB'; e.currentTarget.style.transform = 'scale(1)'; }}
                >
                  JOIN WAITLIST
                </button>
                <span style={{ fontFamily: SF, fontSize: 13, color: '#86868B' }}>Coming soon to iPhone</span>
              </div>
            )}
          </div>
        </section>

        {/* ═══════════ INFO CELLS ═══════════ */}
        <div style={{ borderTop: '1px solid #E6E6EA', borderBottom: '1px solid #E6E6EA' }}>
          <div className="as-cells">
            {INFO_CELLS.map((cell, i) => (
              <div
                key={cell.label}
                style={{
                  flex: '1 0 auto',
                  minWidth: 90,
                  textAlign: 'center',
                  padding: '16px 20px',
                  borderLeft: i === 0 ? 'none' : '1px solid #E6E6EA',
                }}
              >
                <div style={{ fontFamily: SF, fontSize: 15, fontWeight: 700, color: '#1D1D1F', whiteSpace: 'nowrap' }}>{cell.value}</div>
                <div style={{ fontFamily: SF, fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#86868B', marginTop: 3 }}>{cell.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ═══════════ PREVIEW (swipeable screenshots) ═══════════ */}
      <section style={{ padding: 'clamp(28px, 5vw, 40px) 0 8px' }}>
        <h2 style={{ fontFamily: SF, fontSize: 'clamp(20px, 3vw, 24px)', fontWeight: 700, letterSpacing: '-0.02em', color: '#1D1D1F', margin: '0 auto 16px', maxWidth: 900, padding: '0 22px' }}>
          Preview
        </h2>
        <div className="as-scroller">
          {SLIDES.map((src, i) => (
            <div className="as-shot" key={i}>
              <img src={src} alt={`Offerloop app screenshot ${i + 1}`} loading="lazy" />
            </div>
          ))}
        </div>
      </section>

      {/* ═══════════ DESCRIPTION ═══════════ */}
      <section style={{ maxWidth: 900, margin: '0 auto', padding: 'clamp(20px, 4vw, 32px) 22px clamp(56px, 9vw, 88px)' }}>
        <div style={{ borderTop: '1px solid #E6E6EA', paddingTop: 'clamp(24px, 4vw, 32px)' }}>
          <h2 style={{ fontFamily: SF, fontSize: 'clamp(18px, 2.6vw, 22px)', fontWeight: 700, letterSpacing: '-0.02em', color: '#1D1D1F', margin: '0 0 14px' }}>
            About Offerloop
          </h2>
          <p style={{ fontFamily: SF, fontSize: 'clamp(15px, 1.9vw, 17px)', lineHeight: 1.6, color: '#3A3A3C', margin: '0 0 16px', maxWidth: 680 }}>
            Your entire networking pipeline, in your pocket. Offerloop finds the right people at
            your target companies, drafts personalized outreach straight to your Gmail, tracks every
            reply, and preps you for every coffee chat and interview.
          </p>
          <p style={{ fontFamily: SF, fontSize: 'clamp(15px, 1.9vw, 17px)', lineHeight: 1.6, color: '#3A3A3C', margin: 0, maxWidth: 680 }}>
            Built for students breaking into consulting, investment banking, and tech. The iPhone app
            is almost here, join the waitlist and we'll email you the moment it launches.
          </p>

          <div style={{ marginTop: 28 }}>
            {status === 'done' ? (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: 100, padding: '11px 20px' }}>
                <Check size={18} strokeWidth={3} color="#059669" />
                <span style={{ fontFamily: SF, fontSize: 15, fontWeight: 600, color: '#047857' }}>{message} We'll be in touch.</span>
              </div>
            ) : (
              <button
                onClick={openForm}
                style={{ background: '#2563EB', color: '#FFFFFF', fontFamily: SF, fontSize: 16, fontWeight: 700, padding: '13px 32px', borderRadius: 100, border: 'none', cursor: 'pointer', transition: 'transform 0.12s ease, background 0.12s ease' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#1D4ED8'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = '#2563EB'; e.currentTarget.style.transform = 'translateY(0)'; }}
              >
                Join the waitlist
              </button>
            )}
          </div>
        </div>
      </section>
    </div>
  );
};

export default Waitlist;
