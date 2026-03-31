import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";

interface LocationPreferences {
  jobTypes: string[];
  preferredLocation: string;
}

interface OnboardingLocationPreferencesProps {
  onNext: (data: LocationPreferences) => void;
  isSubmitting?: boolean;
}

export const OnboardingLocationPreferences = ({
  onNext,
  isSubmitting = false,
}: OnboardingLocationPreferencesProps) => {
  const [jobTypes, setJobTypes] = useState<string[]>([]);
  const [location, setLocation] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onNext({ jobTypes, preferredLocation: location });
  };

  const toggleJobType = (type: string) => {
    setJobTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
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
        Step 5 of 5
      </p>
      <h1
        className="text-2xl font-semibold tracking-tight text-[#0F172A] mb-1.5"
        style={{ fontFamily: "'Lora', Georgia, serif" }}
      >
        Almost done
      </h1>
      <p className="text-sm text-[#475569] leading-relaxed mb-8">
        Last step — tell us what kinds of roles and where you're looking.
      </p>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Job types */}
        <div>
          <label className="text-sm font-medium text-[#0F172A] mb-3 block">
            I'm looking for
          </label>
          <div style={{ display: "flex", gap: 8 }}>
            {["Internship", "Part-Time", "Full-Time"].map((type) => {
              const isSelected = jobTypes.includes(type);
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => toggleJobType(type)}
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
                  {type}
                </button>
              );
            })}
          </div>
        </div>

        {/* Location */}
        <div>
          <label className="text-sm font-medium text-[#0F172A] mb-1.5 block">
            Where are you based or looking to work?
            <span className="text-[#94A3B8] font-normal ml-1">(optional)</span>
          </label>
          <Input
            placeholder="e.g. New York, San Francisco, Open to remote..."
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />
        </div>

        {/* Footer — no skip on final step */}
        <div
          className="flex justify-end mt-8 pt-6"
          style={{ borderTop: "1px solid #E2E8F0" }}
        >
          <Button
            type="submit"
            variant="default"
            size="default"
            className="min-w-[140px]"
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              "Get started"
            )}
          </Button>
        </div>
      </form>
    </div>
  );
};
