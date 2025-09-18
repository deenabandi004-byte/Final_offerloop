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
  Users,
  AlertCircle
} from "lucide-react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
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
  const navigate = useNavigate();
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

  // Calculate credit percentage and determine status
  const creditPercentage = user && user.maxCredits ? 
    Math.max(0, Math.min(100, ((user.credits ?? 0) / user.maxCredits) * 100)) : 0;
  
  const getCreditStatus = () => {
    if (!user) return { color: 'bg-gray-500', message: '' };
    const credits = user.credits ?? 0;
    
    if (credits === 0) {
      return { 
        color: 'bg-red-500', 
        message: 'No credits remaining!',
        showWarning: true 
      };
    } else if (credits < 30) {
      return { 
        color: 'bg-orange-500', 
        message: `Only ${Math.floor(credits / 15)} searches left`,
        showWarning: true 
      };
    } else if (credits < 60) {
      return { 
        color: 'bg-yellow-500', 
        message: `${Math.floor(credits / 15)} searches available` 
      };
    }
    return { 
      color: 'bg-blue-500', 
      message: `${Math.floor(credits / 15)} searches available` 
    };
  };

  const creditStatus = getCreditStatus();

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
          {/* Credit Section with Enhanced Display */}
          <div className="p-4">
            <div className="bg-background border rounded-lg p-4 mb-4">
              {state !== "collapsed" ? (
                <>
                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium">Credits</p>
                        {creditStatus.showWarning && (
                          <Tooltip>
                            <TooltipTrigger>
                              <AlertCircle className="h-3 w-3 text-orange-500" />
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="text-xs">{creditStatus.message}</p>
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {user ? `${user.credits ?? 0} / ${user.maxCredits ?? 0}` : "— / —"}
                      </p>
                    </div>
                    
                    {/* Progress Bar */}
                    <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted/30">
                      <div 
                        className={`h-full transition-all duration-300 rounded-full ${creditStatus.color}`}
                        style={{ width: `${creditPercentage}%` }}
                      />
                    </div>
                    
                    {/* Credit Status Message */}
                    {creditStatus.message && (
                      <p className={`text-xs mt-1 ${
                        creditStatus.showWarning ? 'text-orange-500 font-medium' : 'text-muted-foreground'
                      }`}>
                        {creditStatus.message}
                      </p>
                    )}
                  </div>
                  
                  <Button 
                    size="sm" 
                    className={`w-full ${
                      user?.credits === 0 
                        ? 'bg-red-500 hover:bg-red-600 animate-pulse' 
                        : ''
                    }`}
                    onClick={() => navigate('/pricing')}
                  >
                    <Zap className="w-4 h-4 mr-2" />
                    {user?.credits === 0 ? 'Upgrade Now' : 'Upgrade Plan'}
                  </Button>
                </>
              ) : (
                // Collapsed view - show icon with tooltip
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button 
                      size="sm" 
                      variant="ghost" 
                      className="w-full p-2"
                      onClick={() => navigate('/pricing')}
                    >
                      <div className="relative">
                        <Zap className={`w-4 h-4 ${
                          user?.credits === 0 ? 'text-red-500' : 
                          user?.credits && user.credits < 30 ? 'text-orange-500' : 
                          'text-blue-500'
                        }`} />
                        {user?.credits === 0 && (
                          <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                        )}
                      </div>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    <div className="text-xs">
                      <p className="font-medium">Credits: {user?.credits ?? 0} / {user?.maxCredits ?? 0}</p>
                      {creditStatus.message && (
                        <p className="mt-1">{creditStatus.message}</p>
                      )}
                      <p className="mt-1 text-muted-foreground">Click to upgrade</p>
                    </div>
                  </TooltipContent>
                </Tooltip>
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
                  <p className="text-xs text-muted-foreground truncate">
                    {user?.tier === 'pro' ? 'Pro Member' : 'Free Tier'}
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