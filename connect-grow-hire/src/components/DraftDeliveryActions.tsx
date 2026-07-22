// src/components/DraftDeliveryActions.tsx
// One component so every draft surface renders delivery identically:
// native Gmail link when a draft exists, download/copy otherwise.
import React, { useState } from "react";
import { ExternalLink, Download, Copy, Check } from "lucide-react";
import { apiService } from "@/services/api";
import { useToast } from "@/hooks/use-toast";

export interface DeliverableDraft {
  to: string;
  subject?: string;
  body?: string;
  gmailUrl?: string;
  firstName?: string;
  company?: string;
}

const DraftDeliveryActions: React.FC<{ draft: DeliverableDraft; size?: "sm" | "md" }> = ({ draft, size = "sm" }) => {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const pad = size === "sm" ? "6px 10px" : "10px 16px";
  const base: React.CSSProperties = {
    display: "inline-flex", alignItems: "center", gap: 6, padding: pad,
    borderRadius: 8, fontFamily: "var(--font-body)", fontSize: 13, fontWeight: 600,
    border: "1px solid var(--border-light)", background: "var(--bg-white)",
    color: "#2563EB", cursor: "pointer", textDecoration: "none",
  };

  if (draft.gmailUrl) {
    return (
      <a href={draft.gmailUrl} target="_blank" rel="noopener noreferrer" style={base}>
        <ExternalLink className="h-3.5 w-3.5" /> Open in Gmail
      </a>
    );
  }
  if (!draft.subject || !draft.body) return null;

  const download = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await apiService.downloadEml({
        to: draft.to, subject: draft.subject!, body: draft.body!,
        firstName: draft.firstName, company: draft.company,
      });
      toast({ title: "Draft downloaded", description: "Open the file and it appears in your mail app, resume attached." });
    } catch {
      toast({ variant: "destructive", title: "Download failed", description: "Please try again." });
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    await navigator.clipboard.writeText(`Subject: ${draft.subject}\n\n${draft.body}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <span style={{ display: "inline-flex", gap: 8 }}>
      <button onClick={download} disabled={busy} style={base}>
        <Download className="h-3.5 w-3.5" /> {busy ? "Building..." : "Download draft"}
      </button>
      <button onClick={copy} style={{ ...base, color: "var(--text-secondary)" }}>
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {copied ? "Copied" : "Copy email"}
      </button>
    </span>
  );
};

export default DraftDeliveryActions;
