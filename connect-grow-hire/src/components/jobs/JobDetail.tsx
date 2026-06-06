import type { ProtoJob } from "@/pages/jobBoardAdapter";
import { CompanyLogo } from "./CompanyLogo";
import {
  IconArrowRight,
  IconBookmark,
  IconClock,
  IconLocation,
  IconSalary,
  IconShare,
} from "./icons";
import { FindPeoplePanel } from "./FindPeoplePanel";

// JobDetail renders the right pane. Prototype-faithful (offerloop-job-board.html
// lines 760-816):
// - 160px slate banner
// - Header with logo, title, "company · posted · X people clicked apply"
// - Save / Share / Apply buttons
// - At a Glance section (location, jobtype, salary green)
// - Job Description section
// - FindPeoplePanel embedded at the bottom

// Loading / loaded / empty / error are distinct so the panel never shows
// placeholder filler in place of a real description.
export type JobDescriptionState =
  | { status: "loading" }
  | { status: "loaded"; text: string }
  | { status: "empty" }
  | { status: "error" };

interface JobDetailProps {
  job: ProtoJob;
  description: JobDescriptionState;
  onRetryDescription?: () => void;
  isSaved: boolean;
  onApply: () => void;
  onSave: () => void;
  onShare?: () => void;
  onFindPeople: () => void;
  userPlan?: "free" | "premium";
  currentCredits?: number;
}

export function JobDetail({
  job,
  description,
  onRetryDescription,
  isSaved,
  onApply,
  onSave,
  onShare,
  onFindPeople,
  userPlan,
  currentCredits,
}: JobDetailProps) {
  return (
    <>
      <div className="jb-banner">
        <CompanyLogo
          className="jb-banner-watermark"
          company={job.company}
          monogram={job.logoMonogram}
          fallbackUrl={job.logoUrl}
          imageBg="transparent"
        />
      </div>

      <div className="jb-detail-header">
        <div className="jb-detail-header-left">
          <CompanyLogo
            className="jb-detail-logo"
            company={job.company}
            monogram={job.logoMonogram}
            fallbackUrl={job.logoUrl}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 className="jb-detail-title">{job.title}</h2>
            <div className="jb-detail-meta">
              {job.company} · {job.detailPosted || job.posted} · Over 100 people clicked apply
            </div>
          </div>
        </div>
        <div className="jb-detail-actions">
          <button
            className={`jb-action ${isSaved ? "saved" : ""}`}
            type="button"
            onClick={onSave}
          >
            <IconBookmark filled={isSaved} color={isSaved ? "#3B82F6" : "currentColor"} />
            {isSaved ? "Saved" : "Save"}
          </button>
          <button className="jb-action" type="button" onClick={onShare}>
            <IconShare />
            Share
          </button>
          <button className="jb-action primary" type="button" onClick={onApply}>
            Apply
            <IconArrowRight />
          </button>
        </div>
      </div>

      <div className="jb-detail-body">
        <div className="jb-detail-section">
          <h3>AT A GLANCE</h3>
          <div className="jb-glance">
            <div className="jb-glance-row">
              <IconLocation />
              <span>{job.detailLocation || job.location || "Location TBD"}</span>
            </div>
            <div className="jb-glance-row">
              <IconClock />
              <span>{job.jobType}</span>
            </div>
            {job.salary && (
              <div className="jb-glance-row salary">
                <IconSalary />
                <span>{job.salary}</span>
              </div>
            )}
          </div>
        </div>

        <div className="jb-divider" />

        <div className="jb-detail-section">
          <h3>JOB DESCRIPTION</h3>
          {description.status === "loading" && (
            <p className="jb-detail-paragraph" style={{ color: "var(--ink-3, #94A3B8)" }}>
              Loading description...
            </p>
          )}
          {description.status === "loaded" &&
            splitParagraphs(description.text).map((p, i) => (
              <p key={`p-${i}`} className="jb-detail-paragraph">{p}</p>
            ))}
          {description.status === "empty" && (
            <p className="jb-detail-paragraph" style={{ color: "var(--ink-3, #94A3B8)" }}>
              No description provided for this role.
            </p>
          )}
          {description.status === "error" && (
            <p className="jb-detail-paragraph" style={{ color: "var(--ink-3, #94A3B8)" }}>
              Couldn't load the description.{" "}
              <button
                type="button"
                onClick={onRetryDescription}
                style={{
                  background: "none",
                  border: "none",
                  padding: 0,
                  color: "var(--brand, #3B82F6)",
                  cursor: "pointer",
                  font: "inherit",
                }}
              >
                Try again
              </button>
            </p>
          )}
        </div>

        <div className="jb-divider" />

        <FindPeoplePanel
          userPlan={userPlan}
          currentCredits={currentCredits}
          onFind={onFindPeople}
        />
      </div>
    </>
  );
}

function splitParagraphs(text: string): string[] {
  const parts = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length > 1) return parts.slice(0, 4);
  if (text.length > 400) {
    return [text.slice(0, 400) + "..."];
  }
  return [text];
}
