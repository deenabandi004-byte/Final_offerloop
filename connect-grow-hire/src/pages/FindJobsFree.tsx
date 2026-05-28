/*
 * Public, anonymous Find-Jobs lead magnet at /tools/find-jobs.
 *
 * Thin wrapper: marketing nav + footer + SEO meta tags, with the actual
 * functionality delegated to <FindJobsWidget />. Same pattern as
 * ResumeReviewFree.tsx.
 *
 * Top-right "Get Started for Free" routes to /onboarding (per product
 * brief) instead of the shared PreviewNav's /signin?mode=signup target, so
 * this page uses a local mini-nav rather than PreviewNav.
 *
 * House style: no em dashes.
 */
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import offerloopLogo from "../assets/offerloop_logo2.png";
import { BRAND, INK, PreviewFooter } from "./seo-preview/_shared";
import { FindJobsWidget } from "../components/widgets/FindJobsWidget";

const FindJobsNav = () => (
  <nav
    className="w-full px-6 py-5 flex items-center justify-between"
    style={{ maxWidth: "1100px", margin: "0 auto", position: "relative", zIndex: 2 }}
  >
    <Link to="/">
      <img src={offerloopLogo} alt="Offerloop" style={{ height: "64px", width: "auto" }} />
    </Link>
    <Link
      to="/onboarding"
      className="px-5 py-2.5 rounded-[3px] text-sm font-semibold text-white"
      style={{ background: BRAND }}
    >
      Get Started for Free
    </Link>
  </nav>
);

const FindJobsFree = () => (
  <div style={{ background: "#FAFAF7", minHeight: "100vh", color: INK }}>
    <Helmet>
      <title>Free AI Job Match — Pair your resume to 5 live jobs in 60 seconds | Offerloop</title>
      <meta
        name="description"
        content="Free job matching for college students and new grads. Upload your resume, get 5 live job postings paired to your background with application links. No account required."
      />
      <link rel="canonical" href="https://offerloop.ai/tools/find-jobs" />
      <meta property="og:title" content="Free AI Job Match by Offerloop" />
      <meta
        property="og:description"
        content="Pair your resume to 5 live job postings with application links and why-it-fits reasoning. Free, no account required."
      />
    </Helmet>

    <FindJobsNav />

    <main style={{ maxWidth: 1280, margin: "0 auto", padding: "48px 24px 80px" }}>
      <FindJobsWidget source="standalone-tools" />
    </main>

    <PreviewFooter />
  </div>
);

export default FindJobsFree;
