// Optional inbox-connect step. Gmail recommended: drafts land in the user's
// inbox. Skipping records inboxConnectSkipped so Settings can badge later.
import { useEffect, useRef, useState } from "react";
import { Download, Check } from "lucide-react";
import { apiService } from "@/services/api";
import { OB } from "./onboardingTheme";

interface Props {
  onDone: (skipped: boolean) => void;
  submitting: boolean;
}

// Official Gmail "M" mark.
const GmailLogo = ({ size = 26 }: { size?: number }) => (
  <svg viewBox="0 0 256 193" style={{ width: size, height: (size * 193) / 256 }} aria-hidden="true">
    <path
      fill="#4285F4"
      d="M58.182 192.05V93.14L27.507 65.077 0 49.504v125.091c0 9.658 7.825 17.455 17.455 17.455h40.727Z"
    />
    <path
      fill="#34A853"
      d="M197.818 192.05h40.727c9.659 0 17.455-7.826 17.455-17.455V49.505l-31.156 17.837-27.026 25.798v98.91Z"
    />
    <path
      fill="#EA4335"
      d="m58.182 93.14-4.174-38.647 4.174-36.989L128 69.868l69.818-52.364 4.669 34.992-4.669 40.644L128 145.504z"
    />
    <path
      fill="#FBBC04"
      d="M197.818 17.504V93.14L256 49.504V26.231c0-21.585-24.64-33.89-41.89-20.945l-16.292 12.218Z"
    />
    <path
      fill="#C5221F"
      d="m0 49.504 26.759 20.07L58.182 93.14V17.504L41.89 5.286C24.61-7.66 0 4.646 0 26.23v23.273Z"
    />
  </svg>
);

const iconTile: React.CSSProperties = {
  width: 52,
  height: 52,
  borderRadius: 12,
  background: "#fff",
  border: "1px solid rgba(15, 23, 42, 0.08)",
  boxShadow: "0 1px 3px rgba(15, 23, 42, 0.05)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
};

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

  const gmailDisabled = connecting || connected || submitting;
  const skipDisabled = submitting || connecting;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <button
        type="button"
        onClick={handleConnectGmail}
        disabled={gmailDisabled}
        style={{
          display: "flex",
          gap: 18,
          alignItems: "center",
          textAlign: "left",
          padding: "26px 28px",
          borderRadius: 14,
          border: `2px solid ${OB.primary}`,
          background: "rgba(74,96,168,0.05)",
          cursor: gmailDisabled ? "default" : "pointer",
          fontFamily: OB.fontBody,
          transition: "box-shadow .15s ease, background .15s ease",
        }}
        onMouseEnter={(e) => {
          if (!gmailDisabled) {
            e.currentTarget.style.background = "rgba(74,96,168,0.09)";
            e.currentTarget.style.boxShadow = "0 4px 16px rgba(74,96,168,0.14)";
          }
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "rgba(74,96,168,0.05)";
          e.currentTarget.style.boxShadow = "none";
        }}
      >
        <span style={iconTile}>
          <GmailLogo />
        </span>
        <span style={{ minWidth: 0 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 17.5, fontWeight: 700, color: OB.heading, letterSpacing: "-0.01em" }}>
              {connected ? "Gmail connected" : connecting ? "Waiting for Google..." : "Connect Gmail"}
            </span>
            <span
              style={{
                padding: "3px 10px",
                borderRadius: 999,
                background: OB.primary,
                color: "#fff",
                fontSize: 11.5,
                fontWeight: 600,
              }}
            >
              Recommended
            </span>
            {connected && <Check size={17} style={{ color: "#16A34A" }} />}
          </span>
          <span style={{ display: "block", fontSize: 15, color: OB.ink2, marginTop: 6, lineHeight: 1.6 }}>
            Drafts appear directly in your Gmail, ready to review and send. Works with any Gmail
            account, even if you signed up with a different email.
          </span>
        </span>
      </button>

      <button
        type="button"
        onClick={() => onDone(true)}
        disabled={skipDisabled}
        style={{
          display: "flex",
          gap: 18,
          alignItems: "center",
          textAlign: "left",
          padding: "26px 28px",
          borderRadius: 14,
          border: `1px solid ${OB.border}`,
          background: "#fff",
          cursor: skipDisabled ? "default" : "pointer",
          fontFamily: OB.fontBody,
          transition: "box-shadow .15s ease, border-color .15s ease",
        }}
        onMouseEnter={(e) => {
          if (!skipDisabled) {
            e.currentTarget.style.borderColor = "#C6CBD9";
            e.currentTarget.style.boxShadow = "0 4px 14px rgba(15,23,42,0.06)";
          }
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = OB.border;
          e.currentTarget.style.boxShadow = "none";
        }}
      >
        <span style={iconTile}>
          <Download size={24} style={{ color: OB.ink3 }} />
        </span>
        <span style={{ minWidth: 0 }}>
          <span style={{ fontSize: 17.5, fontWeight: 700, color: OB.heading, letterSpacing: "-0.01em", display: "block" }}>
            {submitting ? "Finishing up..." : "Skip for now"}
          </span>
          <span style={{ display: "block", fontSize: 15, color: OB.ink2, marginTop: 6, lineHeight: 1.6 }}>
            Your emails arrive as one-tap downloads that open in any mail app, resume attached.
            You can connect Gmail anytime from Settings.
          </span>
        </span>
      </button>
    </div>
  );
};
