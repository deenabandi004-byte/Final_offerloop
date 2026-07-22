// src/components/InboxConnectNudge.tsx
// Shown when drafts were delivered in fallback mode. Suggests the right
// integration for the user's email domain. Session-dismissible: reappears
// on the next session's first fallback draft, by design.
import React, { useState } from "react";
import { Mail, X } from "lucide-react";
import { useFirebaseAuth } from "@/contexts/FirebaseAuthContext";
import { apiService } from "@/services/api";

const GOOGLE_DOMAINS = ["gmail.com", "googlemail.com"];
const MICROSOFT_DOMAINS = ["outlook.com", "hotmail.com", "live.com", "msn.com"];

const InboxConnectNudge: React.FC<{ show: boolean }> = ({ show }) => {
  const { user } = useFirebaseAuth();
  const [dismissed, setDismissed] = useState(() => sessionStorage.getItem("inbox_nudge_dismissed") === "1");
  const [connecting, setConnecting] = useState(false);

  if (!show || dismissed) return null;

  const domain = (user?.email || "").split("@")[1]?.toLowerCase() || "";
  const isGoogle = GOOGLE_DOMAINS.includes(domain);
  const isMicrosoft = MICROSOFT_DOMAINS.includes(domain);

  const dismiss = () => {
    sessionStorage.setItem("inbox_nudge_dismissed", "1");
    setDismissed(true);
  };

  const connectGmail = async () => {
    if (connecting) return;
    setConnecting(true);
    try {
      const authUrl = await apiService.startGmailOAuth();
      if (authUrl) window.open(authUrl, `gmail-oauth-${Date.now()}`, "width=600,height=700");
    } finally {
      setConnecting(false);
    }
  };

  const headline = isGoogle
    ? "Put these drafts straight into your Gmail"
    : isMicrosoft
      ? "Outlook drafts are coming soon"
      : "Your drafts arrive as downloads";
  const detail = isGoogle
    ? "Connect Gmail once and every draft appears in your inbox, ready to send."
    : isMicrosoft
      ? "For now, download your drafts or connect a Gmail account if you have one."
      : "Each file opens in your mail app with your resume attached. Have a Gmail? Connect it for drafts written directly to your inbox.";

  return (
    <div className="flex items-start gap-3 p-4 rounded-[10px] mb-4"
      style={{ background: "rgba(59,130,246,0.05)", border: "1px solid rgba(59,130,246,0.15)" }}>
      <Mail className="h-5 w-5 mt-0.5" style={{ color: "#2563EB" }} />
      <div style={{ flex: 1 }}>
        <p style={{ fontFamily: "var(--font-body)", fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>{headline}</p>
        <p style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-secondary)", marginTop: 2 }}>{detail}</p>
        {(isGoogle || !isMicrosoft) && (
          <button onClick={connectGmail} disabled={connecting} className="mt-2"
            style={{ fontFamily: "var(--font-body)", fontSize: 13, fontWeight: 600, color: "#2563EB", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
            {connecting ? "Opening Google..." : "Connect Gmail"}
          </button>
        )}
      </div>
      <button onClick={dismiss} aria-label="Dismiss" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-tertiary)" }}>
        <X className="h-4 w-4" />
      </button>
    </div>
  );
};

export default InboxConnectNudge;
