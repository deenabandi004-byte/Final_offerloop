"""Tests for content aggregator"""

import pytest
import asyncio
from app.services.interview_prep.content_aggregator import ContentAggregator, aggregate_content


class TestContentAggregator:
    
    @pytest.fixture
    def aggregator(self):
        return ContentAggregator()
    
    @pytest.fixture
    def sample_job_details(self):
        return {
            "company_name": "Google",
            "job_title": "Software Engineer",
            "level": "Entry Level",
            "role_category": "Software Engineering"
        }
    
    @pytest.fixture
    def sample_raw_data(self):
        return {
            "reddit": [
                {
                    "id": "post1",
                    "title": "Google interview experience",
                    "body": "Great interview process",
                    "permalink": "/r/cscareerquestions/post1",
                    "subreddit": "cscareerquestions",
                    "upvotes": 100,
                    "num_comments": 10,
                    "created_utc": "2024-01-01T00:00:00Z",
                    "comments": []
                }
            ],
            "youtube": [
                {
                    "video_id": "vid1",
                    "title": "Google Software Engineer Interview",
                    "description": "My interview experience",
                    "channel_title": "Tech Channel",
                    "published_at": "2024-01-01T00:00:00Z",
                    "view_count": 50000,
                    "has_transcript": True,
                    "transcript": "This is the transcript",
                    "relevance_score": 0.8
                }
            ],
            "glassdoor": [
                {
                    "job_title": "Software Engineer",
                    "experience": "Interview was challenging but fair",
                    "outcome": "Accepted",
                    "difficulty": "Average",
                    "date": "2024-01-01",
                    "questions": ["Tell me about yourself", "Why Google?"]
                }
            ]
        }
    
    def test_normalize_content(self, aggregator, sample_raw_data):
        """Test content normalization"""
        normalized = aggregator.normalize_content(sample_raw_data)
        
        assert len(normalized) == 3  # One from each source
        
        # Check Reddit normalization
        reddit_item = next((i for i in normalized if i["source"] == "reddit"), None)
        assert reddit_item is not None
        assert reddit_item["id"].startswith("reddit_")
        assert reddit_item["source"] == "reddit"
        assert "reddit.com" in reddit_item["source_url"]
        assert reddit_item["title"] == "Google interview experience"
        
        # Check YouTube normalization
        youtube_item = next((i for i in normalized if i["source"] == "youtube"), None)
        assert youtube_item is not None
        assert youtube_item["id"].startswith("youtube_")
        assert youtube_item["source"] == "youtube"
        assert "youtube.com" in youtube_item["source_url"]
        assert youtube_item["metadata"]["has_transcript"] is True
        
        # Check Glassdoor normalization
        glassdoor_item = next((i for i in normalized if i["source"] == "glassdoor"), None)
        assert glassdoor_item is not None
        assert glassdoor_item["id"].startswith("glassdoor_")
        assert glassdoor_item["source"] == "glassdoor"
        assert len(glassdoor_item["questions"]) == 2
    
    def test_normalize_score_reddit(self, aggregator):
        """Test Reddit score normalization"""
        score_100 = aggregator._normalize_score(100, "reddit")
        score_1000 = aggregator._normalize_score(1000, "reddit")
        score_5000 = aggregator._normalize_score(5000, "reddit")
        
        assert 0 <= score_100 <= 1.0
        assert score_1000 == 1.0  # Should cap at 1.0
        assert score_5000 == 1.0  # Should cap at 1.0
        assert score_1000 > score_100  # More upvotes = higher score
    
    def test_normalize_score_youtube(self, aggregator):
        """Test YouTube score normalization"""
        score_5k = aggregator._normalize_score(5000, "youtube")
        score_50k = aggregator._normalize_score(50000, "youtube")
        score_200k = aggregator._normalize_score(200000, "youtube")
        
        assert 0 <= score_5k <= 1.0
        assert score_200k == 1.0  # Should cap at 1.0
        assert score_50k > score_5k  # More views = higher score
    
    def test_glassdoor_outcome_score(self, aggregator):
        """Test Glassdoor outcome scoring"""
        accepted_score = aggregator._glassdoor_outcome_score("Accepted")
        declined_score = aggregator._glassdoor_outcome_score("Declined")
        no_offer_score = aggregator._glassdoor_outcome_score("No Offer")
        unknown_score = aggregator._glassdoor_outcome_score("")
        
        assert accepted_score == 0.9  # Highest score
        assert declined_score == 0.7
        assert no_offer_score == 0.5
        assert unknown_score == 0.4  # Lowest score
    
    def test_deduplicate(self, aggregator):
        """Test content deduplication"""
        content = [
            {
                "id": "1",
                "content": "This is a test interview experience about Google",
                "source": "reddit"
            },
            {
                "id": "2",
                "content": "This is a test interview experience about Google",  # Duplicate
                "source": "youtube"
            },
            {
                "id": "3",
                "content": "Different content about Apple interviews",
                "source": "glassdoor"
            }
        ]
        
        unique = aggregator.deduplicate(content)
        
        assert len(unique) == 2  # Should remove duplicate
        assert unique[0]["id"] in ["1", "2"]  # One of the duplicates
        assert unique[1]["id"] == "3"  # Different content kept
    
    def test_rank_content(self, aggregator, sample_job_details):
        """Test content ranking"""
        content = [
            {
                "title": "Google Software Engineer Interview",
                "content": "Google interview for Software Engineer role",
                "source": "reddit",
                "score": 0.5,
                "date": "2024-01-01"
            },
            {
                "title": "Tech Interview Tips",
                "content": "General interview advice",
                "source": "youtube",
                "score": 0.6,
                "date": "2023-01-01",
                "metadata": {"has_transcript": True}
            },
            {
                "title": "Interview Experience",
                "content": "Some company interview",
                "source": "glassdoor",
                "score": 0.4,
                "date": "2024-01-01"
            }
        ]
        
        ranked = aggregator.rank_content(content, sample_job_details)
        
        assert len(ranked) == 3
        assert "rank_score" in ranked[0]
        # First item should have highest rank score
        assert ranked[0]["rank_score"] >= ranked[1]["rank_score"]
        assert ranked[1]["rank_score"] >= ranked[2]["rank_score"]
    
    def test_combine_reddit_content(self, aggregator):
        """Test combining Reddit post with comments"""
        post = {
            "body": "Main post content",
            "comments": [
                {"body": "Comment 1"},
                {"body": "Comment 2"},
                "Comment 3"  # String format
            ]
        }
        
        combined = aggregator._combine_reddit_content(post)
        
        assert "Main post content" in combined
        assert "Comment 1" in combined
        assert "Comment 2" in combined
        assert "Comment 3" in combined
    
    @pytest.mark.asyncio
    @pytest.mark.skip(reason="Requires actual API access - may be slow")
    async def test_aggregate_integration(self, sample_job_details):
        """Full integration test - may be slow"""
        content, stats = await aggregate_content(sample_job_details, max_items=10)
        
        assert isinstance(content, list)
        assert isinstance(stats, dict)
        assert "total_sources" in stats
        assert "by_source" in stats
        assert "sources_status" in stats
    
    def test_empty_sources(self, aggregator):
        """Test handling of empty source data"""
        empty_data = {
            "reddit": [],
            "youtube": [],
            "glassdoor": []
        }
        
        normalized = aggregator.normalize_content(empty_data)
        
        assert len(normalized) == 0
    
    def test_partial_sources(self, aggregator):
        """Test handling when only some sources have data"""
        partial_data = {
            "reddit": [
                {
                    "id": "post1",
                    "title": "Test",
                    "body": "Content",
                    "permalink": "/test",
                    "subreddit": "test",
                    "upvotes": 10,
                    "num_comments": 5,
                    "created_utc": "2024-01-01",
                    "comments": []
                }
            ],
            "youtube": [],
            "glassdoor": []
        }
        
        normalized = aggregator.normalize_content(partial_data)
        
        assert len(normalized) == 1
        assert normalized[0]["source"] == "reddit"

