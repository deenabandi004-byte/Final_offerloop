"""
Reddit scraper service - fetch interview-related posts from Reddit
"""
import aiohttp
import asyncio
from datetime import datetime, timedelta
from typing import Dict, List, Optional
from urllib.parse import quote_plus

# Target subreddits - select based on role_category from job posting
SUBREDDIT_MAP = {
    "Software Engineering": ['cscareerquestions', 'leetcode', 'experienceddevs', 'programming', 'webdev'],
    "Product Management": ['ProductManagement', 'cscareerquestions', 'jobs'],
    "Data Science": ['datascience', 'MachineLearning', 'cscareerquestions', 'analytics'],
    "Consulting": ['consulting', 'MBA', 'jobs', 'FinancialCareers'],
    "Finance": ['FinancialCareers', 'MBA', 'jobs', 'investing'],
    "Marketing": ['marketing', 'jobs', 'advertising'],
    "Design": ['UXDesign', 'userexperience', 'jobs', 'graphic_design'],
    "Operations": ['jobs', 'supplychain', 'operations'],
    "Other": ['jobs', 'interviews', 'careeradvice']
}

# User-Agent header required by Reddit
REDDIT_USER_AGENT = "Offerloop/1.0 (interview prep tool for students; contact@offerloop.ai)"


def build_search_queries(job_details: Dict) -> List[str]:
    """Build targeted search queries based on job posting details"""
    queries = []
    company = job_details.get("company_name", "")
    role = job_details.get("job_title", "")
    level = job_details.get("level", "")
    team = job_details.get("team_division", "")
    skills = job_details.get("required_skills", [])[:5]  # Top 5 skills
    
    # Company + Role specific (MOST VALUABLE)
    if company and role:
        queries.append(f"{company} {role} interview")
        queries.append(f"{company} {role} interview experience")
        queries.append(f"{company} {role} interview questions")
    
    # Team/Division specific (if available)
    if team and company:
        queries.append(f"{company} {team} interview")
        queries.append(f"{company} {team} culture")
    
    # Level specific
    if level:
        if company:
            queries.append(f"{company} {level} interview")
        queries.append(f"{level} {role} interview tips")
    
    # Skill-based queries (for technical roles)
    for skill in skills[:3]:
        queries.append(f"{skill} interview questions")
    
    # General company queries
    if company:
        queries.append(f"{company} interview process")
        queries.append(f"{company} hiring timeline")
        queries.append(f"{company} offer negotiation")
        if role:
            queries.append(f"{company} salary {role}")
        queries.append(f"{company} work life balance")
        queries.append(f"{company} culture")
        queries.append(f"{company} interview rejected")
    
    return queries


async def fetch_post_comments(session: aiohttp.ClientSession, post_id: str, subreddit: str) -> List[Dict]:
    """Fetch top comments for a specific post"""
    url = f"https://www.reddit.com/r/{subreddit}/comments/{post_id}.json"
    try:
        async with session.get(url) as resp:
            if resp.status == 200:
                data = await resp.json()
                # Reddit comments API returns array: [post_data, comments_data]
                if len(data) >= 2 and 'data' in data[1]:
                    comments = data[1]['data'].get('children', [])
                    # Filter out deleted/removed comments and get top 5 by upvotes
                    valid_comments = [
                        c['data'] for c in comments 
                        if c['kind'] == 't1' and 
                        c['data'].get('body') and 
                        c['data'].get('body') not in ['[deleted]', '[removed]']
                    ]
                    # Sort by upvotes and take top 10 (comments often have the best info)
                    valid_comments.sort(key=lambda x: x.get('ups', 0), reverse=True)
                    return valid_comments[:10]
    except Exception as e:
        print(f"Error fetching comments for {post_id}: {e}")
    return []


async def search_reddit(job_details: Dict, timeout_seconds: int = 90) -> List[Dict]:
    """
    Search Reddit using targeted queries based on job posting details
    
    Args:
        job_details: Parsed job posting with company_name, job_title, level, etc.
        timeout_seconds: Maximum time to spend scraping
    
    Returns:
        List of relevant Reddit posts with comments
    """
    headers = {"User-Agent": REDDIT_USER_AGENT}
    
    all_posts = []
    seen_ids = set()  # For deduplication
    
    # Select subreddits based on role category
    role_category = job_details.get("role_category", "Other")
    subreddits = SUBREDDIT_MAP.get(role_category, SUBREDDIT_MAP["Other"])
    subreddits = subreddits + ['interviews', 'jobs']  # Always include these
    subreddits = list(dict.fromkeys(subreddits))  # Remove duplicates, preserve order
    
    # Build targeted queries
    queries = build_search_queries(job_details)
    
    start_time = datetime.now()
    
    async with aiohttp.ClientSession(headers=headers, timeout=aiohttp.ClientTimeout(total=timeout_seconds)) as session:
        for subreddit in subreddits[:6]:  # Limit subreddits
            if (datetime.now() - start_time).total_seconds() > timeout_seconds:
                break
                
            for query in queries[:15]:  # Limit queries
                if (datetime.now() - start_time).total_seconds() > timeout_seconds:
                    break
                    
                url = f"https://www.reddit.com/r/{subreddit}/search.json?q={quote_plus(query)}&sort=top&t=year&limit=25"
                try:
                    async with session.get(url) as resp:
                        if resp.status == 200:
                            data = await resp.json()
                            posts = data.get("data", {}).get("children", [])
                            for post in posts:
                                if post.get("kind") != "t3":
                                    continue
                                post_data = post.get("data", {})
                                post_id = post_data.get("id")
                                if post_id and post_id not in seen_ids:
                                    seen_ids.add(post_id)
                                    
                                    # Filter posts from last 12 months
                                    created_utc = post_data.get('created_utc', 0)
                                    if created_utc:
                                        post_date = datetime.fromtimestamp(created_utc)
                                        if post_date < datetime.now() - timedelta(days=365):
                                            continue
                                    
                                    title = post_data.get('title', '')
                                    if not title:
                                        continue
                                    
                                    all_posts.append(post)
                        elif resp.status == 429:
                            # Rate limited - wait longer
                            await asyncio.sleep(2)
                        await asyncio.sleep(0.6)  # Rate limit: stay safe
                except Exception as e:
                    print(f"Error fetching {url}: {e}")
                    continue
        
        # Sort by upvotes and relevance
        all_posts.sort(key=lambda x: x.get("data", {}).get("ups", 0), reverse=True)
        top_posts = all_posts[:50]
        
        # Fetch comments for top 25 posts (comments have the best insights)
        posts_with_comments = []
        for post in top_posts[:25]:
            post_data = post.get("data", {})
            permalink = post_data.get("permalink", "")
            if permalink:
                comments_url = f"https://www.reddit.com{permalink}.json?limit=15&sort=top"
                try:
                    async with session.get(comments_url) as resp:
                        if resp.status == 200:
                            data = await resp.json()
                            if len(data) > 1:
                                comments = data[1].get("data", {}).get("children", [])
                                post_data["top_comments"] = [
                                    {
                                        'body': c.get("data", {}).get("body", "")[:2500],
                                        'upvotes': c.get("data", {}).get("ups", 0)
                                    }
                                    for c in comments[:15] 
                                    if c.get("kind") == "t1"
                                ]
                    await asyncio.sleep(0.6)
                except Exception as e:
                    print(f"Error fetching comments: {e}")
            
            # Structure the post data
            structured_post = {
                'post_id': post_data.get('id'),
                'post_title': post_data.get('title', ''),
                'post_body': post_data.get('selftext', '')[:5000] if post_data.get('selftext') else '',
                'top_comments': post_data.get('top_comments', []),
                'upvotes': post_data.get('ups', 0),
                'date': datetime.fromtimestamp(post_data.get('created_utc', 0)).isoformat() if post_data.get('created_utc') else None,
                'subreddit': post_data.get('subreddit', ''),
                'url': f"https://www.reddit.com{post_data.get('permalink', '')}"
            }
            posts_with_comments.append(structured_post)
    
    return posts_with_comments

