import { useState } from "react";
import {
  ChevronDown,
  Zap,
  LogOut,
  Settings,
  Info,
  MessageSquare,
  Shield,
  ScrollText,
  PanelLeft,
  Tag,
  FileText,
  Users,
  Home,
  Repeat,
  Search,
  Coffee,
  Mail,
  Briefcase,
  type LucideIcon as LucideIconType,
} from "lucide-react";

import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useFirebaseAuth } from "../contexts/FirebaseAuthContext";
import { trackNavClick, trackUpgradeClick } from "../lib/analytics";
import { useAgentSidebarStatus } from "@/hooks/useAgent";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

// ── Icon helpers ────────────────────────────────────────────────────────────

// One uniform monochrome icon system: every tab uses a lucide icon rendered at
// the same size and stroke, colored by a single token (inactive ink, active
// accent). No per-tab colors.
type NavItemDef = {
  title: string;
  url: string;
  dataTour?: string;
  newTab?: boolean;
  LucideIcon: LucideIconType;
};

// Group 1 - main nav (base items, Agent added dynamically for Elite)
const baseNavItems: NavItemDef[] = [
  { title: "Find", url: "/find", LucideIcon: Search },
  { title: "My Network", url: "/my-network", LucideIcon: Users },
  { title: "Meeting Prep", url: "/coffee-chat-prep", LucideIcon: Coffee, dataTour: "tour-coffee-chat-prep" },
  { title: "Tracker", url: "/tracker", LucideIcon: Mail, dataTour: "tour-track-email" },
  { title: "Job Board", url: "/job-board", LucideIcon: Briefcase },
];

// Utility nav - bottom of sidebar
const utilityNavItems: NavItemDef[] = [
  { title: "Pricing", url: "/pricing", LucideIcon: Tag },
  { title: "Documentation", url: "/documentation", LucideIcon: FileText },
];


// User dropdown menu items
const userMenuItems = [
  { title: "Account Settings", url: "/account-settings", icon: Settings },
  { title: "About Us", url: "/about", icon: Info },
  { title: "Contact Us", url: "/contact-us", icon: MessageSquare },
  { title: "Privacy Policy", url: "/privacy", icon: Shield },
  { title: "Terms of Service", url: "/terms-of-service", icon: ScrollText },
];

// ── Shared nav-item style constants ─────────────────────────────────────────

const NAV_FONT_SIZE = "14px";
const NAV_PY = "11px";
const NAV_GAP = "10px";
const NAV_RADIUS = "8px";

// White sidebar palette (app tokens: accent + ink + surface)
const ACTIVE_BG = "var(--primary-50, #EEF1F9)";
const ACTIVE_COLOR = "var(--accent, #4A60A8)";
const INACTIVE_ICON = "var(--ink-2, #4A4F5B)";
const INACTIVE_LABEL = "var(--ink-2, #4A4F5B)";
const HOVER_BG = "var(--surface, #F5F6F8)";
const HOVER_LABEL = "var(--ink, #111318)";
const NAV_STROKE = 1.75;

// ── Component ───────────────────────────────────────────────────────────────

export function AppSidebar() {
  const { state, toggleSidebar } = useSidebar();
  const location = useLocation();
  const navigate = useNavigate();
  const currentPath = location.pathname;
  const { user, signOut } = useFirebaseAuth();

  const [userDropdownOpen, setUserDropdownOpen] = useState(false);

  const isActive = (url: string) => {
    const basePath = url.split("?")[0];
    return currentPath === basePath || currentPath.startsWith(basePath + "/");
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      navigate("/");
    } catch (error) {
      console.error("Sign out error:", error);
    }
  };

  const credits = user?.credits ?? 0;
  const maxCredits = user?.maxCredits ?? 300;
  const creditPercentage = Math.min((credits / maxCredits) * 100, 100);
  const isCollapsed = state === "collapsed";

  // Launchpad (home) + Loops nav available to all users
  const agentStatus = useAgentSidebarStatus();
  const mainNavItems: NavItemDef[] = [
    { title: "Home", url: "/dashboard", LucideIcon: Home },
    { title: "Loops", url: "/agent", LucideIcon: Repeat },
    ...baseNavItems,
  ];

  // ── Render a single nav item (works for both image-icon and lucide-icon) ──

  const renderNavItem = (item: NavItemDef) => {
    const active = isActive(item.url);

    const icon = (
      <item.LucideIcon
        className="h-4 w-4 flex-shrink-0"
        strokeWidth={NAV_STROKE}
        style={{ color: active ? ACTIVE_COLOR : INACTIVE_ICON }}
      />
    );

    const linkProps = item.newTab
      ? { target: "_blank" as const, rel: "noopener noreferrer" }
      : {};

    if (isCollapsed) {
      return (
        <Tooltip key={item.title}>
          <TooltipTrigger asChild>
            {item.newTab ? (
              <a
                href={item.url}
                {...linkProps}
                data-tour={item.dataTour}
                onClick={() => trackNavClick(item.title, "sidebar")}
                className="flex items-center justify-center rounded-[8px] transition-all"
                style={{
                  padding: NAV_PY,
                  background: "transparent",
                  borderRadius: NAV_RADIUS,
                  textDecoration: "none",
                }}
              >
                {icon}
              </a>
            ) : (
              <NavLink
                to={item.url}
                data-tour={item.dataTour}
                onClick={() => trackNavClick(item.title, "sidebar")}
                className="flex items-center justify-center rounded-[8px] transition-all"
                style={{
                  padding: NAV_PY,
                  background: active ? ACTIVE_BG : "transparent",
                  borderRadius: NAV_RADIUS,
                }}
              >
                {icon}
              </NavLink>
            )}
          </TooltipTrigger>
          <TooltipContent side="right">{item.title}</TooltipContent>
        </Tooltip>
      );
    }

    if (item.newTab) {
      return (
        <a
          key={item.title}
          href={item.url}
          {...linkProps}
          data-tour={item.dataTour}
          onClick={() => trackNavClick(item.title, "sidebar")}
          className="flex items-center transition-all"
          style={{
            gap: NAV_GAP,
            paddingTop: NAV_PY,
            paddingBottom: NAV_PY,
            paddingLeft: "10px",
            paddingRight: "10px",
            borderRadius: NAV_RADIUS,
            fontSize: NAV_FONT_SIZE,
            fontWeight: 400,
            fontFamily: "var(--font-body)",
            background: "transparent",
            color: INACTIVE_LABEL,
            textDecoration: "none",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = HOVER_BG;
            e.currentTarget.style.color = HOVER_LABEL;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.color = INACTIVE_LABEL;
          }}
        >
          {icon}
          <span>{item.title}</span>
        </a>
      );
    }

    return (
      <NavLink
        key={item.title}
        to={item.url}
        data-tour={item.dataTour}
        onClick={() => trackNavClick(item.title, "sidebar")}
        className="flex items-center transition-all"
        style={{
          gap: NAV_GAP,
          paddingTop: NAV_PY,
          paddingBottom: NAV_PY,
          paddingLeft: "10px",
          paddingRight: "10px",
          borderRadius: NAV_RADIUS,
          fontSize: NAV_FONT_SIZE,
          fontWeight: active ? 600 : 400,
          fontFamily: "var(--font-body)",
          background: active ? ACTIVE_BG : "transparent",
          color: active ? ACTIVE_COLOR : INACTIVE_LABEL,
        }}
        onMouseEnter={(e) => {
          if (!active) {
            e.currentTarget.style.background = HOVER_BG;
            e.currentTarget.style.color = HOVER_LABEL;
          }
        }}
        onMouseLeave={(e) => {
          if (!active) {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.color = INACTIVE_LABEL;
          }
        }}
      >
        <span className="relative">
          {icon}
          {item.title === "Loops" && agentStatus.status === "active" && (
            <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-green-500" />
          )}
          {item.title === "Loops" && agentStatus.status === "paused" && (
            <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-amber-400" />
          )}
        </span>
        <span className="flex-1">{item.title}</span>
        {item.title === "Loops" && agentStatus.pendingCount > 0 && (
          <span className="ml-auto bg-amber-100 text-amber-700 text-[10px] font-medium rounded-full px-1.5 py-0.5 leading-none">
            {agentStatus.pendingCount}
          </span>
        )}
      </NavLink>
    );
  };

  // ── JSX ───────────────────────────────────────────────────────────────────

  return (
    <TooltipProvider>
      <Sidebar className={isCollapsed ? "w-16" : "w-64"} collapsible="icon">
        <SidebarContent
          className="flex flex-col h-full overflow-hidden"
          style={{
            background: "#FFFFFF",
            borderRight: "1px solid var(--line, #E5E5E0)",
          }}
        >
          {/* User profile / toggle */}
          <div className="px-3 pt-3 pb-1 flex-shrink-0">
            {isCollapsed ? (
              <div className="flex justify-center">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={toggleSidebar}
                      className="p-2 rounded-lg transition-colors"
                      style={{ color: "#64748B" }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = "rgba(15,23,42,.05)";
                        e.currentTarget.style.color = "#0F172A";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "transparent";
                        e.currentTarget.style.color = "#64748B";
                      }}
                      aria-label="Expand sidebar"
                    >
                      <PanelLeft className="h-5 w-5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right">Expand sidebar</TooltipContent>
                </Tooltip>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setUserDropdownOpen(!userDropdownOpen)}
                    className="flex-1 flex items-center gap-3 px-2 py-2 rounded-lg transition-all"
                    style={{
                      background: userDropdownOpen ? "rgba(15,23,42,.05)" : "transparent",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "rgba(15,23,42,.05)";
                    }}
                    onMouseLeave={(e) => {
                      if (!userDropdownOpen) {
                        e.currentTarget.style.background = "transparent";
                      }
                    }}
                  >
                    <Avatar className="h-8 w-8 flex-shrink-0 ring-2 ring-[#3B82F6]/15">
                      {user?.picture && <AvatarImage src={user.picture} alt={user.name} />}
                      <AvatarFallback
                        className="text-xs font-medium"
                        style={{ background: "#DBEAFE", color: "#1D4ED8" }}
                      >
                        {user?.name
                          ?.split(" ")
                          .map((n) => n[0])
                          .join("")
                          .toUpperCase()
                          .slice(0, 2) ||
                          user?.email?.[0]?.toUpperCase() ||
                          "U"}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0 text-left">
                      <p
                        className="text-sm font-medium truncate"
                        style={{ color: "#0F172A", fontFamily: "var(--font-body)" }}
                      >
                        {user?.name || "User"}
                      </p>
                    </div>
                    <ChevronDown
                      className={cn(
                        "h-3.5 w-3.5 transition-transform flex-shrink-0",
                        userDropdownOpen && "rotate-180"
                      )}
                      style={{ color: "#94A3B8" }}
                    />
                  </button>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={toggleSidebar}
                        className="p-2 rounded-lg transition-colors flex-shrink-0"
                        style={{ color: "#64748B" }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = "rgba(15,23,42,.05)";
                          e.currentTarget.style.color = "#0F172A";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = "transparent";
                          e.currentTarget.style.color = "#64748B";
                        }}
                        aria-label="Collapse sidebar"
                      >
                        <PanelLeft className="h-4 w-4" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="right">Collapse sidebar</TooltipContent>
                  </Tooltip>
                </div>

                {/* Dropdown Menu */}
                {userDropdownOpen && (
                  <div className="mt-1 py-1 bg-white rounded-lg shadow-lg">
                    {userMenuItems.map((item) => (
                      <NavLink
                        key={item.title}
                        to={item.url}
                        onClick={() => {
                          setUserDropdownOpen(false);
                          trackNavClick(item.title, "sidebar_dropdown");
                        }}
                        className={({ isActive }) =>
                          cn(
                            "flex items-center gap-3 px-3 py-2 text-sm transition-colors",
                            isActive
                              ? "text-[#1E293B] bg-[rgba(30, 41, 59,0.1)]"
                              : "text-[#475569] hover:text-[#0F172A] hover:bg-[rgba(30, 41, 59,0.06)]"
                          )
                        }
                      >
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </NavLink>
                    ))}
                    <div className="my-1 border-t border-[#E2E8F0]" />
                    <button
                      onClick={handleSignOut}
                      className="w-full flex items-center gap-3 px-3 py-2 text-sm text-[#475569] hover:text-[#0F172A] hover:bg-[#EFF6FF] transition-colors"
                    >
                      <LogOut className="h-4 w-4" />
                      <span>Sign out</span>
                    </button>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto px-3 pt-2 pb-3 flex flex-col">
            {/* Group 1 - main */}
            <div className="space-y-0.5">
              {mainNavItems.map(renderNavItem)}
            </div>

            {/* Spacer pushes utility to bottom */}
            <div className="flex-1" />

            {/* Utility nav - bottom */}
            <div className="space-y-0.5">
              {utilityNavItems.map(renderNavItem)}
            </div>
          </nav>
        </SidebarContent>

        {/* Footer - Credits + Upgrade */}
        <SidebarFooter
          className="p-3"
          style={{
            borderTop: "1px solid var(--line, #E5E5E0)",
            background: "#FFFFFF",
          }}
        >
          {!isCollapsed ? (
            <div className="space-y-2.5">
              {/* Credits */}
              <div style={{ padding: "2px 2px 0" }}>
                <div className="flex items-center justify-between mb-1.5">
                  <span
                    style={{
                      fontSize: "11px",
                      fontWeight: 700,
                      letterSpacing: "0.06em",
                      color: "var(--ink-3, #8A8F9A)",
                      fontFamily: "var(--font-body)",
                      textTransform: "uppercase" as const,
                    }}
                  >
                    Credits
                  </span>
                  <span style={{ fontFamily: "var(--font-body)", lineHeight: 1 }}>
                    <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--accent, #4A60A8)" }}>
                      {credits}
                    </span>
                    <span style={{ fontSize: "12px", fontWeight: 500, color: "var(--ink-3, #8A8F9A)" }}>
                      {" "}
                      / {maxCredits}
                    </span>
                  </span>
                </div>
                <div
                  className="h-1 rounded-full overflow-hidden"
                  style={{ background: "var(--primary-100, #E4E9F5)" }}
                >
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${creditPercentage}%`,
                      background: "var(--accent, #4A60A8)",
                    }}
                  />
                </div>
              </div>

              {/* Upgrade button */}
              <button
                onClick={() => {
                  trackUpgradeClick("sidebar", { from_location: "sidebar" });
                  navigate("/pricing");
                }}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-[8px] transition-all"
                style={{
                  background: "var(--accent, #4A60A8)",
                  color: "#FFFFFF",
                  fontFamily: "var(--font-body)",
                  fontSize: "14px",
                  fontWeight: 600,
                  border: "none",
                  boxShadow: "var(--shadow-sm, 0 1px 2px rgba(17,19,24,0.04))",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "var(--primary-600, #4C62A8)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "var(--accent, #4A60A8)";
                }}
              >
                <Zap className="h-4 w-4" style={{ color: "#FFFFFF" }} />
                <span>Upgrade Plan</span>
              </button>
            </div>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => {
                    trackUpgradeClick("sidebar", { from_location: "sidebar" });
                    navigate("/pricing");
                  }}
                  className="w-full flex items-center justify-center p-2.5 rounded-[8px] transition-all"
                  style={{
                    background: "var(--accent, #4A60A8)",
                    color: "#FFFFFF",
                    border: "none",
                    boxShadow: "var(--shadow-sm, 0 1px 2px rgba(17,19,24,0.04))",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "var(--primary-600, #4C62A8)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "var(--accent, #4A60A8)";
                  }}
                >
                  <Zap className="h-5 w-5" style={{ color: "#FFFFFF" }} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">
                <div className="text-xs">
                  <p className="font-medium">
                    Credits: {credits}/{maxCredits}
                  </p>
                  <p className="text-gray-400 mt-0.5">Click to upgrade</p>
                </div>
              </TooltipContent>
            </Tooltip>
          )}
        </SidebarFooter>
      </Sidebar>
    </TooltipProvider>
  );
}
