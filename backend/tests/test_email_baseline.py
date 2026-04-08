"""Tests for email_baseline service (A0 baseline reply rate measurement)."""
import pytest
import os
from unittest.mock import patch, MagicMock
from datetime import datetime, timezone, timedelta

os.environ.setdefault("FLASK_ENV", "testing")
os.environ.setdefault("GOOGLE_APPLICATION_CREDENTIALS", "test-credentials.json")

from app.services.email_baseline import compute_email_baseline, ELIGIBLE_STAGES


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_contact(stage, email_sent_at=None, reply_received_at=None):
    """Build a mock contact dict."""
    data = {"pipelineStage": stage}
    if email_sent_at:
        data["emailSentAt"] = email_sent_at
    if reply_received_at:
        data["replyReceivedAt"] = reply_received_at
    return data


def _make_firestore_doc(doc_id, data):
    """Build a mock Firestore document."""
    doc = MagicMock()
    doc.id = doc_id
    doc.to_dict.return_value = data
    doc.exists = True
    return doc


def _build_mock_db(users):
    """
    Build a mock Firestore db from a list of user specs.

    Each user spec: {
        "uid": str,
        "user_data": dict (user doc fields),
        "has_gmail": bool,
        "contacts": [dict] (contact data dicts),
    }
    """
    db = MagicMock()

    # Build user docs
    user_docs = []
    for u in users:
        user_docs.append(_make_firestore_doc(u["uid"], u.get("user_data", {})))

    # Track subcollection lookups
    gmail_docs = {}
    contact_streams = {}
    for u in users:
        uid = u["uid"]
        gmail_doc = MagicMock()
        gmail_doc.exists = u.get("has_gmail", False)
        gmail_doc.to_dict.return_value = (
            {"token": "tok", "refresh_token": "ref"} if u.get("has_gmail") else {}
        )
        gmail_docs[uid] = gmail_doc

        # Contact docs
        c_docs = []
        for i, c_data in enumerate(u.get("contacts", [])):
            c_docs.append(_make_firestore_doc(f"contact_{i}", c_data))
        contact_streams[uid] = c_docs

    # Wire up db.collection("users").stream()
    users_collection = MagicMock()
    users_collection.stream.return_value = iter(user_docs)

    # Wire up subcollections per user
    def collection_side_effect(name):
        if name == "users":
            return users_collection
        if name == "analytics":
            analytics_col = MagicMock()
            analytics_col.document.return_value = MagicMock()
            return analytics_col
        return MagicMock()

    db.collection.side_effect = collection_side_effect

    # Wire up db.collection("users").document(uid).collection(...)
    def user_document(uid):
        user_doc_ref = MagicMock()

        def user_subcollection(sub_name):
            if sub_name == "integrations":
                integrations = MagicMock()
                def gmail_document(doc_name):
                    if doc_name == "gmail":
                        gmail_ref = MagicMock()
                        gmail_ref.get.return_value = gmail_docs.get(uid, MagicMock(exists=False))
                        return gmail_ref
                    return MagicMock()
                integrations.document.side_effect = gmail_document
                return integrations
            elif sub_name == "contacts":
                contacts_col = MagicMock()
                contacts_col.stream.return_value = iter(contact_streams.get(uid, []))
                return contacts_col
            return MagicMock()

        user_doc_ref.collection.side_effect = user_subcollection
        return user_doc_ref

    users_collection.document.side_effect = user_document

    return db


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

class TestComputeEmailBaseline:

    @patch("app.services.email_baseline.get_db")
    def test_empty_database(self, mock_get_db):
        """No users at all returns zero metrics."""
        db = _build_mock_db([])
        mock_get_db.return_value = db

        result = compute_email_baseline()

        assert result["sampleSize"]["usersWithGmail"] == 0
        assert result["sampleSize"]["totalEligible"] == 0
        assert result["metrics"]["replyRate"] == 0.0
        assert result["metrics"]["avgResponseTimeHours"] is None

    @patch("app.services.email_baseline.get_db")
    def test_users_without_gmail_skipped(self, mock_get_db):
        """Users without Gmail integration are not sampled."""
        db = _build_mock_db([
            {"uid": "u1", "has_gmail": False, "contacts": [
                _make_contact("email_sent", "2026-03-01T12:00:00Z"),
            ]},
        ])
        mock_get_db.return_value = db

        result = compute_email_baseline()

        assert result["sampleSize"]["usersWithGmail"] == 0
        assert result["sampleSize"]["totalContactsEmailed"] == 0

    @patch("app.services.email_baseline.get_db")
    def test_basic_reply_rate(self, mock_get_db):
        """Two contacts: one replied, one waiting. Reply rate should be 50%."""
        db = _build_mock_db([
            {
                "uid": "u1",
                "has_gmail": True,
                "user_data": {"subscriptionTier": "pro"},
                "contacts": [
                    _make_contact("replied", "2026-03-01T12:00:00Z", "2026-03-02T12:00:00Z"),
                    _make_contact("email_sent", "2026-03-01T12:00:00Z"),
                ],
            },
        ])
        mock_get_db.return_value = db

        result = compute_email_baseline()

        assert result["sampleSize"]["usersWithGmail"] == 1
        assert result["sampleSize"]["usersWithEmails"] == 1
        assert result["sampleSize"]["totalEligible"] == 2
        assert result["metrics"]["replyRate"] == 0.5
        assert result["metrics"]["totalReplied"] == 1

    @patch("app.services.email_baseline.get_db")
    def test_response_time_calculation(self, mock_get_db):
        """Average response time computed from sent-to-reply delta."""
        db = _build_mock_db([
            {
                "uid": "u1",
                "has_gmail": True,
                "contacts": [
                    _make_contact("replied", "2026-03-01T00:00:00Z", "2026-03-02T00:00:00Z"),  # 24h
                    _make_contact("replied", "2026-03-01T00:00:00Z", "2026-03-03T00:00:00Z"),  # 48h
                ],
            },
        ])
        mock_get_db.return_value = db

        result = compute_email_baseline()

        assert result["metrics"]["avgResponseTimeHours"] == 36.0  # avg of 24 and 48
        assert result["metrics"]["responseTimeSampleSize"] == 2

    @patch("app.services.email_baseline.get_db")
    def test_meeting_rate(self, mock_get_db):
        """Meeting rate: meetings / (replied + meetings)."""
        db = _build_mock_db([
            {
                "uid": "u1",
                "has_gmail": True,
                "contacts": [
                    _make_contact("replied", "2026-03-01T00:00:00Z"),
                    _make_contact("meeting_scheduled", "2026-03-01T00:00:00Z"),
                    _make_contact("connected", "2026-03-01T00:00:00Z"),
                ],
            },
        ])
        mock_get_db.return_value = db

        result = compute_email_baseline()

        # meeting_scheduled(1) + connected(1) = 2 meetings
        # replied(1) + meeting_scheduled(1) + connected(1) = 3 replied_denom
        assert result["metrics"]["meetingRate"] == round(2 / 3, 4)

    @patch("app.services.email_baseline.get_db")
    def test_tier_breakdown(self, mock_get_db):
        """Per-tier stats are computed correctly."""
        db = _build_mock_db([
            {
                "uid": "u1",
                "has_gmail": True,
                "user_data": {"subscriptionTier": "pro"},
                "contacts": [
                    _make_contact("replied", "2026-03-01T00:00:00Z"),
                    _make_contact("email_sent", "2026-03-01T00:00:00Z"),
                ],
            },
            {
                "uid": "u2",
                "has_gmail": True,
                "user_data": {"tier": "free"},  # legacy field
                "contacts": [
                    _make_contact("no_response", "2026-03-01T00:00:00Z"),
                ],
            },
        ])
        mock_get_db.return_value = db

        result = compute_email_baseline()

        assert "pro" in result["tierBreakdown"]
        assert "free" in result["tierBreakdown"]
        assert result["tierBreakdown"]["pro"]["replyRate"] == 0.5
        assert result["tierBreakdown"]["free"]["replyRate"] == 0.0

    @patch("app.services.email_baseline.get_db")
    def test_contacts_without_email_sent_skipped(self, mock_get_db):
        """Contacts with no emailSentAt are not counted."""
        db = _build_mock_db([
            {
                "uid": "u1",
                "has_gmail": True,
                "contacts": [
                    _make_contact("new"),  # no emailSentAt
                    _make_contact("draft_created"),  # no emailSentAt
                    _make_contact("email_sent", "2026-03-01T00:00:00Z"),
                ],
            },
        ])
        mock_get_db.return_value = db

        result = compute_email_baseline()

        assert result["sampleSize"]["totalContactsEmailed"] == 1
        assert result["sampleSize"]["totalEligible"] == 1

    @patch("app.services.email_baseline.get_db")
    def test_bias_field_present(self, mock_get_db):
        """Result includes bias acknowledgment."""
        db = _build_mock_db([])
        mock_get_db.return_value = db

        result = compute_email_baseline()

        assert "bias" in result
        assert "Gmail" in result["bias"]

    @patch("app.services.email_baseline.get_db")
    def test_measured_at_timestamp(self, mock_get_db):
        """Result includes ISO timestamp."""
        db = _build_mock_db([])
        mock_get_db.return_value = db

        result = compute_email_baseline()

        assert "measuredAt" in result
        assert "Z" in result["measuredAt"]

    @patch("app.services.email_baseline.get_db")
    def test_firestore_write(self, mock_get_db):
        """Baseline is written to analytics/email_baseline."""
        db = _build_mock_db([])
        mock_get_db.return_value = db

        compute_email_baseline()

        # Verify the set() call on the analytics document
        db.collection.assert_any_call("analytics")
