// ReferralAnnouncement
// Self-contained component that shows a one-time launch modal followed by a
// dismissible banner for the referral program. No props required.
//
// Priority order:
//   1. rewardClaimed → render nothing
//   2. !launchModalSeen → launch modal (Dialog, open)
//   3. !bannerDismissed → dashboard banner (Card)
//   4. else → nothing

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Gift, X, ArrowRight } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { apiService } from "@/services/api";

type ReferralStatus = {
  referralCode: string;
  referralLink: string;
  signupCount: number;
  signupTarget: number;
  eligible: boolean;
  rewardClaimed: boolean;
  rewardClaimedAt: string | null;
  bannerDismissed: boolean;
  launchModalSeen: boolean;
};

export function ReferralAnnouncement() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<ReferralStatus | null>(null);
  // Local dismiss flags so the UI hides instantly without a round-trip
  const [modalDismissed, setModalDismissed] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  useEffect(() => {
    apiService.getReferralStatus().then(setStatus).catch(() => {
      // On error, render nothing — don't break the dashboard
    });
  }, []);

  // Nothing to show while loading or on error
  if (!status) return null;

  // Already claimed — nothing to prompt
  if (status.rewardClaimed) return null;

  // ── Launch modal ─────────────────────────────────────────────────────────
  const showModal = !status.launchModalSeen && !modalDismissed;

  function dismissModal() {
    setModalDismissed(true);
    // Fire-and-forget — don't block the UI
    apiService.ackReferral("launch_modal").catch(() => {});
  }

  function handleModalCTA() {
    dismissModal();
    navigate("/account-settings#referrals");
  }

  if (showModal) {
    return (
      <Dialog open onOpenChange={(open) => { if (!open) dismissModal(); }}>
        <DialogContent className="max-w-md rounded-2xl p-8">
          <DialogHeader className="space-y-3 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[var(--accent)]/10">
              <Gift className="h-6 w-6 text-[var(--accent)]" />
            </div>
            <DialogTitle className="font-serif text-[22px] font-semibold text-[#0F172A]">
              Earn a free month of Elite
            </DialogTitle>
            <DialogDescription className="text-[14px] text-[#475569]">
              Refer 5 friends who sign up for Offerloop and we'll give you one
              month of Elite — free. No strings attached.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-6 flex flex-col gap-3">
            <Button
              onClick={handleModalCTA}
              className="w-full gap-2 bg-[var(--accent)] text-white hover:bg-[var(--primary-600)]"
            >
              Start referring <ArrowRight className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              onClick={dismissModal}
              className="w-full text-[#475569] hover:text-[#0F172A]"
            >
              Maybe later
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // ── Dashboard banner ──────────────────────────────────────────────────────
  const showBanner = !status.bannerDismissed && !bannerDismissed;

  function dismissBanner() {
    setBannerDismissed(true);
    apiService.ackReferral("banner").catch(() => {});
  }

  if (showBanner) {
    return (
      <Card
        className={cn(
          "w-full rounded-st-xl border border-line bg-white shadow-sm",
        )}
      >
        <CardContent className="flex items-center gap-4 px-5 py-4">
          {/* Icon */}
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--accent)]/10">
            <Gift className="h-[18px] w-[18px] text-[var(--accent)]" />
          </div>

          {/* Text */}
          <div className="min-w-0 flex-1">
            <p className="font-serif text-[15px] font-semibold text-[#0F172A]">
              Get a free month of Elite
            </p>
            <p className="mt-0.5 text-[13px] text-[#475569]">
              Refer 5 friends who sign up — you're at{" "}
              <span className="font-medium text-[#0F172A]">
                {status.signupCount}/{status.signupTarget}
              </span>
              .
            </p>
          </div>

          {/* CTA */}
          <Button
            size="sm"
            onClick={() => navigate("/account-settings#referrals")}
            className="shrink-0 gap-1.5 bg-[var(--accent)] text-white hover:bg-[var(--primary-600)]"
          >
            Refer friends <ArrowRight className="h-3.5 w-3.5" />
          </Button>

          {/* Dismiss */}
          <button
            onClick={dismissBanner}
            aria-label="Dismiss referral banner"
            className="ml-1 shrink-0 rounded p-1 text-[#94A3B8] transition-colors hover:bg-[#F1F5F9] hover:text-[#475569]"
          >
            <X className="h-4 w-4" />
          </button>
        </CardContent>
      </Card>
    );
  }

  return null;
}
