import { useState } from "react";
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
  LayoutDashboard,
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
const InterviewPrepIcon = ({ className }: { className?: string }) => (
  <img 
    src={BriefcaseIcon} 
    alt="" 
    className={className}
    style={{ filter: 'brightness(0) invert(1)', opacity: 'inherit' }}
  />
);

// Custom image-based icon component for Find Companies
const FindCompaniesIcon = ({ className }: { className?: string }) => (
  <img 
    src={BuildingIcon} 
    alt="" 
    className={className}
    style={{ filter: 'brightness(0) invert(1)', opacity: 'inherit' }}
  />
);

// Custom image-based icon component for Companies (under TRACK)
const TrackCompaniesIcon = ({ className }: { className?: string }) => (
  <img 
    src={BuildingIcon2} 
    alt="" 
    className={className}
    style={{ filter: 'brightness(0) invert(1)', opacity: 'inherit' }}
  />
);

// Custom image-based icon component for Coffee Chat Prep
const CoffeeChatIcon = ({ className }: { className?: string }) => (
  <img 
    src={CupIcon} 
    alt="" 
    className={className}
    style={{ filter: 'brightness(0) invert(1)', opacity: 'inherit' }}
  />
);

// Custom image-based icon component for Find People (magnifying glass)
const FindPeopleIcon = ({ className }: { className?: string }) => (
  <img 
    src={MagnifyingGlassIcon} 
    alt="" 
    className={className}
    style={{ filter: 'brightness(0) invert(1)', opacity: 'inherit' }}
  />
);

// Custom image-based icon component for Find Hiring Managers
const FindHiringManagersIcon = ({ className }: { className?: string }) => (
  <img 
    src={FindUserIcon} 
    alt="" 
    className={className}
    style={{ filter: 'brightness(0) invert(1)', opacity: 'inherit' }}
  />
);

// Custom image-based icon component for Email Outreach
const EmailOutreachIcon = ({ className }: { className?: string }) => (
  <img 
    src={MailIcon} 
    alt="" 
    className={className}
    style={{ filter: 'brightness(0) invert(1)', opacity: 'inherit' }}
  />
);

// Custom image-based icon component for Resume
const ResumeIcon = ({ className }: { className?: string }) => (
  <img 
    src={PaperIcon} 
    alt="" 
    className={className}
    style={{ filter: 'brightness(0) invert(1)', opacity: 'inherit' }}
  />
);

// Custom image-based icon component for Networking
const NetworkingIcon = ({ className }: { className?: string }) => (
  <img 
    src={PeopleIcon} 
    alt="" 
    className={className}
    style={{ filter: 'brightness(0) invert(1)', opacity: 'inherit' }}
  />
);

// Custom image-based icon component for Cover Letter
const CoverLetterIcon = ({ className }: { className?: string }) => (
  <img 
    src={WriteIcon} 
    alt="" 
    className={className}
    style={{ filter: 'brightness(0) invert(1)', opacity: 'inherit' }}
  />
);

// Custom image-based icon component for Documentation
const DocumentationIcon = ({ className }: { className?: string }) => (
  <img 
    src={PlayIcon} 
    alt="" 
    className={className}
    style={{ filter: 'brightness(0) invert(1)', opacity: 'inherit' }}
  />
);

// Custom image-based icon component for Pricing
const PricingIcon = ({ className }: { className?: string }) => (
  <img 
    src={WalletIcon} 
    alt="" 
    className={className}
    style={{ filter: 'brightness(0) invert(1)', opacity: 'inherit' }}
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

// Top-level Dashboard item (shown above sections)
const dashboardItem = {
  title: "Dashboard",
  url: "/dashboard",
  icon: LayoutDashboard,
};

// Navigation sections with collapsible groups
const navigationSections = [
  {
    id: "find",
    title: "FIND",
    items: [
      { title: "Find People", url: "/contact-search", icon: FindPeopleIcon },
      { title: "Find Companies", url: "/firm-search", icon: FindCompaniesIcon },
      { title: "Find Hiring Managers", url: "/recruiter-spreadsheet", icon: FindHiringManagersIcon },
    ],
  },
  {
    id: "prepare",
    title: "PREPARE",
    items: [
      { title: "Coffee Chat Prep", url: "/coffee-chat-prep", icon: CoffeeChatIcon },
      { title: "Interview Prep", url: "/interview-prep", icon: InterviewPrepIcon },
    ],
  },
  {
    id: "write",
    title: "WRITE",
    items: [
      { title: "Resume", url: "/write/resume", icon: ResumeIcon },
      { title: "Cover Letter", url: "/write/cover-letter", icon: CoverLetterIcon },
    ],
  },
  {
    id: "track",
    title: "TRACK",
    items: [
      { title: "Track Email Outreach", url: "/outbox", icon: EmailOutreachIcon },
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
        <SidebarContent className="bg-[#3B82F6] flex flex-col h-full overflow-hidden">
          {/* Sidebar Toggle (Always Visible) & User Profile */}
          <div className="px-3 pt-3 pb-1 flex-shrink-0">
            {/* Collapsed State: Only Toggle Button */}
            {isCollapsed ? (
              <div className="flex justify-center">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={toggleSidebar}
                      className="p-2 rounded-lg hover:bg-white/10 transition-colors"
                      aria-label="Expand sidebar"
                    >
                      <PanelLeft className="h-5 w-5 text-white/70" />
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
                      "flex-1 flex items-center gap-3 px-2 py-2 rounded-lg transition-colors",
                      "hover:bg-white/10",
                      userDropdownOpen && "bg-white/10"
                    )}
                  >
                    <Avatar className="h-8 w-8 flex-shrink-0 ring-2 ring-white/20">
                      {user?.picture && (
                        <AvatarImage src={user.picture} alt={user.name} />
                      )}
                      <AvatarFallback className="bg-white/20 text-white text-xs font-medium">
                        {user?.name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || user?.email?.[0]?.toUpperCase() || "U"}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0 text-left">
                      <p className="text-sm font-medium text-white truncate">
                        {user?.name || "User"}
                      </p>
                    </div>
                    <ChevronDown 
                      className={cn(
                        "h-3.5 w-3.5 text-white/50 transition-transform flex-shrink-0",
                        userDropdownOpen && "rotate-180"
                      )} 
                    />
                  </button>

                  {/* Sidebar Toggle Button */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={toggleSidebar}
                        className="p-2 rounded-lg hover:bg-white/10 transition-colors flex-shrink-0"
                        aria-label="Collapse sidebar"
                      >
                        <PanelLeft className="h-4 w-4 text-white/60" />
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
                          ? "text-[#3B82F6] bg-blue-50"
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
            {/* Dashboard - Top-level item above sections */}
            <div className="mb-3">
              {isCollapsed ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <NavLink
                      to={dashboardItem.url}
                      onClick={() => {
                        trackNavClick(dashboardItem.title, 'sidebar', 'top_level');
                      }}
                      className={cn(
                        "flex items-center justify-center gap-2.5 px-2 py-2 rounded-md text-sm transition-colors",
                        isActive(dashboardItem.url)
                          ? "bg-white/20 text-white font-medium"
                          : "text-white/70 hover:text-white hover:bg-white/10"
                      )}
                    >
                      <dashboardItem.icon className={cn("h-5 w-5 flex-shrink-0", isActive(dashboardItem.url) ? "text-white" : "text-white/70")} />
                    </NavLink>
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    {dashboardItem.title}
                  </TooltipContent>
                </Tooltip>
              ) : (
                <NavLink
                  to={dashboardItem.url}
                  onClick={() => {
                    trackNavClick(dashboardItem.title, 'sidebar', 'top_level');
                  }}
                  className={cn(
                    "flex items-center gap-2.5 px-2 py-2 rounded-md text-sm font-medium transition-colors",
                    isActive(dashboardItem.url)
                      ? "bg-white/20 text-white"
                      : "text-white/90 hover:text-white hover:bg-white/10"
                  )}
                >
                  <dashboardItem.icon className={cn("h-5 w-5 flex-shrink-0", isActive(dashboardItem.url) ? "text-white" : "text-white/80")} />
                  <span>{dashboardItem.title}</span>
                </NavLink>
              )}
            </div>
            
            {navigationSections.map((section) => (
              <div key={section.id} className="mb-1">
                {/* Section Header */}
                <button
                  onClick={() => toggleSection(section.id)}
                  className={cn(
                    "w-full flex items-center justify-between px-2 py-1.5 rounded-md transition-colors",
                    "hover:bg-white/10",
                    isCollapsed && "justify-center"
                  )}
                >
                  {!isCollapsed && (
                    <>
                      <span className="text-xs font-medium text-white/80 tracking-wide">
                        {section.title}
                      </span>
                      <ChevronRight
                        className={cn(
                          "h-3.5 w-3.5 text-white/50 transition-transform",
                          expandedSections.includes(section.id) && "rotate-90"
                        )}
                      />
                    </>
                  )}
                  {isCollapsed && (
                    <span className="text-xs font-medium text-white/80">
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
                        onClick={() => {
                          trackNavClick(item.title, 'sidebar', section.id);
                        }}
                        className={cn(
                          "flex items-center gap-2.5 px-2 py-1.5 rounded-md text-sm transition-colors",
                          isActive(item.url)
                            ? "bg-white/20 text-white font-medium"
                            : "text-white/70 hover:text-white hover:bg-white/10",
                          isCollapsed && "justify-center px-2"
                        )}
                      >
                        <item.icon className={cn("h-4 w-4 flex-shrink-0", isActive(item.url) ? "text-white" : "text-white/70")} />
                        {!isCollapsed && <span>{item.title}</span>}
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {/* Standalone Items (Pricing, Documentation) */}
            <div className="mt-4 pt-3 border-t border-white/20">
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
                      "flex items-center gap-2.5 px-2 py-1.5 rounded-md text-sm transition-colors",
                      "text-white/70 hover:text-white hover:bg-white/10",
                      isCollapsed && "justify-center px-2"
                    )}
                  >
                    <item.icon className="h-4 w-4 flex-shrink-0 text-white/70" />
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
                      "flex items-center gap-2.5 px-2 py-1.5 rounded-md text-sm transition-colors",
                      isActive(item.url)
                        ? "bg-white/20 text-white font-medium"
                        : "text-white/70 hover:text-white hover:bg-white/10",
                      isCollapsed && "justify-center px-2"
                    )}
                  >
                    <item.icon className={cn("h-4 w-4 flex-shrink-0", isActive(item.url) ? "text-white" : "text-white/70")} />
                    {!isCollapsed && <span>{item.title}</span>}
                  </NavLink>
                )
              ))}
            </div>
          </nav>
        </SidebarContent>

        {/* Footer - Credits & Upgrade */}
        <SidebarFooter className="border-t border-white/20 bg-[#3B82F6] p-3">
          {!isCollapsed ? (
            <div className="space-y-4">
              {/* Credits Display */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-white/90">Credits</span>
                  <span className="text-sm font-semibold text-white">
                    {credits}/{maxCredits}
                  </span>
                </div>
                <div className="h-2 bg-white/20 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-white rounded-full transition-all duration-300"
                    style={{ width: `${creditPercentage}%` }}
                  />
                </div>
              </div>

              {/* Upgrade Button - White with blue text */}
              <button
                onClick={() => {
                  trackUpgradeClick('sidebar', { from_location: 'sidebar' });
                  navigate("/pricing");
                }}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-white hover:bg-gray-50 text-[#3B82F6] text-sm font-medium rounded-lg transition-colors"
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
                  className="w-full flex items-center justify-center p-2 bg-white hover:bg-gray-50 text-[#3B82F6] rounded-lg transition-colors"
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
