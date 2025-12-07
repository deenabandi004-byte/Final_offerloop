"""
Input validation schemas using Pydantic
"""
from pydantic import BaseModel, Field, EmailStr, HttpUrl, field_validator
from typing import Optional, List
from app.utils.exceptions import ValidationError


class ContactSearchRequest(BaseModel):
    """Validation schema for contact search requests"""
    jobTitle: str = Field(..., min_length=1, max_length=200, description="Job title to search for")
    company: str = Field(..., min_length=1, max_length=200, description="Company name")
    location: str = Field(..., min_length=1, max_length=200, description="Location (city, state)")
    collegeAlumni: Optional[str] = Field(None, max_length=200, description="College name for alumni filter")
    batchSize: Optional[int] = Field(None, ge=1, le=10, description="Number of contacts to return")
    careerInterests: Optional[List[str]] = Field(None, max_length=10, description="Career interests")
    userProfile: Optional[dict] = Field(None, description="User profile data")
    
    @field_validator('jobTitle', 'company', 'location')
    @classmethod
    def validate_not_empty(cls, v):
        if not v or not v.strip():
            raise ValueError('Field cannot be empty')
        return v.strip()
    
    @field_validator('batchSize')
    @classmethod
    def validate_batch_size(cls, v, info):
        if v is None:
            return None
        if v < 1:
            raise ValueError('Batch size must be at least 1')
        if v > 10:
            raise ValueError('Batch size cannot exceed 10')
        return v


class FirmSearchRequest(BaseModel):
    """Validation schema for firm search requests"""
    query: str = Field(..., min_length=1, max_length=500, description="Search query")
    batchSize: Optional[int] = Field(None, ge=1, le=40, description="Number of firms to return")
    
    @field_validator('query')
    @classmethod
    def validate_query(cls, v):
        if not v or not v.strip():
            raise ValueError('Search query cannot be empty')
        return v.strip()


class CoffeeChatPrepRequest(BaseModel):
    """Validation schema for coffee chat prep requests"""
    linkedinUrl: str = Field(..., description="LinkedIn profile URL")
    timeWindow: Optional[str] = Field(None, description="Time window for news search")
    geo: Optional[str] = Field(None, description="Geographic region")
    language: Optional[str] = Field(None, description="Language")
    division: Optional[str] = Field(None, description="Division/Department")
    office: Optional[str] = Field(None, description="Office location")
    industry: Optional[str] = Field(None, description="Industry")
    
    @field_validator('linkedinUrl')
    @classmethod
    def validate_linkedin_url(cls, v):
        if not v or not v.strip():
            raise ValueError('LinkedIn URL is required')
        v = v.strip()
        # Accept various LinkedIn URL formats
        if 'linkedin.com' not in v.lower():
            raise ValueError('Invalid LinkedIn URL format')
        return v


class InterviewPrepRequest(BaseModel):
    """Validation schema for interview prep requests"""
    job_posting_url: Optional[HttpUrl] = Field(None, description="Job posting URL")
    company_name: Optional[str] = Field(None, min_length=1, max_length=200, description="Company name (if no URL)")
    job_title: Optional[str] = Field(None, min_length=1, max_length=200, description="Job title (if no URL)")
    
    @field_validator('company_name', 'job_title')
    @classmethod
    def validate_manual_input(cls, v, info):
        # If no URL, both company_name and job_title are required
        if not info.data.get('job_posting_url'):
            if not v:
                raise ValueError('Company name and job title are required when no URL is provided')
        return v.strip() if v else v


class ContactCreateRequest(BaseModel):
    """Validation schema for creating a contact"""
    firstName: str = Field(..., min_length=1, max_length=100)
    lastName: str = Field(..., min_length=1, max_length=100)
    email: Optional[EmailStr] = None
    linkedinUrl: Optional[str] = Field(None, max_length=500)
    company: Optional[str] = Field(None, max_length=200)
    jobTitle: Optional[str] = Field(None, max_length=200)
    college: Optional[str] = Field(None, max_length=200)
    location: Optional[str] = Field(None, max_length=200)


class ContactUpdateRequest(BaseModel):
    """Validation schema for updating a contact"""
    firstName: Optional[str] = Field(None, min_length=1, max_length=100)
    lastName: Optional[str] = Field(None, min_length=1, max_length=100)
    email: Optional[EmailStr] = None
    linkedinUrl: Optional[str] = Field(None, max_length=500)
    company: Optional[str] = Field(None, max_length=200)
    jobTitle: Optional[str] = Field(None, max_length=200)
    college: Optional[str] = Field(None, max_length=200)
    location: Optional[str] = Field(None, max_length=200)
    status: Optional[str] = Field(None, max_length=50)


def validate_request(schema_class: type[BaseModel], data: dict, raise_on_error: bool = True):
    """
    Validate request data against a Pydantic schema.
    
    Args:
        schema_class: Pydantic model class
        data: Request data to validate
        raise_on_error: If True, raise ValidationError. If False, return (is_valid, errors)
    
    Returns:
        If raise_on_error=True: Validated data dict
        If raise_on_error=False: (is_valid: bool, validated_data: dict, errors: list)
    """
    try:
        validated = schema_class(**data)
        if raise_on_error:
            return validated.model_dump(exclude_none=True)
        else:
            return True, validated.model_dump(exclude_none=True), []
    except Exception as e:
        if isinstance(e, ValidationError):
            raise
        # Convert Pydantic validation errors to our ValidationError
        errors = []
        if hasattr(e, 'errors'):
            for error in e.errors():
                field = '.'.join(str(x) for x in error.get('loc', []))
                message = error.get('msg', 'Validation error')
                errors.append(f"{field}: {message}")
        
        error_message = '; '.join(errors) if errors else str(e)
        
        if raise_on_error:
            raise ValidationError(error_message, details={'validation_errors': errors})
        else:
            return False, {}, errors
