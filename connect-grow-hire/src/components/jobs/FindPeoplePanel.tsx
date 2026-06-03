import { useState } from "react";
import {
  IconInfoGray,
  IconLock,
  IconPerson,
  IconRecruiterSearch,
  IconRocket,
  IconSearchSmall,
  IconSparkles,
} from "./icons";

// Inline Find People panel that lives inside JobDetail.
// Visual-only this pass: counts + locked Premium state mirror the prototype
// (offerloop-job-board.html lines 273-442). The CTA calls onFind() which the
// caller wires to the existing FindHumansModal.

const ROLES = [
  { key: "hiring-manager", label: "Hiring Manager", credits: 5, premium: true,  Icon: IconRocket },
  { key: "recruiter",      label: "Recruiter",      credits: 3, premium: false, Icon: IconRecruiterSearch },
  { key: "employee",       label: "Employee",       credits: 2, premium: false, Icon: IconPerson },
] as const;

interface FindPeoplePanelProps {
  userPlan?: "free" | "premium";
  currentCredits?: number;
  onFind: () => void;
  onUpgradeClick?: () => void;
}

export function FindPeoplePanel({
  userPlan = "free",
  currentCredits = 210,
  onFind,
  onUpgradeClick,
}: FindPeoplePanelProps) {
  const isPremium = userPlan === "premium";
  const defaultCounts: Record<string, number> = {
    "hiring-manager": isPremium ? 1 : 0,
    "recruiter": 2,
    "employee": 2,
  };
  const [counts, setCounts] = useState<Record<string, number>>(defaultCounts);

  const totalPeople = ROLES.reduce((s, r) => s + counts[r.key], 0);
  const totalCredits = ROLES.reduce((s, r) => s + r.credits * counts[r.key], 0);
  const atMax = totalPeople >= 10;
  const freeHasHM = !isPremium && counts["hiring-manager"] > 0;
  const notEnough = !freeHasHM && totalCredits > 0 && currentCredits < totalCredits;
  const ctaDisabled = totalPeople === 0 || notEnough;

  function adjustCount(key: string, delta: number) {
    setCounts((prev) => {
      const next = Math.max(0, Math.min(5, prev[key] + delta));
      const newTotal = Object.entries(prev).reduce(
        (s, [k, v]) => s + (k === key ? next : v),
        0
      );
      if (newTotal > 10) return prev;
      return { ...prev, [key]: next };
    });
  }

  let ctaLabel = "Find People";
  if (freeHasHM) ctaLabel = "Upgrade to Find Hiring Managers";
  else if (notEnough) ctaLabel = "Not enough credits";

  return (
    <div className="jb-fp">
      <div>
        <h3 className="jb-fp-eyebrow">FIND PEOPLE</h3>
        <p className="jb-fp-prompt">Who do you want to reach?</p>
      </div>

      <div className="jb-fp-suggested">
        <div className="jb-fp-suggested-head">
          <IconSparkles />
          <span>Suggested Mix</span>
        </div>
        <span className="jb-fp-suggested-sub">
          Based on response rates for similar roles
        </span>
      </div>

      <div className="jb-fp-roles">
        {ROLES.map((role) => {
          const locked = role.premium && !isPremium;
          const count = counts[role.key];
          const canInc = !locked && count < 5 && !atMax;
          const canDec = !locked && count > 0;
          const RoleIcon = role.Icon;
          return (
            <div className="jb-fp-role" key={role.key}>
              <div className="jb-fp-role-meta">
                <div className="jb-fp-role-head">
                  <span className="jb-fp-role-icon"><RoleIcon /></span>
                  <span className="jb-fp-role-name">{role.label}</span>
                  {role.premium && (
                    <span className="jb-fp-premium-tag">Premium</span>
                  )}
                  {!role.premium && <IconInfoGray />}
                </div>
                <div className="jb-fp-role-credits">{role.credits} credits each</div>
              </div>
              <div className={`jb-fp-counter ${locked ? "locked" : ""}`}>
                <button
                  type="button"
                  disabled={!canDec}
                  onClick={() => canDec && adjustCount(role.key, -1)}
                >
                  {locked ? <IconLock /> : "-"}
                </button>
                <span className="count">{count}</span>
                <button
                  type="button"
                  disabled={!canInc}
                  onClick={() => canInc && adjustCount(role.key, 1)}
                >
                  {locked ? <IconLock /> : "+"}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="jb-fp-footer">
        <span className="jb-fp-footer-text">
          {totalPeople} {totalPeople === 1 ? "person" : "people"} · {totalCredits} credits
        </span>
        {atMax && (
          <span style={{ fontSize: 12, color: "#D97706", fontWeight: 500 }}>
            Max 10 people
          </span>
        )}
      </div>

      {freeHasHM && (
        <p style={{ fontSize: 12, color: "var(--ink-5)", margin: 0 }}>
          Hiring managers require a Premium plan.{" "}
          <button
            type="button"
            onClick={onUpgradeClick}
            style={{
              background: "none",
              border: "none",
              color: "var(--slate)",
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 500,
              padding: 0,
            }}
          >
            Upgrade
          </button>
        </p>
      )}

      <button
        className="jb-fp-cta"
        type="button"
        disabled={ctaDisabled && !freeHasHM}
        onClick={() => {
          if (freeHasHM) {
            onUpgradeClick?.();
            return;
          }
          if (!ctaDisabled) onFind();
        }}
      >
        <IconSearchSmall />
        {ctaLabel}
      </button>
    </div>
  );
}
