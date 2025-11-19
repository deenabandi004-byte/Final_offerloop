"""
Firebase service - initialization and helpers
"""
# Just import from extensions - don't duplicate
from app.extensions import get_db, init_firebase

# For backwards compatibility, re-export
__all__ = ['get_db', 'init_firebase']