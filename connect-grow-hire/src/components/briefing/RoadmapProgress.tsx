import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface RoadmapProgressData {
  currentWeek: number;
  weekTheme: string;
  emailsSent: number;
  emailTarget: number;
  repliesReceived: number;
  replyTarget: number;
  status: "ahead" | "on_track" | "behind";
}

interface RoadmapProgressProps {
  data: RoadmapProgressData;
}

function ProgressBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = Math.min((value / max) * 100, 100);
  return (
    <div style={{ height: 6, borderRadius: 3, background: "var(--surface-2)", overflow: "hidden" }}>
      <div
        style={{
          height: "100%",
          width: `${pct}%`,
          borderRadius: 3,
          background: color,
          transition: "width 0.4s ease",
        }}
      />
    </div>
  );
}

const STATUS_CONFIG = {
  ahead: { icon: TrendingUp, color: "#10B981", label: "Ahead of plan" },
  on_track: { icon: Minus, color: "#6B7280", label: "On track" },
  behind: { icon: TrendingDown, color: "#F59E0B", label: "Behind plan" },
};

export function RoadmapProgress({ data }: RoadmapProgressProps) {
  const { icon: StatusIcon, color: statusColor, label: statusLabel } = STATUS_CONFIG[data.status];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 12, fontWeight: 500, color: "var(--ink-2)" }}>
          Week {data.currentWeek}: {data.weekTheme}
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: statusColor }}>
          <StatusIcon style={{ width: 12, height: 12 }} />
          {statusLabel}
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ fontSize: 11, color: "var(--ink-3)" }}>Emails sent</span>
            <span style={{ fontSize: 11, fontWeight: 500, color: "var(--ink-2)" }}>
              {data.emailsSent}/{data.emailTarget}
            </span>
          </div>
          <ProgressBar value={data.emailsSent} max={data.emailTarget} color="#3B82F6" />
        </div>

        <div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ fontSize: 11, color: "var(--ink-3)" }}>Replies received</span>
            <span style={{ fontSize: 11, fontWeight: 500, color: "var(--ink-2)" }}>
              {data.repliesReceived}/{data.replyTarget}
            </span>
          </div>
          <ProgressBar value={data.repliesReceived} max={data.replyTarget} color="#10B981" />
        </div>
      </div>
    </div>
  );
}
