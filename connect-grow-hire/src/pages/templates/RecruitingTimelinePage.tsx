import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import BeehiivPopup from '@/components/BeehiivPopup';
import offerloopLogo from '../../assets/offerloop_logo2.png';
import ExitIntentPopup from '@/components/ExitIntentPopup';
import SEOHead from '@/components/SEOHead';
import { generateMeta } from '@/utils/generateMeta';

interface TimelineData {
  industry: string;
  slug: string;
  milestones: { month: string; event: string; details: string }[];
}

interface Props {
  data: TimelineData;
}

function getFaqData(data: TimelineData) {
  return [
    {
      question: `When does ${data.industry} recruiting start?`,
      answer: `${data.industry} recruiting timelines vary, but most activity begins well before the actual start date. See the timeline above for specific months and key events. Starting your preparation early gives you a significant advantage.`,
    },
    {
      question: `Is it too late to start networking for ${data.industry}?`,
      answer: `It is rarely too late. While earlier is always better, firms continue to fill positions throughout the cycle. Even if you have missed the initial deadlines, networking can uncover off-cycle opportunities and prepare you for the next recruiting season.`,
    },
    {
      question: `How far in advance should I start preparing for ${data.industry} interviews?`,
      answer: `Ideally, begin interview preparation 2 to 3 months before your target interview dates. This gives you enough time to master technical skills, practice behavioral questions, and complete informational interviews that will inform your responses.`,
    },
    {
      question: `What happens if I miss a recruiting deadline in ${data.industry}?`,
      answer: `Missing a deadline is not the end. Many firms have rolling or off-cycle positions. Focus on networking with employees at your target firms, as internal referrals can sometimes bypass standard timelines. Also prepare for the next cycle so you are in a stronger position.`,
    },
  ];
}

const RecruitingTimelinePage = ({ data }: Props) => {
  const faqData = getFaqData(data);
  const currentMonth = new Date().toLocaleString('default', { month: 'long' });

  return (
    <div className="min-h-screen w-full" style={{ fontFamily: "'DM Sans', system-ui, sans-serif", background: '#FFFFFF' }}>
      <SEOHead {...generateMeta('recruiting-timeline', { industry: data.industry })} ogType="article" />
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
        <p className="text-sm font-medium mb-4" style={{ color: '#3B82F6', letterSpacing: '0.02em' }}>RECRUITING TIMELINE</p>
        <h1 style={{ fontFamily: "'Lora', Georgia, serif", fontSize: 'clamp(36px, 5vw, 56px)', fontWeight: 400, lineHeight: 1.1, letterSpacing: '-0.025em', color: '#0F172A', marginBottom: '20px' }}>
          <span style={{ color: '#3B82F6' }}>{data.industry}</span> Recruiting Timeline
        </h1>
        <p style={{ fontSize: '17px', lineHeight: 1.7, color: '#64748B', maxWidth: '620px' }}>
          A month-by-month breakdown of key recruiting events, deadlines, and action items for breaking into {data.industry}.
        </p>
      </section>

      {/* Visual Timeline */}
      <section className="px-6 py-12" style={{ maxWidth: '800px', margin: '0 auto', borderTop: '1px solid #F1F5F9' }}>
        <h2 style={{ fontFamily: "'Lora', Georgia, serif", fontSize: '28px', fontWeight: 400, color: '#0F172A', marginBottom: '24px' }}>
          Timeline Overview
        </h2>
        <div style={{ position: 'relative', paddingLeft: '32px' }}>
          {/* Vertical line */}
          <div style={{ position: 'absolute', left: '11px', top: '8px', bottom: '8px', width: '2px', background: '#E2E8F0' }} />
          {data.milestones.map((milestone, i) => {
            const isCurrentMonth = milestone.month.toLowerCase() === currentMonth.toLowerCase();
            return (
              <div key={i} style={{ position: 'relative', marginBottom: '28px' }}>
                {/* Dot */}
                <div style={{
                  position: 'absolute',
                  left: '-27px',
                  top: '6px',
                  width: '12px',
                  height: '12px',
                  borderRadius: '50%',
                  background: isCurrentMonth ? '#3B82F6' : '#E2E8F0',
                  border: isCurrentMonth ? '3px solid #BFDBFE' : '3px solid #F8FAFC',
                }} />
                <div style={{ paddingBottom: '4px' }}>
                  <p className="text-xs font-semibold" style={{ color: isCurrentMonth ? '#3B82F6' : '#94A3B8', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{milestone.month}</p>
                  <p className="text-sm font-semibold" style={{ color: '#0F172A', marginBottom: '4px' }}>{milestone.event}</p>
                  <p style={{ fontSize: '13px', lineHeight: 1.6, color: '#64748B' }}>{milestone.details}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Key Dates Table */}
      <section className="px-6 py-12" style={{ maxWidth: '800px', margin: '0 auto', borderTop: '1px solid #F1F5F9' }}>
        <h2 style={{ fontFamily: "'Lora', Georgia, serif", fontSize: '28px', fontWeight: 400, color: '#0F172A', marginBottom: '20px' }}>
          Key Dates at a Glance
        </h2>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
            <thead>
              <tr style={{ background: '#F8FAFC' }}>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: '#0F172A', borderBottom: '1px solid #E2E8F0' }}>Month</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: '#0F172A', borderBottom: '1px solid #E2E8F0' }}>Event</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: '#0F172A', borderBottom: '1px solid #E2E8F0' }}>Details</th>
              </tr>
            </thead>
            <tbody>
              {data.milestones.map((milestone, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #E2E8F0' }}>
                  <td style={{ padding: '12px 16px', color: '#0F172A', fontWeight: 500 }}>{milestone.month}</td>
                  <td style={{ padding: '12px 16px', color: '#475569' }}>{milestone.event}</td>
                  <td style={{ padding: '12px 16px', color: '#475569' }}>{milestone.details}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* What to Do Each Month */}
      <section className="px-6 py-12" style={{ maxWidth: '800px', margin: '0 auto', borderTop: '1px solid #F1F5F9' }}>
        <h2 style={{ fontFamily: "'Lora', Georgia, serif", fontSize: '28px', fontWeight: 400, color: '#0F172A', marginBottom: '16px' }}>
          What to Do Each Month
        </h2>
        <p style={{ fontSize: '15px', lineHeight: 1.8, color: '#475569', marginBottom: '16px' }}>
          Regardless of where you are in the timeline, focus on these monthly priorities: build your network through 3 to 5 new outreach emails per week, stay current on industry news, practice technical skills consistently, and maintain relationships with contacts you have already made. The students who land top offers treat recruiting as a sustained effort, not a last-minute sprint.
        </p>
      </section>

      {/* CTA */}
      <section className="px-6 py-20" style={{ background: '#FAFBFF' }}>
        <div className="text-center" style={{ maxWidth: '560px', margin: '0 auto' }}>
          <h2 style={{ fontFamily: "'Lora', Georgia, serif", fontSize: 'clamp(28px, 4vw, 40px)', fontWeight: 400, lineHeight: 1.15, color: '#0F172A', marginBottom: '16px' }}>
            Start your outreach at the right time
          </h2>
          <p style={{ fontSize: '15px', color: '#64748B', marginBottom: '28px' }}>
            Offerloop helps you find contacts, draft emails, and build relationships on the right timeline for {data.industry} recruiting.
          </p>
          <Link
            to="/signin?mode=signup"
            className="inline-flex items-center gap-2 px-7 py-3.5 rounded-[3px] text-white font-semibold text-base hover:shadow-lg transition-all"
            style={{ background: '#3B82F6' }}
          >
            Get started free
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

export default RecruitingTimelinePage;
