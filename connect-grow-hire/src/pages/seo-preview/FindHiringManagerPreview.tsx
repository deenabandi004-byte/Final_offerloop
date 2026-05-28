/*
 * SEO PREVIEW: Find Hiring Manager, widget-embedded variant.
 * Route: /seo-preview/find-hiring-manager
 *
 * Pairs FindHiringManagerWidget with a generic example panel (mirrors the
 * widget's READY ResultsBlock so visitors see the shape of the output
 * before they submit). Standard SEO scaffolding: JSON-LD (Article, FAQPage,
 * HowTo, WebApplication), question-form FAQ, freshness byline, PreviewCTA.
 *
 * The brief said one SEO preview, so this is intentionally generic - firm-
 * specific variants (e.g. /seo-preview/find-hiring-manager/goldman-ib)
 * can land later under a parameterized template route.
 *
 * House style: no em dashes, no sparkle icons.
 */
import { Helmet } from 'react-helmet-async';
import { Link as LinkIcon, Search, Target, Linkedin } from 'lucide-react';
import {
  BRAND, BRAND_DARK, INK, kicker, serif,
  PreviewNav, PreviewFooter,
  HowItWorks, FAQ, PreviewCTA,
  InlineEmailCapture, ExitIntentCapture,
} from './_shared';
import FindHiringManagerWidget from '../../components/widgets/FindHiringManagerWidget';

const UPDATED_LABEL = 'Updated May 2026';
const PUBLISH_DATE_ISO = '2026-05-26';

const emailCapture = {
  eyebrow: 'NOT APPLYING TODAY?',
  heading: 'Get the weekly recruiting digest',
  subtext: 'Every Monday: new hiring-manager pivots, posting changes at MBB / IB / FAANG, and the people who just got promoted to a screen. Built for students breaking into consulting, IB, and tech.',
  buttonText: 'Send me the digest',
  cluster: 'recruiting',
};

const FAQ_ITEMS = [
  {
    q: 'How do you actually find the hiring manager from a job URL?',
    a: 'Three steps. (1) Firecrawl scrapes the posting and pulls the company, role, and any explicit "hiring manager" or "team lead" mentioned in the JD. (2) We classify the role into a function (engineering, sales, finance, marketing, product, ...). (3) People Data Labs runs a tiered title search across 2.2B profiles at that company, ranked by seniority + team. Top 1 or 2 candidates come back with LinkedIn URL plus a short reasoning string.',
  },
  {
    q: 'Why only 1 to 2 hiring managers, not 10?',
    a: 'The free tool is intentionally narrow so the result is signal, not a list to wade through. The actual hiring manager for a single posting is usually 1 person, sometimes 2 (the role manager plus a department head). Surfacing 10 just dilutes the answer. The paid version inside Offerloop lets you run unlimited searches and pull deeper bench - useful when you are working a real pipeline, not researching one posting.',
  },
  {
    q: 'Which job boards work?',
    a: 'Anything that returns a normal HTML page. Greenhouse, Lever, Workday, Ashby, LinkedIn, Indeed, Handshake, Wellfound, and almost every company-hosted careers page work cleanly. Heavily auth-gated boards (closed company portals) and JavaScript-rendered pages without server HTML can fail; if it does, try the same posting on the company\'s own careers site.',
  },
  {
    q: 'Is the LinkedIn URL going to be the right person?',
    a: 'For most postings, yes. PDL is matching by current employer + a tier of decision-maker titles (manager, director, VP, head-of) inside the right function. The reasoning string tells you WHY we picked them, so you can sanity-check. If the JD itself named a hiring manager (some companies do), that person gets surfaced ahead of the tier search.',
  },
  {
    q: 'Will the email of the hiring manager come back too?',
    a: 'Not on the free tool. The free version returns name, title, company, location, and LinkedIn URL only. Verified email comes back when you run the same search inside Offerloop (Hunter-verified) - the paid version is built to send the email, not just identify the person.',
  },
  {
    q: 'Why is the free tool rate-limited?',
    a: 'One search per network per 24 hours. PDL and Firecrawl both charge per call, and we eat that cost to keep the tool free. The 24-hour cap stops abuse while still giving students a useful answer when they need it on a Monday-morning application push. If you need more, create a free Offerloop account - 300 credits to start, no card required.',
  },
  {
    q: 'How is this different from LinkedIn Sales Navigator or Apollo?',
    a: 'Sales Nav and Apollo are built for sales teams searching at scale - subscription, $99+/month, learning curve. This tool is built for a single college student applying to a single job: paste the URL, get the answer in 30 seconds, no account. The trade-off is that you get one search per day on the free tool, not a sortable CRM.',
  },
  {
    q: 'Does it cost anything?',
    a: 'No. Paste a job URL, optionally drop an email so we can rate-limit by user instead of just IP, and get the result. We ask for the email so we can send you the weekly recruiting digest, not to bill you.',
  },
];

const JSON_LD = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Article',
      'headline': 'Find the Hiring Manager for Any Job (Free, From a URL, in 30 Seconds)',
      'datePublished': PUBLISH_DATE_ISO,
      'dateModified': PUBLISH_DATE_ISO,
      'author': { '@type': 'Organization', 'name': 'Offerloop' },
      'publisher': { '@type': 'Organization', 'name': 'Offerloop' },
      'description': 'Free tool that takes a job posting URL and returns the 1 to 2 most likely hiring managers with name, title, LinkedIn, and reasoning. Powered by Firecrawl + People Data Labs.',
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
      'name': 'How to find the hiring manager for any job posting',
      'step': [
        { '@type': 'HowToStep', 'name': 'Paste the job URL', 'text': 'Greenhouse, Lever, Workday, LinkedIn, Indeed, or the company\'s own careers page.' },
        { '@type': 'HowToStep', 'name': 'We read the posting', 'text': 'Firecrawl scrapes the company + role; we classify the role into a function (engineering, sales, finance, ...).' },
        { '@type': 'HowToStep', 'name': 'PDL tiered search', 'text': 'People Data Labs ranks decision-makers at that company by title, seniority, and team.' },
        { '@type': 'HowToStep', 'name': 'Review and download', 'text': 'Top 1 to 2 candidates with LinkedIn URLs and reasoning. Download as CSV or click through to the profile.' },
      ],
    },
    {
      '@type': 'WebApplication',
      'name': 'Offerloop Free Hiring Manager Finder',
      'applicationCategory': 'BusinessApplication',
      'operatingSystem': 'Web',
      'offers': { '@type': 'Offer', 'price': '0', 'priceCurrency': 'USD' },
    },
  ],
};

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
      Your most likely hiring manager
    </h3>
    <p style={{ fontSize: 12.5, color: '#64748B', marginTop: 4, marginBottom: 18 }}>
      Software Engineer at Stripe
    </p>

    <div style={{ borderTop: '1px solid #F1F5F9', paddingTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <h4 style={{ fontFamily: serif, fontSize: 18, fontWeight: 400, color: INK, margin: 0 }}>
            Sarah K.
          </h4>
          <p style={{ fontSize: 13.5, color: '#475569', margin: '4px 0 0 0' }}>
            <span style={{ fontWeight: 600 }}>Engineering Manager</span>
            <span style={{ color: '#94A3B8' }}> at </span>
            Stripe
          </p>
          <p style={{ fontSize: 12.5, color: '#94A3B8', margin: '3px 0 0 0' }}>San Francisco, CA</p>
        </div>
        <span
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
          }}
        >
          <Linkedin size={14} />
          LinkedIn
        </span>
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
        PDL flags them as an engineering decision-maker at Stripe - the right
        seniority and function to own hiring for a Software Engineer role.
      </div>
    </div>
  </div>
);

// ──────────────────────────────────────────────────────────────────────────
// Page
// ──────────────────────────────────────────────────────────────────────────

const FindHiringManagerPreview = () => (
  <div
    className="min-h-screen w-full"
    style={{ fontFamily: "'DM Sans', system-ui, sans-serif", background: '#FFFFFF' }}
  >
    <Helmet>
      <title>Find the Hiring Manager for Any Job in 30 Seconds (Free)</title>
      <meta
        name="description"
        content="Paste a job URL. We return the 1 to 2 most likely hiring managers with name, title, LinkedIn, and reasoning. Free, no account, powered by Firecrawl + People Data Labs."
      />
      <link rel="canonical" href="https://offerloop.ai/seo-preview/find-hiring-manager" />
      <script type="application/ld+json">{JSON.stringify(JSON_LD)}</script>
    </Helmet>

    <PreviewNav />

    <section
      style={{ position: 'relative', overflow: 'hidden', borderBottom: '1px solid #F1F5F9' }}
    >
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
          <Search className="w-3.5 h-3.5" /> FREE TOOL · {UPDATED_LABEL.toUpperCase()}
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
            Find the hiring manager
          </span>
          <span
            style={{
              display: 'block',
              fontSize: 'clamp(36px, 4.8vw, 54px)',
              color: BRAND,
              marginTop: '4px',
            }}
          >
            for any job, in 30 seconds.
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
          Paste a job posting URL. We extract company + role with Firecrawl, run a tiered People
          Data Labs search across 2.2B profiles, and surface the 1 to 2 decision-makers most
          likely to read your application.
        </p>
      </div>
    </section>

    {/* Quick-Answer block (passage-retrieval friendly) */}
    <section
      className="px-6 pt-10"
      style={{ maxWidth: '820px', margin: '0 auto' }}
    >
      <div
        className="rounded-[6px]"
        style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', padding: '20px 22px' }}
      >
        <p style={{ ...kicker, marginBottom: '8px' }}>QUICK ANSWER</p>
        <p style={{ fontSize: '15px', lineHeight: 1.7, color: '#334155', margin: 0 }}>
          The widget below takes a job URL, classifies the role into a hiring function, and
          returns the 1 to 2 most likely hiring managers at that company with LinkedIn URLs and
          short reasoning. Free, no account, one search per 24 hours per network. Works on
          Greenhouse, Lever, Workday, LinkedIn, Indeed, and most company careers pages.
        </p>
      </div>
    </section>

    {/* Widget */}
    <section className="px-6 py-12" style={{ maxWidth: '1100px', margin: '0 auto' }}>
      <FindHiringManagerWidget
        source="seo-preview-find-hiring-manager"
        eyebrow="TRY IT NOW"
        heading="Paste any job URL"
        subhead="We'll read the posting and surface the actual person who hires for that role."
        examplePanel={<ExamplePanel />}
      />
    </section>

    <HowItWorks
      heading="How the finder works under the hood"
      steps={[
        { Icon: LinkIcon, t: 'Firecrawl reads the JD', d: 'We scrape the posting for company, role, and any named hiring manager in the body.' },
        { Icon: Search, t: 'Role classification', d: 'The role is mapped to a hiring function: engineering, sales, finance, marketing, product, design, ops, hr.' },
        { Icon: Target, t: 'Tiered PDL search', d: 'People Data Labs returns decision-makers at that company by title + seniority. We rank for the function detected.' },
        { Icon: Linkedin, t: 'You get a clean answer', d: '1 or 2 named profiles with LinkedIn URLs + a reasoning string per pick. Download as CSV.' },
      ]}
    />

    <InlineEmailCapture {...emailCapture} />

    <FAQ items={FAQ_ITEMS} />

    <PreviewCTA
      eyebrow="ONE SEARCH IS A LEAD. A PIPELINE IS AN OFFER."
      headline="Get unlimited hiring-manager searches free for 7 days"
      subhead="Offerloop runs the same finder across every job you're tracking, returns Hunter-verified emails, and ties each contact into your networking pipeline."
      buttonText="Create a free account"
      to="/onboarding"
      footnote="300 free credits to start. No card required."
    />

    <ExitIntentCapture {...emailCapture} />

    <PreviewFooter />
  </div>
);

export default FindHiringManagerPreview;
