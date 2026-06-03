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
  { key: "Quick Apply", label: "Quick Apply" },
];

export const JobBoardPage: React.FC = () => {
  const { user, isLoading: authLoading } = useFirebaseAuth();

  // ---- Server data --------------------------------------------------------
  const [feed, setFeed] = useState<JobFeedResponse | null>(null);
  const [feedLoading, setFeedLoading] = useState(true);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());

  // ---- Local UI state -----------------------------------------------------
  const [search, setSearch] = useState("");
  const [activeFilters, setActiveFilters] = useState<string[]>(
    QUICK_FILTERS.map((f) => f.key)
  );
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

  const searchedRecent = useMemo(
    () => applySearch(sections.recent, search),
    [sections.recent, search]
  );
  const searchedRecommended = useMemo(
    () => applySearch(sections.recommended, search),
    [sections.recommended, search]
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
  const handleApply = (j: ProtoJob) => {
    if (j.applyUrl) window.open(j.applyUrl, "_blank", "noopener,noreferrer");
  };

  const toFindHumansJob = (j: ProtoJob): FindHumansJob => ({
    id: j.id,
    title: j.title,
    company: j.company,
    location: j.location,
    description: j.description ?? undefined,
    url: j.applyUrl,
  });

  const openFindHumans = (j: ProtoJob) => setFindHumansJob(toFindHumansJob(j));

  const handleSave = async (j: ProtoJob) => {
    const already = savedIds.has(j.id);
    try {
      if (already) {
        await apiService.unsaveJob(j.id);
        const next = new Set(savedIds);
        next.delete(j.id);
        setSavedIds(next);
      } else {
        await apiService.saveJob({
          job_id: j.id,
          title: j.title,
          company: j.company,
          location: j.location,
          apply_url: j.applyUrl,
          match_score: j.match ?? undefined,
        });
        const next = new Set(savedIds);
        next.add(j.id);
        setSavedIds(next);
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
                      {newCount} new jobs · {savedCount} currently saved jobs
                    </p>
                  </div>
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

              {/* ---- Two-pane body (independent scroll) ---- */}
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

                  {!feedLoading && searchedRecent.length > 0 && (
                    <>
                      <h2 className="jb-section-heading">Recent job postings</h2>
                      {searchedRecent.map((j) => (
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

                  {!feedLoading && searchedRecommended.length > 0 && (
                    <>
                      <h2 className="jb-section-heading">Recommended for you</h2>
                      {searchedRecommended.map((j) => (
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
                </div>

                <div className="jb-detail">
                  {selectedJob ? (
                    <JobDetail
                      job={selectedJob}
                      isSaved={savedIds.has(selectedJob.id)}
                      onApply={() => handleApply(selectedJob)}
                      onSave={() => handleSave(selectedJob)}
                      onShare={() => {
                        if (selectedJob.applyUrl) {
                          navigator.clipboard?.writeText(selectedJob.applyUrl);
                          toast({ title: "Job link copied" });
                        }
                      }}
                      onFindPeople={() => openFindHumans(selectedJob)}
                      userPlan="free"
                      currentCredits={210}
                    />
                  ) : (
                    <div className="jb-loading">Select a role to see details.</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <SaveSearchModal
        open={showSaveSearch}
        onClose={() => setShowSaveSearch(false)}
        currentFilters={activeFilters}
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
