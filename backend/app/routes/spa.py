"""
SPA (Single Page Application) routes - serve frontend
"""
from flask import Blueprint, send_from_directory, abort, current_app
import os

spa_bp = Blueprint('spa', __name__)


@spa_bp.route("/", defaults={"path": ""})
@spa_bp.route("/<path:path>")
def serve_spa(path):
    """Serve the SPA for all routes that don't match API or health endpoints"""
    # Don't serve SPA for API routes, health checks, or ping endpoints
    if path.startswith(("api/", "health", "ping", "healthz")):
        abort(404)
    
    # Get static folder from Flask app configuration
    static_folder = current_app.static_folder
    if not static_folder:
        abort(404)
    
    # Check if requested path exists as a file
    full_path = os.path.join(static_folder, path)
    if os.path.exists(full_path) and os.path.isfile(full_path):
        return send_from_directory(static_folder, path)
    
    # Default to index.html for SPA routing
    return send_from_directory(static_folder, "index.html")
