import React from "react";
import { Mail } from "lucide-react";
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
        gap: 9,
        padding: "12px 20px",
        border: "1px solid var(--line, #E5E5E0)",
        borderRadius: 12,
        background: "var(--paper, #FFFFFF)",
        cursor: "pointer",
        fontFamily: "inherit",
        fontSize: 14,
        fontWeight: 500,
        color: "var(--ink, #111318)",
        transition: "all .15s",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "var(--accent, #4A60A8)";
        e.currentTarget.style.color = "var(--accent, #4A60A8)";
        e.currentTarget.style.boxShadow = "0 0 0 3px rgba(74,96,168,0.08)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "var(--line, #E5E5E0)";
        e.currentTarget.style.color = "var(--ink, #111318)";
        e.currentTarget.style.boxShadow = "none";
      }}
    >
      <Mail style={{ width: 18, height: 18, color: "currentColor", opacity: 0.7 }} />
      <span style={{ color: "currentColor", opacity: 0.7 }}>Email Template:</span>
      <span style={{ color: "currentColor" }}>{purpose}</span>
      <span style={{ color: "currentColor", opacity: 0.55 }}>&middot;</span>
      <span style={{ color: "currentColor" }}>{style}</span>
    </button>
  );
};
