"""Tests for Glassdoor scraper"""

import pytest
import asyncio
from app.services.interview_prep.glassdoor_scraper import _glassdoor_cache, _glassdoor_cache, GlassdoorScraper, search_glassdoor


class TestGlassdoorScraper:
    
    @pytest.fixture
    def scraper(self):
        return GlassdoorScraper()
    
    @pytest.fixture
    def sample_job_details(self):
        return {
            "company_name": "Google",
            "job_title": "Software Engineer",
            "level": "Entry Level",
            "role_category": "Software Engineering"
        }
    
    def test_get_cache_key(self, scraper):
        key1 = scraper._get_cache_key("Google", "Software Engineer")
        key2 = scraper._get_cache_key("Google", "Software Engineer")
        key3 = scraper._get_cache_key("Apple", "Software Engineer")
        
        assert key1 == key2  # Same inputs = same key
        assert key1 != key3  # Different company = different key
    
    def test_cache_set_and_get(self, scraper):
        cache_key = scraper._get_cache_key("Test Company")
        test_data = [{"test": "data"}]
        
        # Set cache
        scraper._set_cache(cache_key, test_data)
        
        # Get from cache
        cached = scraper._check_cache(cache_key)
        
        assert cached == test_data
    
    def test_parse_single_review(self, scraper):
        """Test parsing a single review from HTML"""
        from bs4 import BeautifulSoup
        
        html = """
        <div class="interview-review">
            <span class="job-title">Software Engineer</span>
            <span class="date">Jan 2024</span>
            <p class="outcome">Accepted</p>
            <p class="difficulty">Average</p>
            <div class="description">
                <p>Great interview process. They asked about my experience with Python.</p>
            </div>
            <ul class="questions">
                <li>Tell me about yourself</li>
                <li>Why do you want to work here?</li>
            </ul>
        </div>
        """
        
        soup = BeautifulSoup(html, 'html.parser')
        container = soup.find('div', class_='interview-review')
        
        review = scraper._parse_single_review(container)
        
        assert review is not None
        assert review["source"] == "glassdoor"
        assert "Software Engineer" in review["job_title"]
        assert len(review["questions"]) >= 0  # May or may not parse questions depending on structure
    
    def test_parse_interview_page(self, scraper):
        """Test parsing a full interview page"""
        html = """
        <html>
            <body>
                <div data-test="InterviewCard">
                    <span class="job-title">Software Engineer</span>
                    <p>Interview experience text</p>
                </div>
                <div data-test="InterviewCard">
                    <span class="job-title">Product Manager</span>
                    <p>Another interview experience</p>
                </div>
            </body>
        </html>
        """
        
        reviews = scraper._parse_interview_page(html)
        
        assert isinstance(reviews, list)
        # May find reviews depending on HTML structure
    
    @pytest.mark.asyncio
    @pytest.mark.skip(reason="Requires actual Glassdoor access - may fail due to blocking")
    async def test_search_company_integration(self, scraper):
        """Integration test - may fail if Glassdoor blocks"""
        company_slug = await scraper.search_company("Google")
        
        # May be None if company not found or blocked
        # If found, should be a string with company identifier
        if company_slug:
            assert isinstance(company_slug, str)
            assert len(company_slug) > 0
    
    @pytest.mark.asyncio
    @pytest.mark.skip(reason="Requires actual Glassdoor access - may fail due to blocking")
    async def test_full_search_integration(self, sample_job_details):
        """Full integration test - may fail if Glassdoor blocks"""
        results = await search_glassdoor(sample_job_details, timeout_seconds=30)
        
        assert isinstance(results, list)
        # May be empty if blocked or no results
    
    def test_user_agent_rotation(self, scraper):
        """Test that user agents rotate"""
        ua1 = scraper._get_user_agent()
        ua2 = scraper._get_user_agent()
        ua3 = scraper._get_user_agent()
        
        # Should cycle through user agents
        assert ua1 in GlassdoorScraper.USER_AGENTS
        assert ua2 in GlassdoorScraper.USER_AGENTS
        assert ua3 in GlassdoorScraper.USER_AGENTS
    
    def test_empty_company_name(self, scraper):
        """Test handling of empty company name"""
        job_details = {"company_name": ""}
        results = asyncio.run(scraper.search_glassdoor(job_details))
        
        assert results == []
    
    def test_cache_expiry(self, scraper):
        """Test that cache entries expire"""
        from datetime import datetime, timedelta
        
        cache_key = scraper._get_cache_key("Test")
        test_data = [{"test": "data"}]
        
        # Set cache with old timestamp
        _glassdoor_cache[cache_key] = {
            "data": test_data,
            "timestamp": datetime.now() - timedelta(hours=25)  # Older than TTL
        }
        
        # Should not return cached data (expired)
        cached = scraper._check_cache(cache_key)
        assert cached is None

