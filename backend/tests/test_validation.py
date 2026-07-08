"""
Tests for input validation
"""
import pytest
from app.utils.validation import (
    ContactSearchRequest,
    FirmSearchRequest,
    CoffeeChatPrepRequest,
    validate_request
)
from app.utils.exceptions import ValidationError


class TestContactSearchValidation:
    """Test contact search request validation"""
    
    def test_valid_request(self):
        """Test valid contact search request"""
        data = {
            "jobTitle": "Software Engineer",
            "company": "Google",
            "location": "San Francisco, CA"
        }
        result = validate_request(ContactSearchRequest, data)
        assert result["jobTitle"] == "Software Engineer"
        assert result["company"] == "Google"
        assert result["location"] == "San Francisco, CA"
    
    def test_missing_required_field(self):
        """Test missing required field"""
        data = {
            "company": "Google",
            "location": "San Francisco, CA"
        }
        with pytest.raises(ValidationError):
            validate_request(ContactSearchRequest, data)
    
    def test_empty_string(self):
        """Test empty string validation"""
        data = {
            "jobTitle": "",
            "company": "Google",
            "location": "San Francisco, CA"
        }
        with pytest.raises(ValidationError):
            validate_request(ContactSearchRequest, data)
    
    def test_batch_size_validation(self):
        """Test batch size limits"""
        # Pins the schema's own cap (Field le=..., currently 15) so the test
        # tracks the constant instead of a stale magic number.
        field = ContactSearchRequest.model_fields["batchSize"]
        max_batch = next(m.le for m in field.metadata if hasattr(m, "le"))
        data = {
            "jobTitle": "Engineer",
            "company": "Google",
            "location": "SF",
            "batchSize": max_batch + 1  # Exceeds the schema maximum
        }
        with pytest.raises(ValidationError):
            validate_request(ContactSearchRequest, data)
        # At the cap it must validate cleanly
        data["batchSize"] = max_batch
        assert validate_request(ContactSearchRequest, data)["batchSize"] == max_batch


class TestFirmSearchValidation:
    """Test firm search request validation"""
    
    def test_valid_request(self):
        """Test valid firm search request"""
        data = {
            "query": "investment banks in New York"
        }
        result = validate_request(FirmSearchRequest, data)
        assert result["query"] == "investment banks in New York"
    
    def test_empty_query(self):
        """Test empty query"""
        data = {
            "query": ""
        }
        with pytest.raises(ValidationError):
            validate_request(FirmSearchRequest, data)


class TestCoffeeChatPrepValidation:
    """Test coffee chat prep request validation"""
    
    def test_valid_linkedin_url(self):
        """Test valid LinkedIn URL"""
        data = {
            "linkedinUrl": "https://www.linkedin.com/in/johndoe"
        }
        result = validate_request(CoffeeChatPrepRequest, data)
        assert "linkedin.com" in result["linkedinUrl"]
    
    def test_invalid_linkedin_url(self):
        """Test invalid LinkedIn URL"""
        data = {
            "linkedinUrl": "not-a-linkedin-url"
        }
        with pytest.raises(ValidationError):
            validate_request(CoffeeChatPrepRequest, data)


