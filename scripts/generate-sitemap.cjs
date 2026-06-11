#!/usr/bin/env node
/**
 * generate-sitemap.js — generates sitemap.xml from all seed data files
 *
 * Reads every data file in connect-grow-hire/src/data/ and generates
 * a complete sitemap.xml with URLs for all route types.
 *
 * Usage: node scripts/generate-sitemap.js
 * Output: connect-grow-hire/public/sitemap.xml
 */

const fs = require('fs');
const path = require('path');

const BASE = 'https://www.offerloop.ai';
const OUTPUT = path.join(__dirname, '..', 'connect-grow-hire', 'public', 'sitemap.xml');

// Static pages
const staticPages = [
  { path: '/', changefreq: 'weekly', priority: '1.0' },
  { path: '/about', changefreq: 'monthly', priority: '0.8' },
  { path: '/pricing', changefreq: 'monthly', priority: '0.9' },
  { path: '/blog', changefreq: 'weekly', priority: '0.8' },
  { path: '/contact', changefreq: 'monthly', priority: '0.5' },
  { path: '/contact-us', changefreq: 'monthly', priority: '0.5' },
  { path: '/privacy', changefreq: 'monthly', priority: '0.3' },
  { path: '/terms-of-service', changefreq: 'monthly', priority: '0.3' },
  { path: '/alumni-outreach', changefreq: 'monthly', priority: '0.7' },
  { path: '/coffee-chat-networking', changefreq: 'monthly', priority: '0.7' },
  { path: '/cold-email-consulting', changefreq: 'monthly', priority: '0.7' },
  { path: '/cold-email-investment-banking', changefreq: 'monthly', priority: '0.7' },
  { path: '/cold-email-tech-internships', changefreq: 'monthly', priority: '0.7' },
];

// Helper: read a TS data file by extracting the array content
// We use a simple regex approach since these are static data files
function extractSlugs(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const content = fs.readFileSync(filePath, 'utf-8');
  const slugs = [];
  const regex = /slug:\s*['"]([^'"]+)['"]/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    slugs.push(match[1]);
  }
  return slugs;
}

// Helper: read comparisons data for compare routes
function extractComparisons(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const content = fs.readFileSync(filePath, 'utf-8');
  const pairs = [];
  // Match patterns like { slugA: "x", slugB: "y" } or similar
  const regex = /slug:\s*['"]([^'"]+)['"]/g;
  const allSlugs = [];
  let match;
  while ((match = regex.exec(content)) !== null) {
    allSlugs.push(match[1]);
  }
  return allSlugs;
}

const dataDir = path.join(__dirname, '..', 'connect-grow-hire', 'src', 'data');

// Existing route types
const companySlugs = extractSlugs(path.join(dataDir, 'companies.ts'));
const universitySlugs = extractSlugs(path.join(dataDir, 'seo-universities.ts'));
const industrySlugs = extractSlugs(path.join(dataDir, 'industries.ts'));
const roleSlugs = extractSlugs(path.join(dataDir, 'roles.ts'));

// Read comparisons.ts for compare slugs
const comparisonsFile = path.join(dataDir, 'comparisons.ts');
let comparisonSlugs = [];
if (fs.existsSync(comparisonsFile)) {
  const content = fs.readFileSync(comparisonsFile, 'utf-8');
  // Match "slug-a-vs-slug-b" patterns or extract from the data structure
  const regex = /['"]([a-z0-9-]+-vs-[a-z0-9-]+)['"]/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    comparisonSlugs.push(match[1]);
  }
}
// If no comparisons file, generate from company pairs in sitemap
if (comparisonSlugs.length === 0) {
  // Fall back to reading existing sitemap for compare URLs
  const existingSitemap = fs.existsSync(OUTPUT) ? fs.readFileSync(OUTPUT, 'utf-8') : '';
  const compareRegex = /\/compare\/([a-z0-9-]+-vs-[a-z0-9-]+)/g;
  let match;
  while ((match = compareRegex.exec(existingSitemap)) !== null) {
    if (!comparisonSlugs.includes(match[1])) comparisonSlugs.push(match[1]);
  }
}

// Blog slugs from content directory
const blogDir = path.join(__dirname, '..', 'connect-grow-hire', 'src', 'content', 'blog');
let blogSlugs = [];
if (fs.existsSync(blogDir)) {
  blogSlugs = fs.readdirSync(blogDir)
    .filter(f => f.endsWith('.md'))
    .map(f => f.replace('.md', ''));
}

// New route types
const targetSchoolSlugs = extractSlugs(path.join(dataDir, 'target-schools-data.ts'));
const findEmailSlugs = extractSlugs(path.join(dataDir, 'find-email-data.ts'));
const recruiterSlugs = extractSlugs(path.join(dataDir, 'recruiter-data.ts'));
const salarySlugs = extractSlugs(path.join(dataDir, 'salary-data.ts'));
const timelineSlugs = extractSlugs(path.join(dataDir, 'recruiting-timeline-data.ts'));
const automateSlugs = extractSlugs(path.join(dataDir, 'automate-data.ts'));

// Build URL list
const urls = [];

// Static pages
staticPages.forEach(p => {
  urls.push({ loc: `${BASE}${p.path}`, changefreq: p.changefreq, priority: p.priority });
});

// Existing programmatic routes
comparisonSlugs.forEach(s => urls.push({ loc: `${BASE}/compare/${s}`, changefreq: 'weekly', priority: '0.8' }));
companySlugs.forEach(s => urls.push({ loc: `${BASE}/coffee-chat/${s}`, changefreq: 'monthly', priority: '0.7' }));
industrySlugs.forEach(s => urls.push({ loc: `${BASE}/cold-email/${s}`, changefreq: 'monthly', priority: '0.7' }));
companySlugs.forEach(s => urls.push({ loc: `${BASE}/networking/${s}`, changefreq: 'monthly', priority: '0.7' }));
universitySlugs.forEach(s => urls.push({ loc: `${BASE}/alumni/${s}`, changefreq: 'monthly', priority: '0.7' }));
roleSlugs.forEach(s => urls.push({ loc: `${BASE}/networking-for/${s}`, changefreq: 'monthly', priority: '0.6' }));
blogSlugs.forEach(s => urls.push({ loc: `${BASE}/blog/${s}`, changefreq: 'weekly', priority: '0.7' }));

// New programmatic routes
targetSchoolSlugs.forEach(s => urls.push({ loc: `${BASE}/target-schools/${s}`, changefreq: 'monthly', priority: '0.7' }));
findEmailSlugs.forEach(s => urls.push({ loc: `${BASE}/find-email/${s}`, changefreq: 'monthly', priority: '0.7' }));
recruiterSlugs.forEach(s => urls.push({ loc: `${BASE}/recruit/${s}`, changefreq: 'monthly', priority: '0.6' }));
salarySlugs.forEach(s => urls.push({ loc: `${BASE}/salary/${s}`, changefreq: 'monthly', priority: '0.7' }));
timelineSlugs.forEach(s => urls.push({ loc: `${BASE}/recruiting-timeline/${s}`, changefreq: 'monthly', priority: '0.7' }));
automateSlugs.forEach(s => urls.push({ loc: `${BASE}/automate/${s}`, changefreq: 'monthly', priority: '0.6' }));

// Deduplicate
const seen = new Set();
const deduped = urls.filter(u => {
  if (seen.has(u.loc)) return false;
  seen.add(u.loc);
  return true;
});

// Generate XML
const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${deduped.map(u => `  <url>
    <loc>${u.loc}</loc>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`).join('\n')}
</urlset>
`;

fs.writeFileSync(OUTPUT, xml);
console.log(`Sitemap generated: ${deduped.length} URLs → ${OUTPUT}`);

// Summary by route type
const counts = {};
deduped.forEach(u => {
  const p = new URL(u.loc).pathname;
  const type = p.split('/')[1] || 'root';
  counts[type] = (counts[type] || 0) + 1;
});
console.log('\nURLs per route type:');
Object.entries(counts).sort((a, b) => b[1] - a[1]).forEach(([type, count]) => {
  console.log(`  ${type}: ${count}`);
});
