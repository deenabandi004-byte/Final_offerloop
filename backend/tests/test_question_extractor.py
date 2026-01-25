"""Tests for question extractor"""

import pytest
from app.services.interview_prep.question_extractor import QuestionExtractor, extract_questions


class TestQuestionExtractor:
    
    @pytest.fixture
    def extractor(self):
        return QuestionExtractor()
    
    @pytest.fixture
    def sample_job_details(self):
        return {
            "company_name": "Google",
            "job_title": "Software Engineer",
            "level": "Entry Level",
            "role_category": "Software Engineering"
        }
    
    @pytest.fixture
    def sample_content(self):
        return [
            {
                "source": "reddit",
                "title": "Google interview experience",
                "content": "They asked me: 'Tell me about yourself' and 'Why do you want to work at Google?' Also had a coding question: implement an LRU cache.",
                "questions": []
            },
            {
                "source": "glassdoor",
                "title": "Interview review",
                "content": "Interview was good. Questions asked: Describe a time you faced a challenge.",
                "questions": ["Tell me about yourself", "Why Google?"]
            },
            {
                "source": "youtube",
                "title": "Interview video",
                "content": "System design question: Design a URL shortener. Also asked about my experience with distributed systems.",
                "questions": []
            }
        ]
    
    def test_extract_questions_regex(self, extractor):
        """Test regex-based question extraction"""
        content = """
        They asked me: "Tell me about yourself"
        Question: Why do you want to work here?
        Implement a binary search tree.
        """
        
        questions = extractor.extract_questions_regex(content)
        
        assert len(questions) > 0
        assert len(questions) > 0  # Just verify extraction works
    
    def test_categorize_question_behavioral(self, extractor):
        """Test behavioral question categorization"""
        q1 = "Tell me about a time you faced a challenge"
        q2 = "How do you handle conflict in a team?"
        
        cat1 = extractor.categorize_question(q1)
        cat2 = extractor.categorize_question(q2)
        
        assert cat1 == "behavioral"
        assert cat2 == "behavioral"
    
    def test_categorize_question_technical(self, extractor):
        """Test technical question categorization"""
        q1 = "Implement an LRU cache"
        q2 = "Explain the difference between a stack and a queue"
        
        cat1 = extractor.categorize_question(q1)
        cat2 = extractor.categorize_question(q2)
        
        assert cat1 == "technical_coding"
        assert cat2 == "technical_coding"  # implement = coding
    
    def test_categorize_question_system_design(self, extractor):
        """Test system design question categorization"""
        q1 = "Design a distributed system to handle millions of users"
        q2 = "How would you scale a database?"
        
        cat1 = extractor.categorize_question(q1)
        cat2 = extractor.categorize_question(q2)
        
        assert cat1 == "system_design"
        assert cat2 == "system_design"
    
    def test_prepare_content_for_ai(self, extractor, sample_content):
        """Test content preparation for AI"""
        prepared = extractor._prepare_content_for_ai(sample_content)
        
        assert "[REDDIT]" in prepared
        assert "[GLASSDOOR]" in prepared
        assert "[YOUTUBE]" in prepared
        assert len(prepared) > 0
    
    def test_fallback_extraction(self, extractor, sample_content, sample_job_details):
        """Test fallback extraction when AI is unavailable"""
        questions = extractor._fallback_extraction(sample_content, sample_job_details)
        
        assert isinstance(questions, dict)
        assert "behavioral" in questions
        assert "technical_coding" in questions
        assert "system_design" in questions
        assert "real_questions" in questions
        
        # Should include Glassdoor questions in real_questions
        assert len(questions["real_questions"]) > 0
    
    def test_enrich_questions(self, extractor, sample_job_details):
        """Test question enrichment"""
        questions = {
            "behavioral": [
                {"question": "Tell me about yourself", "frequency": 5, "source": "glassdoor"},
                {"question": "Why this company?", "frequency": 3, "source": "reddit"}
            ],
            "technical_coding": [
                {"question": "Implement LRU cache", "frequency": 8, "source": "youtube"}
            ],
            "system_design": [],
            "technical_concepts": [],
            "company_specific": [],
            "real_questions": []
        }
        
        enriched = extractor.enrich_questions(questions, sample_job_details)
        
        assert "_metadata" in enriched
        assert enriched["_metadata"]["role_category"] == "Software Engineering"
        assert "technical_coding" in enriched["_metadata"]["priority_categories"]
        
        # Should be sorted by frequency
        assert enriched["behavioral"][0]["frequency"] >= enriched["behavioral"][1]["frequency"]
    
    def test_enrich_questions_consulting(self, extractor):
        """Test enrichment for consulting role"""
        job_details = {
            "company_name": "McKinsey",
            "job_title": "Business Analyst",
            "role_category": "Consulting"
        }
        
        questions = {
            "behavioral": [],
            "technical_coding": [],
            "system_design": [],
            "technical_concepts": [],
            "company_specific": [],
            "real_questions": []
        }
        
        enriched = extractor.enrich_questions(questions, job_details)
        
        assert enriched["_metadata"]["role_category"] == "Consulting"
        assert "behavioral" in enriched["_metadata"]["priority_categories"]
        assert "company_specific" in enriched["_metadata"]["priority_categories"]
    
    @pytest.mark.skip(reason="Requires OpenAI API - may be slow/expensive")
    def test_extract_questions_with_ai(self, extractor, sample_content, sample_job_details):
        """Test AI-powered question extraction"""
        questions = extractor.extract_questions_with_ai(sample_content, sample_job_details)
        
        assert isinstance(questions, dict)
        assert "behavioral" in questions
        assert "technical_coding" in questions
    
    def test_extract_questions_convenience(self, sample_content, sample_job_details):
        """Test convenience function"""
        # This will use fallback if OpenAI not available
        questions = extract_questions(sample_content, sample_job_details)
        
        assert isinstance(questions, dict)
        assert "_metadata" in questions

