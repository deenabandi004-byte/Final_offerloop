/*
 * SEO PREVIEW: Find People, widget-embedded variant.
 * Route: /seo-preview/find-people-usc-google
 *
 * Pairs FindPeopleWidget with a USC x Google angle. Standard SEO scaffolding:
 * JSON-LD (Article, FAQPage, HowTo, WebApplication), question-form FAQ,
 * freshness byline, PreviewCTA, exit-intent capture.
 *
 * The top-right CTA goes to /onboarding (matching the lead-magnet brief),
 * not /signin like the default PreviewNav. We inline a CustomNav so the
 * shared layout stays unchanged.
 *
 * House style: no em dashes, no sparkle icons.
 */
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import {
  BadgeCheck,
  GraduationCap,
  Linkedin,
  Search,
  Users,
} from 'lucide-react';
import {
  BRAND,
  BRAND_DARK,
  INK,
  kicker,
  serif,
  PreviewFooter,
  HowItWorks,
  FAQ,
  PreviewCTA,
  InlineEmailCapture,
  ExitIntentCapture,
} from './_shared';
import FindPeopleWidget from '../../components/widgets/FindPeopleWidget';
import offerloopLogo from '../../assets/offerloop_logo2.png';

const UPDATED_LABEL = 'Updated May 2026';
const PUBLISH_DATE_ISO = '2026-05-26';

const emailCapture = {
  eyebrow: 'NOT RECRUITING YET?',
  heading: 'Get the weekly recruiting digest',
  subtext:
    'Every Monday: new alumni hires at MBB / IB / FAANG, fresh cold-email templates, and posting changes worth chasing. Built for students breaking into consulting, banking, and tech.',
  buttonText: 'Send me the digest',
  cluster: 'recruiting',
};

const FAQ_ITEMS = [
  {
    q: 'How do you find 5 people at a company in seconds?',
    a: 'We run a single People Data Labs /person/search against a 2.2 billion contact database, filtered to people currently working at the company you typed, in the role you typed. Profiles are returned ranked by recency and verified LinkedIn presence. The whole thing is one network call - typically 2 to 5 seconds.',
  },
  {
    q: 'Why USC at Google specifically?',
    a: "USC pushes a heavy class into FAANG every cycle, but the Marshall and Viterbi alumni directories are both incomplete. This page is one example of the find-people tool: type Google, type Software Engineer, and you get 5 named profiles with a verified LinkedIn URL. The same tool works on any company + role pair.",
  },
  {
    q: 'Can I see the email of each person?',
    a: "Not on the free tool. The free version returns name, current title, company, school, and LinkedIn URL only. Hunter-verified work emails come back when you run the same search inside Offerloop. The paid version is built to send the email, not just identify the person.",
  },
  {
    q: 'Why only 5 results, not 50?',
    a: 'The free tool is intentionally narrow so the answer is signal, not a list to wade through. Most cold-outreach plays at a single firm need 3-5 people, not 50. The paid version inside Offerloop lets you pull unlimited results with filters by school, seniority, and team.',
  },
  {
    q: 'How accurate is the school field?',
    a: "PDL pulls education from public profiles (LinkedIn and elsewhere). Coverage is strongest for US 4-year universities and weaker for community colleges and grad-only-listed profiles. If the school field is blank, the person just didn't list it publicly - the profile itself is still real.",
  },
  {
    q: 'Why is the free tool rate-limited?',
    a: 'One search per network per 24 hours. PDL charges per call and we eat that cost to keep the tool free. The 24-hour cap stops abuse while still letting students get a useful answer when they need it. If you need more, create a free Offerloop account - 300 credits to start, no card required.',
  },
  {
    q: 'How is this different from LinkedIn Sales Navigator?',
    a: 'Sales Nav is built for sales teams searching at scale - $99+/month subscription, learning curve, full CRM. This tool is built for a single student running one search: type two fields, get 5 names in 5 seconds, no account. The trade-off is 5 results per day on the free tool, not a sortable list of thousands.',
  },
];

const JSON_LD = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Article',
      'headline': 'Find 5 USC Alumni at Google in 5 Seconds (Free People Search)',
      'datePublished': PUBLISH_DATE_ISO,
      'dateModified': PUBLISH_DATE_ISO,
      'author': { '@type': 'Organization', 'name': 'Offerloop' },
      'publisher': { '@type': 'Organization', 'name': 'Offerloop' },
      'description':
        'Free tool that takes a company name and a role and returns 5 named people with title, school, and LinkedIn URL. Powered by People Data Labs.',
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
      'name': 'How to find 5 named contacts at any company',
      'step': [
        { '@type': 'HowToStep', 'name': 'Type the company', 'text': 'Goldman Sachs, McKinsey, Google, any firm with a real workforce.' },
        { '@type': 'HowToStep', 'name': 'Type the role', 'text': 'Investment Banking Analyst, Business Analyst, Software Engineer, etc.' },
        { '@type': 'HowToStep', 'name': 'Drop your email', 'text': 'Only used to follow up with the weekly recruiting digest. No spam.' },
        { '@type': 'HowToStep', 'name': 'Get 5 named profiles', 'text': 'Name, title, company, school, LinkedIn URL. Download as CSV or start outreach.' },
      ],
    },
    {
      '@type': 'WebApplication',
      'name': 'Offerloop Free People Finder',
      'applicationCategory': 'BusinessApplication',
      'operatingSystem': 'Web',
      'offers': { '@type': 'Offer', 'price': '0', 'priceCurrency': 'USD' },
    },
  ],
};

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

// ── Example panel: shape-of-result preview for the idle state ─────────────

const ExamplePanel = () => (
  <div
    style={{
      background: '#FFFFFF',
      border: '1px solid #E2E8F0',
      borderRadius: 14,
      padding: 22,
      boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
    }}
  >
    <div style={{ fontSize: 11, fontWeight: 700, color: BRAND_DARK, letterSpacing: '0.06em' }}>
      EXAMPLE OUTPUT
    </div>
    <h3 style={{ fontFamily: serif, fontSize: 22, fontWeight: 400, color: INK, margin: '4px 0 0 0' }}>
      5 people at Google
    </h3>
    <p style={{ fontSize: 12.5, color: '#64748B', marginTop: 4, marginBottom: 18 }}>
      Matching role: Software Engineer
    </p>

    {[
      { name: 'Priya S.', title: 'Software Engineer', school: 'University of Southern California' },
      { name: 'Marcus C.', title: 'Software Engineer II', school: 'University of Michigan' },
      { name: 'Elena T.', title: 'Senior Software Engineer', school: 'Carnegie Mellon University' },
    ].map((row, i) => (
      <div
        key={i}
        style={{
          borderTop: '1px solid #F1F5F9',
          paddingTop: 14,
          paddingBottom: i < 2 ? 14 : 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <h4 style={{ fontFamily: serif, fontSize: 17, fontWeight: 400, color: INK, margin: 0 }}>
              {row.name}
            </h4>
            <p style={{ fontSize: 13, color: '#475569', margin: '4px 0 0 0' }}>
              <span style={{ fontWeight: 600 }}>{row.title}</span>
              <span style={{ color: '#94A3B8' }}> at </span>
              Google
            </p>
          </div>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 12.5,
              fontWeight: 600,
              color: BRAND_DARK,
              background: '#EFF5FF',
              border: '1px solid #DBEAFE',
              borderRadius: 6,
              padding: '5px 9px',
            }}
          >
            <Linkedin size={13} />
            LinkedIn
          </span>
        </div>
        <div
          style={{
            marginTop: 8,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 12,
            color: '#334155',
            background: '#F8FAFC',
            border: '1px solid #E2E8F0',
            borderRadius: 6,
            padding: '4px 8px',
          }}
        >
          <GraduationCap size={12} style={{ color: BRAND_DARK }} />
          {row.school}
        </div>
      </div>
    ))}
  </div>
);

// ──────────────────────────────────────────────────────────────────────────
// Page
// ──────────────────────────────────────────────────────────────────────────

const FindPeopleUscGooglePreview = () => (
  <div
    className="min-h-screen w-full"
    style={{ fontFamily: "'DM Sans', system-ui, sans-serif", background: '#FFFFFF' }}
  >
    <Helmet>
      <title>Find 5 USC Alumni at Google in Seconds (Free People Search)</title>
      <meta
        name="description"
        content="Type a company and a role. Get 5 named people with title, school, and LinkedIn URL. Free, no account, powered by People Data Labs."
      />
      <link rel="canonical" href="https://offerloop.ai/seo-preview/find-people-usc-google" />
      <script type="application/ld+json">{JSON.stringify(JSON_LD)}</script>
    </Helmet>

    <CustomNav />

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
        className="px-6 pt-12 pb-10 text-center"
        style={{ maxWidth: '820px', margin: '0 auto', position: 'relative', zIndex: 1 }}
      >
        <span
          className="inline-flex items-center gap-1.5 mb-5"
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
          <Users className="w-3.5 h-3.5" /> FREE TOOL · {UPDATED_LABEL.toUpperCase()}
        </span>
        <h1
          style={{
            fontFamily: serif,
            fontWeight: 400,
            lineHeight: 1.08,
            letterSpacing: '-0.03em',
            color: INK,
            marginBottom: '16px',
          }}
        >
          <span style={{ display: 'block', fontSize: 'clamp(36px, 4.8vw, 54px)' }}>
            Find 5 USC alumni at Google
          </span>
          <span
            style={{
              display: 'block',
              fontSize: 'clamp(36px, 4.8vw, 54px)',
              color: BRAND,
              marginTop: '4px',
            }}
          >
            in 5 seconds, free.
          </span>
        </h1>
        <p
          style={{
            fontSize: '17px',
            lineHeight: 1.6,
            color: '#64748B',
            maxWidth: '620px',
            margin: '0 auto',
          }}
        >
          Type a company and a role. We search 2.2 billion contacts and return 5 named people
          with their current title, school, and LinkedIn URL. No account, no credit card.
        </p>
      </div>
    </section>

    {/* Quick-Answer block (passage-retrieval friendly) */}
    <section className="px-6 pt-10" style={{ maxWidth: '820px', margin: '0 auto' }}>
      <div
        className="rounded-[6px]"
        style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', padding: '20px 22px' }}
      >
        <p style={{ ...kicker, marginBottom: '8px' }}>QUICK ANSWER</p>
        <p style={{ fontSize: '15px', lineHeight: 1.7, color: '#334155', margin: 0 }}>
          The widget below takes a company name plus a role and returns 5 currently-employed
          people at that firm in that role with name, title, school, and a LinkedIn URL.
          Free, no account, one search per 24 hours per network. Powered by a 2.2B-contact
          People Data Labs index.
        </p>
      </div>
    </section>

    {/* Widget */}
    <section className="px-6 py-12" style={{ maxWidth: '1100px', margin: '0 auto' }}>
      <FindPeopleWidget
        source="seo-preview-find-people-usc-google"
        eyebrow="TRY IT NOW"
        heading="Type any company and role"
        subhead="We'll return 5 real people with title, school, and LinkedIn URL."
        examplePanel={<ExamplePanel />}
      />
    </section>

    <HowItWorks
      heading="How the finder works under the hood"
      steps={[
        { Icon: Search, t: 'You type two fields', d: 'Company name (Google) and a role (Software Engineer). That is the entire query.' },
        { Icon: BadgeCheck, t: 'PDL /person/search', d: 'A 2.2B-profile index returns people currently at that company in that role, with verified LinkedIn presence.' },
        { Icon: GraduationCap, t: 'School field is pulled', d: 'For students chasing alumni warm-intros, the school field tells you who shares your network on every card.' },
        { Icon: Linkedin, t: 'You get a clean answer', d: '5 named profiles with LinkedIn URLs. Download as CSV or click through to start the outreach.' },
      ]}
    />

    <InlineEmailCapture {...emailCapture} />

    <FAQ items={FAQ_ITEMS} />

    <PreviewCTA
      eyebrow="FIVE NAMES IS A LEAD. A PIPELINE IS AN OFFER."
      headline="Get unlimited people searches free for 7 days"
      subhead="Offerloop runs the same finder across every firm on your target list, returns Hunter-verified work emails, and ties each contact into your networking pipeline."
      buttonText="Create a free account"
      to="/onboarding"
      footnote="300 free credits to start. No card required."
    />

    <ExitIntentCapture {...emailCapture} />

    <PreviewFooter />
  </div>
);

export default FindPeopleUscGooglePreview;
