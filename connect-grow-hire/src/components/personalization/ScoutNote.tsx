import React from "react";

interface ScoutNoteProps {
  children: React.ReactNode;
}

export const ScoutNote: React.FC<ScoutNoteProps> = ({ children }) => (
  <div
    style={{
      background: "#FAF9F6",
      border: "1px solid var(--line-2, #F0F0ED)",
      borderRadius: 3,
      padding: "16px 20px",
      marginBottom: 24,
    }}
  >
    <p
      style={{
        fontFamily: "'Instrument Serif', Georgia, serif",
        fontStyle: "italic",
        fontSize: 16,
        lineHeight: 1.5,
        color: "var(--ink-2, #4A4F5B)",
        margin: 0,
      }}
    >
      {children}
    </p>
  </div>
);
