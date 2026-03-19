"""
Tests for the Outbox / Network Tracker feature.
Covers: outbox_service.py (helpers, queries, mutations, gmail sync),
        outbox.py (routes), emails.py (draft creation), background_sync.py,
        gmail_webhook.py (sent/reply detection).
"""
import inspect
import re
import pytest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch, MagicMock, PropertyMock


# =============================================================================
# outbox_service.py — _parse_iso
# =============================================================================

class TestParseIso:
    """Test ISO date string parsing."""

    def test_standard_iso(self):
        from app.services.outbox_service import _parse_iso
        result = _parse_iso("2024-06-15T10:30:00")
        assert result == datetime(2024, 6, 15, 10, 30, 0)

    def test_iso_with_z(self):
        from app.services.outbox_service import _parse_iso
        result = _parse_iso("2024-06-15T10:30:00Z")
        assert result is not None
        assert result.year == 2024
        assert result.tzinfo is None  # converted to naive UTC

    def test_iso_with_offset(self):
        from app.services.outbox_service import _parse_iso
        result = _parse_iso("2024-06-15T10:30:00+05:00")
        assert result is not None
        # Should be converted to UTC (10:30 + 5:00 offset = 05:30 UTC)
        assert result.hour == 5
        assert result.minute == 30

    def test_none_input(self):
        from app.services.outbox_service import _parse_iso
        assert _parse_iso(None) is None

    def test_empty_string(self):
        from app.services.outbox_service import _parse_iso
        assert _parse_iso("") is None

    def test_invalid_string(self):
        from app.services.outbox_service import _parse_iso
        assert _parse_iso("not a date") is None

    def test_whitespace(self):
        from app.services.outbox_service import _parse_iso
        result = _parse_iso("  2024-06-15T10:30:00Z  ")
        assert result is not None


# =============================================================================
# outbox_service.py — _now_iso
# =============================================================================

class TestNowIso:
    """Test ISO timestamp generation."""

    def test_returns_string_ending_with_z(self):
        from app.services.outbox_service import _now_iso
        result = _now_iso()
        assert isinstance(result, str)
        assert result.endswith("Z")

    def test_no_deprecated_utcnow(self):
        """_now_iso should not use deprecated datetime.utcnow()."""
        from app.services.outbox_service import _now_iso
        source = inspect.getsource(_now_iso)
        assert "utcnow" not in source

    def test_parseable(self):
        from app.services.outbox_service import _now_iso, _parse_iso
        result = _now_iso()
        parsed = _parse_iso(result)
        assert parsed is not None


# =============================================================================
# outbox_service.py — Constants
# =============================================================================

class TestConstants:
    """Verify pipeline stage and resolution constants."""

    def test_allowed_stages_complete(self):
        from app.services.outbox_service import ALLOWED_PIPELINE_STAGES
        expected = {
            "new", "draft_created", "draft_deleted", "email_sent",
            "waiting_on_reply", "replied", "meeting_scheduled",
            "connected", "no_response", "bounced", "closed",
        }
        assert ALLOWED_PIPELINE_STAGES == expected

    def test_done_stages_subset(self):
        from app.services.outbox_service import ALLOWED_PIPELINE_STAGES, DONE_STAGES
        assert DONE_STAGES.issubset(ALLOWED_PIPELINE_STAGES)

    def test_replied_stages_subset(self):
        from app.services.outbox_service import ALLOWED_PIPELINE_STAGES, REPLIED_STAGES
        assert REPLIED_STAGES.issubset(ALLOWED_PIPELINE_STAGES)

    def test_valid_resolutions(self):
        from app.services.outbox_service import VALID_RESOLUTIONS
        assert "meeting_booked" in VALID_RESOLUTIONS
        assert "hard_no" in VALID_RESOLUTIONS
        assert "ghosted" in VALID_RESOLUTIONS


# =============================================================================
# outbox_service.py — _contact_to_dict
# =============================================================================

class TestContactToDict:
    """Test Firestore data → API response conversion."""

    def test_basic_conversion(self):
        from app.services.outbox_service import _contact_to_dict
        data = {
            "firstName": "Jane",
            "lastName": "Doe",
            "email": "jane@example.com",
            "company": "Acme Corp",
            "jobTitle": "Engineer",
            "pipelineStage": "draft_created",
            "inOutbox": True,
            "gmailDraftId": "draft123",
            "gmailMessageId": "msg456",
        }
        result = _contact_to_dict("contact-1", data)
        assert result["id"] == "contact-1"
        assert result["name"] == "Jane Doe"
        assert result["email"] == "jane@example.com"
        assert result["company"] == "Acme Corp"
        assert result["title"] == "Engineer"
        assert result["pipelineStage"] == "draft_created"
        assert result["inOutbox"] is True
        # Legacy aliases
        assert result["contactName"] == "Jane Doe"
        assert result["jobTitle"] == "Engineer"
        assert result["hasDraft"] is True
        assert result["status"] == "draft_created"

    def test_builds_draft_url_from_message_id(self):
        from app.services.outbox_service import _contact_to_dict
        data = {
            "gmailDraftId": "draft123",
            "gmailMessageId": "msg456",
        }
        result = _contact_to_dict("c1", data)
        assert "msg456" in result["gmailDraftUrl"]
        assert "#drafts?compose=" in result["gmailDraftUrl"]

    def test_builds_draft_url_fallback_draft_id(self):
        from app.services.outbox_service import _contact_to_dict
        data = {
            "gmailDraftId": "draft123",
            # no gmailMessageId
        }
        result = _contact_to_dict("c1", data)
        assert "draft123" in result["gmailDraftUrl"]
        assert "#draft/" in result["gmailDraftUrl"]

    def test_html_unescape_snippet(self):
        from app.services.outbox_service import _contact_to_dict
        data = {"lastMessageSnippet": "Hello &amp; welcome! It&#39;s nice."}
        result = _contact_to_dict("c1", data)
        assert result["lastMessageSnippet"] == "Hello & welcome! It's nice."

    def test_snippet_fallback_new_stage(self):
        from app.services.outbox_service import _contact_to_dict
        data = {"pipelineStage": "new"}
        result = _contact_to_dict("c1", data)
        assert result["lastMessageSnippet"] == "Ready to draft an email"

    def test_name_fallback_to_email(self):
        from app.services.outbox_service import _contact_to_dict
        data = {"email": "unknown@test.com"}
        result = _contact_to_dict("c1", data)
        assert result["name"] == "unknown@test.com"

    def test_linkedin_url_adds_protocol(self):
        from app.services.outbox_service import _contact_to_dict
        data = {"linkedinUrl": "linkedin.com/in/janedoe"}
        result = _contact_to_dict("c1", data)
        assert result["linkedinUrl"] == "https://linkedin.com/in/janedoe"

    def test_linkedin_url_preserves_existing_protocol(self):
        from app.services.outbox_service import _contact_to_dict
        data = {"linkedinUrl": "https://linkedin.com/in/janedoe"}
        result = _contact_to_dict("c1", data)
        assert result["linkedinUrl"] == "https://linkedin.com/in/janedoe"

    def test_empty_data(self):
        from app.services.outbox_service import _contact_to_dict
        result = _contact_to_dict("c1", {})
        assert result["id"] == "c1"
        assert result["name"] == ""
        assert result["email"] == ""
        assert result["pipelineStage"] is None

    def test_draftToEmail_preferred(self):
        from app.services.outbox_service import _contact_to_dict
        data = {"email": "old@test.com", "draftToEmail": "new@test.com"}
        result = _contact_to_dict("c1", data)
        assert result["email"] == "new@test.com"


# =============================================================================
# outbox_service.py — update_contact_stage
# =============================================================================

class TestUpdateContactStage:
    """Test pipeline stage mutations."""

    @patch("app.services.outbox_service._get_contact")
    def test_valid_stage_update(self, mock_get):
        from app.services.outbox_service import update_contact_stage
        mock_ref = MagicMock()
        mock_get.return_value = (mock_ref, {"pipelineStage": "draft_created"})

        result = update_contact_stage("uid1", "c1", "email_sent")
        mock_ref.update.assert_called_once()
        update_data = mock_ref.update.call_args[0][0]
        assert update_data["pipelineStage"] == "email_sent"

    def test_invalid_stage_raises(self):
        from app.services.outbox_service import update_contact_stage
        with pytest.raises(ValueError, match="Invalid stage"):
            update_contact_stage("uid1", "c1", "nonexistent_stage")

    @patch("app.services.outbox_service._get_contact")
    def test_meeting_scheduled_sets_timestamp(self, mock_get):
        from app.services.outbox_service import update_contact_stage
        mock_ref = MagicMock()
        mock_get.return_value = (mock_ref, {"pipelineStage": "replied"})

        update_contact_stage("uid1", "c1", "meeting_scheduled")
        update_data = mock_ref.update.call_args[0][0]
        assert "meetingScheduledAt" in update_data

    @patch("app.services.outbox_service._get_contact")
    def test_meeting_scheduled_no_overwrite(self, mock_get):
        from app.services.outbox_service import update_contact_stage
        mock_ref = MagicMock()
        mock_get.return_value = (mock_ref, {
            "pipelineStage": "replied",
            "meetingScheduledAt": "2024-01-01T00:00:00Z",
        })

        update_contact_stage("uid1", "c1", "meeting_scheduled")
        update_data = mock_ref.update.call_args[0][0]
        assert "meetingScheduledAt" not in update_data

    @patch("app.services.outbox_service._get_contact")
    def test_connected_sets_timestamp(self, mock_get):
        from app.services.outbox_service import update_contact_stage
        mock_ref = MagicMock()
        mock_get.return_value = (mock_ref, {"pipelineStage": "replied"})

        update_contact_stage("uid1", "c1", "connected")
        update_data = mock_ref.update.call_args[0][0]
        assert "connectedAt" in update_data


# =============================================================================
# outbox_service.py — archive / unarchive
# =============================================================================

class TestArchiveUnarchive:

    @patch("app.services.outbox_service._get_contact")
    def test_archive_sets_timestamp(self, mock_get):
        from app.services.outbox_service import archive_contact
        mock_ref = MagicMock()
        mock_get.return_value = (mock_ref, {"pipelineStage": "waiting_on_reply"})

        archive_contact("uid1", "c1")
        update_data = mock_ref.update.call_args[0][0]
        assert "archivedAt" in update_data
        assert update_data["archivedAt"] is not None

    @patch("app.services.outbox_service._get_contact")
    def test_unarchive_clears_timestamp(self, mock_get):
        from app.services.outbox_service import unarchive_contact
        mock_ref = MagicMock()
        mock_get.return_value = (mock_ref, {
            "pipelineStage": "no_response",
            "archivedAt": "2024-01-01T00:00:00Z",
        })

        unarchive_contact("uid1", "c1")
        update_data = mock_ref.update.call_args[0][0]
        assert update_data["archivedAt"] is None

    @patch("app.services.outbox_service._get_contact")
    def test_unarchive_resets_negative_stage(self, mock_get):
        from app.services.outbox_service import unarchive_contact
        mock_ref = MagicMock()
        mock_get.return_value = (mock_ref, {
            "pipelineStage": "no_response",
            "archivedAt": "2024-01-01",
        })

        unarchive_contact("uid1", "c1")
        update_data = mock_ref.update.call_args[0][0]
        assert update_data["pipelineStage"] == "waiting_on_reply"

    @patch("app.services.outbox_service._get_contact")
    def test_unarchive_preserves_positive_stage(self, mock_get):
        from app.services.outbox_service import unarchive_contact
        mock_ref = MagicMock()
        mock_get.return_value = (mock_ref, {
            "pipelineStage": "meeting_scheduled",
            "archivedAt": "2024-01-01",
        })

        unarchive_contact("uid1", "c1")
        update_data = mock_ref.update.call_args[0][0]
        assert "pipelineStage" not in update_data


# =============================================================================
# outbox_service.py — snooze_contact (BUG 2 fix)
# =============================================================================

class TestSnoozeContact:

    @patch("app.services.outbox_service._get_contact")
    def test_valid_snooze(self, mock_get):
        from app.services.outbox_service import snooze_contact
        mock_ref = MagicMock()
        mock_get.return_value = (mock_ref, {"pipelineStage": "waiting_on_reply"})

        snooze_contact("uid1", "c1", "2026-04-01T00:00:00Z")
        update_data = mock_ref.update.call_args[0][0]
        assert update_data["snoozedUntil"] == "2026-04-01T00:00:00Z"

    def test_invalid_snooze_date_raises(self):
        from app.services.outbox_service import snooze_contact
        with pytest.raises(ValueError, match="Invalid snoozeUntil"):
            snooze_contact("uid1", "c1", "not-a-date")

    def test_empty_snooze_date_raises(self):
        from app.services.outbox_service import snooze_contact
        with pytest.raises(ValueError, match="Invalid snoozeUntil"):
            snooze_contact("uid1", "c1", "")

    def test_script_injection_rejected(self):
        from app.services.outbox_service import snooze_contact
        with pytest.raises(ValueError, match="Invalid snoozeUntil"):
            snooze_contact("uid1", "c1", "<script>alert(1)</script>")


# =============================================================================
# outbox_service.py — mark_contact_won / mark_contact_resolution
# =============================================================================

class TestResolutions:

    @patch("app.services.outbox_service._get_contact")
    def test_mark_won(self, mock_get):
        from app.services.outbox_service import mark_contact_won
        mock_ref = MagicMock()
        mock_get.return_value = (mock_ref, {"pipelineStage": "replied"})

        mark_contact_won("uid1", "c1", resolution_details="Coffee went great!")
        update_data = mock_ref.update.call_args[0][0]
        assert update_data["pipelineStage"] == "meeting_scheduled"
        assert update_data["resolution"] == "meeting_booked"
        assert update_data["resolutionDetails"] == "Coffee went great!"

    @patch("app.services.outbox_service._get_contact")
    def test_resolution_hard_no_archives(self, mock_get):
        from app.services.outbox_service import mark_contact_resolution
        mock_ref = MagicMock()
        mock_get.return_value = (mock_ref, {"pipelineStage": "replied"})

        mark_contact_resolution("uid1", "c1", "hard_no")
        update_data = mock_ref.update.call_args[0][0]
        assert update_data["pipelineStage"] == "closed"
        assert update_data["archivedAt"] is not None

    @patch("app.services.outbox_service._get_contact")
    def test_resolution_ghosted_archives(self, mock_get):
        from app.services.outbox_service import mark_contact_resolution
        mock_ref = MagicMock()
        mock_get.return_value = (mock_ref, {"pipelineStage": "waiting_on_reply"})

        mark_contact_resolution("uid1", "c1", "ghosted")
        update_data = mock_ref.update.call_args[0][0]
        assert update_data["pipelineStage"] == "closed"
        assert "archivedAt" in update_data

    @patch("app.services.outbox_service._get_contact")
    def test_resolution_soft_no(self, mock_get):
        from app.services.outbox_service import mark_contact_resolution
        mock_ref = MagicMock()
        mock_get.return_value = (mock_ref, {"pipelineStage": "replied"})

        mark_contact_resolution("uid1", "c1", "soft_no")
        update_data = mock_ref.update.call_args[0][0]
        assert update_data["pipelineStage"] == "no_response"

    @patch("app.services.outbox_service._get_contact")
    def test_resolution_completed(self, mock_get):
        from app.services.outbox_service import mark_contact_resolution
        mock_ref = MagicMock()
        mock_get.return_value = (mock_ref, {"pipelineStage": "meeting_scheduled"})

        mark_contact_resolution("uid1", "c1", "completed")
        update_data = mock_ref.update.call_args[0][0]
        assert update_data["pipelineStage"] == "connected"
        assert "connectedAt" in update_data

    def test_invalid_resolution_raises(self):
        from app.services.outbox_service import mark_contact_resolution
        with pytest.raises(ValueError, match="Invalid resolution"):
            mark_contact_resolution("uid1", "c1", "invalid_res")


# =============================================================================
# outbox_service.py — get_outbox_stats (BUG 3 fix)
# =============================================================================

class TestGetOutboxStats:
    """Test stats computation logic."""

    @patch("app.services.outbox_service.get_outbox_contacts")
    def test_empty_outbox(self, mock_contacts):
        from app.services.outbox_service import get_outbox_stats
        mock_contacts.return_value = []
        stats = get_outbox_stats("uid1")
        assert stats["total"] == 0
        assert stats["replyRate"] == 0.0
        assert stats["meetingRate"] == 0.0
        assert stats["needsAttentionCount"] == 0
        assert stats["waitingCount"] == 0
        assert stats["doneCount"] == 0

    @patch("app.services.outbox_service.get_outbox_contacts")
    def test_meeting_rate_includes_connected(self, mock_contacts):
        """BUG 3 fix: meetingRate should count connected as positive outcome."""
        from app.services.outbox_service import get_outbox_stats
        now = datetime.now(timezone.utc)
        mock_contacts.return_value = [
            {"pipelineStage": "replied", "emailSentAt": (now - timedelta(days=5)).isoformat()},
            {"pipelineStage": "meeting_scheduled", "emailSentAt": (now - timedelta(days=3)).isoformat()},
            {"pipelineStage": "connected", "emailSentAt": (now - timedelta(days=7)).isoformat(), "connectedAt": now.isoformat()},
        ]
        stats = get_outbox_stats("uid1")
        # 3 replied-or-beyond contacts, 2 reached meeting/connected
        assert stats["meetingRate"] == pytest.approx(2/3, abs=0.01)

    @patch("app.services.outbox_service.get_outbox_contacts")
    def test_reply_rate(self, mock_contacts):
        from app.services.outbox_service import get_outbox_stats
        mock_contacts.return_value = [
            {"pipelineStage": "waiting_on_reply"},
            {"pipelineStage": "replied"},
            {"pipelineStage": "no_response"},
            {"pipelineStage": "meeting_scheduled"},
        ]
        stats = get_outbox_stats("uid1")
        # 2 replied (replied + meeting_scheduled) out of 4 eligible
        assert stats["replyRate"] == pytest.approx(0.5, abs=0.01)

    @patch("app.services.outbox_service.get_outbox_contacts")
    def test_needs_attention_unread_reply(self, mock_contacts):
        from app.services.outbox_service import get_outbox_stats
        mock_contacts.return_value = [
            {"pipelineStage": "replied", "hasUnreadReply": True},
        ]
        stats = get_outbox_stats("uid1")
        assert stats["needsAttentionCount"] == 1

    @patch("app.services.outbox_service.get_outbox_contacts")
    def test_snoozed_suppressed_from_needs_attention(self, mock_contacts):
        from app.services.outbox_service import get_outbox_stats
        future = (datetime.now(timezone.utc) + timedelta(days=3)).isoformat()
        mock_contacts.return_value = [
            {"pipelineStage": "replied", "hasUnreadReply": True, "snoozedUntil": future},
        ]
        stats = get_outbox_stats("uid1")
        assert stats["needsAttentionCount"] == 0

    @patch("app.services.outbox_service.get_outbox_contacts")
    def test_done_bucket(self, mock_contacts):
        from app.services.outbox_service import get_outbox_stats
        mock_contacts.return_value = [
            {"pipelineStage": "connected"},
            {"pipelineStage": "bounced"},
            {"pipelineStage": "closed"},
        ]
        stats = get_outbox_stats("uid1")
        assert stats["doneCount"] == 3

    @patch("app.services.outbox_service.get_outbox_contacts")
    def test_avg_response_time(self, mock_contacts):
        from app.services.outbox_service import get_outbox_stats
        sent = (datetime.now(timezone.utc) - timedelta(hours=48)).isoformat()
        replied = datetime.now(timezone.utc).isoformat()
        mock_contacts.return_value = [
            {
                "pipelineStage": "replied",
                "emailSentAt": sent,
                "lastActivityAt": replied,
            },
        ]
        stats = get_outbox_stats("uid1")
        assert stats["avgResponseTimeHours"] is not None
        assert stats["avgResponseTimeHours"] == pytest.approx(48.0, abs=1.0)


# =============================================================================
# outbox_service.py — _check_draft_status
# =============================================================================

class TestCheckDraftStatus:

    def test_no_draft_id_returns_empty(self):
        from app.services.outbox_service import _check_draft_status
        assert _check_draft_status(MagicMock(), {}) == {}

    def test_draft_exists(self):
        from app.services.outbox_service import _check_draft_status
        mock_service = MagicMock()
        result = _check_draft_status(mock_service, {"gmailDraftId": "d1"})
        assert result == {"draftStillExists": True}

    def test_draft_gone_with_thread_id(self):
        from app.services.outbox_service import _check_draft_status
        mock_service = MagicMock()
        # Simulate 404 error
        err = Exception("404 not found")
        err.resp = MagicMock()
        err.resp.status = 404
        mock_service.users().drafts().get().execute.side_effect = err

        result = _check_draft_status(mock_service, {
            "gmailDraftId": "d1",
            "gmailThreadId": "t1",
        })
        assert result["draftStillExists"] is False
        assert result["pipelineStage"] == "waiting_on_reply"
        assert "emailSentAt" in result

    def test_draft_gone_no_thread_searches_gmail(self):
        from app.services.outbox_service import _check_draft_status
        mock_service = MagicMock()
        # Draft get → 404
        err = Exception("404 not found")
        err.resp = MagicMock()
        err.resp.status = 404
        mock_service.users().drafts().get().execute.side_effect = err
        # Message search returns a result
        mock_service.users().messages().list().execute.return_value = {
            "messages": [{"id": "m1"}]
        }
        mock_service.users().messages().get().execute.return_value = {
            "threadId": "t1"
        }

        result = _check_draft_status(mock_service, {
            "gmailDraftId": "d1",
            "draftToEmail": "test@example.com",
            "emailSubject": "Hello there",
        })
        assert result["gmailThreadId"] == "t1"
        assert result["pipelineStage"] == "waiting_on_reply"


# =============================================================================
# outbox_service.py — _sync_thread_messages
# =============================================================================

class TestSyncThreadMessages:

    def test_no_thread_id_returns_empty(self):
        from app.services.outbox_service import _sync_thread_messages
        assert _sync_thread_messages(MagicMock(), {}, "user@test.com") == {}

    def test_draft_still_exists_skips(self):
        from app.services.outbox_service import _sync_thread_messages
        data = {"gmailThreadId": "t1", "gmailDraftId": "d1", "draftStillExists": True}
        assert _sync_thread_messages(MagicMock(), data, "user@test.com") == {}

    @patch("app.services.outbox_service.sync_thread_message")
    def test_reply_detected(self, mock_sync):
        from app.services.outbox_service import _sync_thread_messages
        mock_sync.return_value = {
            "snippet": "Thanks for reaching out!",
            "hasUnreadReply": True,
            "lastActivityAt": "2024-06-15T12:00:00Z",
            "status": "new_reply",
        }
        data = {"gmailThreadId": "t1", "draftStillExists": False}
        result = _sync_thread_messages(MagicMock(), data, "user@test.com")
        assert result["pipelineStage"] == "replied"
        assert result["hasUnreadReply"] is True
        assert result["lastMessageFrom"] == "contact"

    @patch("app.services.outbox_service.sync_thread_message")
    def test_waiting_on_them(self, mock_sync):
        from app.services.outbox_service import _sync_thread_messages
        mock_sync.return_value = {
            "snippet": "Sent my follow-up",
            "lastActivityAt": "2024-06-15T12:00:00Z",
            "status": "waiting_on_them",
        }
        data = {"gmailThreadId": "t1", "draftStillExists": False}
        result = _sync_thread_messages(MagicMock(), data, "user@test.com")
        assert result["lastMessageFrom"] == "user"
        assert "pipelineStage" not in result  # no stage change


# =============================================================================
# outbox_service.py — sync_contact_thread
# =============================================================================

class TestSyncContactThread:

    @patch("app.services.outbox_service.get_db")
    @patch("app.services.outbox_service._load_user_gmail_creds")
    @patch("app.services.outbox_service._gmail_service")
    def test_sync_lock_skips_recent(self, mock_gmail, mock_creds, mock_db):
        from app.services.outbox_service import sync_contact_thread
        recent_sync = (datetime.now(timezone.utc) - timedelta(seconds=10)).replace(tzinfo=None).isoformat() + "Z"
        mock_ref = MagicMock()
        mock_doc = MagicMock()
        mock_doc.exists = True
        mock_doc.to_dict.return_value = {
            "lastSyncAt": recent_sync,
            "pipelineStage": "waiting_on_reply",
        }
        mock_ref.get.return_value = mock_doc
        mock_db.return_value.collection.return_value.document.return_value \
            .collection.return_value.document.return_value = mock_ref

        result = sync_contact_thread("uid1", "c1")
        # Should return without calling Gmail
        mock_creds.assert_not_called()

    @patch("app.services.outbox_service.get_db")
    @patch("app.services.outbox_service._load_user_gmail_creds", return_value=None)
    def test_no_creds_sets_error(self, mock_creds, mock_db):
        from app.services.outbox_service import sync_contact_thread
        mock_ref = MagicMock()
        mock_doc = MagicMock()
        mock_doc.exists = True
        mock_doc.to_dict.return_value = {"pipelineStage": "waiting_on_reply"}
        mock_ref.get.return_value = mock_doc
        mock_db.return_value.collection.return_value.document.return_value \
            .collection.return_value.document.return_value = mock_ref

        result = sync_contact_thread("uid1", "c1")
        update_data = mock_ref.update.call_args[0][0]
        assert update_data["lastSyncError"]["code"] == "gmail_disconnected"


# =============================================================================
# outbox routes — source inspection
# =============================================================================

class TestOutboxRoutes:
    """Verify route structure and error handling patterns."""

    def test_all_routes_have_auth(self):
        """All outbox routes should require firebase auth."""
        import app.routes.outbox as mod
        source = inspect.getsource(mod)
        route_count = source.count("@outbox_bp.")
        auth_count = source.count("@require_firebase_auth")
        assert auth_count == route_count, "Every route should have @require_firebase_auth"

    def test_routes_handle_contact_not_found(self):
        """All mutation routes should handle ValueError(contact_not_found)."""
        import app.routes.outbox as mod
        source = inspect.getsource(mod)
        # Count route handlers that do mutations (all except list_threads and outbox_stats)
        mutation_routes = ["update_stage", "sync_thread", "mark_read", "archive",
                          "unarchive", "snooze", "won", "resolution"]
        for route in mutation_routes:
            func = getattr(mod, route)
            func_source = inspect.getsource(func)
            assert "contact_not_found" in func_source, f"{route} should handle contact_not_found"

    def test_stage_endpoint_validates_empty(self):
        from app.routes.outbox import update_stage
        source = inspect.getsource(update_stage)
        assert "not new_stage" in source or "if not new_stage" in source

    def test_snooze_endpoint_validates_empty(self):
        from app.routes.outbox import snooze
        source = inspect.getsource(snooze)
        assert "not snooze_until" in source or "if not snooze_until" in source

    def test_resolution_endpoint_validates_empty(self):
        from app.routes.outbox import resolution
        source = inspect.getsource(resolution)
        assert "not res" in source or "if not res" in source


# =============================================================================
# gmail_webhook.py — _extract_email_from_header
# =============================================================================

class TestExtractEmailFromHeader:

    def test_name_angle_bracket(self):
        from app.routes.gmail_webhook import _extract_email_from_header
        assert _extract_email_from_header("John Doe <john@example.com>") == "john@example.com"

    def test_plain_email(self):
        from app.routes.gmail_webhook import _extract_email_from_header
        assert _extract_email_from_header("john@example.com") == "john@example.com"

    def test_uppercase_normalized(self):
        from app.routes.gmail_webhook import _extract_email_from_header
        assert _extract_email_from_header("John@EXAMPLE.com") == "john@example.com"

    def test_empty_string(self):
        from app.routes.gmail_webhook import _extract_email_from_header
        assert _extract_email_from_header("") == ""

    def test_none(self):
        from app.routes.gmail_webhook import _extract_email_from_header
        assert _extract_email_from_header(None) == ""


# =============================================================================
# gmail_webhook.py — security fix
# =============================================================================

class TestWebhookSecurity:

    def test_uses_timing_safe_comparison(self):
        """Webhook token comparison should use hmac.compare_digest."""
        from app.routes.gmail_webhook import webhook
        source = inspect.getsource(webhook)
        assert "hmac.compare_digest" in source

    def test_imports_hmac(self):
        import app.routes.gmail_webhook as mod
        source = inspect.getsource(mod)
        assert "import hmac" in source


# =============================================================================
# gmail_webhook.py — reply detection fix (BUG 4)
# =============================================================================

class TestWebhookReplyDetection:

    def test_incoming_messages_not_blocked(self):
        """Webhook should process non-SENT messages for reply detection."""
        from app.routes.gmail_webhook import _process_gmail_notification
        source = inspect.getsource(_process_gmail_notification)
        # Should NOT have simple "if SENT not in labels: continue"
        # Should instead check is_from_user
        assert "is_from_user" in source or "is_sent" in source

    def test_no_blanket_sent_filter(self):
        """Should not skip all non-SENT messages."""
        from app.routes.gmail_webhook import _process_gmail_notification
        source = inspect.getsource(_process_gmail_notification)
        # Old code: "if 'SENT' not in label_ids:\n                continue"
        # Should not have this pattern anymore
        assert "if 'SENT' not in label_ids:" not in source


# =============================================================================
# background_sync.py
# =============================================================================

class TestBackgroundSync:

    @patch("app.services.background_sync.get_db")
    def test_get_stale_thread_ids_filters_correctly(self, mock_db):
        from app.services.background_sync import get_stale_thread_ids

        docs = []
        for stage, thread_id, archived in [
            ("email_sent", "t1", None),        # candidate
            ("waiting_on_reply", "t2", None),   # candidate
            ("draft_created", "t3", None),       # not stale stage
            ("email_sent", None, None),          # no thread id
            ("email_sent", "t5", "2024-01-01"),  # archived
        ]:
            doc = MagicMock()
            doc.id = f"c-{stage}-{thread_id}"
            doc.to_dict.return_value = {
                "pipelineStage": stage,
                "gmailThreadId": thread_id,
                "archivedAt": archived,
                "inOutbox": True,
            }
            docs.append(doc)

        mock_query = MagicMock()
        mock_query.stream.return_value = docs
        mock_db.return_value.collection.return_value.document.return_value \
            .collection.return_value.where.return_value = mock_query

        ids = get_stale_thread_ids("uid1")
        assert len(ids) == 2

    def test_stale_pipeline_stages_constant(self):
        from app.services.background_sync import STALE_PIPELINE_STAGES
        assert "email_sent" in STALE_PIPELINE_STAGES
        assert "waiting_on_reply" in STALE_PIPELINE_STAGES
        assert "replied" in STALE_PIPELINE_STAGES


# =============================================================================
# emails.py — draft creation
# =============================================================================

class TestEmailsDraftCreation:
    """Test email generation and draft route structure."""

    def test_skipped_count_in_response(self):
        """Response should include skipped_count when drafts fail."""
        from app.routes.emails import generate_and_draft
        source = inspect.getsource(generate_and_draft)
        assert "skipped_count" in source

    def test_normalize_drive_url(self):
        from app.routes.emails import _normalize_drive_url
        # Firebase URLs pass through
        url = "https://firebasestorage.googleapis.com/v0/b/test/resume.pdf"
        assert _normalize_drive_url(url) == url

        # Drive file URLs converted
        url = "https://drive.google.com/file/d/ABC123/view"
        result = _normalize_drive_url(url)
        assert "uc?export=download&id=ABC123" in result

        # Drive open URLs converted
        url = "https://drive.google.com/open?id=XYZ789"
        result = _normalize_drive_url(url)
        assert "uc?export=download&id=XYZ789" in result

        # Non-drive URLs pass through
        assert _normalize_drive_url("https://example.com/file.pdf") == "https://example.com/file.pdf"

        # None/empty
        assert _normalize_drive_url(None) is None
        assert _normalize_drive_url("") == ""

    def test_infer_mime_type(self):
        from app.routes.emails import _infer_mime_type
        main, sub = _infer_mime_type("resume.pdf")
        assert main == "application"
        assert sub == "pdf"

        main, sub = _infer_mime_type("unknown")
        assert main == "application"
        assert sub == "octet-stream"


# =============================================================================
# No deprecated utcnow in key files
# =============================================================================

class TestNoDeprecatedUtcnow:

    def test_outbox_service_no_utcnow(self):
        import app.services.outbox_service as mod
        source = inspect.getsource(mod)
        assert "utcnow()" not in source, "outbox_service should not use deprecated utcnow()"

    def test_gmail_webhook_no_utcnow(self):
        import app.routes.gmail_webhook as mod
        source = inspect.getsource(mod)
        assert "utcnow()" not in source, "gmail_webhook should not use deprecated utcnow()"
