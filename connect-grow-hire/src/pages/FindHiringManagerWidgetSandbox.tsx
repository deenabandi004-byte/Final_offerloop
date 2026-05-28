/*
 * FindHiringManagerWidgetSandbox at /sandbox/find-hiring-manager-widget.
 *
 * Bare-minimum test surface for FindHiringManagerWidget. No marketing
 * chrome, no SEO meta - just a centered container with the widget. Mirrors
 * the existing /sandbox/cover-letter-widget and /sandbox/interview-prep-widget
 * pattern.
 */
import FindHiringManagerWidget from '../components/widgets/FindHiringManagerWidget';

const FindHiringManagerWidgetSandbox = () => (
  <div
    style={{
      minHeight: '100vh',
      background: '#F1F5F9',
      padding: '40px 16px',
      boxSizing: 'border-box',
    }}
  >
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      <div
        style={{
          marginBottom: 24,
          padding: '12px 18px',
          background: '#FFFBEB',
          border: '1px dashed #FCD34D',
          borderRadius: 8,
          color: '#78350F',
          fontSize: 13,
          fontFamily:
            'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
        }}
      >
        Find-hiring-manager widget sandbox. The widget below has no nav/header/footer
        of its own and is rendered with <code>source="sandbox"</code>. Same backend
        as the <code>/tools/find-hiring-manager</code> page.
      </div>

      <FindHiringManagerWidget source="sandbox" />
    </div>
  </div>
);

export default FindHiringManagerWidgetSandbox;
