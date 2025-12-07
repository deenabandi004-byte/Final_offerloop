"""
Custom exception classes for consistent error handling
"""
from flask import jsonify


class OfferloopException(Exception):
    """Base exception for all Offerloop errors"""
    status_code = 500
    error_code = "INTERNAL_ERROR"
    
    def __init__(self, message: str, error_code: str = None, details: dict = None):
        self.message = message
        self.error_code = error_code or self.error_code
        self.details = details or {}
        super().__init__(self.message)
    
    def to_dict(self):
        return {
            'error': self.message,
            'error_code': self.error_code,
            'details': self.details
        }
    
    def to_response(self):
        return jsonify(self.to_dict()), self.status_code


class ValidationError(OfferloopException):
    """Input validation error"""
    status_code = 400
    error_code = "VALIDATION_ERROR"
    
    def __init__(self, message: str, field: str = None, details: dict = None):
        if field:
            message = f"Validation error for field '{field}': {message}"
        super().__init__(message, self.error_code, details)


class AuthenticationError(OfferloopException):
    """Authentication/authorization error"""
    status_code = 401
    error_code = "AUTH_ERROR"
    
    def __init__(self, message: str = "Authentication required", details: dict = None):
        super().__init__(message, self.error_code, details)


class AuthorizationError(OfferloopException):
    """Permission denied error"""
    status_code = 403
    error_code = "AUTHORIZATION_ERROR"
    
    def __init__(self, message: str = "Permission denied", details: dict = None):
        super().__init__(message, self.error_code, details)


class NotFoundError(OfferloopException):
    """Resource not found error"""
    status_code = 404
    error_code = "NOT_FOUND"
    
    def __init__(self, resource: str = "Resource", details: dict = None):
        message = f"{resource} not found"
        super().__init__(message, self.error_code, details)


class InsufficientCreditsError(OfferloopException):
    """Insufficient credits error"""
    status_code = 402
    error_code = "INSUFFICIENT_CREDITS"
    
    def __init__(self, required: int, available: int, details: dict = None):
        message = f"Insufficient credits. Required: {required}, Available: {available}"
        super().__init__(message, self.error_code, {
            'required': required,
            'available': available,
            **(details or {})
        })


class ExternalAPIError(OfferloopException):
    """External API error (PDL, Hunter, etc.)"""
    status_code = 502
    error_code = "EXTERNAL_API_ERROR"
    
    def __init__(self, service: str, message: str = None, details: dict = None):
        if not message:
            message = f"{service} API error. Please try again later."
        super().__init__(message, self.error_code, {
            'service': service,
            **(details or {})
        })


class RateLimitError(OfferloopException):
    """Rate limit exceeded error"""
    status_code = 429
    error_code = "RATE_LIMIT_EXCEEDED"
    
    def __init__(self, message: str = "Rate limit exceeded. Please try again later.", retry_after: int = None, details: dict = None):
        error_details = details or {}
        if retry_after:
            error_details['retry_after'] = retry_after
        super().__init__(message, self.error_code, error_details)


def handle_offerloop_exception(e: OfferloopException):
    """Flask error handler for Offerloop exceptions"""
    return e.to_response()


def register_error_handlers(app):
    """Register error handlers with Flask app"""
    app.register_error_handler(OfferloopException, handle_offerloop_exception)
    
    @app.errorhandler(400)
    def bad_request(e):
        return jsonify({
            'error': 'Bad request',
            'error_code': 'BAD_REQUEST',
            'details': {'message': str(e)}
        }), 400
    
    @app.errorhandler(404)
    def not_found(e):
        return jsonify({
            'error': 'Resource not found',
            'error_code': 'NOT_FOUND',
            'details': {}
        }), 404
    
    @app.errorhandler(500)
    def internal_error(e):
        return jsonify({
            'error': 'An unexpected error occurred. Please try again later.',
            'error_code': 'INTERNAL_ERROR',
            'details': {}
        }), 500
