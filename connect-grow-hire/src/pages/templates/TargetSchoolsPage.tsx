import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import BeehiivPopup from '@/components/BeehiivPopup';
import offerloopLogo from '../../assets/offerloop_logo2.png';
import ExitIntentPopup from '@/components/ExitIntentPopup';
import SEOHead from '@/components/SEOHead';
import { generateMeta } from '@/utils/generateMeta';

interface TargetSchoolData {
  name: string;
  slug: string;
  industry: string;
  targetSchools: string[];
  gpaExpectation: string;
  nonTargetAdvice: string;
}

interface Props {
  data: TargetSchoolData;
}

function getFaqData(data: TargetSchoolData) {
  return [
    {
      question: `What are target schools for ${data.name}?`,
      answer: `Target schools are universities where ${data.name} actively recruits on campus, sends recruiters for information sessions, and has a structured pipeline for hiring. Students at these schools often have direct access to resume drops and interview slots.`,
    },
    {
      question: `Can I get into ${data.name} from a non-target school?`,
      answer: `Yes, but it requires more proactive networking. Students from non-target schools should focus on building relationships with ${data.name} employees through cold outreach, attending open events, and leveraging alumni connections wherever possible.`,
    },
    {
      question: `Does ${data.name} only hire from target schools?`,
      answer: `No. While a significant portion of hires come from target schools, ${data.name} also recruits from a wide range of universities. Strong candidates from any background can break in with the right preparation, networking, and interview performance.`,
    },
    {
      question: `How important is GPA for getting into ${data.name}?`,
      answer: `${data.gpaExpectation} That said, GPA is just one factor. Relevant experience, leadership, and strong networking can offset a lower GPA, especially if you demonstrate genuine interest and industry knowledge during the recruiting process.`,
    },
  ];
}

const TargetSchoolsPage = ({ data }: Props) => {
  const faqData = getFaqData(data);

  return (
    <div className="min-h-screen w-full" style={{ fontFamily: "'DM Sans', system-ui, sans-serif", background: '#FFFFFF' }}>
      <SEOHead {...generateMeta('target-schools', { company: data.name })} ogType="article" />
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
        <p className="text-sm font-medium mb-4" style={{ color: '#3B82F6', letterSpacing: '0.02em' }}>TARGET SCHOOLS</p>
        <h1 style={{ fontFamily: "'Lora', Georgia, serif", fontSize: 'clamp(36px, 5vw, 56px)', fontWeight: 400, lineHeight: 1.1, letterSpacing: '-0.025em', color: '#0F172A', marginBottom: '20px' }}>
          Target Schools for <span style={{ color: '#3B82F6' }}>{data.name}</span>
        </h1>
        <p style={{ fontSize: '17px', lineHeight: 1.7, color: '#64748B', maxWidth: '620px' }}>
          Which universities does {data.name} recruit from most actively? Here is the full list of target schools, GPA expectations, and advice for non-target students.
        </p>
      </section>

      {/* Target School Grid */}
      <section className="px-6 py-12" style={{ maxWidth: '800px', margin: '0 auto', borderTop: '1px solid #F1F5F9' }}>
        <h2 style={{ fontFamily: "'Lora', Georgia, serif", fontSize: '28px', fontWeight: 400, color: '#0F172A', marginBottom: '20px' }}>
          {data.name} Target School List
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {data.targetSchools.map((school, i) => (
            <div key={i} className="rounded-[3px] p-4" style={{ background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
              <p className="text-sm font-semibold" style={{ color: '#0F172A' }}>{school}</p>
            </div>
          ))}
        </div>
      </section>

      {/* GPA & Background */}
      <section className="px-6 py-12" style={{ maxWidth: '800px', margin: '0 auto', borderTop: '1px solid #F1F5F9' }}>
        <h2 style={{ fontFamily: "'Lora', Georgia, serif", fontSize: '28px', fontWeight: 400, color: '#0F172A', marginBottom: '16px' }}>
          GPA &amp; Background Expectations
        </h2>
        <p style={{ fontSize: '15px', lineHeight: 1.8, color: '#475569' }}>
          {data.gpaExpectation}
        </p>
      </section>

      {/* Non-Target Advice */}
      <section className="px-6 py-12" style={{ maxWidth: '800px', margin: '0 auto', borderTop: '1px solid #F1F5F9' }}>
        <h2 style={{ fontFamily: "'Lora', Georgia, serif", fontSize: '28px', fontWeight: 400, color: '#0F172A', marginBottom: '16px' }}>
          Advice for Non-Target Students
        </h2>
        <p style={{ fontSize: '15px', lineHeight: 1.8, color: '#475569' }}>
          {data.nonTargetAdvice}
        </p>
      </section>

      {/* Cold Email CTA */}
      <section className="px-6 py-12" style={{ maxWidth: '800px', margin: '0 auto', borderTop: '1px solid #F1F5F9' }}>
        <div className="rounded-[3px] p-6" style={{ background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
          <h3 className="text-base font-semibold mb-2" style={{ color: '#0F172A' }}>Ready to reach out to {data.name} employees?</h3>
          <p style={{ fontSize: '14px', lineHeight: 1.6, color: '#64748B', marginBottom: '16px' }}>
            Whether you attend a target school or not, cold outreach is the most effective way to build connections at {data.name}.
          </p>
          <Link to={`/cold-email/${data.industry}`} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-[3px] text-white font-semibold text-sm" style={{ background: '#3B82F6' }}>
            View Cold Email Guide
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

      {/* CTA */}
      <section className="px-6 py-20" style={{ background: '#FAFBFF' }}>
        <div className="text-center" style={{ maxWidth: '560px', margin: '0 auto' }}>
          <h2 style={{ fontFamily: "'Lora', Georgia, serif", fontSize: 'clamp(28px, 4vw, 40px)', fontWeight: 400, lineHeight: 1.15, color: '#0F172A', marginBottom: '16px' }}>
            Skip the manual work
          </h2>
          <p style={{ fontSize: '15px', color: '#64748B', marginBottom: '28px' }}>
            Find {data.name} employees, get verified emails, and generate personalized outreach in seconds.
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

export default TargetSchoolsPage;
