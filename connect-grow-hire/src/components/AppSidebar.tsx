import { useState } from "react";
import {
  Home,
  BarChart3,
  User,
  Zap,
  Info,
  Settings,
  CreditCard,
  ChevronRight,
  ChevronDown,
  Users,
  Coffee,
} from "lucide-react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import OfferloopLogo from "../assets/Offerloop-topleft.jpeg";
import OfferloopIcon from "../assets/icon.png";
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
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const navigationItems = [
  { title: "Home", url: "/home", icon: Home },
  { title: "Dashboard", url: "/dashboard", icon: BarChart3 },
  { title: "Contact Library", url: "/contact-directory", icon: Users },
  { title: "Coffee Chat Library", url: "/coffee-chat-library", icon: Coffee },
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
      ? "bg-gradient-to-r from-blue-600/20 via-purple-600/20 to-purple-700/20 text-white font-medium"
      : "hover:bg-gradient-to-r hover:from-blue-600/10 hover:via-purple-600/10 hover:to-purple-700/10 text-muted-foreground hover:text-foreground";

  const getSettingsClass = () =>
    isSettingsActive || settingsExpanded
      ? "bg-primary text-primary-foreground font-medium"
      : "hover:bg-gradient-to-r hover:from-blue-600/10 hover:via-purple-600/10 hover:to-purple-700/10 text-muted-foreground hover:text-foreground";

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
      <Sidebar className={state === "collapsed" ? "w-20" : "w-60"} collapsible="icon">
        <SidebarContent className="bg-background border-r">
          {/* Brand */}
          <div className="p-3 border-b">
            {state !== "collapsed" ? (
              <div className="flex items-center justify-center gap-2">
                <img src={OfferloopLogo} alt="Offerloop" className="h-8" />
              </div>
            ) : (
              <div className="flex items-center justify-center p-1">
                <img src={OfferloopIcon} alt="Offerloop" className="h-14 w-14 object-contain" />
              </div>
            )}
          </div>

          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {navigationItems.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild>
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
                  <SidebarMenuButton asChild>
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
                        <SidebarMenuButton asChild>
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

        <SidebarFooter className="border-t bg-background">
          {/* Credits */}
          <div className="p-4">
            {state !== "collapsed" ? (
              <>
                {/* Credits Display */}
                <div className="text-lg font-medium mb-2 text-white">
                  {user?.credits ?? 0}/{user?.maxCredits ?? 120} credits
                </div>

                {/* Progress Bar */}
                <div className="mb-4 w-full h-2 bg-transparent border border-white rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-blue-600 via-purple-600 to-purple-700 transition-all duration-300"
                    style={{ width: `${((user?.credits ?? 0) / (user?.maxCredits ?? 120)) * 100}%` }}
                  />
                </div>

                {/* Gradient Upgrade Button */}
                <button
                  onClick={() => navigate("/pricing")}
                  className="w-full bg-gradient-to-r from-blue-600 via-purple-600 to-purple-700 rounded-xl py-3 px-4 mb-4 text-white hover:opacity-90 transition-opacity"
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
                      className="w-full bg-gradient-to-r from-blue-600 via-purple-600 to-purple-700 rounded-xl p-2 text-white hover:opacity-90 transition-opacity flex items-center justify-center"
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
            <div className="flex items-center justify-center">
              <Avatar className="h-10 w-10">
                {user?.picture ? (
                  <img
                    src={user.picture}
                    alt={user.name}
                    className="w-full h-full object-cover rounded-full"
                  />
                ) : (
                  <AvatarFallback>{user?.name?.charAt(0) || "U"}</AvatarFallback>
                )}
              </Avatar>
              {state !== "collapsed" && (
                <div className="flex-1 min-w-0">
                  <p className="text-lg font-medium truncate">{user?.name || "User"}</p>
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