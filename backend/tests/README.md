# Backend Test Suite

## Overview

Test suite for Offerloop backend API. Currently includes unit tests for validation and exception handling.

## Running Tests

### Install Dependencies
```bash
pip install -r requirements.txt
```

### Run All Tests
```bash
pytest
```

### Run with Coverage
```bash
pytest --cov=app --cov-report=html
```

### Run Specific Test File
```bash
pytest tests/test_validation.py
```

### Run Specific Test
```bash
pytest tests/test_validation.py::TestContactSearchValidation::test_valid_request
```

## Test Structure

```
tests/
├── __init__.py
├── conftest.py          # Pytest fixtures and configuration
├── test_validation.py   # Input validation tests
└── test_exceptions.py  # Exception handling tests
```

## Adding New Tests

1. Create test file: `tests/test_<feature>.py`
2. Import pytest and necessary modules
3. Use fixtures from `conftest.py`
4. Follow naming convention: `test_<description>`

Example:
```python
def test_feature_name():
    """Test description"""
    # Arrange
    data = {...}
    
    # Act
    result = function_to_test(data)
    
    # Assert
    assert result == expected
```

## Test Coverage Goals

- **Current:** Basic validation and exception tests
- **Target:** 50%+ coverage
- **Priority Areas:**
  - API endpoints
  - Service layer functions
  - Utility functions
  - Error handling

## Continuous Integration

Tests should be run:
- Before committing code
- In CI/CD pipeline
- Before deploying to production
