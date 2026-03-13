import { Helmet } from 'react-helmet-async';
import { Link, useParams, Navigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { getPostBySlug } from '@/lib/blog';

const BlogPost = () => {
  const { slug } = useParams<{ slug: string }>();
  const post = slug ? getPostBySlug(slug) : undefined;

  if (!post) {
    return <Navigate to="/blog" replace />;
  }

  const articleSchema = {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": post.title,
    "description": post.description,
    "datePublished": post.date,
    "dateModified": post.date,
    "url": `https://www.offerloop.ai/blog/${post.slug}`,
    "author": { "@type": "Organization", "name": "Offerloop Team", "url": "https://offerloop.ai" },
    "publisher": { "@type": "Organization", "name": "Offerloop", "url": "https://offerloop.ai" },
    "mainEntityOfPage": { "@type": "WebPage", "@id": `https://www.offerloop.ai/blog/${post.slug}` }
  };

  const faqSchema = post.faqSchema?.length ? {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": post.faqSchema.map(f => ({
      "@type": "Question",
      "name": f.question,
      "acceptedAnswer": { "@type": "Answer", "text": f.answer }
    }))
  } : null;

  return (
    <div className="min-h-screen w-full" style={{ fontFamily: "'DM Sans', system-ui, sans-serif", background: '#FFFFFF' }}>
      <Helmet>
        <title>{post.title} | Offerloop Blog</title>
        <meta name="description" content={post.description} />
        <meta name="keywords" content={post.keywords} />
        <link rel="canonical" href={`https://offerloop.ai/blog/${post.slug}`} />
        <meta property="og:title" content={`${post.title} | Offerloop Blog`} />
        <meta property="og:description" content={post.description} />
        <meta property="og:url" content={`https://offerloop.ai/blog/${post.slug}`} />
        <meta property="og:type" content="article" />
        <script type="application/ld+json">{JSON.stringify(articleSchema)}</script>
        {faqSchema && <script type="application/ld+json">{JSON.stringify(faqSchema)}</script>}
      </Helmet>

      {/* Nav */}
      <nav className="w-full px-6 py-5 flex items-center justify-between" style={{ maxWidth: '1100px', margin: '0 auto' }}>
        <Link to="/" className="text-xl font-bold" style={{ color: '#0F172A', letterSpacing: '-0.02em' }}>Offerloop</Link>
        <Link to="/blog" className="text-sm font-medium" style={{ color: '#64748B' }}>← Back to Blog</Link>
      </nav>

      {/* Article Header */}
      <header className="px-6 pt-16 pb-8" style={{ maxWidth: '720px', margin: '0 auto' }}>
        <Link to="/blog" className="text-sm font-medium mb-4 inline-block" style={{ color: '#2563EB', letterSpacing: '0.02em' }}>BLOG</Link>
        <h1 style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontSize: 'clamp(32px, 5vw, 48px)', fontWeight: 400, lineHeight: 1.15, letterSpacing: '-0.025em', color: '#0F172A', marginBottom: '16px' }}>
          {post.title}
        </h1>
        <div className="flex items-center gap-3">
          <span className="text-sm" style={{ color: '#94A3B8' }}>
            {new Date(post.date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
          </span>
          <span style={{ color: '#E2E8F0' }}>·</span>
          <span className="text-sm" style={{ color: '#94A3B8' }}>Offerloop Team</span>
        </div>
      </header>

      {/* Article Content */}
      <article className="px-6 pb-16" style={{ maxWidth: '720px', margin: '0 auto' }}>
        <div className="prose-offerloop">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{post.content}</ReactMarkdown>
        </div>
      </article>

      {/* CTA */}
      <section className="px-6 py-16" style={{ background: '#F8FAFF' }}>
        <div className="text-center" style={{ maxWidth: '520px', margin: '0 auto' }}>
          <h2 style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontSize: 'clamp(28px, 4vw, 36px)', fontWeight: 400, lineHeight: 1.15, color: '#0F172A', marginBottom: '16px' }}>
            Skip the manual work
          </h2>
          <p style={{ fontSize: '15px', color: '#64748B', marginBottom: '28px' }}>
            Offerloop finds verified emails, writes personalized messages, and sends through Gmail. Try it free.
          </p>
          <Link
            to="/signin?mode=signup"
            className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl text-white font-semibold text-base hover:shadow-lg transition-all"
            style={{ background: '#2563EB' }}
          >
            Create free account
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

      <style>{`
        .prose-offerloop h2 {
          font-family: 'Instrument Serif', Georgia, serif;
          font-size: 28px;
          font-weight: 400;
          color: #0F172A;
          margin-top: 40px;
          margin-bottom: 16px;
          line-height: 1.3;
        }
        .prose-offerloop h3 {
          font-size: 20px;
          font-weight: 600;
          color: #0F172A;
          margin-top: 32px;
          margin-bottom: 12px;
          line-height: 1.4;
        }
        .prose-offerloop p {
          font-size: 15px;
          line-height: 1.8;
          color: #475569;
          margin-bottom: 16px;
        }
        .prose-offerloop ul, .prose-offerloop ol {
          margin-bottom: 16px;
          padding-left: 24px;
        }
        .prose-offerloop li {
          font-size: 15px;
          line-height: 1.8;
          color: #475569;
          margin-bottom: 6px;
        }
        .prose-offerloop strong {
          color: #0F172A;
          font-weight: 600;
        }
        .prose-offerloop blockquote {
          border-left: 3px solid #2563EB;
          padding-left: 16px;
          margin: 24px 0;
          font-style: italic;
          color: #64748B;
        }
        .prose-offerloop code {
          background: #F1F5F9;
          padding: 2px 6px;
          border-radius: 4px;
          font-size: 13px;
          color: #334155;
        }
        .prose-offerloop pre {
          background: #F8FAFC;
          border: 1px solid #E2E8F0;
          border-radius: 8px;
          padding: 16px;
          overflow-x: auto;
          margin-bottom: 16px;
        }
        .prose-offerloop pre code {
          background: none;
          padding: 0;
        }
        .prose-offerloop a {
          color: #2563EB;
          text-decoration: underline;
        }
        .prose-offerloop hr {
          border: none;
          border-top: 1px solid #E2E8F0;
          margin: 32px 0;
        }
      `}</style>
    </div>
  );
};

export default BlogPost;
