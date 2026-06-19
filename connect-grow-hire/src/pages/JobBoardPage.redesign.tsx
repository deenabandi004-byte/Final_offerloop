// JobBoardPage.redesign.tsx
//
// Prototype-faithful copy of offerloop-job-board.html wired to live data.
// Lives behind /dev/job-board-redesign. Production /job-board is untouched.
//
// Visual reference: offerloop-job-board.html + design frames (prototype-default,
// prototype-loading, prototype-found-people, prototype-save-search,
// prototype-filters, prototype-locked).
//
// Independent-scroll architecture:
//   .jb-editorial          height: 100% + overflow: hidden  (shell, no scroll)
//     .jb-fb               flex-shrink: 0                   (filter bar pinned)
//     .jb-twopane          flex: 1 + overflow: hidden       (container, no scroll)
//       .jb-list           overflow-y: auto                 (left scrolls)
//       .jb-detail         overflow-y: auto                 (right scrolls)
//
// Data flow: getJobFeed -> buildSectionedJobs (Recent-wins dedup) -> render.
// Quick-filter chips are visual-only this pass (counts hardcoded from frames).
// People CTA opens existing FindHumansModal.

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AppSidebar } from "@/components/AppSidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppHeader } from "@/components/AppHeader";
import { useFirebaseAuth } from "@/contexts/FirebaseAuthContext";
import {
  apiService,
  type JobFeedResponse,
  type SavedJob,
} from "@/services/api";
import { JobBoardSkeleton } from "@/components/JobBoardSkeleton";
import {
  FindHumansModal,
  type FindHumansJob,
} from "@/components/jobs/FindHumansModal";
import { toast } from "@/hooks/use-toast";

import { JobCard } from "@/components/jobs/JobCard";
import { JobDetail } from "@/components/jobs/JobDetail";
import { SaveSearchModal } from "@/components/jobs/SaveSearchModal";
import { ApplicationProfileModal } from "@/components/jobs/ApplicationProfileModal";
import { AutoApplyReviewModal } from "@/components/jobs/AutoApplyReviewModal";
import { AutoSubmissionTab } from "@/components/jobs/AutoSubmissionTab";
import { NeedsAttentionTab } from "@/components/jobs/NeedsAttentionTab";
import { NeedsVerificationTab } from "@/components/jobs/NeedsVerificationTab";
import {
  submitAutoApply,
  type AutoApplyPrepareResponse,
} from "@/services/api";
import {
  MoreFiltersPanel,
  type MoreFiltersState,
} from "@/components/jobs/MoreFiltersPanel";
import {
  IconClose,
  IconFilter,
  IconPlus,
  IconRefresh,
  IconSavedBookmark,
  IconSearch,
} from "@/components/jobs/icons";

import {
  buildSectionedJobs,
  type ProtoJob,
} from "./jobBoardAdapter";
import "./JobBoardEditorial.redesign.css";

// Quick-filter chip seeds. Counts mirror the design frames; chips are visual
// only this pass and do not filter the job list.
// Counts intentionally absent: chips do not actually filter the loaded
// feed yet, so a number next to them would imply an action they cannot
// take. Real counts return only when the chip is wired to filter, per
// the no-fake-numbers rule.
const QUICK_FILTERS: Array<{ key: string; label: string }> = [
  { key: "Remote",      label: "Remote" },
  { key: "Full-time",   label: "Full-time" },
  { key: "$100k+",      label: "$100k+" },
  // "Quick Apply" removed — superseded by the "Auto-apply only" toggle
  // which sits next to the More Filters button.
];

export const JobBoardPage: React.FC = () => {
  const { user, isLoading: authLoading } = useFirebaseAuth();

  // ---- Server data --------------------------------------------------------
  const [feed, setFeed] = useState<JobFeedResponse | null>(null);
  const [feedLoading, setFeedLoading] = useState(true);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());

  // ---- Local UI state -----------------------------------------------------
  const [search, setSearch] = useState("");
  // Start with NO chips active so first-impression Discover shows the
  // widest possible feed. User opts into Remote / Full-time / $100k+ by
  // adding chips from the "+" dropdown.
  const [activeFilters, setActiveFilters] = useState<string[]>([]);
  // Chips coming from the More Filters drawer (experience, date, size, visa).
  // These are removable just like quick filters; visual-only.
  const [moreFilterChips, setMoreFilterChips] = useState<string[]>([]);
  const [moreFiltersState, setMoreFiltersState] = useState<MoreFiltersState | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [showSaveSearch, setShowSaveSearch] = useState(false);
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const [showAddDropdown, setShowAddDropdown] = useState(false);
  const [findHumansJob, setFindHumansJob] = useState<FindHumansJob | null>(null);

  // Saved snapshots (full job data, not just IDs). Drive the Saved
  // top-level tab. Storing the full snapshot means a bookmarked job stays
  // viewable even if the original posting expires upstream and rotates out
  // of the live feed.
  //
  // The Applied tab was deliberately removed: clicking the Apply URL only
  // proves the user opened the link, not that they actually submitted an
  // application. Auto-tracking it created false memory ("oh, I already
  // applied"). If we ever want apply tracking, it should be an explicit
  // action — not a side-effect of opening a tab.
  const [savedJobs, setSavedJobs] = useState<SavedJob[]>([]);

  // Top-level tab. "discover" = the existing Recent + Recommended view.
  // "saved" swaps the entire job list for the bookmarked bin, mirroring
  // the Outbox tab pattern (always-visible at the top of the page).
  // "auto-submission" lists every auto-apply job (in-flight + done + failed).
  // "needs-attention" lists jobs paused waiting on the user to answer a
  // custom screening question we don't have an answer for.
  const [activeJobTab, setActiveJobTab] = useState<
    | "discover"
    | "saved"
    | "auto-submission"
    | "needs-attention"
    | "needs-verification"
  >("discover");

  // Collapsible section state. Default: Recent collapsed, Recommended open
  // so the better-matching list is visible without scrolling. User's choice
  // is persisted to localStorage so it survives reload and tab switches.
  const [collapsedSections, setCollapsedSections] = useState<{
    recent: boolean;
    recommended: boolean;
    saved: boolean;
    applied: boolean;
  }>(() => {
    try {
      const raw = localStorage.getItem("jb_collapsed_sections");
      if (raw) {
        const parsed = JSON.parse(raw);
        return {
          recent: typeof parsed.recent === "boolean" ? parsed.recent : true,
          recommended: typeof parsed.recommended === "boolean" ? parsed.recommended : false,
          saved: typeof parsed.saved === "boolean" ? parsed.saved : true,
          applied: typeof parsed.applied === "boolean" ? parsed.applied : true,
        };
      }
    } catch {
      /* localStorage may be unavailable; fall through to defaults */
    }
    return { recent: true, recommended: false, saved: true, applied: true };
  });

  const toggleSection = useCallback((key: "recent" | "recommended" | "saved" | "applied") => {
    setCollapsedSections((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      try {
        localStorage.setItem("jb_collapsed_sections", JSON.stringify(next));
      } catch {
        /* ignore storage failures */
      }
      return next;
    });
  }, []);

  const addDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showAddDropdown) return;
    const onClick = (e: MouseEvent) => {
      if (
        addDropdownRef.current &&
        !addDropdownRef.current.contains(e.target as Node)
      ) {
        setShowAddDropdown(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [showAddDropdown]);

  // ---- Data loaders -------------------------------------------------------
  const loadFeed = useCallback(async (refresh = false) => {
    try {
      setFeedLoading(true);
      const data = await apiService.getJobFeed({ refresh });
      setFeed(data);
    } catch (err) {
      console.error("getJobFeed failed", err);
      toast({
        title: "Couldn't load jobs",
        description: "Try again in a moment.",
        variant: "destructive",
      });
    } finally {
      setFeedLoading(false);
    }
  }, []);

  const loadSaved = useCallback(async () => {
    try {
      const r = await apiService.listSavedJobs();
      setSavedJobs(r.saved);
      setSavedIds(new Set(r.saved.map((s) => s.job_id)));
    } catch (err) {
      console.warn("saved jobs fetch failed", err);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    loadFeed();
    loadSaved();
  }, [user, loadFeed, loadSaved]);

  // ---- Adapter ------------------------------------------------------------
  const sections = useMemo(() => buildSectionedJobs(feed), [feed]);
  const allProtoJobs = useMemo(
    () => [...sections.recent, ...sections.recommended],
    [sections]
  );

  // Poll the auto-apply queues at page level: needs-attention + needs-
  // verification counts drive the tab badges, and the full job-id list
  // drives the Discover filter (any job already in the auto-apply pipeline
  // gets hidden so the user can't double-fire and clutter the queue).
  const [needsAttentionCount, setNeedsAttentionCount] = useState<number>(0);
  const [needsVerificationCount, setNeedsVerificationCount] = useState<number>(0);
  const [autoAppliedJobIds, setAutoAppliedJobIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const refresh = async () => {
      try {
        const api = await import("@/services/api");
        const [na, nv, all] = await Promise.all([
          api.listNeedsAttention(),
          api.listNeedsVerification(),
          api.listAutoApplyJobs(),
        ]);
        if (cancelled) return;
        setNeedsAttentionCount((na.items || []).length);
        setNeedsVerificationCount((nv.items || []).length);
        const ids = new Set<string>();
        for (const item of all.items || []) {
          const jid = (item as any).job_id;
          if (jid) ids.add(String(jid));
        }
        setAutoAppliedJobIds(ids);
      } catch {
        /* swallow; next poll will retry */
      }
    };
    refresh();
    const id = window.setInterval(refresh, 8000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [user]);

  // "Only show auto-apply jobs" filter. Defaults to ON because the
  // marketing claim of the feature lands hardest when the first
  // impression is "every job has an Auto-apply button." Power users
  // who need Workday / Indeed inventory (Goldman, JPM, Microsoft) flip
  // it off. Preference persists in localStorage so the choice sticks
  // across sessions.
  const [autoApplyOnly, setAutoApplyOnly] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem("jobBoard.autoApplyOnly");
      return stored === null ? true : stored === "true";
    } catch {
      return true;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem("jobBoard.autoApplyOnly", String(autoApplyOnly));
    } catch {
      /* localStorage unavailable; toggle still works for the session */
    }
  }, [autoApplyOnly]);

  const applyAutoApplyFilter = useCallback(
    (list: ProtoJob[]) =>
      autoApplyOnly ? list.filter((j) => j.autoApplyEligible) : list,
    [autoApplyOnly]
  );

  // Hide jobs the user has already auto-applied to from Discover. Status
  // lives in the dedicated tabs (Auto-submission / Needs attention).
  const applyAppliedFilter = useCallback(
    (list: ProtoJob[]) => list.filter((j) => !autoAppliedJobIds.has(j.id)),
    [autoAppliedJobIds]
  );

  // Quick-filter chips — only apply when the chip is active. AND semantics
  // across chips (Remote + Full-time = both must match), OR within each
  // chip's logic (e.g. Remote matches either explicit-remote location text
  // OR a remote work_arrangement signal in the job's metadata).
  const applyChipFilter = useCallback(
    (list: ProtoJob[]) => {
      if (activeFilters.length === 0) return list;
      const wantRemote = activeFilters.includes("Remote");
      const wantFulltime = activeFilters.includes("Full-time");
      const want100k = activeFilters.includes("$100k+");
      return list.filter((j) => {
        if (wantRemote) {
          const loc = (j.location || "").toLowerCase();
          if (!loc.includes("remote") && !loc.includes("anywhere")) return false;
        }
        if (wantFulltime) {
          const t = (j.jobType || "").toLowerCase();
          if (!t.includes("full") && t !== "fulltime") return false;
        }
        if (want100k) {
          if (!j.salaryAnnual || j.salaryAnnual < 100_000) return false;
        }
        return true;
      });
    },
    [activeFilters]
  );

  const searchedRecent = useMemo(
    () => applyAppliedFilter(applyChipFilter(applyAutoApplyFilter(applySearch(sections.recent, search)))),
    [sections.recent, search, applyAutoApplyFilter, applyChipFilter, applyAppliedFilter]
  );
  const searchedRecommended = useMemo(
    () => applyAppliedFilter(applyChipFilter(applyAutoApplyFilter(applySearch(sections.recommended, search)))),
    [sections.recommended, search, applyAutoApplyFilter, applyChipFilter, applyAppliedFilter]
  );

  // Default-select first Recent on first load; reselect when current selection
  // drops out of the visible list (e.g. dismissed or filtered away).
  useEffect(() => {
    const flat = [...searchedRecent, ...searchedRecommended].filter(
      (j) => !dismissedIds.has(j.id)
    );
    if (flat.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !flat.some((j) => j.id === selectedId)) {
      setSelectedId(flat[0].id);
    }
  }, [searchedRecent, searchedRecommended, dismissedIds, selectedId]);

  const selectedJob = useMemo(
    () => allProtoJobs.find((j) => j.id === selectedId) ?? null,
    [allProtoJobs, selectedId]
  );

  // ---- Chip operations (visual only) --------------------------------------
  const removeFilter = (k: string) => {
    setActiveFilters((prev) => prev.filter((x) => x !== k));
    setMoreFilterChips((prev) => prev.filter((x) => x !== k));
  };
  const addFilter = (k: string) =>
    setActiveFilters((prev) => (prev.includes(k) ? prev : [...prev, k]));
  const clearFilters = () => {
    setActiveFilters([]);
    setMoreFilterChips([]);
  };

  const available = QUICK_FILTERS.filter((f) => !activeFilters.includes(f.key));

  const handleApplyMoreFilters = (state: MoreFiltersState) => {
    setMoreFiltersState(state);
    if (state.describe) {
      // Push the description into the main search input so the list narrows.
      setSearch(state.describe);
    }
    const chips: string[] = [];
    chips.push(...state.experience);
    if (state.datePosted && state.datePosted !== "Any time") {
      chips.push(state.datePosted);
    }
    chips.push(...state.companySize);
    if (state.visa) chips.push("Visa Sponsorship");
    setMoreFilterChips(chips);
  };

  // ---- Action handlers ----------------------------------------------------
  // Apply just opens the URL — no auto-tracking. Opening a tab doesn't
  // mean the user submitted an application, so tracking it would create
  // false memory.
  const handleApply = (j: ProtoJob) => {
    if (j.applyUrl) window.open(j.applyUrl, "_blank", "noopener,noreferrer");
  };

  // Auto-apply flow (v2 fire-and-forget):
  //   1. Pro/Elite gate (frontend-side; backend rechecks).
  //   2. POST /submit directly (no prepare/modal step). The job lands in
  //      autoApplyJobs status="queued" and a background worker takes over.
  //   3. Switch the active tab to "auto-submission" so the user sees the
  //      in-flight card immediately. They can keep clicking Auto-apply on
  //      other jobs while the background workers run.
  //   4. If the worker hits a question with no saved answer, it bails with
  //      status="needs_attention" and the card moves to the Needs Attention
  //      tab. The user resolves via NeedsAttentionDrawer; the worker resumes.
  //
  // The legacy prepare/modal flow is still wired (showReviewModal +
  // AutoApplyReviewModal) but no longer triggered by the default Auto-apply
  // button — it remains as an advanced preview-only escape hatch.
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [pendingAutoApplyJob, setPendingAutoApplyJob] =
    useState<ProtoJob | null>(null);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [reviewPrepared, setReviewPrepared] =
    useState<AutoApplyPrepareResponse | null>(null);
  // Job id currently in-flight for auto-apply. Drives the JobDetail button's
  // disabled + spinner state so the user can't double-tap during the network
  // round-trip and stares at a clear "Applying…" affordance.
  const [autoApplyingId, setAutoApplyingId] = useState<string | null>(null);

  const handleAutoApply = useCallback(async (j: ProtoJob) => {
    if (!j.autoApplyEligible) return;
    if (!user || user.tier === "free") {
      toast({
        title: "Auto-apply is a Pro feature",
        description: "Upgrade to have Offerloop fill the application for you.",
      });
      return;
    }
    if (autoApplyingId === j.id) return;
    setAutoApplyingId(j.id);

    let res;
    try {
      res = await submitAutoApply(j.id, { dry_run: false, edited_answers: {} });
    } finally {
      setAutoApplyingId(null);
    }

    if (res.ok && res.data.auto_apply_id) {
      toast({
        title: "Applying in the background",
        description: "We'll let you know if a question needs your input.",
      });
      // Optimistic update: hide the job from Discover immediately rather
      // than waiting for the 8s autoAppliedJobIds poll. Avoids the dead
      // window where the user can re-click Auto-apply on the same card.
      // The next poll will confirm + persist the state.
      setAutoAppliedJobIds((prev) => {
        const next = new Set(prev);
        next.add(j.id);
        return next;
      });
      // Stay on Discover so the user can keep clicking Auto-apply on more
      // jobs without the tab yanking them away. The toast + the Needs
      // Attention badge handle notification.
      return;
    }

    const code = (res.data as any)?.code;
    if (code === "PROFILE_REQUIRED" || code === "WORK_AUTH_REQUIRED") {
      setPendingAutoApplyJob(j);
      setShowProfileModal(true);
      if (code === "WORK_AUTH_REQUIRED") {
        toast({
          title: "Work authorization required",
          description: "Set your work-authorization answer to continue.",
        });
      }
      return;
    }
    if (code === "INELIGIBLE") {
      toast({
        title: "Auto-apply unavailable",
        description: "This job's source ATS isn't supported yet.",
      });
      return;
    }
    if (code === "INSUFFICIENT_CREDITS") {
      toast({
        title: "Not enough credits",
        description: "Top up to keep auto-applying.",
        variant: "destructive",
      });
      return;
    }
    if (code === "BROWSERLESS_NOT_CONFIGURED") {
      toast({
        title: "Auto-apply isn't live yet",
        description: "Browserless isn't configured in this environment.",
        variant: "destructive",
      });
      return;
    }
    toast({
      title: "Couldn't start auto-apply",
      description: (res.data as any)?.error || "Try again in a moment.",
      variant: "destructive",
    });
  }, [user, autoApplyingId]);

  const toFindHumansJob = (j: ProtoJob): FindHumansJob => ({
    id: j.id,
    title: j.title,
    company: j.company,
    location: j.location,
    description: j.description ?? undefined,
    url: j.applyUrl,
  });

  const openFindHumans = (j: ProtoJob) => setFindHumansJob(toFindHumansJob(j));

  // Minimal converter for rendering Saved / Applied snapshots in JobCard.
  // Live feed enrichment (tags, match signals, salary, description) isn't
  // preserved in the snapshot — those fields default to empty / null.
  const snapshotToProto = (s: SavedJob): ProtoJob => ({
    id: s.job_id,
    section: "recommended",
    title: s.title ?? "",
    company: s.company ?? "",
    logoUrl: s.logo_url ?? null,
    logoMonogram: (s.company ?? "?").charAt(0).toUpperCase(),
    posted: "",
    postedISO: null,
    location: s.location ?? "",
    jobType: "",
    category: "",
    match: s.match_score ?? null,
    matchSignals: [],
    whyLine: "",
    ranked: true,
    salary: null,
    salaryAnnual: null,
    tags: [],
    applyUrl: s.apply_url ?? "",
    atsPlatform: null,
    autoApplyEligible: false,
    isNew: false,
    isStale: false,
    detailPosted: "",
    detailMatch: s.match_score ?? null,
    detailLocation: s.location ?? "",
    description: null,
    structured: undefined,
  });

  const savedProtoJobs = useMemo(
    () => applySearch(savedJobs.map(snapshotToProto), search),
    [savedJobs, search]
  );

  const handleSave = async (j: ProtoJob) => {
    const already = savedIds.has(j.id);
    try {
      if (already) {
        await apiService.unsaveJob(j.id);
        setSavedIds((prev) => {
          const next = new Set(prev);
          next.delete(j.id);
          return next;
        });
        setSavedJobs((prev) => prev.filter((p) => p.job_id !== j.id));
      } else {
        const snap: SavedJob = {
          job_id: j.id,
          title: j.title,
          company: j.company,
          location: j.location,
          apply_url: j.applyUrl,
          match_score: j.match ?? undefined,
          logo_url: j.logoUrl ?? undefined,
        };
        await apiService.saveJob(snap);
        setSavedIds((prev) => new Set(prev).add(j.id));
        setSavedJobs((prev) => [snap, ...prev.filter((p) => p.job_id !== j.id)]);
      }
    } catch (err) {
      console.error("save toggle failed", err);
      toast({
        title: "Couldn't update saved jobs",
        variant: "destructive",
      });
    }
  };

  const handleDismiss = (id: string) => {
    setDismissedIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  };
  const handleUndoDismiss = (id: string) => {
    setDismissedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  // ---- Render -------------------------------------------------------------
  if (authLoading) return <JobBoardSkeleton />;

  // Header counts: prototype shows "100 new jobs · 100 currently saved jobs".
  // Wire to real numbers from feed + savedIds.
  const newCount = sections.recent.length;
  const savedCount = savedIds.size;

  return (
    <SidebarProvider>
      <div className="flex h-screen w-full overflow-hidden">
        <AppSidebar />
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          <AppHeader title="Job Board" />
          <div className="flex-1 min-h-0 overflow-hidden">
            <div className="jb-editorial">
              {/* ---- FilterBar (pinned) ---- */}
              <div className="jb-fb">
                <div className="jb-fb-row">
                  <div>
                    <h1 className="jb-fb-title">Discover Opportunities</h1>
                    <p className="jb-fb-subtitle">
                      {newCount} new jobs · {savedCount} saved
                    </p>
                  </div>
                </div>

                {/* Top-level tabs — Outbox-style segmented control */}
                <div
                  style={{
                    display: "flex",
                    gap: 4,
                    marginTop: 12,
                    marginBottom: 4,
                    borderBottom: "1px solid var(--line, #E5E5E5)",
                  }}
                >
                  {([
                    { id: "discover", label: "Discover", count: sections.recent.length + sections.recommended.length, dot: false },
                    { id: "saved", label: "Saved", count: savedJobs.length, dot: false },
                    { id: "auto-submission", label: "Auto-submission", count: 0, dot: false },
                    // Notification dot when there's actually work waiting on the user.
                    { id: "needs-attention", label: "Needs attention", count: needsAttentionCount, dot: needsAttentionCount > 0 },
                    // Finish-in-browser is now rare (the email-code path handles
                    // most Greenhouse verification automatically). Hide the tab
                    // entirely when empty so it doesn't clutter the header.
                    ...(needsVerificationCount > 0
                      ? [{ id: "needs-verification" as const, label: "Finish in browser", count: needsVerificationCount, dot: true }]
                      : []),
                  ] as const).map((t) => {
                    const isActive = activeJobTab === t.id;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setActiveJobTab(t.id)}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                          padding: "10px 16px",
                          fontSize: 13,
                          fontWeight: isActive ? 600 : 500,
                          color: isActive ? "var(--brand-blue, #3B82F6)" : "var(--ink-3, #94A3B8)",
                          background: "transparent",
                          border: "none",
                          borderBottom: isActive
                            ? "2px solid var(--brand-blue, #3B82F6)"
                            : "2px solid transparent",
                          marginBottom: -1,
                          cursor: "pointer",
                          fontFamily: "inherit",
                          transition: "color .15s, border-color .15s",
                        }}
                        onMouseEnter={(e) => {
                          if (!isActive) (e.currentTarget as HTMLButtonElement).style.color = "var(--ink-2, #475569)";
                        }}
                        onMouseLeave={(e) => {
                          if (!isActive) (e.currentTarget as HTMLButtonElement).style.color = "var(--ink-3, #94A3B8)";
                        }}
                      >
                        {t.label}
                        {t.dot && (
                          <span
                            style={{
                              display: "inline-block",
                              width: 7,
                              height: 7,
                              borderRadius: "50%",
                              background: "#EF4444",
                              marginLeft: -2,
                            }}
                            aria-label="needs your attention"
                          />
                        )}
                        {t.count > 0 && (
                          <span
                            style={{
                              fontFamily: "'JetBrains Mono', monospace",
                              fontSize: 10,
                              padding: "1px 6px",
                              borderRadius: 4,
                              background: isActive ? "var(--primary-50, #EEF1F9)" : "var(--paper-2, #FAFBFF)",
                              color: isActive ? "var(--accent, #4A60A8)" : "var(--ink-3, #94A3B8)",
                            }}
                          >
                            {t.count}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>

                <div className="jb-fb-actions">
                  <div className="jb-search">
                    <span className="jb-search-icon"><IconSearch /></span>
                    <input
                      type="text"
                      placeholder="Search for jobs by Name, Company or Title..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </div>
                  <button
                    className="jb-fb-btn"
                    type="button"
                    onClick={() => setShowSaveSearch(true)}
                  >
                    <IconSavedBookmark />
                    Save Search
                  </button>
                  <button
                    className="jb-fb-btn"
                    type="button"
                    onClick={() => setShowMoreFilters(true)}
                  >
                    <IconFilter />
                    More Filters
                  </button>
                  <button
                    className="jb-fb-btn"
                    type="button"
                    onClick={() => setAutoApplyOnly((v) => !v)}
                    title={
                      autoApplyOnly
                        ? "Currently showing only jobs with one-click Auto-apply. Click to also show jobs that require manual application (Workday, custom careers pages)."
                        : "Currently showing all jobs. Click to show only jobs with one-click Auto-apply."
                    }
                    style={{
                      background: autoApplyOnly ? "#3B82F6" : undefined,
                      color: autoApplyOnly ? "#fff" : undefined,
                      borderColor: autoApplyOnly ? "#3B82F6" : undefined,
                    }}
                  >
                    <span style={{ marginRight: 4 }}>
                      {autoApplyOnly ? "✓" : ""}
                    </span>
                    Auto-apply only
                  </button>
                  <button
                    className="jb-fb-btn jb-fb-btn-icon"
                    type="button"
                    title="Refresh and reshuffle"
                    onClick={() => loadFeed(true)}
                    disabled={feedLoading}
                  >
                    <IconRefresh />
                  </button>
                </div>

                <div className="jb-chips">
                  <span className="jb-chips-label">Active filters:</span>
                  {(activeFilters.length + moreFilterChips.length) > 0 ? (
                    <>
                      {activeFilters.map((k) => {
                        const def = QUICK_FILTERS.find((q) => q.key === k);
                        const label = def ? def.label : k;
                        return (
                          <span key={`q-${k}`} className="jb-chip">
                            {label}
                            <button
                              type="button"
                              className="jb-chip-close"
                              onClick={() => removeFilter(k)}
                              aria-label={`Remove ${k}`}
                            >
                              <IconClose />
                            </button>
                          </span>
                        );
                      })}
                      {moreFilterChips.map((k) => (
                        <span key={`m-${k}`} className="jb-chip">
                          {k}
                          <button
                            type="button"
                            className="jb-chip-close"
                            onClick={() => removeFilter(k)}
                            aria-label={`Remove ${k}`}
                          >
                            <IconClose />
                          </button>
                        </span>
                      ))}
                      {available.length > 0 && (
                        <div className="jb-chip-add-wrap" ref={addDropdownRef}>
                          <button
                            type="button"
                            className="jb-chip-add"
                            onClick={() => setShowAddDropdown((v) => !v)}
                          >
                            <IconPlus />
                            Add Filter
                          </button>
                          {showAddDropdown && (
                            <div className="jb-dropdown">
                              {available.map((f) => (
                                <button
                                  key={f.key}
                                  type="button"
                                  onClick={() => {
                                    addFilter(f.key);
                                    setShowAddDropdown(false);
                                  }}
                                >
                                  {f.label}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                      <button
                        type="button"
                        className="jb-chip-clear"
                        onClick={clearFilters}
                      >
                        Clear all
                      </button>
                    </>
                  ) : (
                    <div className="jb-chip-add-wrap" ref={addDropdownRef}>
                      <button
                        type="button"
                        className="jb-chip-add"
                        onClick={() => setShowAddDropdown((v) => !v)}
                      >
                        <IconPlus />
                        Add Filter
                      </button>
                      {showAddDropdown && (
                        <div className="jb-dropdown">
                          {QUICK_FILTERS.map((f) => (
                            <button
                              key={f.key}
                              type="button"
                              onClick={() => {
                                addFilter(f.key);
                                setShowAddDropdown(false);
                              }}
                            >
                              {f.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* ---- Body ---- */}
              {/* discover / saved: two-pane editorial layout.
                  auto-submission / needs-attention: full-width queue view. */}
              {activeJobTab === "auto-submission" ? (
                <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
                  <AutoSubmissionTab />
                </div>
              ) : activeJobTab === "needs-attention" ? (
                <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
                  <NeedsAttentionTab />
                </div>
              ) : activeJobTab === "needs-verification" ? (
                <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
                  <NeedsVerificationTab />
                </div>
              ) : (
              <div className="jb-twopane">
                <div className="jb-list">
                  {feedLoading && (
                    <div className="jb-loading">Loading roles...</div>
                  )}

                  {!feedLoading && searchedRecent.length === 0 && searchedRecommended.length === 0 && (
                    <div className="jb-empty" style={{ margin: "16px 8px" }}>
                      <div className="h">No roles match your search.</div>
                      <div className="b">
                        Try clearing the search box or check back after the
                        next pipeline run.
                      </div>
                    </div>
                  )}

                  {activeJobTab === "discover" && !feedLoading && searchedRecent.length > 0 && (
                    <>
                      <button
                        type="button"
                        className="jb-section-heading jb-section-toggle"
                        onClick={() => toggleSection("recent")}
                        aria-expanded={!collapsedSections.recent}
                      >
                        <span
                          className={`jb-section-chevron ${collapsedSections.recent ? "collapsed" : "expanded"}`}
                          aria-hidden="true"
                        >
                          ▾
                        </span>
                        Recent job postings
                        <span className="jb-section-count">{searchedRecent.length}</span>
                      </button>
                      {!collapsedSections.recent && searchedRecent.map((j) => (
                        <JobCard
                          key={j.id}
                          job={j}
                          selected={selectedId === j.id}
                          dismissed={dismissedIds.has(j.id)}
                          onClick={() => !dismissedIds.has(j.id) && setSelectedId(j.id)}
                          onDismiss={() => handleDismiss(j.id)}
                          onUndo={() => handleUndoDismiss(j.id)}
                        />
                      ))}
                    </>
                  )}

                  {activeJobTab === "discover" && !feedLoading && searchedRecommended.length > 0 && (
                    <>
                      <button
                        type="button"
                        className="jb-section-heading jb-section-toggle"
                        onClick={() => toggleSection("recommended")}
                        aria-expanded={!collapsedSections.recommended}
                      >
                        <span
                          className={`jb-section-chevron ${collapsedSections.recommended ? "collapsed" : "expanded"}`}
                          aria-hidden="true"
                        >
                          ▾
                        </span>
                        Recommended for you
                        <span className="jb-section-count">{searchedRecommended.length}</span>
                      </button>
                      {!collapsedSections.recommended && searchedRecommended.map((j) => (
                        <JobCard
                          key={j.id}
                          job={j}
                          selected={selectedId === j.id}
                          dismissed={dismissedIds.has(j.id)}
                          onClick={() => !dismissedIds.has(j.id) && setSelectedId(j.id)}
                          onDismiss={() => handleDismiss(j.id)}
                          onUndo={() => handleUndoDismiss(j.id)}
                        />
                      ))}
                    </>
                  )}

                  {/* Saved tab: list of bookmarked jobs */}
                  {activeJobTab === "saved" && (
                    savedProtoJobs.length > 0 ? (
                      savedProtoJobs.map((j) => (
                        <JobCard
                          key={`saved-${j.id}`}
                          job={j}
                          selected={selectedId === j.id}
                          dismissed={false}
                          onClick={() => setSelectedId(j.id)}
                          // On the Saved tab the X icon unsaves the job
                          // rather than dismissing it locally — the card
                          // exists BECAUSE it's saved, so removing it is
                          // an unsave action.
                          onDismiss={() => handleSave(j)}
                          onUndo={() => {}}
                        />
                      ))
                    ) : (
                      <div style={{ padding: "40px 16px", textAlign: "center", color: "var(--ink-3, #94A3B8)", fontSize: 13 }}>
                        <div style={{ fontSize: 14, fontWeight: 500, color: "var(--ink-2, #475569)", marginBottom: 6 }}>
                          No saved jobs yet
                        </div>
                        Click the bookmark icon on any job to save it here.
                      </div>
                    )
                  )}
                </div>

                <div className="jb-detail">
                  {selectedJob ? (
                    <JobDetail
                      job={selectedJob}
                      isSaved={savedIds.has(selectedJob.id)}
                      onApply={() => handleApply(selectedJob)}
                      onAutoApply={
                        selectedJob.autoApplyEligible
                          ? () => handleAutoApply(selectedJob)
                          : undefined
                      }
                      autoApplyLoading={autoApplyingId === selectedJob.id}
                      onSave={() => handleSave(selectedJob)}
                      onShare={() => {
                        if (selectedJob.applyUrl) {
                          navigator.clipboard?.writeText(selectedJob.applyUrl);
                          toast({ title: "Job link copied" });
                        }
                      }}
                      onFindPeople={() => openFindHumans(selectedJob)}
                      userPlan={(user?.tier as "free" | "pro" | "elite") || "free"}
                      currentCredits={(user as any)?.credits ?? 0}
                    />
                  ) : (
                    <div className="jb-loading">Select a role to see details.</div>
                  )}
                </div>
              </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <SaveSearchModal
        open={showSaveSearch}
        onClose={() => setShowSaveSearch(false)}
        currentFilters={activeFilters}
      />

      <ApplicationProfileModal
        open={showProfileModal}
        onOpenChange={(open) => {
          setShowProfileModal(open);
          if (!open) setPendingAutoApplyJob(null);
        }}
        onSaved={() => {
          setShowProfileModal(false);
          if (pendingAutoApplyJob) {
            const j = pendingAutoApplyJob;
            setPendingAutoApplyJob(null);
            handleAutoApply(j);
          }
        }}
      />

      <AutoApplyReviewModal
        open={showReviewModal}
        onOpenChange={(open) => {
          setShowReviewModal(open);
          if (!open) setReviewPrepared(null);
        }}
        prepared={reviewPrepared}
        onEditProfile={() => {
          setShowReviewModal(false);
          setShowProfileModal(true);
        }}
      />
      <MoreFiltersPanel
        open={showMoreFilters}
        onClose={() => setShowMoreFilters(false)}
        onApply={handleApplyMoreFilters}
        initial={moreFiltersState ?? undefined}
      />
      <FindHumansModal
        open={!!findHumansJob}
        onOpenChange={(o) => !o && setFindHumansJob(null)}
        job={findHumansJob}
      />
    </SidebarProvider>
  );
};

export default JobBoardPage;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function applySearch(list: ProtoJob[], search: string): ProtoJob[] {
  if (!search.trim()) return list;
  const q = search.trim().toLowerCase();
  return list.filter(
    (j) =>
      j.title.toLowerCase().includes(q) ||
      j.company.toLowerCase().includes(q) ||
      j.location.toLowerCase().includes(q)
  );
}
