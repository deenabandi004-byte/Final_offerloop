import { useState, useMemo, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X, Plus, Sparkles } from "lucide-react";
import { companies } from "@/data/companies";

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

// Career-track → companies.ts industry buckets.
// Drives the "Suggested for you" pills under the autocomplete input.
const TRACK_TO_INDUSTRIES: Record<string, string[]> = {
  "Investment Banking": ["investment-banking"],
  "Management Consulting": ["consulting"],
  "Private Equity / VC": ["private-equity", "finance"],
  "Product Management": ["tech"],
  "Software Engineering": ["tech"],
  "Sales & Trading": ["investment-banking", "finance"],
  "Corporate Finance / FP&A": ["finance", "investment-banking"],
  "Other": [],
};

function suggestedCompanyNames(track: string, exclude: string[]): string[] {
  const industries = TRACK_TO_INDUSTRIES[track] || [];
  if (!industries.length) return [];
  return companies
    .filter((c) => industries.includes(c.industry))
    .map((c) => c.name)
    .filter((name) => !exclude.includes(name))
    .slice(0, 8);
}

function filterCompaniesByQuery(query: string, exclude: string[]): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return companies
    .filter((c) => c.name.toLowerCase().includes(q))
    .map((c) => c.name)
    .filter((name) => !exclude.includes(name))
    .slice(0, 6);
}

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
  const [careerTrack, setCareerTrack] = useState(
    initialData?.careerTrack || ""
  );
  const [dreamCompanies, setDreamCompanies] = useState<string[]>(
    initialData?.dreamCompanies || []
  );
  const [companyInput, setCompanyInput] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const filteredMatches = useMemo(
    () => filterCompaniesByQuery(companyInput, dreamCompanies),
    [companyInput, dreamCompanies]
  );

  const suggestions = useMemo(
    () => suggestedCompanyNames(careerTrack, dreamCompanies),
    [careerTrack, dreamCompanies]
  );

  // Close the dropdown when clicking outside
  useEffect(() => {
    if (!dropdownOpen) return;
    function onClickOutside(e: MouseEvent) {
      const t = e.target as Node;
      if (
        dropdownRef.current && !dropdownRef.current.contains(t) &&
        inputRef.current && !inputRef.current.contains(t)
      ) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [dropdownOpen]);

  const addCompany = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed || dreamCompanies.includes(trimmed)) return;
    setDreamCompanies((prev) => [...prev, trimmed]);
    setCompanyInput("");
    setDropdownOpen(false);
  };

  const removeCompany = (name: string) => {
    setDreamCompanies((prev) => prev.filter((c) => c !== name));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Flush any pending text the user typed but didn't commit via Enter/click
    let final = dreamCompanies;
    const pending = companyInput.trim().replace(/,$/, "");
    if (pending && !dreamCompanies.includes(pending)) {
      final = [...dreamCompanies, pending];
    }
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
          </p>

          {/* Selected pills */}
          {dreamCompanies.length > 0 && (
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 6,
                marginBottom: 8,
              }}
            >
              {dreamCompanies.map((co) => (
                <span
                  key={co}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                    padding: "3px 10px",
                    borderRadius: 3,
                    fontSize: 12,
                    background: "#EFF6FF",
                    border: "1px solid #BFDBFE",
                    color: "#1D4ED8",
                  }}
                >
                  {co}
                  <button
                    type="button"
                    onClick={() => removeCompany(co)}
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      padding: 0,
                      display: "flex",
                      alignItems: "center",
                    }}
                  >
                    <X size={11} color="#60A5FA" />
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* Autocomplete input with dropdown */}
          <div style={{ position: "relative" }}>
            <Input
              ref={inputRef}
              placeholder="Search companies (Goldman, McKinsey, Stripe...)"
              value={companyInput}
              onChange={(e) => {
                setCompanyInput(e.target.value);
                setDropdownOpen(true);
              }}
              onFocus={() => setDropdownOpen(true)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === ",") {
                  if (companyInput.trim()) {
                    e.preventDefault();
                    // If there's a top match, prefer it; else add as custom
                    const pick = filteredMatches[0] || companyInput.trim().replace(/,$/, "");
                    addCompany(pick);
                  }
                } else if (
                  e.key === "Backspace" &&
                  companyInput === "" &&
                  dreamCompanies.length > 0
                ) {
                  setDreamCompanies((prev) => prev.slice(0, -1));
                } else if (e.key === "Escape") {
                  setDropdownOpen(false);
                }
              }}
            />

            {dropdownOpen && filteredMatches.length > 0 && (
              <div
                ref={dropdownRef}
                style={{
                  position: "absolute",
                  top: "calc(100% + 4px)",
                  left: 0,
                  right: 0,
                  background: "#FFFFFF",
                  border: "1px solid #E2E8F0",
                  borderRadius: 4,
                  boxShadow: "0 6px 18px rgba(15, 23, 42, 0.08)",
                  zIndex: 20,
                  maxHeight: 240,
                  overflowY: "auto",
                }}
              >
                {filteredMatches.map((name) => (
                  <button
                    key={name}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => addCompany(name)}
                    style={{
                      display: "block",
                      width: "100%",
                      textAlign: "left",
                      padding: "8px 12px",
                      fontSize: 13,
                      color: "#0F172A",
                      background: "transparent",
                      border: "none",
                      cursor: "pointer",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "#F1F5F9";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "transparent";
                    }}
                  >
                    {name}
                  </button>
                ))}
                {companyInput.trim() &&
                  !filteredMatches.some(
                    (m) => m.toLowerCase() === companyInput.trim().toLowerCase()
                  ) && (
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => addCompany(companyInput)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        width: "100%",
                        textAlign: "left",
                        padding: "8px 12px",
                        fontSize: 13,
                        color: "#475569",
                        background: "transparent",
                        border: "none",
                        borderTop: "1px solid #F1F5F9",
                        cursor: "pointer",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = "#F1F5F9";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "transparent";
                      }}
                    >
                      <Plus size={12} />
                      Add &ldquo;{companyInput.trim()}&rdquo;
                    </button>
                  )}
              </div>
            )}
          </div>

          {/* Suggested for your career track — one-click add */}
          {careerTrack && suggestions.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                  fontSize: 11,
                  fontWeight: 500,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  color: "#94A3B8",
                  marginBottom: 6,
                }}
              >
                <Sparkles size={11} />
                Common picks for {careerTrack.toLowerCase()}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {suggestions.map((name) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => addCompany(name)}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      padding: "4px 10px",
                      borderRadius: 999,
                      fontSize: 12,
                      background: "#FFFFFF",
                      border: "1px dashed #CBD5E1",
                      color: "#475569",
                      cursor: "pointer",
                      transition: "all 0.12s",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderStyle = "solid";
                      e.currentTarget.style.borderColor = "#3B82F6";
                      e.currentTarget.style.color = "#2563EB";
                      e.currentTarget.style.background = "#EFF6FF";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderStyle = "dashed";
                      e.currentTarget.style.borderColor = "#CBD5E1";
                      e.currentTarget.style.color = "#475569";
                      e.currentTarget.style.background = "#FFFFFF";
                    }}
                  >
                    <Plus size={11} />
                    {name}
                  </button>
                ))}
              </div>
            </div>
          )}
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
            Skip
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
