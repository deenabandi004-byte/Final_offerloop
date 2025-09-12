import { useState } from "react";
import { 
  Home, 
  BarChart3, 
  User,
  Zap,
  Newspaper,
  Info,
  Settings,
  CreditCard,
  ChevronRight,
  ChevronDown,
  Users
} from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import { useFirebaseAuth } from '../contexts/FirebaseAuthContext';

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const navigationItems = [
  { title: "Home", url: "/home", icon: Home },
  { title: "Dashboard", url: "/dashboard", icon: BarChart3 },
  { title: "Contact Library", url: "/contact-directory", icon: Users },
  { title: "Loop News", url: "/news", icon: Newspaper },
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
  const currentPath = location.pathname;
  const [settingsExpanded, setSettingsExpanded] = useState(false);
  const { user } = useFirebaseAuth();

  const isActive = (path: string) => currentPath === path;
  const isSettingsActive = settingsItems.some(item => isActive(item.url));
  const getNavClass = ({ isActive }: { isActive: boolean }) =>
    isActive 
      ? "bg-primary text-primary-foreground font-medium" 
      : "hover:bg-muted/50 text-muted-foreground hover:text-foreground";

  const getSettingsClass = () =>
    isSettingsActive || settingsExpanded
      ? "bg-primary text-primary-foreground font-medium" 
      : "hover:bg-muted/50 text-muted-foreground hover:text-foreground";

  return (
    <TooltipProvider>
    <Sidebar className={state === "collapsed" ? "w-14" : "w-60"} collapsible="icon">
      <SidebarContent className="bg-background border-r">
        {/* Brand Text Only - Logo Removed */}
        <div className="p-3 border-b">
          {state !== "collapsed" && (
            <div className="flex items-center justify-center">
              <span className="font-bold text-xl text-foreground">Offerloop.ai</span>
            </div>
          )}
          {state === "collapsed" && (
            <div className="flex items-center justify-center">
              <span className="font-bold text-lg text-foreground">O</span>
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
                        `flex items-center gap-3 px-3 py-2 rounded-md transition-colors ${getNavClass({ isActive })}`
                      }
                    >
                      <item.icon className="h-4 w-4" />
                      {state !== "collapsed" && <span>{item.title}</span>}
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
                      <Settings className="h-4 w-4" />
                      {state !== "collapsed" && <span>Settings</span>}
                    </div>
                    {state !== "collapsed" && (
                      settingsExpanded ? 
                        <ChevronDown className="h-4 w-4" /> : 
                        <ChevronRight className="h-4 w-4" />
                    )}
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
                            `flex items-center gap-3 px-3 py-2 rounded-md transition-colors text-sm ${getNavClass({ isActive })}`
                          }
                        >
                          <span>{item.title}</span>
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
        {/* Upgrade Section */}
        <div className="p-4">
          <div className="bg-background border rounded-lg p-4 mb-4">
            {state !== "collapsed" && (
              <>
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-medium">Credits</p>
                    <p className="text-xs text-muted-foreground">
                      {user ? `${user.credits ?? 0} / ${user.maxCredits ?? 0}` : "— / —"}
                    </p>
                  </div>
                  <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted/30">
                    <div 
                      className="h-full bg-blue-500 transition-all rounded-full" 
                      style={{ 
                        width: user && user.maxCredits ? 
                          `${Math.max(0, Math.min(100, ((user.credits ?? 0) / user.maxCredits) * 100))}%` : 
                          '0%' 
                      }}
                    />
                  </div>
                </div>
                <Button size="sm" className="w-full">
                  <Zap className="w-4 h-4 mr-2" />
                  Upgrade Plan
                </Button>
              </>
            )}
          </div>
          
          {/* User Profile */}
          <div className="flex items-center gap-3">
            <Avatar className="h-8 w-8">
              {user?.picture ? (
                <img src={user.picture} alt={user.name} className="w-full h-full object-cover rounded-full" />
              ) : (
                <AvatarFallback>{user?.name?.charAt(0) || "U"}</AvatarFallback>
              )}
            </Avatar>
            {state !== "collapsed" && (
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{user?.name || "User"}</p>
              </div>
            )}
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
    </TooltipProvider>
  );
}
