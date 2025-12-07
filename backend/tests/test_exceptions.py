"""
Tests for custom exception classes
"""
import pytest
from app.utils.exceptions import (
    OfferloopException,
    ValidationError,
    AuthenticationError,
    NotFoundError,
    InsufficientCreditsError,
    ExternalAPIError
)


class TestOfferloopException:
    """Test base exception class"""
    
    def test_basic_exception(self):
        """Test basic exception creation"""
        exc = OfferloopException("Test error")
        assert exc.message == "Test error"
        assert exc.status_code == 500
        assert exc.error_code == "INTERNAL_ERROR"
    
    def test_exception_to_dict(self):
        """Test exception serialization"""
        exc = OfferloopException("Test error", details={"key": "value"})
        result = exc.to_dict()
        assert result["error"] == "Test error"
        assert result["error_code"] == "INTERNAL_ERROR"
        assert result["details"] == {"key": "value"}
    
    def test_exception_to_response(self):
        """Test exception to Flask response"""
        exc = OfferloopException("Test error")
        response, status = exc.to_response()
        assert status == 500


class TestValidationError:
    """Test validation error"""
    
    def test_validation_error(self):
        """Test validation error creation"""
        exc = ValidationError("Invalid input", field="email")
        assert exc.message == "Validation error for field 'email': Invalid input"
        assert exc.status_code == 400
        assert exc.error_code == "VALIDATION_ERROR"


class TestInsufficientCreditsError:
    """Test insufficient credits error"""
    
    def test_credits_error(self):
        """Test credits error with details"""
        exc = InsufficientCreditsError(required=15, available=5)
        assert "15" in exc.message
        assert "5" in exc.message
        assert exc.status_code == 402
        assert exc.details["required"] == 15
        assert exc.details["available"] == 5


class TestNotFoundError:
    """Test not found error"""
    
    def test_not_found_error(self):
        """Test not found error"""
        exc = NotFoundError("Contact")
        assert exc.message == "Contact not found"
        assert exc.status_code == 404


class TestExternalAPIError:
    """Test external API error"""
    
    def test_external_api_error(self):
        """Test external API error"""
        exc = ExternalAPIError("PDL", "API timeout")
        assert "PDL" in exc.message
        assert exc.status_code == 502
        assert exc.details["service"] == "PDL"
