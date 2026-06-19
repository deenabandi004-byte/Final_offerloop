/*
 * FindHiringManagerWidget - self-contained, embeddable React component
 * for the free hiring-manager lead magnet. Drop it into any page:
 *
 *   <FindHiringManagerWidget source="goldman-ib-deep-dive" />
 *
 * The `source` prop is sent to /api/tools/find-hiring-manager/search and
 * written into the lead_magnet_emails Firestore doc so you can attribute
 * leads to the SEO page they came from.
 *
 * No <Helmet>, no nav, no footer - frame-agnostic. Result cards stack
 * gracefully on narrow containers.
 *
 * IMPORTANT: render ONE FindHiringManagerWidget per page.
 *
 * House style: no em dashes, no Sparkles icon.
 */
import { ReactNode, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  Download,
  Linkedin,
  Link as LinkIcon,
  Loader2,
  Lock,
  Search,
  Target,
} from 'lucide-react';
import {
  captureEmail,
  downloadCsv,
  searchHiringManagers,
  type HiringManager,
  type SearchHiringManagersResponse,
} from '../../services/findHiringManagerLeadMagnet';

// ── Visual tokens (inlined so the widget has no shared-kit dependency) ────
const BRAND = '#3B82F6';
const BRAND_DARK = '#2563EB';
const INK = '#0F172A';
const SERIF = "'Libre Baskerville', Georgia, serif";

// ── Types ─────────────────────────────────────────────────────────────────

export type Phase = 'idle' | 'email_gate' | 'running' | 'results' | 'failed';

export interface FindHiringManagerWidgetProps {
  source?: string;
  onLeadCaptured?: (email: string) => void;
  eyebrow?: string;
  heading?: string;
  subhead?: string;
  /**
   * Optional preview node. Renders side-by-side on the idle/email_gate/failed
   * phases when the container is wide. Disappears once the search is running
   * or completed so the real result has the stage.
   */
  examplePanel?: ReactNode;
}

const RUNNING_STEPS = [
  { label: 'Reading the job posting', detail: 'Scraping company + role with Firecrawl' },
  { label: 'Classifying the role', detail: 'Mapping it to a hiring function' },
  { label: 'Searching the decision-makers', detail: 'PDL tiered search across 2.2B profiles' },
  { label: 'Picking the most likely hire', detail: 'Ranking by title + seniority + team' },
];

// ──────────────────────────────────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────────────────────────────────

const FindHiringManagerWidget = ({
  source = 'embedded',
  onLeadCaptured,
  eyebrow = 'FREE HIRING MANAGER FINDER',
  heading = 'Find the person who will actually read your application.',
  subhead = 'Paste a job posting URL. We extract the company + role from the page, then surface 1 to 2 likely hiring managers with their LinkedIn and why each one is in the hiring chain. No account needed.',
  examplePanel,
}: FindHiringManagerWidgetProps) => {
  const [jobUrl, setJobUrl] = useState('');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');

  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SearchHiringManagersResponse | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const stepTimerRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (stepTimerRef.current) window.clearInterval(stepTimerRef.current);
    },
    [],
  );

  const onStart = () => {
    setError(null);
    const trimmed = jobUrl.trim();
    if (!/^https?:\/\//i.test(trimmed)) {
      setError('Paste a full job posting URL (must start with http:// or https://).');
      return;
    }
    setPhase('email_gate');
  };

  const onSubmitEmailGate = async () => {
    setError(null);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
      setError('Enter a valid email.');
      return;
    }
    // Best-effort lead capture before running the heavier search
    void captureEmail(email.trim(), source);
    onLeadCaptured?.(email.trim());
    void runSearch();
  };

  const runSearch = async () => {
    setPhase('running');
    setStepIndex(0);
    if (stepTimerRef.current) window.clearInterval(stepTimerRef.current);
    stepTimerRef.current = window.setInterval(() => {
      setStepIndex((prev) => (prev < RUNNING_STEPS.length - 1 ? prev + 1 : prev));
    }, 4500);

    const res = await searchHiringManagers({
      jobUrl: jobUrl.trim(),
      email: email.trim() || undefined,
      source,
    });

    if (stepTimerRef.current) {
      window.clearInterval(stepTimerRef.current);
      stepTimerRef.current = null;
    }

    setResult(res);
    if (res.ok && (res.hiringManagers?.length ?? 0) > 0) {
      setStepIndex(RUNNING_STEPS.length - 1);
      setPhase('results');
    } else {
      setError(res.message || 'We couldn\'t find a hiring manager for that posting.');
      setPhase('failed');
    }
  };

  const onReset = () => {
    setPhase('idle');
    setResult(null);
    setError(null);
    setStepIndex(0);
  };

  const onDownload = () => {
    const managers = result?.hiringManagers || [];
    if (managers.length === 0) return;
    const co = (result?.job?.company || 'company').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    downloadCsv(managers, `hiring-managers-${co || 'offerloop'}.csv`);
  };

  // ── Render ────────────────────────────────────────────────────────────

  const isIdleLike = phase === 'idle' || phase === 'email_gate';

  const idleCard = (
    <IdleCard
      phase={phase}
      jobUrl={jobUrl}
      name={name}
      email={email}
      error={error}
      eyebrow={eyebrow}
      heading={heading}
      subhead={subhead}
      setJobUrl={setJobUrl}
      setName={setName}
      setEmail={setEmail}
      onStart={onStart}
      onSubmit={onSubmitEmailGate}
      onBack={() => setPhase('idle')}
    />
  );

  return (
    <div style={{ width: '100%', color: INK }}>
      {isIdleLike ? (
        examplePanel ? (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(440px, 1fr))',
              gap: 24,
              alignItems: 'start',
            }}
          >
            <div>{examplePanel}</div>
            <div>{idleCard}</div>
          </div>
        ) : (
          idleCard
        )
      ) : null}

      {phase === 'running' ? <RunningCard stepIndex={stepIndex} /> : null}

      {phase === 'results' && result ? (
        <ResultsBlock
          result={result}
          onDownload={onDownload}
          onReset={onReset}
        />
      ) : null}

      {phase === 'failed' && result ? (
        <FailedCard message={error || result.message || 'Something went wrong.'} onReset={onReset} />
      ) : null}
    </div>
  );
};

export default FindHiringManagerWidget;
export { FindHiringManagerWidget };

// React does NOT sanitize href values. PDL data is third-party; if it ever
// returned a javascript:/data:/vbscript: URL we don't want the widget to
// render a clickable XSS sink. Return the URL only if it parses cleanly
// and uses http(s); otherwise return null and the LinkedIn pill hides.
function safeLinkedinHref(raw: string | undefined | null): string | null {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0 || trimmed.length > 500) return null;
  try {
    const u = new URL(trimmed);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.toString();
  } catch {
    return null;
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Idle / email gate
// ──────────────────────────────────────────────────────────────────────────

const IdleCard = ({
  phase,
  jobUrl,
  name,
  email,
  error,
  eyebrow,
  heading,
  subhead,
  setJobUrl,
  setName,
  setEmail,
  onStart,
  onSubmit,
  onBack,
}: {
  phase: Phase;
  jobUrl: string;
  name: string;
  email: string;
  error: string | null;
  eyebrow: string;
  heading: string;
  subhead: string;
  setJobUrl: (v: string) => void;
  setName: (v: string) => void;
  setEmail: (v: string) => void;
  onStart: () => void;
  onSubmit: () => void;
  onBack: () => void;
}) => (
  <div>
    {eyebrow || heading || subhead ? (
      <header style={{ textAlign: 'center', marginBottom: 28 }}>
        {eyebrow ? (
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: BRAND,
              letterSpacing: '0.06em',
              marginBottom: 12,
            }}
          >
            {eyebrow}
          </div>
        ) : null}
        {heading ? (
          <h2
            style={{
              fontFamily: SERIF,
              fontSize: 32,
              fontWeight: 400,
              color: INK,
              marginBottom: 12,
              letterSpacing: '-0.02em',
              lineHeight: 1.2,
            }}
          >
            {heading}
          </h2>
        ) : null}
        {subhead ? (
          <p
            style={{
              fontSize: 15,
              lineHeight: 1.6,
              color: '#475569',
              maxWidth: 560,
              margin: '0 auto',
            }}
          >
            {subhead}
          </p>
        ) : null}
      </header>
    ) : null}

    <div style={cardShell}>
      <Label num={1} text="Paste the job posting URL" />
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: 12,
          border: '1px solid #CBD5E1',
          borderRadius: 8,
          background: '#FFF',
          marginBottom: 6,
        }}
      >
        <LinkIcon size={16} color="#94A3B8" style={{ flexShrink: 0 }} />
        <input
          type="url"
          value={jobUrl}
          onChange={(e) => setJobUrl(e.target.value)}
          placeholder="https://boards.greenhouse.io/.../job/12345"
          disabled={phase === 'email_gate'}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && phase === 'idle') onStart();
          }}
          style={{
            width: '100%',
            border: 'none',
            outline: 'none',
            fontSize: 14,
            color: INK,
            background: 'transparent',
          }}
        />
      </div>
      <p style={{ fontSize: 12, color: '#94A3B8', marginBottom: 22, lineHeight: 1.5 }}>
        Works with Greenhouse, Lever, Workday, LinkedIn, Indeed, and most company career pages.
      </p>

      {phase === 'email_gate' ? (
        <>
          <Label num={2} text="Almost there - where should we send the result?" />
          <div
            style={{
              fontSize: 13,
              color: '#64748B',
              marginTop: -4,
              marginBottom: 10,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <Lock size={14} />
            We use this to follow up if Offerloop can help on your next application. No spam.
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 10,
              marginBottom: 14,
            }}
          >
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name (Jane Doe)"
              style={textInput}
              autoFocus
            />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@university.edu"
              style={textInput}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onSubmit();
              }}
            />
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={onBack} style={ghostBtn} type="button">
              Back
            </button>
            <button
              onClick={onSubmit}
              style={{
                ...primaryBtn,
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
              }}
              type="button"
            >
              <Search size={16} />
              Find my hiring manager
            </button>
          </div>
        </>
      ) : (
        <button
          onClick={onStart}
          style={{
            ...primaryBtn,
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
          }}
          type="button"
        >
          <Search size={16} />
          Find the hiring manager
        </button>
      )}

      {error ? <div style={errorBox}>{error}</div> : null}
    </div>
  </div>
);

// ──────────────────────────────────────────────────────────────────────────
// Loading
// ──────────────────────────────────────────────────────────────────────────

const RunningCard = ({ stepIndex }: { stepIndex: number }) => {
  const percent = Math.round(((stepIndex + 1) / RUNNING_STEPS.length) * 100);
  return (
    <div style={{ ...cardShell, padding: 32 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <Loader2 size={20} style={{ color: BRAND, animation: 'fhm-spin 1s linear infinite' }} />
        <p style={{ fontSize: 15, fontWeight: 600, color: INK, margin: 0 }}>
          {RUNNING_STEPS[stepIndex]?.label || 'Working...'}
        </p>
      </div>

      <div
        style={{
          height: 6,
          background: '#F1F5F9',
          borderRadius: 999,
          overflow: 'hidden',
          marginBottom: 18,
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${percent}%`,
            background: BRAND,
            transition: 'width 0.6s ease',
          }}
        />
      </div>

      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 10 }}>
        {RUNNING_STEPS.map((step, i) => {
          const done = i < stepIndex;
          const active = i === stepIndex;
          return (
            <li key={step.label} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              {done ? (
                <CheckCircle2 size={16} style={{ color: BRAND, marginTop: 2, flexShrink: 0 }} />
              ) : active ? (
                <Loader2
                  size={16}
                  style={{ color: BRAND, marginTop: 2, animation: 'fhm-spin 1s linear infinite', flexShrink: 0 }}
                />
              ) : (
                <span
                  style={{
                    width: 16,
                    height: 16,
                    marginTop: 2,
                    background: '#F1F5F9',
                    border: '1px solid #E2E8F0',
                    borderRadius: '50%',
                    flexShrink: 0,
                  }}
                />
              )}
              <div>
                <p
                  style={{
                    fontSize: 13.5,
                    fontWeight: active ? 600 : 500,
                    color: done || active ? INK : '#94A3B8',
                    margin: 0,
                  }}
                >
                  {step.label}
                </p>
                <p style={{ fontSize: 12, color: '#94A3B8', margin: '1px 0 0 0' }}>{step.detail}</p>
              </div>
            </li>
          );
        })}
      </ul>

      <p style={{ fontSize: 12.5, color: '#94A3B8', marginTop: 20 }}>
        Usually 10 to 25 seconds. We're being thorough.
      </p>

      <style>{`@keyframes fhm-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};

// ──────────────────────────────────────────────────────────────────────────
// Results
// ──────────────────────────────────────────────────────────────────────────

const ResultsBlock = ({
  result,
  onDownload,
  onReset,
}: {
  result: SearchHiringManagersResponse;
  onDownload: () => void;
  onReset: () => void;
}) => {
  const managers = result.hiringManagers || [];
  const job = result.job;
  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 16,
          marginBottom: 20,
        }}
      >
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: BRAND_DARK, letterSpacing: '0.06em' }}>
            READY
          </div>
          <h3
            style={{
              fontFamily: SERIF,
              fontSize: 28,
              fontWeight: 400,
              color: INK,
              margin: '4px 0 0 0',
            }}
          >
            {managers.length === 1
              ? 'Your most likely hiring manager'
              : `${managers.length} likely hiring managers`}
          </h3>
          {job?.jobTitle || job?.company ? (
            <p
              style={{
                fontSize: 13,
                color: '#64748B',
                marginTop: 4,
                marginBottom: 0,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <Building2 size={13} color="#94A3B8" />
              {job.jobTitle}
              {job.company ? (
                <>
                  <span style={{ color: '#CBD5E1' }}>at</span> {job.company}
                </>
              ) : null}
            </p>
          ) : null}
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            onClick={onReset}
            style={{ ...ghostBtn, display: 'flex', alignItems: 'center', gap: 6 }}
            type="button"
          >
            Try another posting
          </button>
          <button
            onClick={onDownload}
            style={{ ...primaryBtn, display: 'flex', alignItems: 'center', gap: 8 }}
            type="button"
          >
            <Download size={16} />
            Download CSV
          </button>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: 16,
          marginBottom: 20,
        }}
      >
        {managers.map((m, idx) => (
          <ManagerCard key={`${m.fullName}-${idx}`} m={m} />
        ))}
      </div>

      <UpgradeFooter />
    </div>
  );
};

const ManagerCard = ({ m }: { m: HiringManager }) => {
  const displayName = m.fullName
    .split(' ')
    .map((p) => (p ? p[0].toUpperCase() + p.slice(1) : p))
    .join(' ');
  const linkedinHref = safeLinkedinHref(m.linkedinUrl);
  return (
    <div style={cardShell}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <h4
            style={{
              fontFamily: SERIF,
              fontSize: 19,
              fontWeight: 400,
              color: INK,
              margin: 0,
              lineHeight: 1.25,
              letterSpacing: '-0.01em',
            }}
          >
            {displayName || '(unnamed)'}
          </h4>
          <p style={{ fontSize: 13.5, color: '#475569', margin: '4px 0 0 0', lineHeight: 1.5 }}>
            {m.jobTitle ? <span style={{ fontWeight: 600 }}>{m.jobTitle}</span> : null}
            {m.jobTitle && m.company ? <span style={{ color: '#94A3B8' }}> at </span> : null}
            {m.company || null}
          </p>
          {m.location ? (
            <p style={{ fontSize: 12.5, color: '#94A3B8', margin: '3px 0 0 0' }}>{m.location}</p>
          ) : null}
        </div>
        {linkedinHref ? (
          <a
            href={linkedinHref}
            target="_blank"
            rel="noopener noreferrer nofollow"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 13,
              fontWeight: 600,
              color: BRAND_DARK,
              background: '#EFF5FF',
              border: '1px solid #DBEAFE',
              borderRadius: 6,
              padding: '6px 10px',
              textDecoration: 'none',
              flexShrink: 0,
            }}
          >
            <Linkedin size={14} />
            LinkedIn
          </a>
        ) : null}
      </div>

      <div
        style={{
          marginTop: 14,
          padding: 12,
          background: '#F8FAFC',
          border: '1px solid #E2E8F0',
          borderRadius: 6,
          fontSize: 13,
          color: '#334155',
          lineHeight: 1.55,
        }}
      >
        <div
          style={{
            fontSize: 10.5,
            fontWeight: 700,
            color: BRAND_DARK,
            letterSpacing: '0.06em',
            marginBottom: 6,
          }}
        >
          WHY THEM
        </div>
        {m.reasoning}
      </div>
    </div>
  );
};

const UpgradeFooter = () => (
  <div
    style={{
      borderTop: '1px solid #F1F5F9',
      paddingTop: 20,
      display: 'flex',
      flexWrap: 'wrap',
      gap: 12,
      alignItems: 'center',
      justifyContent: 'space-between',
    }}
  >
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <Target size={18} color={BRAND} />
      <div>
        <p style={{ fontSize: 14, fontWeight: 600, color: INK, margin: 0 }}>
          Need more than one hire to chase?
        </p>
        <p style={{ fontSize: 12.5, color: '#64748B', margin: '2px 0 0 0' }}>
          Run unlimited searches with verified emails and warm-intro openers inside Offerloop.
        </p>
      </div>
    </div>
    <Link
      to="/onboarding"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        background: BRAND,
        color: '#FFF',
        padding: '10px 16px',
        borderRadius: 3,
        fontSize: 14,
        fontWeight: 600,
        textDecoration: 'none',
        whiteSpace: 'nowrap',
      }}
    >
      Find more hiring managers
      <ArrowRight size={14} />
    </Link>
  </div>
);

// ──────────────────────────────────────────────────────────────────────────
// Failure
// ──────────────────────────────────────────────────────────────────────────

const FailedCard = ({ message, onReset }: { message: string; onReset: () => void }) => (
  <div
    style={{
      background: '#FEF2F2',
      border: '1px solid #FECACA',
      borderRadius: 6,
      padding: 24,
    }}
  >
    <p style={{ fontSize: 13, fontWeight: 700, color: '#991B1B', margin: 0 }}>
      We couldn't return a hiring manager
    </p>
    <p style={{ fontSize: 14, color: '#7F1D1D', lineHeight: 1.55, margin: '6px 0 14px 0' }}>
      {message}
    </p>
    <button
      type="button"
      onClick={onReset}
      style={{
        background: BRAND,
        color: '#FFF',
        border: 'none',
        borderRadius: 3,
        padding: '10px 16px',
        fontSize: 14,
        fontWeight: 600,
        cursor: 'pointer',
      }}
    >
      Try a different URL
    </button>
  </div>
);

// ──────────────────────────────────────────────────────────────────────────
// Style tokens
// ──────────────────────────────────────────────────────────────────────────

const cardShell: React.CSSProperties = {
  background: '#FFF',
  border: '1px solid #E2E8F0',
  borderRadius: 14,
  padding: 22,
  boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
  boxSizing: 'border-box',
};

const textInput: React.CSSProperties = {
  width: '100%',
  padding: 12,
  border: '1px solid #CBD5E1',
  borderRadius: 8,
  fontSize: 14,
  fontFamily: 'inherit',
  boxSizing: 'border-box',
};

const primaryBtn: React.CSSProperties = {
  background: BRAND,
  color: '#FFF',
  border: 'none',
  borderRadius: 8,
  padding: '12px 18px',
  fontSize: 15,
  fontWeight: 600,
  cursor: 'pointer',
};

const ghostBtn: React.CSSProperties = {
  background: '#FFF',
  color: INK,
  border: '1px solid #CBD5E1',
  borderRadius: 8,
  padding: '12px 18px',
  fontSize: 14,
  fontWeight: 500,
  cursor: 'pointer',
};

const errorBox: React.CSSProperties = {
  marginTop: 16,
  padding: 12,
  background: '#FEF2F2',
  border: '1px solid #FECACA',
  borderRadius: 8,
  color: '#991B1B',
  fontSize: 14,
};

const Label = ({ num, text }: { num: number; text: string }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
    <span
      style={{
        width: 22,
        height: 22,
        borderRadius: '50%',
        background: BRAND,
        color: '#FFF',
        fontSize: 12,
        fontWeight: 700,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {num}
    </span>
    <span style={{ fontWeight: 600, fontSize: 14, color: INK }}>{text}</span>
  </div>
);
