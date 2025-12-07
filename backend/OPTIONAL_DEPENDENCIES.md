# Optional Dependencies

Some features require additional packages. The app will run without them, but you'll get warnings.

## Sentry Error Tracking

**Package:** `sentry-sdk[flask]`

**Install:**
```bash
pip install sentry-sdk[flask]
```

**Configure:**
```bash
export SENTRY_DSN="your-sentry-dsn-here"
```

**What it does:**
- Automatic error tracking and reporting
- Performance monitoring
- Production debugging

**Without it:**
- App runs normally
- No error tracking
- You'll see: `⚠️ sentry_sdk not installed`

## Swagger API Documentation

**Package:** `flasgger`

**Install:**
```bash
pip install flasgger
```

**Access:**
- Development mode: `http://localhost:5001/apidocs`
- Automatically enabled when `FLASK_ENV=development`

**What it does:**
- Interactive API documentation
- Test endpoints in browser
- OpenAPI specification

**Without it:**
- App runs normally
- No `/apidocs` endpoint
- You'll see: `⚠️ flasgger not installed`

## Testing

**Packages:** `pytest`, `pytest-cov`, `pytest-mock`

**Install:**
```bash
pip install pytest pytest-cov pytest-mock
```

**Run tests:**
```bash
cd backend
pytest
```

**What it does:**
- Run test suite
- Generate coverage reports
- Validate code changes

**Without it:**
- App runs normally
- Can't run tests
- Tests are optional for development

## Quick Install All Optional Dependencies

```bash
pip install sentry-sdk[flask] flasgger pytest pytest-cov pytest-mock
```

## Required vs Optional

**Required (always needed):**
- Flask, Firebase, Pydantic, etc. (in requirements.txt)

**Optional (nice to have):**
- Sentry (error tracking)
- Swagger (API docs)
- Pytest (testing)

The app is designed to work without optional dependencies - they just add extra features!
