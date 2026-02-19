import { useEffect, useState } from 'react';
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useFirebaseAuth } from '@/contexts/FirebaseAuthContext';

export interface NotificationItem {
  contactId: string;
  contactName: string;
  company: string;
  snippet: string;
  timestamp: string;
  read: boolean;
}

export interface OutboxNotifications {
  unreadReplyCount: number;
  items: NotificationItem[];
}

export function useNotifications() {
  const { user } = useFirebaseAuth();
  const [notifications, setNotifications] = useState<OutboxNotifications>({
    unreadReplyCount: 0,
    items: [],
  });

  useEffect(() => {
    if (!user?.uid) return;

    const unsub = onSnapshot(
      doc(db, 'users', user.uid, 'notifications', 'outbox'),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          setNotifications({
            unreadReplyCount: data?.unreadReplyCount ?? 0,
            items: Array.isArray(data?.items) ? data.items : [],
          });
        }
      },
      (err) => console.warn('Notification listener error:', err)
    );

    return () => unsub();
  }, [user?.uid]);

  const markAllRead = async () => {
    if (!user?.uid) return;
    const ref = doc(db, 'users', user.uid, 'notifications', 'outbox');
    await updateDoc(ref, {
      unreadReplyCount: 0,
      items: notifications.items.map((i) => ({ ...i, read: true })),
    });
  };

  const markOneRead = async (contactId: string) => {
    if (!user?.uid) return;
    const ref = doc(db, 'users', user.uid, 'notifications', 'outbox');
    const updatedItems = notifications.items.map((i) =>
      i.contactId === contactId ? { ...i, read: true } : i
    );
    const newUnread = updatedItems.filter((i) => !i.read).length;
    await updateDoc(ref, { unreadReplyCount: newUnread, items: updatedItems });
  };

  return { notifications, markAllRead, markOneRead };
}
