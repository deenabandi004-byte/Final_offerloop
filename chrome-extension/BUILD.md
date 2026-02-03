# Chrome Extension Build Guide

## OAuth Client ID Management

The Chrome extension uses different OAuth client IDs for development and production environments because the extension ID differs between unpacked (dev) and published (Chrome Web Store) versions.

### Client IDs

- **Dev** (unpacked extension): `184607281467-133avt6brjfoqcpa1cnovjnerm0cve8a.apps.googleusercontent.com`
- **Production** (Chrome Web Store): `184607281467-lr2uub5flcdfnjognq3rk5nqe7atuodk.apps.googleusercontent.com`

### Default Configuration

By default, `manifest.json` is configured for **development** (dev client ID). This is the correct setting for local development with an unpacked extension.

### Switching Environments

Use the build script to switch between dev and production client IDs:

```bash
# Set to dev (default for local development)
node build.js
# or explicitly:
node build.js --dev

# Set to production (before packaging for Chrome Web Store)
node build.js --prod
```

### Workflow

1. **Local Development**: 
   - Use dev client ID (default)
   - Load extension as unpacked in Chrome
   - No need to run build script

2. **Before Publishing to Chrome Web Store**:
   ```bash
   node build.js --prod
   ```
   - This updates `manifest.json` with the production client ID
   - Package the extension (create .zip or .crx)
   - Upload to Chrome Web Store

3. **After Publishing**:
   ```bash
   node build.js --dev
   ```
   - Switch back to dev for continued local development

### Notes

- The build script only updates the `oauth2.client_id` field in `manifest.json`
- Always verify the client ID in `manifest.json` before packaging
- The production client ID must match the OAuth credential configured in Google Cloud Console for the published extension ID
