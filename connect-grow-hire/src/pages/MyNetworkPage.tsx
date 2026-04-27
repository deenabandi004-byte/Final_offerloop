import React, { useState, useEffect } from "react";
import { useParams, useNavigate, Navigate } from "react-router-dom";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppHeader } from "@/components/AppHeader";
import { MainContentWrapper } from "@/components/MainContentWrapper";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plus, Upload, Download, ChevronUp, ChevronDown } from "lucide-react";
import { useFirebaseAuth } from "@/contexts/FirebaseAuthContext";
import { firebaseApi } from "@/services/firebaseApi";

type TabId = "people" | "companies" | "managers";

const TABS: { id: TabId; label: string }[] = [
  { id: "people", label: "People" },
  { id: "companies", label: "Companies" },
  { id: "managers", label: "Hiring Managers" },
];

// ── People Table ─────────────────────────────────────────────────────────────

interface PersonRow {
  id: string;
  name: string;
  email?: string;
  role?: string;
  company?: string;
  location?: string;
  school?: string;
  schoolYear?: string;
  connection?: string;
  isAlumni?: boolean;
}

const PeopleTable: React.FC<{ rows: PersonRow[] }> = ({ rows }) => {
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggleSort = (col: string) => {
    if (sortCol === col) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortCol(col);
      setSortDir("asc");
    }
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === rows.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(rows.map((r) => r.id)));
    }
  };

  const SortIcon: React.FC<{ col: string }> = ({ col }) => {
    if (sortCol !== col) return null;
    return sortDir === "asc" ? (
      <ChevronUp className="inline h-3 w-3 ml-0.5" />
    ) : (
      <ChevronDown className="inline h-3 w-3 ml-0.5" />
    );
  };

  return (
    <div className="border border-line rounded-st-xl overflow-hidden">
      {/* Header */}
      <div
        className="grid items-center bg-paper-2 px-5 py-2.5"
        style={{ gridTemplateColumns: "32px 1.3fr 1fr 1fr 1fr 110px" }}
      >
        <Checkbox
          checked={selected.size === rows.length && rows.length > 0}
          onCheckedChange={toggleAll}
        />
        <button className="text-left" onClick={() => toggleSort("name")}>
          <span className="font-mono text-[9px] font-normal uppercase tracking-[0.12em] text-ink-3">
            Name<SortIcon col="name" />
          </span>
        </button>
        <button className="text-left" onClick={() => toggleSort("role")}>
          <span className="font-mono text-[9px] font-normal uppercase tracking-[0.12em] text-ink-3">
            Role · Company<SortIcon col="role" />
          </span>
        </button>
        <button className="text-left" onClick={() => toggleSort("location")}>
          <span className="font-mono text-[9px] font-normal uppercase tracking-[0.12em] text-ink-3">
            Location<SortIcon col="location" />
          </span>
        </button>
        <button className="text-left" onClick={() => toggleSort("school")}>
          <span className="font-mono text-[9px] font-normal uppercase tracking-[0.12em] text-ink-3">
            School<SortIcon col="school" />
          </span>
        </button>
        <button className="text-left" onClick={() => toggleSort("connection")}>
          <span className="font-mono text-[9px] font-normal uppercase tracking-[0.12em] text-ink-3">
            Connection<SortIcon col="connection" />
          </span>
        </button>
      </div>

      {/* Body */}
      {rows.length === 0 ? (
        <div className="py-16 text-center">
          <p className="font-serif italic text-ink-3 text-[15px]">
            No one here yet. Add someone from Find, or import a CSV.
          </p>
        </div>
      ) : (
        rows.map((row, i) => (
          <div
            key={row.id}
            className={`grid items-center px-5 py-3 transition-colors hover:bg-brand/[0.02] cursor-pointer ${
              i < rows.length - 1 ? "border-b border-line-2" : ""
            }`}
            style={{ gridTemplateColumns: "32px 1.3fr 1fr 1fr 1fr 110px" }}
          >
            <Checkbox
              checked={selected.has(row.id)}
              onCheckedChange={() => toggleSelect(row.id)}
            />
            <div>
              <div className="text-[13px] font-semibold text-ink">{row.name}</div>
              {row.email && (
                <div className="font-mono text-[11px] text-ink-3">{row.email}</div>
              )}
            </div>
            <div className="text-[12px] text-ink-2">
              {[row.role, row.company].filter(Boolean).join(" · ")}
            </div>
            <div className="text-[12px] text-ink-2">{row.location || ""}</div>
            <div>
              {row.school && (
                <Badge variant={row.isAlumni ? "brand" : "default"}>
                  {row.school}{row.schoolYear ? ` · '${row.schoolYear}` : ""}
                </Badge>
              )}
            </div>
            <div className="font-mono text-[10px] uppercase text-ink-3 tracking-[0.12em]">
              {row.connection || ""}
            </div>
          </div>
        ))
      )}
    </div>
  );
};

// ── Companies Table ──────────────────────────────────────────────────────────

interface CompanyRow {
  id: string;
  name: string;
  domain?: string;
  industry?: string;
  hq?: string;
  alumni?: number;
  size?: string;
}

const CompaniesTable: React.FC<{ rows: CompanyRow[] }> = ({ rows }) => {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === rows.length) setSelected(new Set());
    else setSelected(new Set(rows.map((r) => r.id)));
  };

  return (
    <div className="border border-line rounded-st-xl overflow-hidden">
      <div
        className="grid items-center bg-paper-2 px-5 py-2.5"
        style={{ gridTemplateColumns: "32px 1.4fr 1fr 1fr 90px 90px" }}
      >
        <Checkbox
          checked={selected.size === rows.length && rows.length > 0}
          onCheckedChange={toggleAll}
        />
        <span className="font-mono text-[9px] font-normal uppercase tracking-[0.12em] text-ink-3">Company</span>
        <span className="font-mono text-[9px] font-normal uppercase tracking-[0.12em] text-ink-3">Industry</span>
        <span className="font-mono text-[9px] font-normal uppercase tracking-[0.12em] text-ink-3">HQ</span>
        <span className="font-mono text-[9px] font-normal uppercase tracking-[0.12em] text-ink-3 text-right">Alumni</span>
        <span className="font-mono text-[9px] font-normal uppercase tracking-[0.12em] text-ink-3 text-right">Size</span>
      </div>

      {rows.length === 0 ? (
        <div className="py-16 text-center">
          <p className="font-serif italic text-ink-3 text-[15px]">
            No companies saved. Star one from Find to add it here.
          </p>
        </div>
      ) : (
        rows.map((row, i) => (
          <div
            key={row.id}
            className={`grid items-center px-5 py-3 transition-colors hover:bg-brand/[0.02] cursor-pointer ${
              i < rows.length - 1 ? "border-b border-line-2" : ""
            }`}
            style={{ gridTemplateColumns: "32px 1.4fr 1fr 1fr 90px 90px" }}
          >
            <Checkbox
              checked={selected.has(row.id)}
              onCheckedChange={() => toggleSelect(row.id)}
            />
            <div>
              <div className="text-[13px] font-semibold text-ink">{row.name}</div>
              {row.domain && (
                <div className="font-mono text-[11px] text-ink-3">{row.domain}</div>
              )}
            </div>
            <div className="text-[12px] text-ink-2">{row.industry || ""}</div>
            <div className="text-[12px] text-ink-2">{row.hq || ""}</div>
            <div className="font-mono text-[12px] text-ink text-right">
              {row.alumni != null ? row.alumni : ""}
            </div>
            <div className="font-mono text-[12px] text-ink-2 text-right">
              {row.size || ""}
            </div>
          </div>
        ))
      )}
    </div>
  );
};

// ── Hiring Managers Table ────────────────────────────────────────────────────

interface ManagerRow {
  id: string;
  name: string;
  email?: string;
  title?: string;
  roleHiringFor?: string;
  company?: string;
  postedDaysAgo?: number;
}

const ManagersTable: React.FC<{ rows: ManagerRow[] }> = ({ rows }) => {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === rows.length) setSelected(new Set());
    else setSelected(new Set(rows.map((r) => r.id)));
  };

  return (
    <div className="border border-line rounded-st-xl overflow-hidden">
      <div
        className="grid items-center bg-paper-2 px-5 py-2.5"
        style={{ gridTemplateColumns: "32px 1.2fr 1fr 1.2fr 1fr 80px" }}
      >
        <Checkbox
          checked={selected.size === rows.length && rows.length > 0}
          onCheckedChange={toggleAll}
        />
        <span className="font-mono text-[9px] font-normal uppercase tracking-[0.12em] text-ink-3">Name</span>
        <span className="font-mono text-[9px] font-normal uppercase tracking-[0.12em] text-ink-3">Title</span>
        <span className="font-mono text-[9px] font-normal uppercase tracking-[0.12em] text-ink-3">Role hiring for</span>
        <span className="font-mono text-[9px] font-normal uppercase tracking-[0.12em] text-ink-3">Company</span>
        <span className="font-mono text-[9px] font-normal uppercase tracking-[0.12em] text-ink-3 text-right">Posted</span>
      </div>

      {rows.length === 0 ? (
        <div className="py-16 text-center">
          <p className="font-serif italic text-ink-3 text-[15px]">
            No active hiring managers. We'll surface new posts from companies you follow.
          </p>
        </div>
      ) : (
        rows.map((row, i) => (
          <div
            key={row.id}
            className={`grid items-center px-5 py-3 transition-colors hover:bg-brand/[0.02] cursor-pointer ${
              i < rows.length - 1 ? "border-b border-line-2" : ""
            }`}
            style={{ gridTemplateColumns: "32px 1.2fr 1fr 1.2fr 1fr 80px" }}
          >
            <Checkbox
              checked={selected.has(row.id)}
              onCheckedChange={() => toggleSelect(row.id)}
            />
            <div>
              <div className="text-[13px] font-semibold text-ink">{row.name}</div>
              {row.email && (
                <div className="font-mono text-[11px] text-ink-3">{row.email}</div>
              )}
            </div>
            <div className="text-[12px] text-ink-2">{row.title || ""}</div>
            <div className="text-[12px] text-ink-2">{row.roleHiringFor || ""}</div>
            <div className="text-[12px] text-ink-2">{row.company || ""}</div>
            <div className="font-mono text-[12px] text-ink-2 text-right">
              {row.postedDaysAgo != null ? `${row.postedDaysAgo}d` : ""}
            </div>
          </div>
        ))
      )}
    </div>
  );
};

// ── Main Page ────────────────────────────────────────────────────────────────

const MyNetworkPage: React.FC = () => {
  const { tab } = useParams<{ tab: string }>();
  const navigate = useNavigate();
  const { user } = useFirebaseAuth();

  const activeTab: TabId = tab === "companies" ? "companies" : tab === "managers" ? "managers" : "people";

  const [people, setPeople] = useState<PersonRow[]>([]);
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [managers, setManagers] = useState<ManagerRow[]>([]);

  useEffect(() => {
    if (!user?.uid) return;

    // Load people from contacts
    firebaseApi.getContacts(user.uid).then((contacts) => {
      setPeople(
        contacts.map((c: any) => ({
          id: c.id || c.contactId || Math.random().toString(),
          name: c.full_name || c.name || "Unknown",
          email: c.work_email || c.email || undefined,
          role: c.job_title || c.title || undefined,
          company: c.job_company_name || c.company || undefined,
          location: c.location_name || c.location || undefined,
          school: c.education?.[0]?.school?.name || undefined,
          schoolYear: c.education?.[0]?.end_date?.split("-")?.[0]?.slice(-2) || undefined,
          connection: c.connectionType || undefined,
          isAlumni: c.isAlumni || false,
        }))
      );
    }).catch(() => {});

    // Companies — placeholder until dedicated API exists
    // TODO: wire to company tracker Firestore subcollection

    // Load hiring managers
    firebaseApi.getRecruiters(user.uid).then((recs: any[]) => {
      setManagers(
        recs.map((r: any) => ({
          id: r.id || Math.random().toString(),
          name: r.name || r.full_name || "Unknown",
          email: r.email || undefined,
          title: r.title || r.job_title || undefined,
          roleHiringFor: r.roleHiringFor || r.hiring_for || undefined,
          company: r.company || r.job_company_name || undefined,
          postedDaysAgo: r.postedDaysAgo || undefined,
        }))
      );
    }).catch(() => {});
  }, [user?.uid]);

  // Redirect bare /my-network to /my-network/people (AFTER all hooks)
  if (!tab) {
    return <Navigate to="/my-network/people" replace />;
  }

  const counts = {
    people: people.length,
    companies: companies.length,
    managers: managers.length,
  };

  const ctaLabel = activeTab === "companies" ? "Add company" : activeTab === "managers" ? "Add manager" : "Add person";

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-paper font-sans text-ink">
        <AppSidebar />
        <MainContentWrapper>
          <AppHeader
            title="My Network"
            rightContent={
              <div className="flex items-center gap-2">
                <Button variant="secondary" size="sm">
                  <Upload className="h-3.5 w-3.5" />
                  Import CSV
                </Button>
                <Button variant="secondary" size="sm">
                  <Download className="h-3.5 w-3.5" />
                  Export
                </Button>
                <Button variant="default" size="sm">
                  <Plus className="h-3.5 w-3.5" />
                  {ctaLabel}
                </Button>
              </div>
            }
          />

          <div className="flex-1 overflow-y-auto">
            <div className="max-w-[1100px] mx-auto px-6 py-5">
              {/* Tabs */}
              <div className="flex items-center gap-1 mb-5">
                {TABS.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => navigate(`/my-network/${t.id}`, { replace: true })}
                    className={`inline-flex items-center gap-2 px-3.5 py-2.5 text-[13px] font-medium border-b-2 transition-all ${
                      activeTab === t.id
                        ? "text-ink border-ink"
                        : "text-ink-3 border-transparent hover:text-ink-2"
                    }`}
                  >
                    {t.label}
                    {counts[t.id] > 0 && (
                      <span className="font-mono text-[10px] bg-paper-2 px-1.5 py-0.5 rounded-st-sm">
                        {counts[t.id]}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {/* Table */}
              {activeTab === "people" && <PeopleTable rows={people} />}
              {activeTab === "companies" && <CompaniesTable rows={companies} />}
              {activeTab === "managers" && <ManagersTable rows={managers} />}
            </div>
          </div>
        </MainContentWrapper>
      </div>
    </SidebarProvider>
  );
};

export default MyNetworkPage;
