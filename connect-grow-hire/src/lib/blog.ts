export interface BlogPost {
  title: string;
  date: string;
  description: string;
  slug: string;
  keywords: string;
  faqSchema?: { question: string; answer: string }[];
  content: string;
}

function parseFrontmatter(raw: string): { data: Record<string, unknown>; content: string } {
  const trimmed = raw.trimStart();
  if (!trimmed.startsWith('---')) {
    return { data: {}, content: raw };
  }

  const endIndex = trimmed.indexOf('---', 3);
  if (endIndex === -1) {
    return { data: {}, content: raw };
  }

  const frontmatterBlock = trimmed.slice(3, endIndex).trim();
  const content = trimmed.slice(endIndex + 3).trim();
  const data: Record<string, unknown> = {};

  const lines = frontmatterBlock.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Top-level key: value
    const kvMatch = line.match(/^(\w+):\s*"(.*)"\s*$/);
    if (kvMatch) {
      data[kvMatch[1]] = kvMatch[2];
      i++;
      continue;
    }

    // Top-level key with list value (faqSchema:)
    const listKeyMatch = line.match(/^(\w+):\s*$/);
    if (listKeyMatch) {
      const key = listKeyMatch[1];
      const items: Record<string, string>[] = [];
      i++;

      while (i < lines.length) {
        const itemLine = lines[i];
        // New list item: "  - question: "...""
        const itemStart = itemLine.match(/^\s+-\s+(\w+):\s*"(.*)"\s*$/);
        if (itemStart) {
          const currentItem: Record<string, string> = { [itemStart[1]]: itemStart[2] };
          i++;
          // Collect subsequent properties of this item (e.g. answer)
          while (i < lines.length) {
            const propLine = lines[i];
            const propMatch = propLine.match(/^\s{4}(\w+):\s*"(.*)"\s*$/);
            if (propMatch) {
              currentItem[propMatch[1]] = propMatch[2];
              i++;
            } else {
              break;
            }
          }
          items.push(currentItem);
        } else if (itemLine.match(/^\w/)) {
          // Next top-level key, stop parsing list
          break;
        } else {
          i++;
        }
      }

      data[key] = items;
      continue;
    }

    i++;
  }

  return { data, content };
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
    const { data, content } = parseFrontmatter(raw as string);
    posts.push({
      title: (data.title as string) || '',
      date: (data.date as string) || '',
      description: (data.description as string) || '',
      slug: (data.slug as string) || path.split('/').pop()?.replace('.md', '') || '',
      keywords: (data.keywords as string) || '',
      faqSchema: (data.faqSchema as { question: string; answer: string }[]) || undefined,
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
