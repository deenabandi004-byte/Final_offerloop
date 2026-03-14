# Blog Post Generation Script

Generates SEO-optimized blog posts from the content calendar using OpenAI.

## Setup

```bash
npm install openai
```

## Usage

```bash
OPENAI_API_KEY=your_key node scripts/generate-blog-post.cjs
```

The script will:
1. Read the content calendar from `~/Downloads/AEO/output/06_content_calendar.json`
2. Find the next unwritten post (checks existing files in `connect-grow-hire/src/content/blog/`)
3. Generate content via OpenAI (gpt-4o)
4. Save the markdown file with frontmatter
5. Add the blog URL to the sitemap

## Automation

A GitHub Actions workflow runs this every Friday at 9am UTC and creates a PR for review. Requires `OPENAI_API_KEY` set as a repository secret.
