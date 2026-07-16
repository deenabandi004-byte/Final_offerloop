// ReferralCard
// The shared, persistent "Refer & Earn" surface: the user's unique, trackable
// referral link with Copy + Share actions and live progress toward the free
// month of Elite. Single source of truth — used by the /refer page (and any
// other full-card surface). Self-fetches via apiService; renders nothing until
// loaded. No modal and no dismiss control (it's page content, not a banner).

import { useEffect, useState } from "react";
import { Gift, Copy, Share2, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { apiService } from "@/services/api";
import { toast } from "@/hooks/use-toast";

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

export function ReferralCard({ className }: { className?: string }) {
  const [status, setStatus] = useState<ReferralStatus | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    apiService.getReferralStatus().then(setStatus).catch(() => {
      // On error, render nothing — never break the host page.
    });
  }, []);

  if (!status) return null;

  const { referralLink, signupCount, signupTarget, rewardClaimed } = status;

  const copyLink = () => {
    try { navigator.clipboard?.writeText(referralLink); } catch {}
    setCopied(true);
    toast({ title: "Link copied!", description: "Send it to friends to earn a free month of Elite." });
    setTimeout(() => setCopied(false), 2000);
  };

  const shareLink = async () => {
    const nav = navigator as Navigator & { share?: (data: ShareData) => Promise<void> };
    if (nav.share) {
      try {
        await nav.share({
          title: "Join me on Offerloop",
          text: "I'm using Offerloop to network into top internships & jobs — sign up with my link:",
          url: referralLink,
        });
        return;
      } catch {
        // user cancelled the share sheet — fall through to copy
      }
    }
    copyLink();
  };

  const pct = Math.min(100, Math.round((signupCount / signupTarget) * 100));
  const reached = signupCount >= signupTarget;

  return (
    <div
      className={cn(
        "w-full rounded-st-xl border border-line bg-white p-6 shadow-sm sm:p-7",
        className,
      )}
    >
      <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
        {/* Left: pitch + progress */}
        <div className="min-w-0 flex-1">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-[var(--accent)]/10 px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">
            <Gift className="h-3 w-3" /> Refer &amp; Earn
          </div>

          <h3 className="mt-3 font-serif text-[22px] leading-[1.2] text-[#0F172A]">
            Give friends Offerloop,{" "}
            <em className="italic text-[var(--accent)]">get a free month of Elite</em>
          </h3>

          <p className="mt-1.5 text-[13.5px] leading-relaxed text-[#64748B]">
            {reached
              ? `You've referred ${signupCount} friends — you've hit the goal.`
              : `When ${signupTarget} friends sign up with your link, you unlock a month of Elite — free.`}
          </p>

          <div className="mt-4 max-w-xs">
            <div className="flex justify-between text-[11px] font-medium uppercase tracking-wider text-[#94A3B8]">
              <span>Signups</span>
              <span className="text-[#0F172A]">{signupCount}/{signupTarget}</span>
            </div>
            <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-[#E2E8F0]">
              <div
                className="h-full rounded-full transition-[width] duration-500"
                style={{ width: `${pct}%`, background: "var(--accent)" }}
              />
            </div>
          </div>

          {rewardClaimed && (
            <p className="mt-2.5 text-[11.5px] text-[#64748B]">
              <Check className="mr-0.5 inline h-3 w-3 text-[var(--accent)]" />
              Reward claimed — thanks for spreading the word.
            </p>
          )}
        </div>

        {/* Right: the trackable link + actions */}
        <div className="w-full md:w-[320px] md:flex-shrink-0">
          <div className="flex items-center gap-1.5 rounded-lg border border-line bg-[#F8FAFC] p-1.5">
            <input
              readOnly
              value={referralLink}
              onFocus={(e) => e.currentTarget.select()}
              className="min-w-0 flex-1 bg-transparent px-2 text-[12.5px] text-[#0F172A] outline-none"
            />
            <button
              onClick={copyLink}
              className="flex shrink-0 items-center gap-1 rounded-md bg-[var(--accent)] px-2.5 py-1.5 text-[12.5px] font-semibold text-white transition-opacity hover:opacity-90"
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <button
            onClick={shareLink}
            className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-md border border-line bg-white py-2 text-[12.5px] font-semibold text-[#0F172A] transition-colors hover:border-[var(--accent)]/40 hover:text-[var(--accent)]"
          >
            <Share2 className="h-3.5 w-3.5" /> Share link
          </button>
        </div>
      </div>
    </div>
  );
}
