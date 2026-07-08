/*
 * Public, anonymous Find-Hiring-Manager lead magnet at
 * /tools/find-hiring-manager.
 *
 * Backend: POST /api/tools/find-hiring-manager/capture-email
 *          POST /api/tools/find-hiring-manager/search
 *
 * The page is intentionally minimal: it wraps FindHiringManagerWidget with
 * a hero + upgrade CTA + footer. The widget itself owns the entire idle ->
 * email_gate -> running -> results state machine, so this page stays a
 * thin shell.
 *
 * Top-right "Get Started for Free" sends to /onboarding (not /signin),
 * matching the brief. The free-marketing PreviewNav goes to /signin, so we
 * inline a custom header rather than mutate shared layout.
 *
 * House style: no em dashes, no Sparkles icon.
 */
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  Linkedin,
  Lock,
  Search,
  Target,
  TrendingUp,
  UserSearch,
} from 'lucide-react';
import {
  BRAND,
  BRAND_DARK,
  INK,
  serif,
  PreviewFooter,
} from './seo-preview/_shared';
import FindHiringManagerWidget from '../components/widgets/FindHiringManagerWidget';
import offerloopLogo from '../assets/offerloop_logo2.png';

const FindHiringManagerFree = () => (
  <div
    className="min-h-screen w-full"
    style={{ fontFamily: "'DM Sans', system-ui, sans-serif", background: '#FFFFFF' }}
  >
    <Helmet>
      <title>Find the Hiring Manager for Any Job | Free Tool | Offerloop</title>
      <meta
        name="description"
        content="Paste a job posting URL and we'll surface the most likely hiring manager - name, title, LinkedIn, and why they sit in the hiring chain. Free, no credit card, no account."
      />
    </Helmet>

    <CustomNav />

    <Hero />

    <section className="px-6 pb-20 pt-2" style={{ maxWidth: '780px', margin: '0 auto' }}>
      <FindHiringManagerWidget
        source="tools-find-hiring-manager-free"
        eyebrow=""
        heading=""
        subhead=""
      />
    </section>

    <HowItWorks />

    <UpgradeSection />

    <PreviewFooter />
  </div>
);

export default FindHiringManagerFree;

// ── Custom nav: Get Started -> /onboarding (per brief) ────────────────────

const CustomNav = () => (
  <nav
    className="w-full px-6 py-5 flex items-center justify-between"
    style={{ maxWidth: '1100px', margin: '0 auto', position: 'relative', zIndex: 2 }}
  >
    <Link to="/">
      <img src={offerloopLogo} alt="Offerloop" style={{ height: '64px', width: 'auto' }} />
    </Link>
    <Link
      to="/onboarding"
      className="px-5 py-2.5 rounded-[3px] text-sm font-semibold text-white"
      style={{ background: BRAND }}
    >
      Get Started for Free
    </Link>
  </nav>
);

// ── Hero ───────────────────────────────────────────────────────────────────

const Hero = () => (
  <section style={{ position: 'relative', overflow: 'hidden', borderBottom: '1px solid #F1F5F9' }}>
    <div
      style={{
        position: 'absolute',
        top: '-260px',
        left: '50%',
        transform: 'translateX(-50%)',
        width: '1000px',
        height: '560px',
        zIndex: 0,
        pointerEvents: 'none',
        background: 'radial-gradient(circle, rgba(59,130,246,0.16), transparent 70%)',
      }}
    />
    <div
      className="px-6 pt-14 pb-12 text-center"
      style={{ maxWidth: '820px', margin: '0 auto', position: 'relative', zIndex: 1 }}
    >
      <span
        className="inline-flex items-center gap-1.5 mb-6"
        style={{
          background: '#EFF5FF',
          border: '1px solid #DBEAFE',
          color: BRAND_DARK,
          fontSize: '12.5px',
          fontWeight: 600,
          padding: '5px 12px',
          borderRadius: '999px',
        }}
      >
        <UserSearch className="w-3.5 h-3.5" /> FREE TOOL · HIRING MANAGER FINDER
      </span>
      <h1
        style={{
          fontFamily: serif,
          fontWeight: 400,
          lineHeight: 1.08,
          letterSpacing: '-0.03em',
          color: INK,
          marginBottom: '18px',
        }}
      >
        <span style={{ display: 'block', fontSize: 'clamp(38px, 5.2vw, 58px)' }}>
          Stop emailing the careers inbox.
        </span>
        <span
          style={{
            display: 'block',
            fontSize: 'clamp(38px, 5.2vw, 58px)',
            color: BRAND,
            marginTop: '4px',
          }}
        >
          Find the actual hiring manager.
        </span>
      </h1>
      <p
        style={{
          fontSize: '18px',
          lineHeight: 1.6,
          color: '#64748B',
          maxWidth: '620px',
          margin: '0 auto',
        }}
      >
        Paste a job posting URL. We extract the role and surface the 1 to 2 people most
        likely to read your application, with their LinkedIn and the reasoning behind the pick.
      </p>
    </div>
  </section>
);

// ── How it works ───────────────────────────────────────────────────────────

const HowItWorks = () => (
  <section className="px-6 py-14" style={{ borderTop: '1px solid #F1F5F9', background: '#F8FAFC' }}>
    <div style={{ maxWidth: '820px', margin: '0 auto', textAlign: 'center' }}>
      <p
        style={{
          fontSize: '12.5px',
          fontWeight: 700,
          color: BRAND,
          letterSpacing: '0.06em',
          marginBottom: '12px',
        }}
      >
        HOW IT WORKS
      </p>
      <h2
        style={{
          fontFamily: serif,
          fontSize: '28px',
          fontWeight: 400,
          color: INK,
          marginBottom: '28px',
          letterSpacing: '-0.02em',
        }}
      >
        Three steps, under 30 seconds
      </h2>

      <div
        className="grid grid-cols-1 md:grid-cols-3 gap-4"
        style={{ textAlign: 'left' }}
      >
        <Step
          Icon={Search}
          num={1}
          title="Paste the job URL"
          body="Greenhouse, Lever, Workday, LinkedIn, Indeed, or the company's own careers page."
        />
        <Step
          Icon={Linkedin}
          num={2}
          title="We read the posting"
          body="Firecrawl pulls the company + role. We classify the role into a hiring function (engineering, sales, finance, ...)."
        />
        <Step
          Icon={Target}
          num={3}
          title="Get 1 to 2 candidates"
          body="PDL tiered search ranks by title, seniority, and team. You get name, title, LinkedIn, and a short reasoning per pick."
        />
      </div>
    </div>
  </section>
);

const Step = ({
  Icon,
  num,
  title,
  body,
}: {
  Icon: typeof Search;
  num: number;
  title: string;
  body: string;
}) => (
  <div
    className="rounded-[6px] p-5"
    style={{ background: '#FFFFFF', border: '1px solid #E2E8F0' }}
  >
    <div
      className="inline-flex items-center justify-center"
      style={{
        width: 28,
        height: 28,
        borderRadius: 6,
        background: '#EFF5FF',
        color: BRAND_DARK,
        marginBottom: 12,
      }}
    >
      <Icon className="w-4 h-4" />
    </div>
    <p style={{ fontSize: 11.5, fontWeight: 700, color: BRAND, letterSpacing: '0.06em' }}>
      STEP {num}
    </p>
    <p style={{ fontSize: 15, fontWeight: 700, color: INK, marginTop: 4 }}>{title}</p>
    <p style={{ fontSize: 13.5, lineHeight: 1.6, color: '#64748B', marginTop: 6 }}>{body}</p>
  </div>
);

// ── Upgrade section ────────────────────────────────────────────────────────

const UpgradeSection = () => (
  <section className="px-6 py-14" style={{ background: '#FAFBFF', borderTop: '1px solid #F1F5F9' }}>
    <div style={{ maxWidth: '820px', margin: '0 auto' }}>
      <p
        style={{
          fontSize: '12.5px',
          fontWeight: 700,
          color: BRAND,
          letterSpacing: '0.06em',
          marginBottom: '14px',
        }}
      >
        WHAT THE FREE VERSION DOESN'T HAVE
      </p>
      <h2
        style={{
          fontFamily: serif,
          fontSize: '30px',
          fontWeight: 400,
          color: INK,
          marginBottom: '14px',
          letterSpacing: '-0.02em',
        }}
      >
        One hiring manager is a coffee chat. A pipeline is an offer.
      </h2>
      <p style={{ fontSize: '15px', lineHeight: 1.75, color: '#475569', marginBottom: '24px' }}>
        The free tool gives you the single most likely person on a single posting. Offerloop runs
        the same search across every job you're tracking and ties each contact into the rest of
        your networking pipeline.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-7">
        <UpgradeCell
          Icon={Target}
          title="Unlimited searches"
          body="Run the hiring-manager finder on every role you're applying to, not 1 per 24 hours."
        />
        <UpgradeCell
          Icon={CheckCircle2}
          title="Verified emails"
          body="Hunter-verified contact emails, not just a LinkedIn URL. Send the message, don't just stalk the profile."
        />
        <UpgradeCell
          Icon={TrendingUp}
          title="Alumni overlap"
          body="See which hiring managers share your school. Warm intros convert 3-4x more than cold."
        />
        <UpgradeCell
          Icon={Bot}
          title="Scout AI follow-up"
          body="One assistant drafts the cold email, tracks the reply, and preps you for the call."
        />
      </div>

      <Link
        to="/onboarding"
        className="inline-flex items-center gap-2 px-5 py-3 rounded-[3px] text-sm font-semibold text-white"
        style={{ background: BRAND }}
      >
        Create a free account
        <ArrowRight className="w-4 h-4" />
      </Link>
      <p
        className="flex items-center gap-1.5"
        style={{ fontSize: '12.5px', color: '#94A3B8', marginTop: '10px' }}
      >
        <Lock className="w-3 h-3" />
        300 free credits to start, no credit card required.
      </p>
    </div>
  </section>
);

const UpgradeCell = ({
  Icon,
  title,
  body,
}: {
  Icon: typeof Target;
  title: string;
  body: string;
}) => (
  <div className="rounded-[4px] p-4" style={{ background: '#FFFFFF', border: '1px solid #E2E8F0' }}>
    <Icon className="w-4 h-4" style={{ color: BRAND }} />
    <p style={{ fontSize: '14px', fontWeight: 700, color: INK, marginTop: '8px' }}>{title}</p>
    <p style={{ fontSize: '13px', lineHeight: 1.6, color: '#64748B', marginTop: '4px' }}>{body}</p>
  </div>
);
