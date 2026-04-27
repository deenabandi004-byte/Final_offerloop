import React, { useState } from "react";
import { Search } from "lucide-react";

interface FooterSearchProps {
  onSearch: (query: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export const FooterSearch: React.FC<FooterSearchProps> = ({
  onSearch,
  disabled,
  placeholder = "Search for a specific company or industry...",
}) => {
  const [value, setValue] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (value.trim()) {
      onSearch(value.trim());
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "12px 16px",
        border: "1px solid var(--line, #E5E5E0)",
        borderRadius: 3,
        background: "var(--paper, #FFFFFF)",
        marginTop: 20,
        transition: "border-color .15s",
      }}
      className="focus-within:border-[var(--accent)]"
    >
      <Search
        style={{
          width: 14,
          height: 14,
          color: "var(--ink-3, #8A8F9A)",
          flexShrink: 0,
        }}
      />
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        style={{
          flex: 1,
          border: "none",
          background: "none",
          outline: "none",
          fontSize: 13,
          color: "var(--ink, #111318)",
          fontFamily: "inherit",
        }}
      />
      {value.trim() && (
        <button
          type="submit"
          disabled={disabled}
          style={{
            fontSize: 12,
            fontWeight: 500,
            color: "var(--accent, #1B2A44)",
            background: "none",
            border: "none",
            cursor: "pointer",
            fontFamily: "inherit",
            padding: "4px 8px",
          }}
        >
          Search
        </button>
      )}
    </form>
  );
};
