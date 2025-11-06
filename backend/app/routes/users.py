"""
User management routes
"""
from flask import Blueprint

users_bp = Blueprint('users', __name__, url_prefix='/api/users')

# User-specific routes can be added here if needed
# Most user management is handled in billing.py

