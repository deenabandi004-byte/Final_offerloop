import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import type { Company } from '@/data/companies';

interface Props {
  companyA: Company;
  companyB: Company;
}

const industryLabels: Record<string, string> = {
  'consulting': 'Management Consulting',
  'investment-banking': 'Investment Banking',
  'private-equity': 'Private Equity',
  'tech': 'Technology',
  'finance': 'Finance',
  'venture-capital': 'Venture Capital',
};

function getRecruitingStyle(company: Company): string {
  if (company.recruits_from.includes('non-target')) return 'Broad recruiting from target, semi-target, and non-target schools';
  if (company.recruits_from.includes('semi-target')) return 'Selective recruiting from target and semi-target schools';
  return 'Highly selective, primarily target schools only';
}

function getWhoToTarget(company: Company): string {
  return `Junior employees (1-3 years) in ${company.divisions.slice(0, 2).join(' or ')}, especially alumni from your school`;
}

function getColdEmailTone(company: Company): string {
  const tones: Record<string, string> = {
    'consulting': 'Structured, concise, show analytical thinking',
    'investment-banking': 'Extremely brief, reference deals or groups, show hustle',
    'private-equity': 'Demonstrate deal knowledge, reference IB background',
    'tech': 'Show technical curiosity, reference specific products or teams',
    'finance': 'Quantitative, precise, reference market knowledge',
    'venture-capital': 'Show market insight, reference portfolio companies',
  };
  return tones[company.industry] || 'Professional, concise, personalized';
}

function getInterviewFormat(company: Company): string {
  const formats: Record<string, string> = {
    'consulting': 'Case interviews + behavioral fit',
    'investment-banking': 'Technical finance + behavioral + modeling',
    'private-equity': 'LBO modeling + case studies + deal walk-throughs',
    'tech': 'Coding interviews + system design + behavioral',
    'finance': 'Quantitative + probability + market questions',
    'venture-capital': 'Investment thesis + market analysis + sourcing',
  };
  return formats[company.industry] || 'Behavioral + technical';
}

function getPrestigeLevel(company: Company): string {
  if (company.recruits_from.length === 1 && company.recruits_from[0] === 'target') return 'Very high -- recruits exclusively from top schools';
  if (!company.recruits_from.includes('non-target')) return 'High -- selective recruiting from top programs';
  return 'Established -- broad recruiting, strong brand recognition';
}

function getFaqData(a: Company, b: Company) {
  return [
    {
      question: `Is it harder to get into ${a.name} or ${b.name}?`,
      answer: `Both ${a.name} and ${b.name} are highly competitive. ${a.name} recruits from ${a.recruits_from.join(', ')} schools, while ${b.name} recruits from ${b.recruits_from.join(', ')} schools. The difficulty depends on your background, target division, and the strength of your networking. Students who build relationships with employees at either firm have a significant advantage over those who rely solely on online applications.`,
    },
    {
      question: `Should I network at ${a.name} and ${b.name} at the same time?`,
      answer: `Yes, networking at both firms simultaneously is a common and recommended strategy. Most students target 3 to 5 companies during a recruiting cycle. Just make sure you are genuinely interested in both and can articulate specific reasons for each. Employees can tell when someone is going through the motions, so keep your outreach authentic and personalized to each firm.`,
    },
    {
      question: `What is the biggest culture difference between ${a.name} and ${b.name}?`,
      answer: `${a.name} is known for being ${a.culture}, while ${b.name} is known for being ${b.culture}. These cultural differences affect everything from day-to-day work to the recruiting process. Coffee chats with employees at both firms will give you the best sense of which environment fits your working style and career goals.`,
    },
    {
      question: `Can I use the same cold email template for ${a.name} and ${b.name}?`,
      answer: `You should not use identical emails. While the structure can be similar, the content should reference each company specifically -- mention the division, recent news, or a specific aspect of their culture. Personalization is what separates emails that get responses from those that get ignored. Offerloop generates unique AI-personalized emails for each contact based on their individual background.`,
    },
    {
      question: `How do I decide between an offer from ${a.name} and ${b.name}?`,
      answer: `If you are lucky enough to have offers from both, focus on three factors: the specific team and people you would work with, the long-term career trajectory each firm offers, and which culture aligns better with your working style. Talk to as many current employees as possible at both firms before making your decision. The brand name matters less than the day-to-day experience and exit opportunities.`,
    },
  ];
}

const CompanyComparison = ({ companyA, companyB }: Props) => {
  const a = companyA;
  const b = companyB;
  const faqData = getFaqData(a, b);
  const industryA = industryLabels[a.industry] || a.industry;
  const industryB = industryLabels[b.industry] || b.industry;

  const comparisonRows = [
    { label: 'Industry', valueA: industryA, valueB: industryB },
    { label: 'Culture', valueA: a.culture, valueB: b.culture },
    { label: 'Recruiting Style', valueA: getRecruitingStyle(a), valueB: getRecruitingStyle(b) },
    { label: 'Who to Target', valueA: getWhoToTarget(a), valueB: getWhoToTarget(b) },
    { label: 'Cold Email Tone', valueA: getColdEmailTone(a), valueB: getColdEmailTone(b) },
    { label: 'Interview Format', valueA: getInterviewFormat(a), valueB: getInterviewFormat(b) },
    { label: 'Prestige Level', valueA: getPrestigeLevel(a), valueB: getPrestigeLevel(b) },
  ];

  return (
    <div className="min-h-screen w-full" style={{ fontFamily: "'DM Sans', system-ui, sans-serif", background: '#FFFFFF' }}>
      <Helmet>
        <title>{a.name} vs {b.name} for Students | Networking and Recruiting Comparison | Offerloop</title>
        <meta name="description" content={`Compare networking at ${a.name} vs ${b.name}. Recruiting timelines, culture, cold email strategies, and coffee chat tips for college students.`} />
        <link rel="canonical" href={`https://offerloop.ai/compare/${a.slug}-vs-${b.slug}`} />
        <meta property="og:title" content={`${a.name} vs ${b.name} for Students | Networking and Recruiting Comparison | Offerloop`} />
        <meta property="og:description" content={`Compare networking at ${a.name} vs ${b.name}. Recruiting timelines, culture, cold email strategies, and coffee chat tips for college students.`} />
        <meta property="og:url" content={`https://offerloop.ai/compare/${a.slug}-vs-${b.slug}`} />
        <meta property="og:type" content="article" />
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
        <Link to="/" className="text-xl font-bold" style={{ color: '#0F172A', letterSpacing: '-0.02em' }}>Offerloop</Link>
        <Link to="/signin?mode=signup" className="px-5 py-2.5 rounded-[3px] text-sm font-semibold text-white" style={{ background: '#3B82F6' }}>
          Get Started Free
        </Link>
      </nav>

      {/* Hero */}
      <section className="px-6 pt-16 pb-12" style={{ maxWidth: '800px', margin: '0 auto' }}>
        <p className="text-sm font-medium mb-4" style={{ color: '#3B82F6', letterSpacing: '0.02em' }}>COMPANY COMPARISON</p>
        <h1 style={{ fontFamily: "'Lora', Georgia, serif", fontSize: 'clamp(36px, 5vw, 56px)', fontWeight: 400, lineHeight: 1.1, letterSpacing: '-0.025em', color: '#0F172A', marginBottom: '20px' }}>
          <span style={{ color: '#3B82F6' }}>{a.name}</span> vs <span style={{ color: '#3B82F6' }}>{b.name}</span> -- Networking and Recruiting Guide for Students
        </h1>
        <p style={{ fontSize: '17px', lineHeight: 1.7, color: '#64748B', maxWidth: '620px' }}>
          A side-by-side comparison for college students deciding where to focus their networking energy
        </p>
      </section>

      {/* Comparison Table */}
      <section className="px-6 pb-8" style={{ maxWidth: '800px', margin: '0 auto' }}>
        <div className="rounded-[3px] overflow-hidden" style={{ border: '1px solid #E2E8F0' }}>
          {/* Header */}
          <div className="grid grid-cols-3" style={{ background: '#FAFBFF' }}>
            <div className="p-4">
              <p className="text-xs font-medium" style={{ color: '#94A3B8' }}>Category</p>
            </div>
            <div className="p-4" style={{ borderLeft: '1px solid #E2E8F0' }}>
              <p className="text-sm font-semibold" style={{ color: '#3B82F6' }}>{a.name}</p>
            </div>
            <div className="p-4" style={{ borderLeft: '1px solid #E2E8F0' }}>
              <p className="text-sm font-semibold" style={{ color: '#3B82F6' }}>{b.name}</p>
            </div>
          </div>
          {/* Rows */}
          {comparisonRows.map((row, i) => (
            <div key={i} className="grid grid-cols-3" style={{ borderTop: '1px solid #F1F5F9' }}>
              <div className="p-4">
                <p className="text-sm font-semibold" style={{ color: '#0F172A' }}>{row.label}</p>
              </div>
              <div className="p-4" style={{ borderLeft: '1px solid #F1F5F9' }}>
                <p className="text-sm capitalize" style={{ color: '#475569', lineHeight: 1.5 }}>{row.valueA}</p>
              </div>
              <div className="p-4" style={{ borderLeft: '1px solid #F1F5F9' }}>
                <p className="text-sm capitalize" style={{ color: '#475569', lineHeight: 1.5 }}>{row.valueB}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Networking at Company A */}
      <section className="px-6 py-12" style={{ maxWidth: '800px', margin: '0 auto', borderTop: '1px solid #F1F5F9' }}>
        <h2 style={{ fontFamily: "'Lora', Georgia, serif", fontSize: '28px', fontWeight: 400, color: '#0F172A', marginBottom: '16px' }}>
          Networking at {a.name}
        </h2>
        <p style={{ fontSize: '15px', lineHeight: 1.8, color: '#475569', marginBottom: '16px' }}>
          {a.name} is known for being {a.culture}. The firm operates across {a.divisions.join(', ')}, and networking with employees in your target division is critical for understanding the specific culture and expectations of each group. {a.name} {a.recruits_from.includes('non-target') ? 'recruits broadly from target, semi-target, and non-target schools' : a.recruits_from.includes('semi-target') ? 'recruits from target and semi-target schools' : 'recruits primarily from target schools'}, so having internal connections can be especially valuable for standing out.
        </p>
        <p style={{ fontSize: '15px', lineHeight: 1.8, color: '#475569' }}>
          The best approach to networking at {a.name} is to start with junior employees who share a connection with you, such as alumni from your university. Focus on building genuine relationships through coffee chats rather than jumping straight to referral requests. {a.name} employees tend to respond well to outreach that is {a.industry === 'consulting' ? 'structured and shows clear thinking' : a.industry === 'investment-banking' ? 'brief, specific, and references their group or recent deals' : a.industry === 'tech' ? 'genuine, references specific products or teams, and shows technical curiosity' : 'thoughtful, specific, and demonstrates knowledge of their work'}.
        </p>
      </section>

      {/* Networking at Company B */}
      <section className="px-6 py-12" style={{ maxWidth: '800px', margin: '0 auto', borderTop: '1px solid #F1F5F9' }}>
        <h2 style={{ fontFamily: "'Lora', Georgia, serif", fontSize: '28px', fontWeight: 400, color: '#0F172A', marginBottom: '16px' }}>
          Networking at {b.name}
        </h2>
        <p style={{ fontSize: '15px', lineHeight: 1.8, color: '#475569', marginBottom: '16px' }}>
          {b.name} is known for being {b.culture}. The firm's key divisions include {b.divisions.join(', ')}. Understanding which division you are targeting will help you identify the right people to reach out to and tailor your outreach accordingly. {b.name} {b.recruits_from.includes('non-target') ? 'has a broad recruiting footprint across target, semi-target, and non-target schools' : b.recruits_from.includes('semi-target') ? 'recruits from target and semi-target programs' : 'is highly selective, recruiting primarily from target schools'}.
        </p>
        <p style={{ fontSize: '15px', lineHeight: 1.8, color: '#475569' }}>
          When networking at {b.name}, focus on what makes the firm distinct from its competitors. Employees appreciate when students demonstrate genuine interest in {b.name} specifically, not just the industry in general. Reference the firm's culture, a recent initiative, or a specific aspect of the division you are targeting. This level of specificity signals that you have done your homework and are not sending the same message to every firm.
        </p>
      </section>

      {/* Which Should You Target First? */}
      <section className="px-6 py-12" style={{ maxWidth: '800px', margin: '0 auto', borderTop: '1px solid #F1F5F9' }}>
        <h2 style={{ fontFamily: "'Lora', Georgia, serif", fontSize: '28px', fontWeight: 400, color: '#0F172A', marginBottom: '16px' }}>
          Which Should You Target First?
        </h2>
        <p style={{ fontSize: '15px', lineHeight: 1.8, color: '#475569', marginBottom: '16px' }}>
          The answer depends on your background, interests, and where you are in the recruiting cycle. Here is a simple framework:
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          <div className="rounded-[3px] p-5" style={{ border: '1px solid #E2E8F0', background: '#FAFBFF' }}>
            <p className="text-sm font-semibold mb-3" style={{ color: '#3B82F6' }}>Choose {a.name} first if:</p>
            <ul className="space-y-2">
              <li className="text-sm" style={{ color: '#475569', lineHeight: 1.6 }}>You are drawn to a culture that is {a.culture.split(', ').slice(0, 2).join(' and ')}</li>
              <li className="text-sm" style={{ color: '#475569', lineHeight: 1.6 }}>You have alumni connections at {a.name}</li>
              <li className="text-sm" style={{ color: '#475569', lineHeight: 1.6 }}>You are interested in {a.divisions[0]} specifically</li>
            </ul>
          </div>
          <div className="rounded-[3px] p-5" style={{ border: '1px solid #E2E8F0', background: '#FAFBFF' }}>
            <p className="text-sm font-semibold mb-3" style={{ color: '#3B82F6' }}>Choose {b.name} first if:</p>
            <ul className="space-y-2">
              <li className="text-sm" style={{ color: '#475569', lineHeight: 1.6 }}>You prefer a culture that is {b.culture.split(', ').slice(0, 2).join(' and ')}</li>
              <li className="text-sm" style={{ color: '#475569', lineHeight: 1.6 }}>You have alumni connections at {b.name}</li>
              <li className="text-sm" style={{ color: '#475569', lineHeight: 1.6 }}>You are interested in {b.divisions[0]} specifically</li>
            </ul>
          </div>
        </div>
        <p style={{ fontSize: '15px', lineHeight: 1.8, color: '#475569' }}>
          In practice, most students network at both firms simultaneously. The key is to keep your outreach personalized to each company. Do not copy and paste the same email. Employees at {a.name} and {b.name} talk to many students, and generic outreach will not stand out at either firm.
        </p>
      </section>

      {/* Cold Email Templates for Both */}
      <section className="px-6 py-12" style={{ maxWidth: '800px', margin: '0 auto', borderTop: '1px solid #F1F5F9' }}>
        <h2 style={{ fontFamily: "'Lora', Georgia, serif", fontSize: '28px', fontWeight: 400, color: '#0F172A', marginBottom: '20px' }}>
          Cold Email Templates for Both
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="rounded-[3px] p-6" style={{ background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
            <p className="text-sm font-semibold mb-3" style={{ color: '#3B82F6' }}>Email to {a.name}</p>
            <div style={{ fontSize: '13px', lineHeight: 1.7, color: '#334155' }}>
              <p style={{ marginBottom: '4px' }}><strong>Subject:</strong> [University] student, question about {a.name}'s {a.divisions[0]}</p>
              <p style={{ marginBottom: '10px', color: '#94A3B8', fontSize: '12px' }}>___</p>
              <p style={{ marginBottom: '6px' }}>Hi [First Name],</p>
              <p style={{ marginBottom: '6px' }}>
                I'm a [year] at [University] studying [major]. I came across your profile and was interested in your work in {a.name}'s {a.divisions[0]} group.
              </p>
              <p style={{ marginBottom: '6px' }}>
                I'm drawn to {a.name} because of its reputation for being {a.culture.split(', ')[0]}, and I'd love to hear your perspective on the team and the recruiting process.
              </p>
              <p style={{ marginBottom: '6px' }}>Would you have 15 minutes for a quick call?</p>
              <p>Best,<br />[Your Name]</p>
            </div>
          </div>
          <div className="rounded-[3px] p-6" style={{ background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
            <p className="text-sm font-semibold mb-3" style={{ color: '#3B82F6' }}>Email to {b.name}</p>
            <div style={{ fontSize: '13px', lineHeight: 1.7, color: '#334155' }}>
              <p style={{ marginBottom: '4px' }}><strong>Subject:</strong> [University] student, question about {b.name}'s {b.divisions[0]}</p>
              <p style={{ marginBottom: '10px', color: '#94A3B8', fontSize: '12px' }}>___</p>
              <p style={{ marginBottom: '6px' }}>Hi [First Name],</p>
              <p style={{ marginBottom: '6px' }}>
                I'm a [year] at [University] studying [major]. I noticed you work in {b.name}'s {b.divisions[0]} group and wanted to reach out.
              </p>
              <p style={{ marginBottom: '6px' }}>
                I'm particularly interested in {b.name} because of its {b.culture.split(', ')[0]} culture, and I'd value hearing about your experience on the team.
              </p>
              <p style={{ marginBottom: '6px' }}>Would you have 15 minutes for a quick call?</p>
              <p>Best,<br />[Your Name]</p>
            </div>
          </div>
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

      {/* Related Resources */}
      <section className="px-6 py-16" style={{ maxWidth: '800px', margin: '0 auto', borderTop: '1px solid #F1F5F9' }}>
        <h2 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '24px', color: '#0F172A' }}>Related Resources</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Link to={`/networking/${a.slug}`} style={{ display: 'block', padding: '20px', borderRadius: '12px', border: '1px solid #E2E8F0', background: '#fff', textDecoration: 'none', transition: 'border-color 0.15s ease' }} onMouseEnter={e => (e.currentTarget.style.borderColor = '#3B82F6')} onMouseLeave={e => (e.currentTarget.style.borderColor = '#E2E8F0')}>
            <p style={{ fontSize: '14px', fontWeight: 600, color: '#0F172A', marginBottom: '6px' }}>{a.name} Networking Guide</p>
            <p style={{ fontSize: '13px', color: '#64748B', lineHeight: 1.5 }}>Full networking playbook for {a.name}.</p>
          </Link>
          <Link to={`/networking/${b.slug}`} style={{ display: 'block', padding: '20px', borderRadius: '12px', border: '1px solid #E2E8F0', background: '#fff', textDecoration: 'none', transition: 'border-color 0.15s ease' }} onMouseEnter={e => (e.currentTarget.style.borderColor = '#3B82F6')} onMouseLeave={e => (e.currentTarget.style.borderColor = '#E2E8F0')}>
            <p style={{ fontSize: '14px', fontWeight: 600, color: '#0F172A', marginBottom: '6px' }}>{b.name} Networking Guide</p>
            <p style={{ fontSize: '13px', color: '#64748B', lineHeight: 1.5 }}>Full networking playbook for {b.name}.</p>
          </Link>
          <Link to={`/coffee-chat/${a.slug}`} style={{ display: 'block', padding: '20px', borderRadius: '12px', border: '1px solid #E2E8F0', background: '#fff', textDecoration: 'none', transition: 'border-color 0.15s ease' }} onMouseEnter={e => (e.currentTarget.style.borderColor = '#3B82F6')} onMouseLeave={e => (e.currentTarget.style.borderColor = '#E2E8F0')}>
            <p style={{ fontSize: '14px', fontWeight: 600, color: '#0F172A', marginBottom: '6px' }}>{a.name} Coffee Chat Guide</p>
            <p style={{ fontSize: '13px', color: '#64748B', lineHeight: 1.5 }}>Prep questions and follow-up templates.</p>
          </Link>
          <Link to={`/coffee-chat/${b.slug}`} style={{ display: 'block', padding: '20px', borderRadius: '12px', border: '1px solid #E2E8F0', background: '#fff', textDecoration: 'none', transition: 'border-color 0.15s ease' }} onMouseEnter={e => (e.currentTarget.style.borderColor = '#3B82F6')} onMouseLeave={e => (e.currentTarget.style.borderColor = '#E2E8F0')}>
            <p style={{ fontSize: '14px', fontWeight: 600, color: '#0F172A', marginBottom: '6px' }}>{b.name} Coffee Chat Guide</p>
            <p style={{ fontSize: '13px', color: '#64748B', lineHeight: 1.5 }}>Prep questions and follow-up templates.</p>
          </Link>
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 py-20" style={{ background: '#FAFBFF' }}>
        <div className="text-center" style={{ maxWidth: '560px', margin: '0 auto' }}>
          <h2 style={{ fontFamily: "'Lora', Georgia, serif", fontSize: 'clamp(28px, 4vw, 40px)', fontWeight: 400, lineHeight: 1.15, color: '#0F172A', marginBottom: '16px' }}>
            Find contacts at both {a.name} and {b.name} with Offerloop
          </h2>
          <p style={{ fontSize: '15px', color: '#64748B', marginBottom: '28px' }}>
            Search 2.2B verified contacts. Get real email addresses. Send personalized outreach in seconds.
          </p>
          <Link
            to="/signin?mode=signup"
            className="inline-flex items-center gap-2 px-7 py-3.5 rounded-[3px] text-white font-semibold text-base hover:shadow-lg transition-all"
            style={{ background: '#3B82F6' }}
          >
            Get started free <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-10 px-6" style={{ borderTop: '1px solid #E2E8F0' }}>
        <div className="flex flex-col md:flex-row justify-between items-center gap-4" style={{ maxWidth: '1100px', margin: '0 auto' }}>
          <p className="text-sm" style={{ color: '#94A3B8' }}>&copy; 2026 Offerloop. All rights reserved.</p>
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
    </div>
  );
};

export default CompanyComparison;
