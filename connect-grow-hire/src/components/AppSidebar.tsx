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
import LightningIcon from "../assets/Lightning.png";
import BlueLogo from "../assets/Blue_logo.png";
import BlueIcon from "../assets/blue_icon.png";
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
  { title: "Firm Search", url: "/firm-search", icon: Building2 },
  { title: "Coffee Chat Prep", url: "/coffee-chat-prep", icon: Coffee },
  { title: "Interview Prep", url: "/interview-prep", icon: Briefcase },
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
      ? "!text-white !font-medium !bg-sidebar-accent/0 data-[active=true]:!text-white data-[active=true]:!bg-sidebar-accent/0"
      : "text-muted-foreground hover:!text-white hover:!bg-sidebar-accent/0 data-[active=true]:!text-white data-[active=true]:!bg-sidebar-accent/0";

  const getSettingsClass = () =>
    isSettingsActive || settingsExpanded
      ? "bg-primary text-primary-foreground font-medium"
      : "text-muted-foreground hover:!text-white hover:!bg-[transparent]";

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
      color: "text-blue-500",
      message: `${Math.floor(credits / 15)} searches available`,
    };
  };

  const creditStatus = getCreditStatus();

  return (
    <TooltipProvider>
      <style>{`
        [data-sidebar="menu-button"]:hover {
          background: linear-gradient(135deg, #3B82F6, #60A5FA) !important;
          color: white !important;
        }
        [data-sidebar="menu-button"][data-active="true"] {
          background: linear-gradient(135deg, #3B82F6, #60A5FA) !important;
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
        <SidebarContent className="bg-transparent border-r overflow-x-hidden">
          {/* Brand */}
          <div className="p-3 border-b border-border bg-transparent">
            {state !== "collapsed" ? (
              <div className="flex items-center justify-center gap-2">
                <img 
                  src={BlueLogo} 
                  alt="Offerloop" 
                  className="h-12 cursor-pointer"
                  onClick={() => navigate("/")}
                />
              </div>
            ) : (
              <div className="flex items-center justify-center p-1">
                <img 
                  src={BlueIcon} 
                  alt="Offerloop" 
                  className="h-8 w-auto cursor-pointer object-contain"
                  onClick={() => navigate("/")}
                />
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
                      className="hover:!text-white hover:!bg-sidebar-accent/0 data-[active=true]:!text-white data-[active=true]:!bg-sidebar-accent/0"
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
                    className="hover:!text-white hover:!bg-sidebar-accent/0"
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
                          className="hover:!text-white hover:!bg-sidebar-accent/0 data-[active=true]:!text-white data-[active=true]:!bg-sidebar-accent/0"
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

        <SidebarFooter className="border-t border-border bg-transparent">
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
                <div className="w-full h-2.5 bg-muted rounded-full overflow-hidden">
                  <div 
                    className="h-full transition-all duration-300 rounded-full"
                    style={{ 
                      width: `${Math.min(((user?.credits ?? 0) / (user?.maxCredits ?? 120)) * 100, 100)}%`,
                      background: 'linear-gradient(135deg, #3B82F6, #60A5FA)'
                    }}
                  />
                </div>

                {/* Gradient Upgrade Button */}
                <button
                  onClick={() => navigate("/pricing")}
                  className="w-full rounded-xl py-3 px-4 mb-4 text-white transition-all shadow-sm hover:opacity-90"
                  style={{ background: 'linear-gradient(135deg, #3B82F6, #60A5FA)' }}
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
                      className="w-full rounded-xl p-2 text-white transition-all shadow-sm hover:opacity-90 flex items-center justify-center"
                      style={{ background: 'linear-gradient(135deg, #3B82F6, #60A5FA)' }}
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
            <div className="flex items-center gap-3 pt-3 border-t border-border">
              <Avatar className="h-10 w-10 flex-shrink-0">
                {user?.picture && (
                  <AvatarImage src={user.picture} alt={user.name} />
                )}
                <AvatarFallback className="bg-primary text-primary-foreground font-medium">
                  {user?.name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || user?.email?.[0]?.toUpperCase() || "U"}
                </AvatarFallback>
              </Avatar>
              {state !== "collapsed" && (
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate text-foreground">{user?.name || "User"}</p>
                  <p className="text-xs text-muted-foreground truncate">
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