# Installing LibreOffice for Format-Preserving Resume Optimization

## Issue
The `/optimize-resume-v2` endpoint requires LibreOffice to be installed on the server. If you see a 503 error with "libreoffice_not_installed", you need to install LibreOffice.

## Installation Instructions

### macOS (Development)
```bash
brew install libreoffice
```

### Linux (Production/Development)
```bash
# Ubuntu/Debian
sudo apt-get update
sudo apt-get install -y libreoffice

# CentOS/RHEL
sudo yum install -y libreoffice
```

### Docker
Add to your Dockerfile:
```dockerfile
RUN apt-get update && apt-get install -y libreoffice && rm -rf /var/lib/apt/lists/*
```

## Verify Installation
```bash
which libreoffice || which soffice
```

Should return a path like `/usr/bin/libreoffice` or `/usr/local/bin/libreoffice`

## Test the Installation
```bash
libreoffice --version
```

Should show something like:
```
LibreOffice 7.x.x.x
```

## After Installation
1. Restart your Flask/backend server
2. The `/optimize-resume-v2` endpoint should now work
3. Test with a resume upload

## Alternative: Use Old Endpoint
If you can't install LibreOffice right now, the frontend can fall back to the old `/optimize-resume` endpoint which doesn't preserve formatting but still works.

