import matter from 'gray-matter';

export interface BlogPost {
  title: string;
  date: string;
  description: string;
  slug: string;
  keywords: string;
  faqSchema?: { question: string; answer: string }[];
  content: string;
}

// Import all markdown files at build time
const modules = import.meta.glob('/src/content/blog/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
});

function parsePosts(): BlogPost[] {
  const posts: BlogPost[] = [];

  for (const [path, raw] of Object.entries(modules)) {
    const { data, content } = matter(raw as string);
    posts.push({
      title: data.title || '',
      date: data.date || '',
      description: data.description || '',
      slug: data.slug || path.split('/').pop()?.replace('.md', '') || '',
      keywords: data.keywords || '',
      faqSchema: data.faqSchema || undefined,
      content,
    });
  }

  // Sort by date descending
  posts.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  return posts;
}

const allPosts = parsePosts();

export function getAllPosts(): BlogPost[] {
  return allPosts;
}

export function getPostBySlug(slug: string): BlogPost | undefined {
  return allPosts.find((p) => p.slug === slug);
}
