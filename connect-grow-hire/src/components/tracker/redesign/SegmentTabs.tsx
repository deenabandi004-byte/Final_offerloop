import { type ProtoSegment } from "@/pages/trackerAdapter";

// People / Companies / Hiring Managers. Hiring Managers is disabled in PR1
// per the scope cut, but rendered for visual fidelity with the prototype.

interface SegmentTabsProps {
  activeSegment: ProtoSegment;
  onSelectSegment: (segment: ProtoSegment) => void;
}

export function SegmentTabs({ activeSegment, onSelectSegment }: SegmentTabsProps) {
  return (
    <div className="segment-tabs-wrap">
      <div className="segment-tabs">
        <button
          type="button"
          className={`segment-btn${activeSegment === "people" ? " active" : ""}`}
          onClick={() => onSelectSegment("people")}
        >
          People
        </button>
        <button
          type="button"
          className={`segment-btn${activeSegment === "companies" ? " active" : ""}`}
          onClick={() => onSelectSegment("companies")}
        >
          Companies
        </button>
        <button
          type="button"
          className="segment-btn"
          disabled
          aria-disabled="true"
          title="Coming in a later PR"
        >
          Hiring Managers
        </button>
      </div>
    </div>
  );
}
