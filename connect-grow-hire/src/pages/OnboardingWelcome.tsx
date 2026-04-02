import { Button } from "@/components/ui/button";

interface OnboardingWelcomeProps {
  onNext: () => void;
  userName?: string;
}

export const OnboardingWelcome = ({ onNext }: OnboardingWelcomeProps) => {
  return (
    <div>
      <p
        style={{
          fontSize: 11,
          fontWeight: 500,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "#94A3B8",
          marginBottom: 8,
        }}
      >
        Step 1 of 4
      </p>
      <h1
        className="text-2xl font-semibold tracking-tight text-[#0F172A] mb-1.5"
        style={{ fontFamily: "'Lora', Georgia, serif" }}
      >
        Welcome to Offerloop
      </h1>
      <p className="text-sm text-[#475569] leading-relaxed mb-8">
        Let's get you set up in a few quick steps so we can personalize
        everything — your job board, your contacts, your outreach.
      </p>

      <div className="mt-8 space-y-3">
        <Button variant="default" size="lg" className="w-full" onClick={onNext}>
          Get started →
        </Button>
        <p className="text-xs text-center text-[#94A3B8]">Takes about 90 seconds</p>
      </div>
    </div>
  );
};
