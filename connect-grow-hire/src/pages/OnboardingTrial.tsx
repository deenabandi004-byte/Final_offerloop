import { Button } from "@/components/ui/button";
import { Check, Loader2 } from "lucide-react";
import { useTierConfig, resolvePriceId } from "@/hooks/useTierConfig";

// Last-resort fallback SKUs if the catalog has not wired the default student
// monthly stop yet. Real resolution goes through the catalog (mirrors Pricing.tsx),
// so the $14.99 2K fix and any future SKU change apply here automatically.
const LEGACY_PRO_PRICE_ID = "price_1ScLXrERY2WrVHp1bYgdMAu4";
const LEGACY_ELITE_PRICE_ID = "price_1ScLcfERY2WrVHp1c5rcONJ3";

interface OnboardingTrialProps {
  onStartTrial: (tier: "pro" | "elite", priceId: string) => void;
  onContinueFree: () => void;
  submitting: boolean;
}

export const OnboardingTrial = ({ onStartTrial, onContinueFree, submitting }: OnboardingTrialProps) => {
  // Mirror the Pricing default view: monthly cadence, student audience, default
  // credit stop. Prices, credit counts, and Stripe Price IDs all come from the
  // runtime catalog so onboarding never drifts from the pricing page.
  const { config: tierConfig } = useTierConfig();
  const proDefault = tierConfig.slider_stops.pro.find((s) => s.default) ?? tierConfig.slider_stops.pro[0];
  const eliteDefault = tierConfig.slider_stops.elite.find((s) => s.default) ?? tierConfig.slider_stops.elite[0];

  const proPriceId =
    resolvePriceId(tierConfig.stripe_catalog, "pro", "monthly", "student", proDefault.credits) || LEGACY_PRO_PRICE_ID;
  const elitePriceId =
    resolvePriceId(tierConfig.stripe_catalog, "elite", "monthly", "student", eliteDefault.credits) || LEGACY_ELITE_PRICE_ID;

  const TIERS = [
    {
      name: "Pro",
      tierKey: "pro" as const,
      cta: "Start free trial",
      price: `$${proDefault.student}`,
      priceId: proPriceId,
      recommended: true,
      perks: [
        `${proDefault.credits.toLocaleString()} credits / mo`,
        "8 contacts per search",
        "Firm search + smart filters",
        "Bulk drafting & export",
      ],
    },
    {
      name: "Elite",
      tierKey: "elite" as const,
      cta: "Subscribe",
      price: `$${eliteDefault.student}`,
      priceId: elitePriceId,
      recommended: false,
      perks: [
        `${eliteDefault.credits.toLocaleString()} credits / mo`,
        "30 contacts per search",
        "Unlimited coffee chat preps",
        "Priority queue + weekly insights",
      ],
    },
  ];

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-[#0F172A] mb-1.5 text-center" style={{ fontFamily: "'Lora', Georgia, serif" }}>
        Start using Offerloop
      </h1>
      <p className="text-sm text-[#475569] leading-relaxed mb-8 text-center">
        Start a free 14-day Pro trial, no credit card. Elite starts right away.
      </p>

      <div className="grid grid-cols-2 gap-4">
        {TIERS.map((tier) => (
          <div
            key={tier.name}
            className="rounded-2xl border p-5 flex flex-col"
            style={{ borderColor: tier.recommended ? "#1E3A8A" : "#E2E8F0", background: tier.recommended ? "#F8FAFF" : "#FFFFFF" }}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-semibold text-[#0F172A]">{tier.name}</span>
              {tier.recommended && (
                <span className="text-[10px] font-medium uppercase tracking-wide text-[#1E3A8A] bg-[#EFF6FF] px-2 py-0.5 rounded">
                  Recommended
                </span>
              )}
            </div>
            <div className="mb-3">
              <span className="text-2xl font-semibold text-[#0F172A]">{tier.price}</span>
              <span className="text-xs text-[#64748B]">{tier.tierKey === "pro" ? "/mo after trial" : "/mo"}</span>
            </div>
            <ul className="space-y-1.5 mb-5 flex-1">
              {tier.perks.map((p) => (
                <li key={p} className="flex items-start gap-2 text-xs text-[#475569]">
                  <Check className="h-3.5 w-3.5 text-[#1E3A8A] mt-0.5 shrink-0" /> {p}
                </li>
              ))}
            </ul>
            <Button
              type="button"
              className="w-full rounded-lg bg-[#1E3A8A] hover:bg-[#172554] text-white font-bold"
              style={{ fontFamily: "'Lora', Georgia, serif" }}
              disabled={submitting}
              onClick={() => onStartTrial(tier.tierKey, tier.priceId)}
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : tier.cta}
            </Button>
          </div>
        ))}
      </div>

      <div className="mt-4">
        <Button
          type="button"
          onClick={onContinueFree}
          disabled={submitting}
          className="w-full rounded-lg bg-[#1E3A8A] hover:bg-[#172554] text-white font-bold"
          style={{ fontFamily: "'Lora', Georgia, serif" }}
        >
          Continue on the free plan
        </Button>
      </div>
    </div>
  );
};
