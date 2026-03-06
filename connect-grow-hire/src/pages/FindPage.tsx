import React, { Suspense } from "react";
import { useSearchParams } from "react-router-dom";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppHeader } from "@/components/AppHeader";
import { MainContentWrapper } from "@/components/MainContentWrapper";
import { Search, Building2, UserCheck } from "lucide-react";
import { LoadingSkeleton } from "@/components/LoadingSkeleton";

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

  const setActiveTab = (tab: FindTab) => {
    setSearchParams({ tab }, { replace: true });
  };

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-[#FAFAFA] text-foreground font-sans">
        <AppSidebar />
        <MainContentWrapper>
          <AppHeader />
          <main
            style={{ background: "#F8FAFF", flex: 1, overflowY: "auto" }}
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
  );
};

export default FindPage;
