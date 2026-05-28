/*
 * FindCompaniesWidget - self-contained, embeddable lead-magnet widget
 * that turns an uploaded resume into 5 matched company recommendations.
 *
 *   <FindCompaniesWidget source="goldman-deep-dive-page" />
 *
 * `source` is sent to /api/tools/find-companies/search and written to the
 * lead_magnet_emails Firestore doc so leads can be attributed to the SEO
 * surface they came from.
 *
 * No <Helmet>, no nav, no footer - frame-agnostic. Results grid uses
 * auto-fit so it stacks to single column at narrow widths.
 *
 * House style: no em dashes, no Sparkles icon.
 */
import { ChangeEvent, DragEvent, ReactNode, useRef, useState } from "react";
import {
  Briefcase,
  Building2,
  CheckCircle,
  Download,
  ExternalLink,
  FileText,
  Loader2,
  Lock,
  Search,
  Upload,
  X,
} from "lucide-react";
import { API_BASE_URL } from "../../services/api";

// ── Visual tokens (inlined, no shared-kit dependency) ───────────────────
const BRAND = "#3B82F6";
const BRAND_DARK = "#2563EB";
const INK = "#0F172A";
const SERIF = "'Libre Baskerville', Georgia, serif";

const MAX_FILE_MB = 10;

// ── Types ───────────────────────────────────────────────────────────────

export type Phase = "idle" | "email_gate" | "running" | "results" | "failed";

export interface Recommendation {
  name: string;
  industry: string;
  why_match: string;
  key_roles: string[];
  link: string | null;
}

export interface SearchResponse {
  recommendations: Recommendation[];
  request_id: string;
}

export interface FindCompaniesWidgetProps {
  source?: string;
  onLeadCaptured?: (email: string) => void;
  eyebrow?: string;
  heading?: string;
  subhead?: string;
  /**
   * Optional example panel. When present AND the widget is in an idle-like
   * phase, renders side-by-side: panel on the left, form on the right. Once
   * the user submits, the widget claims full width.
   */
  examplePanel?: ReactNode;
}

// ────────────────────────────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────────────────────────────

export const FindCompaniesWidget = ({
  source = "embedded",
  onLeadCaptured,
  eyebrow = "FREE COMPANY MATCHER",
  heading = "Find 5 companies that fit you.",
  subhead = "Describe what you're looking for, upload your resume, or both. We surface 5 companies with the entry-level roles to target. No account needed.",
  examplePanel,
}: FindCompaniesWidgetProps) => {
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [prompt, setPrompt] = useState("");
  const [email, setEmail] = useState("");

  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SearchResponse | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── File handling ────────────────────────────────────────────────────

  const onPickFile = (file: File | undefined) => {
    if (!file) return;
    const ext = file.name.toLowerCase().split(".").pop() || "";
    const okType = file.type === "application/pdf" || ext === "pdf";
    if (!okType) {
      setError("Please upload a PDF resume.");
      return;
    }
    if (file.size > MAX_FILE_MB * 1024 * 1024) {
      setError(`Resume must be ${MAX_FILE_MB} MB or smaller.`);
      return;
    }
    setError(null);
    setResumeFile(file);
  };

  const onFileInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    onPickFile(e.target.files?.[0] || undefined);
  };

  const onFileDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    onPickFile(e.dataTransfer.files?.[0] || undefined);
  };

  // ── Submit flow ──────────────────────────────────────────────────────

  const onStart = () => {
    setError(null);
    if (!resumeFile && !prompt.trim()) {
      setError("Describe what you're looking for or upload your resume.");
      return;
    }
    setPhase("email_gate");
  };

  const submitSearch = async (submittedEmail: string) => {
    if (!resumeFile && !prompt.trim()) return null;
    const form = new FormData();
    if (resumeFile) form.append("resume_pdf", resumeFile);
    if (prompt.trim()) form.append("prompt", prompt.trim());
    form.append("email", submittedEmail);
    form.append("source", source);

    const res = await fetch(`${API_BASE_URL}/tools/find-companies/search`, {
      method: "POST",
      body: form,
    });
    const data = await res.json().catch(() => ({} as Record<string, unknown>));
    if (!res.ok) {
      const msg =
        (data && (data.message as string)) ||
        (data && (data.error as string)) ||
        `Request failed (${res.status})`;
      throw new Error(msg);
    }
    return data as SearchResponse;
  };

  const onSubmitEmail = async () => {
    setError(null);
    const trimmed = email.trim();
    if (!trimmed || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(trimmed)) {
      setError("Enter a valid email.");
      return;
    }
    if (!resumeFile && !prompt.trim()) return;
    setPhase("running");
    try {
      const data = await submitSearch(trimmed);
      if (!data) throw new Error("No response from server.");
      setResult(data);
      setPhase("results");
      onLeadCaptured?.(trimmed);
    } catch (e: any) {
      setError(e?.message || "Something went wrong. Try again.");
      setPhase("failed");
    }
  };

  // ── CSV download ─────────────────────────────────────────────────────

  const onDownloadCsv = () => {
    if (!result?.recommendations?.length) return;
    const rows = [
      ["Company", "Industry", "Why it's a match", "Key roles", "Link"],
      ...result.recommendations.map((r) => [
        r.name,
        r.industry,
        r.why_match,
        (r.key_roles || []).join("; "),
        safeUrl(r.link) || "",
      ]),
    ];
    const csv = rows
      .map((row) =>
        row
          .map((cell) => {
            let v = String(cell ?? "");
            // CSV formula-injection mitigation: cells starting with =, +, -,
            // @, \t, or \r execute as formulas in Excel / Sheets / Numbers.
            // Prefix a single quote so the cell renders as plain text.
            if (/^[=+\-@\t\r]/.test(v)) {
              v = "'" + v;
            }
            // RFC 4180: wrap in quotes, escape quotes by doubling.
            return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
          })
          .join(",")
      )
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "offerloop-company-matches.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  // ── Render ───────────────────────────────────────────────────────────

  const isIdleLike =
    phase === "idle" || phase === "email_gate" || phase === "failed";

  const idleCard = (
    <IdleCard
      phase={phase}
      resumeFile={resumeFile}
      prompt={prompt}
      email={email}
      error={error}
      eyebrow={eyebrow}
      heading={heading}
      subhead={subhead}
      fileInputRef={fileInputRef}
      onFileInputChange={onFileInputChange}
      onFileDrop={onFileDrop}
      onClearFile={() => setResumeFile(null)}
      setPrompt={setPrompt}
      setEmail={setEmail}
      onStart={onStart}
      onSubmit={onSubmitEmail}
      onBack={() => setPhase("idle")}
    />
  );

  return (
    <div style={{ width: "100%", color: INK }}>
      {isIdleLike ? (
        examplePanel ? (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(440px, 1fr))",
              gap: 24,
              alignItems: "start",
            }}
          >
            <div>{examplePanel}</div>
            <div>{idleCard}</div>
          </div>
        ) : (
          idleCard
        )
      ) : null}

      {phase === "running" ? <RunningCard hasResume={!!resumeFile} /> : null}

      {phase === "results" && result ? (
        <ResultsLayout
          result={result}
          onDownloadCsv={onDownloadCsv}
          error={error}
        />
      ) : null}

      {/* Spin keyframes shared by Loader2 instances. */}
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};

export default FindCompaniesWidget;

// ────────────────────────────────────────────────────────────────────────
// Idle / email gate
// ────────────────────────────────────────────────────────────────────────

const IdleCard = ({
  phase,
  resumeFile,
  prompt,
  email,
  error,
  eyebrow,
  heading,
  subhead,
  fileInputRef,
  onFileInputChange,
  onFileDrop,
  onClearFile,
  setPrompt,
  setEmail,
  onStart,
  onSubmit,
  onBack,
}: {
  phase: Phase;
  resumeFile: File | null;
  prompt: string;
  email: string;
  error: string | null;
  eyebrow: string;
  heading: string;
  subhead: string;
  fileInputRef: React.RefObject<HTMLInputElement>;
  onFileInputChange: (e: ChangeEvent<HTMLInputElement>) => void;
  onFileDrop: (e: DragEvent<HTMLDivElement>) => void;
  onClearFile: () => void;
  setPrompt: (v: string) => void;
  setEmail: (v: string) => void;
  onStart: () => void;
  onSubmit: () => void;
  onBack: () => void;
}) => (
  <div>
    {eyebrow || heading || subhead ? (
      <header style={{ textAlign: "center", marginBottom: 28 }}>
        {eyebrow ? (
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: BRAND,
              letterSpacing: "0.06em",
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
              maxWidth: 560,
              margin: "0 auto",
            }}
          >
            {subhead}
          </p>
        ) : null}
      </header>
    ) : null}

    <div style={cardShell}>
      {/* Step 1: resume (optional) */}
      <Label num={1} text="Upload your resume" optional />
      {resumeFile ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            padding: "12px 14px",
            background: "#F0F7FF",
            border: `1px solid ${BRAND}`,
            borderRadius: 10,
            marginBottom: 24,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, color: BRAND_DARK }}>
            <FileText size={20} />
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{resumeFile.name}</div>
              <div style={{ fontSize: 12, color: "#64748B" }}>
                {Math.round(resumeFile.size / 1024)} KB
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClearFile}
            aria-label="Remove file"
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              color: "#64748B",
              padding: 4,
            }}
          >
            <X size={16} />
          </button>
        </div>
      ) : (
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={onFileDrop}
          onClick={() => fileInputRef.current?.click()}
          style={{
            border: "2px dashed #CBD5E1",
            borderRadius: 10,
            padding: 28,
            textAlign: "center",
            cursor: "pointer",
            background: "#F8FAFC",
            marginBottom: 24,
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,application/pdf"
            style={{ display: "none" }}
            onChange={onFileInputChange}
          />
          <Upload size={22} style={{ color: BRAND, marginBottom: 6 }} />
          <div style={{ fontWeight: 500, color: INK, marginBottom: 4 }}>
            Drop a PDF here, or click to browse
          </div>
          <div style={{ fontSize: 13, color: "#64748B" }}>
            {MAX_FILE_MB} MB max. Text-based PDFs only.
          </div>
        </div>
      )}

      {/* Step 2: prompt (optional) */}
      <div style={{ marginTop: 4, marginBottom: 24 }}>
        <Label num={2} text="Tell us what kind of company you want" optional />
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={
            "e.g. early-stage AI startups in SF that hire new grad engineers\n" +
            "or:  bulge bracket banks recruiting on the West Coast\n" +
            "or:  MBB consulting firms with strong healthcare practices"
          }
          rows={4}
          style={{
            width: "100%",
            padding: 12,
            border: "1px solid #CBD5E1",
            borderRadius: 8,
            fontSize: 14,
            fontFamily: "inherit",
            resize: "vertical",
            boxSizing: "border-box",
          }}
        />
        <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 6 }}>
          The more specific, the better. Industry, stage, geography, size, the role you want.
        </div>
      </div>

      {/* Step 3: email gate OR start */}
      {phase === "email_gate" ? (
        <>
          <Label num={3} text="Your email" />
          <div
            style={{
              fontSize: 13,
              color: "#64748B",
              marginBottom: 10,
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Lock size={14} />
            We use this to send your matches and rate-limit the tool. No spam.
          </div>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@university.edu"
            style={{ ...textInput, marginBottom: 16 }}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") onSubmit();
            }}
          />
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={onBack} style={ghostBtn} type="button">
              Back
            </button>
            <button
              onClick={onSubmit}
              style={{
                ...primaryBtn,
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
              }}
              type="button"
            >
              <Search size={16} />
              Find my 5 matches
            </button>
          </div>
        </>
      ) : (
        <button
          onClick={onStart}
          style={{
            ...primaryBtn,
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
          }}
          type="button"
        >
          <Search size={16} />
          Find my 5 matches
        </button>
      )}

      {error ? <div style={errorBox}>{error}</div> : null}
    </div>
  </div>
);

// ────────────────────────────────────────────────────────────────────────
// Running
// ────────────────────────────────────────────────────────────────────────

const RunningCard = ({ hasResume }: { hasResume: boolean }) => (
  <div style={{ ...cardShell, textAlign: "center", padding: 64 }}>
    <Loader2
      size={32}
      style={{ color: BRAND, animation: "spin 1s linear infinite", marginBottom: 18 }}
    />
    <h3
      style={{
        fontFamily: SERIF,
        fontSize: 22,
        fontWeight: 400,
        color: INK,
        marginBottom: 8,
      }}
    >
      {hasResume ? "Reading your resume..." : "Matching companies..."}
    </h3>
    <p
      style={{
        color: "#64748B",
        fontSize: 14,
        margin: 0,
        maxWidth: 480,
        marginLeft: "auto",
        marginRight: "auto",
      }}
    >
      {hasResume
        ? "Parsing your background, then matching it against companies that hire your profile. Usually 15 to 25 seconds."
        : "Finding 5 companies that fit your prompt. Usually 10 to 20 seconds."}
    </p>
  </div>
);

// ────────────────────────────────────────────────────────────────────────
// Results
// ────────────────────────────────────────────────────────────────────────

const ResultsLayout = ({
  result,
  onDownloadCsv,
  error,
}: {
  result: SearchResponse;
  onDownloadCsv: () => void;
  error: string | null;
}) => (
  <div>
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 20,
        flexWrap: "wrap",
        gap: 16,
      }}
    >
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: BRAND, letterSpacing: "0.06em" }}>
          READY
        </div>
        <h3
          style={{
            fontFamily: SERIF,
            fontSize: 28,
            fontWeight: 400,
            color: INK,
            margin: "4px 0 0 0",
          }}
        >
          Your 5 company matches
        </h3>
        <div style={{ fontSize: 13, color: "#64748B", marginTop: 4 }}>
          Ranked by fit. Each match is grounded in something specific from your resume.
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          onClick={onDownloadCsv}
          style={{
            ...primaryBtn,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
          type="button"
        >
          <Download size={16} />
          Download as CSV
        </button>
      </div>
    </div>

    {error ? <div style={errorBox}>{error}</div> : null}

    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
        gap: 16,
        alignItems: "stretch",
      }}
    >
      {result.recommendations.map((rec, idx) => (
        <CompanyCard key={`${rec.name}-${idx}`} rec={rec} rank={idx + 1} />
      ))}
    </div>

    <UpgradeCallout />
  </div>
);

const CompanyCard = ({ rec, rank }: { rec: Recommendation; rank: number }) => (
  <div
    style={{
      ...cardShell,
      display: "flex",
      flexDirection: "column",
      gap: 12,
      padding: 20,
    }}
  >
    <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: "50%",
          background: "#EFF5FF",
          color: BRAND_DARK,
          fontWeight: 700,
          fontSize: 13,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {rank}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          <Building2 size={16} style={{ color: BRAND, flexShrink: 0 }} />
          <h4
            style={{
              fontFamily: SERIF,
              fontSize: 19,
              fontWeight: 400,
              color: INK,
              margin: 0,
              letterSpacing: "-0.01em",
            }}
          >
            {rec.name}
          </h4>
        </div>
        <div
          style={{
            fontSize: 12,
            color: BRAND_DARK,
            fontWeight: 600,
            background: "#EFF5FF",
            display: "inline-block",
            padding: "2px 8px",
            borderRadius: 999,
            marginTop: 6,
          }}
        >
          {rec.industry}
        </div>
      </div>
    </div>

    <p
      style={{
        fontSize: 13.5,
        lineHeight: 1.6,
        color: "#475569",
        margin: 0,
      }}
    >
      {rec.why_match}
    </p>

    {rec.key_roles && rec.key_roles.length > 0 ? (
      <div>
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: "#64748B",
            letterSpacing: "0.05em",
            marginBottom: 6,
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <Briefcase size={12} />
          ROLES THEY HIRE
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {rec.key_roles.map((role) => (
            <span
              key={role}
              style={{
                fontSize: 12,
                fontWeight: 500,
                color: INK,
                background: "#F1F5F9",
                padding: "3px 9px",
                borderRadius: 6,
              }}
            >
              {role}
            </span>
          ))}
        </div>
      </div>
    ) : null}

    {safeUrl(rec.link) ? (
      <a
        href={safeUrl(rec.link)!}
        target="_blank"
        rel="noopener noreferrer nofollow ugc"
        style={{
          marginTop: "auto",
          fontSize: 13,
          fontWeight: 600,
          color: BRAND_DARK,
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          textDecoration: "none",
        }}
      >
        Visit careers page
        <ExternalLink size={12} />
      </a>
    ) : null}
  </div>
);

// ── Security helpers ─────────────────────────────────────────────────────
//
// safeUrl: defense in depth. The backend already rejects non-http(s) URLs
// in finder._safe_http_url, but the model is the source of `rec.link`, so
// we re-validate at the render boundary. Returns null for anything other
// than http(s) with a non-empty host, anything containing whitespace or
// embedded credentials, or anything over 500 chars.
const safeUrl = (raw: string | null | undefined): string | null => {
  if (!raw) return null;
  const candidate = String(raw).trim();
  if (!candidate || candidate.length > 500) return null;
  // URL parser will accept javascript: / data: / vbscript:; we whitelist scheme.
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  if (!parsed.host) return null;
  if (/\s/.test(candidate)) return null;
  if (parsed.username || parsed.password) return null;
  return parsed.toString();
};

const UpgradeCallout = () => (
  <div
    style={{
      marginTop: 28,
      padding: 22,
      border: `1px solid ${BRAND}`,
      background: "#F0F7FF",
      borderRadius: 12,
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      flexWrap: "wrap",
      gap: 16,
    }}
  >
    <div style={{ maxWidth: 480 }}>
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: BRAND,
          letterSpacing: "0.06em",
          marginBottom: 6,
        }}
      >
        NEXT STEP
      </div>
      <h4
        style={{
          fontFamily: SERIF,
          fontSize: 20,
          fontWeight: 400,
          color: INK,
          margin: "0 0 6px 0",
        }}
      >
        Discover more opportunities
      </h4>
      <p style={{ fontSize: 13.5, color: "#475569", margin: 0, lineHeight: 1.55 }}>
        Get verified alumni contacts inside these companies, drafted cold
        emails, and a tracker that moves them down the pipeline. Free to start.
      </p>
    </div>
    <a
      href="/onboarding"
      style={{
        ...primaryBtn,
        textDecoration: "none",
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
      }}
    >
      <CheckCircle size={16} />
      Discover more opportunities
    </a>
  </div>
);

// ── Style tokens ─────────────────────────────────────────────────────────

const cardShell: React.CSSProperties = {
  background: "#FFF",
  border: "1px solid #E2E8F0",
  borderRadius: 14,
  padding: 22,
  boxShadow: "0 1px 2px rgba(15,23,42,0.04)",
  boxSizing: "border-box",
};

const textInput: React.CSSProperties = {
  width: "100%",
  padding: 12,
  border: "1px solid #CBD5E1",
  borderRadius: 8,
  fontSize: 14,
  fontFamily: "inherit",
  boxSizing: "border-box",
};

const primaryBtn: React.CSSProperties = {
  background: BRAND,
  color: "#FFF",
  border: "none",
  borderRadius: 8,
  padding: "12px 18px",
  fontSize: 15,
  fontWeight: 600,
  cursor: "pointer",
};

const ghostBtn: React.CSSProperties = {
  background: "#FFF",
  color: INK,
  border: "1px solid #CBD5E1",
  borderRadius: 8,
  padding: "12px 18px",
  fontSize: 14,
  fontWeight: 500,
  cursor: "pointer",
};

const errorBox: React.CSSProperties = {
  marginTop: 16,
  padding: 12,
  background: "#FEF2F2",
  border: "1px solid #FECACA",
  borderRadius: 8,
  color: "#991B1B",
  fontSize: 14,
};

const Label = ({
  num,
  text,
  optional,
}: {
  num: number;
  text: string;
  optional?: boolean;
}) => (
  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
    <span
      style={{
        width: 22,
        height: 22,
        borderRadius: "50%",
        background: BRAND,
        color: "#FFF",
        fontSize: 12,
        fontWeight: 700,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {num}
    </span>
    <span style={{ fontWeight: 600, fontSize: 14, color: INK }}>{text}</span>
    {optional ? (
      <span
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: "#64748B",
          background: "#F1F5F9",
          padding: "2px 8px",
          borderRadius: 999,
          letterSpacing: "0.02em",
        }}
      >
        OPTIONAL
      </span>
    ) : null}
  </div>
);
