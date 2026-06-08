// V2 Loops wizard side panel — "Who you'd reach". Shows up to 8 sample
// PDL contacts the Loop would surface, so students see real output of
// their brief before they hit Start. Per the plan's design specs:
//   - Header: "Who you'd reach (N)" with live count
//   - Each card: name (semibold), title, company, school chip if alum
//   - Disclaimer: "These are samples — final results refresh as your
//     Loop runs"
//   - Empty: "Add a company or role to see who we'd reach"
//   - Loading: 3 skeleton cards
//   - Error: "Preview unavailable — your Loop will still find people
//     once it runs"

import type { PreviewContact } from "@/services/agent";

interface InlinePreviewProps {
  contacts: PreviewContact[];
  loading: boolean;
  error: Error | null;
  hasSignal: boolean;
}

export function InlinePreview({
  contacts,
  loading,
  error,
  hasSignal,
}: InlinePreviewProps) {
  return (
    <aside
      aria-live="polite"
      style={{
        background: "#FFFFFF",
        border: "1px solid var(--line)",
        borderRadius: 3,
        padding: 16,
        fontFamily: "'Inter', sans-serif",
        position: "sticky",
        top: 20,
      }}
    >
      <div
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: "var(--ink)",
          marginBottom: 12,
        }}
      >
        {loading
          ? "Who you'd reach…"
          : `Who you'd reach (${contacts.length})`}
      </div>

      {!hasSignal && !loading && (
        <div
          style={{ fontSize: 12.5, color: "var(--ink-3)", lineHeight: 1.5 }}
        >
          Add a company or role to see who we'd reach.
        </div>
      )}

      {error && hasSignal && !loading && (
        <div
          style={{ fontSize: 12.5, color: "var(--ink-3)", lineHeight: 1.5 }}
        >
          Preview unavailable — your Loop will still find people once it runs.
        </div>
      )}

      {loading && (
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} />
          ))}
        </div>
      )}

      {!loading && !error && hasSignal && contacts.length === 0 && (
        <div
          style={{ fontSize: 12.5, color: "var(--ink-3)", lineHeight: 1.5 }}
        >
          Building your preview — your Loop will pull more once it runs.
        </div>
      )}

      {!loading && contacts.length > 0 && (
        <div className="flex flex-col gap-3">
          {contacts.map((c, i) => (
            <PreviewCard key={`${c.name}-${i}`} contact={c} />
          ))}
          <div
            style={{
              marginTop: 6,
              fontSize: 11,
              color: "var(--ink-3)",
              lineHeight: 1.5,
            }}
          >
            These are samples — final results refresh as your Loop runs.
          </div>
        </div>
      )}
    </aside>
  );
}

function PreviewCard({ contact }: { contact: PreviewContact }) {
  const initials = contact.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <div className="flex items-start gap-3">
      <div
        aria-hidden
        style={{
          width: 32,
          height: 32,
          borderRadius: 999,
          background: "rgba(74, 96, 168, 0.10)",
          color: "#4A60A8",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 12,
          fontWeight: 600,
          flexShrink: 0,
        }}
      >
        {initials || "•"}
      </div>
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: "var(--ink)",
            lineHeight: 1.3,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {contact.name}
        </div>
        <div
          style={{
            fontSize: 12,
            color: "var(--ink-2)",
            lineHeight: 1.4,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {contact.title}
        </div>
        {contact.company && (
          <div
            style={{
              fontSize: 12,
              color: "var(--ink-3)",
              lineHeight: 1.4,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {contact.company}
          </div>
        )}
        {contact.sameSchool && (
          <span
            style={{
              display: "inline-block",
              marginTop: 4,
              fontSize: 10.5,
              fontWeight: 600,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              color: "#4A60A8",
              background: "rgba(74, 96, 168, 0.10)",
              padding: "2px 8px",
              borderRadius: 100,
            }}
          >
            Same school
          </span>
        )}
      </div>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="flex items-start gap-3">
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 999,
          background: "var(--paper-2)",
          flexShrink: 0,
        }}
      />
      <div style={{ flex: 1 }}>
        <div
          style={{
            height: 11,
            width: "70%",
            background: "var(--paper-2)",
            borderRadius: 2,
            marginBottom: 6,
          }}
        />
        <div
          style={{
            height: 10,
            width: "55%",
            background: "var(--paper-2)",
            borderRadius: 2,
            marginBottom: 4,
          }}
        />
        <div
          style={{
            height: 10,
            width: "40%",
            background: "var(--paper-2)",
            borderRadius: 2,
          }}
        />
      </div>
    </div>
  );
}
