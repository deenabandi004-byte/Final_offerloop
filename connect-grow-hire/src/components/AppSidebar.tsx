import React, { useState } from "react";
import {
  ChevronRight,
  ChevronDown,
  Zap,
  LogOut,
  Settings,
  Info,
  MessageSquare,
  Shield,
  ScrollText,
  PanelLeft,
  Calendar as CalendarIcon,
} from "lucide-react";
import BriefcaseIcon from "@/assets/sidebaricons/icons8-briefcase-48.png";
import BuildingIcon from "@/assets/sidebaricons/icons8-building-50.png";
import BuildingIcon2 from "@/assets/sidebaricons/icons8-building-50 2.png";
import CupIcon from "@/assets/sidebaricons/icons8-cup-48.png";
import FindUserIcon from "@/assets/sidebaricons/icons8-find-user-male-48 (1).png";
import MailIcon from "@/assets/sidebaricons/icons8-important-mail-48.png";
import MagnifyingGlassIcon from "@/assets/sidebaricons/icons8-magnifying-glass-50.png";
import PaperIcon from "@/assets/sidebaricons/icons8-paper-48.png";
import PeopleIcon from "@/assets/sidebaricons/icons8-people-working-together-48.png";
import WriteIcon from "@/assets/sidebaricons/icons8-write-48.png";
import PlayIcon from "@/assets/icons8-play-50.png";
import WalletIcon from "@/assets/sidebaricons/icons8-wallet-48.png";

// Custom image-based icon component for Interview Prep
const InterviewPrepIcon = ({ className, style }: { className?: string; style?: React.CSSProperties }) => (
  <img 
    src={BriefcaseIcon} 
    alt="" 
    className={className}
    style={{ 
      filter: 'brightness(0) saturate(100%)',
      opacity: 0.45,
      ...style,
    }}
  />
);

// Custom image-based icon component for Find Companies
const FindCompaniesIcon = ({ className, style }: { className?: string; style?: React.CSSProperties }) => (
  <img 
    src={BuildingIcon} 
    alt="" 
    className={className}
    style={{ 
      filter: 'brightness(0) saturate(100%)',
      opacity: 0.45,
      ...style,
    }}
  />
);

// Custom image-based icon component for Companies (under TRACK)
const TrackCompaniesIcon = ({ className, style }: { className?: string; style?: React.CSSProperties }) => (
  <img 
    src={BuildingIcon2} 
    alt="" 
    className={className}
    style={{ 
      filter: 'brightness(0) saturate(100%)',
      opacity: 0.45,
      ...style,
    }}
  />
);

// Custom image-based icon component for Coffee Chat Prep
const CoffeeChatIcon = ({ className, style }: { className?: string; style?: React.CSSProperties }) => (
  <img 
    src={CupIcon} 
    alt="" 
    className={className}
    style={{ 
      filter: 'brightness(0) saturate(100%)',
      opacity: 0.45,
      ...style,
    }}
  />
);

// Custom image-based icon component for Find People (magnifying glass)
const FindPeopleIcon = ({ className, style }: { className?: string; style?: React.CSSProperties }) => (
  <img 
    src={MagnifyingGlassIcon} 
    alt="" 
    className={className}
    style={{ 
      filter: 'brightness(0) saturate(100%)',
      opacity: 0.45,
      ...style,
    }}
  />
);

// Custom image-based icon component for Find Hiring Managers
const FindHiringManagersIcon = ({ className, style }: { className?: string; style?: React.CSSProperties }) => (
  <img 
    src={FindUserIcon} 
    alt="" 
    className={className}
    style={{ 
      filter: 'brightness(0) saturate(100%)',
      opacity: 0.45,
      ...style,
    }}
  />
);

// Custom image-based icon component for Email Outreach
const EmailOutreachIcon = ({ className, style }: { className?: string; style?: React.CSSProperties }) => (
  <img 
    src={MailIcon} 
    alt="" 
    className={className}
    style={{ 
      filter: 'brightness(0) saturate(100%)',
      opacity: 0.45,
      ...style,
    }}
  />
);

// Custom image-based icon component for Resume
const ResumeIcon = ({ className, style }: { className?: string; style?: React.CSSProperties }) => (
  <img 
    src={PaperIcon} 
    alt="" 
    className={className}
    style={{ 
      filter: 'brightness(0) saturate(100%)',
      opacity: 0.45,
      ...style,
    }}
  />
);

// Custom image-based icon component for Networking
const NetworkingIcon = ({ className, style }: { className?: string; style?: React.CSSProperties }) => (
  <img 
    src={PeopleIcon} 
    alt="" 
    className={className}
    style={{ 
      filter: 'brightness(0) saturate(100%)',
      opacity: 0.45,
      ...style,
    }}
  />
);

// Custom image-based icon component for Cover Letter
const CoverLetterIcon = ({ className, style }: { className?: string; style?: React.CSSProperties }) => (
  <img 
    src={WriteIcon} 
    alt="" 
    className={className}
    style={{ 
      filter: 'brightness(0) saturate(100%)',
      opacity: 0.45,
      ...style,
    }}
  />
);

// Custom image-based icon component for Documentation
const DocumentationIcon = ({ className, style }: { className?: string; style?: React.CSSProperties }) => (
  <img 
    src={PlayIcon} 
    alt="" 
    className={className}
    style={{ 
      filter: 'brightness(0) saturate(100%)',
      opacity: 0.45,
      ...style,
    }}
  />
);

// Custom image-based icon component for Pricing
const PricingIcon = ({ className, style }: { className?: string; style?: React.CSSProperties }) => (
  <img 
    src={WalletIcon} 
    alt="" 
    className={className}
    style={{ 
      filter: 'brightness(0) saturate(100%)',
      opacity: 0.45,
      ...style,
    }}
  />
);
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

// Navigation sections with collapsible groups (dataTour = product tour target id)
const navigationSections = [
  {
    id: "find",
    title: "FIND",
    items: [
      { title: "Find People", url: "/contact-search", icon: FindPeopleIcon },
      { title: "Find Companies", url: "/firm-search", icon: FindCompaniesIcon, dataTour: "tour-find-companies" },
      { title: "Find Hiring Managers", url: "/recruiter-spreadsheet", icon: FindHiringManagersIcon, dataTour: "tour-find-hiring-managers" },
    ],
  },
  {
    id: "prepare",
    title: "PREPARE",
    items: [
      { title: "Coffee Chat Prep", url: "/coffee-chat-prep", icon: CoffeeChatIcon, dataTour: "tour-coffee-chat-prep" },
      { title: "Interview Prep", url: "/interview-prep", icon: InterviewPrepIcon, dataTour: "tour-interview-prep" },
    ],
  },
  {
    id: "write",
    title: "WRITE",
    items: [
      { title: "Resume", url: "/write/resume", icon: ResumeIcon, dataTour: "tour-resume" },
      { title: "Cover Letter", url: "/write/cover-letter", icon: CoverLetterIcon },
    ],
  },
  {
    id: "track",
    title: "TRACK",
    items: [
      { title: "Track Email Outreach", url: "/outbox", icon: EmailOutreachIcon, dataTour: "tour-track-email" },
      { title: "Calendar", url: "/calendar", icon: CalendarIcon },
      { title: "Networking", url: "/contact-directory", icon: NetworkingIcon },
      { title: "Hiring Managers", url: "/hiring-manager-tracker", icon: FindHiringManagersIcon },
      { title: "Companies", url: "/company-tracker", icon: TrackCompaniesIcon },
    ],
  },
];

// User dropdown menu items
const userMenuItems = [
  { title: "Account Settings", url: "/account-settings", icon: Settings },
  { title: "About Us", url: "/about", icon: Info },
  { title: "Contact Us", url: "/contact-us", icon: MessageSquare },
  { title: "Privacy Policy", url: "/privacy", icon: Shield },
  { title: "Terms of Service", url: "/terms-of-service", icon: ScrollText },
];

// Standalone navigation items (below TRACK, not grouped)
const standaloneItems = [
  { title: "Pricing", url: "/pricing", icon: PricingIcon },
  { title: "Documentation", url: "https://docs.offerloop.ai", icon: DocumentationIcon, external: true },
];

export function AppSidebar() {
  const { state, toggleSidebar } = useSidebar();
  const location = useLocation();
  const navigate = useNavigate();
  const currentPath = location.pathname;
  const { user, signOut } = useFirebaseAuth();
  
  // Track which sections are expanded - ALL expanded by default
  const [expandedSections, setExpandedSections] = useState<string[]>(
    () => navigationSections.map(section => section.id)
  );
  
  // User dropdown state
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);

  const toggleSection = (sectionId: string) => {
    setExpandedSections(prev =>
      prev.includes(sectionId)
        ? prev.filter(id => id !== sectionId)
        : [...prev, sectionId]
    );
  };

  const isActive = (url: string) => {
    const basePath = url.split('?')[0];
    return currentPath === basePath || currentPath.startsWith(basePath + '/');
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      navigate('/');
    } catch (error) {
      console.error('Sign out error:', error);
    }
  };

  // Credit calculations
  const credits = user?.credits ?? 0;
  const maxCredits = user?.maxCredits ?? 300;
  const creditPercentage = Math.min((credits / maxCredits) * 100, 100);

  const isCollapsed = state === "collapsed";

  return (
    <TooltipProvider>
      <Sidebar className={isCollapsed ? "w-16" : "w-64"} collapsible="icon">
        <SidebarContent 
          className="flex flex-col h-full overflow-hidden" 
          style={{ 
            background: '#F0F4FD',
            borderRight: '1px solid rgba(37, 99, 235, 0.08)',
          }}
        >
          {/* Sidebar Toggle (Always Visible) & User Profile */}
          <div className="px-3 pt-3 pb-1 flex-shrink-0">
            {/* Collapsed State: Only Toggle Button */}
            {isCollapsed ? (
              <div className="flex justify-center">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={toggleSidebar}
                      className="p-2 rounded-lg transition-colors"
                      style={{ color: '#94A3B8' }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(37, 99, 235, 0.05)';
                        e.currentTarget.style.color = '#64748B';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'transparent';
                        e.currentTarget.style.color = '#94A3B8';
                      }}
                      aria-label="Expand sidebar"
                    >
                      <PanelLeft className="h-5 w-5" style={{ color: '#94A3B8' }} />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    Expand sidebar
                  </TooltipContent>
                </Tooltip>
              </div>
            ) : (
              /* Expanded State: Profile + Toggle */
              <>
                <div className="flex items-center gap-1">
                  {/* Profile Dropdown Button */}
                  <button
                    onClick={() => setUserDropdownOpen(!userDropdownOpen)}
                    className={cn(
                      "flex-1 flex items-center gap-3 px-2 py-2 rounded-lg transition-all",
                    )}
                    style={{
                      background: userDropdownOpen ? 'rgba(37, 99, 235, 0.05)' : 'transparent',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(37, 99, 235, 0.05)';
                    }}
                    onMouseLeave={(e) => {
                      if (!userDropdownOpen) {
                        e.currentTarget.style.background = 'transparent';
                      }
                    }}
                  >
                    <Avatar className="h-8 w-8 flex-shrink-0 ring-2 ring-blue-100">
                      {user?.picture && (
                        <AvatarImage src={user.picture} alt={user.name} />
                      )}
                      <AvatarFallback 
                        className="text-xs font-medium"
                        style={{ background: 'rgba(37, 99, 235, 0.10)', color: '#2563EB' }}
                      >
                        {user?.name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || user?.email?.[0]?.toUpperCase() || "U"}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0 text-left">
                      <p 
                        className="text-sm font-medium truncate"
                        style={{ color: '#1E293B', fontFamily: 'var(--font-body)' }}
                      >
                        {user?.name || "User"}
                      </p>
                    </div>
                    <ChevronDown 
                      className={cn(
                        "h-3.5 w-3.5 transition-transform flex-shrink-0",
                        userDropdownOpen && "rotate-180"
                      )} 
                      style={{ color: '#94A3B8' }}
                    />
                  </button>

                  {/* Sidebar Toggle Button */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={toggleSidebar}
                        className="p-2 rounded-lg transition-colors flex-shrink-0"
                        style={{ color: '#94A3B8' }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = 'rgba(37, 99, 235, 0.05)';
                          e.currentTarget.style.color = '#64748B';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'transparent';
                          e.currentTarget.style.color = '#94A3B8';
                        }}
                        aria-label="Collapse sidebar"
                      >
                        <PanelLeft className="h-4 w-4" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="right">
                      Collapse sidebar
                    </TooltipContent>
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
                      trackNavClick(item.title, 'sidebar_dropdown');
                    }}
                    className={({ isActive }) =>
                      cn(
                        "flex items-center gap-3 px-3 py-2 text-sm transition-colors",
                        isActive
                          ? "text-[#2563EB] bg-blue-50"
                          : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                      )
                    }
                  >
                    <item.icon className="h-4 w-4" />
                    <span>{item.title}</span>
                  </NavLink>
                ))}
                <div className="my-1 border-t border-gray-100" />
                <button
                  onClick={handleSignOut}
                  className="w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-50 transition-colors"
                >
                  <LogOut className="h-4 w-4" />
                  <span>Sign out</span>
                </button>
                </div>
                )}
              </>
            )}
          </div>

          {/* Navigation Sections */}
          <nav className="flex-1 overflow-y-auto px-3 pt-1 pb-3">
            {navigationSections.map((section) => (
              <div key={section.id} className="mb-1">
                {/* Section Header */}
                <button
                  onClick={() => toggleSection(section.id)}
                  className={cn(
                    "w-full flex items-center justify-between px-2 py-1.5 rounded-md transition-colors",
                    isCollapsed && "justify-center"
                  )}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(37, 99, 235, 0.04)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                >
                  {!isCollapsed && (
                    <>
                      <span 
                        style={{ 
                          fontSize: '11px', 
                          fontWeight: 600, 
                          letterSpacing: '0.06em', 
                          color: '#94A3B8',
                          fontFamily: 'var(--font-body)',
                        }}
                      >
                        {section.title}
                      </span>
                      <ChevronRight
                        className={cn("h-3.5 w-3.5 transition-transform", expandedSections.includes(section.id) && "rotate-90")} 
                        style={{ color: '#94A3B8' }}
                      />
                    </>
                  )}
                  {isCollapsed && (
                    <span 
                      style={{ 
                        fontSize: '11px', 
                        fontWeight: 600, 
                        color: '#94A3B8',
                        fontFamily: 'var(--font-body)',
                      }}
                    >
                      {section.title.charAt(0)}
                    </span>
                  )}
                </button>

                {/* Section Items */}
                {(expandedSections.includes(section.id) || isCollapsed) && (
                  <div className={cn("mt-0.5", !isCollapsed && "ml-1")}>
                    {section.items.map((item) => (
                      <NavLink
                        key={item.title}
                        to={item.url}
                        data-tour={(item as { dataTour?: string }).dataTour}
                        onClick={() => {
                          trackNavClick(item.title, 'sidebar', section.id);
                        }}
                        className={cn(
                          "flex items-center gap-2.5 px-2.5 py-1.5 rounded-[8px] text-sm transition-all",
                          isCollapsed && "justify-center px-2"
                        )}
                        style={{
                          background: isActive(item.url) ? 'rgba(37, 99, 235, 0.10)' : 'transparent',
                          color: isActive(item.url) ? '#2563EB' : '#64748B',
                          fontWeight: isActive(item.url) ? 500 : 400,
                          fontFamily: 'var(--font-body)',
                        }}
                        onMouseEnter={(e) => {
                          if (!isActive(item.url)) {
                            e.currentTarget.style.background = 'rgba(37, 99, 235, 0.05)';
                            e.currentTarget.style.color = '#334155';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!isActive(item.url)) {
                            e.currentTarget.style.background = 'transparent';
                            e.currentTarget.style.color = '#64748B';
                          }
                        }}
                      >
                        <item.icon 
                          className={cn("h-4 w-4 flex-shrink-0")} 
                          style={{ 
                            opacity: isActive(item.url) ? 0.7 : 0.35,
                          }}
                        />
                        {!isCollapsed && <span>{item.title}</span>}
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {/* Standalone Items (Pricing, Documentation) */}
            <div className="mt-4 pt-3" style={{ borderTop: '1px solid rgba(37, 99, 235, 0.08)' }}>
              {standaloneItems.map((item) => (
                item.external ? (
                  <a
                    key={item.title}
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => {
                      trackNavClick(item.title, 'sidebar', 'standalone');
                    }}
                    className={cn(
                      "flex items-center gap-2.5 px-2.5 py-1.5 rounded-[8px] text-sm transition-all",
                      isCollapsed && "justify-center px-2"
                    )}
                    style={{
                      color: '#64748B',
                      fontWeight: 400,
                      fontFamily: 'var(--font-body)',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(37, 99, 235, 0.05)';
                      e.currentTarget.style.color = '#334155';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent';
                      e.currentTarget.style.color = '#64748B';
                    }}
                  >
                    <item.icon 
                      className="h-4 w-4 flex-shrink-0" 
                      style={{ opacity: 0.35 }}
                    />
                    {!isCollapsed && <span>{item.title}</span>}
                  </a>
                ) : (
                  <NavLink
                    key={item.title}
                    to={item.url}
                    onClick={() => {
                      trackNavClick(item.title, 'sidebar', 'standalone');
                    }}
                    className={cn(
                      "flex items-center gap-2.5 px-2.5 py-1.5 rounded-[8px] text-sm transition-all",
                      isCollapsed && "justify-center px-2"
                    )}
                    style={{
                      background: isActive(item.url) ? 'rgba(37, 99, 235, 0.10)' : 'transparent',
                      color: isActive(item.url) ? '#2563EB' : '#64748B',
                      fontWeight: isActive(item.url) ? 500 : 400,
                      fontFamily: 'var(--font-body)',
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive(item.url)) {
                        e.currentTarget.style.background = 'rgba(37, 99, 235, 0.05)';
                        e.currentTarget.style.color = '#334155';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive(item.url)) {
                        e.currentTarget.style.background = 'transparent';
                        e.currentTarget.style.color = '#64748B';
                      }
                    }}
                  >
                    <item.icon 
                      className={cn("h-4 w-4 flex-shrink-0")} 
                      style={{ 
                        opacity: isActive(item.url) ? 0.7 : 0.35,
                      }}
                    />
                    {!isCollapsed && <span>{item.title}</span>}
                  </NavLink>
                )
              ))}
            </div>
          </nav>
        </SidebarContent>

        {/* Footer - Credits & Upgrade */}
        <SidebarFooter 
          className="p-3" 
          style={{ 
            borderTop: '1px solid rgba(37, 99, 235, 0.08)', 
            background: '#E8EDF8',
          }}
        >
          {!isCollapsed ? (
            <div className="space-y-4">
              {/* Credits Display */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span style={{ fontSize: '13px', fontWeight: 500, color: '#64748B', fontFamily: 'var(--font-body)' }}>
                    Credits
                  </span>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: '#1E293B', fontFamily: 'var(--font-body)' }}>
                    {credits}/{maxCredits}
                  </span>
                </div>
                <div 
                  className="h-1.5 rounded-full overflow-hidden" 
                  style={{ background: 'rgba(37, 99, 235, 0.10)' }}
                >
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{ 
                      width: `${creditPercentage}%`,
                      background: '#2563EB',
                    }}
                  />
                </div>
              </div>

              {/* Upgrade Button - White with blue text */}
              <button
                onClick={() => {
                  trackUpgradeClick('sidebar', { from_location: 'sidebar' });
                  navigate("/pricing");
                }}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded-[8px] transition-all"
                style={{
                  background: '#2563EB',
                  color: 'white',
                  fontFamily: 'var(--font-body)',
                  border: 'none',
                  boxShadow: '0 1px 3px rgba(37, 99, 235, 0.2)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#1d4ed8';
                  e.currentTarget.style.boxShadow = '0 2px 6px rgba(37, 99, 235, 0.3)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = '#2563EB';
                  e.currentTarget.style.boxShadow = '0 1px 3px rgba(37, 99, 235, 0.2)';
                }}
              >
                <Zap className="h-4 w-4" />
                <span>Upgrade Plan</span>
              </button>
            </div>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => {
                    trackUpgradeClick('sidebar', { from_location: 'sidebar' });
                    navigate("/pricing");
                  }}
                  className="w-full flex items-center justify-center p-2 rounded-[8px] transition-all"
                  style={{
                    background: '#2563EB',
                    color: 'white',
                    border: 'none',
                    boxShadow: '0 1px 3px rgba(37, 99, 235, 0.2)',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = '#1d4ed8';
                    e.currentTarget.style.boxShadow = '0 2px 6px rgba(37, 99, 235, 0.3)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = '#2563EB';
                    e.currentTarget.style.boxShadow = '0 1px 3px rgba(37, 99, 235, 0.2)';
                  }}
                >
                  <Zap className="h-5 w-5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">
                <div className="text-xs">
                  <p className="font-medium">Credits: {credits}/{maxCredits}</p>
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
