/*
 * FindJobsWidgetSandbox at /sandbox/find-jobs-widget.
 *
 * Bare-minimum test surface for the FindJobsWidget. No marketing chrome,
 * no SEO meta - just a centered container with only the find-jobs widget.
 * Mirrors the dedicated /sandbox/cover-letter-widget and /sandbox/resume-widget
 * patterns so each widget has its own isolated sandbox URL for testing
 * before embedding on SEO pages.
 */
import { FindJobsWidget } from "../components/widgets/FindJobsWidget";

const FindJobsWidgetSandbox = () => (
  <div
    style={{
      minHeight: "100vh",
      background: "#F1F5F9",
      padding: "40px 16px",
      boxSizing: "border-box",
    }}
  >
    <div style={{ maxWidth: 1200, margin: "0 auto" }}>
      <div
        style={{
          marginBottom: 24,
          padding: "12px 18px",
          background: "#FFFBEB",
          border: "1px dashed #FCD34D",
          borderRadius: 8,
          color: "#78350F",
          fontSize: 13,
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
        }}
      >
        Find-jobs widget sandbox. The widget below has no nav/header/footer
        of its own and is rendered with <code>source="sandbox"</code>. Same
        backend as the <code>/tools/find-jobs</code> page.
      </div>

      <FindJobsWidget source="sandbox" />
    </div>
  </div>
);

export default FindJobsWidgetSandbox;
