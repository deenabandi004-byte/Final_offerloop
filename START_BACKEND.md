# How to Start the Backend Server

## Quick Start

The backend server needs to be running for the frontend to work. Here's how to start it:

### Option 1: Using main.py (Recommended)

From the project root directory:

```bash
python3 main.py
```

Or:

```bash
python main.py
```

The server will start on `http://localhost:5001` by default.

### Option 2: Using wsgi.py directly

From the backend directory:

```bash
cd backend
python3 -m backend.wsgi
```

Or set the PORT environment variable:

```bash
PORT=5001 python3 main.py
```

## Prerequisites

1. **Install Python dependencies:**
   ```bash
   cd backend
   pip install -r requirements.txt
   ```
   
   **Note:** Some features (Sentry, Swagger) are optional. The app will run without them.
   See `backend/OPTIONAL_DEPENDENCIES.md` for details.

2. **Set up environment variables:**
   Create a `.env` file in the project root with:
   ```env
   OPENAI_API_KEY=your_key
   PEOPLE_DATA_LABS_API_KEY=your_key
   STRIPE_SECRET_KEY=your_key
   GOOGLE_CLIENT_ID=your_id
   GOOGLE_CLIENT_SECRET=your_secret
   GOOGLE_APPLICATION_CREDENTIALS=path/to/firebase-credentials.json
   FLASK_SECRET=your_secret
   FLASK_ENV=development
   ```

3. **Firebase credentials:**
   Make sure `firebase-credentials.json` exists and is properly configured.

## Verify Server is Running

Once started, you should see:
```
🚀 Initializing app extensions...
✅ App extensions initialized
✅ Error handlers registered
 * Running on http://0.0.0.0:5001
```

You can test it with:
```bash
curl http://localhost:5001/api/health
```

## Troubleshooting

### Port Already in Use
If port 5001 is already in use:
```bash
PORT=5002 python3 main.py
```
Then update your frontend API base URL to use port 5002.

### Import Errors
Make sure you're running from the project root and all dependencies are installed:
```bash
pip install -r backend/requirements.txt
```

### Firebase Errors
Verify your `GOOGLE_APPLICATION_CREDENTIALS` path is correct and the file exists.

## Development Mode

The server runs in debug mode by default when using `main.py`, which provides:
- Auto-reload on code changes
- Detailed error messages
- Debug toolbar (if installed)

## Production Mode

For production, use Gunicorn:
```bash
gunicorn backend.wsgi:app --bind 0.0.0.0:5001
```
