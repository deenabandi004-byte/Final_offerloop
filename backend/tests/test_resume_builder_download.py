"""Tests for /api/resume-builder/download — on-the-spot PDF download in the
onboarding builder. Streams the rendered PDF with an attachment header; does
not save, does not count against the generation cap.
"""
import pytest
from unittest.mock import MagicMock, patch

from flask import Flask


VALID_RESUME = {
    "contact": {"name": "Test Student", "email": "student@usc.edu"},
    "education": [
        {
            "school": "University of Southern California",
            "degree": "B.S. Business Administration",
            "graduation": "May 2027",
        }
    ],
    "experience": [
        {
            "company": "Men's Wearhouse",
            "role": "Sales Associate",
            "start": "Jun 2024",
            "end": "Aug 2024",
            "bullets": ["Exceeded monthly sales targets by 15%"],
        }
    ],
}


@pytest.fixture
def client():
    from app.routes.resume_builder import resume_builder_bp

    app = Flask(__name__)
    app.register_blueprint(resume_builder_bp)
    app.config["TESTING"] = True
    return app.test_client()


@pytest.fixture
def auth_bypass():
    """Make require_firebase_auth accept a fake bearer token."""
    with patch("app.extensions.firebase_admin._apps", {"[DEFAULT]": object()}), \
         patch("app.extensions.fb_auth.verify_id_token", return_value={"uid": "test-uid"}):
        yield


class TestResumeBuilderDownload:
    def test_returns_pdf_attachment(self, client, auth_bypass):
        resp = client.post(
            "/api/resume-builder/download",
            json={"resume": VALID_RESUME},
            headers={"Authorization": "Bearer fake-token"},
        )
        assert resp.status_code == 200
        assert resp.mimetype == "application/pdf"
        assert "attachment" in resp.headers.get("Content-Disposition", "")
        assert "Offerloop_Resume.pdf" in resp.headers.get("Content-Disposition", "")
        assert resp.data.startswith(b"%PDF")

    def test_invalid_payload_rejected(self, client, auth_bypass):
        resp = client.post(
            "/api/resume-builder/download",
            json={"resume": {"nope": True}},
            headers={"Authorization": "Bearer fake-token"},
        )
        assert resp.status_code == 400

    def test_does_not_touch_generation_cap_or_storage(self, client, auth_bypass):
        with patch("app.routes.resume_builder._check_and_count_attempt") as cap, \
             patch("app.routes.resume_builder._upload_pdf") as upload:
            resp = client.post(
                "/api/resume-builder/download",
                json={"resume": VALID_RESUME},
                headers={"Authorization": "Bearer fake-token"},
            )
        assert resp.status_code == 200
        cap.assert_not_called()
        upload.assert_not_called()

    def test_requires_auth(self, client):
        with patch("app.extensions.firebase_admin._apps", {"[DEFAULT]": object()}):
            resp = client.post(
                "/api/resume-builder/download", json={"resume": VALID_RESUME}
            )
        assert resp.status_code == 401
