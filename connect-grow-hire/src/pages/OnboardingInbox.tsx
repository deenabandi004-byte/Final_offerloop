// Optional inbox-connect step. Gmail recommended: drafts land in the user's
// inbox. Skipping records inboxConnectSkipped so Settings can badge later.
import { useEffect, useRef, useState } from "react";
import { Mail, Download, Check } from "lucide-react";
import { apiService } from "@/services/api";
import { OB } from "./onboardingTheme";

interface Props {
  onDone: (skipped: boolean) => void;
  submitting: boolean;
}

export const OnboardingInbox = ({ onDone, submitting }: Props) => {
  const [connecting, setConnecting] = useState(false);
  const [connected, setConnected] = useState(false);
  const pollRef = useRef<number | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const handleConnectGmail = async () => {
    if (connecting || connected || submitting) return;
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    setConnecting(true);
    try {
      const authUrl = await apiService.startGmailOAuth();
      if (!authUrl) throw new Error("no auth url");
      const popup = window.open(
        authUrl,
        `gmail-oauth-${Date.now()}`,
        "width=600,height=700,scrollbars=yes,resizable=yes",
      );
      if (!popup) {
        setConnecting(false);
        return;
      }
      const timer = window.setInterval(async () => {
        if (popup.closed) {
          clearInterval(timer);
          pollRef.current = null;
          try {
            // The backend OAuth callback write can land slightly after the
            // popup closes; retry the status check so a real connect isn't missed.
            for (let attempt = 0; attempt < 3; attempt++) {
              if (!mountedRef.current) return;
              try {
                const status = await apiService.gmailStatus();
                if (status.connected) {
                  if (!mountedRef.current) return;
                  setConnected(true);
                  onDone(false);
                  return;
                }
              } catch {
                // transient failure; fall through to retry
              }
              if (attempt < 2) {
                await new Promise((resolve) => setTimeout(resolve, 1000));
              }
            }
          } finally {
            if (mountedRef.current) setConnecting(false);
          }
        }
      }, 500);
      pollRef.current = timer;
    } catch {
      setConnecting(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <button
        type="button"
        onClick={handleConnectGmail}
        disabled={connecting || connected || submitting}
        style={{
          display: "flex",
          gap: 14,
          alignItems: "flex-start",
          textAlign: "left",
          padding: "18px 20px",
          borderRadius: 12,
          border: `2px solid ${OB.primary}`,
          background: "rgba(74,96,168,0.04)",
          cursor: connecting || connected || submitting ? "default" : "pointer",
          fontFamily: OB.fontBody,
        }}
      >
        <Mail size={22} style={{ color: OB.primary, flexShrink: 0, marginTop: 2 }} />
        <span>
          <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 15, fontWeight: 600, color: OB.heading }}>
              {connected ? "Gmail connected" : connecting ? "Waiting for Google..." : "Connect Gmail"}
            </span>
            <span
              style={{
                padding: "2px 8px",
                borderRadius: 999,
                background: OB.primary,
                color: "#fff",
                fontSize: 11,
                fontWeight: 600,
              }}
            >
              Recommended
            </span>
            {connected && <Check size={15} style={{ color: "#16A34A" }} />}
          </span>
          <span style={{ display: "block", fontSize: 13.5, color: OB.ink2, marginTop: 4, lineHeight: 1.55 }}>
            Drafts appear directly in your Gmail, ready to review and send. Works with any Gmail
            account, even if you signed up with a different email.
          </span>
        </span>
      </button>

      <button
        type="button"
        onClick={() => onDone(true)}
        disabled={submitting || connecting}
        style={{
          display: "flex",
          gap: 14,
          alignItems: "flex-start",
          textAlign: "left",
          padding: "18px 20px",
          borderRadius: 12,
          border: `1px solid ${OB.border}`,
          background: "#fff",
          cursor: submitting || connecting ? "default" : "pointer",
          fontFamily: OB.fontBody,
        }}
      >
        <Download size={22} style={{ color: OB.ink3, flexShrink: 0, marginTop: 2 }} />
        <span>
          <span style={{ fontSize: 15, fontWeight: 600, color: OB.heading, display: "block" }}>
            {submitting ? "Finishing up..." : "Skip for now"}
          </span>
          <span style={{ display: "block", fontSize: 13.5, color: OB.ink2, marginTop: 4, lineHeight: 1.55 }}>
            Your emails arrive as one-tap downloads that open in any mail app, resume attached.
            You can connect Gmail anytime from Settings.
          </span>
        </span>
      </button>
    </div>
  );
};
