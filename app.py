"""
Temporary shim file - delegates to backend.wsgi
This maintains backward compatibility while the refactored code is in backend/

IMPORTANT: This file must be imported from backend/ directory context
or with backend/ in PYTHONPATH to avoid conflicts with app package.
"""
import sys
import os
import importlib.util

# Get absolute paths
root_dir = os.path.dirname(os.path.abspath(__file__))
backend_path = os.path.join(root_dir, 'backend')

# CRITICAL: Remove root directory from sys.path if it's there
# This prevents Python from treating app.py as a module named 'app'
# We need to do this BEFORE importing anything
if root_dir in sys.path:
    sys.path.remove(root_dir)

# Add backend directory to Python path at the START
# This ensures app.extensions resolves to backend/app/extensions
if backend_path not in sys.path:
    sys.path.insert(0, backend_path)

# Change working directory to backend to ensure relative imports work
original_cwd = os.getcwd()
os.chdir(backend_path)

try:
    # Import wsgi directly - this will work because backend is in sys.path
    # and we've removed root_dir from sys.path
    import wsgi
    app = wsgi.app
finally:
    # Restore original working directory
    os.chdir(original_cwd)

# Export app for WSGI servers and direct execution
if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5001))
    app.run(host='0.0.0.0', port=port, debug=True)
