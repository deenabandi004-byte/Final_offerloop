/*
 * FindPeopleWidgetSandbox at /sandbox/find-people-widget.
 *
 * Bare-minimum test surface for FindPeopleWidget. No marketing chrome,
 * no SEO meta - just a centered container with the widget. Mirrors the
 * existing /sandbox/find-hiring-manager-widget and /sandbox/find-companies-widget
 * pattern.
 */
import FindPeopleWidget from '../components/widgets/FindPeopleWidget';

const FindPeopleWidgetSandbox = () => (
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
        Find-people widget sandbox. The widget below has no nav/header/footer
        of its own and is rendered with <code>source="sandbox"</code>. Same
        backend as the <code>/tools/find-people</code> page.
      </div>

      <FindPeopleWidget source="sandbox" />
    </div>
  </div>
);

export default FindPeopleWidgetSandbox;
