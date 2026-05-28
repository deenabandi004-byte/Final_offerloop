/*
 * Public, anonymous Find-People lead magnet at /tools/find-people.
 *
 * Backend: POST /api/tools/find-people/capture-email
 *          POST /api/tools/find-people/search
 *
 * The page is a thin shell wrapping FindPeopleWidget with a hero, how-it-
 * works, and upgrade CTA. The widget owns the entire idle -> email_gate ->
 * running -> results state machine.
 *
 * Top-right "Get Started for Free" sends to /onboarding (not /signin),
 * matching the brief. We inline a custom header so shared layout stays
 * unchanged.
 *
 * House style: no em dashes, no Sparkles icon.
 */
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BadgeCheck,
  Bot,
  CheckCircle2,
  GraduationCap,
  Lock,
  Search,
  Target,
  TrendingUp,
  Users,
} from 'lucide-react';
import { BRAND, BRAND_DARK, INK, serif, PreviewFooter } from './seo-preview/_shared';
import FindPeopleWidget from '../components/widgets/FindPeopleWidget';
import offerloopLogo from '../assets/offerloop_logo2.png';

const FindPeopleFree = () => (
  <div
    className="min-h-screen w-full"
    style={{ fontFamily: "'DM Sans', system-ui, sans-serif", background: '#FFFFFF' }}
  >
    <Helmet>
      <title>Find 5 People at Any Company | Free Tool | Offerloop</title>
      <meta
        name="description"
        content="Type a company and a role. We search 2.2 billion contacts and return 5 named people with title, school, and LinkedIn. Free, no credit card, no account."
      />
    </Helmet>

    <CustomNav />

    <Hero />

    <section className="px-6 pb-20 pt-2" style={{ maxWidth: '900px', margin: '0 auto' }}>
      <FindPeopleWidget source="tools-find-people-free" eyebrow="" heading="" subhead="" />
    </section>

    <HowItWorks />

    <UpgradeSection />

    <PreviewFooter />
  </div>
);

export default FindPeopleFree;

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
        <Users className="w-3.5 h-3.5" /> FREE TOOL · PEOPLE FINDER
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
          Stop guessing who works there.
        </span>
        <span
          style={{
            display: 'block',
            fontSize: 'clamp(38px, 5.2vw, 58px)',
            color: BRAND,
            marginTop: '4px',
          }}
        >
          Find 5 named people in seconds.
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
        Type a company and a role. We surface 5 real people with their current title, school,
        and LinkedIn URL. Built for students cold-emailing into consulting, banking, and tech.
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
        Three fields, under 5 seconds
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4" style={{ textAlign: 'left' }}>
        <Step
          Icon={Search}
          num={1}
          title="Type company + role"
          body="Goldman Sachs, McKinsey, Google, any firm. Pair it with a role like Investment Banking Analyst, Business Analyst, or Software Engineer."
        />
        <Step
          Icon={BadgeCheck}
          num={2}
          title="We search 2.2B contacts"
          body="Same People Data Labs database the paid tool runs on. Filtered to people currently at the target company in the matching role."
        />
        <Step
          Icon={GraduationCap}
          num={3}
          title="Get 5 named profiles"
          body="Each card shows name, current title, school, and a LinkedIn link. Download as CSV or click through to start the outreach."
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
  <div className="rounded-[6px] p-5" style={{ background: '#FFFFFF', border: '1px solid #E2E8F0' }}>
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
        Five names is a start. A pipeline is an offer.
      </h2>
      <p style={{ fontSize: '15px', lineHeight: 1.75, color: '#475569', marginBottom: '24px' }}>
        The free tool returns five profiles per day with LinkedIn URLs. Offerloop runs unlimited
        searches with verified work emails and ties each contact into the rest of your networking
        pipeline - drafting, tracking replies, prepping you for the meeting.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-7">
        <UpgradeCell
          Icon={Target}
          title="Unlimited searches"
          body="Run the people finder across every firm on your target list, not 5 results per day."
        />
        <UpgradeCell
          Icon={CheckCircle2}
          title="Verified work emails"
          body="Hunter-verified emails on every contact. Send the message, don't just stalk LinkedIn."
        />
        <UpgradeCell
          Icon={TrendingUp}
          title="School + alumni overlap"
          body="Filter results to your own school or pull every alum at a target firm in one query."
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

