import os
from flask import Blueprint, send_from_directory, current_app

bp = Blueprint("spa", __name__, static_folder=None)

@bp.route("/", defaults={"path": ""})
@bp.route("/<path:path>")
def spa(path):
    # Serve built React files from connect-grow-hire/dist
    static_dir = os.path.abspath(os.path.join(current_app.root_path, "../../connect-grow-hire/dist"))
    full = os.path.join(static_dir, path)
    if path and os.path.exists(full) and not path.startswith("api/"):
        return send_from_directory(static_dir, path)
    return send_from_directory(static_dir, "index.html")
