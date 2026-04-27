import React from "react";
import { Mail, ChevronDown } from "lucide-react";
import type { EmailTemplate } from "@/services/api";

interface TemplateButtonProps {
  template: EmailTemplate | null;
  onClick: () => void;
}

export const TemplateButton: React.FC<TemplateButtonProps> = ({ template, onClick }) => {
  const purpose = template?.purpose || "Networking";
  const style = template?.stylePreset || "Professional";

  return (
    <button
      type="button"
      onClick={onClick}
      className="tpl-btn"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 0,
        padding: "9px 14px",
        border: "1px solid var(--ink)",
        borderRadius: 10,
        background: "var(--paper)",
        cursor: "pointer",
        fontFamily: "inherit",
        transition: "all .15s",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "var(--accent)";
        e.currentTarget.style.boxShadow = "var(--shadow-sm)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "var(--ink)";
        e.currentTarget.style.boxShadow = "none";
      }}
    >
      <Mail style={{ width: 13, height: 13, color: "var(--ink-2)", marginRight: 8 }} />
      <span
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: "0.14em",
          color: "var(--ink-3)",
        }}
      >
        Email
      </span>
      <span
        style={{
          width: 1,
          height: 14,
          background: "var(--line)",
          margin: "0 10px",
        }}
      />
      <span style={{ fontSize: 12, color: "var(--ink)", fontWeight: 500 }}>
        {purpose}
      </span>
      <span style={{ margin: "0 4px", fontSize: 11, color: "var(--ink-3)" }}>
        &middot;
      </span>
      <span style={{ fontSize: 12, color: "var(--ink)", fontWeight: 500 }}>
        {style}
      </span>
      <ChevronDown style={{ width: 12, height: 12, color: "var(--ink-3)", marginLeft: 8 }} />
    </button>
  );
};
