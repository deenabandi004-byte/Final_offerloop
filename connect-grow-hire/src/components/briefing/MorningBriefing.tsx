import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  MessageSquareReply,
  Clock,
  CalendarClock,
  Target,
  Search,
  Mail,
  Sparkles,
  ChevronRight,
} from "lucide-react";
import { apiService } from "@/services/api";
import { useFirebaseAuth } from "@/contexts/FirebaseAuthContext";
import { RoadmapProgress } from "./RoadmapProgress";

interface BriefingReply {
  contactId: string;
  contactName: string;
  company: string;
  snippet: string;
  replyDraftBody?: string;
  replyDraftStatus?: string;
}

interface BriefingFollowUp {
  contactId: string;
  contactName: string;
  company: string;
  daysSinceEmail: number;
}

interface BriefingDeadline {
  industry: string;
  event: string;
  date: string;
  urgency: "urgent" | "upcoming" | "future";
}

interface BriefingData {
  replies: BriefingReply[];
  followUps: BriefingFollowUp[];
  roadmapProgress: {
    currentWeek: number;
    weekTheme: string;
    emailsSent: number;
    emailTarget: number;
    repliesReceived: number;
    replyTarget: number;
    status: "ahead" | "on_track" | "behind";
  } | null;
  deadlines: BriefingDeadline[];
  pipelineStats: {
    active: number;
    needsAttention: number;
    done: number;
    totalContacts: number;
  };
  meta: {
    tier: string;
    hasRoadmap: boolean;
    hasContacts: boolean;
    isNewUser: boolean;
  };
}

function SectionHeader({ icon: Icon, title, count, color }: {
  icon: React.ElementType;
  title: string;
  count?: number;
  color: string;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
      <Icon style={{ width: 14, height: 14, color }} />
      <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>{title}</span>
      {count !== undefined && count > 0 && (
        <span style={{
          fontSize: 10, fontWeight: 700,
          padding: "2px 6px", borderRadius: 10,
          background: color + "18", color,
        }}>
          {count}
        </span>
      )}
    </div>
  );
}

function EmptyWelcome({ onGoToSearch }: { onGoToSearch: () => void }) {
  return (
    <div style={{
      padding: "32px 24px",
      textAlign: "center",
      borderRadius: 12,
      border: "1px solid var(--line)",
      background: "var(--surface)",
    }}>
      <Sparkles style={{ width: 28, height: 28, color: "#3B82F6", margin: "0 auto 12px" }} />
      <h3 style={{ fontSize: 16, fontWeight: 600, margin: "0 0 8px", color: "var(--ink)" }}>
        Your briefing updates as you network
      </h3>
      <p style={{ fontSize: 13, color: "var(--ink-3)", margin: "0 0 20px", lineHeight: 1.5 }}>
        Once you start reaching out to contacts, you'll see replies, follow-ups, and progress here.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 280, margin: "0 auto" }}>
        <button
          onClick={onGoToSearch}
          style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "10px 16px", borderRadius: 8,
            border: "1px solid var(--line)", background: "var(--surface)",
            cursor: "pointer", fontSize: 13, color: "var(--ink)",
            textAlign: "left", width: "100%",
          }}
        >
          <Search style={{ width: 14, height: 14, color: "#3B82F6", flexShrink: 0 }} />
          <span>Find your first contact</span>
          <ChevronRight style={{ width: 12, height: 12, marginLeft: "auto", color: "var(--ink-3)" }} />
        </button>
        <button
          onClick={onGoToSearch}
          style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "10px 16px", borderRadius: 8,
            border: "1px solid var(--line)", background: "var(--surface)",
            cursor: "pointer", fontSize: 13, color: "var(--ink)",
            textAlign: "left", width: "100%",
          }}
        >
          <Mail style={{ width: 14, height: 14, color: "#10B981", flexShrink: 0 }} />
          <span>Set up Gmail integration</span>
          <ChevronRight style={{ width: 12, height: 12, marginLeft: "auto", color: "var(--ink-3)" }} />
        </button>
      </div>
    </div>
  );
}

export function MorningBriefing() {
  const [data, setData] = useState<BriefingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const navigate = useNavigate();
  const { user } = useFirebaseAuth();

  useEffect(() => {
    if (!user?.uid) return;
    setLoading(true);
    apiService.getBriefing()
      .then(setData)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [user?.uid]);

  if (loading) {
    return (
      <div style={{ padding: "40px 0", display: "flex", justifyContent: "center" }}>
        <div style={{ fontSize: 13, color: "var(--ink-3)" }}>Loading your briefing...</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ padding: "40px 0", textAlign: "center", fontSize: 13, color: "var(--ink-3)" }}>
        Unable to load briefing. Try refreshing.
      </div>
    );
  }

  const goToSearch = () => {
    const params = new URLSearchParams(window.location.search);
    params.set("tab", "people");
    navigate(`/find?${params.toString()}`, { replace: true });
  };

  const goToContact = (contactId: string) => {
    navigate(`/tracker?contact=${contactId}`);
  };

  // Empty state for brand new users with no data
  if (data.meta.isNewUser && !data.meta.hasContacts && data.replies.length === 0) {
    return <EmptyWelcome onGoToSearch={goToSearch} />;
  }

  const isPro = data.meta.tier === "pro" || data.meta.tier === "elite";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, paddingTop: 8 }}>
      {/* Skip to search link */}
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button
          onClick={goToSearch}
          style={{
            fontSize: 12, color: "var(--ink-3)", background: "none", border: "none",
            cursor: "pointer", display: "flex", alignItems: "center", gap: 4,
          }}
        >
          Skip to search <ChevronRight style={{ width: 11, height: 11 }} />
        </button>
      </div>

      {/* Section 1: Replies */}
      {data.replies.length > 0 && (
        <div style={{
          borderLeft: "3px solid #3B82F6",
          padding: "12px 16px",
          borderRadius: 8,
          background: "var(--surface)",
          border: "1px solid var(--line)",
          borderLeftColor: "#3B82F6",
          borderLeftWidth: 3,
        }}>
          <SectionHeader icon={MessageSquareReply} title="Replies waiting" count={data.replies.length} color="#3B82F6" />
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {data.replies.map((reply) => (
              <button
                key={reply.contactId}
                onClick={() => goToContact(reply.contactId)}
                style={{
                  display: "flex", flexDirection: "column", gap: 2,
                  padding: "8px 12px", borderRadius: 6,
                  border: "1px solid var(--line)", background: "white",
                  cursor: "pointer", textAlign: "left", width: "100%",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 500, color: "var(--ink)" }}>
                    {reply.contactName}
                  </span>
                  {reply.company && (
                    <span style={{ fontSize: 11, color: "var(--ink-3)" }}>at {reply.company}</span>
                  )}
                </div>
                {reply.snippet && (
                  <span style={{ fontSize: 12, color: "var(--ink-2)", lineHeight: 1.4 }}>
                    "{reply.snippet.slice(0, 80)}{reply.snippet.length > 80 ? "..." : ""}"
                  </span>
                )}
                {isPro && reply.replyDraftBody && (
                  <span style={{ fontSize: 11, color: "#3B82F6", marginTop: 2 }}>
                    Reply draft ready
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Section 2: Follow-ups due */}
      {data.followUps.length > 0 && (
        <div style={{
          padding: "12px 16px",
          borderRadius: 8,
          background: "var(--surface)",
          border: "1px solid var(--line)",
          borderLeftColor: "#F59E0B",
          borderLeftWidth: 3,
        }}>
          <SectionHeader icon={Clock} title="Follow-ups due" count={data.followUps.length} color="#F59E0B" />
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {data.followUps.map((fu) => (
              <button
                key={fu.contactId}
                onClick={() => goToContact(fu.contactId)}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "8px 12px", borderRadius: 6,
                  border: "1px solid var(--line)", background: "white",
                  cursor: "pointer", textAlign: "left", width: "100%",
                }}
              >
                <div>
                  <span style={{ fontSize: 13, fontWeight: 500, color: "var(--ink)" }}>
                    {fu.contactName}
                  </span>
                  {fu.company && (
                    <span style={{ fontSize: 11, color: "var(--ink-3)", marginLeft: 6 }}>
                      at {fu.company}
                    </span>
                  )}
                </div>
                <span style={{ fontSize: 11, color: "var(--ink-3)", flexShrink: 0 }}>
                  {fu.daysSinceEmail}d ago
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Section 3: Recruiting deadlines */}
      {data.deadlines.length > 0 && (
        <div style={{
          padding: "12px 16px",
          borderRadius: 8,
          background: "var(--surface)",
          border: "1px solid var(--line)",
          borderLeftColor: "#EF4444",
          borderLeftWidth: 3,
        }}>
          <SectionHeader icon={CalendarClock} title="Recruiting calendar" color="#EF4444" />
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {data.deadlines.map((d, i) => (
              <div
                key={i}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "6px 0", fontSize: 12, color: "var(--ink-2)",
                }}
              >
                <span style={{
                  fontSize: 10, fontWeight: 600, textTransform: "uppercase",
                  padding: "2px 6px", borderRadius: 4,
                  background: d.urgency === "urgent" ? "#FEE2E2" : d.urgency === "upcoming" ? "#FEF3C7" : "#F3F4F6",
                  color: d.urgency === "urgent" ? "#DC2626" : d.urgency === "upcoming" ? "#D97706" : "#6B7280",
                }}>
                  {d.urgency}
                </span>
                <span>{d.event}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Section 4: Roadmap progress (Pro/Elite) */}
      {isPro && data.roadmapProgress && (
        <div style={{
          padding: "12px 16px",
          borderRadius: 8,
          background: "var(--surface)",
          border: "1px solid var(--line)",
          borderLeftColor: "#10B981",
          borderLeftWidth: 3,
        }}>
          <SectionHeader icon={Target} title="Roadmap progress" color="#10B981" />
          <RoadmapProgress data={data.roadmapProgress} />
        </div>
      )}

      {/* Pro/Elite CTA for roadmap if not available */}
      {isPro && !data.roadmapProgress && data.meta.hasContacts && (
        <div style={{
          padding: "12px 16px",
          borderRadius: 8,
          background: "var(--surface)",
          border: "1px dashed var(--line)",
          textAlign: "center",
        }}>
          <Target style={{ width: 16, height: 16, color: "#10B981", margin: "0 auto 6px" }} />
          <p style={{ fontSize: 12, color: "var(--ink-3)", margin: 0 }}>
            Generate your networking roadmap to track weekly progress
          </p>
        </div>
      )}

      {/* Pipeline stats summary */}
      {data.meta.hasContacts && (
        <div style={{
          display: "flex", justifyContent: "center", gap: 16,
          padding: "8px 0", fontSize: 11, color: "var(--ink-3)",
        }}>
          <span>{data.pipelineStats.active} active</span>
          <span style={{ color: "var(--line)" }}>|</span>
          <span>{data.pipelineStats.needsAttention} needs attention</span>
          <span style={{ color: "var(--line)" }}>|</span>
          <span>{data.pipelineStats.done} done</span>
        </div>
      )}
    </div>
  );
}
