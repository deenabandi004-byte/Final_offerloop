import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  DreamCompanyAutocomplete,
  type DreamCompanyAutocompleteHandle,
} from "@/components/DreamCompanyAutocomplete";

const CAREER_TRACKS = [
  "Investment Banking",
  "Management Consulting",
  "Private Equity / VC",
  "Product Management",
  "Software Engineering",
  "Sales & Trading",
  "Corporate Finance / FP&A",
  "Other",
];

interface GoalsData {
  careerTrack: string;
  dreamCompanies: string[];
}

interface OnboardingGoalsProps {
  onNext: (data: GoalsData) => void;
  onSkip: () => void;
  initialData?: Partial<GoalsData>;
}

export const OnboardingGoals = ({
  onNext,
  onSkip,
  initialData,
}: OnboardingGoalsProps) => {
  const [careerTrack, setCareerTrack] = useState(initialData?.careerTrack || "");
  const [dreamCompanies, setDreamCompanies] = useState<string[]>(
    initialData?.dreamCompanies || [],
  );
  const autocompleteRef = useRef<DreamCompanyAutocompleteHandle>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Flush any in-progress text the user typed but didn't commit via
    // Enter/comma — preserves the original safety-net behavior.
    const final = autocompleteRef.current?.flushPending() ?? dreamCompanies;
    onNext({ careerTrack, dreamCompanies: final });
  };

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
        Step 3 of 4
      </p>
      <h1
        className="text-2xl font-semibold tracking-tight text-[#0F172A] mb-1.5"
        style={{ fontFamily: "'Lora', Georgia, serif" }}
      >
        Where are you headed?
      </h1>
      <p className="text-sm text-[#475569] leading-relaxed mb-8">
        We use this to personalize your contacts, job board, and outreach.
      </p>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Career track */}
        <div>
          <label className="text-sm font-medium text-[#0F172A] mb-3 block">
            Primary career track
          </label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {CAREER_TRACKS.map((track) => {
              const isSelected = careerTrack === track;
              return (
                <button
                  key={track}
                  type="button"
                  onClick={() => setCareerTrack(isSelected ? "" : track)}
                  style={{
                    padding: "7px 14px",
                    borderRadius: 3,
                    fontSize: 13,
                    cursor: "pointer",
                    fontWeight: isSelected ? 500 : 400,
                    border: isSelected
                      ? "1px solid #3B82F6"
                      : "1px solid #E2E8F0",
                    background: isSelected ? "#EFF6FF" : "#FFFFFF",
                    color: isSelected ? "#2563EB" : "#475569",
                    transition: "all 0.15s",
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.borderColor = "#3B82F6";
                      e.currentTarget.style.color = "#0F172A";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.borderColor = "#E2E8F0";
                      e.currentTarget.style.color = "#475569";
                    }
                  }}
                >
                  {track}
                </button>
              );
            })}
          </div>
        </div>

        {/* Dream companies — autocomplete */}
        <div>
          <label className="text-sm font-medium text-[#0F172A] mb-1 block">
            Dream companies
          </label>
          <p className="text-xs text-[#64748B] mb-2.5">
            We'll surface new postings at these companies in your feed daily.
            {/* "Why this matters" — concrete and specific so users see the cost of skipping. */}
            <span className="block mt-1 text-[#94A3B8]">
              Skipping this means we can't show you a "From your dream
              companies" section or rank their jobs higher in your feed.
            </span>
          </p>

          <DreamCompanyAutocomplete
            ref={autocompleteRef}
            value={dreamCompanies}
            onChange={setDreamCompanies}
            careerTrack={careerTrack}
          />
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-between mt-8 pt-6"
          style={{ borderTop: "1px solid #E2E8F0" }}
        >
          <button
            type="button"
            onClick={onSkip}
            style={{
              fontSize: 13,
              color: "#CBD5E1",
              background: "none",
              border: "none",
              cursor: "pointer",
              transition: "color 0.15s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "#94A3B8";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "#CBD5E1";
            }}
          >
            Skip for now
          </button>
          <Button
            type="submit"
            variant="default"
            size="default"
            className="min-w-[120px]"
          >
            Continue
          </Button>
        </div>
      </form>
    </div>
  );
};
