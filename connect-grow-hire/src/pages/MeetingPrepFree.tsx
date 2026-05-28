/*
 * Public, anonymous meeting-prep lead magnet at /tools/meeting-prep-free.
 *
 * Slug deliberately chosen as `/tools/meeting-prep-free` to avoid colliding
 * with any future paid /tools/meeting-prep page; the existing SEO preview at
 * /seo-preview/meeting-mckinsey is unrelated.
 *
 * Backend: POST /api/tools/meeting-prep/generate -> { prep_id }
 *          GET  /api/tools/meeting-prep/status/<prep_id>
 *          GET  /api/tools/meeting-prep/download/<prep_id>
 *
 * Mounts <MeetingPrepWidget> for the actual flow. Reuses the visual language
 * of yesterday's public free pages (Libre Baskerville hero, brand-blue
 * accent, DM Sans body). The top-right "Get Started for Free" CTA points
 * at /onboarding per the spec.
 */
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { ArrowRight, Coffee, Users, TrendingUp, Bot, Lock, FileText } from "lucide-react";
import { MeetingPrepWidget } from "../components/widgets/MeetingPrepWidget";
import { BRAND, BRAND_DARK, INK, serif, PreviewFooter } from "./seo-preview/_shared";
import offerloopLogo from "../assets/offerloop_logo2.png";

const MeetingPrepFree = () => (
  <div
    className="min-h-screen w-full"
    style={{ fontFamily: "'DM Sans', system-ui, sans-serif", background: "#FFFFFF" }}
  >
    <Helmet>
      <title>Free Meeting Prep Generator | Offerloop</title>
      <meta
        name="description"
        content="Paste a LinkedIn URL, get a free PDF prep doc for your next coffee chat in under two minutes. Smart questions tied to their real career, live company research, source-backed."
      />
    </Helmet>

    <TopNav />

    <section style={{ position: "relative", overflow: "hidden", borderBottom: "1px solid #F1F5F9" }}>
      <div
        style={{
          position: "absolute",
          top: "-260px",
          left: "50%",
          transform: "translateX(-50%)",
          width: "1000px",
          height: "560px",
          zIndex: 0,
          pointerEvents: "none",
          background: "radial-gradient(circle, rgba(59,130,246,0.16), transparent 70%)",
        }}
      />
      <div
        className="px-6 pt-14 pb-12 text-center"
        style={{ maxWidth: "820px", margin: "0 auto", position: "relative", zIndex: 1 }}
      >
        <span
          className="inline-flex items-center gap-1.5 mb-6"
          style={{
            background: "#EFF5FF",
            border: "1px solid #DBEAFE",
            color: BRAND_DARK,
            fontSize: "12.5px",
            fontWeight: 600,
            padding: "5px 12px",
            borderRadius: "999px",
          }}
        >
          <Coffee className="w-3.5 h-3.5" /> FREE TOOL · MEETING PREP
        </span>
        <h1
          style={{
            fontFamily: serif,
            fontWeight: 400,
            lineHeight: 1.08,
            letterSpacing: "-0.03em",
            color: INK,
            marginBottom: "18px",
          }}
        >
          <span style={{ display: "block", fontSize: "clamp(38px, 5.2vw, 58px)" }}>
            Paste a LinkedIn URL,
          </span>
          <span
            style={{
              display: "block",
              fontSize: "clamp(38px, 5.2vw, 58px)",
              color: BRAND,
              marginTop: "4px",
            }}
          >
            walk into the meeting prepared
          </span>
        </h1>
        <p
          style={{
            fontSize: "18px",
            lineHeight: 1.6,
            color: "#64748B",
            maxWidth: "640px",
            margin: "0 auto",
          }}
        >
          Smart questions grounded in their actual career moves. Live Perplexity research on
          their company. A clean PDF you can skim in the Uber on the way over. No signup, no
          credit card.
        </p>
      </div>
    </section>

    <section className="px-6 pb-16 pt-2" style={{ maxWidth: "820px", margin: "0 auto" }}>
      <MeetingPrepWidget source="standalone-tools-meeting-prep-free" />
    </section>

    <UpgradeSection />

    <PreviewFooter />
  </div>
);

// ──────────────────────────────────────────────────────────────────────────
// Top nav (inlined so the CTA can point at /onboarding without altering the
// shared PreviewNav used by every other SEO preview page).
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

const UpgradeSection = () => (
  <section
    className="px-6 py-14"
    style={{ background: "#FAFBFF", borderTop: "1px solid #F1F5F9" }}
  >
    <div style={{ maxWidth: "820px", margin: "0 auto" }}>
      <p
        style={{
          fontSize: "12.5px",
          fontWeight: 700,
          color: BRAND,
          letterSpacing: "0.06em",
          marginBottom: "14px",
        }}
      >
        WHAT THIS FREE VERSION DOESN'T HAVE
      </p>
      <h2
        style={{
          fontFamily: serif,
          fontSize: "30px",
          fontWeight: 400,
          color: INK,
          marginBottom: "14px",
          letterSpacing: "-0.02em",
        }}
      >
        The personalized version is the real lift
      </h2>
      <p style={{ fontSize: "15px", lineHeight: 1.75, color: "#475569", marginBottom: "24px" }}>
        The PDF above is built from their LinkedIn and public research. The version inside
        Offerloop is rebuilt around <em>you</em>: your resume, your shared background, your
        hook into this conversation. Same prep, 10x more useful.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-7">
        <UpgradeCell
          Icon={Users}
          title="Common Ground match"
          body="The widget surfaces overlap between your background and theirs (shared schools, employers, clubs, hometowns) so you don't have to dig for the icebreaker."
        />
        <UpgradeCell
          Icon={FileText}
          title="Secret Weapon hook"
          body="One specific thing in YOUR resume that maps to their work. The thing you lead with when they ask 'so tell me about yourself.'"
        />
        <UpgradeCell
          Icon={TrendingUp}
          title="Conversation strategy"
          body="A tailored arc for this specific meeting: where to lead, where to hold back, what to ask if the conversation stalls."
        />
        <UpgradeCell
          Icon={Bot}
          title="Cold-email + follow-up drafts"
          body="Generated emails for the meeting request and the follow-up note, drafted from your shared context, not from a template."
        />
      </div>

      <Link
        to="/onboarding"
        className="inline-flex items-center gap-2 px-5 py-3 rounded-[3px] text-sm font-semibold text-white"
        style={{ background: BRAND }}
      >
        Prep for more meetings
        <ArrowRight className="w-4 h-4" />
      </Link>
      <p
        className="flex items-center gap-1.5"
        style={{ fontSize: "12.5px", color: "#94A3B8", marginTop: "10px" }}
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
  Icon: typeof Users;
  title: string;
  body: string;
}) => (
  <div
    className="rounded-[4px] p-4"
    style={{ background: "#FFFFFF", border: "1px solid #E2E8F0" }}
  >
    <Icon className="w-4 h-4" style={{ color: BRAND }} />
    <p style={{ fontSize: "14px", fontWeight: 700, color: INK, marginTop: "8px" }}>{title}</p>
    <p style={{ fontSize: "13px", lineHeight: 1.6, color: "#64748B", marginTop: "4px" }}>
      {body}
    </p>
  </div>
);

export default MeetingPrepFree;
