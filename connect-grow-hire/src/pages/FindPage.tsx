import React, { Suspense, useState, useEffect, useRef } from "react";
import { useSearchParams, useNavigate, useLocation } from "react-router-dom";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppHeader } from "@/components/AppHeader";
import { MainContentWrapper } from "@/components/MainContentWrapper";
import { Search, Building2, UserCheck, FileText, ChevronRight, Users, Mail, Table2, Building, UserSearch } from "lucide-react";
import { LoadingSkeleton } from "@/components/LoadingSkeleton";
import { useFirebaseAuth } from "@/contexts/FirebaseAuthContext";
import { apiService, type EmailTemplate, getEmailTemplateLabel } from "@/services/api";
import { firebaseApi } from "@/services/firebaseApi";
import { EliteGateModal } from "@/components/EliteGateModal";

const ContactSearchPage = React.lazy(() => import("./ContactSearchPage"));
const FirmSearchPage = React.lazy(() => import("./FirmSearchPage"));
const RecruiterSpreadsheetPage = React.lazy(() => import("./RecruiterSpreadsheetPage"));

const TABS = [
  { id: "people", label: "People", icon: Search },
  { id: "companies", label: "Companies", icon: Building2 },
  { id: "hiring-managers", label: "Hiring Managers", icon: UserCheck },
] as const;

type FindTab = (typeof TABS)[number]["id"];

function resolveTab(raw: string | null): FindTab {
  if (raw === "companies") return "companies";
  if (raw === "hiring-managers") return "hiring-managers";
  return "people";
}

const FindPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = resolveTab(searchParams.get("tab"));
  const navigate = useNavigate();
  const routerLocation = useLocation();
  const { user } = useFirebaseAuth();
  const isElite = user?.tier === "elite";

  const [showEliteGate, setShowEliteGate] = useState(false);
  const [savedEmailTemplate, setSavedEmailTemplate] = useState<EmailTemplate | null>(null);
  const [sessionEmailTemplate, setSessionEmailTemplate] = useState<EmailTemplate | null>(null);
  const activeEmailTemplate = sessionEmailTemplate ?? savedEmailTemplate;
  const [contactsCount, setContactsCount] = useState<number | null>(null);
  const [draftsCount, setDraftsCount] = useState<number | null>(null);
  const [firmInitialTab] = useState<string | undefined>(undefined);
  const [showHeaderTooltip, setShowHeaderTooltip] = useState(false);
  const headerTooltipTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load contacts count and outbox stats
  useEffect(() => {
    if (!user?.uid) return;
    firebaseApi.getContacts(user.uid).then((contacts) => {
      setContactsCount(contacts.length);
    }).catch(() => {});
    apiService.getOutboxStats().then((res) => {
      if (!('error' in res)) setDraftsCount(res.total);
    }).catch(() => {});
  }, [user?.uid]);

  // Load saved email template on mount
  useEffect(() => {
    if (!user?.uid) return;
    apiService.getEmailTemplate().then((t) => {
      setSavedEmailTemplate({
        purpose: t.purpose,
        stylePreset: t.stylePreset,
        customInstructions: t.customInstructions,
        signoffPhrase: t.signoffPhrase,
        signatureBlock: t.signatureBlock,
        name: t.name,
        subject: t.subject,
        savedTemplateId: t.savedTemplateId,
      });
    }).catch(() => {});
  }, [user?.uid]);

  // Pick up template applied from EmailTemplatesPage via router state or sessionStorage
  useEffect(() => {
    const state = (routerLocation.state as { appliedEmailTemplate?: EmailTemplate } | undefined)?.appliedEmailTemplate;
    if (state) {
      setSessionEmailTemplate(state);
      sessionStorage.removeItem("offerloop_applied_email_template");
      return;
    }
    try {
      const raw = sessionStorage.getItem("offerloop_applied_email_template");
      if (raw) {
        const parsed = JSON.parse(raw) as EmailTemplate;
        if (parsed && typeof parsed === "object") setSessionEmailTemplate(parsed);
        sessionStorage.removeItem("offerloop_applied_email_template");
      }
    } catch {}
  }, [routerLocation.state]);

  const setActiveTab = (tab: FindTab) => {
    setSearchParams({ tab }, { replace: true });
  };

  const templateLabel = getEmailTemplateLabel(activeEmailTemplate);

  return (
    <>
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-[#FFFFFF] text-[#0F172A] font-sans">
        <AppSidebar />
        <MainContentWrapper>
          <AppHeader
            rightContent={
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => navigate(
                    activeTab === "companies" ? "/company-tracker"
                    : activeTab === "hiring-managers" ? "/hiring-manager-tracker"
                    : "/contact-directory"
                  )}
                  className="inline-flex items-center gap-2 rounded-[3px] px-3 py-1.5 text-sm font-medium transition-all duration-150 cursor-pointer focus:outline-none bg-white border border-[#E2E8F0] text-[#0F172A] hover:bg-[#FAFBFF] hover:border-[#3B82F6] shadow-none"
                >
                  {activeTab === "companies"
                    ? <Building className="h-4 w-4 text-[#6B7280]" />
                    : activeTab === "hiring-managers"
                    ? <UserSearch className="h-4 w-4 text-[#6B7280]" />
                    : <Table2 className="h-4 w-4 text-[#6B7280]" />
                  }
                  <span className="hidden sm:inline whitespace-nowrap">
                    {activeTab === "companies" ? "Company Spreadsheet"
                    : activeTab === "hiring-managers" ? "Hiring Manager Tracker"
                    : "Contact Spreadsheet"}
                  </span>
                </button>
                <div style={{ position: 'relative' }}>
                  <button
                    type="button"
                    onClick={() => isElite ? navigate("/find/templates") : setShowEliteGate(true)}
                    className="inline-flex items-center gap-2 rounded-[3px] px-3 py-1.5 text-sm font-medium transition-all duration-150 cursor-pointer focus:outline-none bg-white border border-[#E2E8F0] text-[#0F172A] hover:bg-[#FAFBFF] hover:border-[#3B82F6] shadow-none"
                    data-tour="tour-templates-button"
                    onMouseEnter={() => { headerTooltipTimer.current = setTimeout(() => setShowHeaderTooltip(true), 280); }}
                    onMouseLeave={() => { if (headerTooltipTimer.current) clearTimeout(headerTooltipTimer.current); setShowHeaderTooltip(false); }}
                  >
                    <FileText className="h-4 w-4 text-[#6B7280]" />
                    <span className="hidden sm:inline whitespace-nowrap">
                      Email Template
                    </span>
                  </button>
                  <div
                    className="pointer-events-none"
                    style={{
                      position: 'absolute',
                      top: '100%',
                      right: 0,
                      marginTop: 8,
                      background: '#1E293B',
                      color: '#fff',
                      fontSize: 13,
                      lineHeight: 1.45,
                      padding: '8px 12px',
                      borderRadius: 8,
                      boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                      width: 260,
                      whiteSpace: 'normal',
                      opacity: showHeaderTooltip ? 1 : 0,
                      transition: 'opacity .15s',
                      zIndex: 50,
                    }}
                  >
                    Set the tone, style, and sign-off for every email we draft. Click to customize your template.
                  </div>
                </div>
              </div>
            }
          />

          {/* Scrollable page body */}
          <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
            {/* Hero section — clean, focused */}
            <div
              style={{
                background: "#FFFFFF",
                borderBottom: "1px solid #E2E8F0",
                flexShrink: 0,
              }}
            >
              <div style={{ maxWidth: 800, margin: "0 auto", padding: "48px 40px 0" }}>
                {/* Title */}
                <h1 style={{ fontSize: 26, fontWeight: 600, color: "#0F172A", letterSpacing: "-.02em", marginBottom: 6, fontFamily: "'Lora', Georgia, serif", textAlign: "center" }}>
                  Find
                </h1>
                <p style={{ fontSize: 14, color: "#94A3B8", marginBottom: 28, lineHeight: 1.5, textAlign: "center" }}>
                  Search people, companies, or hiring managers — we'll find contact info and draft outreach.
                </p>

                {/* Tab row — directly below description, above content */}
                <div style={{ display: "flex", gap: 4, justifyContent: "center" }}>
                  {TABS.map((tab) => {
                    const isActive = activeTab === tab.id;
                    return (
                      <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          padding: "11px 24px",
                          borderRadius: "3px 3px 0 0",
                          fontSize: 14,
                          fontWeight: isActive ? 600 : 500,
                          cursor: "pointer",
                          border: isActive ? "1px solid #E2E8F0" : "1px solid transparent",
                          borderBottom: isActive ? "2px solid #2563EB" : "1px solid transparent",
                          background: isActive ? "#fff" : "transparent",
                          color: isActive ? "#2563EB" : "#6B7280",
                          position: "relative",
                          zIndex: isActive ? 2 : 1,
                          transition: "all .15s",
                          marginBottom: -1,
                          fontFamily: "inherit",
                        }}
                        onMouseEnter={(e) => {
                          if (!isActive) (e.currentTarget as HTMLButtonElement).style.color = "#0F172A";
                        }}
                        onMouseLeave={(e) => {
                          if (!isActive) (e.currentTarget as HTMLButtonElement).style.color = "#6B7280";
                        }}
                      >
                        <tab.icon style={{ width: 15, height: 15, flexShrink: 0 }} />
                        {tab.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Tab body */}
            <div style={{ flex: 1, overflowY: "auto", background: "#FFFFFF", borderTop: "none" }}>
              <div style={{ maxWidth: 800, margin: "0 auto", padding: "0 40px 44px" }}>
              {/* Tab description */}
              <p style={{ fontSize: 13, color: "#94A3B8", margin: "8px 0 0", lineHeight: 1.5, textAlign: "center" }}>
                {activeTab === "people" && "Search by role, company, school, or LinkedIn URL to get personalized email drafts."}
                {activeTab === "companies" && "Search for companies by industry, size, or location to build your target list."}
                {activeTab === "hiring-managers" && "Paste a job URL to find the hiring manager and get a personalized email draft."}
              </p>
              <Suspense
                fallback={
                  <div className="flex items-center justify-center py-20">
                    <LoadingSkeleton />
                  </div>
                }
              >
                <div style={{ display: activeTab === "people" ? "block" : "none" }}>
                  <ContactSearchPage embedded hideSubTabs parentEmailTemplate={activeEmailTemplate} />
                </div>
                <div data-tour="tour-find-companies" style={{ display: activeTab === "companies" ? "block" : "none" }}>
                  <FirmSearchPage embedded initialTab={firmInitialTab} />
                </div>
                <div data-tour="tour-find-hiring-managers" style={{ display: activeTab === "hiring-managers" ? "block" : "none" }}>
                  <RecruiterSpreadsheetPage embedded />
                </div>
              </Suspense>

              {/* Subtle stats — small text row at bottom of content area */}
              <div style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 20,
                marginTop: 32,
                paddingTop: 16,
                borderTop: "1px solid #F1F5F9",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <Users style={{ width: 13, height: 13, color: "#3B82F6" }} />
                  <span style={{ fontSize: 12, color: "#2563EB", fontWeight: 600 }}>
                    {contactsCount !== null ? contactsCount.toLocaleString() : "--"} contacts found
                  </span>
                </div>
                <div style={{ width: 1, height: 12, background: "#BFDBFE" }} />
                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <Mail style={{ width: 13, height: 13, color: "#3B82F6" }} />
                  <span style={{ fontSize: 12, color: "#2563EB", fontWeight: 600 }}>
                    {draftsCount !== null ? draftsCount.toLocaleString() : "--"} emails drafted
                  </span>
                </div>
              </div>
              </div>
            </div>
          </div>
        </MainContentWrapper>
      </div>
    </SidebarProvider>
    <EliteGateModal open={showEliteGate} onClose={() => setShowEliteGate(false)} />
    </>
  );
};

export default FindPage;
