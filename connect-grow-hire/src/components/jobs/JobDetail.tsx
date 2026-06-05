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

interface JobDetailProps {
  job: ProtoJob;
  isSaved: boolean;
  onApply: () => void;
  onSave: () => void;
  onShare?: () => void;
  onFindPeople: () => void;
  userPlan?: "free" | "premium";
  currentCredits?: number;
}

const FALLBACK_DESCRIPTION_PARAGRAPHS = [
  "We're building the collaborative AI workspace where knowledge, projects, meetings, and AI tools live side by side, so work feels faster, clearer, and less fragmented. Our team believes the best products are born from deep empathy with users, and we're looking for a designer who shares that conviction.",
  "In this role you'll shape end-to-end experiences across our core product surface, partnering closely with product, engineering, and research to define what \"collaborative and intelligent\" looks like at every touchpoint. You'll own the design language for new feature areas, run rapid concept sprints, and raise the bar for craft across the entire design team.",
];

export function JobDetail({
  job,
  isSaved,
  onApply,
  onSave,
  onShare,
  onFindPeople,
  userPlan,
  currentCredits,
}: JobDetailProps) {
  // Prefer real job description; fall back to prototype filler so the
  // panel never looks empty on jobs that lack a description string.
  const description = job.description?.trim();
  const paragraphs = description
    ? splitParagraphs(description)
    : FALLBACK_DESCRIPTION_PARAGRAPHS;

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
          {paragraphs.map((p, i) => (
            <p key={`p-${i}`} className="jb-detail-paragraph">{p}</p>
          ))}
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
