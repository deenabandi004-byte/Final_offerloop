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
  CalendarRange,
} from "lucide-react";
import CupIcon from "@/assets/sidebaricons/icons8-cup-48.png";
import MailIcon from "@/assets/sidebaricons/icons8-important-mail-48.png";
import MagnifyingGlassIcon from "@/assets/sidebaricons/icons8-magnifying-glass-50.png";
import BriefcaseIcon from "@/assets/sidebaricons/icons8-briefcase-48.png";

import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useFirebaseAuth } from "../contexts/FirebaseAuthContext";
import { trackNavClick, trackUpgradeClick } from "../lib/analytics";

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

const IMG_FILTER_ACTIVE =
  "brightness(0) saturate(100%) invert(14%) sepia(20%) saturate(1200%) hue-rotate(190deg) brightness(30%) contrast(105%)";
const IMG_FILTER_INACTIVE = "brightness(0) saturate(100%) invert(100%) sepia(0%) saturate(0%) hue-rotate(0deg) brightness(100%) contrast(100%) opacity(0.5)";

type NavItemDef = {
  title: string;
  url: string;
  dataTour?: string;
  newTab?: boolean;
  iconColor?: string; // per-item color for inactive state
  activeColor?: string; // per-item override for active icon/text color
  activeFilter?: string; // per-item override for active img filter
  activeBg?: string; // per-item override for active background
} & (
  | { iconSrc: string; LucideIcon?: never }
  | { LucideIcon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>; iconSrc?: never }
);

// CSS filter generators — cool blue/indigo family, vivid
const ICON_FILTERS: Record<string, string> = {
  blue:      "brightness(0) saturate(100%) invert(60%) sepia(90%) saturate(800%) hue-rotate(190deg) brightness(115%) contrast(95%)",
  sky:       "brightness(0) saturate(100%) invert(70%) sepia(60%) saturate(700%) hue-rotate(175deg) brightness(115%) contrast(95%)",
  indigo:    "brightness(0) saturate(100%) invert(55%) sepia(70%) saturate(800%) hue-rotate(210deg) brightness(115%) contrast(95%)",
  slate:     "brightness(0) saturate(100%) invert(65%) sepia(40%) saturate(600%) hue-rotate(190deg) brightness(120%) contrast(90%)",
  brown:     "brightness(0) saturate(100%) invert(35%) sepia(40%) saturate(600%) hue-rotate(350deg) brightness(110%) contrast(90%)",
};

// Group 1 — main nav
const mainNavItems: NavItemDef[] = [
  { title: "Find", url: "/find", iconSrc: MagnifyingGlassIcon },
  { title: "My Network", url: "/my-network", LucideIcon: Users },
  { title: "Coffee Chat Prep", url: "/coffee-chat-prep", iconSrc: CupIcon, dataTour: "tour-coffee-chat-prep" },
  { title: "Tracker", url: "/tracker", iconSrc: MailIcon, dataTour: "tour-track-email" },
  { title: "Job Board", url: "/job-board", iconSrc: BriefcaseIcon },
  { title: "Timeline", url: "/recruiting-timeline", LucideIcon: CalendarRange },
];

// Utility nav — bottom of sidebar
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

const NAV_FONT_SIZE = "13.5px";
const NAV_PY = "11px";
const NAV_GAP = "10px";
const NAV_RADIUS = "8px";

const ACTIVE_BG = "rgba(255,255,255,1)";
const ACTIVE_SHADOW = "none";
const ACTIVE_COLOR = "#1B2A44";
const INACTIVE_ICON = "rgba(255,255,255,.50)";
const INACTIVE_LABEL = "rgba(255,255,255,.55)";
const HOVER_BG = "rgba(255,255,255,.08)";
const HOVER_LABEL = "rgba(255,255,255,.85)";

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

  // ── Render a single nav item (works for both image-icon and lucide-icon) ──

  const renderNavItem = (item: NavItemDef) => {
    const active = isActive(item.url);

    const inactiveFilter = item.iconColor && ICON_FILTERS[item.iconColor]
      ? ICON_FILTERS[item.iconColor]
      : IMG_FILTER_INACTIVE;

    const icon = item.iconSrc ? (
      <img
        src={item.iconSrc}
        alt=""
        className="h-4 w-4 flex-shrink-0"
        style={{
          filter: active ? (item.activeFilter || IMG_FILTER_ACTIVE) : inactiveFilter,
          opacity: 1,
        }}
      />
    ) : item.LucideIcon ? (
      <item.LucideIcon
        className="h-4 w-4 flex-shrink-0"
        style={{ color: active ? (item.activeColor || ACTIVE_COLOR) : (item.iconColor && !ICON_FILTERS[item.iconColor] ? item.iconColor : INACTIVE_ICON) }}
      />
    ) : null;

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
                  background: active ? (item.activeBg || ACTIVE_BG) : "transparent",
                  boxShadow: active ? ACTIVE_SHADOW : "none",
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
          fontWeight: active ? 500 : 400,
          fontFamily: "var(--font-body)",
          background: active ? (item.activeBg || ACTIVE_BG) : "transparent",
          boxShadow: active ? ACTIVE_SHADOW : "none",
          color: active ? (item.activeColor || ACTIVE_COLOR) : INACTIVE_LABEL,
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
        {icon}
        <span>{item.title}</span>
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
            background: "var(--brand, #1B2A44)",
            borderRight: "0.5px solid rgba(255,255,255,.06)",
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
                      style={{ color: "rgba(255,255,255,.45)" }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = "rgba(255,255,255,.06)";
                        e.currentTarget.style.color = "rgba(255,255,255,.75)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "transparent";
                        e.currentTarget.style.color = "rgba(255,255,255,.45)";
                      }}
                      aria-label="Expand sidebar"
                    >
                      <PanelLeft className="h-5 w-5" style={{ color: "rgba(255,255,255,.45)" }} />
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
                      background: userDropdownOpen ? "rgba(255,255,255,.06)" : "transparent",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "rgba(255,255,255,.06)";
                    }}
                    onMouseLeave={(e) => {
                      if (!userDropdownOpen) {
                        e.currentTarget.style.background = "transparent";
                      }
                    }}
                  >
                    <Avatar className="h-8 w-8 flex-shrink-0 ring-2 ring-white/20">
                      {user?.picture && <AvatarImage src={user.picture} alt={user.name} />}
                      <AvatarFallback
                        className="text-xs font-medium"
                        style={{ background: "rgba(255,255,255,.15)", color: "#FFFFFF" }}
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
                        style={{ color: "#fff", fontFamily: "var(--font-body)" }}
                      >
                        {user?.name || "User"}
                      </p>
                    </div>
                    <ChevronDown
                      className={cn(
                        "h-3.5 w-3.5 transition-transform flex-shrink-0",
                        userDropdownOpen && "rotate-180"
                      )}
                      style={{ color: "rgba(255,255,255,.45)" }}
                    />
                  </button>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={toggleSidebar}
                        className="p-2 rounded-lg transition-colors flex-shrink-0"
                        style={{ color: "rgba(255,255,255,.45)" }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = "rgba(255,255,255,.06)";
                          e.currentTarget.style.color = "rgba(255,255,255,.75)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = "transparent";
                          e.currentTarget.style.color = "rgba(255,255,255,.45)";
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
                              ? "text-[#78553A] bg-[rgba(120,85,58,0.1)]"
                              : "text-[#475569] hover:text-[#0F172A] hover:bg-[rgba(120,85,58,0.06)]"
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
            {/* Group 1 — main */}
            <div className="space-y-0.5">
              {mainNavItems.map(renderNavItem)}
            </div>

            {/* Spacer pushes utility to bottom */}
            <div className="flex-1" />

            {/* Utility nav — bottom */}
            <div className="space-y-0.5">
              {utilityNavItems.map(renderNavItem)}
            </div>
          </nav>
        </SidebarContent>

        {/* Footer — Credits + Upgrade */}
        <SidebarFooter
          className="p-3"
          style={{
            borderTop: "0.5px solid rgba(255,255,255,.07)",
            background: "var(--brand, #1B2A44)",
          }}
        >
          {!isCollapsed ? (
            <div className="space-y-3">
              {/* Credits */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span
                    style={{
                      fontSize: "11px",
                      fontWeight: 700,
                      letterSpacing: "0.06em",
                      color: "rgba(255,255,255,.45)",
                      fontFamily: "var(--font-body)",
                      textTransform: "uppercase" as const,
                    }}
                  >
                    Credits
                  </span>
                  <span
                    style={{
                      fontSize: "12px",
                      fontWeight: 600,
                      color: "rgba(255,255,255,.7)",
                      fontFamily: "var(--font-body)",
                    }}
                  >
                    {credits} / {maxCredits}
                  </span>
                </div>
                <div
                  className="h-1 rounded-full overflow-hidden"
                  style={{ background: "rgba(255, 255, 255, 0.12)" }}
                >
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${creditPercentage}%`,
                      background: "rgba(255,255,255,.7)",
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
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded-[6px] transition-all"
                style={{
                  background: "#FFFFFF",
                  color: "var(--brand, #1B2A44)",
                  fontFamily: "var(--font-body)",
                  fontWeight: 600,
                  border: "none",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.opacity = "0.9";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.opacity = "1";
                }}
              >
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
                  className="w-full flex items-center justify-center p-2 rounded-[6px] transition-all"
                  style={{
                    background: "#FFFFFF",
                    color: "var(--brand, #1B2A44)",
                    border: "none",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.opacity = "0.9";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.opacity = "1";
                  }}
                >
                  <Zap className="h-5 w-5" />
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
