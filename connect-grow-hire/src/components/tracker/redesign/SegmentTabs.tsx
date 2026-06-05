import { type ProtoSegment } from "@/pages/trackerAdapter";

// People / Companies / Hiring Managers / Archived. Hiring Managers is
// disabled per the PR1 scope cut, but rendered for visual fidelity. Archived
// is its own segment — a flat list of every contact whose archivedAt is set,
// so users have a known location to find and restore archived rows.

interface SegmentTabsProps {
  activeSegment: ProtoSegment;
  onSelectSegment: (segment: ProtoSegment) => void;
  archivedCount?: number;
}

export function SegmentTabs({ activeSegment, onSelectSegment, archivedCount }: SegmentTabsProps) {
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
        <button
          type="button"
          className={`segment-btn${activeSegment === "archived" ? " active" : ""}`}
          onClick={() => onSelectSegment("archived")}
        >
          Archived{archivedCount != null && archivedCount > 0 ? ` (${archivedCount})` : ""}
        </button>
      </div>
    </div>
  );
}
