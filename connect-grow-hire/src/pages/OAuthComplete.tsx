// OAuthComplete — /oauth/complete
// Landing target for OAuth popups (Gmail connect). The backend callback
// redirects here with ?connected=gmail or ?gmail_error=..., we report the
// outcome to the opener and close. Deliberately guardless: it must render
// instantly in the popup regardless of auth state, or the popup fills with
// the app and the opener waits on "popup.closed" forever.
import { useEffect } from "react";
import { Navigate, useLocation } from "react-router-dom";

const OAuthComplete = () => {
  const { search } = useLocation();
  const params = new URLSearchParams(search);
  const connected = params.get("connected") === "gmail";
  const gmailError = params.get("gmail_error");
  const hasOpener = typeof window !== "undefined" && !!window.opener;

  useEffect(() => {
    if (!hasOpener) return;
    window.opener.postMessage(
      {
        type: "offerloop-gmail-oauth",
        status: connected ? "connected" : gmailError || "error",
      },
      window.location.origin,
    );
    window.close();
  }, [hasOpener, connected, gmailError]);

  // Opened as a full page (no opener): send the user back into the app.
  if (!hasOpener) {
    return <Navigate to="/find" replace />;
  }

  // Fallback copy in case the browser refuses window.close().
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "Inter, system-ui, sans-serif",
        color: "#475569",
        fontSize: 15,
        padding: 24,
        textAlign: "center",
      }}
    >
      {connected
        ? "Gmail connected. You can close this window."
        : "All done. You can close this window."}
    </div>
  );
};

export default OAuthComplete;
