/*
 * FindJobsWidget - self-contained, embeddable React component for the free
 * job-recommendation lead magnet. Drop it into any page:
 *
 *   <FindJobsWidget source="goldman-deep-dive-page" />
 *
 * The `source` prop is sent to /api/tools/find-jobs/search and written into
 * the lead_magnet_emails Firestore doc so you can attribute leads to the
 * SEO page they came from.
 *
 * No <Helmet>, no nav, no footer - frame-agnostic. Results render as a
 * stack of job cards.
 *
 * House style: no em dashes, no Sparkles icon.
 */
import { ReactNode, useRef, useState } from "react";
import {
  Building2,
  CheckCircle2,
  Download,
  ExternalLink,
  FileText,
  Loader2,
  Lock,
  MapPin,
  Search,
  Sparkles,
  Upload,
} from "lucide-react";
import { Link } from "react-router-dom";
import { API_BASE_URL } from "../../services/api";

// ── Visual tokens (inlined so the widget has no shared-kit dependency) ────
const BRAND = "#3B82F6";
const BRAND_DARK = "#2563EB";
const INK = "#0F172A";
const SERIF = "'Libre Baskerville', Georgia, serif";

// ── Types ─────────────────────────────────────────────────────────────────

export type Phase = "idle" | "email_gate" | "running" | "results" | "failed";

export interface RecommendedJob {
  id: string;
  title: string;
  company: string;
  location: string;
  url: string;
  summary: string;
  requirements: string[];
  why_match: string;
  matched_skills: string[];
  match_score: number;
}

export interface ProfileSummary {
  name?: string;
  school?: string;
  major?: string;
  graduation_year?: string;
  top_skills?: string[];
}

export interface SearchResponse {
  search_id: string;
  jobs: RecommendedJob[];
  profile_summary: ProfileSummary;
  total_candidates?: number;
  queries_used?: string[];
  warning?: string;
}

export interface FindJobsWidgetProps {
  source?: string;
  onLeadCaptured?: (email: string) => void;
  eyebrow?: string;
  heading?: string;
  subhead?: string;
  /**
   * Optional preview node. When set AND the widget is idle/email_gate/failed,
   * renders side-by-side: this node on the left, the form on the right. Once
   * running or results, the widget takes the full container width.
   */
  examplePanel?: ReactNode;
}

// ──────────────────────────────────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────────────────────────────────

export const FindJobsWidget = ({
  source = "embedded",
  onLeadCaptured,
  eyebrow = "FREE JOB MATCHING",
  heading = "Get 5 jobs paired to you in under a minute.",
  subhead = "Describe the role you want, drop your resume, or both. We search live postings and hand you the 5 that fit best, with application links. No account needed.",
  examplePanel,
}: FindJobsWidgetProps) => {
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [jobQuery, setJobQuery] = useState("");
  const [email, setEmail] = useState("");

  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SearchResponse | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const onPickFile = (file: File | undefined) => {
    if (!file) return;
    const ext = file.name.toLowerCase().split(".").pop() || "";
    if (file.type !== "application/pdf" && ext !== "pdf") {
      setError("Please upload a PDF resume.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("Resume must be 10MB or smaller.");
      return;
    }
    setError(null);
    setResumeFile(file);
  };

  const onStart = () => {
    setError(null);
    if (!resumeFile && !jobQuery.trim()) {
      setError("Upload your resume, describe the role you want, or both.");
      return;
    }
    setPhase("email_gate");
  };

  const submitSearch = async (): Promise<SearchResponse> => {
    if (!resumeFile && !jobQuery.trim()) {
      throw new Error("Upload your resume or describe the role you want.");
    }
    const form = new FormData();
    if (resumeFile) form.append("resume_pdf", resumeFile);
    if (jobQuery.trim()) form.append("job_query", jobQuery.trim());
    form.append("email", email.trim());
    form.append("source", source);

    const res = await fetch(`${API_BASE_URL}/tools/find-jobs/search`, {
      method: "POST",
      body: form,
    });
    const data = await res.json();
    if (!res.ok) {
      const msg = data?.message || data?.error || `Request failed (${res.status})`;
      throw new Error(msg);
    }
    return data as SearchResponse;
  };

  const onSubmitEmail = async () => {
    setError(null);
    if (!email.trim() || !email.includes("@")) {
      setError("Enter a valid email.");
      return;
    }
    if (!resumeFile && !jobQuery.trim()) return;
    setPhase("running");
    try {
      const data = await submitSearch();
      setResult(data);
      setPhase("results");
      onLeadCaptured?.(email.trim());
    } catch (e: any) {
      setError(e?.message || "Something went wrong. Try again.");
      setPhase("failed");
    }
  };

  const onDownloadCsv = () => {
    if (!result?.jobs?.length) return;
    const rows = [
      ["Match score", "Title", "Company", "Location", "Why it matches", "Apply URL"],
      ...result.jobs.map((j) => [
        String(j.match_score),
        j.title,
        j.company,
        j.location,
        j.why_match,
        j.url,
      ]),
    ];
    const csv = rows
      .map((r) =>
        r
          .map((cell) => {
            const v = (cell ?? "").toString().replace(/\r?\n/g, " ").trim();
            if (/[",]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
            return v;
          })
          .join(","),
      )
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "offerloop-recommended-jobs.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
  };

  // ── Render ────────────────────────────────────────────────────────────

  const isIdleLike =
    phase === "idle" || phase === "email_gate" || phase === "failed";

  const idleCard = (
    <IdleCard
      phase={phase}
      resumeFile={resumeFile}
      jobQuery={jobQuery}
      email={email}
      error={error}
      eyebrow={eyebrow}
      heading={heading}
      subhead={subhead}
      fileInputRef={fileInputRef}
      onPickFile={onPickFile}
      setJobQuery={setJobQuery}
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

      {phase === "running" ? <RunningCard /> : null}

      {phase === "results" && result ? (
        <ResultsLayout
          result={result}
          onDownloadCsv={onDownloadCsv}
        />
      ) : null}
    </div>
  );
};

export default FindJobsWidget;

// ──────────────────────────────────────────────────────────────────────────
// Idle / email gate
// ──────────────────────────────────────────────────────────────────────────

const IdleCard = ({
  phase,
  resumeFile,
  jobQuery,
  email,
  error,
  eyebrow,
  heading,
  subhead,
  fileInputRef,
  onPickFile,
  setJobQuery,
  setEmail,
  onStart,
  onSubmit,
  onBack,
}: {
  phase: Phase;
  resumeFile: File | null;
  jobQuery: string;
  email: string;
  error: string | null;
  eyebrow: string;
  heading: string;
  subhead: string;
  fileInputRef: React.RefObject<HTMLInputElement>;
  onPickFile: (f: File | undefined) => void;
  setJobQuery: (v: string) => void;
  setEmail: (v: string) => void;
  onStart: () => void;
  onSubmit: () => void;
  onBack: () => void;
}) => (
  <div>
    {eyebrow || heading || subhead ? (
      <header style={{ textAlign: "center", marginBottom: 28 }}>
        {eyebrow ? (
          <div style={{ fontSize: 12, fontWeight: 700, color: BRAND, letterSpacing: "0.06em", marginBottom: 12 }}>
            {eyebrow}
          </div>
        ) : null}
        {heading ? (
          <h2 style={{ fontFamily: SERIF, fontSize: 32, fontWeight: 400, color: INK, marginBottom: 12, letterSpacing: "-0.02em", lineHeight: 1.2 }}>
            {heading}
          </h2>
        ) : null}
        {subhead ? (
          <p style={{ fontSize: 15, lineHeight: 1.6, color: "#475569", maxWidth: 560, margin: "0 auto" }}>
            {subhead}
          </p>
        ) : null}
      </header>
    ) : null}

    <div style={cardShell}>
      {/* Step 1: describe the role (or skip) */}
      <Label num={1} text="What kind of role are you looking for?" optional />
      <textarea
        value={jobQuery}
        onChange={(e) => setJobQuery(e.target.value)}
        placeholder={"e.g. Investment banking analyst internship at Goldman or JPMorgan\nor: Software engineering internship in NYC\nor: Marketing role at a consumer startup"}
        rows={3}
        maxLength={500}
        style={{
          width: "100%",
          padding: 12,
          border: "1px solid #CBD5E1",
          borderRadius: 8,
          fontSize: 14,
          fontFamily: "inherit",
          marginBottom: 22,
          resize: "vertical",
          boxSizing: "border-box",
        }}
      />

      {/* Step 2: resume (also optional, but at least one is required) */}
      <Label num={2} text="Upload your resume (PDF)" optional />
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          onPickFile(e.dataTransfer.files?.[0]);
        }}
        onClick={() => fileInputRef.current?.click()}
        style={{
          border: `2px dashed ${resumeFile ? BRAND : "#CBD5E1"}`,
          borderRadius: 10,
          padding: 28,
          textAlign: "center",
          cursor: "pointer",
          background: resumeFile ? "#F0F7FF" : "#F8FAFC",
          marginBottom: 8,
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,application/pdf"
          style={{ display: "none" }}
          onChange={(e) => onPickFile(e.target.files?.[0] || undefined)}
        />
        {resumeFile ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, color: BRAND_DARK }}>
            <FileText size={20} />
            <span style={{ fontWeight: 600 }}>{resumeFile.name}</span>
            <span style={{ fontSize: 13, color: "#64748B" }}>({Math.round(resumeFile.size / 1024)} KB)</span>
          </div>
        ) : (
          <div style={{ color: "#64748B" }}>
            <Upload size={22} style={{ marginBottom: 6 }} />
            <div style={{ fontWeight: 500, color: INK, marginBottom: 4 }}>Drop your PDF here, or click to browse</div>
            <div style={{ fontSize: 13 }}>10MB max. Text-based PDFs only.</div>
          </div>
        )}
      </div>
      <div style={{ fontSize: 12, color: "#94A3B8", textAlign: "center", marginBottom: 24 }}>
        At least one of the two above is required. Upload your resume for sharper matches.
      </div>

      {/* Step 3: email gate OR start */}
      {phase === "email_gate" ? (
        <>
          <Label num={3} text="Where should we send your matches" />
          <div style={{ fontSize: 13, color: "#64748B", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
            <Lock size={14} />
            We use this to send your results and follow up if Offerloop can help with applications. No spam.
          </div>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@university.edu"
            style={{ ...textInput, marginBottom: 18 }}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") onSubmit();
            }}
          />
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={onBack} style={ghostBtn} type="button">Back</button>
            <button onClick={onSubmit} style={{ ...primaryBtn, flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }} type="button">
              <Search size={16} />
              Find my jobs
            </button>
          </div>
        </>
      ) : (
        <button
          onClick={onStart}
          style={{ ...primaryBtn, width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
          type="button"
        >
          <Search size={16} />
          Match me to jobs
        </button>
      )}

      {error ? <div style={errorBox}>{error}</div> : null}
    </div>
  </div>
);

// ──────────────────────────────────────────────────────────────────────────
// Loading
// ──────────────────────────────────────────────────────────────────────────

const RunningCard = () => (
  <div style={{ ...cardShell, textAlign: "center", padding: 64 }}>
    <Loader2 size={32} style={{ color: BRAND, animation: "spin 1s linear infinite", marginBottom: 18 }} />
    <h3 style={{ fontFamily: SERIF, fontSize: 22, fontWeight: 400, color: INK, marginBottom: 8 }}>
      Pairing you to live job postings...
    </h3>
    <p style={{ color: "#64748B", fontSize: 14, margin: 0, maxWidth: 480, marginLeft: "auto", marginRight: "auto" }}>
      Parsing your resume, building search queries from your background, scanning live postings on Greenhouse, Lever, Workday, and LinkedIn. Usually 30 to 60 seconds.
    </p>
    <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
  </div>
);

// ──────────────────────────────────────────────────────────────────────────
// Results
// ──────────────────────────────────────────────────────────────────────────

const ResultsLayout = ({
  result,
  onDownloadCsv,
}: {
  result: SearchResponse;
  onDownloadCsv: () => void;
}) => {
  const profile = result.profile_summary || {};
  const jobs = result.jobs || [];
  const hasJobs = jobs.length > 0;
  const profileHasContent = !!(profile.name || profile.school || profile.major || (profile.top_skills && profile.top_skills.length > 0));

  return (
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
          <div style={{ fontSize: 11, fontWeight: 700, color: BRAND, letterSpacing: "0.06em" }}>READY</div>
          <h3 style={{ fontFamily: SERIF, fontSize: 28, fontWeight: 400, color: INK, margin: "4px 0 0 0" }}>
            {hasJobs ? `Your top ${jobs.length} matches` : "No live matches right now"}
          </h3>
          {hasJobs ? (
            <div style={{ fontSize: 13, color: "#64748B", marginTop: 4 }}>
              Scored against your resume. Higher score = stronger fit.
            </div>
          ) : null}
        </div>

        {hasJobs ? (
          <button
            onClick={onDownloadCsv}
            style={{ ...primaryBtn, display: "flex", alignItems: "center", gap: 8 }}
            type="button"
          >
            <Download size={16} />
            Download CSV
          </button>
        ) : null}
      </div>

      {profileHasContent ? <ProfileChip profile={profile} /> : null}

      {result.warning && !hasJobs ? (
        <div style={{ ...warningBox, marginBottom: 16 }}>{result.warning}</div>
      ) : null}

      {hasJobs ? (
        <div style={{ display: "grid", gap: 16, marginBottom: 24 }}>
          {jobs.map((j) => (
            <JobCard key={j.id} job={j} />
          ))}
        </div>
      ) : null}

      <div
        style={{
          marginTop: 8,
          padding: 24,
          background: "linear-gradient(135deg, #EFF5FF 0%, #DBEAFE 100%)",
          border: "1px solid #BFDBFE",
          borderRadius: 12,
          textAlign: "center",
        }}
      >
        <div style={{ fontFamily: SERIF, fontSize: 22, fontWeight: 400, color: INK, marginBottom: 6 }}>
          Want more matches like these?
        </div>
        <p style={{ fontSize: 14, color: "#475569", maxWidth: 540, margin: "0 auto 16px" }}>
          A free Offerloop account unlocks the full job board, daily refreshes, recruiter contacts at every posting, and resume scoring per job.
        </p>
        <Link
          to="/onboarding"
          style={{
            ...primaryBtn,
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            textDecoration: "none",
          }}
        >
          <Sparkles size={16} />
          See more jobs (free account)
        </Link>
      </div>
    </div>
  );
};

const ProfileChip = ({ profile }: { profile: ProfileSummary }) => (
  <div
    style={{
      ...cardShell,
      padding: 16,
      marginBottom: 16,
      display: "flex",
      gap: 12,
      alignItems: "center",
      flexWrap: "wrap",
    }}
  >
    <CheckCircle2 size={18} style={{ color: BRAND }} />
    <div style={{ fontSize: 13, color: "#475569", lineHeight: 1.5 }}>
      Read your resume:{" "}
      <strong style={{ color: INK }}>
        {[profile.name, profile.major, profile.school, profile.graduation_year]
          .filter(Boolean)
          .join(" · ") || "profile parsed"}
      </strong>
      {profile.top_skills && profile.top_skills.length > 0 ? (
        <>
          {" "}
          <span style={{ color: "#94A3B8" }}>·</span>{" "}
          Skills: {profile.top_skills.slice(0, 6).join(", ")}
        </>
      ) : null}
    </div>
  </div>
);

const JobCard = ({ job }: { job: RecommendedJob }) => (
  <div style={cardShell}>
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        gap: 16,
        marginBottom: 12,
        flexWrap: "wrap",
      }}
    >
      <div style={{ flex: 1, minWidth: 220 }}>
        <h4
          style={{
            fontFamily: SERIF,
            fontSize: 20,
            fontWeight: 400,
            color: INK,
            margin: 0,
            lineHeight: 1.3,
          }}
        >
          {job.title}
        </h4>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            color: "#64748B",
            fontSize: 13,
            marginTop: 6,
            flexWrap: "wrap",
          }}
        >
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <Building2 size={13} /> {job.company}
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <MapPin size={13} /> {job.location}
          </span>
        </div>
      </div>
      <MatchBadge score={job.match_score} />
    </div>

    {job.why_match ? (
      <div
        style={{
          background: "#F0F7FF",
          border: "1px solid #DBEAFE",
          borderRadius: 8,
          padding: "10px 12px",
          fontSize: 13,
          color: BRAND_DARK,
          marginBottom: 12,
          lineHeight: 1.5,
        }}
      >
        <strong style={{ color: BRAND_DARK, fontWeight: 600 }}>Why it matches: </strong>
        {job.why_match}
      </div>
    ) : null}

    {job.requirements && job.requirements.length > 0 ? (
      <div style={{ marginBottom: 12 }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: "#475569",
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            marginBottom: 6,
          }}
        >
          Key requirements
        </div>
        <ul
          style={{
            margin: 0,
            paddingLeft: 18,
            fontSize: 13,
            color: "#475569",
            lineHeight: 1.6,
          }}
        >
          {job.requirements.slice(0, 3).map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      </div>
    ) : null}

    {job.matched_skills && job.matched_skills.length > 0 ? (
      <div
        style={{
          display: "flex",
          gap: 6,
          flexWrap: "wrap",
          marginBottom: 14,
        }}
      >
        {job.matched_skills.slice(0, 6).map((s) => (
          <span
            key={s}
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: BRAND_DARK,
              background: "#EFF5FF",
              border: "1px solid #DBEAFE",
              borderRadius: 999,
              padding: "3px 9px",
            }}
          >
            {s}
          </span>
        ))}
      </div>
    ) : null}

    {job.url ? (
      <a
        href={job.url}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          color: BRAND_DARK,
          fontSize: 13,
          fontWeight: 600,
          textDecoration: "none",
        }}
      >
        <ExternalLink size={14} />
        Apply on {hostFromUrl(job.url)}
      </a>
    ) : null}
  </div>
);

const MatchBadge = ({ score }: { score: number }) => {
  let bg = "#F1F5F9";
  let fg = "#475569";
  let label = "Match";
  if (score >= 80) {
    bg = "#DCFCE7"; fg = "#15803D"; label = "Strong match";
  } else if (score >= 60) {
    bg = "#DBEAFE"; fg = BRAND_DARK; label = "Good match";
  } else if (score >= 40) {
    bg = "#FEF3C7"; fg = "#92400E"; label = "Fair match";
  }
  return (
    <span
      style={{
        fontSize: 12,
        fontWeight: 700,
        color: fg,
        background: bg,
        borderRadius: 999,
        padding: "5px 12px",
        whiteSpace: "nowrap",
      }}
    >
      {label} · {Math.round(score)}%
    </span>
  );
};

const hostFromUrl = (url: string): string => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "site";
  }
};

// ── Style tokens ──────────────────────────────────────────────────────────

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

const warningBox: React.CSSProperties = {
  padding: 12,
  background: "#FFFBEB",
  border: "1px solid #FCD34D",
  borderRadius: 8,
  color: "#78350F",
  fontSize: 14,
};

const Label = ({ num, text, optional }: { num: number; text: string; optional?: boolean }) => (
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
          padding: "2px 7px",
          borderRadius: 999,
          letterSpacing: "0.02em",
        }}
      >
        optional
      </span>
    ) : null}
  </div>
);
