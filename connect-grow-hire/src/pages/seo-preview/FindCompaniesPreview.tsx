/*
 * SEO PREVIEW: Find Companies (widget-embedded variant).
 * Route: /seo-preview/find-companies
 *
 * Pairs FindCompaniesWidget with an example panel that mirrors the
 * widget's READY ResultsLayout (header card + 2 example company cards).
 * Built per ranking-playbook.md: Quick-Answer block, question-form H2s,
 * JSON-LD, freshness byline.
 *
 * House style: no em dashes, no sparkle icons.
 */
import { Helmet } from 'react-helmet-async';
import {
  Briefcase, Building2, Download, ExternalLink, Search, Upload,
  Target, BadgeCheck,
} from 'lucide-react';
import {
  BRAND, BRAND_DARK, INK, kicker, serif,
  PreviewNav, PreviewFooter,
  HowItWorks, FAQ, PreviewCTA,
  InlineEmailCapture, ExitIntentCapture, h2Style, pStyle, gridLayer,
} from './_shared';
import { FindCompaniesWidget } from '../../components/widgets/FindCompaniesWidget';

const UPDATED_LABEL = 'Updated May 2026';
const PUBLISH_DATE_ISO = '2026-05-26';

const emailCapture = {
  eyebrow: 'NOT READY TO UPLOAD?',
  heading: 'Get the weekly recruiting digest',
  subtext: 'Every Monday: new firm rosters, deadline changes, and the schools/roles each firm is recruiting from. Built for students breaking into consulting, banking, and tech.',
  buttonText: 'Send me the digest',
  cluster: 'general',
};

const FAQ_ITEMS = [
  {
    q: 'How does the matcher decide which 5 companies to recommend?',
    a: 'We read your resume in full, extract your major, projects, prior roles, and skills, and pass that structured profile to GPT-4o-mini with a prompt that ranks employers by fit. The model prefers real, well-known employers that visibly recruit at your school or in your stated industries. Order is by strength of fit, strongest first.',
  },
  {
    q: 'Why only 5 companies?',
    a: '5 is the sweet spot between "too narrow to act on" and "too long to read." Cold-emailing 5 companies in the same week is realistic for a student. 20 is paralysis. The full Offerloop product surfaces dozens of matches when you want more.',
  },
  {
    q: 'Are these real companies or made up?',
    a: 'Real, well-known employers. The model is instructed never to invent a careers URL that looks specific but is not real, and to fall back to the company homepage if it is not confident.',
  },
  {
    q: 'What if I am a non-traditional applicant (career switcher, international student, non-target)?',
    a: 'The matcher reads what you have actually done, not just where you went to school. If your resume shows data-engineering projects, you will get matched against data-engineering employers regardless of major. Non-target students get the same 5 matches as target students with comparable backgrounds.',
  },
  {
    q: 'Will my resume be stored anywhere?',
    a: 'No. The PDF is read in memory to extract text, then discarded. We log a SHA-256 hash of the file (16 hex chars) along with your email so we can attribute leads and rate-limit the tool. The raw PDF is never written to disk or to a database.',
  },
  {
    q: 'Is the widget really free? What is the catch?',
    a: 'No catch. Upload your resume, get 5 matches and a CSV, no account needed. We ask for an email when you submit so we can send you the matches and the weekly digest, and so we can rate-limit the tool to 1 search per IP per day. The full product (verified contacts, drafted emails, pipeline tracking) is where Offerloop monetizes.',
  },
  {
    q: 'How is this different from job-board search?',
    a: 'Job boards make you describe what you want. The matcher reads what you have and decides. You do not pick filters, you do not pick industries, you upload one PDF and you get 5 companies that hire your profile. Compare to typing "data engineer intern internship 2026" into Indeed and scrolling 80 listings to figure out which ones are realistic for you.',
  },
];

const JSON_LD = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Article',
      'headline': 'Free Company Matcher: Find 5 companies that fit your resume',
      'datePublished': PUBLISH_DATE_ISO,
      'dateModified': PUBLISH_DATE_ISO,
      'author': { '@type': 'Organization', 'name': 'Offerloop' },
      'publisher': { '@type': 'Organization', 'name': 'Offerloop' },
      'description': 'Free company matcher that reads your resume PDF and returns 5 employers that hire your background, with the entry-level roles to target and the careers pages to apply to. No account required.',
    },
    {
      '@type': 'FAQPage',
      'mainEntity': FAQ_ITEMS.map((f) => ({
        '@type': 'Question',
        'name': f.q,
        'acceptedAnswer': { '@type': 'Answer', 'text': f.a },
      })),
    },
    {
      '@type': 'HowTo',
      'name': 'How to use the Offerloop free company matcher',
      'step': [
        { '@type': 'HowToStep', 'name': 'Upload your resume PDF', 'text': 'Drop a text-based PDF (not a scanned image) under 10 MB.' },
        { '@type': 'HowToStep', 'name': 'Enter your email', 'text': 'Used to send your matches and to rate-limit the tool. No spam.' },
        { '@type': 'HowToStep', 'name': 'Review your 5 matches', 'text': 'Each card has the company name, industry, why it matches your resume, and 2-4 roles they hire for.' },
        { '@type': 'HowToStep', 'name': 'Download or apply', 'text': 'Hit Download as CSV to save the list, or click through to each company\'s careers page.' },
      ],
    },
    {
      '@type': 'WebApplication',
      'name': 'Offerloop Free Company Matcher',
      'applicationCategory': 'BusinessApplication',
      'operatingSystem': 'Web',
      'offers': { '@type': 'Offer', 'price': '0', 'priceCurrency': 'USD' },
    },
  ],
};

// ──────────────────────────────────────────────────────────────────────────
// Example panel: mirrors FindCompaniesWidget's READY ResultsLayout.
// Header + 2 of 5 example cards so the visitor sees what real output looks
// like before they upload anything.
// ──────────────────────────────────────────────────────────────────────────

const ExamplePanel = () => (
  <div style={{ width: '100%' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
      <span style={{ ...kicker, display: 'inline-block' }}>EXAMPLE OUTPUT</span>
      <span style={{ fontSize: 12, color: '#94A3B8' }}>USC sophomore, data + consulting background</span>
    </div>

    {/* Header card matching widget's READY ResultsLayout */}
    <div style={cardShell}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: BRAND, letterSpacing: '0.06em' }}>READY</div>
          <h3 style={{ fontFamily: serif, fontSize: 28, fontWeight: 400, color: INK, margin: '4px 0 0 0' }}>
            Your 5 company matches
          </h3>
          <div style={{ fontSize: 13, color: '#64748B', marginTop: 4 }}>
            Ranked by fit. Each match is grounded in something specific from your resume.
          </div>
        </div>
        <button disabled style={primaryBtnExample}>
          <Download size={16} /> Download as CSV
        </button>
      </div>
    </div>

    {/* Two sample cards */}
    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12, marginTop: 14 }}>
      <ExampleCard
        rank={1}
        name="McKinsey & Company"
        industry="Management Consulting"
        why_match="Your USC Marshall coursework in Operations and your consulting-club leadership role map to McKinsey's Operations practice, which hires heavily from West Coast targets for the LA office."
        key_roles={['Business Analyst', 'Summer Business Analyst']}
      />
      <ExampleCard
        rank={2}
        name="Palantir Technologies"
        industry="Big Tech (Data)"
        why_match="Your data-engineering project optimizing a SQL pipeline for the consulting club's pro bono client is exactly the work Palantir's Foundry engineers do for clients."
        key_roles={['Forward Deployed Engineer', 'Software Engineer Intern']}
      />
    </div>

    <p style={{ fontSize: 12, color: '#94A3B8', marginTop: 12, textAlign: 'center' }}>
      Example output for a fictional USC sophomore. Your real matches are picked from your own resume.
    </p>
  </div>
);

const ExampleCard = ({
  rank, name, industry, why_match, key_roles,
}: {
  rank: number;
  name: string;
  industry: string;
  why_match: string;
  key_roles: string[];
}) => (
  <div style={{ ...cardShell, padding: 18 }}>
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
      <div style={{
        width: 28, height: 28, borderRadius: '50%', background: '#EFF5FF',
        color: BRAND_DARK, fontWeight: 700, fontSize: 13,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>{rank}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Building2 size={16} style={{ color: BRAND }} />
          <h4 style={{ fontFamily: serif, fontSize: 18, fontWeight: 400, color: INK, margin: 0 }}>{name}</h4>
        </div>
        <div style={{
          fontSize: 12, color: BRAND_DARK, fontWeight: 600, background: '#EFF5FF',
          display: 'inline-block', padding: '2px 8px', borderRadius: 999, marginTop: 6,
        }}>
          {industry}
        </div>
      </div>
    </div>
    <p style={{ fontSize: 13, lineHeight: 1.55, color: '#475569', margin: '10px 0 10px 40px' }}>
      {why_match}
    </p>
    <div style={{ marginLeft: 40 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#64748B', letterSpacing: '0.05em', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
        <Briefcase size={12} /> ROLES THEY HIRE
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {key_roles.map((r) => (
          <span key={r} style={{
            fontSize: 12, fontWeight: 500, color: INK, background: '#F1F5F9',
            padding: '3px 9px', borderRadius: 6,
          }}>{r}</span>
        ))}
      </div>
      <div style={{ marginTop: 10, fontSize: 12, color: '#94A3B8', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        <ExternalLink size={11} /> careers page link in the live result
      </div>
    </div>
  </div>
);

const cardShell: React.CSSProperties = {
  background: '#FFF',
  border: '1px solid #E2E8F0',
  borderRadius: 14,
  padding: 18,
  boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
  boxSizing: 'border-box',
};

const primaryBtnExample: React.CSSProperties = {
  background: BRAND, color: '#FFF', border: 'none', borderRadius: 8,
  padding: '10px 14px', fontSize: 13, fontWeight: 600, cursor: 'not-allowed',
  opacity: 0.95, display: 'inline-flex', alignItems: 'center', gap: 6,
};

// ──────────────────────────────────────────────────────────────────────────
// Page
// ──────────────────────────────────────────────────────────────────────────

const FindCompaniesPreview = () => {
  return (
    <div className="min-h-screen w-full" style={{ fontFamily: "'DM Sans', system-ui, sans-serif", background: '#FFFFFF' }}>
      <Helmet>
        <title>Find 5 Companies That Match Your Resume (Free, No Account) | Offerloop</title>
        <meta name="robots" content="noindex" />
        <meta
          name="description"
          content="Upload your resume PDF and get 5 companies that hire your background, with the entry-level roles to target. Free, no account, no credit card."
        />
        <script type="application/ld+json">{JSON.stringify(JSON_LD)}</script>
      </Helmet>

      <PreviewNav />

      {/* Hero */}
      <section style={{ position: 'relative', overflow: 'hidden', borderBottom: '1px solid #F1F5F9' }}>
        <div style={gridLayer('rgba(15,23,42,0.045)', 'radial-gradient(ellipse 75% 70% at 50% 0%, #000 30%, transparent 75%)')} />
        <div className="px-6 pt-14 pb-10 text-center" style={{ maxWidth: 880, margin: '0 auto', position: 'relative', zIndex: 1 }}>
          <span className="inline-flex items-center gap-1.5 mb-5" style={{ background: '#EFF5FF', border: '1px solid #DBEAFE', color: BRAND_DARK, fontSize: 12.5, fontWeight: 600, padding: '5px 12px', borderRadius: 999 }}>
            <Search className="w-3.5 h-3.5" /> FREE TOOL · COMPANY MATCHER
          </span>
          <h1 style={{ fontFamily: serif, fontWeight: 400, lineHeight: 1.08, letterSpacing: '-0.03em', color: INK, marginBottom: 14, fontSize: 'clamp(34px, 4.6vw, 52px)' }}>
            Upload your resume.{' '}
            <span style={{ color: BRAND }}>Get 5 companies that fit.</span>
          </h1>
          <p style={{ fontSize: 17, lineHeight: 1.55, color: '#64748B', maxWidth: 680, margin: '0 auto 6px' }}>
            Free, grounded in your real experience, no filters or dropdowns to wrestle with. 25 seconds from PDF to list.
          </p>
          <p style={{ fontSize: 13, color: '#94A3B8', marginTop: 4 }}>
            {UPDATED_LABEL} <span style={{ marginLeft: 8 }}>·</span> <span style={{ marginLeft: 8 }}>4 min read</span>
          </p>
        </div>

        {/* Quick-Answer block per ranking-playbook.md */}
        <div className="px-6" style={{ maxWidth: 820, margin: '0 auto 36px', position: 'relative', zIndex: 1 }}>
          <div style={{ background: '#F0F7FF', borderLeft: `3px solid ${BRAND}`, borderRadius: 6, padding: '18px 22px' }}>
            <div style={{ ...kicker, marginBottom: 6, color: BRAND_DARK }}>QUICK ANSWER</div>
            <p style={{ fontSize: 16, lineHeight: 1.65, color: INK, margin: 0 }}>
              The matcher reads your resume PDF, extracts your major, projects, prior
              roles, and skills, then ranks 5 employers by fit. Each match comes with
              the industry, 1 to 2 sentences pointing to the specific resume signal
              that drove the match, 2 to 4 entry-level role titles the company hires,
              and a careers-page link. Upload below.
            </p>
          </div>
        </div>
      </section>

      {/* Widget mount */}
      <section className="px-6 pt-10 pb-6" style={{ maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ marginBottom: 18, textAlign: 'center' }}>
          <span style={{ ...kicker, display: 'inline-block' }}>SEE THE OUTPUT, THEN MATCH YOUR OWN</span>
        </div>
        <FindCompaniesWidget
          source="seo-preview-find-companies"
          eyebrow=""
          heading=""
          subhead=""
          examplePanel={<ExamplePanel />}
        />
      </section>

      {/* H2 #1 */}
      <section className="px-6 py-14" style={{ maxWidth: 820, margin: '0 auto' }}>
        <h2 style={h2Style}>What makes a "good match" in this matcher?</h2>
        <p style={pStyle}>
          A good match is an employer that (a) hires for entry-level roles your
          resume credibly competes for and (b) has visible recruiting at your school
          or in your stated industries. Bad matches are aspirational employers that
          do not run a structured campus pipeline, or employers that hire only at
          senior levels.
        </p>
        <ul style={{ ...pStyle, paddingLeft: 22 }}>
          <li><strong>Specific signal, not vibes.</strong> Each match references a real bullet, project, or skill from your resume. "Your USC Marshall Operations coursework maps to McKinsey's Operations practice" beats "you would be a great fit at McKinsey."</li>
          <li><strong>Real roles you can actually apply to.</strong> The role titles are entry-level (Analyst, Associate, Engineer, Intern), not VP titles.</li>
          <li><strong>Ranked, not unsorted.</strong> The first match is the strongest fit. The fifth is the long-shot with the highest signal-to-effort ratio.</li>
        </ul>
      </section>

      {/* H2 #2 */}
      <section className="px-6 py-14" style={{ maxWidth: 820, margin: '0 auto', background: '#FAFBFF', borderTop: '1px solid #F1F5F9', borderBottom: '1px solid #F1F5F9' }}>
        <h2 style={h2Style}>What the widget reads from your resume</h2>
        <p style={pStyle}>
          The seven signals the matcher pulls from your PDF, ranked by how much they
          shift the recommendations.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14, marginTop: 18 }}>
          {[
            { t: 'Major + school', d: 'Drives which firms recruit at your school and which industries to weight. USC Marshall consulting clubs map differently than CMU CS.' },
            { t: 'Project bullets', d: 'The single strongest signal. A SQL pipeline project will pull data-engineering employers; a campus consulting case will pull MBB.' },
            { t: 'Prior internships', d: 'Past employer signal predicts future fit. A Goldman summer pulls BB banks; a Stripe internship pulls late-stage tech.' },
            { t: 'Skills section', d: 'Technical skills (Python, SQL, React, Excel) and analytical skills (financial modeling, regression) get matched against role descriptions.' },
            { t: 'Achievements + metrics', d: 'Quantified results ("113 users", "$1K MRR", "18% reduction") signal output-orientation and shift the matcher toward growth firms.' },
            { t: 'Leadership roles', d: 'Club presidencies, founder roles, and team-lead bullets pull toward employers that flag leadership in their JD language.' },
            { t: 'Graduation year', d: 'Shifts the role types toward summer internship vs. full-time vs. new-grad rotation programs.' },
          ].map((b) => (
            <div key={b.t} className="rounded-[4px]" style={{ background: '#fff', border: '1px solid #E2E8F0', padding: '14px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <BadgeCheck className="w-4 h-4" style={{ color: BRAND }} />
                <p style={{ fontSize: 14, fontWeight: 700, color: INK, margin: 0 }}>{b.t}</p>
              </div>
              <p style={{ fontSize: 13, lineHeight: 1.55, color: '#64748B', margin: 0 }}>{b.d}</p>
            </div>
          ))}
        </div>
      </section>

      <HowItWorks
        heading="How the company matcher works"
        steps={[
          { Icon: Upload, t: 'Upload your resume PDF', d: 'Text-based PDF, under 10 MB. We do not store the file; we hash it for rate-limiting and discard.' },
          { Icon: Target, t: 'We parse your background', d: 'GPT-4o-mini extracts major, school, skills, experience, projects, and achievements into a structured profile.' },
          { Icon: Search, t: 'Match against employers', d: 'The profile feeds a ranking prompt that returns 5 companies with industry, why-match, key roles, and link.' },
          { Icon: Download, t: 'Download as CSV', d: 'One click for a spreadsheet you can paste into your tracker or cold-email queue.' },
        ]}
      />

      <InlineEmailCapture {...emailCapture} />

      <FAQ items={FAQ_ITEMS} />

      <PreviewCTA
        eyebrow="WHEN YOU ARE READY FOR THE FULL TOOLKIT"
        headline="5 matches is a starting point. Offerloop is the rest of the pipeline."
        subhead="Once you know your 5 companies, the next step is reaching the right alumni inside each one. Offerloop surfaces verified alumni contacts, drafts the cold email, and tracks the reply, all in the same workflow."
        buttonText="Discover more opportunities"
        to="/onboarding"
        footnote="Free tier: 3 contacts per search, 2 interview preps, no credit card."
      />

      <ExitIntentCapture
        eyebrow="BEFORE YOU GO"
        heading="The weekly recruiting digest"
        subtext="Every Monday: new firm rosters, deadline changes, and the schools/roles each firm is recruiting from. Free, no spam."
        buttonText="Send me the digest"
        cluster="general"
      />

      <PreviewFooter />
    </div>
  );
};

export default FindCompaniesPreview;
