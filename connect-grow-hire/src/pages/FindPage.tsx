import React, { Suspense, useState, useEffect } from "react";
import { useSearchParams, useNavigate, useLocation } from "react-router-dom";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppHeader } from "@/components/AppHeader";
import { MainContentWrapper } from "@/components/MainContentWrapper";
import { Search, Building2, UserCheck, FileText } from "lucide-react";
import { LoadingSkeleton } from "@/components/LoadingSkeleton";
import { useFirebaseAuth } from "@/contexts/FirebaseAuthContext";
import { apiService, type EmailTemplate, hasEmailTemplateValues } from "@/services/api";
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

const SUBTITLES: Record<FindTab, string> = {
  people:
    "Search by name, role, or company — we'll find their emails and draft outreach for you.",
  companies:
    "Build a target list by industry, size, or location.",
  "hiring-managers":
    "Paste a job URL — we'll find the decision maker and draft your outreach.",
};

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

  const templateLabel = activeEmailTemplate && hasEmailTemplateValues(activeEmailTemplate)
    ? (() => {
        if (activeEmailTemplate.name?.trim()) return activeEmailTemplate.name.trim();
        const p = activeEmailTemplate.purpose;
        if (p === "networking") return "Networking";
        if (p === "referral") return "Referral Request";
        if (p === "follow_up") return "Follow-Up";
        if (p === "sales") return "Sales";
        if (p === "custom") return "Custom Template";
        if (p) return p.charAt(0).toUpperCase() + p.slice(1).replace(/_/g, " ");
        return "Networking";
      })()
    : "Networking";

  return (
    <>
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-white text-foreground font-sans">
        <AppSidebar />
        <MainContentWrapper>
          <AppHeader
            rightContent={
              <>
                <button
                  onClick={() => navigate("/find/templates")}
                  className="hidden md:flex items-center gap-1 text-xs text-muted-foreground hover:text-primary cursor-pointer transition-colors"
                >
                  Using:&nbsp;<span className="font-semibold text-foreground">{templateLabel}</span>
                </button>
                <button
                  type="button"
                  onClick={() => isElite ? navigate("/find/templates") : setShowEliteGate(true)}
                  className="inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-all duration-150 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:ring-offset-1 bg-transparent border border-gray-300 text-gray-700 hover:bg-blue-50/50 hover:border-gray-400"
                  data-tour="tour-templates-button"
                >
                  <FileText className="h-4 w-4" />
                  <span className="hidden sm:inline whitespace-nowrap">
                    Email Template
                  </span>
                </button>
              </>
            }
          />
          <main
            style={{ background: "#FFFFFF", flex: 1, overflowY: "auto" }}
            className="px-3 py-6 pb-24 sm:px-6 sm:py-12 sm:pb-24"
          >
            {/* Shared header */}
            <div
              className="w-full px-3 pt-6 sm:px-6 sm:pt-8"
              style={{ maxWidth: "900px", margin: "0 auto" }}
            >
              <h1
                className="text-[28px] sm:text-[38px]"
                style={{
                  fontFamily: "'Instrument Serif', Georgia, serif",
                  fontWeight: 400,
                  letterSpacing: "-0.025em",
                  color: "#0F172A",
                  textAlign: "center",
                  marginBottom: "6px",
                  lineHeight: 1.1,
                }}
              >
                Find
              </h1>
              <p
                style={{
                  fontFamily: "'DM Sans', system-ui, sans-serif",
                  fontSize: "15px",
                  color: "#94A3B8",
                  textAlign: "center",
                  marginBottom: "20px",
                  lineHeight: 1.5,
                }}
              >
                {SUBTITLES[activeTab]}
              </p>
            </div>

            {/* Primary tab bar */}
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                marginBottom: "20px",
              }}
            >
              <div
                style={{
                  display: "inline-flex",
                  gap: "4px",
                  borderBottom: "1px solid #E2E8F0",
                  padding: "0",
                }}
              >
                {TABS.map((tab) => {
                  const isActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        padding: "8px 16px",
                        border: "none",
                        borderBottom: isActive
                          ? "2px solid #0F172A"
                          : "2px solid transparent",
                        cursor: "pointer",
                        fontFamily: "'DM Sans', system-ui, sans-serif",
                        fontSize: "13px",
                        fontWeight: isActive ? 600 : 500,
                        transition: "all 0.15s ease",
                        background: "transparent",
                        color: isActive ? "#0F172A" : "#94A3B8",
                        marginBottom: "-1px",
                        borderRadius: "0",
                      }}
                    >
                      <tab.icon className="h-4 w-4" />
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Tab content */}
            <Suspense
              fallback={
                <div className="flex items-center justify-center py-20">
                  <LoadingSkeleton />
                </div>
              }
            >
              <div style={{ display: activeTab === "people" ? "block" : "none" }}>
                <ContactSearchPage embedded />
              </div>
              <div data-tour="tour-find-companies" style={{ display: activeTab === "companies" ? "block" : "none" }}>
                <FirmSearchPage embedded />
              </div>
              <div data-tour="tour-find-hiring-managers" style={{ display: activeTab === "hiring-managers" ? "block" : "none" }}>
                <RecruiterSpreadsheetPage embedded />
              </div>
            </Suspense>
          </main>
        </MainContentWrapper>
      </div>
    </SidebarProvider>
    <EliteGateModal open={showEliteGate} onClose={() => setShowEliteGate(false)} />
    </>
  );
};

export default FindPage;
