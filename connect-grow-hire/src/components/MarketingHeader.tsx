// src/components/MarketingHeader.tsx
// Shared header for the public marketing pages (How It Works, For Students,
// Pricing, About). Dark ("black") treatment — the main landing page keeps its
// own transparent-over-video nav and does NOT use this component.
import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowRight, Menu, X } from 'lucide-react';
import OfferloopLogo from '@/assets/offerloop_logo2.png';
import { useFirebaseAuth } from '@/contexts/FirebaseAuthContext';

type NavKey = 'how-it-works' | 'for-students' | 'pricing' | 'about';

const NAV_ITEMS: { key: NavKey; label: string; to: string }[] = [
  { key: 'how-it-works', label: 'How It Works', to: '/how-it-works' },
  { key: 'for-students', label: 'For Students', to: '/for-students' },
  { key: 'pricing', label: 'Pricing', to: '/pricing' },
  { key: 'about', label: 'About', to: '/about' },
];

const BG = '#0B1F3D';
const ACTIVE = '#60A5FA';
const IDLE = 'rgba(255,255,255,0.82)';

interface MarketingHeaderProps {
  active?: NavKey;
}

const MarketingHeader = ({ active }: MarketingHeaderProps) => {
  const navigate = useNavigate();
  const { user } = useFirebaseAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        background: BG,
        borderBottom: '1px solid rgba(255,255,255,0.08)',
      }}
    >
      <style>{`
        .mh-nav-link {
          font-family: 'Libre Baskerville', Georgia, serif;
          font-size: 14px;
          font-weight: 600;
          text-decoration: none;
          transition: color 0.15s ease;
        }
        .mh-nav-link:hover { color: #FFFFFF !important; }
      `}</style>

      <div
        style={{
          maxWidth: 1180,
          margin: '0 auto',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 28px',
        }}
      >
        <img
          src={OfferloopLogo}
          alt="Offerloop"
          className="h-16 cursor-pointer"
          style={{ filter: 'brightness(0) invert(1)' }}
          onClick={() => navigate('/')}
        />

        <nav className="hidden md:flex items-center" style={{ gap: 36 }}>
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.key}
              to={item.to}
              className="mh-nav-link"
              aria-current={active === item.key ? 'page' : undefined}
              style={{ color: active === item.key ? ACTIVE : IDLE }}
            >
              {item.label}
            </Link>
          ))}
          <button
            onClick={() => navigate(user ? '/find' : '/signin')}
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
            {user ? 'Find people' : 'Sign in'}
            <ArrowRight size={16} strokeWidth={2.2} />
          </button>
        </nav>

        <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="md:hidden p-2" style={{ color: '#FFFFFF' }}>
          {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {mobileMenuOpen && (
        <div className="md:hidden" style={{ padding: '0 16px 12px' }}>
          <nav className="flex flex-col gap-1">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.key}
                to={item.to}
                onClick={() => setMobileMenuOpen(false)}
                className="text-left px-4 py-3 text-sm font-medium rounded-lg"
                style={{
                  color: active === item.key ? ACTIVE : 'rgba(255,255,255,0.85)',
                  fontFamily: "'Libre Baskerville', Georgia, serif",
                  textDecoration: 'none',
                }}
              >
                {item.label}
              </Link>
            ))}
            <button
              onClick={() => { navigate(user ? '/find' : '/signin'); setMobileMenuOpen(false); }}
              className="w-full text-center py-3 mt-2 text-sm font-semibold"
              style={{ background: '#FFFFFF', color: '#0F172A', borderRadius: '100px', fontFamily: "'Libre Baskerville', Georgia, serif" }}
            >
              {user ? 'Find people' : 'Sign in'}
            </button>
          </nav>
        </div>
      )}
    </header>
  );
};

export default MarketingHeader;
