// V2 Loops wizard escape valve: "Not sure yet? Browse by industry."
// Two-step modal — pick an industry, then pick companies. Closes the
// "freshman with no target list" failure mode of Step 01.
//
// The industries + top_companies dataset already lives at
// src/data/industries.ts (used by the SEO landing pages). We piggyback
// on it instead of standing up a new backend service — same source of
// truth, less drift, zero PDL credits to display.

import { useMemo, useState } from "react";
import { ChevronLeft } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { industries as INDUSTRIES_DATA } from "@/data/industries";

interface IndustryBrowseProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingCompanies: string[];
  existingIndustries: string[];
  onAdd: (added: { companies: string[]; industries: string[] }) => void;
}

export function IndustryBrowse({
  open,
  onOpenChange,
  existingCompanies,
  existingIndustries,
  onAdd,
}: IndustryBrowseProps) {
  const [pickedIndustryName, setPickedIndustryName] = useState<string | null>(null);
  const [selectedCompanies, setSelectedCompanies] = useState<Set<string>>(new Set());

  // Industries can have duplicate names in industries.ts (e.g. "Real Estate"
  // appears twice with different slugs). Dedupe for the picker — the slug
  // distinction doesn't matter to a student browsing.
  const industryNames = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const i of INDUSTRIES_DATA) {
      if (seen.has(i.name)) continue;
      seen.add(i.name);
      out.push(i.name);
    }
    return out.sort((a, b) => a.localeCompare(b));
  }, []);

  const pickedIndustry = useMemo(
    () =>
      pickedIndustryName
        ? INDUSTRIES_DATA.find((i) => i.name === pickedIndustryName) ?? null
        : null,
    [pickedIndustryName],
  );

  const handleClose = (next: boolean) => {
    if (!next) {
      // Reset on close so re-opening starts fresh — students who change
      // their mind mid-browse shouldn't get back into a half-committed state.
      setPickedIndustryName(null);
      setSelectedCompanies(new Set());
    }
    onOpenChange(next);
  };

  const handleAdd = () => {
    if (!pickedIndustry) return;
    const existingCoLower = new Set(existingCompanies.map((c) => c.toLowerCase()));
    const cosToAdd = Array.from(selectedCompanies).filter(
      (c) => !existingCoLower.has(c.toLowerCase()),
    );
    const existingIndLower = new Set(existingIndustries.map((i) => i.toLowerCase()));
    const indToAdd = !existingIndLower.has(pickedIndustry.name.toLowerCase())
      ? [pickedIndustry.name]
      : [];
    onAdd({ companies: cosToAdd, industries: indToAdd });
    handleClose(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        className="max-w-2xl"
        style={{ fontFamily: "'Inter', sans-serif" }}
      >
        <DialogHeader>
          <DialogTitle style={{ fontSize: 18, fontWeight: 600 }}>
            {pickedIndustry
              ? `Pick companies in ${pickedIndustry.name}`
              : "Browse by industry"}
          </DialogTitle>
          <DialogDescription
            style={{ fontSize: 13, color: "var(--ink-3)" }}
          >
            {pickedIndustry
              ? "These are the top companies students typically target. Pick any."
              : "Pick an industry to see who students typically target."}
          </DialogDescription>
        </DialogHeader>

        {!pickedIndustry && (
          <div
            className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-[420px] overflow-y-auto pr-1"
            style={{ marginTop: 4 }}
          >
            {industryNames.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => setPickedIndustryName(name)}
                style={{
                  textAlign: "left",
                  padding: "10px 12px",
                  border: "1px solid var(--line)",
                  borderRadius: 3,
                  background: "#FFFFFF",
                  fontSize: 13,
                  color: "var(--ink)",
                  cursor: "pointer",
                  transition: "border-color 0.15s ease, background 0.15s ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = "#4A60A8";
                  e.currentTarget.style.background = "rgba(74, 96, 168, 0.04)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "var(--line)";
                  e.currentTarget.style.background = "#FFFFFF";
                }}
              >
                {name}
              </button>
            ))}
          </div>
        )}

        {pickedIndustry && (
          <>
            <button
              type="button"
              onClick={() => {
                setPickedIndustryName(null);
                setSelectedCompanies(new Set());
              }}
              className="inline-flex items-center gap-1"
              style={{
                fontSize: 12.5,
                color: "var(--ink-3)",
                background: "transparent",
                border: "none",
                cursor: "pointer",
                padding: 0,
                marginTop: 4,
              }}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Back to industries
            </button>

            <div
              className="flex flex-col gap-1.5 max-h-[360px] overflow-y-auto pr-1"
              style={{ marginTop: 12 }}
            >
              {pickedIndustry.top_companies.map((co) => {
                const checked = selectedCompanies.has(co);
                const alreadyAdded = existingCompanies.some(
                  (x) => x.toLowerCase() === co.toLowerCase(),
                );
                return (
                  <label
                    key={co}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "10px 12px",
                      border: `1px solid ${checked ? "#4A60A8" : "var(--line)"}`,
                      borderRadius: 3,
                      background: checked ? "rgba(74, 96, 168, 0.04)" : "#FFFFFF",
                      cursor: alreadyAdded ? "default" : "pointer",
                      opacity: alreadyAdded ? 0.55 : 1,
                      fontSize: 13,
                      color: "var(--ink)",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked || alreadyAdded}
                      disabled={alreadyAdded}
                      onChange={(e) => {
                        setSelectedCompanies((prev) => {
                          const next = new Set(prev);
                          if (e.target.checked) next.add(co);
                          else next.delete(co);
                          return next;
                        });
                      }}
                      style={{ cursor: alreadyAdded ? "default" : "pointer" }}
                    />
                    <span>{co}</span>
                    {alreadyAdded && (
                      <span
                        style={{
                          marginLeft: "auto",
                          fontSize: 11,
                          color: "var(--ink-3)",
                        }}
                      >
                        Already on the Loop
                      </span>
                    )}
                  </label>
                );
              })}
            </div>

            <div
              className="flex items-center justify-between"
              style={{
                marginTop: 16,
                paddingTop: 14,
                borderTop: "1px solid var(--line-2)",
              }}
            >
              <span style={{ fontSize: 12, color: "var(--ink-3)" }}>
                {selectedCompanies.size === 0
                  ? "Pick at least one company"
                  : `${selectedCompanies.size} selected`}
              </span>
              <button
                type="button"
                onClick={handleAdd}
                disabled={selectedCompanies.size === 0}
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: "#FFFFFF",
                  background:
                    selectedCompanies.size === 0 ? "var(--ink-3)" : "#4A60A8",
                  padding: "8px 16px",
                  borderRadius: 3,
                  border: "none",
                  cursor:
                    selectedCompanies.size === 0 ? "not-allowed" : "pointer",
                }}
              >
                Add to Loop
              </button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
