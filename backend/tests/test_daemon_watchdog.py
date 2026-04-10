"""Tests for daemon healthcheck watchdog staleness logic."""
import os
import pytest
from unittest.mock import MagicMock, patch
from datetime import datetime, timezone, timedelta

os.environ.setdefault("FLASK_ENV", "testing")
os.environ.setdefault("GOOGLE_APPLICATION_CREDENTIALS", "test-credentials.json")


class TestWatchdogStaleness:
    """Test the staleness detection logic used by the watchdog.

    These tests verify the threshold calculations without starting real threads.
    """

    # Thresholds from wsgi.py
    THRESHOLDS = {
        "nudge_scanner": 8 * 3600,
        "queue_scanner": 7 * 24 * 3600,
        "aggregation_scanner": 8 * 24 * 3600,
        "gmail_watch": 7 * 24 * 3600,
    }

    def _is_stale(self, last_success_str, threshold_seconds, now=None):
        """Replicate the watchdog staleness check."""
        if now is None:
            now = datetime.now(timezone.utc)
        last_success = datetime.fromisoformat(
            last_success_str.replace("Z", "+00:00")
        )
        age_seconds = (now - last_success).total_seconds()
        return age_seconds > threshold_seconds

    def test_nudge_scanner_fresh_after_6_hours(self):
        now = datetime(2026, 4, 10, 12, 0, 0, tzinfo=timezone.utc)
        last = (now - timedelta(hours=6)).isoformat().replace("+00:00", "Z")
        assert not self._is_stale(last, self.THRESHOLDS["nudge_scanner"], now)

    def test_nudge_scanner_stale_after_9_hours(self):
        now = datetime(2026, 4, 10, 12, 0, 0, tzinfo=timezone.utc)
        last = (now - timedelta(hours=9)).isoformat().replace("+00:00", "Z")
        assert self._is_stale(last, self.THRESHOLDS["nudge_scanner"], now)

    def test_nudge_scanner_boundary_at_8_hours(self):
        now = datetime(2026, 4, 10, 12, 0, 0, tzinfo=timezone.utc)
        last = (now - timedelta(hours=8, seconds=1)).isoformat().replace("+00:00", "Z")
        assert self._is_stale(last, self.THRESHOLDS["nudge_scanner"], now)

    def test_queue_scanner_fresh_after_6_days(self):
        now = datetime(2026, 4, 10, 12, 0, 0, tzinfo=timezone.utc)
        last = (now - timedelta(days=6)).isoformat().replace("+00:00", "Z")
        assert not self._is_stale(last, self.THRESHOLDS["queue_scanner"], now)

    def test_queue_scanner_stale_after_8_days(self):
        now = datetime(2026, 4, 10, 12, 0, 0, tzinfo=timezone.utc)
        last = (now - timedelta(days=8)).isoformat().replace("+00:00", "Z")
        assert self._is_stale(last, self.THRESHOLDS["queue_scanner"], now)

    def test_aggregation_scanner_fresh_after_7_days(self):
        now = datetime(2026, 4, 10, 12, 0, 0, tzinfo=timezone.utc)
        last = (now - timedelta(days=7)).isoformat().replace("+00:00", "Z")
        assert not self._is_stale(last, self.THRESHOLDS["aggregation_scanner"], now)

    def test_aggregation_scanner_stale_after_9_days(self):
        now = datetime(2026, 4, 10, 12, 0, 0, tzinfo=timezone.utc)
        last = (now - timedelta(days=9)).isoformat().replace("+00:00", "Z")
        assert self._is_stale(last, self.THRESHOLDS["aggregation_scanner"], now)

    def test_gmail_watch_fresh_after_6_days(self):
        now = datetime(2026, 4, 10, 12, 0, 0, tzinfo=timezone.utc)
        last = (now - timedelta(days=6)).isoformat().replace("+00:00", "Z")
        assert not self._is_stale(last, self.THRESHOLDS["gmail_watch"], now)

    def test_gmail_watch_stale_after_8_days(self):
        now = datetime(2026, 4, 10, 12, 0, 0, tzinfo=timezone.utc)
        last = (now - timedelta(days=8)).isoformat().replace("+00:00", "Z")
        assert self._is_stale(last, self.THRESHOLDS["gmail_watch"], now)
