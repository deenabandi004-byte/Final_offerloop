/*
 * MeetingPrepWidget - self-contained, embeddable React component for the
 * free meeting-prep lead magnet. Drop it into any page:
 *
 *   <MeetingPrepWidget source="goldman-coffee-chat-page" />
 *
 * The `source` prop is sent to /api/tools/meeting-prep/generate and written
 * into the lead_magnet_emails Firestore doc so we can attribute leads to the
 * SEO page they came from.
 *
 * Mirrors InterviewPrepWidget structure (IdleCard / EmailGateCard /
 * RunningCard / CompletedCard / FailedCard) so the visual language stays
 * consistent across the public widget set. The differences from
 * InterviewPrepWidget:
 *   - Input is a single LinkedIn-URL text field, not a job-posting textarea.
 *   - Status payload uses `contactSummary` (name / jobTitle / company /
 *     location) instead of `jobDetails`.
 *   - CompletedCard offers a "Prep for more meetings" CTA pointing at
 *     /onboarding (not "try another posting").
 *   - Surfaces the 429 IP rate-limit response with a clear message.
 *
 * No <Helmet>, no nav, no footer - frame-agnostic. Drop it inside whatever
 * marketing chrome the embedding page already has.
 *
 * NOTE: only render ONE instance of this widget per page. It owns its own
 * polling interval keyed to a single prep_id; multiple instances would
 * race on the status endpoint.
 *
 * House style: no em dashes, no Sparkles icon. Visual tokens are inlined
 * so the widget has no dependency on the seo-preview shared kit.
 */
import { ReactNode, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Bot,
  Coffee,
  Download,
  Linkedin,
  Loader2,
  Lock,
  Target,
  TrendingUp,
  Users,
} from "lucide-react";
import { Link } from "react-router-dom";
import { API_BASE_URL } from "../../services/api";

// ── Visual tokens (inlined so the widget has no shared-kit dependency) ────
const BRAND = "#3B82F6";
const BRAND_DARK = "#2563EB";
const INK = "#0F172A";
const SERIF = "'Libre Baskerville', Georgia, serif";

// ── Types ─────────────────────────────────────────────────────────────────

type Phase = "idle" | "email_gate" | "running" | "completed" | "failed";

interface ContactSummary {
  name?: string;
  jobTitle?: string;
  company?: string;
  location?: string;
}

interface StatusPayload {
  status: string;
  progress: string;
  progressPercent: number;
  currentStep: number;
  totalSteps: number;
  error: string | null;
  pdf_url: string | null;
  contactSummary: ContactSummary | null;
}

export interface MeetingPrepWidgetProps {
  /**
   * Identifier for the page/surface embedding the widget. Stored on the
   * lead_magnet_emails record so we can attribute conversions by page.
   * Examples: "standalone-tools", "mckinsey-coffee-chat", "alumni-goldman".
   */
  source?: string;
  /**
   * Called after a successful /generate kickoff (i.e. the moment we have
   * an email + a prep_id in flight). Use this to fire analytics events.
   */
  onLeadCaptured?: (email: string) => void;
  /**
   * Optional eyebrow / heading / subhead. Pass them on a sandbox or a
   * standalone embed; on the marketing page they live in the page hero,
   * not inside the widget, so leave them undefined.
   */
  eyebrow?: string;
  heading?: string;
  subhead?: string;
  /**
   * Optional preview node. When set AND the widget is idle or in email_gate,
   * renders side-by-side: this node on the left, the form on the right.
   * Once running, completed, or failed, the widget takes the full container
   * width and the example disappears.
   */
  examplePanel?: ReactNode;
}

// ──────────────────────────────────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 2500;
const MAX_CONSECUTIVE_404S = 8; // ~20s of consecutive 404s before bailing
const LINKEDIN_RE = /linkedin\.com\/(in|pub)\/[^/?\s]+/i;

export const MeetingPrepWidget = ({
  source = "embedded",
  onLeadCaptured,
  eyebrow,
  heading,
  subhead,
  examplePanel,
}: MeetingPrepWidgetProps) => {
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [email, setEmail] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pollRef = useRef<number | null>(null);
  const missesRef = useRef<number>(0);

  useEffect(
    () => () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    },
    [],
  );

  const stopPolling = () => {
    if (pollRef.current) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const startPolling = (prepId: string) => {
    missesRef.current = 0;
    const tick = async () => {
      try {
        const res = await fetch(
          `${API_BASE_URL}/tools/meeting-prep/status/${prepId}`,
        );
        if (res.status === 404) {
          missesRef.current += 1;
          if (missesRef.current >= MAX_CONSECUTIVE_404S) {
            stopPolling();
            setStatus((prev) => ({
              ...(prev || ({} as StatusPayload)),
              status: "failed",
              progress: "",
              progressPercent: 0,
              currentStep: 0,
              totalSteps: 5,
              pdf_url: null,
              contactSummary: null,
              error:
                'The session expired or the server restarted while your prep was being built. Click "Try again" to start over.',
            }));
            setPhase("failed");
          }
          return;
        }
        if (!res.ok) throw new Error(`status ${res.status}`);
        missesRef.current = 0;
        const payload = (await res.json()) as StatusPayload;
        setStatus(payload);
        if (payload.status === "completed") {
          setPhase("completed");
          stopPolling();
        } else if (payload.status === "failed") {
          setPhase("failed");
          stopPolling();
        }
      } catch (err) {
        console.error("status poll failed", err);
      }
    };
    void tick();
    pollRef.current = window.setInterval(tick, POLL_INTERVAL_MS);
  };

  // Step 1: validate LinkedIn URL, advance to email gate.
  const onStart = () => {
    setError(null);
    const trimmed = linkedinUrl.trim();
    if (!LINKEDIN_RE.test(trimmed)) {
      setError(
        "Paste a full LinkedIn profile URL, like https://www.linkedin.com/in/jane-doe",
      );
      return;
    }
    setPhase("email_gate");
  };

  // Step 2: validate email, fire /generate, start polling.
  const onSubmit = async () => {
    setError(null);
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !trimmedEmail.includes("@")) {
      setError("Enter a valid email.");
      return;
    }
    const trimmedUrl = linkedinUrl.trim();
    try {
      setPhase("running");
      setStatus({
        status: "queued",
        progress: "Queued...",
        progressPercent: 0,
        currentStep: 0,
        totalSteps: 5,
        error: null,
        pdf_url: null,
        contactSummary: null,
      });

      const res = await fetch(`${API_BASE_URL}/tools/meeting-prep/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          linkedin_url: trimmedUrl,
          email: trimmedEmail,
          source,
        }),
      });

      if (res.status === 429) {
        const body = await res.json().catch(() => ({}));
        setPhase("failed");
        setStatus({
          status: "failed",
          progress: "",
          progressPercent: 0,
          currentStep: 0,
          totalSteps: 5,
          pdf_url: null,
          contactSummary: null,
          error:
            (body && (body as { message?: string }).message) ||
            "You've already generated a free meeting prep from this network in the last 24 hours.",
        });
        return;
      }

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          (body && ((body as { message?: string }).message || (body as { error?: string }).error)) ||
            `Server returned ${res.status}`,
        );
      }

      const { prep_id } = (await res.json()) as { prep_id: string };
      onLeadCaptured?.(trimmedEmail);
      startPolling(prep_id);
    } catch (err) {
      setPhase("failed");
      setStatus({
        status: "failed",
        progress: "",
        progressPercent: 0,
        currentStep: 0,
        totalSteps: 5,
        pdf_url: null,
        contactSummary: null,
        error:
          err instanceof Error
            ? err.message
            : "Something went wrong starting your prep.",
      });
    }
  };

  const onReset = () => {
    stopPolling();
    setPhase("idle");
    setStatus(null);
    setError(null);
  };

  return (
    <div
      style={{
        width: "100%",
        fontFamily: "'DM Sans', system-ui, sans-serif",
        color: INK,
      }}
    >
      {(eyebrow || heading || subhead) && (
        <WidgetHeader eyebrow={eyebrow} heading={heading} subhead={subhead} />
      )}

      {(phase === "idle" || phase === "email_gate") &&
        (examplePanel ? (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(440px, 1fr))",
              gap: 24,
              alignItems: "start",
            }}
          >
            <div>{examplePanel}</div>
            <div>
              {phase === "idle" ? (
                <IdleCard
                  linkedinUrl={linkedinUrl}
                  onChange={setLinkedinUrl}
                  onContinue={onStart}
                  error={error}
                />
              ) : (
                <EmailGateCard
                  email={email}
                  onChange={setEmail}
                  onBack={() => setPhase("idle")}
                  onSubmit={onSubmit}
                  error={error}
                />
              )}
            </div>
          </div>
        ) : phase === "idle" ? (
          <IdleCard
            linkedinUrl={linkedinUrl}
            onChange={setLinkedinUrl}
            onContinue={onStart}
            error={error}
          />
        ) : (
          <EmailGateCard
            email={email}
            onChange={setEmail}
            onBack={() => setPhase("idle")}
            onSubmit={onSubmit}
            error={error}
          />
        ))}
      {phase === "running" && status && <RunningCard status={status} />}
      {phase === "completed" && status && (
        <CompletedCard status={status} onReset={onReset} />
      )}
      {phase === "failed" && status && (
        <FailedCard status={status} onReset={onReset} />
      )}
    </div>
  );
};

export default MeetingPrepWidget;

// ── Optional header (eyebrow / heading / subhead) ─────────────────────────

const WidgetHeader = ({
  eyebrow,
  heading,
  subhead,
}: {
  eyebrow?: string;
  heading?: string;
  subhead?: string;
}) => (
  <header style={{ textAlign: "center", marginBottom: 24 }}>
    {eyebrow ? (
      <span
        style={{
          background: "#EFF5FF",
          border: "1px solid #DBEAFE",
          color: BRAND_DARK,
          fontSize: 12.5,
          fontWeight: 600,
          padding: "5px 12px",
          borderRadius: 999,
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          marginBottom: 14,
        }}
      >
        <Coffee style={{ width: 14, height: 14 }} />
        {eyebrow}
      </span>
    ) : null}
    {heading ? (
      <h2
        style={{
          fontFamily: SERIF,
          fontSize: 32,
          fontWeight: 400,
          color: INK,
          marginBottom: 12,
          letterSpacing: "-0.02em",
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
          color: "#475569",
          maxWidth: 580,
          margin: "0 auto",
        }}
      >
        {subhead}
      </p>
    ) : null}
  </header>
);

// ──────────────────────────────────────────────────────────────────────────
// Idle (paste a LinkedIn URL)
// ──────────────────────────────────────────────────────────────────────────

const IdleCard = ({
  linkedinUrl,
  onChange,
  onContinue,
  error,
}: {
  linkedinUrl: string;
  onChange: (v: string) => void;
  onContinue: () => void;
  error: string | null;
}) => (
  <div
    style={{
      background: "#FFFFFF",
      border: "1px solid #E2E8F0",
      borderRadius: 6,
      padding: 24,
    }}
  >
    <label
      htmlFor="mpw-linkedin-input"
      style={{
        fontSize: 13,
        fontWeight: 600,
        color: INK,
        display: "flex",
        alignItems: "center",
        gap: 8,
        marginBottom: 12,
      }}
    >
      <Linkedin style={{ width: 16, height: 16, color: BRAND }} />
      Paste the LinkedIn URL of who you're meeting
    </label>
    <input
      id="mpw-linkedin-input"
      type="url"
      value={linkedinUrl}
      onChange={(e) => onChange(e.target.value)}
      placeholder="https://www.linkedin.com/in/jane-doe"
      autoComplete="off"
      style={{
        width: "100%",
        padding: "12px",
        border: "1px solid #CBD5E1",
        borderRadius: 4,
        fontSize: 14,
        fontFamily: "inherit",
        outline: "none",
        color: INK,
        boxSizing: "border-box",
      }}
    />
    <p
      style={{
        fontSize: 12,
        color: "#94A3B8",
        marginTop: 8,
        lineHeight: 1.5,
      }}
    >
      Works with any public LinkedIn profile. We do not save the profile data
      and we do not send marketing email. One free prep per IP per day.
    </p>

    {error ? <ErrorBox>{error}</ErrorBox> : null}

    <button
      type="button"
      onClick={onContinue}
      style={{
        marginTop: 20,
        background: BRAND,
        color: "#FFFFFF",
        border: "none",
        borderRadius: 3,
        padding: "12px 20px",
        fontSize: 14,
        fontWeight: 600,
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
      }}
    >
      Generate my prep
      <ArrowRight style={{ width: 16, height: 16 }} />
    </button>

    <div
      style={{
        marginTop: 24,
        paddingTop: 16,
        borderTop: "1px solid #F1F5F9",
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
        gap: 12,
      }}
    >
      <Bullet
        Icon={Users}
        title="Smart questions"
        body="5 categories of questions tied to their actual career moves, not generic prompts."
      />
      <Bullet
        Icon={TrendingUp}
        title="Live research"
        body="Perplexity sweeps the last month of company news, industry shifts, and their public mentions."
      />
      <Bullet
        Icon={Bot}
        title="Source-backed"
        body="Every claim in your PDF traces back to a citation, not an LLM guess."
      />
    </div>
  </div>
);

const Bullet = ({
  Icon,
  title,
  body,
}: {
  Icon: typeof Users;
  title: string;
  body: string;
}) => (
  <div>
    <Icon style={{ width: 16, height: 16, color: BRAND }} />
    <p style={{ fontSize: 13, fontWeight: 700, color: INK, marginTop: 8, marginBottom: 0 }}>
      {title}
    </p>
    <p style={{ fontSize: 12.5, lineHeight: 1.55, color: "#64748B", marginTop: 4, marginBottom: 0 }}>
      {body}
    </p>
  </div>
);

// ──────────────────────────────────────────────────────────────────────────
// Email gate
// ──────────────────────────────────────────────────────────────────────────

const EmailGateCard = ({
  email,
  onChange,
  onBack,
  onSubmit,
  error,
}: {
  email: string;
  onChange: (v: string) => void;
  onBack: () => void;
  onSubmit: () => void;
  error: string | null;
}) => (
  <div
    style={{
      background: "#FFFFFF",
      border: "1px solid #E2E8F0",
      borderRadius: 6,
      padding: 24,
    }}
  >
    <p
      style={{
        fontSize: 12.5,
        fontWeight: 700,
        color: BRAND_DARK,
        letterSpacing: "0.05em",
        marginBottom: 8,
      }}
    >
      ONE LAST STEP
    </p>
    <h3
      style={{
        fontFamily: SERIF,
        fontSize: 24,
        fontWeight: 400,
        color: INK,
        margin: 0,
        marginBottom: 12,
      }}
    >
      Where should we send your prep?
    </h3>
    <p
      style={{
        fontSize: 14,
        color: "#475569",
        lineHeight: 1.6,
        marginTop: 0,
        marginBottom: 16,
        display: "flex",
        alignItems: "center",
        gap: 6,
      }}
    >
      <Lock style={{ width: 14, height: 14, color: "#94A3B8" }} />
      We email you the PDF link plus a single follow-up tip for this contact. No spam.
    </p>

    <input
      type="email"
      value={email}
      onChange={(e) => onChange(e.target.value)}
      placeholder="you@university.edu"
      style={{
        width: "100%",
        padding: 12,
        border: "1px solid #CBD5E1",
        borderRadius: 4,
        fontSize: 14,
        fontFamily: "inherit",
        outline: "none",
        color: INK,
        boxSizing: "border-box",
      }}
    />

    {error ? <ErrorBox>{error}</ErrorBox> : null}

    <div style={{ marginTop: 18, display: "flex", gap: 10 }}>
      <button
        type="button"
        onClick={onBack}
        style={{
          background: "#FFFFFF",
          color: INK,
          border: "1px solid #CBD5E1",
          borderRadius: 3,
          padding: "12px 18px",
          fontSize: 14,
          fontWeight: 500,
          cursor: "pointer",
        }}
      >
        Back
      </button>
      <button
        type="button"
        onClick={onSubmit}
        style={{
          flex: 1,
          background: BRAND,
          color: "#FFFFFF",
          border: "none",
          borderRadius: 3,
          padding: "12px 20px",
          fontSize: 14,
          fontWeight: 600,
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
        }}
      >
        Generate my prep
        <ArrowRight style={{ width: 16, height: 16 }} />
      </button>
    </div>
  </div>
);

// ──────────────────────────────────────────────────────────────────────────
// Running (progress bar)
// ──────────────────────────────────────────────────────────────────────────

const RunningCard = ({ status }: { status: StatusPayload }) => (
  <div
    style={{
      background: "#FFFFFF",
      border: "1px solid #E2E8F0",
      borderRadius: 6,
      padding: 28,
    }}
  >
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        marginBottom: 16,
      }}
    >
      <Loader2
        style={{
          width: 20,
          height: 20,
          color: BRAND,
          animation: "mpw-spin 1s linear infinite",
        }}
      />
      <p style={{ fontSize: 15, fontWeight: 600, color: INK, margin: 0 }}>
        {status.progress || "Working..."}
      </p>
    </div>
    <div
      style={{
        height: 8,
        background: "#F1F5F9",
        borderRadius: 999,
        overflow: "hidden",
        marginBottom: 14,
      }}
    >
      <div
        style={{
          height: "100%",
          width: `${Math.max(4, status.progressPercent || 0)}%`,
          background: BRAND,
          transition: "width 0.6s ease",
        }}
      />
    </div>
    <p style={{ fontSize: 12.5, color: "#64748B", margin: 0 }}>
      Step {status.currentStep || 1} of {status.totalSteps || 5} · usually 60 to 90 seconds.
    </p>

    {status.contactSummary?.name ? (
      <div
        style={{
          marginTop: 20,
          background: "#F8FAFC",
          border: "1px solid #E2E8F0",
          borderRadius: 4,
          padding: "12px 14px",
        }}
      >
        <p style={{ fontSize: 12, color: "#94A3B8", margin: 0, marginBottom: 2 }}>
          Detected contact
        </p>
        <p style={{ fontSize: 14, fontWeight: 600, color: INK, margin: 0, textTransform: "capitalize" }}>
          {status.contactSummary.name}
          {status.contactSummary.jobTitle ? (
            <>
              {" "}
              <span style={{ color: "#94A3B8", fontWeight: 400, textTransform: "none" }}>
                ·
              </span>{" "}
              {status.contactSummary.jobTitle}
            </>
          ) : null}
          {status.contactSummary.company ? (
            <>
              {" "}
              <span style={{ color: "#94A3B8", fontWeight: 400, textTransform: "none" }}>
                at
              </span>{" "}
              {status.contactSummary.company}
            </>
          ) : null}
        </p>
      </div>
    ) : null}

    <style>
      {`@keyframes mpw-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}
    </style>
  </div>
);

// ──────────────────────────────────────────────────────────────────────────
// Completed
// ──────────────────────────────────────────────────────────────────────────

const CompletedCard = ({
  status,
  onReset,
}: {
  status: StatusPayload;
  onReset: () => void;
}) => {
  const downloadUrl = status.pdf_url || "";
  const c = status.contactSummary;
  return (
    <div
      style={{
        background: "#FFFFFF",
        border: "1px solid #E2E8F0",
        borderRadius: 6,
        padding: 28,
      }}
    >
      <p
        style={{
          fontSize: 12.5,
          fontWeight: 700,
          color: BRAND_DARK,
          letterSpacing: "0.05em",
          margin: 0,
          marginBottom: 8,
        }}
      >
        READY
      </p>
      <h2
        style={{
          fontFamily: SERIF,
          fontSize: 26,
          fontWeight: 400,
          color: INK,
          margin: 0,
          marginBottom: 6,
        }}
      >
        Your prep doc is ready
      </h2>
      {c?.name ? (
        <p
          style={{
            fontSize: 14,
            color: "#475569",
            marginTop: 0,
            marginBottom: 18,
            textTransform: "capitalize",
          }}
        >
          {c.name}
          {c.jobTitle ? (
            <span style={{ textTransform: "none" }}>, {c.jobTitle}</span>
          ) : null}
          {c.company ? (
            <span style={{ textTransform: "none" }}> at {c.company}</span>
          ) : null}
        </p>
      ) : (
        <div style={{ height: 12 }} />
      )}

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <a
          href={downloadUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            background: BRAND,
            color: "#FFFFFF",
            padding: "12px 20px",
            borderRadius: 3,
            fontSize: 14,
            fontWeight: 600,
            textDecoration: "none",
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <Download style={{ width: 16, height: 16 }} />
          Download PDF
        </a>
        <Link
          to="/onboarding"
          style={{
            background: "#FFFFFF",
            color: BRAND_DARK,
            border: `1px solid ${BRAND}`,
            padding: "12px 18px",
            borderRadius: 3,
            fontSize: 14,
            fontWeight: 600,
            textDecoration: "none",
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          Prep for more meetings
          <ArrowRight style={{ width: 16, height: 16 }} />
        </Link>
        <button
          type="button"
          onClick={onReset}
          style={{
            background: "#FFFFFF",
            color: INK,
            border: "1px solid #CBD5E1",
            borderRadius: 3,
            padding: "12px 16px",
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Try another contact
        </button>
      </div>

      <div
        style={{
          marginTop: 20,
          background: "#EFF6FF",
          border: `1px solid #DBEAFE`,
          borderRadius: 4,
          padding: "12px 14px",
        }}
      >
        <p style={{ fontSize: 12.5, fontWeight: 700, color: BRAND_DARK, margin: 0, marginBottom: 4, letterSpacing: "0.04em" }}>
          THE PERSONALIZED VERSION ADDS
        </p>
        <p style={{ fontSize: 13, color: "#334155", lineHeight: 1.55, margin: 0 }}>
          Common Ground match between your background and theirs, a Secret Weapon
          hook unique to your resume, and a tailored conversation strategy. Free
          account, no credit card.
        </p>
      </div>
    </div>
  );
};

// ──────────────────────────────────────────────────────────────────────────
// Failed
// ──────────────────────────────────────────────────────────────────────────

const FailedCard = ({
  status,
  onReset,
}: {
  status: StatusPayload;
  onReset: () => void;
}) => (
  <div
    style={{
      background: "#FEF2F2",
      border: "1px solid #FECACA",
      borderRadius: 6,
      padding: 24,
    }}
  >
    <p
      style={{
        fontSize: 13,
        fontWeight: 700,
        color: "#991B1B",
        margin: 0,
        marginBottom: 6,
      }}
    >
      We couldn't finish your prep
    </p>
    <p
      style={{
        fontSize: 14,
        color: "#7F1D1D",
        lineHeight: 1.6,
        marginTop: 0,
        marginBottom: 14,
      }}
    >
      {status.error || "Something went wrong. Try a different LinkedIn profile."}
    </p>
    <button
      type="button"
      onClick={onReset}
      style={{
        background: BRAND,
        color: "#FFFFFF",
        border: "none",
        borderRadius: 3,
        padding: "10px 18px",
        fontSize: 14,
        fontWeight: 600,
        cursor: "pointer",
      }}
    >
      Try again
    </button>
  </div>
);

// ──────────────────────────────────────────────────────────────────────────
// Small shared bits
// ──────────────────────────────────────────────────────────────────────────

const ErrorBox = ({ children }: { children: React.ReactNode }) => (
  <div
    style={{
      background: "#FEF2F2",
      border: "1px solid #FECACA",
      color: "#991B1B",
      fontSize: 13,
      padding: "10px 12px",
      borderRadius: 4,
      marginTop: 14,
    }}
  >
    {children}
  </div>
);

// Keep Target imported so the icon is tree-shakeable but available if a
// consumer wants to extend the widget header.
void Target;
