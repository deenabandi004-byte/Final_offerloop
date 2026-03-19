import React, { Suspense, useState, useEffect } from "react";
import { useSearchParams, useNavigate, useLocation } from "react-router-dom";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppHeader } from "@/components/AppHeader";
import { MainContentWrapper } from "@/components/MainContentWrapper";
import { Search, Building2, UserCheck, FileText, ChevronRight, Coins, Users, Mail } from "lucide-react";
import { LoadingSkeleton } from "@/components/LoadingSkeleton";
import { useFirebaseAuth } from "@/contexts/FirebaseAuthContext";
import { apiService, type EmailTemplate, hasEmailTemplateValues, getEmailTemplateLabel } from "@/services/api";
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
  const [firmInitialTab, setFirmInitialTab] = useState<string | undefined>(undefined);

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

  const credits = user?.credits ?? 0;

  const tier = (user?.tier as keyof typeof import("@/lib/constants").TIER_CONFIGS) || "free";
  const tierLabel = tier === "elite" ? "Elite" : tier === "pro" ? "Pro" : "Free";
  const maxCredits = tier === "elite" ? 3000 : tier === "pro" ? 1800 : 150;
  const creditPct = maxCredits > 0 ? Math.round((credits / maxCredits) * 100) : 0;

  const STAT_CARDS = [
    {
      label: "Credits Available",
      value: credits.toLocaleString(),
      icon: Coins,
      iconBg: "rgba(59,130,246,.10)",
      iconColor: "#3B82F6",
      detail: `${tierLabel} plan · ${creditPct}% remaining`,
      detailColor: creditPct > 30 ? "#6B7280" : "#2563EB",
    },
    {
      label: "Contacts Found",
      value: contactsCount !== null ? contactsCount.toLocaleString() : "--",
      icon: Users,
      iconBg: "rgba(59,130,246,.08)",
      iconColor: "#2563EB",
      detail: "total saved",
      detailColor: "#94A3B8",
    },
    {
      label: "Emails Drafted",
      value: draftsCount !== null ? draftsCount.toLocaleString() : "--",
      icon: Mail,
      iconBg: "rgba(59,130,246,.08)",
      iconColor: "#2563EB",
      detail: "in outbox",
      detailColor: "#94A3B8",
    },
  ];

  return (
    <>
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-[#FFFFFF] text-[#0F172A] font-sans">
        <AppSidebar />
        <MainContentWrapper>
          <AppHeader
            rightContent={
              <>
                <button
                  onClick={() => navigate("/find/templates")}
                  className="hidden md:flex items-center gap-1.5 text-xs text-[#6B7280] hover:text-[#0F172A] cursor-pointer transition-colors"
                >
                  Template:&nbsp;<span className="font-medium text-[#0F172A]">{templateLabel}</span>
                  <ChevronRight className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={() => isElite ? navigate("/find/templates") : setShowEliteGate(true)}
                  className="inline-flex items-center gap-2 rounded-[3px] px-3 py-1.5 text-sm font-medium transition-all duration-150 cursor-pointer focus:outline-none bg-white border border-[#E2E8F0] text-[#0F172A] hover:bg-[#FAFBFF] hover:border-[#3B82F6] shadow-none"
                  data-tour="tour-templates-button"
                >
                  <FileText className="h-4 w-4 text-[#6B7280]" />
                  <span className="hidden sm:inline whitespace-nowrap">
                    Email Template
                  </span>
                </button>
              </>
            }
          />

          {/* Scrollable page body */}
          <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
            {/* Hero banner */}
            <div
              style={{
                background: "#FFFFFF",
                borderBottom: "1px solid #E2E8F0",
                flexShrink: 0,
              }}
            >
              <div style={{ maxWidth: 720, margin: "0 auto", padding: "44px 40px 0" }}>
                <h1 style={{ fontSize: 22, fontWeight: 600, color: "#0F172A", letterSpacing: "-.01em", marginBottom: 3, fontFamily: "'Lora', Georgia, serif" }}>
                  Find
                </h1>
                <p style={{ fontSize: 13.5, color: "#6B7280", marginBottom: 22, lineHeight: 1.5 }}>
                  Search people, companies, or hiring managers — we'll find contact info and draft outreach.
                </p>

              {/* Stat cards row */}
              <div style={{ display: "flex", gap: 14, marginBottom: 24 }}>
                {STAT_CARDS.map((card) => (
                  <div
                    key={card.label}
                    style={{
                      flex: 1,
                      background: "#FAFBFF",
                      borderRadius: 3,
                      padding: "18px 20px 16px",
                      border: "1px solid #E2E8F0",
                      boxShadow: "none",
                      display: "flex",
                      flexDirection: "column",
                      gap: 0,
                      transition: "box-shadow .15s, border-color .15s",
                      cursor: "default",
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLDivElement).style.boxShadow = "0 2px 8px rgba(59,130,246,.10)";
                      (e.currentTarget as HTMLDivElement).style.borderColor = "#3B82F6";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLDivElement).style.boxShadow = "none";
                      (e.currentTarget as HTMLDivElement).style.borderColor = "#E2E8F0";
                    }}
                  >
                    {/* Top row: label + icon */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                      <span style={{ fontSize: 13, color: "#6B7280", fontWeight: 500 }}>{card.label}</span>
                      <div
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: 10,
                          background: card.iconBg,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                      >
                        <card.icon style={{ width: 18, height: 18, color: card.iconColor }} />
                      </div>
                    </div>
                    {/* Value */}
                    <div style={{ fontSize: 28, fontWeight: 700, color: "#0F172A", letterSpacing: "-.02em", lineHeight: 1, fontFamily: "'Lora', Georgia, serif" }}>
                      {card.value}
                    </div>
                    {/* Bottom row: detail */}
                    <div style={{ marginTop: 12 }}>
                      <span style={{ fontSize: 12, color: card.detailColor, fontWeight: 500, display: "flex", alignItems: "center", gap: 3 }}>
                        {card.detail}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Context-specific tracker shortcut */}
              {activeTab === "people" && (
                <button
                  onClick={() => navigate('/contact-directory')}
                  style={{
                    display: "flex", alignItems: "center", gap: 10, width: "100%",
                    background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: 3,
                    padding: "10px 16px", cursor: "pointer", fontFamily: "inherit",
                    transition: "all .15s", marginBottom: 16,
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "#DBEAFE"; e.currentTarget.style.borderColor = "#3B82F6"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "#EFF6FF"; e.currentTarget.style.borderColor = "#BFDBFE"; }}
                >
                  <Mail style={{ width: 16, height: 16, color: "#2563EB", flexShrink: 0 }} />
                  <div style={{ flex: 1, textAlign: "left" }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#2563EB" }}>Network Tracker</div>
                    <div style={{ fontSize: 11.5, color: "#6B7280", marginTop: 1 }}>Track emails, replies, and follow-ups with your contacts</div>
                  </div>
                  <ChevronRight style={{ width: 14, height: 14, color: "#2563EB", flexShrink: 0 }} />
                </button>
              )}
              {activeTab === "companies" && (
                <button
                  onClick={() => navigate('/company-tracker')}
                  style={{
                    display: "flex", alignItems: "center", gap: 10, width: "100%",
                    background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: 3,
                    padding: "10px 16px", cursor: "pointer", fontFamily: "inherit",
                    transition: "all .15s", marginBottom: 16,
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "#DBEAFE"; e.currentTarget.style.borderColor = "#3B82F6"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "#EFF6FF"; e.currentTarget.style.borderColor = "#BFDBFE"; }}
                >
                  <Building2 style={{ width: 16, height: 16, color: "#2563EB", flexShrink: 0 }} />
                  <div style={{ flex: 1, textAlign: "left" }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#2563EB" }}>Company Tracker</div>
                    <div style={{ fontSize: 11.5, color: "#6B7280", marginTop: 1 }}>View and manage all saved companies from your searches</div>
                  </div>
                  <ChevronRight style={{ width: 14, height: 14, color: "#2563EB", flexShrink: 0 }} />
                </button>
              )}
              {activeTab === "hiring-managers" && (
                <button
                  onClick={() => navigate('/hiring-manager-tracker')}
                  style={{
                    display: "flex", alignItems: "center", gap: 10, width: "100%",
                    background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: 3,
                    padding: "10px 16px", cursor: "pointer", fontFamily: "inherit",
                    transition: "all .15s", marginBottom: 16,
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "#DBEAFE"; e.currentTarget.style.borderColor = "#3B82F6"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "#EFF6FF"; e.currentTarget.style.borderColor = "#BFDBFE"; }}
                >
                  <UserCheck style={{ width: 16, height: 16, color: "#2563EB", flexShrink: 0 }} />
                  <div style={{ flex: 1, textAlign: "left" }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#2563EB" }}>Hiring Manager Tracker</div>
                    <div style={{ fontSize: 11.5, color: "#6B7280", marginTop: 1 }}>View all hiring managers you've found, saved, or contacted</div>
                  </div>
                  <ChevronRight style={{ width: 14, height: 14, color: "#2563EB", flexShrink: 0 }} />
                </button>
              )}

              {/* Tab row */}
              <div style={{ display: "flex", gap: 2 }}>
                {TABS.map((tab) => {
                  const isActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 7,
                        padding: "10px 20px",
                        borderRadius: "3px 3px 0 0",
                        fontSize: 13.5,
                        fontWeight: isActive ? 600 : 500,
                        cursor: "pointer",
                        border: isActive ? "1px solid #E2E8F0" : "1px solid transparent",
                        borderBottom: isActive ? "1px solid #fff" : "1px solid transparent",
                        background: isActive ? "#fff" : "transparent",
                        color: isActive ? "#0F172A" : "#6B7280",
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
              <div style={{ maxWidth: 720, margin: "0 auto", padding: "0 40px 44px" }}>
              {/* Tab description */}
              <p style={{ fontSize: 13, color: "#94A3B8", margin: "16px 0 4px", lineHeight: 1.5 }}>
                {activeTab === "people" && "Search by role, company, school, or LinkedIn URL — we'll find their email and draft outreach."}
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
