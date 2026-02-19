import { useEffect, useRef, useState } from 'react';
import { Bell, BookOpen, Calendar, Settings } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Button } from '@/components/ui/button';
import { MobileMenuButton } from '@/components/ui/sidebar';
import ScoutHeaderButton from './ScoutHeaderButton';
import { useTour } from '@/contexts/TourContext';
import { useNavigate, useLocation } from 'react-router-dom';
import { useNotifications } from '@/hooks/useNotifications';
import { useToast } from '@/hooks/use-toast';
import type { NotificationItem } from '@/hooks/useNotifications';

interface AppHeaderProps {
  title?: string;
  /** Optional icon to display next to the title */
  titleIcon?: React.ReactNode;
  /** Optional content to display in the center of the header */
  centerContent?: React.ReactNode;
  /** Optional content to display in the right section (before Scout button) */
  rightContent?: React.ReactNode;
  /** Callback when job title suggestion is received from Scout */
  onJobTitleSuggestion?: (title: string, company?: string, location?: string) => void;
}

function formatNotificationTime(timestamp: string): string {
  try {
    const d = new Date(timestamp);
    if (Number.isNaN(d.getTime())) return '';
    return formatDistanceToNow(d, { addSuffix: true });
  } catch {
    return '';
  }
}

/**
 * AppHeader - Standardized header component for all app pages
 *
 * Layout:
 * - Left: Mobile menu button, notification icons, page title
 * - Center: Optional custom content (e.g., stats for Dashboard)
 * - Right: Scout button
 */
export function AppHeader({
  title,
  titleIcon,
  centerContent,
  rightContent,
  onJobTitleSuggestion,
}: AppHeaderProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { startTour } = useTour();
  const { notifications, markAllRead, markOneRead } = useNotifications();
  const { toast } = useToast();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const prevUnreadCountRef = useRef(notifications.unreadReplyCount);
  const hasInitializedRef = useRef(false);

  useEffect(() => {
    if (!hasInitializedRef.current) {
      prevUnreadCountRef.current = notifications.unreadReplyCount;
      hasInitializedRef.current = true;
      return;
    }
    const prev = prevUnreadCountRef.current;
    const curr = notifications.unreadReplyCount;
    prevUnreadCountRef.current = curr;
    if (curr > prev && location.pathname !== '/outbox') {
      const firstUnread = notifications.items.find((i) => !i.read) ?? notifications.items[0];
      if (firstUnread) {
        toast({
          title: `${firstUnread.contactName} replied to your email`,
          description: firstUnread.snippet ? firstUnread.snippet.slice(0, 80) + (firstUnread.snippet.length > 80 ? '…' : '') : undefined,
        });
      }
    }
  }, [notifications.unreadReplyCount, notifications.items, location.pathname, toast]);

  useEffect(() => {
    if (!dropdownOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [dropdownOpen]);

  const handleBellClick = () => {
    setDropdownOpen((o) => !o);
  };

  const handleNotificationClick = (item: NotificationItem) => {
    markOneRead(item.contactId);
    setDropdownOpen(false);
    navigate('/outbox');
  };

  const handleCalendarClick = () => {
    navigate('/home?tab=calendar');
  };

  const handleSettingsClick = () => {
    navigate('/account-settings');
  };

  return (
    <header className="h-16 flex items-center justify-between px-4 lg:px-6 bg-white flex-shrink-0 relative z-20">
      {/* Left Section: Mobile menu, icons, title */}
      <div className="flex items-center gap-2 lg:gap-3">
        <MobileMenuButton />

        {/* Header Icons: Tour, Outbox, Calendar, Settings */}
        <div className="hidden sm:flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={startTour}
            className="h-8 w-8 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
            aria-label="View tour"
          >
            <BookOpen className="h-5 w-5" />
          </Button>
          <div className="relative" ref={dropdownRef}>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleBellClick}
              className="h-8 w-8 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
              aria-label="Notifications"
            >
              <div className="relative">
                <Bell className="h-5 w-5" />
                {notifications.unreadReplyCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-medium rounded-full flex items-center justify-center">
                    {notifications.unreadReplyCount > 9 ? '9+' : notifications.unreadReplyCount}
                  </span>
                )}
              </div>
            </Button>
            {dropdownOpen && (
              <div className="absolute left-0 top-full mt-1 w-[320px] max-w-[calc(100vw-2rem)] bg-white rounded-xl shadow-lg border border-gray-100 max-h-80 overflow-hidden flex flex-col z-50">
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                  <span className="text-sm font-semibold text-foreground">Notifications</span>
                  {notifications.unreadReplyCount > 0 && (
                    <button
                      type="button"
                      onClick={() => markAllRead()}
                      className="text-xs text-blue-600 hover:underline"
                    >
                      Mark all read
                    </button>
                  )}
                </div>
                <div className="overflow-y-auto flex-1">
                  {notifications.items.length === 0 ? (
                    <p className="px-4 py-6 text-sm text-muted-foreground">No notifications yet</p>
                  ) : (
                    <ul className="divide-y divide-gray-50">
                      {notifications.items.map((item) => (
                        <li key={`${item.contactId}-${item.timestamp}`}>
                          <button
                            type="button"
                            onClick={() => handleNotificationClick(item)}
                            className={`w-full text-left px-4 py-3 transition-colors hover:bg-gray-50 ${
                              !item.read ? 'bg-blue-50/50' : ''
                            }`}
                          >
                            <p className="text-sm font-medium text-foreground">
                              {item.contactName}
                              {item.company ? ` at ${item.company}` : ''} replied
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {formatNotificationTime(item.timestamp)}
                            </p>
                            {item.snippet && (
                              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                {item.snippet}
                              </p>
                            )}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleCalendarClick}
            className="h-8 w-8 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
            aria-label="View calendar"
          >
            <Calendar className="h-5 w-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleSettingsClick}
            className="h-8 w-8 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
            aria-label="Account settings"
          >
            <Settings className="h-5 w-5" />
          </Button>
        </div>

        {/* Page Title */}
        <div className="flex items-center gap-2">
          {titleIcon && <span className="text-gray-600">{titleIcon}</span>}
          <h1 className="text-lg lg:text-xl font-semibold text-gray-900 truncate max-w-[150px] sm:max-w-none">
            {title}
          </h1>
        </div>
      </div>

      {/* Center Section: Optional custom content */}
      {centerContent && (
        <div className="absolute left-1/2 -translate-x-1/2 hidden md:flex items-center">
          {centerContent}
        </div>
      )}

      {/* Right Section: optional rightContent + Scout */}
      <div className="flex items-center gap-2 lg:gap-3">
        {rightContent}
        <ScoutHeaderButton />
      </div>
    </header>
  );
}
