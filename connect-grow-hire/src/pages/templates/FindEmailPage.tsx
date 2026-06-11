import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import BeehiivPopup from '@/components/BeehiivPopup';
import offerloopLogo from '../../assets/offerloop_logo2.png';
import ExitIntentPopup from '@/components/ExitIntentPopup';
import SEOHead from '@/components/SEOHead';
import { generateMeta } from '@/utils/generateMeta';

interface FindEmailData {
  personType: string;
  slug: string;
  industry: string;
  emailFormats: string[];
  difficulty: string;
}

interface Props {
  data: FindEmailData;
}

function getFaqData(data: FindEmailData) {
  return [
    {
      question: `Is it legal to find a ${data.personType}'s email address?`,
      answer: `Yes, finding publicly available professional email addresses is legal. However, you should always use them responsibly and ethically. Avoid spamming, respect opt-out requests, and only reach out with genuine professional intent.`,
    },
    {
      question: `What is the best tool to find ${data.personType} emails?`,
      answer: `Offerloop combines multiple data sources to find verified professional emails. Unlike generic email finders, it is built specifically for professional networking and outreach, with verified contact data and built-in email drafting.`,
    },
    {
      question: `How accurate are email finder tools for ${data.personType} contacts?`,
      answer: `Accuracy varies by tool. Offerloop verifies emails before providing them to minimize bounce rates. In general, professional email addresses at established companies are more reliably found than personal emails or contacts at very small firms.`,
    },
    {
      question: `Should I use a ${data.personType}'s personal or work email?`,
      answer: `Always use their work email for professional outreach. Personal emails are private and reaching out to them feels invasive. Work emails signal professional intent and are much more likely to receive a response.`,
    },
  ];
}

const FindEmailPage = ({ data }: Props) => {
  const faqData = getFaqData(data);

  return (
    <div className="min-h-screen w-full" style={{ fontFamily: "'DM Sans', system-ui, sans-serif", background: '#FFFFFF' }}>
      <SEOHead {...generateMeta('find-email', { personType: data.personType })} ogType="article" />
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
        <p className="text-sm font-medium mb-4" style={{ color: '#3B82F6', letterSpacing: '0.02em' }}>FIND EMAIL</p>
        <h1 style={{ fontFamily: "'Lora', Georgia, serif", fontSize: 'clamp(36px, 5vw, 56px)', fontWeight: 400, lineHeight: 1.1, letterSpacing: '-0.025em', color: '#0F172A', marginBottom: '20px' }}>
          How to Find a <span style={{ color: '#3B82F6' }}>{data.personType}</span>&apos;s Email Address
        </h1>
        <p style={{ fontSize: '17px', lineHeight: 1.7, color: '#64748B', maxWidth: '620px' }}>
          A step-by-step guide to finding verified professional email addresses for {data.personType} contacts in {data.industry}.
        </p>
      </section>

      {/* Why It's Hard */}
      <section className="px-6 py-12" style={{ maxWidth: '800px', margin: '0 auto', borderTop: '1px solid #F1F5F9' }}>
        <h2 style={{ fontFamily: "'Lora', Georgia, serif", fontSize: '28px', fontWeight: 400, color: '#0F172A', marginBottom: '16px' }}>
          Why Finding {data.personType} Emails is Hard
        </h2>
        <p style={{ fontSize: '15px', lineHeight: 1.8, color: '#475569' }}>
          {data.difficulty}
        </p>
      </section>

      {/* 3 Ethical Methods */}
      <section className="px-6 py-12" style={{ maxWidth: '800px', margin: '0 auto', borderTop: '1px solid #F1F5F9' }}>
        <h2 style={{ fontFamily: "'Lora', Georgia, serif", fontSize: '28px', fontWeight: 400, color: '#0F172A', marginBottom: '20px' }}>
          3 Ethical Methods to Find Their Email
        </h2>
        <div className="space-y-4">
          {[
            { step: '1', title: 'LinkedIn Research', desc: `Start by identifying the person on LinkedIn. Look at their profile for contact info sections, published articles with email signatures, or mutual connections who might introduce you. Many professionals list their email directly.` },
            { step: '2', title: 'Company Website Patterns', desc: `Most companies use consistent email formats (e.g., firstname.lastname@company.com). Check the company's team page, press releases, or SEC filings for examples, then apply the same pattern to your target contact.` },
            { step: '3', title: 'Offerloop Contact Search', desc: `Use Offerloop to instantly find verified email addresses. Our database cross-references multiple sources to provide accurate, up-to-date professional emails along with contextual information about each contact.` },
          ].map((item) => (
            <div key={item.step} className="flex gap-4 rounded-[3px] p-5" style={{ background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
              <span className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold" style={{ background: '#3B82F6', color: '#FFFFFF' }}>{item.step}</span>
              <div>
                <p className="text-sm font-semibold mb-1" style={{ color: '#0F172A' }}>{item.title}</p>
                <p style={{ fontSize: '13px', lineHeight: 1.6, color: '#64748B' }}>{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Common Email Formats */}
      <section className="px-6 py-12" style={{ maxWidth: '800px', margin: '0 auto', borderTop: '1px solid #F1F5F9' }}>
        <h2 style={{ fontFamily: "'Lora', Georgia, serif", fontSize: '28px', fontWeight: 400, color: '#0F172A', marginBottom: '16px' }}>
          Common Email Formats
        </h2>
        <p style={{ fontSize: '15px', lineHeight: 1.8, color: '#475569', marginBottom: '16px' }}>
          Most companies use one of these standard formats. Try each with the company domain to find the right address:
        </p>
        <div className="space-y-2">
          {data.emailFormats.map((format, i) => (
            <div key={i} className="rounded-[3px] px-4 py-3" style={{ background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
              <code style={{ fontSize: '14px', color: '#334155', fontFamily: 'monospace' }}>{format}</code>
            </div>
          ))}
        </div>
      </section>

      {/* Cold Email Template */}
      <section className="px-6 py-12" style={{ maxWidth: '800px', margin: '0 auto', borderTop: '1px solid #F1F5F9' }}>
        <h2 style={{ fontFamily: "'Lora', Georgia, serif", fontSize: '28px', fontWeight: 400, color: '#0F172A', marginBottom: '16px' }}>
          What to Write Once You Find Their Email
        </h2>
        <div className="rounded-[3px] p-6" style={{ background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
          <p className="text-sm font-semibold mb-3" style={{ color: '#3B82F6' }}>Sample Outreach Email</p>
          <div style={{ fontSize: '14px', lineHeight: 1.8, color: '#334155' }}>
            <p style={{ marginBottom: '4px' }}><strong>Subject:</strong> Quick question about your experience at [Company]</p>
            <p style={{ marginBottom: '12px', color: '#94A3B8', fontSize: '13px' }}>___</p>
            <p style={{ marginBottom: '8px' }}>Hi [First Name],</p>
            <p style={{ marginBottom: '8px' }}>I'm a [year] at [University] interested in [industry/role]. I found your profile and was impressed by [specific detail about their background].</p>
            <p style={{ marginBottom: '8px' }}>Would you have 15 minutes for a quick call? I'd love to hear about your experience and any advice you might have for someone exploring this path.</p>
            <p>Best,<br />[Your Name]</p>
          </div>
        </div>
      </section>

      {/* Offerloop CTA */}
      <section className="px-6 py-12" style={{ maxWidth: '800px', margin: '0 auto', borderTop: '1px solid #F1F5F9' }}>
        <div className="rounded-[3px] p-6" style={{ background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
          <h3 className="text-base font-semibold mb-2" style={{ color: '#0F172A' }}>Find verified {data.personType} emails instantly</h3>
          <p style={{ fontSize: '14px', lineHeight: 1.6, color: '#64748B', marginBottom: '16px' }}>
            Stop guessing email formats. Offerloop finds and verifies professional emails so you can focus on writing great outreach.
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

export default FindEmailPage;
