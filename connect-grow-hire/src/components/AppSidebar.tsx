import { useState } from "react";
import {
  Home,
  User,
  Zap,
  Info,
  Settings,
  CreditCard,
  ChevronRight,
  ChevronDown,
  Coffee,
  Search,
  Briefcase,
  Building2,
} from "lucide-react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { Logo } from "./Logo";
import LightningIcon from "../assets/Lightning.png";
import { useFirebaseAuth } from "../contexts/FirebaseAuthContext";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
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

const navigationItems = [
  { title: "Home", url: "/home", icon: Home },
  { title: "Contact Search", url: "/contact-search", icon: Search },
  { title: "Coffee Chat Prep", url: "/coffee-chat-prep", icon: Coffee },
  { title: "Interview Prep", url: "/interview-prep", icon: Briefcase },
  { title: "Firm Search", url: "/firm-search", icon: Building2 },
  { title: "Pricing", url: "/pricing", icon: CreditCard },
];

const settingsItems = [
  { title: "Account Settings", url: "/account-settings", icon: User },
  { title: "About Us", url: "/about", icon: Info },
  { title: "Contact Us", url: "/contact-us", icon: User },
  { title: "Privacy Policy", url: "/privacy", icon: User },
  { title: "Terms of Service", url: "/terms-of-service", icon: User },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const location = useLocation();
  const navigate = useNavigate();
  const currentPath = location.pathname;
  const [settingsExpanded, setSettingsExpanded] = useState(false);
  const { user } = useFirebaseAuth();

  const isActive = (path: string) => currentPath === path;
  const isSettingsActive = settingsItems.some((item) => isActive(item.url));

  const getNavClass = ({ isActive }: { isActive: boolean }) =>
    isActive
      ? "!bg-gradient-to-r !from-cyan-400 !to-teal-600 !text-white !font-medium !bg-sidebar-accent/0 data-[active=true]:!bg-gradient-to-r data-[active=true]:!from-cyan-400 data-[active=true]:!to-teal-600 data-[active=true]:!text-white data-[active=true]:!bg-sidebar-accent/0"
      : "text-muted-foreground hover:!bg-gradient-to-r hover:!from-cyan-400 hover:!to-teal-600 hover:!text-white hover:!bg-sidebar-accent/0 data-[active=true]:!bg-gradient-to-r data-[active=true]:!from-cyan-400 data-[active=true]:!to-teal-600 data-[active=true]:!text-white data-[active=true]:!bg-sidebar-accent/0";

  const getSettingsClass = () =>
    isSettingsActive || settingsExpanded
      ? "bg-primary text-primary-foreground font-medium"
      : "text-muted-foreground hover:!bg-gradient-to-r hover:!from-cyan-400 hover:!to-teal-600 hover:!text-white hover:!bg-[transparent]";

  // Status message for collapsed tooltip
  const getCreditStatus = () => {
    const credits = user?.credits ?? 0;
    if (credits === 0)
      return {
        color: "text-red-500",
        message: "No credits remaining!",
      };
    if (credits < 30)
      return {
        color: "text-amber-500",
        message: `Only ${Math.floor(credits / 15)} searches left`,
      };
    if (credits < 60)
      return {
        color: "text-yellow-500",
        message: `${Math.floor(credits / 15)} searches available`,
      };
    return {
      color: "text-emerald-500",
      message: `${Math.floor(credits / 15)} searches available`,
    };
  };

  const creditStatus = getCreditStatus();

  return (
    <TooltipProvider>
      <style>{`
        [data-sidebar="menu-button"]:hover {
          background: linear-gradient(to right, rgb(34, 211, 238), rgb(13, 148, 136)) !important;
          color: white !important;
        }
        [data-sidebar="menu-button"][data-active="true"] {
          background: linear-gradient(to right, rgb(34, 211, 238), rgb(13, 148, 136)) !important;
          color: white !important;
        }
        [data-sidebar="menu-button"]:hover * {
          color: white !important;
        }
        [data-sidebar="menu-button"][data-active="true"] * {
          color: white !important;
        }
      `}</style>
      <Sidebar className={state === "collapsed" ? "w-20" : "w-60"} collapsible="icon">
        <SidebarContent className="bg-background border-r">
          {/* Brand */}
          <div className="p-3 border-b border-gray-200">
            {state !== "collapsed" ? (
              <div className="flex items-center justify-center gap-2">
                <Logo size="md" />
              </div>
            ) : (
              <div className="flex items-center justify-center p-1">
                <Logo size="sm" />
              </div>
            )}
          </div>

          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {navigationItems.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton 
                      asChild
                      className="hover:!bg-gradient-to-r hover:!from-cyan-400 hover:!to-teal-600 hover:!text-white hover:!bg-sidebar-accent/0 data-[active=true]:!bg-gradient-to-r data-[active=true]:!from-cyan-400 data-[active=true]:!to-teal-600 data-[active=true]:!text-white data-[active=true]:!bg-sidebar-accent/0"
                    >
                      <NavLink
                        to={item.url}
                        end
                        className={({ isActive }) =>
                          `flex items-center gap-3 px-3 py-2 rounded-md transition-colors ${getNavClass({
                            isActive,
                          })}`
                        }
                      >
                        <item.icon className="h-6 w-6" />
                        {state !== "collapsed" && <span className="text-lg">{item.title}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}

                {/* Settings Dropdown */}
                <SidebarMenuItem>
                  <SidebarMenuButton 
                    asChild
                    className="hover:!bg-gradient-to-r hover:!from-cyan-400 hover:!to-teal-600 hover:!text-white hover:!bg-sidebar-accent/0"
                  >
                    <button
                      onClick={() => setSettingsExpanded(!settingsExpanded)}
                      className={`flex items-center justify-between w-full gap-3 px-3 py-2 rounded-md transition-colors ${getSettingsClass()}`}
                    >
                      <div className="flex items-center gap-3">
                        <Settings className="h-6 w-6" />
                        {state !== "collapsed" && <span className="text-lg">Settings</span>}
                      </div>
                      {state !== "collapsed" &&
                        (settingsExpanded ? (
                          <ChevronDown className="h-6 w-6" />
                        ) : (
                          <ChevronRight className="h-6 w-6" />
                        ))}
                    </button>
                  </SidebarMenuButton>
                </SidebarMenuItem>

                {/* Settings Submenu */}
                {settingsExpanded && state !== "collapsed" && (
                  <div className="ml-6 space-y-1">
                    {settingsItems.map((item) => (
                      <SidebarMenuItem key={item.title}>
                        <SidebarMenuButton 
                          asChild
                          className="hover:!bg-gradient-to-r hover:!from-cyan-400 hover:!to-teal-600 hover:!text-white hover:!bg-sidebar-accent/0 data-[active=true]:!bg-gradient-to-r data-[active=true]:!from-cyan-400 data-[active=true]:!to-teal-600 data-[active=true]:!text-white data-[active=true]:!bg-sidebar-accent/0"
                        >
                          <NavLink
                            to={item.url}
                            end
                            className={({ isActive }) =>
                              `flex items-center gap-3 px-3 py-2 rounded-md transition-colors text-lg ${getNavClass({
                                isActive,
                              })}`
                            }
                          >
                            <span className="text-lg">{item.title}</span>
                          </NavLink>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))}
                  </div>
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter className="border-t border-gray-200 bg-white">
          {/* Credits */}
          <div className="p-4 space-y-3">
            {state !== "collapsed" ? (
              <>
                {/* Credits Display */}
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-semibold text-gray-900">
                    {user?.credits ?? 0}/{user?.maxCredits ?? 120} credits
                  </span>
                </div>

                {/* Progress Bar */}
                <div className="w-full h-2.5 bg-gray-200 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-blue-500 via-purple-500 to-cyan-400 transition-all duration-300 rounded-full"
                    style={{ width: `${Math.min(((user?.credits ?? 0) / (user?.maxCredits ?? 120)) * 100, 100)}%` }}
                  />
                </div>

                {/* Gradient Upgrade Button */}
                <button
                  onClick={() => navigate("/pricing")}
                  className="w-full bg-gradient-to-r from-blue-600 via-cyan-500 to-purple-600 rounded-xl py-3 px-4 mb-4 text-white hover:opacity-90 transition-opacity"
                >
                  <div className="flex items-center justify-center gap-2">
                    <Zap className="w-5 h-5 text-white" />
                    <span className="font-semibold">Upgrade Plan</span>
                  </div>
                </button>
              </>
            ) : (
              // Collapsed view - icon with tooltip
              <div className="mb-4">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => navigate("/pricing")}
                      className="w-full bg-gradient-to-r from-blue-600 via-cyan-500 to-purple-600 rounded-xl p-2 text-white hover:opacity-90 transition-opacity flex items-center justify-center"
                    >
                      <img src={LightningIcon} alt="Upgrade" className="h-10 w-10 object-contain brightness-0 invert" />
                      {user?.credits === 0 && (
                        <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                      )}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    <div className="text-xs">
                      <p className="font-medium">
                        Credits: {user?.credits ?? 0} / {user?.maxCredits ?? 0}
                      </p>
                      {creditStatus.message && <p className="mt-1">{creditStatus.message}</p>}
                      <p className="mt-1 text-muted-foreground">Click to upgrade</p>
                    </div>
                  </TooltipContent>
                </Tooltip>
              </div>
            )}

            {/* User Profile */}
            <div className="flex items-center gap-3 pt-3 border-t border-gray-200">
              <Avatar className="h-10 w-10 flex-shrink-0">
                {user?.picture && (
                  <AvatarImage src={user.picture} alt={user.name} />
                )}
                <AvatarFallback className="bg-blue-500 text-white font-medium">
                  {user?.name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || user?.email?.[0]?.toUpperCase() || "U"}
                </AvatarFallback>
              </Avatar>
              {state !== "collapsed" && (
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate text-gray-900">{user?.name || "User"}</p>
                  <p className="text-xs text-gray-500 truncate">
                    {user?.tier === "pro" ? "Pro Member" : "Free Tier"}
                  </p>
                </div>
              )}
            </div>
          </div>
        </SidebarFooter>
      </Sidebar>
    </TooltipProvider>
  );
}