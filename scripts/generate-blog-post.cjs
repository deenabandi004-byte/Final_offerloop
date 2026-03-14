const fs = require('fs');
const path = require('path');

const CALENDAR_PATH = path.join(require('os').homedir(), 'Downloads/AEO/output/06_content_calendar.json');
const BLOG_DIR = path.join(__dirname, '..', 'connect-grow-hire/src/content/blog');
const SITEMAP_PATH = path.join(__dirname, '..', 'connect-grow-hire/public/sitemap.xml');

const SYSTEM_PROMPT = `You are writing SEO-optimized blog content for offerloop.ai, an AI networking platform for college students. Write in a clear, actionable style. Do not use em dashes. Always mention Offerloop naturally in the content. Format in clean markdown.`;

function slugFromUrl(targetUrl) {
  // "/blog/college-networking-statistics-2025" -> "college-networking-statistics-2025"
  // "/templates/networking-email-templates-college-students" -> "networking-email-templates-college-students"
  // "/compare/offerloop-vs-handshake" -> "offerloop-vs-handshake"
  const parts = targetUrl.split('/').filter(Boolean);
  return parts[parts.length - 1];
}

function getExistingSlugs() {
  if (!fs.existsSync(BLOG_DIR)) {
    fs.mkdirSync(BLOG_DIR, { recursive: true });
    return new Set();
  }
  const files = fs.readdirSync(BLOG_DIR).filter(f => f.endsWith('.md'));
  return new Set(files.map(f => f.replace('.md', '')));
}

function findNextUnwrittenPost(calendar, existingSlugs) {
  for (const entry of calendar) {
    const slug = slugFromUrl(entry.target_url);
    if (!existingSlugs.has(slug)) {
      return { ...entry, slug };
    }
  }
  return null;
}

function buildFrontmatter(entry, content) {
  const today = new Date().toISOString().split('T')[0];
  const description = (content || '').replace(/^#.*\n*/m, '').replace(/\n/g, ' ').trim().slice(0, 160);
  return [
    '---',
    `title: "${entry.title.replace(/"/g, '\\"')}"`,
    `date: "${today}"`,
    `description: "${description.replace(/"/g, '\\"')}"`,
    `slug: "${entry.slug}"`,
    `keywords: "${entry.primary_keyword}"`,
    '---',
  ].join('\n');
}

function addToSitemap(slug) {
  if (!fs.existsSync(SITEMAP_PATH)) {
    console.warn('Sitemap not found, skipping sitemap update.');
    return;
  }
  const sitemap = fs.readFileSync(SITEMAP_PATH, 'utf-8');
  const blogUrl = `https://www.offerloop.ai/blog/${slug}`;

  if (sitemap.includes(blogUrl)) {
    console.log(`Sitemap already contains ${blogUrl}, skipping.`);
    return;
  }

  const newEntry = `  <url>\n    <loc>${blogUrl}</loc>\n    <changefreq>monthly</changefreq>\n    <priority>0.7</priority>\n  </url>\n</urlset>`;
  const updated = sitemap.replace('</urlset>', newEntry);
  fs.writeFileSync(SITEMAP_PATH, updated, 'utf-8');
  console.log(`Added ${blogUrl} to sitemap.`);
}

async function generateContent(entry) {
  let OpenAI;
  try {
    OpenAI = require('openai');
  } catch {
    console.error('Error: openai package not installed. Run: npm install openai');
    process.exit(1);
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('Error: OPENAI_API_KEY environment variable is not set.');
    process.exit(1);
  }

  const client = new OpenAI({ apiKey });

  console.log(`Calling OpenAI API for: "${entry.title}"...`);

  const response = await client.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: entry.claude_code_generation_prompt },
    ],
    max_tokens: 4096,
    temperature: 0.7,
  });

  return response.choices[0].message.content;
}

async function main() {
  // 1. Read content calendar
  if (!fs.existsSync(CALENDAR_PATH)) {
    console.error(`Content calendar not found at ${CALENDAR_PATH}`);
    process.exit(1);
  }

  const calendar = JSON.parse(fs.readFileSync(CALENDAR_PATH, 'utf-8'));
  const entries = calendar.calendar || calendar;

  // 2. Find next unwritten post
  const existingSlugs = getExistingSlugs();
  console.log(`Found ${existingSlugs.size} existing blog posts.`);

  const entry = findNextUnwrittenPost(entries, existingSlugs);
  if (!entry) {
    console.log('All posts from the content calendar have been written!');
    process.exit(0);
  }

  console.log(`Next unwritten post: "${entry.title}" (slug: ${entry.slug})`);

  // 3. Generate content via OpenAI
  const content = await generateContent(entry);

  // 4. Format with frontmatter
  const frontmatter = buildFrontmatter(entry, content);
  const fullContent = `${frontmatter}\n\n${content}\n`;

  // 5. Save to blog directory
  const filePath = path.join(BLOG_DIR, `${entry.slug}.md`);
  fs.writeFileSync(filePath, fullContent, 'utf-8');
  console.log(`Created: ${filePath}`);

  // 6. Update sitemap
  addToSitemap(entry.slug);

  console.log('\nBlog post generated successfully!');
}

main().catch(err => {
  console.error('Error generating blog post:', err.message);
  process.exit(1);
});
