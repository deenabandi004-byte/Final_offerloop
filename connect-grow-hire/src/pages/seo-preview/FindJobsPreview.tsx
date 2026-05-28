/*
 * SEO PREVIEW: find jobs (FIND), widget-embedded variant.
 * Route: /seo-preview/find-jobs
 *
 * First mock for the find-jobs widget. Left of the widget shows a styled
 * example of a 5-job result set for a fictional new-grad SWE; right is the
 * live try-it form. Once the visitor submits, the widget takes the full
 * width and runs on their actual resume PDF.
 *
 * House style: no em dashes, no sparkle icons.
 */
import { Helmet } from 'react-helmet-async';
import {
  Briefcase, Upload, Target, Lightbulb, Search,
  Building2, MapPin, BadgeCheck,
} from 'lucide-react';
import {
  BRAND, BRAND_DARK, INK, kicker, serif,
  PreviewNav, PreviewFooter, PreviewHero,
  ProblemSection, StatStrip, HowItWorks, FAQ, PreviewCTA,
  InlineEmailCapture, ExitIntentCapture, h2Style, pStyle,
} from './_shared';
import { FindJobsWidget } from '../../components/widgets/FindJobsWidget';

const emailCapture = {
  eyebrow: 'NOT APPLYING YET?',
  heading: 'Get the weekly new-grad job digest',
  subtext: 'Fresh full-time and internship postings paired to your background, new university recruiting events, and resume edges that get callbacks. Built for college students and new grads.',
  buttonText: 'Send me the digest',
  cluster: 'new-grad',
};

// ──────────────────────────────────────────────────────────────────────────
// Example panel: mock of a 5-job result set for a fictional CS new grad.
// Quality is exaggerated so visitors see the upper bound of what the widget
// produces. House style: no em dashes.
// ──────────────────────────────────────────────────────────────────────────

const ExampleJobsPanel = () => (
  <div style={{ width: '100%' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
      <span style={{ ...kicker, display: 'inline-block' }}>EXAMPLE OUTPUT</span>
      <span style={{ fontSize: 12, color: '#94A3B8' }}>CS new grad, Python + React resume</span>
    </div>

    <div style={cardShell}>
      <div style={{ fontSize: 11, fontWeight: 700, color: BRAND, letterSpacing: '0.06em', marginBottom: 4 }}>YOUR TOP MATCHES</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
        <span style={{ fontFamily: serif, fontSize: 32, fontWeight: 400, color: INK, lineHeight: 1 }}>5 live jobs</span>
        <span style={{ fontSize: 14, color: '#64748B' }}>paired to your resume</span>
      </div>
      <div style={{ fontSize: 12, color: '#64748B', marginTop: 6 }}>
        Read: B.S. Computer Science, Python · TypeScript · React · AWS, graduating 2026.
      </div>
    </div>

    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 14 }}>
      <ExampleJobCard
        score={91}
        title="Software Engineer, New Grad"
        company="Stripe"
        location="San Francisco, CA"
        why="Matches your background in Python, TypeScript, and React."
        skills={['Python', 'TypeScript', 'React']}
      />
      <ExampleJobCard
        score={83}
        title="Software Engineer, Frontend (New Grad)"
        company="Airbnb"
        location="San Francisco, CA"
        why="Matches your background in React, TypeScript, and component design."
        skills={['React', 'TypeScript']}
      />
      <ExampleJobCard
        score={76}
        title="Cloud Engineer, Early Career"
        company="Datadog"
        location="New York, NY"
        why="Matches your background in AWS, Python, and infrastructure projects."
        skills={['AWS', 'Python']}
      />
      <ExampleJobCard
        score={71}
        title="Backend Engineer, New Grad"
        company="Plaid"
        location="Remote, United States"
        why="Aligned with a Computer Science candidate looking for entry-level backend roles."
        skills={['Python']}
      />
      <ExampleJobCard
        score={68}
        title="Associate Software Engineer"
        company="Capital One"
        location="McLean, VA"
        why="Entry-level fit for your resume on the structured new-grad track."
        skills={['Python', 'AWS']}
      />
    </div>

    <p style={{ fontSize: 12, color: '#94A3B8', marginTop: 12, textAlign: 'center' }}>
      Example output for a fictional CS new grad. Your real search runs on your own resume against live postings on Greenhouse, Lever, Workday, LinkedIn, and Indeed.
    </p>
  </div>
);

const ExampleJobCard = ({
  score, title, company, location, why, skills,
}: {
  score: number; title: string; company: string; location: string; why: string; skills: string[];
}) => (
  <div style={cardShell}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 8, flexWrap: 'wrap' }}>
      <div style={{ flex: 1, minWidth: 180 }}>
        <h4 style={{ fontFamily: serif, fontSize: 17, fontWeight: 400, color: INK, margin: 0, lineHeight: 1.3 }}>{title}</h4>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: '#64748B', fontSize: 12, marginTop: 4, flexWrap: 'wrap' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Building2 size={12} /> {company}</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><MapPin size={12} /> {location}</span>
        </div>
      </div>
      <span style={badgeFor(score)}>{labelFor(score)} · {score}%</span>
    </div>
    <div style={{ background: '#F0F7FF', border: '1px solid #DBEAFE', borderRadius: 6, padding: '7px 10px', fontSize: 12, color: BRAND_DARK, marginBottom: 8 }}>
      <strong style={{ fontWeight: 600 }}>Why it matches: </strong>{why}
    </div>
    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
      {skills.map((s) => (
        <span key={s} style={{ fontSize: 11, fontWeight: 600, color: BRAND_DARK, background: '#EFF5FF', border: '1px solid #DBEAFE', borderRadius: 999, padding: '2px 8px' }}>{s}</span>
      ))}
    </div>
  </div>
);

const badgeFor = (score: number): React.CSSProperties => {
  let bg = '#F1F5F9', fg = '#475569';
  if (score >= 80) { bg = '#DCFCE7'; fg = '#15803D'; }
  else if (score >= 60) { bg = '#DBEAFE'; fg = BRAND_DARK; }
  else if (score >= 40) { bg = '#FEF3C7'; fg = '#92400E'; }
  return { fontSize: 11, fontWeight: 700, color: fg, background: bg, borderRadius: 999, padding: '4px 10px', whiteSpace: 'nowrap' };
};
const labelFor = (score: number): string => score >= 80 ? 'Strong' : score >= 60 ? 'Good' : score >= 40 ? 'Fair' : 'Match';

const cardShell: React.CSSProperties = {
  background: '#FFF',
  border: '1px solid #E2E8F0',
  borderRadius: 14,
  padding: 16,
  boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
  boxSizing: 'border-box',
};

// ──────────────────────────────────────────────────────────────────────────
// Page
// ──────────────────────────────────────────────────────────────────────────

const FindJobsPreview = () => {
  return (
    <div className="min-h-screen w-full" style={{ fontFamily: "'DM Sans', system-ui, sans-serif", background: '#FFFFFF' }}>
      <Helmet>
        <title>Free AI Job Match: Pair Your Resume to 5 Live Postings | Offerloop</title>
        <meta name="robots" content="noindex" />
        <meta
          name="description"
          content="Free job matching for college students and new grads. Upload your resume, get 5 live job postings paired to your background with application links and why-it-fits reasoning. No account required."
        />
      </Helmet>

      <PreviewNav />

      <PreviewHero
        EyebrowIcon={Briefcase}
        eyebrow="FIND JOBS · PAIRED TO YOUR RESUME"
        line1={<>Stop scrolling LinkedIn. <span style={{ color: BRAND }}>Pair your resume</span> to jobs.</>}
        line2="5 live postings, ranked by fit, in 60 seconds"
        lead="Drop your resume PDF. Offerloop parses your skills, major, and recent experience, searches live postings across Greenhouse, Lever, Workday, LinkedIn, and Indeed, and hands you the 5 jobs that fit you best with the application links and why each one matches. No account needed."
        chips={['Live postings, not stale boards', 'Ranked by resume fit', 'Application links included']}
      />

      <section className="px-6 pt-12 pb-6" style={{ maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ marginBottom: 20, textAlign: 'center' }}>
          <span style={{ ...kicker, display: 'inline-block' }}>SEE THE OUTPUT, THEN MATCH YOUR OWN</span>
        </div>
        <FindJobsWidget
          source="seo-preview-find-jobs"
          eyebrow=""
          heading=""
          subhead=""
          examplePanel={<ExampleJobsPanel />}
        />
      </section>

      <ProblemSection heading="A job board built for everyone fits no one.">
        Indeed and LinkedIn show the same 50,000 postings to every visitor. You spend 40 minutes
        scrolling, save 8 jobs, and only 2 of them actually fit your background. Offerloop reverses
        the workflow: it reads your resume first, then runs targeted live searches built from your
        actual skills, major, and recent roles. You get 5 postings instead of 5,000, each with a
        plain-English reason for why it fits and an application link that takes you straight to
        the employer's career page.
      </ProblemSection>

      <StatStrip
        heading="JOB DISCOVERY, BY THE NUMBERS"
        stats={[
          { value: '50K+', label: 'live new-grad and internship postings on the major boards in any given week' },
          { value: '5', label: 'postings the Offerloop widget surfaces, ranked by how well they fit your resume' },
          { value: '60 sec', label: 'time from PDF upload to ranked job matches with application links' },
        ]}
      />

      <section className="px-6 py-14" style={{ maxWidth: 820, margin: '0 auto', background: '#FAFBFF', borderTop: '1px solid #F1F5F9', borderBottom: '1px solid #F1F5F9' }}>
        <h2 style={h2Style}>What the widget uses from your resume</h2>
        <p style={pStyle}>
          The score is calibrated to seven signals the widget extracts from your PDF. Each one
          shifts which postings rank to the top and how confidently the widget can explain why a
          job fits.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14, marginTop: 18 }}>
          {[
            { t: 'Technical skills', d: 'Languages, frameworks, and tools listed on your resume. Skills are matched literally against the posting body so the why-it-fits string is grounded.' },
            { t: 'Major and degree', d: 'Computer Science, Finance, Mechanical Engineering, etc. Field affinity rewards postings whose title and body fit the typical role for your degree.' },
            { t: 'Recent role title', d: 'The job title from your most recent internship or position. Strong title-to-title overlap drives a significant score bump.' },
            { t: 'Graduation year', d: 'Used to weight new-grad and internship language so a 2026 grad sees Summer 2026 and Class of 2026 roles ranked first.' },
            { t: 'Project keywords', d: 'Specific tech (Kubernetes, RAG, derivatives, supply chain analytics) named in your projects. Surface in the posting equals a relevance bump.' },
            { t: 'Resume text echo', d: 'If phrases from the job title appear verbatim in your resume body, the score reflects that. This is how the widget catches non-obvious fits.' },
            { t: 'Live posting source', d: 'Greenhouse, Lever, Workday, LinkedIn, and Indeed are searched fresh on every call. Stale aggregator listings are filtered out before scoring.' },
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
        heading="How the match works"
        steps={[
          { Icon: Upload, t: 'Upload your resume PDF', d: 'Drop your resume. 10MB max, text-based PDF (scanned images cannot be parsed by either the widget or the ATS at the firms you would apply to).' },
          { Icon: Target, t: 'We parse your background', d: 'GPT-4o-mini extracts your skills, major, school, graduation year, and recent role titles. The parsed summary is shown back to you so you can verify what we read.' },
          { Icon: Search, t: 'Three live searches in parallel', d: 'We build three Perplexity queries from your background and run them simultaneously against current postings on Greenhouse, Lever, Workday, LinkedIn, and Indeed.' },
          { Icon: Lightbulb, t: 'Top 5 ranked by fit', d: 'Each posting is scored against your resume on six dimensions, deduped, and ranked. You get the 5 strongest matches with skill chips, requirements, why it fits, and the apply link.' },
        ]}
      />

      <InlineEmailCapture {...emailCapture} />

      <FAQ
        items={[
          {
            q: 'Is this really free? What is the catch?',
            a: 'No catch. Upload your resume, get the matches, no account required. We ask for your email when you submit so we can send you the ranked list, drop you on the weekly new-grad digest, and rate-limit the tool. You can use it once and never come back.',
          },
          {
            q: 'Why only 5 jobs?',
            a: '5 is the limit on a single free run. The free Offerloop account opens the full job board with daily refreshes, recruiter contacts on every posting, and per-job resume scoring. The 5-job free version exists to prove the matching quality before you create an account.',
          },
          {
            q: 'Where do the postings come from?',
            a: 'The widget runs live searches against Greenhouse, Lever, Workday, LinkedIn, and Indeed via Perplexity. Postings are fetched in real time, not from a stale aggregator. Listings older than a month are filtered out before scoring.',
          },
          {
            q: 'How is the match score calculated?',
            a: 'Six weighted components: base relevance (20), skills overlap (up to 45), field/major affinity (up to 15), recent-role title overlap (up to 10), and resume-text echo (up to 10). The widget shows you which skills matched and a plain-English reason per posting.',
          },
          {
            q: 'My resume has no internships yet. Will this work?',
            a: 'Yes. The matcher falls back to your major, skills, and project keywords. New-grad and internship language in the postings gets a boost when your graduation year is in the next 12 to 24 months.',
          },
          {
            q: 'Can I rerun this with a different resume?',
            a: 'Free runs are rate-limited to one per network per 24 hours so the tool stays free for everyone. A free Offerloop account removes the limit and lets you tune the search (location, role type, target firms) directly.',
          },
          {
            q: 'Do you keep my resume?',
            a: 'We keep the parsed text just long enough to run the match and email you the results. The PDF is processed in memory and not retained. The full policy is on the Privacy page.',
          },
          {
            q: 'Why does the widget read my email after the upload?',
            a: 'The email gate is how we send you the results, follow up if Offerloop can help on the next application, and prevent abuse of the free tier. We do not sell your address or share it with employers.',
          },
        ]}
      />

      <PreviewCTA
        eyebrow="WHEN YOU ARE READY TO GO DEEPER"
        headline="Match, apply, and reach an alum in the same session"
        subhead="The full Offerloop account opens the daily-refreshed job board, hands you the recruiter or hiring manager on each posting, drafts the cold email, and tracks the reply. All in one workflow."
        buttonText="Create your free Offerloop account"
        to="/onboarding"
        footnote="Free tier: 3 contacts per search, 2 interview preps, no credit card."
      />

      <ExitIntentCapture
        eyebrow="BEFORE YOU GO"
        heading="Weekly new-grad job digest"
        subtext="Fresh entry-level postings paired to your background, university recruiting events, and the resume edges that get callbacks. Free, no spam."
        buttonText="Send me the digest"
        cluster="new-grad"
      />

      <PreviewFooter />
    </div>
  );
};

export default FindJobsPreview;
