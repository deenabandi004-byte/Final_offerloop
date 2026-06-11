import { useEffect, useState } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
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
  // True once the first Firestore snapshot has resolved. Lets consumers tell
  // "loaded, zero notifications" apart from "not loaded yet", which the toast
  // trigger needs so it can seed silently instead of treating the initial
  // 0 -> N load as a brand-new reply.
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!user?.uid) return;
    setLoaded(false);

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
        setLoaded(true);
      },
      (err) => console.warn('Notification listener error:', err)
    );

    return () => unsub();
  }, [user?.uid]);

  const markAllRead = async () => {
    if (!user?.uid) return;
    const ref = doc(db, 'users', user.uid, 'notifications', 'outbox');
    await setDoc(ref, {
      unreadReplyCount: 0,
      items: notifications.items.map((i) => ({ ...i, read: true })),
    }, { merge: true });
  };

  const markOneRead = async (contactId: string) => {
    if (!user?.uid) return;
    const ref = doc(db, 'users', user.uid, 'notifications', 'outbox');
    const updatedItems = notifications.items.map((i) =>
      i.contactId === contactId ? { ...i, read: true } : i
    );
    const newUnread = updatedItems.filter((i) => !i.read).length;
    await setDoc(ref, { unreadReplyCount: newUnread, items: updatedItems }, { merge: true });
  };

  return { notifications, loaded, markAllRead, markOneRead };
}
