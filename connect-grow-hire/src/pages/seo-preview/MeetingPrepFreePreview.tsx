/*
 * SEO PREVIEW: meeting prep (PREP), widget-embedded variant.
 * Route: /seo-preview/meeting-prep-free
 *
 * Distinct from the existing /seo-preview/meeting-mckinsey page (which is
 * a static product-led mockup, no live widget). This page embeds the
 * actual MeetingPrepWidget against a McKinsey coffee-chat example panel,
 * mirroring the InterviewPrepMckinseyCasePreview pattern.
 *
 * Top-right "Get Started for Free" CTA points at /onboarding per spec.
 * House style: no em dashes, no sparkle icons.
 */
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import {
  Coffee,
  Download,
  FileText,
  Users,
  Target,
  ClipboardPaste,
  TrendingUp,
  Lightbulb,
} from "lucide-react";
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
  h2Style,
  pStyle,
  gridLayer,
} from "./_shared";
import { MeetingPrepWidget } from "../../components/widgets/MeetingPrepWidget";
import offerloopLogo from "../../assets/offerloop_logo2.png";

const UPDATED_LABEL = "Updated May 2026";
const PUBLISH_DATE_ISO = "2026-05-27";

const FAQ_ITEMS = [
  {
    q: "What does the free meeting-prep widget actually do?",
    a: "Paste the LinkedIn URL of who you're meeting. We enrich the profile against the People Data Labs database (2.2B contacts), run live Perplexity research on their company and industry, and generate a PDF with smart questions, recent company signal, and conversation tips. About 60 to 90 seconds end to end.",
  },
  {
    q: "How is this different from just searching them on LinkedIn?",
    a: "Three things. First, the questions are tied to their specific career moves, not generic 'tell me about your day' prompts. Second, we pull live company news from the last month so you can reference something current. Third, you walk into the meeting with a PDF, not a Chrome tab you have to remember to re-read.",
  },
  {
    q: "Do you save the LinkedIn profile or send marketing email?",
    a: "No. The profile data is used to build your PDF and then discarded. We capture your email when you submit so we can send you the report and a single follow-up tip; you can unsubscribe with one click.",
  },
  {
    q: "How is the free version different from the paid Offerloop version?",
    a: "The paid version is rebuilt around YOU: it surfaces Common Ground between your background and theirs (shared schools, employers, hometowns), names a Secret Weapon hook unique to your resume, and produces a tailored conversation strategy. The free version stops at smart questions and company signal.",
  },
  {
    q: "Why is there a one-per-day rate limit?",
    a: "Each prep makes live calls to PDL (paid per profile), Perplexity (paid per query), and OpenAI (paid per generation). The free tool is a lead magnet, not an unlimited utility. Sign up for an Offerloop account if you have a busy networking week.",
  },
  {
    q: "Will this work for any LinkedIn profile?",
    a: "Any public profile, yes. If the profile is private or set to anonymous-only-mode, PDL may not find a match and we'll surface a clear error so you can try a different URL.",
  },
];

const JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      headline: "Free Meeting Prep (Coffee Chat PDF in 90 Seconds)",
      datePublished: PUBLISH_DATE_ISO,
      dateModified: PUBLISH_DATE_ISO,
      author: { "@type": "Organization", name: "Offerloop" },
      publisher: { "@type": "Organization", name: "Offerloop" },
      description:
        "Free coffee-chat prep tool. Paste a LinkedIn URL, get a tailored PDF with smart questions, live company news, and conversation tips in 90 seconds. No signup.",
    },
    {
      "@type": "FAQPage",
      mainEntity: FAQ_ITEMS.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    },
    {
      "@type": "HowTo",
      name: "How to prep for a coffee chat in 90 seconds",
      step: [
        {
          "@type": "HowToStep",
          name: "Paste the LinkedIn URL",
          text: "Copy the full URL of the person you're meeting from their LinkedIn profile.",
        },
        {
          "@type": "HowToStep",
          name: "Generate the prep PDF",
          text: "The widget enriches the profile and runs live company research. Takes 60 to 90 seconds.",
        },
        {
          "@type": "HowToStep",
          name: "Skim the smart questions",
          text: "Five categories (Career Trajectory, Company & Role, Industry, Skill, Personal Journey), each tied to something specific they've done.",
        },
        {
          "@type": "HowToStep",
          name: "Walk in with a plan",
          text: "Bring the PDF to the meeting. Reference recent company news, ask the grounded questions, follow up afterward.",
        },
      ],
    },
    {
      "@type": "WebApplication",
      name: "Offerloop Free Meeting Prep",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    },
  ],
};

// ──────────────────────────────────────────────────────────────────────────
// Example panel - mirrors MeetingPrepWidget's CompletedCard look, then
// previews the smart-questions section inside the PDF.
// ──────────────────────────────────────────────────────────────────────────

const ExamplePanel = () => (
  <div style={{ width: "100%" }}>
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
      <span style={{ ...kicker, display: "inline-block" }}>EXAMPLE OUTPUT</span>
      <span style={{ fontSize: 12, color: "#94A3B8" }}>USC Marshall student, McKinsey EM coffee chat</span>
    </div>

    {/* READY card matching widget CompletedCard */}
    <div style={cardShell}>
      <p style={{ fontSize: 12.5, fontWeight: 700, color: BRAND_DARK, letterSpacing: "0.05em", margin: 0, marginBottom: 8 }}>
        READY
      </p>
      <h3 style={{ fontFamily: serif, fontSize: 26, fontWeight: 400, color: INK, margin: 0, marginBottom: 6 }}>
        Your prep doc is ready
      </h3>
      <p style={{ fontSize: 14, color: "#475569", marginTop: 0, marginBottom: 18 }}>
        Maya Rodriguez, Engagement Manager at McKinsey & Company
      </p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button disabled style={primaryBtnExample}>
          <Download size={16} /> Download PDF
        </button>
        <button disabled style={ghostBtnExample}>
          Prep for more meetings
        </button>
      </div>
      <div
        style={{
          marginTop: 18,
          padding: "12px 14px",
          background: "#F0F7FF",
          border: `1px solid #DBEAFE`,
          borderRadius: 8,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <FileText size={14} style={{ color: BRAND_DARK }} />
        <span style={{ fontSize: 12.5, color: BRAND_DARK, fontWeight: 600 }}>5-page PDF</span>
        <span style={{ marginLeft: "auto", fontSize: 11, color: "#475569" }}>
          career arc · 10 smart questions · company signal · tips
        </span>
      </div>
    </div>

    {/* What's inside the PDF preview */}
    <div style={{ marginTop: 18, marginBottom: 10 }}>
      <p style={{ ...kicker, marginBottom: 0 }}>WHAT IS IN THE PDF</p>
    </div>

    <PreviewCard
      icon={<Users size={14} style={{ color: BRAND }} />}
      kicker="SECTION 1 · CAREER ARC"
      title="Where they've been"
      body={
        <ul style={{ ...previewPara, paddingLeft: 18, margin: 0 }}>
          <li>UCLA, B.A. Econ, '16</li>
          <li>Deloitte S&O, Analyst, '16-'18</li>
          <li>McKinsey, Business Analyst, '19</li>
          <li>McKinsey, Associate, '21</li>
          <li>McKinsey, Engagement Manager, '24 to now</li>
        </ul>
      }
    />

    <PreviewCard
      icon={<ClipboardPaste size={14} style={{ color: BRAND }} />}
      kicker="SECTION 2 · SMART QUESTIONS · 2 OF 10"
      title="Grounded in their actual moves and recent firm news"
      body={
        <>
          <p style={{ ...previewPara, marginBottom: 4, fontWeight: 700, color: INK }}>
            Career Trajectory
          </p>
          <p style={{ ...previewPara, marginBottom: 4 }}>
            "You moved from Deloitte S&O to McKinsey as a Business Analyst in 2019.
            Was that a deliberate reset, or did the title come with the firm switch?"
          </p>
          <p style={{ ...previewPara, marginBottom: 14, fontSize: 11, color: "#94A3B8" }}>
            Grounded in: her 2018-'19 Deloitte-McKinsey move
          </p>
          <p style={{ ...previewPara, marginBottom: 4, fontWeight: 700, color: INK }}>
            Company & Role
          </p>
          <p style={{ ...previewPara, marginBottom: 4 }}>
            "McKinsey LA's healthcare practice has been leaning into payer-cost work
            (Kaiser, City of Hope). Has that shifted the kind of studies you get
            staffed on as an EM?"
          </p>
          <p style={{ ...previewPara, margin: 0, fontSize: 11, color: "#94A3B8" }}>
            Grounded in: recent McKinsey LA healthcare news
          </p>
        </>
      }
    />

    <PreviewCard
      icon={<TrendingUp size={14} style={{ color: BRAND }} />}
      kicker="SECTION 3 · RECENT COMPANY SIGNAL"
      title="What's happening at their firm right now"
      body={
        <ul style={{ ...previewPara, paddingLeft: 18, margin: 0 }}>
          <li>
            McKinsey's LA Operations practice is hiring heavily into healthcare clients
            (Kaiser, City of Hope) as of Q1 2026.
          </li>
          <li>
            "Operations Practice 2026 industrial productivity report" published Feb
            2026 - good reference for a why-McKinsey hook.
          </li>
          <li>
            LA class size for the 2026 BA cohort is reportedly ~30% larger than 2025
            with a faster decision turnaround.
          </li>
        </ul>
      }
    />

    <PreviewCard
      icon={<Lightbulb size={14} style={{ color: BRAND }} />}
      kicker="SECTION 4 · CONVERSATION TIPS"
      title="How to play this specific meeting"
      body={
        <ul style={{ ...previewPara, paddingLeft: 18, margin: 0 }}>
          <li>
            EM-level conversations skew strategy. Don't lead with case-method questions
            - she's past that part of her career.
          </li>
          <li>
            She moved from S&O to MBB. If you're considering the same path, surface
            that early so the conversation can be useful for you.
          </li>
          <li>
            Close with: "what's one thing about the LA office that doesn't show up in
            recruiting materials but matters once you're here?"
          </li>
        </ul>
      }
    />

    <p style={{ fontSize: 12, color: "#94A3B8", marginTop: 12, textAlign: "center" }}>
      Example output for a fictional USC Marshall sophomore. Your real PDF is generated live
      from the LinkedIn URL you paste, with sections tailored to that specific contact and
      their firm.
    </p>
  </div>
);

const PreviewCard = ({
  icon,
  kicker: k,
  title,
  body,
}: {
  icon: React.ReactNode;
  kicker: string;
  title: string;
  body: React.ReactNode;
}) => (
  <div style={{ ...cardShell, marginTop: 14, borderColor: "#DBEAFE" }}>
    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
      {icon}
      <span style={{ fontSize: 11, fontWeight: 700, color: BRAND_DARK, letterSpacing: "0.05em" }}>
        {k}
      </span>
    </div>
    <h4
      style={{
        fontFamily: serif,
        fontSize: 17,
        fontWeight: 400,
        color: INK,
        margin: "0 0 12px 0",
        lineHeight: 1.3,
      }}
    >
      {title}
    </h4>
    {body}
  </div>
);

const cardShell: React.CSSProperties = {
  background: "#FFF",
  border: "1px solid #E2E8F0",
  borderRadius: 14,
  padding: 18,
  boxShadow: "0 1px 2px rgba(15,23,42,0.04)",
  boxSizing: "border-box",
};

const previewPara: React.CSSProperties = {
  fontSize: 13,
  lineHeight: 1.6,
  color: "#334155",
  margin: "0 0 8px 0",
};

const primaryBtnExample: React.CSSProperties = {
  background: BRAND,
  color: "#FFF",
  border: "none",
  borderRadius: 8,
  padding: "11px 16px",
  fontSize: 14,
  fontWeight: 600,
  cursor: "not-allowed",
  opacity: 0.95,
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
};

const ghostBtnExample: React.CSSProperties = {
  background: "#FFF",
  color: BRAND_DARK,
  border: `1px solid ${BRAND}`,
  borderRadius: 8,
  padding: "11px 16px",
  fontSize: 14,
  fontWeight: 500,
  cursor: "not-allowed",
  opacity: 0.95,
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
};

// ──────────────────────────────────────────────────────────────────────────
// Top nav (inlined, points "Get Started for Free" at /onboarding)
// ──────────────────────────────────────────────────────────────────────────

const TopNav = () => (
  <nav
    className="w-full px-6 py-5 flex items-center justify-between"
    style={{ maxWidth: "1100px", margin: "0 auto", position: "relative", zIndex: 2 }}
  >
    <Link to="/">
      <img src={offerloopLogo} alt="Offerloop" style={{ height: "64px", width: "auto" }} />
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

// ──────────────────────────────────────────────────────────────────────────
// Page
// ──────────────────────────────────────────────────────────────────────────

const MeetingPrepFreePreview = () => {
  return (
    <div
      className="min-h-screen w-full"
      style={{ fontFamily: "'DM Sans', system-ui, sans-serif", background: "#FFFFFF" }}
    >
      <Helmet>
        <title>Free Coffee Chat Prep (PDF in 90 seconds) | Offerloop</title>
        <meta name="robots" content="noindex" />
        <meta
          name="description"
          content="Free coffee-chat prep tool. Paste a LinkedIn URL, get a tailored PDF with smart questions, live company news, and conversation tips in 90 seconds. No signup."
        />
        <script type="application/ld+json">{JSON.stringify(JSON_LD)}</script>
      </Helmet>

      <TopNav />

      {/* Hero */}
      <section style={{ position: "relative", overflow: "hidden", borderBottom: "1px solid #F1F5F9" }}>
        <div
          style={gridLayer(
            "rgba(15,23,42,0.045)",
            "radial-gradient(ellipse 75% 70% at 50% 0%, #000 30%, transparent 75%)",
          )}
        />
        <div
          className="px-6 pt-14 pb-10 text-center"
          style={{ maxWidth: 880, margin: "0 auto", position: "relative", zIndex: 1 }}
        >
          <span
            className="inline-flex items-center gap-1.5 mb-5"
            style={{
              background: "#EFF5FF",
              border: "1px solid #DBEAFE",
              color: BRAND_DARK,
              fontSize: 12.5,
              fontWeight: 600,
              padding: "5px 12px",
              borderRadius: 999,
            }}
          >
            <Coffee className="w-3.5 h-3.5" /> FREE TOOL · COFFEE CHAT PREP
          </span>
          <h1
            style={{
              fontFamily: serif,
              fontWeight: 400,
              lineHeight: 1.08,
              letterSpacing: "-0.03em",
              color: INK,
              marginBottom: 14,
              fontSize: "clamp(34px, 4.6vw, 52px)",
            }}
          >
            Prep for any coffee chat in <span style={{ color: BRAND }}>90 seconds</span>
          </h1>
          <p
            style={{
              fontSize: 17,
              lineHeight: 1.55,
              color: "#64748B",
              maxWidth: 680,
              margin: "0 auto 6px",
            }}
          >
            Paste a LinkedIn URL. We enrich the profile, sweep the last month of company news,
            and hand back a PDF with smart questions tied to their actual career.
          </p>
          <p style={{ fontSize: 13, color: "#94A3B8", marginTop: 4 }}>
            {UPDATED_LABEL} <span style={{ marginLeft: 8 }}>·</span>{" "}
            <span style={{ marginLeft: 8 }}>5 min read</span>
          </p>
        </div>

        {/* Quick-Answer block */}
        <div
          className="px-6"
          style={{ maxWidth: 820, margin: "0 auto 36px", position: "relative", zIndex: 1 }}
        >
          <div
            style={{
              background: "#F0F7FF",
              borderLeft: `3px solid ${BRAND}`,
              borderRadius: 6,
              padding: "18px 22px",
            }}
          >
            <div style={{ ...kicker, marginBottom: 6, color: BRAND_DARK }}>QUICK ANSWER</div>
            <p style={{ fontSize: 16, lineHeight: 1.65, color: INK, margin: 0 }}>
              A good coffee chat is 80% prep, 20% delivery. The prep is: know their career
              moves so you can ask grounded questions, know what's happening at their company
              right now so you can reference something current, and have a thoughtful close.
              Paste the LinkedIn URL below and the widget generates that prep as a PDF in
              about 90 seconds. No signup.
            </p>
          </div>
        </div>
      </section>

      {/* Widget mount */}
      <section className="px-6 pt-10 pb-6" style={{ maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ marginBottom: 18, textAlign: "center" }}>
          <span style={{ ...kicker, display: "inline-block" }}>
            SEE WHAT THE PDF CONTAINS, THEN GENERATE YOUR OWN
          </span>
        </div>
        <MeetingPrepWidget
          source="seo-preview-meeting-prep-free"
          examplePanel={<ExamplePanel />}
        />
      </section>

      {/* H2 #1 */}
      <section className="px-6 py-14" style={{ maxWidth: 820, margin: "0 auto" }}>
        <h2 style={h2Style}>What makes a coffee-chat question land?</h2>
        <p style={pStyle}>Three things, in priority order:</p>
        <ul style={{ ...pStyle, paddingLeft: 22 }}>
          <li>
            <strong>Specificity.</strong> "How did you decide to leave Deloitte for McKinsey
            in 2019?" beats "tell me about your career path" every time. Specificity proves
            you did the homework and gives them a real anchor to answer from.
          </li>
          <li>
            <strong>Curiosity, not flattery.</strong> "What's the muscle you grew as an EM
            that you didn't see coming?" beats "wow, your career is amazing." Curiosity makes
            the conversation feel like a real exchange.
          </li>
          <li>
            <strong>A clear answer to 'why are you asking.'</strong> If they can tell you're
            asking because YOU are thinking about a similar move, they engage harder. Surface
            your context early in the question so they know the angle.
          </li>
        </ul>
      </section>

      <HowItWorks
        heading="How the meeting-prep generator works"
        steps={[
          {
            Icon: ClipboardPaste,
            t: "Paste the LinkedIn URL",
            d: "Any public profile. We enrich it against the PDL database (2.2B contacts).",
          },
          {
            Icon: TrendingUp,
            t: "The widget runs live research",
            d: "Perplexity sweeps the last month of company news, industry trends, and any public mentions of this specific person.",
          },
          {
            Icon: FileText,
            t: "Download the prep PDF",
            d: "Five pages: career arc, ten smart questions across five categories, recent company signal, conversation tips, sources.",
          },
          {
            Icon: Target,
            t: "Walk into the meeting prepared",
            d: "Skim the PDF before. Ask the grounded questions. Reference the company news. Follow up afterward.",
          },
        ]}
      />

      <FAQ items={FAQ_ITEMS} />

      <PreviewCTA
        eyebrow="WHEN YOU ARE READY FOR THE FULL TOOLKIT"
        headline="Prep one meeting free, then prep every meeting from one place"
        subhead="Once you have a single PDF, the version inside Offerloop adds Common Ground from your resume, a Secret Weapon hook, and a tailored conversation strategy. Generate as many as you need."
        buttonText="Get Started for Free"
        to="/onboarding"
        footnote="Free tier: 300 credits, 10 alumni searches, no credit card."
      />

      <PreviewFooter />
    </div>
  );
};

export default MeetingPrepFreePreview;
