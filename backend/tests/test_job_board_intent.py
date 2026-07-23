"""
Unit tests for Phase 1: Intent Plumbing
Tests for get_user_career_profile() and normalize_intent()
"""
import pytest
from datetime import datetime
from unittest.mock import Mock, patch

# Import the functions we're testing
from app.routes.job_board import get_user_career_profile, normalize_intent


class TestGetUserCareerProfile:
    """Tests for get_user_career_profile() intent extraction"""
    
    @patch('app.routes.job_board.get_db')
    @patch('app.routes.job_board._get_cached_user_profile')
    def test_extract_preferred_location_from_location(self, mock_cache, mock_get_db):
        """Test that preferredLocation is extracted from location.preferredLocation"""
        mock_cache.return_value = None  # No cache
        
        # Mock Firestore document
        mock_db = Mock()
        mock_user_ref = Mock()
        mock_user_doc = Mock()
        mock_user_doc.exists = True
        mock_user_doc.to_dict.return_value = {
            "location": {
                "preferredLocation": ["New York, NY", "San Francisco, CA"]
            },
            "resumeParsed": {},
            "professionalInfo": {}
        }
        mock_user_ref.get.return_value = mock_user_doc
        mock_db.collection.return_value.document.return_value = mock_user_ref
        mock_get_db.return_value = mock_db
        
        result = get_user_career_profile("test_uid")
        
        assert result["preferred_location"] == ["New York, NY", "San Francisco, CA"]
    
    @patch('app.routes.job_board.get_db')
    @patch('app.routes.job_board._get_cached_user_profile')
    def test_extract_career_interests_from_location(self, mock_cache, mock_get_db):
        """Test that careerInterests is extracted from location.interests"""
        mock_cache.return_value = None
        
        mock_db = Mock()
        mock_user_ref = Mock()
        mock_user_doc = Mock()
        mock_user_doc.exists = True
        mock_user_doc.to_dict.return_value = {
            "location": {
                "interests": ["Investment Banking", "Private Equity"]
            },
            "resumeParsed": {},
            "professionalInfo": {}
        }
        mock_user_ref.get.return_value = mock_user_doc
        mock_db.collection.return_value.document.return_value = mock_user_ref
        mock_get_db.return_value = mock_db
        
        result = get_user_career_profile("test_uid")
        
        assert "Investment Banking" in result["interests"]
        assert "Private Equity" in result["interests"]
    
    @patch('app.routes.job_board.get_db')
    @patch('app.routes.job_board._get_cached_user_profile')
    def test_extract_job_types_from_location(self, mock_cache, mock_get_db):
        """Test that jobTypes is extracted from location.jobTypes"""
        mock_cache.return_value = None
        
        mock_db = Mock()
        mock_user_ref = Mock()
        mock_user_doc = Mock()
        mock_user_doc.exists = True
        mock_user_doc.to_dict.return_value = {
            "location": {
                "jobTypes": ["Internship"]
            },
            "resumeParsed": {},
            "professionalInfo": {}
        }
        mock_user_ref.get.return_value = mock_user_doc
        mock_db.collection.return_value.document.return_value = mock_user_ref
        mock_get_db.return_value = mock_db
        
        result = get_user_career_profile("test_uid")
        
        assert result["job_types"] == ["Internship"]
    
    @patch('app.routes.job_board.get_db')
    @patch('app.routes.job_board._get_cached_user_profile')
    def test_extract_graduation_month_from_academics(self, mock_cache, mock_get_db):
        """Test that graduationMonth is extracted from academics.graduationMonth"""
        mock_cache.return_value = None
        
        mock_db = Mock()
        mock_user_ref = Mock()
        mock_user_doc = Mock()
        mock_user_doc.exists = True
        mock_user_doc.to_dict.return_value = {
            "academics": {
                "graduationMonth": "May",
                "graduationYear": "2026"
            },
            "resumeParsed": {},
            "professionalInfo": {}
        }
        mock_user_ref.get.return_value = mock_user_doc
        mock_db.collection.return_value.document.return_value = mock_user_ref
        mock_get_db.return_value = mock_db
        
        result = get_user_career_profile("test_uid")
        
        assert result["graduation_month"] == "May"
        assert result["graduation_year"] == 2026
    
    @patch('app.routes.job_board.get_db')
    @patch('app.routes.job_board._get_cached_user_profile')
    def test_extract_degree_from_academics(self, mock_cache, mock_get_db):
        """Test that degree is extracted from academics.degree"""
        mock_cache.return_value = None
        
        mock_db = Mock()
        mock_user_ref = Mock()
        mock_user_doc = Mock()
        mock_user_doc.exists = True
        mock_user_doc.to_dict.return_value = {
            "academics": {
                "degree": "bachelor"
            },
            "resumeParsed": {},
            "professionalInfo": {}
        }
        mock_user_ref.get.return_value = mock_user_doc
        mock_db.collection.return_value.document.return_value = mock_user_ref
        mock_get_db.return_value = mock_db
        
        result = get_user_career_profile("test_uid")
        
        assert result["degree"] == "bachelor"
    
    @patch('app.routes.job_board.get_db')
    @patch('app.routes.job_board._get_cached_user_profile')
    def test_resume_present_flag(self, mock_cache, mock_get_db):
        """Test that resume_present is True when resumeParsed exists"""
        mock_cache.return_value = None
        
        mock_db = Mock()
        mock_user_ref = Mock()
        mock_user_doc = Mock()
        mock_user_doc.exists = True
        mock_user_doc.to_dict.return_value = {
            "resumeParsed": {
                "major": "Finance",
                "university": "USC"
            },
            "professionalInfo": {}
        }
        mock_user_ref.get.return_value = mock_user_doc
        mock_db.collection.return_value.document.return_value = mock_user_ref
        mock_get_db.return_value = mock_db
        
        result = get_user_career_profile("test_uid")
        
        assert result["resume_present"] is True
    
    @patch('app.routes.job_board.get_db')
    @patch('app.routes.job_board._get_cached_user_profile')
    def test_resume_not_present_flag(self, mock_cache, mock_get_db):
        """Test that resume_present is False when no resume"""
        mock_cache.return_value = None
        
        mock_db = Mock()
        mock_user_ref = Mock()
        mock_user_doc = Mock()
        mock_user_doc.exists = True
        mock_user_doc.to_dict.return_value = {
            "resumeParsed": None,
            "resumeUrl": None,
            "professionalInfo": {}
        }
        mock_user_ref.get.return_value = mock_user_doc
        mock_db.collection.return_value.document.return_value = mock_user_ref
        mock_get_db.return_value = mock_db
        
        result = get_user_career_profile("test_uid")
        
        assert result["resume_present"] is False
    
    @patch('app.routes.job_board.get_db')
    @patch('app.routes.job_board._get_cached_user_profile')
    def test_backwards_compatibility_job_types(self, mock_cache, mock_get_db):
        """Test backwards compatibility: fallback to top-level jobTypes if location.jobTypes missing"""
        mock_cache.return_value = None
        
        mock_db = Mock()
        mock_user_ref = Mock()
        mock_user_doc = Mock()
        mock_user_doc.exists = True
        mock_user_doc.to_dict.return_value = {
            "location": {},  # No jobTypes here
            "jobTypes": ["Full-Time"],  # Top-level fallback
            "resumeParsed": {},
            "professionalInfo": {}
        }
        mock_user_ref.get.return_value = mock_user_doc
        mock_db.collection.return_value.document.return_value = mock_user_ref
        mock_get_db.return_value = mock_db
        
        result = get_user_career_profile("test_uid")
        
        assert result["job_types"] == ["Full-Time"]


class TestNormalizeIntent:
    """Tests for normalize_intent() function"""
    
    def test_normalize_career_domains_from_interests(self):
        """Test that career interests map to canonical domains"""
        user_profile = {
            "interests": ["Investment Banking", "Private Equity"],
            "preferred_location": ["New York, NY"],
            "job_types": ["Internship"],
            "graduation_year": 2026,
            "major": "Finance"
        }
        
        intent = normalize_intent(user_profile)
        
        assert "finance_banking" in intent["career_domains"]
    
    def test_normalize_career_domains_from_major_fallback(self):
        """Test that major is used to infer domain when interests missing"""
        user_profile = {
            "interests": [],  # No interests
            "preferred_location": [],
            "job_types": [],
            "graduation_year": None,
            "major": "Computer Science"
        }
        
        intent = normalize_intent(user_profile)
        
        assert "technology" in intent["career_domains"]
    
    def test_normalize_locations(self):
        """Test location normalization"""
        user_profile = {
            "interests": [],
            "preferred_location": ["NYC", "San Francisco"],
            "job_types": [],
            "graduation_year": None,
            "major": ""
        }
        
        intent = normalize_intent(user_profile)
        
        assert "New York, NY" in intent["preferred_locations"]
        assert "San Francisco, CA" in intent["preferred_locations"]
    
    def test_normalize_job_types(self):
        """Test job type normalization"""
        user_profile = {
            "interests": [],
            "preferred_location": [],
            "job_types": ["Internship", "Full-Time"],
            "graduation_year": None,
            "major": ""
        }
        
        intent = normalize_intent(user_profile)
        
        assert "internship" in intent["job_types"]
        assert "full-time" in intent["job_types"]
    
    def test_graduation_timing_calculation(self):
        """Test graduation timing calculation"""
        current_year = datetime.now().year
        graduation_year = current_year + 2  # 2 years from now
        
        user_profile = {
            "interests": [],
            "preferred_location": [],
            "job_types": [],
            "graduation_year": graduation_year,
            "graduation_month": "May",
            "major": ""
        }
        
        intent = normalize_intent(user_profile)
        
        assert intent["graduation_timing"]["graduation_year"] == graduation_year
        assert intent["graduation_timing"]["graduation_month"] == "May"
        assert intent["graduation_timing"]["career_phase"] == "internship"  # >12 months
        assert intent["graduation_timing"]["months_until_graduation"] is not None
        assert intent["graduation_timing"]["months_until_graduation"] > 12
    
    def test_career_phase_new_grad(self):
        """Test career phase for new grad (graduating within 12 months)"""
        current_year = datetime.now().year
        graduation_year = current_year  # Graduating this year (within 0-12 months)
        
        user_profile = {
            "interests": [],
            "preferred_location": [],
            "job_types": [],
            "graduation_year": graduation_year,
            "graduation_month": "May",
            "major": ""
        }
        
        intent = normalize_intent(user_profile)
        
        assert intent["graduation_timing"]["career_phase"] == "new_grad"
    
    def test_missing_data_handling(self):
        """Test that missing data doesn't throw errors"""
        user_profile = {
            # Minimal profile - most fields missing
            "major": ""
        }
        
        # Should not raise exception
        intent = normalize_intent(user_profile)
        
        assert intent is not None
        assert "career_domains" in intent
        assert "preferred_locations" in intent
        assert "job_types" in intent
        assert "graduation_timing" in intent
        assert "education_context" in intent
        assert "resume_present" in intent
    
    def test_resume_present_flag(self):
        """Test resume_present flag is preserved"""
        user_profile = {
            "interests": [],
            "preferred_location": [],
            "job_types": [],
            "graduation_year": None,
            "major": "",
            "resume_present": True
        }
        
        intent = normalize_intent(user_profile)
        
        assert intent["resume_present"] is True
    
    def test_education_context_extraction(self):
        """Test education context (degree, university) extraction"""
        user_profile = {
            "interests": [],
            "preferred_location": [],
            "job_types": [],
            "graduation_year": None,
            "major": "Finance",
            "degree": "bachelor",
            "university": "USC"
        }
        
        intent = normalize_intent(user_profile)
        
        assert intent["education_context"]["degree"] == "bachelor"
        assert intent["education_context"]["university"] == "USC"
    
    def test_remote_location_handling(self):
        """Test that 'Remote' location is preserved as-is"""
        user_profile = {
            "interests": [],
            "preferred_location": ["Remote"],
            "job_types": [],
            "graduation_year": None,
            "major": ""
        }
        
        intent = normalize_intent(user_profile)
        
        assert "Remote" in intent["preferred_locations"]


if __name__ == "__main__":
    pytest.main([__file__, "-v"])



class TestProfessionalCareerStage:
    """Multi-audience: professionals get real career stages and the
    seniority gate filters bidirectionally."""

    def _contract_for(self, **profile_overrides):
        profile = {
            "interests": ["Software Engineering"],
            "preferred_location": ["New York, NY"],
            "job_types": ["Full-Time"],
            "graduation_year": None,
            "graduation_month": None,
            "degree": None,
            "university": "",
            "resume_present": True,
            "experiences": [],
            "major": "",
        }
        profile.update(profile_overrides)
        return normalize_intent(profile)

    def test_professional_with_stated_years_gets_senior_stage(self):
        contract = self._contract_for(
            user_type="professional", years_experience_stated=12
        )
        timing = contract["graduation_timing"]
        assert timing["career_phase"] == "senior"
        assert timing["is_student"] is False

    def test_dated_resume_experience_drives_stage(self):
        year = datetime.now().year - 6
        contract = self._contract_for(
            experiences=[{"title": "Consultant", "company": "Deloitte",
                          "dates": f"June {year} - Present", "keywords": []}]
        )
        assert contract["graduation_timing"]["career_phase"] == "mid_level"

    def test_old_grad_year_is_not_new_grad_anymore(self):
        contract = self._contract_for(graduation_year=datetime.now().year - 20)
        assert contract["graduation_timing"]["career_phase"] in ("senior", "executive")

    def test_student_defaults_preserved(self):
        contract = self._contract_for(
            graduation_year=datetime.now().year + 2
        )
        assert contract["graduation_timing"]["career_phase"] == "internship"


class TestBidirectionalSeniorityGate:
    """apply_hard_gate_seniority end-to-end with real intent contracts."""

    def _gate(self, job_title, career_phase, job_desc=""):
        from app.routes.job_board import apply_hard_gate_seniority
        job = {"title": job_title, "description": job_desc}
        contract = {
            "career_domains": ["technology"],
            "graduation_timing": {
                "career_phase": career_phase,
                "months_until_graduation": None,
            },
        }
        return apply_hard_gate_seniority(job, contract)

    def test_student_blocked_from_vp_role(self):
        passes, reason = self._gate("Vice President of Engineering", "internship")
        assert not passes
        assert "seniority_too_high" in reason

    def test_student_blocked_from_senior_role(self):
        passes, reason = self._gate("Senior Software Engineer", "internship")
        assert not passes

    def test_student_allowed_internship(self):
        passes, _ = self._gate("Software Engineer Intern", "internship")
        assert passes

    def test_senior_user_blocked_from_internship(self):
        passes, reason = self._gate("Software Engineer Intern", "senior")
        assert not passes
        assert "seniority_too_low" in reason

    def test_senior_user_blocked_from_new_grad_role(self):
        passes, reason = self._gate("New Grad Software Engineer", "senior")
        assert not passes
        assert "seniority_too_low" in reason

    def test_senior_user_allowed_senior_role(self):
        passes, _ = self._gate("Senior Software Engineer", "senior")
        assert passes

    def test_executive_allowed_vp_role(self):
        passes, _ = self._gate("Vice President of Engineering", "executive")
        assert passes

    def test_mid_level_blocked_from_internship(self):
        passes, _ = self._gate("Marketing Intern", "mid_level")
        assert not passes

    def test_ambiguous_title_allowed_for_everyone(self):
        for phase in ("internship", "new_grad", "early_career",
                      "mid_level", "senior", "executive"):
            passes, _ = self._gate("Software Engineer", phase)
            assert passes, phase
