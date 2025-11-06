"""
Directory routes - SQLite contact storage
"""
import sqlite3
import os
from contextlib import contextmanager
from flask import Blueprint, request, jsonify
from datetime import date

from app.extensions import require_firebase_auth
from app.models.contact import normalize_contact
from app.config import DB_PATH

directory_bp = Blueprint('directory', __name__, url_prefix='/api/directory')


@contextmanager
def get_db():
    """Get SQLite database connection"""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
    finally:
        conn.close()


def save_contacts_sqlite(user_email: str, contacts: list) -> int:
    """Save contacts to SQLite"""
    if not user_email or not contacts:
        return 0
    rows = [normalize_contact(c) for c in contacts]
    with get_db() as db:
        cur = db.cursor()
        for r in rows:
            existing = cur.execute("""
              SELECT id FROM contacts WHERE user_email=? AND
                (linkedin=? AND linkedin<>'') OR (email=? AND email<>'')
            """, (user_email, r['LinkedIn'], r['Email'])).fetchone()
            if existing:
                continue
            cur.execute("""
              INSERT INTO contacts (
                user_email, first_name, last_name, linkedin, email, title, company, city, state, college,
                phone, personal_email, work_email, social_profiles, education_top, volunteer_history,
                work_summary, grp, hometown, similarity, status, first_contact_date, last_contact_date
              ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            """, (
              user_email, r['FirstName'], r['LastName'], r['LinkedIn'], r['Email'], r['Title'], r['Company'],
              r['City'], r['State'], r['College'], r['Phone'], r['PersonalEmail'], r['WorkEmail'],
              r['SocialProfiles'], r['EducationTop'], r['VolunteerHistory'], r['WorkSummary'],
              r['Group'], r['Hometown'], r['Similarity'], r['Status'], r['FirstContactDate'], r['LastContactDate']
            ))
        db.commit()
        return cur.rowcount or 0


def list_contacts_sqlite(user_email: str) -> list:
    """List contacts from SQLite"""
    if not user_email:
        return []
    with get_db() as db:
        rows = db.execute("""
          SELECT id, user_email, first_name, last_name, linkedin, email, title, company, city, state,
                 college, phone, personal_email, work_email, social_profiles, education_top, volunteer_history,
                 work_summary, grp, hometown, similarity, status, first_contact_date, last_contact_date, created_at
          FROM contacts WHERE user_email=? ORDER BY created_at DESC
        """, (user_email,)).fetchall()
        return [dict(r) for r in rows]


@directory_bp.route('/contacts', methods=['GET'])
@require_firebase_auth
def get_directory_contacts():
    """Get directory contacts"""
    user_email = request.firebase_user.get('email')
    return jsonify({'contacts': list_contacts_sqlite(user_email)})


@directory_bp.route('/contacts', methods=['POST'])
@require_firebase_auth
def post_directory_contacts():
    """Save directory contacts"""
    data = request.get_json(silent=True) or {}
    user_email = request.firebase_user.get('email')
    contacts = data.get('contacts') or []
    if not isinstance(contacts, list):
        return jsonify({'error': 'contacts must be an array'}), 400
    saved = save_contacts_sqlite(user_email, contacts)
    return jsonify({'saved': saved})

