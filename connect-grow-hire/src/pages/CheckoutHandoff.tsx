import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { signInWithCustomToken } from "firebase/auth";

import { auth } from "@/lib/firebase";

/**
 * Landing page for the mobile app's "View plans on the web" handoff.
 * The app mints a one-time code (60s TTL, single-use) via
 * POST /api/mobile/web-handoff and opens /checkout?code=<code>[&plan=...].
 * This page burns the code at POST /api/web/handoff-exchange, signs the
 * browser in as the same account with the returned Firebase custom token,
 * and forwards to /pricing. All payment happens on the web; the app itself
 * sells nothing (App Review guideline 3.1.1, US storefront link-out).
 */
const CheckoutHandoff = () => {
  const navigate = useNavigate();
  const [failed, setFailed] = useState(false);
  // React 18 StrictMode double-runs effects in dev; the code is single-use,
  // so the second run must not burn (and fail) the exchange.
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const params = new URLSearchParams(window.location.search);
    const code = params.get("code") || "";
    const plan = params.get("plan") || "";
    const pricing = plan ? `/pricing?plan=${encodeURIComponent(plan)}` : "/pricing";

    if (!code) {
      navigate(pricing, { replace: true });
      return;
    }

    (async () => {
      try {
        const res = await fetch("/api/web/handoff-exchange", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok || !body.token) throw new Error(body.error || "exchange failed");
        await signInWithCustomToken(auth, body.token);
        navigate(pricing, { replace: true });
      } catch {
        // Expired or already-used code (the TTL is only 60 seconds). If the
        // browser is already signed in, plans are one tap away regardless.
        if (auth.currentUser) {
          navigate(pricing, { replace: true });
        } else {
          setFailed(true);
        }
      }
    })();
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#FAFBFF] px-4">
      <div className="text-center max-w-sm w-full bg-white rounded-2xl border border-[#E2E8F0] shadow-sm px-6 py-10">
        {failed ? (
          <>
            <h1
              className="text-2xl font-bold mb-2"
              style={{ fontFamily: "'Lora', Georgia, serif", color: "#0F172A" }}
            >
              That link expired
            </h1>
            <p className="text-[#6B7280] mb-6">
              Handoff links from the app only last a minute. You can still view plans, or
              tap "View plans on the web" in the app again for a fresh link.
            </p>
            <a
              href="/pricing"
              className="block w-full rounded-xl bg-[#3B82F6] hover:bg-[#2563EB] text-white text-lg font-semibold py-4 transition-colors"
            >
              View plans
            </a>
            <a href="/signin" className="block text-sm text-[#6B7280] mt-4 hover:text-[#0F172A]">
              Sign in instead
            </a>
          </>
        ) : (
          <>
            <h1
              className="text-2xl font-bold mb-2"
              style={{ fontFamily: "'Lora', Georgia, serif", color: "#0F172A" }}
            >
              One moment
            </h1>
            <p className="text-[#6B7280]">Signing you in and opening plans…</p>
          </>
        )}
      </div>
    </div>
  );
};

export default CheckoutHandoff;
