import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import BeehiivPopup from '@/components/BeehiivPopup';
import offerloopLogo from '../../assets/offerloop_logo2.png';
import ExitIntentPopup from '@/components/ExitIntentPopup';
import SEOHead from '@/components/SEOHead';
import { generateMeta } from '@/utils/generateMeta';

interface RecruiterData {
  university: string;
  slug: string;
  topFirms: string[];
  recruitingCalendar: string;
  studentClubs: string[];
}

interface Props {
  data: RecruiterData;
}

function getFaqData(data: RecruiterData) {
  return [
    {
      question: `When does recruiting start at ${data.university}?`,
      answer: `Recruiting timelines vary by industry. Investment banking and consulting typically recruit in the fall of junior year, while tech recruiting happens on a rolling basis. Check with ${data.university}'s career services for industry-specific deadlines.`,
    },
    {
      question: `What student organizations should I join at ${data.university} for recruiting?`,
      answer: `Focus on finance clubs, consulting clubs, or industry-specific organizations that offer mentorship, case practice, and networking events. These clubs often have direct relationships with top firms and can provide warm introductions.`,
    },
    {
      question: `How do I connect with ${data.university} alumni at top firms?`,
      answer: `Use your university's alumni directory, LinkedIn, and tools like Offerloop to find and reach ${data.university} graduates at your target companies. Alumni are significantly more likely to respond to outreach from fellow students.`,
    },
    {
      question: `What makes ${data.university} students competitive for top firms?`,
      answer: `${data.university} students benefit from strong alumni networks, on-campus recruiting events, and access to competitive student organizations. Combining these advantages with proactive networking and strong interview preparation creates a compelling candidacy.`,
    },
  ];
}

const RecruiterPage = ({ data }: Props) => {
  const faqData = getFaqData(data);

  return (
    <div className="min-h-screen w-full" style={{ fontFamily: "'DM Sans', system-ui, sans-serif", background: '#FFFFFF' }}>
      <SEOHead {...generateMeta('recruiter', { university: data.university })} ogType="article" />
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
        <p className="text-sm font-medium mb-4" style={{ color: '#3B82F6', letterSpacing: '0.02em' }}>RECRUITING GUIDE</p>
        <h1 style={{ fontFamily: "'Lora', Georgia, serif", fontSize: 'clamp(36px, 5vw, 56px)', fontWeight: 400, lineHeight: 1.1, letterSpacing: '-0.025em', color: '#0F172A', marginBottom: '20px' }}>
          Recruiting at <span style={{ color: '#3B82F6' }}>{data.university}</span>
        </h1>
        <p style={{ fontSize: '17px', lineHeight: 1.7, color: '#64748B', maxWidth: '620px' }}>
          A complete guide to recruiting from {data.university}: top student organizations, recruiting timelines, and which firms hire most actively from campus.
        </p>
      </section>

      {/* Why University Produces Strong Candidates */}
      <section className="px-6 py-12" style={{ maxWidth: '800px', margin: '0 auto', borderTop: '1px solid #F1F5F9' }}>
        <h2 style={{ fontFamily: "'Lora', Georgia, serif", fontSize: '28px', fontWeight: 400, color: '#0F172A', marginBottom: '16px' }}>
          Why {data.university} Produces Strong Candidates
        </h2>
        <p style={{ fontSize: '15px', lineHeight: 1.8, color: '#475569' }}>
          {data.university} has built a reputation for producing well-rounded candidates who combine academic rigor with practical experience. The university's strong alumni network, competitive student organizations, and on-campus recruiting relationships give students a meaningful advantage in the recruiting process. Firms consistently return to {data.university} because graduates perform well and integrate quickly into fast-paced professional environments.
        </p>
      </section>

      {/* Top Student Organizations */}
      <section className="px-6 py-12" style={{ maxWidth: '800px', margin: '0 auto', borderTop: '1px solid #F1F5F9' }}>
        <h2 style={{ fontFamily: "'Lora', Georgia, serif", fontSize: '28px', fontWeight: 400, color: '#0F172A', marginBottom: '20px' }}>
          Top Student Organizations
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {data.studentClubs.map((club, i) => (
            <div key={i} className="rounded-[3px] p-4" style={{ background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
              <p className="text-sm font-semibold" style={{ color: '#0F172A' }}>{club}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Recruiting Timeline */}
      <section className="px-6 py-12" style={{ maxWidth: '800px', margin: '0 auto', borderTop: '1px solid #F1F5F9' }}>
        <h2 style={{ fontFamily: "'Lora', Georgia, serif", fontSize: '28px', fontWeight: 400, color: '#0F172A', marginBottom: '16px' }}>
          Recruiting Timeline &amp; Key Dates
        </h2>
        <p style={{ fontSize: '15px', lineHeight: 1.8, color: '#475569' }}>
          {data.recruitingCalendar}
        </p>
      </section>

      {/* Top Firms */}
      <section className="px-6 py-12" style={{ maxWidth: '800px', margin: '0 auto', borderTop: '1px solid #F1F5F9' }}>
        <h2 style={{ fontFamily: "'Lora', Georgia, serif", fontSize: '28px', fontWeight: 400, color: '#0F172A', marginBottom: '20px' }}>
          Top Firms Hiring from {data.university}
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {data.topFirms.map((firm, i) => {
            const firmSlug = firm.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
            return (
              <Link key={i} to={`/networking/${firmSlug}`} className="rounded-[3px] p-4" style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', textDecoration: 'none', display: 'block', transition: 'border-color 0.15s ease' }} onMouseEnter={e => (e.currentTarget.style.borderColor = '#3B82F6')} onMouseLeave={e => (e.currentTarget.style.borderColor = '#E2E8F0')}>
                <p className="text-sm font-semibold" style={{ color: '#0F172A' }}>{firm}</p>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Offerloop CTA */}
      <section className="px-6 py-12" style={{ maxWidth: '800px', margin: '0 auto', borderTop: '1px solid #F1F5F9' }}>
        <div className="rounded-[3px] p-6" style={{ background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
          <h3 className="text-base font-semibold mb-2" style={{ color: '#0F172A' }}>Find and reach {data.university} alumni</h3>
          <p style={{ fontSize: '14px', lineHeight: 1.6, color: '#64748B', marginBottom: '16px' }}>
            Offerloop helps you find alumni at your target firms, get their verified emails, and draft personalized outreach in seconds.
          </p>
          <Link to="/signin?mode=signup" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-[3px] text-white font-semibold text-sm" style={{ background: '#3B82F6' }}>
            Try Offerloop Free
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

export default RecruiterPage;
