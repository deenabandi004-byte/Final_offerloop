import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useFirebaseAuth } from "@/contexts/FirebaseAuthContext";
import { UpgradeModal } from "@/components/gates/UpgradeModal";
import { apiService, type PendingShare } from "@/services/api";

const kindNoun = (k: PendingShare["kind"], n: number) => {
  const nouns: Record<PendingShare["kind"], [string, string]> = {
    contacts: ["contact", "contacts"],
    companies: ["company", "companies"],
    hiringManagers: ["hiring manager", "hiring managers"],
  };
  const [singular, plural] = nouns[k] ?? nouns.contacts;
  return n === 1 ? singular : plural;
};

/**
 * On login/refresh, checks for pending contact shares addressed to the user and
 * presents them one at a time. Pro/Elite can accept (imports the records, which
 * render green in My Network); free users are pushed to the Pro free-trial modal
 * and the share stays pending until they upgrade.
 */
export default function PendingShareModal() {
  const { user, isLoading } = useFirebaseAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [queue, setQueue] = useState<PendingShare[]>([]);
  const [busy, setBusy] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [imported, setImported] = useState<{ count: number } | null>(null);

  const isPro = user?.tier === "pro" || user?.tier === "elite";

  useEffect(() => {
    if (isLoading || !user || user.needsOnboarding) return;
    let cancelled = false;
    apiService
      .getPendingShares()
      .then((res) => {
        if (cancelled || !("shares" in res) || !res.shares.length) return;
        setQueue(res.shares);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isLoading, user?.uid, user?.needsOnboarding]);

  const current = queue[0];
  const dismissCurrent = () => setQueue((q) => q.slice(1));

  const onAccept = async () => {
    if (!current) return;
    if (!isPro) {
      // Keep the share pending; push the Pro free-trial upsell.
      setShowUpgrade(true);
      return;
    }
    setBusy(true);
    try {
      const res = await apiService.acceptShare(current.id);
      if ("error" in res) {
        if (res.current_tier === "free") {
          setShowUpgrade(true);
          return;
        }
        toast({ title: res.error, variant: "destructive" });
        return;
      }
      setImported({ count: res.imported ?? current.count });
      dismissCurrent();
    } catch (e: any) {
      console.error("[shares] accept failed", e);
      toast({
        title: e?.needsAuth
          ? "Your session expired — please sign in again."
          : "Couldn't accept the share. Please try again.",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  const onDecline = async () => {
    if (!current) return;
    setBusy(true);
    try {
      await apiService.declineShare(current.id);
      dismissCurrent();
    } catch (e: any) {
      console.error("[shares] decline failed", e);
      toast({ title: "Couldn't decline the share. Please try again.", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <AlertDialog open={!!current && !showUpgrade}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {current?.fromName} shared {current?.count}{" "}
              {current && kindNoun(current.kind, current.count)} with you
            </AlertDialogTitle>
            <AlertDialogDescription>
              Accept to add them to your network.{" "}
              {isPro ? "" : "Receiving shared contacts is a Pro feature."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy} onClick={onDecline}>
              Decline
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                onAccept();
              }}
            >
              {busy ? "…" : "Accept"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <UpgradeModal
        open={showUpgrade}
        onOpenChange={setShowUpgrade}
        feature="bulk_drafting"
        reason="Receiving shared contacts is a Pro feature. Start a free trial to accept them."
        currentTier={user?.tier || "free"}
      />

      <AlertDialog open={!!imported} onOpenChange={() => setImported(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{imported?.count} added to your network</AlertDialogTitle>
            <AlertDialogDescription>
              Draft emails to them, or open them in your inbox.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setImported(null);
                navigate("/my-network/people");
              }}
            >
              View in network
            </Button>
            <Button
              onClick={() => {
                setImported(null);
                navigate("/outbox");
              }}
            >
              View in inbox
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
