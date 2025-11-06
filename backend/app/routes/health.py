from flask import Blueprint, jsonify
bp = Blueprint("health", __name__)

@bp.get("/ping")
def ping():
    return "pong", 200

@bp.get("/health")
def health():
    return jsonify({"ok": True}), 200
