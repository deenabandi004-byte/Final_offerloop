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
 * Scout opens via a floating button. The global "new reply" toast now lives in
 * ReplyNotifier (mounted once in App.tsx), so this component no longer needs to
 * run any effect. It is kept as a null-rendering no-op because many pages still
 * import and render it; props are accepted but ignored for backward
 * compatibility.
 */
export function AppHeader(_props: AppHeaderProps) {
  const location = useLocation();
  const { notifications } = useNotifications();
  const { toast } = useToast();
  const prevReplyCountRef = useRef(notifications.unreadReplyCount);
  const hasInitializedRef = useRef(false);

  useEffect(() => {
    if (!hasInitializedRef.current) {
      prevReplyCountRef.current = notifications.unreadReplyCount;
      hasInitializedRef.current = true;
      return;
    }

    // Reply toast. Suppressed on /tracker since the user is already looking
    // at the surface that just updated.
    const prevReply = prevReplyCountRef.current;
    const currReply = notifications.unreadReplyCount;
    prevReplyCountRef.current = currReply;
    if (currReply > prevReply && location.pathname !== '/tracker') {
      const firstUnread =
        notifications.items.find((i) => !i.read) ?? notifications.items[0];
      if (firstUnread) {
        toast({
          title: `${firstUnread.contactName} responded to you!`,
          description: firstUnread.snippet
            ? firstUnread.snippet.slice(0, 80) + (firstUnread.snippet.length > 80 ? '…' : '')
            : undefined,
        });
      }
    }
  }, [
    notifications.unreadReplyCount,
    notifications.items,
    location.pathname,
    toast,
  ]);

  return null;
}
