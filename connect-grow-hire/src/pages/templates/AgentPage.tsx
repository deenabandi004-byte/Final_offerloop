import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import BeehiivPopup from '@/components/BeehiivPopup';
import offerloopLogo from '../../assets/offerloop_logo2.png';
import ExitIntentPopup from '@/components/ExitIntentPopup';
import SEOHead from '@/components/SEOHead';
import { generateMeta } from '@/utils/generateMeta';

interface AgentData {
  outreachType: string;
  slug: string;
  steps: string[];
  timeSaved: string;
  exampleGoal: string;
  exampleResult: string;
}

interface Props {
  data: AgentData;
}

function getFaqData(data: AgentData) {
  return [
    {
      question: `How does the AI agent automate ${data.outreachType}?`,
      answer: `The agent handles the repetitive parts of ${data.outreachType}: finding contacts, researching their backgrounds, personalizing messages, and managing follow-ups. You set the goal and review the output, while the AI does the heavy lifting.`,
    },
    {
      question: `Is automated ${data.outreachType} effective?`,
      answer: `Yes, when done correctly. The key is personalization. Unlike mass email tools, Offerloop's agent researches each contact individually and crafts messages that feel genuinely personal. Response rates are comparable to or better than fully manual outreach because the quality stays high while volume increases.`,
    },
    {
      question: `Can I customize the agent's ${data.outreachType} approach?`,
      answer: `Absolutely. You control the tone, the targeting criteria, and the messaging strategy. The agent adapts to your preferences and learns from your feedback to improve over time.`,
    },
    {
      question: `How much time does the ${data.outreachType} agent save?`,
      answer: `${data.timeSaved}. Most students spend hours each week on manual outreach. The agent compresses that work into minutes while maintaining the same quality and personalization.`,
    },
  ];
}

const AgentPage = ({ data }: Props) => {
  const faqData = getFaqData(data);

  return (
    <div className="min-h-screen w-full" style={{ fontFamily: "'DM Sans', system-ui, sans-serif", background: '#FFFFFF' }}>
      <SEOHead {...generateMeta('automate', { outreachType: data.outreachType })} ogType="article" />
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
        <p className="text-sm font-medium mb-4" style={{ color: '#3B82F6', letterSpacing: '0.02em' }}>AI AGENT</p>
        <h1 style={{ fontFamily: "'Lora', Georgia, serif", fontSize: 'clamp(36px, 5vw, 56px)', fontWeight: 400, lineHeight: 1.1, letterSpacing: '-0.025em', color: '#0F172A', marginBottom: '20px' }}>
          Automate <span style={{ color: '#3B82F6' }}>{data.outreachType}</span> with AI
        </h1>
        <p style={{ fontSize: '17px', lineHeight: 1.7, color: '#64748B', maxWidth: '620px' }}>
          Let Offerloop's AI agent handle the repetitive work of {data.outreachType} so you can focus on building genuine relationships.
        </p>
      </section>

      {/* What the Agent Does */}
      <section className="px-6 py-12" style={{ maxWidth: '800px', margin: '0 auto', borderTop: '1px solid #F1F5F9' }}>
        <h2 style={{ fontFamily: "'Lora', Georgia, serif", fontSize: '28px', fontWeight: 400, color: '#0F172A', marginBottom: '20px' }}>
          What the Agent Does
        </h2>
        <div className="space-y-3">
          {data.steps.map((step, i) => (
            <div key={i} className="flex gap-4 rounded-[3px] p-5" style={{ background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
              <span className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold" style={{ background: '#3B82F6', color: '#FFFFFF' }}>{i + 1}</span>
              <div className="flex items-center">
                <p className="text-sm" style={{ color: '#334155', lineHeight: 1.6 }}>{step}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Time Saved */}
      <section className="px-6 py-12" style={{ maxWidth: '800px', margin: '0 auto', borderTop: '1px solid #F1F5F9' }}>
        <h2 style={{ fontFamily: "'Lora', Georgia, serif", fontSize: '28px', fontWeight: 400, color: '#0F172A', marginBottom: '20px' }}>
          Time Saved
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="rounded-[3px] p-5" style={{ background: '#FFF7ED', border: '1px solid #FED7AA' }}>
            <p className="text-xs font-semibold mb-2" style={{ color: '#9A3412', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Manual Approach</p>
            <p style={{ fontSize: '14px', lineHeight: 1.6, color: '#78350F' }}>Hours of research, writing, and follow-up for each contact. Most students manage 3 to 5 quality outreach emails per week.</p>
          </div>
          <div className="rounded-[3px] p-5" style={{ background: '#F0FDF4', border: '1px solid #BBF7D0' }}>
            <p className="text-xs font-semibold mb-2" style={{ color: '#166534', textTransform: 'uppercase', letterSpacing: '0.05em' }}>With Offerloop Agent</p>
            <p style={{ fontSize: '14px', lineHeight: 1.6, color: '#14532D' }}>{data.timeSaved}</p>
          </div>
        </div>
      </section>

      {/* Example: Goal → Result */}
      <section className="px-6 py-12" style={{ maxWidth: '800px', margin: '0 auto', borderTop: '1px solid #F1F5F9' }}>
        <h2 style={{ fontFamily: "'Lora', Georgia, serif", fontSize: '28px', fontWeight: 400, color: '#0F172A', marginBottom: '20px' }}>
          Example: Goal → Result
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="rounded-[3px] p-5" style={{ background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
            <p className="text-xs font-semibold mb-2" style={{ color: '#3B82F6', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Goal</p>
            <p style={{ fontSize: '14px', lineHeight: 1.6, color: '#334155' }}>{data.exampleGoal}</p>
          </div>
          <div className="rounded-[3px] p-5" style={{ background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
            <p className="text-xs font-semibold mb-2" style={{ color: '#3B82F6', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Result</p>
            <p style={{ fontSize: '14px', lineHeight: 1.6, color: '#334155' }}>{data.exampleResult}</p>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="px-6 py-12" style={{ maxWidth: '800px', margin: '0 auto', borderTop: '1px solid #F1F5F9' }}>
        <h2 style={{ fontFamily: "'Lora', Georgia, serif", fontSize: '28px', fontWeight: 400, color: '#0F172A', marginBottom: '16px' }}>
          How It Works
        </h2>
        <p style={{ fontSize: '15px', lineHeight: 1.8, color: '#475569' }}>
          The Offerloop agent uses AI to research each contact's background, identify common ground, and craft personalized messages that feel human. It pulls from LinkedIn profiles, company news, and your own resume to create outreach that references specific shared experiences. You review and approve each message before it sends, so you stay in control while the agent handles the time-consuming research and drafting.
        </p>
      </section>

      {/* Big CTA */}
      <section className="px-6 py-20" style={{ background: '#FAFBFF' }}>
        <div className="text-center" style={{ maxWidth: '560px', margin: '0 auto' }}>
          <h2 style={{ fontFamily: "'Lora', Georgia, serif", fontSize: 'clamp(28px, 4vw, 40px)', fontWeight: 400, lineHeight: 1.15, color: '#0F172A', marginBottom: '16px' }}>
            Try Offerloop&apos;s AI Agent
          </h2>
          <p style={{ fontSize: '15px', color: '#64748B', marginBottom: '28px' }}>
            Automate your {data.outreachType} without sacrificing personalization. Start building meaningful connections faster.
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

export default AgentPage;
