/*
 * Public, anonymous "Find Companies" lead magnet at /tools/find-companies.
 *
 * Thin wrapper: marketing nav + footer + SEO meta tags, with the actual
 * functionality delegated to <FindCompaniesWidget />. The widget can be
 * dropped into any other page (SEO landing pages, blog posts, etc.) and
 * will work identically, sending its leads through the same
 * /api/tools/find-companies backend.
 *
 * House style: no em dashes, no Sparkles icon.
 */
import { Helmet } from "react-helmet-async";
import { INK, PreviewNav, PreviewFooter } from "./seo-preview/_shared";
import { FindCompaniesWidget } from "../components/widgets/FindCompaniesWidget";

const FindCompaniesFree = () => (
  <div style={{ background: "#FAFAF7", minHeight: "100vh", color: INK }}>
    <Helmet>
      <title>Free Company Matcher — Find 5 companies that fit your resume | Offerloop</title>
      <meta
        name="description"
        content="Upload your resume and get 5 companies that hire your background, with the entry-level roles to target and the careers pages to apply to. Free, no account required."
      />
      <link rel="canonical" href="https://offerloop.ai/tools/find-companies" />
      <meta property="og:title" content="Free Company Matcher by Offerloop" />
      <meta
        property="og:description"
        content="Upload your resume and we'll surface 5 companies that match your background, with the roles to target. Free, no account required."
      />
    </Helmet>

    <PreviewNav />

    <main style={{ maxWidth: 1280, margin: "0 auto", padding: "48px 24px 80px" }}>
      <FindCompaniesWidget source="standalone-tools" />
    </main>

    <PreviewFooter />
  </div>
);

export default FindCompaniesFree;
