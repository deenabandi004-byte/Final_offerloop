import { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppHeader } from "@/components/AppHeader";
import { useFirebaseAuth } from "@/contexts/FirebaseAuthContext";
import { useToast } from "@/hooks/use-toast";
import { apiService } from "@/services/api";
import {
  outboxThreadToProto,
  groupedByStage,
  groupedByCompany,
  protoStageToBackend,
  type ProtoStage,
  type ProtoSegment,
  type ProtoContact,
} from "@/pages/trackerAdapter";
import { ProtoHeader } from "@/components/tracker/redesign/ProtoHeader";
import { ProtoToolbar } from "@/components/tracker/redesign/ProtoToolbar";
import { SegmentTabs } from "@/components/tracker/redesign/SegmentTabs";
import { ContactListAccordion } from "@/components/tracker/redesign/ContactListAccordion";
import { CompanyGroupedList } from "@/components/tracker/redesign/CompanyGroupedList";
import { ProtoContactCard } from "@/components/tracker/redesign/ProtoContactCard";
import { ProtoDetailHeader } from "@/components/tracker/redesign/ProtoDetailHeader";
import { ProtoPipelineDots } from "@/components/tracker/redesign/ProtoPipelineDots";
import { ProtoEmailBlock, type TemplateKey } from "@/components/tracker/redesign/ProtoEmailBlock";
import { ProtoSpreadsheet, type SpreadsheetSort, type SpreadsheetSortKey } from "@/components/tracker/redesign/ProtoSpreadsheet";
import { FILTER_LABELS, type SortKey } from "@/components/tracker/redesign/MoreFiltersDropdown";
import "./NetworkTrackerRedesign.css";

// Write paths live here:
//   - archiveMutation / stageMutation (real backend writes — see below)
//   - toggleBookmark(id) — flips an in-memory Set, lost on refresh
//   - toggleRow(id) — same for spreadsheet row checkboxes
//   - stubAction(label) — remaining placeholders (Save Draft / Send via Gmail
//     / Import CSV / Export / Edit Template / Draft email) that aren't wired
//     yet; surface a "${label} wired in a later PR" toast.

export default function NetworkTrackerRedesign() {
  const { user } = useFirebaseAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // The active-list data query. Same key as the production /tracker page so
  // they share the React Query cache. 30s refetch matches existing behavior.
  const { data: threadsData, isLoading, isError } = useQuery({
    queryKey: ["trackerContacts"],
    queryFn: async () => {
      const res = await apiService.getOutboxThreads();
      if ("error" in res) throw new Error(res.error);
      return res.threads;
    },
    enabled: !!user,
    refetchInterval: 30_000,
  });

  // Separate query for the Archived segment. Lazy: only runs when the user
  // navigates to the Archived tab, so the active workflow doesn't pay for
  // archived rows on every refetch. include_archived returns BOTH active and
  // archived from the backend; we filter to archivedAt-set on the client.
  const { data: archivedRaw, isLoading: archivedLoading, isError: archivedError } = useQuery({
    queryKey: ["trackerContacts", "archived"],
    queryFn: async () => {
      const res = await apiService.getOutboxThreads({ include_archived: true });
      if ("error" in res) throw new Error(res.error);
      return res.threads.filter((t) => !!t.archivedAt);
    },
    // segment-gating happens below, but we always enable when authed so the
    // count badge in the tab can render correctly. 60s refetch — archived
    // changes much less often than the active list.
    enabled: !!user,
    refetchInterval: 60_000,
  });

  // ── Local UI state ──────────────────────────────────────────────────────
  const [view, setView] = useState<"default" | "spreadsheet">("default");
  const [segment, setSegment] = useState<ProtoSegment>("people");
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set());
  const [bookmarkedOnly, setBookmarkedOnly] = useState(false);
  const [bookmarkedIds, setBookmarkedIds] = useState<Set<string>>(new Set());
  const [openGroups, setOpenGroups] = useState<Record<ProtoStage, boolean>>({
    saved: true,
    contacted: false,
    connected: false,
    interviewing: false,
    offer: false,
  });
  const [openCompanies, setOpenCompanies] = useState<Record<string, boolean>>({});
  const [activeTemplate, setActiveTemplate] = useState<TemplateKey>("networking");
  const [spreadsheetPage, setSpreadsheetPage] = useState(1);
  const [spreadsheetSort, setSpreadsheetSort] = useState<SpreadsheetSort | null>(null);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());

  // ── The three write paths ───────────────────────────────────────────────
  const stubAction = useCallback(
    (label: string) => () => {
      toast({ title: `${label} wired in a later PR` });
    },
    [toast]
  );

  // Archive: POST /outbox/threads/<id>/archive. On success, drop the contact
  // from the visible list by invalidating the trackerContacts query and clear
  // the selection if the archived row was open in the detail pane.
  const archiveMutation = useMutation({
    mutationFn: async (contactId: string) => {
      const res = await apiService.archiveOutboxThread(contactId);
      if ("error" in res) throw new Error(res.error);
      return { contactId, thread: res.thread };
    },
    onSuccess: ({ contactId }) => {
      // Invalidate both lists: row leaves active, joins archived.
      queryClient.invalidateQueries({ queryKey: ["trackerContacts"] });
      setSelectedContactId((curr) => (curr === contactId ? null : curr));
      toast({ title: "Archived" });
    },
    onError: (err: Error) => {
      toast({ title: "Couldn't archive", description: err.message, variant: "destructive" });
    },
  });

  // Unarchive: POST /outbox/threads/<id>/unarchive. Mirrors archive on
  // success, clearing the selection if the now-restored contact was open
  // (it'll re-resolve from the active query on the next render).
  const unarchiveMutation = useMutation({
    mutationFn: async (contactId: string) => {
      const res = await apiService.unarchiveOutboxThread(contactId);
      if ("error" in res) throw new Error(res.error);
      return { contactId, thread: res.thread };
    },
    onSuccess: ({ contactId }) => {
      queryClient.invalidateQueries({ queryKey: ["trackerContacts"] });
      setSelectedContactId((curr) => (curr === contactId ? null : curr));
      toast({ title: "Restored" });
    },
    onError: (err: Error) => {
      toast({ title: "Couldn't restore", description: err.message, variant: "destructive" });
    },
  });

  // Pipeline-stage click: most stages → PUT /outbox/threads/<id>/stage with
  // the inverse-mapped backend stage. "offer" goes through markOutboxThreadWon
  // because the adapter recognises Offer via resolution=meeting_booked, not
  // a pipelineStage value.
  const stageMutation = useMutation({
    mutationFn: async ({ contactId, stage }: { contactId: string; stage: ProtoStage }) => {
      const res =
        stage === "offer"
          ? await apiService.markOutboxThreadWon(contactId)
          : await apiService.patchOutboxStage(contactId, protoStageToBackend(stage));
      if ("error" in res) throw new Error(res.error);
      return res.thread;
    },
    onSuccess: (_thread, { stage }) => {
      queryClient.invalidateQueries({ queryKey: ["trackerContacts"] });
      toast({ title: `Moved to ${stage.charAt(0).toUpperCase()}${stage.slice(1)}` });
    },
    onError: (err: Error) => {
      toast({ title: "Couldn't update stage", description: err.message, variant: "destructive" });
    },
  });

  const toggleBookmark = useCallback((id: string) => {
    setBookmarkedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleRow = useCallback((id: string) => {
    setSelectedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // ── Pure read-side derivation ───────────────────────────────────────────
  const protoContacts = useMemo<ProtoContact[]>(
    () => (threadsData ?? []).map(outboxThreadToProto),
    [threadsData]
  );

  // Archived contacts as ProtoContacts, newest-archived first. The Archived
  // segment renders this as a flat list — no accordion grouping, no stage
  // filters, since the dimension that matters here is "when was this put
  // away."
  const archivedContacts = useMemo<ProtoContact[]>(
    () =>
      (archivedRaw ?? [])
        .map(outboxThreadToProto)
        .sort((a, b) =>
          (b.archivedAt ?? "").localeCompare(a.archivedAt ?? "")
        ),
    [archivedRaw]
  );

  // Counts for the active-filter pills, computed off the unfiltered list.
  const filterCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const c of protoContacts) {
      if (c.stage) {
        const key = `stage:${c.stage}`;
        counts[key] = (counts[key] ?? 0) + 1;
      }
      if (c.status === "Reply") {
        counts["has-reply"] = (counts["has-reply"] ?? 0) + 1;
      }
    }
    return counts;
  }, [protoContacts]);

  const filteredContacts = useMemo(() => {
    let result = protoContacts;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.company.toLowerCase().includes(q) ||
          c.email.toLowerCase().includes(q)
      );
    }

    const stageFilters = Array.from(activeFilters).filter((f) => f.startsWith("stage:"));
    if (stageFilters.length > 0) {
      const allowed = new Set(stageFilters.map((f) => f.replace("stage:", "")));
      result = result.filter((c) => c.stage && allowed.has(c.stage));
    }

    if (activeFilters.has("has-reply")) {
      result = result.filter((c) => c.status === "Reply");
    }

    if (bookmarkedOnly) {
      result = result.filter((c) => bookmarkedIds.has(c.id));
    }

    if (sortKey) {
      const sorted = [...result];
      switch (sortKey) {
        case "name-asc":
          sorted.sort((a, b) => a.name.localeCompare(b.name));
          break;
        case "name-desc":
          sorted.sort((a, b) => b.name.localeCompare(a.name));
          break;
        case "date-newest":
          sorted.sort((a, b) => a.daysAgo - b.daysAgo);
          break;
        case "date-oldest":
          sorted.sort((a, b) => b.daysAgo - a.daysAgo);
          break;
        case "company-asc":
          sorted.sort((a, b) => a.company.localeCompare(b.company));
          break;
      }
      result = sorted;
    }

    return result;
  }, [protoContacts, searchQuery, activeFilters, bookmarkedOnly, bookmarkedIds, sortKey]);

  const stageGroups = useMemo(() => groupedByStage(filteredContacts), [filteredContacts]);
  const companyGroups = useMemo(() => groupedByCompany(filteredContacts), [filteredContacts]);

  // Lookup against the FULL list so a selected contact does not disappear
  // when the user adds a filter that would exclude it from the visible list.
  // Lookup against BOTH the active and archived lists so the detail pane
  // keeps working when the user selects an archived contact.
  const selectedContact = useMemo(
    () =>
      protoContacts.find((c) => c.id === selectedContactId) ??
      archivedContacts.find((c) => c.id === selectedContactId) ??
      null,
    [protoContacts, archivedContacts, selectedContactId]
  );

  // Search-filtered archived list. Stage filters and the bookmark-only
  // pill don't apply to archived (different mental model — these are off
  // the active board entirely).
  const filteredArchived = useMemo(() => {
    if (!searchQuery.trim()) return archivedContacts;
    const q = searchQuery.toLowerCase();
    return archivedContacts.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.company.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q)
    );
  }, [archivedContacts, searchQuery]);

  // ── Local UI handlers (no writes) ───────────────────────────────────────
  const toggleFilter = useCallback((id: string) => {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const clearFilters = useCallback(() => {
    setActiveFilters(new Set());
    setSortKey(null);
  }, []);

  const toggleGroup = useCallback((stage: ProtoStage) => {
    setOpenGroups((prev) => ({ ...prev, [stage]: !prev[stage] }));
  }, []);

  const toggleCompany = useCallback((company: string, currentlyOpen: boolean) => {
    setOpenCompanies((prev) => ({ ...prev, [company]: !currentlyOpen }));
  }, []);

  const handleSpreadsheetSort = useCallback((key: SpreadsheetSortKey) => {
    setSpreadsheetSort((prev) => {
      if (prev && prev.key === key) {
        return { key, dir: prev.dir === "asc" ? "desc" : "asc" };
      }
      return { key, dir: "asc" };
    });
  }, []);

  const toggleAllVisible = useCallback((visible: ProtoContact[]) => {
    setSelectedRows((prev) => {
      const allSelected = visible.length > 0 && visible.every((c) => prev.has(c.id));
      const next = new Set(prev);
      if (allSelected) visible.forEach((c) => next.delete(c.id));
      else visible.forEach((c) => next.add(c.id));
      return next;
    });
  }, []);

  const userName = user?.displayName || "";
  const userEmail = user?.email || "";

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <SidebarProvider>
      <div className="flex h-screen w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <AppHeader />
          <main className="tracker-redesign">
            <div className="filter-bar">
              <ProtoHeader />
              <ProtoToolbar
                view={view}
                onChangeView={setView}
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                sortKey={sortKey}
                activeFilters={activeFilters}
                onSortChange={setSortKey}
                onFilterToggle={toggleFilter}
                onClearFilters={clearFilters}
                bookmarkedOnly={bookmarkedOnly}
                onToggleBookmarkedOnly={() => setBookmarkedOnly((v) => !v)}
                onImportCsv={stubAction("Import CSV")}
                onExport={stubAction("Export")}
              />
              {activeFilters.size > 0 && (
                <div className="active-filters">
                  <span className="active-filters-label">Active filters:</span>
                  {Array.from(activeFilters).map((id) => (
                    <span key={id} className="active-filter-pill">
                      <span className="active-filter-label">{FILTER_LABELS[id] || id}</span>
                      {filterCounts[id] != null && (
                        <span className="active-filter-count">({filterCounts[id]})</span>
                      )}
                      <button
                        type="button"
                        className="active-filter-remove"
                        onClick={() => toggleFilter(id)}
                        aria-label={`Remove ${FILTER_LABELS[id] || id}`}
                      >
                        <svg viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <line x1="3.5" y1="3.5" x2="10.5" y2="10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                          <line x1="10.5" y1="3.5" x2="3.5" y2="10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                        </svg>
                      </button>
                    </span>
                  ))}
                  <button type="button" className="active-filter-clear" onClick={clearFilters}>
                    Clear all
                  </button>
                </div>
              )}
            </div>

            {isLoading ? (
              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#94a3b8", fontSize: 14 }}>
                Loading contacts...
              </div>
            ) : isError ? (
              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#dc2626", fontSize: 14 }}>
                Failed to load contacts.
              </div>
            ) : view === "default" || segment === "archived" ? (
              <div className="content-area">
                <div className="list-col">
                  <SegmentTabs
                    activeSegment={segment}
                    onSelectSegment={setSegment}
                    archivedCount={archivedContacts.length}
                  />
                  <div className="list-col-inner">
                    {segment === "people" && (
                      <ContactListAccordion
                        grouped={stageGroups}
                        openGroups={openGroups}
                        selectedContactId={selectedContactId}
                        onToggleGroup={toggleGroup}
                        onSelectContact={setSelectedContactId}
                      />
                    )}
                    {segment === "companies" && (
                      <CompanyGroupedList
                        groups={companyGroups}
                        openCompanies={openCompanies}
                        selectedContactId={selectedContactId}
                        onToggleCompany={toggleCompany}
                        onSelectContact={setSelectedContactId}
                      />
                    )}
                    {segment === "archived" && (
                      archivedLoading ? (
                        <div style={{ padding: 16, color: "#94a3b8", fontSize: 13 }}>Loading archived…</div>
                      ) : archivedError ? (
                        <div style={{ padding: 16, color: "#dc2626", fontSize: 13 }}>Couldn't load archived contacts.</div>
                      ) : filteredArchived.length === 0 ? (
                        <div style={{ padding: 16, color: "#94a3b8", fontSize: 13 }}>
                          {searchQuery.trim()
                            ? "No archived contacts match your search."
                            : "Nothing archived yet. Archived contacts land here so you can restore them later."}
                        </div>
                      ) : (
                        <div className="archived-list" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          {filteredArchived.map((c) => (
                            <ProtoContactCard
                              key={c.id}
                              contact={c}
                              isSelected={c.id === selectedContactId}
                              onSelect={() => setSelectedContactId(c.id)}
                            />
                          ))}
                        </div>
                      )
                    )}
                  </div>
                </div>

                <div className="detail-col">
                  {selectedContact ? (
                    <>
                      <div className="detail-scroll">
                        <ProtoDetailHeader
                          contact={selectedContact}
                          isBookmarked={bookmarkedIds.has(selectedContact.id)}
                          onToggleBookmark={() => toggleBookmark(selectedContact.id)}
                          onArchive={() => archiveMutation.mutate(selectedContact.id)}
                          onUnarchive={() => unarchiveMutation.mutate(selectedContact.id)}
                        />
                        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                          <div className="section-heading">
                            <span className="section-label">Pipeline Stage</span>
                            <span className="section-hint">Click a stage to update</span>
                          </div>
                          <ProtoPipelineDots
                            activeStage={selectedContact.stage}
                            onStageClick={(stage) =>
                              stageMutation.mutate({ contactId: selectedContact.id, stage })
                            }
                          />
                        </div>
                        <ProtoEmailBlock
                          contact={selectedContact}
                          userName={userName}
                          userEmail={userEmail}
                          activeTemplate={activeTemplate}
                          onChangeTemplate={setActiveTemplate}
                        />
                      </div>

                      <div className="detail-footer">
                        <button type="button" className="save-draft" onClick={stubAction("Save Draft")}>
                          Save Draft
                        </button>
                        <div className="footer-btn-group">
                          <button type="button" className="btn-secondary" onClick={stubAction("Edit Template")}>
                            <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                              <path d="M13.8 14.83V15.18H2V14.83H13.8ZM10.05 1.05C10.12 0.98 10.23 0.98 10.3 1.05L12.32 3.07C12.39 3.14 12.39 3.25 12.32 3.32L4.32 11.32H2V8.97L10.05 1.05Z" stroke="currentColor" strokeWidth="0.9" strokeLinejoin="round" />
                            </svg>
                            Edit Template
                          </button>
                          <button type="button" className="btn-primary" onClick={stubAction("Send via Gmail")}>
                            <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                              <path d="M7.25 8.74L1.25 6.07L14.58 1.4L9.92 14.74L7.25 8.74Z" stroke="white" strokeWidth="1.33" strokeLinecap="round" strokeLinejoin="round" />
                              <path d="M14.58 1.4L7.25 8.74" stroke="white" strokeWidth="1.33" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                            Send via Gmail
                          </button>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#94a3b8", fontSize: 14 }}>
                      Select a contact to view details
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <ProtoSpreadsheet
                contacts={filteredContacts}
                activeSegment={segment}
                onSelectSegment={setSegment}
                sort={spreadsheetSort}
                onSort={handleSpreadsheetSort}
                page={spreadsheetPage}
                onChangePage={setSpreadsheetPage}
                selectedRows={selectedRows}
                onToggleRow={toggleRow}
                onToggleAllVisible={toggleAllVisible}
                bookmarkedIds={bookmarkedIds}
                onToggleBookmark={toggleBookmark}
                onDraft={stubAction("Draft email")}
                onArchive={(id) => archiveMutation.mutate(id)}
              />
            )}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
