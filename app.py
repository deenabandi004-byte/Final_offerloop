"""
Shim file - delegates to backend.wsgi
"""
import sys
import os

# Add backend to path
root_dir = os.path.dirname(os.path.abspath(__file__))
backend_path = os.path.join(root_dir, 'backend')
if backend_path not in sys.path:
    sys.path.insert(0, backend_path)

# Import app from backend.wsgi
from backend.wsgi import app

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5001))
    app.run(host='0.0.0.0', port=port, debug=True)