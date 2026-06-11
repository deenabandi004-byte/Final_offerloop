import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import BeehiivPopup from '@/components/BeehiivPopup';
import offerloopLogo from '../../assets/offerloop_logo2.png';
import ExitIntentPopup from '@/components/ExitIntentPopup';
import SEOHead from '@/components/SEOHead';
import { generateMeta } from '@/utils/generateMeta';

interface SalaryData {
  company: string;
  slug: string;
  industry: string;
  levels: { title: string; baseSalary: string; bonus: string; totalComp: string }[];
  bonusNotes: string;
}

interface Props {
  data: SalaryData;
}

function getFaqData(data: SalaryData) {
  return [
    {
      question: `What is the starting salary at ${data.company}?`,
      answer: `Starting salaries at ${data.company} vary by role and location. Entry-level positions typically include a base salary plus a performance bonus. See the compensation table above for specific figures by level.`,
    },
    {
      question: `Does ${data.company} offer signing bonuses?`,
      answer: `Many positions at ${data.company} include signing bonuses, particularly for entry-level analyst and associate roles. The amount varies by division, office location, and market conditions at the time of the offer.`,
    },
    {
      question: `How does ${data.company} compensation compare to competitors?`,
      answer: `${data.company} compensation is generally competitive with peer firms in ${data.industry}. Total compensation including base, bonus, and benefits tends to be in line with industry standards, though specific differences exist at each level.`,
    },
    {
      question: `Can you negotiate salary at ${data.company}?`,
      answer: `There is typically limited negotiation room for entry-level positions at ${data.company}, as these roles have standardized compensation bands. However, lateral hires and senior roles often have more flexibility. Networking with current employees can help you understand what is realistic.`,
    },
  ];
}

const SalaryPage = ({ data }: Props) => {
  const faqData = getFaqData(data);

  return (
    <div className="min-h-screen w-full" style={{ fontFamily: "'DM Sans', system-ui, sans-serif", background: '#FFFFFF' }}>
      <SEOHead {...generateMeta('salary', { company: data.company })} ogType="article" />
      <Helmet>
        <script type="application/ld+json">{JSON.stringify({
          "@context": "https://schema.org",
          "@type": "FAQPage",
          "mainEntity": faqData.map(f => ({
            "@type": "Question",
            "name": f.question,
            "acceptedAnswer": { "@type": "Answer", "text": f.answer }
          }))
        })}</script>
      </Helmet>

      {/* Nav */}
      <nav className="w-full px-6 py-5 flex items-center justify-between" style={{ maxWidth: '1100px', margin: '0 auto' }}>
        <Link to="/" className="text-xl font-bold" style={{ color: '#0F172A', letterSpacing: '-0.02em' }}><img src={offerloopLogo} alt="Offerloop" style={{ height: '64px', width: 'auto' }} /></Link>
        <Link to="/signin?mode=signup" className="px-5 py-2.5 rounded-[3px] text-sm font-semibold text-white" style={{ background: '#3B82F6' }}>
          Get Started Free
        </Link>
      </nav>

      {/* Hero */}
      <section className="px-6 pt-16 pb-12" style={{ maxWidth: '800px', margin: '0 auto' }}>
        <p className="text-sm font-medium mb-4" style={{ color: '#3B82F6', letterSpacing: '0.02em' }}>SALARY GUIDE</p>
        <h1 style={{ fontFamily: "'Lora', Georgia, serif", fontSize: 'clamp(36px, 5vw, 56px)', fontWeight: 400, lineHeight: 1.1, letterSpacing: '-0.025em', color: '#0F172A', marginBottom: '20px' }}>
          <span style={{ color: '#3B82F6' }}>{data.company}</span> Salary Guide
        </h1>
        <p style={{ fontSize: '17px', lineHeight: 1.7, color: '#64748B', maxWidth: '620px' }}>
          Complete compensation breakdown for {data.company} including base salary, bonus structure, and total compensation at every level.
        </p>
      </section>

      {/* Salary Table */}
      <section className="px-6 py-12" style={{ maxWidth: '800px', margin: '0 auto', borderTop: '1px solid #F1F5F9' }}>
        <h2 style={{ fontFamily: "'Lora', Georgia, serif", fontSize: '28px', fontWeight: 400, color: '#0F172A', marginBottom: '20px' }}>
          {data.company} Compensation by Level
        </h2>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
            <thead>
              <tr style={{ background: '#F8FAFC' }}>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: '#0F172A', borderBottom: '1px solid #E2E8F0' }}>Level</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: '#0F172A', borderBottom: '1px solid #E2E8F0' }}>Base Salary</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: '#0F172A', borderBottom: '1px solid #E2E8F0' }}>Bonus</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: '#0F172A', borderBottom: '1px solid #E2E8F0' }}>Total Comp</th>
              </tr>
            </thead>
            <tbody>
              {data.levels.map((level, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #E2E8F0' }}>
                  <td style={{ padding: '12px 16px', color: '#0F172A', fontWeight: 500 }}>{level.title}</td>
                  <td style={{ padding: '12px 16px', color: '#475569' }}>{level.baseSalary}</td>
                  <td style={{ padding: '12px 16px', color: '#475569' }}>{level.bonus}</td>
                  <td style={{ padding: '12px 16px', color: '#475569', fontWeight: 500 }}>{level.totalComp}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Bonus Structure */}
      <section className="px-6 py-12" style={{ maxWidth: '800px', margin: '0 auto', borderTop: '1px solid #F1F5F9' }}>
        <h2 style={{ fontFamily: "'Lora', Georgia, serif", fontSize: '28px', fontWeight: 400, color: '#0F172A', marginBottom: '16px' }}>
          Bonus Structure
        </h2>
        <p style={{ fontSize: '15px', lineHeight: 1.8, color: '#475569' }}>
          {data.bonusNotes}
        </p>
      </section>

      {/* How Comp Compares */}
      <section className="px-6 py-12" style={{ maxWidth: '800px', margin: '0 auto', borderTop: '1px solid #F1F5F9' }}>
        <h2 style={{ fontFamily: "'Lora', Georgia, serif", fontSize: '28px', fontWeight: 400, color: '#0F172A', marginBottom: '16px' }}>
          How {data.company} Comp Compares
        </h2>
        <p style={{ fontSize: '15px', lineHeight: 1.8, color: '#475569', marginBottom: '16px' }}>
          Compensation at {data.company} is competitive within {data.industry}. To see detailed side-by-side comparisons with peer firms, check out our comparison pages.
        </p>
        <Link to={`/compare/${data.slug}-vs-competitors`} className="text-sm font-semibold" style={{ color: '#3B82F6', textDecoration: 'none' }}>
          View {data.company} comparisons →
        </Link>
      </section>

      {/* How to Negotiate */}
      <section className="px-6 py-12" style={{ maxWidth: '800px', margin: '0 auto', borderTop: '1px solid #F1F5F9' }}>
        <h2 style={{ fontFamily: "'Lora', Georgia, serif", fontSize: '28px', fontWeight: 400, color: '#0F172A', marginBottom: '16px' }}>
          How to Negotiate
        </h2>
        <div className="space-y-3">
          {[
            { title: 'Know your market value', desc: 'Research compensation at peer firms so you understand what is standard and where there might be room to negotiate.' },
            { title: 'Leverage competing offers', desc: 'If you have offers from other firms, you can use them as leverage. Be transparent and professional about this.' },
            { title: 'Focus on total compensation', desc: 'Base salary may be fixed, but signing bonuses, start dates, and relocation packages often have flexibility.' },
            { title: 'Network for insider intel', desc: 'Connect with current employees to understand the real compensation bands and what is negotiable at each level.' },
          ].map((item, i) => (
            <div key={i} className="flex gap-3 rounded-[3px] p-4" style={{ background: '#FAFBFF', border: '1px solid #F1F5F9' }}>
              <span className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold" style={{ background: '#FAFBFF', color: '#3B82F6', marginTop: '2px' }}>&#10003;</span>
              <div>
                <p className="text-sm font-semibold mb-1" style={{ color: '#0F172A' }}>{item.title}</p>
                <p style={{ fontSize: '13px', lineHeight: 1.6, color: '#64748B' }}>{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Offerloop CTA */}
      <section className="px-6 py-12" style={{ maxWidth: '800px', margin: '0 auto', borderTop: '1px solid #F1F5F9' }}>
        <div className="rounded-[3px] p-6" style={{ background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
          <h3 className="text-base font-semibold mb-2" style={{ color: '#0F172A' }}>Network your way to {data.company}</h3>
          <p style={{ fontSize: '14px', lineHeight: 1.6, color: '#64748B', marginBottom: '16px' }}>
            Find {data.company} employees, get verified emails, and build relationships that lead to offers.
          </p>
          <Link to="/signin?mode=signup" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-[3px] text-white font-semibold text-sm" style={{ background: '#3B82F6' }}>
            Get Started Free
          </Link>
        </div>
      </section>

      {/* FAQ */}
      <section className="px-6 py-16" style={{ maxWidth: '800px', margin: '0 auto', borderTop: '1px solid #F1F5F9' }}>
        <h2 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '24px', color: '#0F172A' }}>Frequently Asked Questions</h2>
        {faqData.map((faq, i) => (
          <div key={i} style={{ marginBottom: '20px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '8px', color: '#0F172A' }}>{faq.question}</h3>
            <p style={{ fontSize: '14px', lineHeight: 1.6, color: '#4a5568' }}>{faq.answer}</p>
          </div>
        ))}
      </section>

      {/* Footer */}
      <footer className="py-10 px-6" style={{ borderTop: '1px solid #E2E8F0' }}>
        <div className="flex flex-col md:flex-row justify-between items-center gap-4" style={{ maxWidth: '1100px', margin: '0 auto' }}>
          <p className="text-sm" style={{ color: '#94A3B8' }}>&copy; {new Date().getFullYear()} Offerloop. All rights reserved.</p>
          <div className="flex gap-6">
            {[
              { label: 'About', path: '/about' },
              { label: 'Pricing', path: '/pricing' },
              { label: 'Privacy', path: '/privacy' },
              { label: 'Terms', path: '/terms-of-service' },
            ].map(link => (
              <Link key={link.path} to={link.path} className="text-sm" style={{ color: '#94A3B8' }}>{link.label}</Link>
            ))}
          </div>
        </div>
      </footer>
      <BeehiivPopup />
      <ExitIntentPopup />
    </div>
  );
};

export default SalaryPage;
