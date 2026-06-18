import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import type { ProtoJob } from "@/pages/jobBoardAdapter";
import { apiService } from "@/services/api";
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
  onAutoApply?: () => void;
  autoApplyLoading?: boolean;
  onSave: () => void;
  onShare?: () => void;
  onFindPeople: () => void;
  userPlan?: "free" | "premium";
  currentCredits?: number;
}

export function JobDetail({
  job,
  isSaved,
  onApply,
  onAutoApply,
  autoApplyLoading = false,
  onSave,
  onShare,
  onFindPeople,
  userPlan,
  currentCredits,
}: JobDetailProps) {
  const seeded = job.description?.trim() || null;
  const [description, setDescription] = useState<string | null>(seeded);
  const [loading, setLoading] = useState<boolean>(!seeded);

  useEffect(() => {
    const initial = job.description?.trim() || null;
    setDescription(initial);
    if (initial) {
      setLoading(false);
      return;
    }
    setLoading(true);
    let cancelled = false;
    apiService
      .getJobDescription(job.id)
      .then((res) => {
        if (cancelled) return;
        setDescription(res.description?.trim() || null);
      })
      .catch(() => {
        if (cancelled) return;
        setDescription(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [job.id, job.description]);

  const paragraphs = description ? splitParagraphs(description) : [];

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
          {job.autoApplyEligible && onAutoApply && (
            <button
              className="jb-action primary"
              type="button"
              onClick={onAutoApply}
              disabled={autoApplyLoading}
              aria-busy={autoApplyLoading}
              style={autoApplyLoading ? { opacity: 0.7, cursor: "wait" } : undefined}
              title="We fill the application for you using your saved profile"
            >
              {autoApplyLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" style={{ marginRight: 6 }} />
                  Applying…
                </>
              ) : (
                <>
                  Auto-apply
                  <IconArrowRight />
                </>
              )}
            </button>
          )}
          <button
            className={`jb-action ${job.autoApplyEligible && onAutoApply ? "" : "primary"}`}
            type="button"
            onClick={onApply}
          >
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
          {loading ? (
            <p className="jb-detail-paragraph">Loading description...</p>
          ) : paragraphs.length > 0 ? (
            paragraphs.map((p, i) => (
              <p key={`p-${i}`} className="jb-detail-paragraph">{p}</p>
            ))
          ) : (
            <p className="jb-detail-paragraph">No description provided for this role.</p>
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
