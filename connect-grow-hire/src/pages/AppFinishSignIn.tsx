import { useEffect } from "react";

/**
 * Landing page for the mobile app's Firebase email-link (magic link) sign-in.
 * Firebase's auth handler redirects here (the continueUrl) with the sign-in
 * params appended. We hand the full URL off to the app via its registered
 * custom scheme. The button is the reliable path — automatic redirects don't
 * always trigger custom-scheme opens on iOS.
 */
const AppFinishSignIn = () => {
  const appLink =
    typeof window !== "undefined"
      ? "offerloop://finish-signin?link=" + encodeURIComponent(window.location.href)
      : "offerloop://finish-signin";

  useEffect(() => {
    window.location.replace(
      "offerloop://finish-signin?link=" + encodeURIComponent(window.location.href)
    );
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#FAFBFF] px-4">
      <div className="text-center max-w-sm w-full bg-white rounded-2xl border border-[#E2E8F0] shadow-sm px-6 py-10">
        <h1
          className="text-2xl font-bold mb-2"
          style={{ fontFamily: "'Lora', Georgia, serif", color: "#0F172A" }}
        >
          Almost signed in
        </h1>
        <p className="text-[#6B7280] mb-6">Finish signing in inside the Offerloop app.</p>
        <a
          href={appLink}
          className="block w-full rounded-xl bg-[#3B82F6] hover:bg-[#2563EB] text-white text-lg font-semibold py-4 transition-colors"
        >
          Open the Offerloop app
        </a>
        <p className="text-sm text-[#6B7280] mt-6">
          Nothing happening? Make sure the Offerloop app is installed on this iPhone, then tap the
          button. You must open this link on the same device you started sign-in from.
        </p>
      </div>
    </div>
  );
};

export default AppFinishSignIn;
