import React, { useState, useEffect, useMemo, useRef, useCallback, Suspense } from "react";
import { useNavigate } from "react-router-dom";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppHeader } from "@/components/AppHeader";
import { useFirebaseAuth } from "@/contexts/FirebaseAuthContext";
import {
  apiService,
  type FeedJob,
  type JobFeedResponse,
  type JobFeedSummary,
} from "@/services/api";
import { JobBoardSkeleton } from "@/components/JobBoardSkeleton";
import { FindHumansModal, type FindHumansJob } from "@/components/jobs/FindHumansModal";
import { toast } from "@/hooks/use-toast";
import "./JobBoardEditorial.css";

// Recruiter Search tab uses the existing rich spreadsheet — lazy load to keep
// the Jobs tab fast.
const RecruiterSpreadsheet = React.lazy(() => import("@/components/RecruiterSpreadsheet"));

type SubTab = "jobs" | "saved" | "applied" | "recruiter";

const STALE_DAYS = 10;
const HIRING_TEAM_LABEL = "See the hiring team";

// ─── helpers ────────────────────────────────────────────────────────────────
function normalizeLocation(loc: unknown): string {
  if (!loc) return "";
  if (typeof loc === "string") return loc;
  if (typeof loc === "object") {
    const o = loc as Record<string, unknown>;
    const parts = [o.addressLocality, o.addressRegion, o.addressCountry]
      .filter((v): v is string => typeof v === "string" && v.length > 0);
    if (parts.length) return parts.join(", ");
    return Object.values(o)
      .filter((v): v is string => typeof v === "string" && v.length > 0)
      .join(" ");
  }
  return String(loc);
}

function initialOf(name?: string | null): string {
  if (!name) return "?";
  const trimmed = name.trim();
  if (!trimmed) return "?";
  return trimmed[0].toUpperCase();
}

function postedDaysFrom(iso?: string | null): number | null {
  if (!iso) return null;
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return null;
  return Math.max(0, Math.floor((Date.now() - ts) / (1000 * 60 * 60 * 24)));
}

function postedShort(iso?: string | null): string {
  const d = postedDaysFrom(iso);
  if (d == null) return "";
  if (d === 0) {
    const hrs = Math.max(1, Math.floor((Date.now() - new Date(iso!).getTime()) / (1000 * 60 * 60)));
    return `${hrs}h`;
  }
  return `${d}d`;
}

function jobTypeLabel(type?: string | null): string {
  switch ((type || "").toUpperCase()) {
    case "INTERNSHIP": return "Internship";
    case "PARTTIME":   return "Part-Time";
    case "FULLTIME":   return "Full-Time";
    default:           return type || "Full-Time";
  }
}

function whyOneLine(j: FeedJob): string {
  if (j.match_reason) return j.match_reason;
  const sig = j.match_signals?.[0];
  if (sig) return sig;
  return j.ranked === false ? "Recently posted" : "Matched to your profile";
}

// ─── small components ───────────────────────────────────────────────────────
function FilterDropdown({
  label,
  value,
  options,
  onPick,
}: {
  label: string;
  value: string;
  options: string[];
  onPick: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  return (
    <div className="ddown" ref={ref}>
      <button className="filt" type="button" onClick={() => setOpen(v => !v)}>
        {label} <span className="v">{value}</span> <span className="chev">▾</span>
      </button>
      {open && (
        <div className="menu">
          {options.map(o => (
            <button
              key={o}
              type="button"
              className={value === o ? "on" : ""}
              onClick={() => { onPick(o); setOpen(false); }}
            >
              {o}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Ledger({ summary }: { summary: JobFeedSummary | null }) {
  return (
    <div className="ledger">
      <div className="cell">
        <div className="k">Matched</div>
        <div className="num"><em>{summary?.matched ?? 0}</em></div>
        <div className="sub">aligned with your targets</div>
      </div>
      <div className="cell">
        <div className="k">New today</div>
        <div className="num">
          {summary?.new_today ?? 0}<span className="of">past 24h</span>
        </div>
        <div className="sub">above your match floor</div>
      </div>
      <div className="cell">
        <div className="k">Saved</div>
        <div className="num">
          {summary?.saved ?? 0}<span className="of">in tracker</span>
        </div>
        <div className="sub">tap to follow up</div>
      </div>
      <div className="cell">
        <div className="k">Ranking</div>
        <div className={`num ${summary?.ranking_active ? "italic-on" : ""}`}>
          {summary?.ranking_active ? "On" : "Off"}
        </div>
        <div className="sub">based on {summary?.ranking_basis || "no resume"}</div>
      </div>
    </div>
  );
}

function StandoutCard({
  j,
  onOpenApply,
  onFindContact,
  onSeeTeam,
}: {
  j: FeedJob;
  onOpenApply: (j: FeedJob) => void;
  onFindContact: (j: FeedJob) => void;
  onSeeTeam: (j: FeedJob) => void;
}) {
  const warm = (j.match_score ?? 0) >= 90;
  return (
    <div className="so">
      <div className="top">
        <div className="logo">{initialOf(j.company)}</div>
        <span className={`score ${warm ? "warm" : ""}`}>
          match · {j.match_score ?? "—"}
        </span>
      </div>
      <div className="ttl">{j.title}</div>
      <div className="meta">
        <span className="co">{j.company}</span> · {normalizeLocation(j.location)} ·{" "}
        <span style={{
          fontFamily: "'JetBrains Mono',monospace",
          fontSize: 10,
          letterSpacing: ".06em",
          textTransform: "uppercase",
          color: "var(--ink-4)",
        }}>
          {postedShort(j.posted_at)}
        </span>
      </div>
      <div className="why">{whyOneLine(j)}</div>
      <div className="actions">
        <a className="primary" onClick={() => onOpenApply(j)}>Apply →</a>
        <a onClick={() => onFindContact(j)}>Find contact</a>
        <a onClick={() => onSeeTeam(j)}>{HIRING_TEAM_LABEL}</a>
      </div>
    </div>
  );
}

function JobRow({
  j,
  isOpen,
  isSaved,
  onToggle,
  onDismiss,
  onApply,
  onFindContact,
  onSeeTeam,
  onSave,
}: {
  j: FeedJob;
  isOpen: boolean;
  isSaved: boolean;
  onToggle: (id: string) => void;
  onDismiss: (id: string) => Promise<void> | void;
  onApply: (j: FeedJob) => void;
  onFindContact: (j: FeedJob) => void;
  onSeeTeam: (j: FeedJob) => void;
  onSave: (j: FeedJob) => Promise<void> | void;
}) {
  const [dismissing, setDismissing] = useState(false);
  const daysOld = postedDaysFrom(j.posted_at) ?? 0;
  const stale = daysOld >= STALE_DAYS;
  const score = j.match_score ?? null;

  const handleDismiss: React.MouseEventHandler<HTMLButtonElement> = async (e) => {
    e.stopPropagation();
    setDismissing(true);
    try {
      await onDismiss(j.job_id);
    } catch (err) {
      // failure is logged in the handler; nothing to roll back since the row
      // will reload from the server on the next refresh.
    }
  };
  const stop: React.MouseEventHandler = (e) => e.stopPropagation();

  return (
    <>
      <div
        className={`row ${isOpen ? "open" : ""} ${stale ? "stale" : ""} ${dismissing ? "dismissing" : ""}`}
        onClick={() => !dismissing && onToggle(j.job_id)}
      >
        <div className="av">
          {j.employer_logo
            ? <img src={j.employer_logo} alt="" loading="lazy" />
            : initialOf(j.company)}
        </div>
        <div className="body">
          <div className="ttl-line">
            <span className="ttl">{j.title}</span>
            {!stale && daysOld <= 0 && <span className="new">New</span>}
            {stale && <span className="stale-tag">likely filled</span>}
          </div>
          <div className="meta">
            <span className="co">{j.company}</span>
            <span className="dot">·</span>
            {normalizeLocation(j.location)}
            <span className="dot">·</span>
            {jobTypeLabel(j.type)}
          </div>
          <div className="why">{whyOneLine(j)}</div>
          <div className="actions">
            <a className="primary" onClick={(e) => { stop(e); onApply(j); }}>Apply →</a>
            <a onClick={(e) => { stop(e); onFindContact(j); }}>Find contact</a>
            <a onClick={(e) => { stop(e); onSeeTeam(j); }}>
              {HIRING_TEAM_LABEL}<span className="credits"> · 5 cr</span>
            </a>
            <a onClick={(e) => { stop(e); onSave(j); }}>{isSaved ? "Saved ✓" : "Save"}</a>
          </div>
        </div>
        <div className="right">
          <div className="score-wrap" onClick={stop}>
            <span className={`score ${score != null && score < 70 ? "cool" : ""}`}>
              {score ?? "—"}
              <span style={{ color: "var(--ink-4)", fontSize: 9, marginLeft: 2 }}>/100</span>
            </span>
            {(j.match_signals?.length ?? 0) > 0 && (
              <div className="score-tip">
                <div className="h">Why this ranked</div>
                <ul>
                  {j.match_signals!.map((s, i) => <li key={i}>{s}</li>)}
                </ul>
              </div>
            )}
          </div>
          <span className="posted">{postedShort(j.posted_at)}</span>
        </div>
        <button className="dismiss" onClick={handleDismiss} title="Not for me" type="button">×</button>
      </div>
      {isOpen && !dismissing && (
        <div className="drawer" onClick={stop}>
          <div className="inner">
            <div>
              {j.structured && (j.structured.experience_level || j.structured.salary_range_text || j.structured.team) && (
                <div className="meta-line" style={{ marginBottom: 8, fontSize: "0.85em", color: "#6b6960" }}>
                  {[
                    j.structured.experience_level,
                    j.structured.salary_range_text,
                    j.structured.team,
                  ].filter(Boolean).join(" · ")}
                </div>
              )}

              {j.structured?.requirements?.length ? (
                <>
                  <h4>Requirements</h4>
                  <ul>
                    {j.structured.requirements.slice(0, 6).map((r, i) => <li key={`req-${i}`}>{r}</li>)}
                  </ul>
                </>
              ) : (
                <>
                  <h4>The role</h4>
                  <p>
                    {(j as any).description?.slice(0, 380) ||
                      "Open the listing to read the full job description."}
                    {(j as any).description && (j as any).description.length > 380 ? "…" : ""}
                  </p>
                  <h4>What they're looking for</h4>
                  <ul>
                    {(j.match_signals || []).map((r, i) => <li key={`sig-${i}`}>{r}</li>)}
                  </ul>
                </>
              )}

              {j.structured?.nice_to_have?.length ? (
                <>
                  <h4>Nice to have</h4>
                  <ul>
                    {j.structured.nice_to_have.slice(0, 4).map((r, i) => <li key={`nth-${i}`}>{r}</li>)}
                  </ul>
                </>
              ) : null}

              {j.structured?.responsibilities?.length ? (
                <>
                  <h4>What you'll do</h4>
                  <ul>
                    {j.structured.responsibilities.slice(0, 5).map((r, i) => <li key={`resp-${i}`}>{r}</li>)}
                  </ul>
                </>
              ) : null}
            </div>
            <div className="actions-bar">
              <button className="primary" type="button" onClick={() => onApply(j)}>
                Apply <span>→</span>
              </button>
              <button type="button" onClick={() => onFindContact(j)}>
                Find contact
              </button>
              <button type="button" onClick={() => onSeeTeam(j)}>
                {HIRING_TEAM_LABEL}<span className="cr">5cr</span>
              </button>
              <button type="button" onClick={() => onSave(j)}>
                {isSaved ? "Saved ✓" : "Save for later"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── main page ──────────────────────────────────────────────────────────────
export const JobBoardPage: React.FC = () => {
  const { user, isLoading: authLoading } = useFirebaseAuth();
  const navigate = useNavigate();

  const [feed, setFeed] = useState<JobFeedResponse | null>(null);
  const [feedLoading, setFeedLoading] = useState(true);
  const [summary, setSummary] = useState<JobFeedSummary | null>(null);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [tab, setTab] = useState<SubTab>("jobs");
  const [openId, setOpenId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [jobType, setJobType] = useState("All");
  const [field, setField] = useState("All");
  const [sort, setSort] = useState("Best match");
  const [findHumansJob, setFindHumansJob] = useState<FindHumansJob | null>(null);

  const loadFeed = useCallback(async (refresh = false, opts?: { ungated?: boolean }) => {
    try {
      setFeedLoading(true);
      const data = await apiService.getJobFeed({ refresh, ungated: opts?.ungated });
      setFeed(data);
    } catch (err) {
      console.error("getJobFeed failed", err);
      toast({ title: "Couldn't load jobs", description: "Try again in a moment.", variant: "destructive" });
    } finally {
      setFeedLoading(false);
    }
  }, []);

  // Phase 2: "Show all" toggle bypasses hard intent gates on the next fetch
  const [showAll, setShowAll] = useState(false);
  const toggleShowAll = useCallback(() => {
    const next = !showAll;
    setShowAll(next);
    loadFeed(true, { ungated: next });
  }, [showAll, loadFeed]);

  const loadSummary = useCallback(async () => {
    try {
      const s = await apiService.getJobFeedSummary();
      setSummary(s);
    } catch (err) {
      console.warn("summary fetch failed", err);
    }
  }, []);

  const loadSaved = useCallback(async () => {
    try {
      const r = await apiService.listSavedJobs();
      setSavedIds(new Set(r.saved.map(s => s.job_id)));
    } catch (err) {
      console.warn("saved jobs fetch failed", err);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    loadFeed();
    loadSummary();
    loadSaved();
  }, [user, loadFeed, loadSummary, loadSaved]);

  // Merge and de-duplicate new_matches + top_jobs into a single feed.
  const allJobs: FeedJob[] = useMemo(() => {
    if (!feed) return [];
    const seen = new Set<string>();
    const out: FeedJob[] = [];
    for (const j of [...feed.new_matches, ...feed.top_jobs]) {
      if (!j.job_id || seen.has(j.job_id)) continue;
      seen.add(j.job_id);
      out.push(j);
    }
    return out;
  }, [feed]);

  const filteredJobs: FeedJob[] = useMemo(() => {
    let list = allJobs;
    if (jobType !== "All") {
      list = list.filter(j => jobTypeLabel(j.type) === jobType);
    }
    if (field !== "All") {
      list = list.filter(j => (j.category || "").toLowerCase().includes(field.toLowerCase()));
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(j =>
        j.title?.toLowerCase().includes(q) ||
        j.company?.toLowerCase().includes(q) ||
        normalizeLocation(j.location).toLowerCase().includes(q)
      );
    }
    if (sort === "Most recent") {
      list = [...list].sort((a, b) => (b.posted_at || "").localeCompare(a.posted_at || ""));
    } else if (sort === "Company A→Z") {
      list = [...list].sort((a, b) => (a.company || "").localeCompare(b.company || ""));
    } else {
      list = [...list].sort((a, b) => (b.match_score ?? 0) - (a.match_score ?? 0));
    }
    return list;
  }, [allJobs, jobType, field, search, sort]);

  const standouts = useMemo(() => filteredJobs.slice(0, 2), [filteredJobs]);
  const restJobs  = useMemo(() => filteredJobs.slice(2), [filteredJobs]);

  // ── actions ────────────────────────────────────────────────────────────────
  const handleToggle = (id: string) => setOpenId(prev => (prev === id ? null : id));

  const handleApply = (j: FeedJob) => {
    if (j.apply_url) window.open(j.apply_url, "_blank", "noopener,noreferrer");
  };

  const toFindHumansJob = (j: FeedJob): FindHumansJob => ({
    id: j.job_id,
    title: j.title,
    company: j.company,
    location: normalizeLocation(j.location),
    description: (j as any).description,
    url: j.apply_url,
  });

  const handleFindContact = (j: FeedJob) => setFindHumansJob(toFindHumansJob(j));
  const handleSeeTeam     = (j: FeedJob) => setFindHumansJob(toFindHumansJob(j));

  const handleSave = async (j: FeedJob) => {
    const already = savedIds.has(j.job_id);
    try {
      if (already) {
        await apiService.unsaveJob(j.job_id);
        const next = new Set(savedIds); next.delete(j.job_id);
        setSavedIds(next);
        setSummary(s => s ? { ...s, saved: Math.max(0, s.saved - 1) } : s);
      } else {
        await apiService.saveJob({
          job_id: j.job_id,
          title: j.title,
          company: j.company,
          location: normalizeLocation(j.location),
          apply_url: j.apply_url,
          match_score: j.match_score ?? undefined,
        });
        const next = new Set(savedIds); next.add(j.job_id);
        setSavedIds(next);
        setSummary(s => s ? { ...s, saved: s.saved + 1 } : s);
      }
    } catch (err) {
      console.error("save toggle failed", err);
      toast({ title: "Couldn't update saved jobs", variant: "destructive" });
    }
  };

  const handleDismiss = async (id: string) => {
    const j = allJobs.find(x => x.job_id === id);
    setFeed(prev => prev ? {
      ...prev,
      new_matches: prev.new_matches.filter(x => x.job_id !== id),
      top_jobs:    prev.top_jobs.filter(x => x.job_id !== id),
    } : prev);
    if (openId === id) setOpenId(null);
    try {
      await apiService.postJobFeedback({
        job_id: id,
        signal: "negative",
        company: j?.company,
        category: j?.category,
      });
    } catch (err) {
      console.warn("dismiss feedback persist failed", err);
    }
  };

  // ── render ────────────────────────────────────────────────────────────────
  if (authLoading) return <JobBoardSkeleton />;

  return (
    <SidebarProvider>
      <div className="flex h-screen w-full overflow-hidden" style={{ background: "#FBF9F4" }}>
        <AppSidebar />
        <div className="flex-1 flex flex-col overflow-hidden min-w-0" style={{ background: "#FBF9F4" }}>
          <AppHeader title="Job Board" />
          <div className="flex-1 overflow-y-auto overflow-x-hidden min-w-0 jb-editorial" style={{ width: "100%" }}>
            <div className="shell">
              <div className="col main">
                <div className="crumbs">
                  <span>Agent</span>
                  <span className="sep">/</span>
                  <span className="here">Job Board</span>
                </div>
                <h1 className="title">Roles, <em>ranked for you.</em></h1>
                <p className="subtitle">
                  Matched to your resume, your campus, and your saved targets.
                  {feed?.summary && (
                    <span
                      title={feed.summary.last_pipeline_run ?? undefined}
                      style={{
                        marginLeft: 10,
                        padding: "2px 8px",
                        borderRadius: 999,
                        fontSize: "0.8em",
                        fontWeight: 600,
                        background: feed.summary.stale ? "#FEF3C7" : "#ECFDF5",
                        color: feed.summary.stale ? "#92400E" : "#065F46",
                        border: `1px solid ${feed.summary.stale ? "#FCD34D" : "#A7F3D0"}`,
                      }}
                    >
                      {feed.summary.stale
                        ? `Stale — last refresh ${feed.summary.freshness_label}`
                        : `Updated ${feed.summary.freshness_label}`}
                    </span>
                  )}
                </p>

                <Ledger summary={summary} />

                {feed?.no_resume && (
                  <div className="nudge">
                    <div className="body">
                      <div className="ttl">Upload your resume to get <em>AI-ranked</em> matches</div>
                      <div className="sub">We'll line jobs up against your skills, major, and experience.</div>
                    </div>
                    <button className="cta" type="button" onClick={() => navigate("/account-settings")}>
                      Upload resume
                    </button>
                  </div>
                )}

                <div className="toolbar">
                  <div className="search">
                    <input
                      placeholder="Try 'data scientist in SF' or 'Apple'"
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                    />
                  </div>
                  <FilterDropdown
                    label="Type"
                    value={jobType}
                    options={["All", "Full-Time", "Internship", "Part-Time", "Contract"]}
                    onPick={setJobType}
                  />
                  <FilterDropdown
                    label="Field"
                    value={field}
                    options={["All", "Data Science", "Software Eng.", "Product", "Finance", "Marketing"]}
                    onPick={setField}
                  />
                  <FilterDropdown
                    label="Sort"
                    value={sort}
                    options={["Best match", "Most recent", "Company A→Z"]}
                    onPick={setSort}
                  />
                  <button className="filt icon" title="Refresh" type="button" onClick={() => loadFeed(true)}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
                         strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 12a9 9 0 0 1 15.5-6.3L21 8"/>
                      <path d="M21 3v5h-5"/>
                      <path d="M21 12a9 9 0 0 1-15.5 6.3L3 16"/>
                      <path d="M3 21v-5h5"/>
                    </svg>
                  </button>
                </div>

                <div className="segtabs">
                  {([
                    { id: "jobs",      label: "Jobs",             n: summary?.matched },
                    { id: "saved",     label: "Saved",            n: summary?.saved },
                    { id: "applied",   label: "Applied",          n: undefined },
                    { id: "recruiter", label: "Recruiter Search", n: undefined },
                  ] as { id: SubTab; label: string; n: number | undefined }[]).map(t => (
                    <button
                      key={t.id}
                      type="button"
                      className={`tab ${tab === t.id ? "on" : ""}`}
                      onClick={() => setTab(t.id)}
                    >
                      {t.label}
                      {t.n != null && <span className="n">{t.n}</span>}
                    </button>
                  ))}
                </div>

                {tab === "jobs" && (
                  <>
                    {feedLoading && <div className="empty">Loading roles…</div>}
                    {!feedLoading && filteredJobs.length === 0 && (
                      <div className="empty">No roles match those filters yet.</div>
                    )}
                    {!feedLoading && feed?.gated?.applied && (
                      (feed.gated.by_location + feed.gated.by_level + feed.gated.by_interest) > 0 && (
                        <div
                          role="status"
                          style={{
                            margin: "12px 0",
                            padding: "10px 14px",
                            background: "#FBF6E9",
                            border: "1px solid #EEDFB0",
                            borderRadius: 8,
                            fontSize: "0.9em",
                            color: "#5A4A1A",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 12,
                          }}
                        >
                          <span>
                            Filtered{" "}
                            <strong>{feed.gated.by_location + feed.gated.by_level + feed.gated.by_interest}</strong>{" "}
                            jobs that didn't match your preferences
                            {feed.gated.by_level > 0 && ` · ${feed.gated.by_level} too senior`}
                            {feed.gated.by_location > 0 && ` · ${feed.gated.by_location} wrong location`}
                            {feed.gated.by_interest > 0 && ` · ${feed.gated.by_interest} off-topic`}
                          </span>
                          <button
                            type="button"
                            onClick={toggleShowAll}
                            style={{
                              padding: "4px 10px",
                              borderRadius: 6,
                              border: "1px solid #C8A55E",
                              background: "transparent",
                              cursor: "pointer",
                              fontWeight: 600,
                              color: "#5A4A1A",
                            }}
                          >
                            Show all
                          </button>
                        </div>
                      )
                    )}
                    {!feedLoading && showAll && feed?.gated?.ungated && (
                      <div
                        role="status"
                        style={{
                          margin: "12px 0",
                          padding: "10px 14px",
                          background: "#F3F0E8",
                          border: "1px solid #D7CDB5",
                          borderRadius: 8,
                          fontSize: "0.9em",
                          color: "#544E3D",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 12,
                        }}
                      >
                        <span>Showing all jobs (intent filters off).</span>
                        <button
                          type="button"
                          onClick={toggleShowAll}
                          style={{
                            padding: "4px 10px",
                            borderRadius: 6,
                            border: "1px solid #8A8474",
                            background: "transparent",
                            cursor: "pointer",
                            fontWeight: 600,
                            color: "#544E3D",
                          }}
                        >
                          Re-apply filters
                        </button>
                      </div>
                    )}
                    {!feedLoading && standouts.length > 0 && (
                      <div className="section">
                        <div className="hd">
                          <h3>Standouts <em>this morning</em></h3>
                          <a className="all" onClick={() => loadFeed(true)}>All matches →</a>
                        </div>
                        <div className="standouts">
                          {standouts.map(j => (
                            <StandoutCard
                              key={j.job_id}
                              j={j}
                              onOpenApply={handleApply}
                              onFindContact={handleFindContact}
                              onSeeTeam={handleSeeTeam}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                    {!feedLoading && restJobs.length > 0 && (
                      <div className="section">
                        <div className="hd">
                          <h3>All matches <em>· {filteredJobs.length} roles</em></h3>
                          <a className="all" onClick={() => loadFeed(true)}>Adjust ranking →</a>
                        </div>
                        <div className="rows">
                          {restJobs.map(j => (
                            <JobRow
                              key={j.job_id}
                              j={j}
                              isOpen={openId === j.job_id}
                              isSaved={savedIds.has(j.job_id)}
                              onToggle={handleToggle}
                              onDismiss={handleDismiss}
                              onApply={handleApply}
                              onFindContact={handleFindContact}
                              onSeeTeam={handleSeeTeam}
                              onSave={handleSave}
                            />
                          ))}
                        </div>
                        <div className="page-bar">
                          <span className="meta">
                            <em>1–{restJobs.length}</em> of <em>{filteredJobs.length}</em>
                          </span>
                          <div className="nav">
                            <button disabled type="button">← Prev</button>
                            <button type="button" onClick={() => loadFeed(true)}>Refresh →</button>
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}

                {tab === "saved" && (
                  <div className="empty">
                    {summary?.saved
                      ? `${summary.saved} saved roles — see the rail for your active follow-ups.`
                      : "No saved roles yet — tap Save on any match."}
                  </div>
                )}

                {tab === "applied" && (
                  <div className="empty">Track applications in the Application Lab.</div>
                )}

                {tab === "recruiter" && (
                  <Suspense fallback={<div className="empty">Loading recruiter search…</div>}>
                    <div style={{ marginTop: 24 }}>
                      <RecruiterSpreadsheet />
                    </div>
                  </Suspense>
                )}
              </div>

              <aside className="rail">
                <div className="h"><span className="pulse" />Job feed · live</div>
                <div className="stats">
                  <div className="c">
                    <div className="k">Matched</div>
                    <div className="v">{summary?.matched ?? 0}</div>
                  </div>
                  <div className="c">
                    <div className="k">Last sync</div>
                    <div className="v small">
                      {feed?.summary?.freshness_label ?? "—"}
                    </div>
                  </div>
                </div>

                <div className="h" style={{ marginTop: 0 }}>
                  Saved · {summary?.saved ?? 0} active
                </div>
                <div className="saved">
                  {allJobs.filter(j => savedIds.has(j.job_id)).slice(0, 4).map(j => (
                    <div className="it" key={j.job_id} onClick={() => handleToggle(j.job_id)}>
                      <div className="ttl">{j.title}</div>
                      <div className="sub"><span className="co">{j.company}</span></div>
                      <div className="stat good">match · {j.match_score ?? "—"}</div>
                    </div>
                  ))}
                  {savedIds.size === 0 && (
                    <div className="it" style={{ borderBottom: "none" }}>
                      <div className="sub" style={{ fontStyle: "italic" }}>
                        Save a role to start tracking follow-ups here.
                      </div>
                    </div>
                  )}
                </div>

                <div className="filter-tip">
                  Ranking pulls from <b>your resume</b>, the schools and skills on your profile,
                  and the companies you save. Adjust in <b>Account settings</b>.
                </div>
              </aside>
            </div>
          </div>
        </div>
      </div>

      <FindHumansModal
        open={!!findHumansJob}
        onOpenChange={(o) => !o && setFindHumansJob(null)}
        job={findHumansJob}
      />
    </SidebarProvider>
  );
};

export default JobBoardPage;
