import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useFirebaseAuth } from "@/contexts/FirebaseAuthContext";

// Module-level cache so every consumer doesn't re-read the user doc (same
// pattern as useGmailConnection). Invalidate after an upload so the next
// mount refetches instead of trusting a stale `false`.
let cachedHasResume: boolean | null = null;
let cachedForUid: string | null = null;

export function invalidateResumeStatusCache() {
  cachedHasResume = null;
  cachedForUid = null;
}

/**
 * Whether the signed-in user has a resume FILE uploaded (resumeUrl on the
 * user doc — same definition the profile page's "Not added" state uses).
 * Deliberately ignores resumeParsed/resumeText: the LinkedIn sync populates
 * those without any file, and auto-apply/cover letters need the real upload.
 * Returns null while loading; fails open (true) on read errors so a
 * Firestore blip never blocks an action behind a resume nudge.
 */
export function useResumeStatus(): { hasResume: boolean | null } {
  const { user } = useFirebaseAuth();
  const uid = user?.uid || null;
  const [hasResume, setHasResume] = useState<boolean | null>(
    uid && cachedForUid === uid ? cachedHasResume : null,
  );

  useEffect(() => {
    if (!uid) return;
    if (cachedForUid === uid && cachedHasResume !== null) {
      setHasResume(cachedHasResume);
      return;
    }
    let cancelled = false;
    getDoc(doc(db, "users", uid))
      .then((snap) => {
        const d = snap.exists() ? snap.data() : {};
        cachedHasResume = Boolean(d?.resumeUrl);
        cachedForUid = uid;
        if (!cancelled) setHasResume(cachedHasResume);
      })
      .catch(() => {
        if (!cancelled) setHasResume(true);
      });
    return () => {
      cancelled = true;
    };
  }, [uid]);

  return { hasResume };
}
