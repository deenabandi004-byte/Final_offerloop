"""Tests for YouTube scraper"""

import os
from dotenv import load_dotenv
load_dotenv()  # Load environment variables for tests

import pytest
import asyncio
from app.services.interview_prep.youtube_scraper import YouTubeScraper, search_youtube


class TestYouTubeScraper:
    
    @pytest.fixture
    def scraper(self):
        return YouTubeScraper()
    
    @pytest.fixture
    def sample_job_details(self):
        return {
            "company_name": "Google",
            "job_title": "Software Engineer",
            "level": "Entry Level",
            "role_category": "Software Engineering"
        }
    
    def test_build_search_queries(self, scraper, sample_job_details):
        queries = scraper.build_search_queries(sample_job_details)
        
        assert len(queries) > 0
        assert len(queries) <= 12
        assert any("Google" in q for q in queries)
        assert any("interview" in q.lower() for q in queries)
    
    def test_build_queries_intern(self, scraper):
        job_details = {
            "company_name": "IBM",
            "job_title": "Software Developer Intern",
            "level": "Intern",
            "role_category": "Software Engineering"
        }
        queries = scraper.build_search_queries(job_details)
        
        assert any("intern" in q.lower() for q in queries)
    
    def test_build_queries_consulting(self, scraper):
        job_details = {
            "company_name": "McKinsey",
            "job_title": "Business Analyst",
            "level": "Entry Level",
            "role_category": "Consulting"
        }
        queries = scraper.build_search_queries(job_details)
        
        assert any("case" in q.lower() or "consulting" in q.lower() for q in queries)
    
    def test_score_video_relevance(self, scraper, sample_job_details):
        video = {
            "title": "My Google Software Engineer Interview Experience 2024",
            "description": "I share my interview process at Google",
            "published_at": "2024-06-01T00:00:00Z",
            "view_count": 50000
        }
        
        score = scraper.score_video_relevance(video, sample_job_details)
        
        assert score > 0.5  # Should be highly relevant
        assert score <= 1.0
    
    def test_score_irrelevant_video(self, scraper, sample_job_details):
        video = {
            "title": "How to make pasta",
            "description": "Cooking tutorial",
            "published_at": "2024-01-01T00:00:00Z",
            "view_count": 1000
        }
        
        score = scraper.score_video_relevance(video, sample_job_details)
        
        assert score < 0.3  # Should be low relevance
    
    def test_score_recent_video_boost(self, scraper, sample_job_details):
        from datetime import datetime, timedelta
        
        recent_video = {
            "title": "Google interview experience",
            "description": "Google interview",
            "published_at": (datetime.now() - timedelta(days=30)).isoformat() + "Z",
            "view_count": 1000
        }
        
        old_video = {
            "title": "Google interview experience",
            "description": "Google interview",
            "published_at": (datetime.now() - timedelta(days=400)).isoformat() + "Z",
            "view_count": 1000
        }
        
        recent_score = scraper.score_video_relevance(recent_video, sample_job_details)
        old_score = scraper.score_video_relevance(old_video, sample_job_details)
        
        assert recent_score > old_score  # Recent should score higher
    
    @pytest.mark.asyncio
    @pytest.mark.skipif(not os.getenv("YOUTUBE_API_KEY"), reason="No YouTube API key")
    async def test_search_videos_integration(self, scraper):
        """Integration test - requires API key"""
        videos = await scraper.search_videos('"Google" interview experience', max_results=3)
        
        assert isinstance(videos, list)
        if videos:
            assert "video_id" in videos[0]
            assert "title" in videos[0]
            assert "source" in videos[0]
            assert videos[0]["source"] == "youtube"
    
    @pytest.mark.asyncio
    @pytest.mark.skipif(not os.getenv("YOUTUBE_API_KEY"), reason="No YouTube API key")
    async def test_get_video_stats(self, scraper):
        """Test getting video statistics"""
        # Use a known video ID (any public video)
        test_video_id = "dQw4w9WgXcQ"  # Rick Roll - always available
        stats = await scraper.get_video_stats([test_video_id])
        
        assert isinstance(stats, dict)
        if test_video_id in stats:
            assert "view_count" in stats[test_video_id]
    
    @pytest.mark.asyncio
    @pytest.mark.skipif(not os.getenv("YOUTUBE_API_KEY"), reason="No YouTube API key")
    async def test_full_search_integration(self, sample_job_details):
        """Full integration test"""
        results = await search_youtube(sample_job_details, timeout_seconds=30)
        
        assert isinstance(results, list)
        # May be empty if no results or quota exceeded
        if results:
            assert "video_id" in results[0]
            assert "title" in results[0]
            assert "source" in results[0]
            assert "relevance_score" in results[0]
    
    @pytest.mark.asyncio
    async def test_search_without_api_key(self):
        """Test that scraper gracefully handles missing API key"""
        from unittest.mock import patch, MagicMock
        
        # Mock the scraper's api_key attribute directly
        scraper = YouTubeScraper()
        original_api_key = scraper.api_key
        
        try:
            # Set api_key to None to simulate missing key
            scraper.api_key = None
            results = await scraper.search_youtube({
                "company_name": "Google",
                "job_title": "Software Engineer"
            })
            
            assert results == []  # Should return empty list
        finally:
            # Restore API key
            scraper.api_key = original_api_key
    
    def test_parse_search_results(self, scraper):
        """Test parsing of YouTube API response"""
        mock_response = {
            "items": [
                {
                    "id": {"videoId": "test123"},
                    "snippet": {
                        "title": "Test Video",
                        "description": "Test description",
                        "channelTitle": "Test Channel",
                        "publishedAt": "2024-01-01T00:00:00Z",
                        "thumbnails": {"medium": {"url": "http://example.com/thumb.jpg"}}
                    }
                }
            ]
        }
        
        results = scraper._parse_search_results(mock_response, "test query")
        
        assert len(results) == 1
        assert results[0]["video_id"] == "test123"
        assert results[0]["title"] == "Test Video"
        assert results[0]["source"] == "youtube"
        assert results[0]["search_query"] == "test query"

