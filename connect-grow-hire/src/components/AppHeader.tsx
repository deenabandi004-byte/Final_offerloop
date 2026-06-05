import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useNotifications } from '@/hooks/useNotifications';
import { useToast } from '@/hooks/use-toast';

interface AppHeaderProps {
  title?: string;
  titleIcon?: React.ReactNode;
  centerContent?: React.ReactNode;
  rightContent?: React.ReactNode;
  onJobTitleSuggestion?: (title: string, company?: string, location?: string) => void;
}

/**
 * AppHeader — visually removed. The 3 header icons moved to the sidebar and
 * Scout opens via a floating button. This component still mounts on every page
 * to keep the global "new reply" toast behavior running. Props are accepted but
 * ignored for backward compatibility.
 */
export function AppHeader(_props: AppHeaderProps) {
  const location = useLocation();
  const { notifications } = useNotifications();
  const { toast } = useToast();
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
    if (curr > prev && location.pathname !== '/tracker') {
      const firstUnread = notifications.items.find((i) => !i.read) ?? notifications.items[0];
      if (firstUnread) {
        toast({
          title: `${firstUnread.contactName} responded to you!`,
          description: firstUnread.snippet
            ? firstUnread.snippet.slice(0, 80) + (firstUnread.snippet.length > 80 ? '…' : '')
            : undefined,
        });
      }
    }
  }, [notifications.unreadReplyCount, notifications.items, location.pathname, toast]);

  return null;
}
