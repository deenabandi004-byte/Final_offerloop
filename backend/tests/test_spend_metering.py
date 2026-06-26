"""Tests for LLM cost metering (metering.py) and provider-spend alerting
(spend_alerts.py)."""
import pytest
from unittest.mock import Mock


# ---------------------------------------------------------------------------
# LLM rate sheet + cost math
# ---------------------------------------------------------------------------


class TestLLMRates:
    def test_longest_prefix_match(self):
        from backend.app.services.metering import _llm_rate
        # gpt-4o-mini must win over gpt-4o (longer prefix)
        assert _llm_rate("gpt-4o-mini-2024-07-18")["input"] == 0.15
        assert _llm_rate("gpt-4o-2024-11-20")["input"] == 2.50
        # gpt-4-0613 maps to gpt-4, NOT gpt-4o
        assert _llm_rate("gpt-4-0613")["input"] == 30.00
        assert _llm_rate("claude-sonnet-4-6-20250514")["input"] == 3.00

    def test_unknown_model_has_no_rate(self):
        from backend.app.services.metering import _llm_rate, llm_cost_usd
        assert _llm_rate("some-future-model") is None
        # No fake numbers: unknown models cost $0, not a guess.
        assert llm_cost_usd("some-future-model", 1000, 0, 1000) == 0.0

    def test_cost_with_cached_tokens(self):
        from backend.app.services.metering import llm_cost_usd
        # gpt-4o-mini: 800 uncached@.15 + 200 cached@.075 + 500 out@.60 per 1M
        cost = llm_cost_usd("gpt-4o-mini", 1000, 200, 500)
        assert cost == pytest.approx(0.000435)

    def test_claude_cost(self):
        from backend.app.services.metering import llm_cost_usd
        # 10k in @ $3 + 2k out @ $15 per 1M = 0.03 + 0.03
        assert llm_cost_usd("claude-sonnet-4-6", 10000, 0, 2000) == pytest.approx(0.06)


class TestUsageExtraction:
    def test_openai_usage(self):
        from backend.app.services.metering import _tokens_from_usage

        class Details:
            cached_tokens = 200

        class Usage:
            prompt_tokens = 1000
            completion_tokens = 500
            prompt_tokens_details = Details()

        assert _tokens_from_usage(Usage()) == (1000, 200, 500)

    def test_anthropic_usage(self):
        from backend.app.services.metering import _tokens_from_usage

        class Usage:
            input_tokens = 800
            output_tokens = 300
            cache_read_input_tokens = 100

        assert _tokens_from_usage(Usage()) == (800, 100, 300)

    def test_dict_and_none(self):
        from backend.app.services.metering import _tokens_from_usage
        assert _tokens_from_usage({"prompt_tokens": 50, "completion_tokens": 20}) == (50, 0, 20)
        assert _tokens_from_usage(None) == (0, 0, 0)


# ---------------------------------------------------------------------------
# Spend alert thresholds + dedup
# ---------------------------------------------------------------------------


class TestThresholds:
    def test_crossed(self):
        from backend.app.services.spend_alerts import _crossed
        assert _crossed(60, 100) == 0.5
        assert _crossed(85, 100) == 0.8
        assert _crossed(120, 100) == 1.0
        assert _crossed(10, 100) is None
        assert _crossed(50, 0) is None      # budget 0 = disabled
        assert _crossed(0, 100) is None     # no spend


class TestCheckAndAlert:
    def _patch(self, monkeypatch, today, mtd, state):
        import backend.app.services.spend_alerts as sa
        sent = []
        monkeypatch.setattr(sa, "_dispatch_alert",
                            lambda subject, html, text: (sent.append(subject), True)[1])
        monkeypatch.setattr(sa, "_db", lambda: object())
        monkeypatch.setattr(sa, "_read_state", lambda db: dict(state))
        monkeypatch.setattr(sa, "_write_state", lambda db, s: (state.clear(), state.update(s)))
        monkeypatch.setattr(sa, "compute_spend", lambda: {
            "as_of": "now",
            "today": {"total": today, "by_provider": {"openai": today}},
            "mtd": {"total": mtd, "by_provider": {"openai": mtd}},
        })
        monkeypatch.setenv("SPEND_DAILY_ALERT_USD", "100")
        monkeypatch.setenv("SPEND_MONTHLY_ALERT_USD", "2000")
        return sa, sent

    def test_fires_then_dedups_then_escalates(self, monkeypatch):
        state = {}
        sa, sent = self._patch(monkeypatch, today=85, mtd=500, state=state)

        r1 = sa.check_and_alert()
        assert [f["level"] for f in r1["alerts_fired"]] == [0.8]
        assert len(sent) == 1

        # Same spend again -> no duplicate alert
        r2 = sa.check_and_alert()
        assert r2["alerts_fired"] == []
        assert len(sent) == 1

        # Spend rises past 100% -> escalates
        monkeypatch.setattr(sa, "compute_spend", lambda: {
            "as_of": "now",
            "today": {"total": 105, "by_provider": {"openai": 105}},
            "mtd": {"total": 500, "by_provider": {"openai": 500}},
        })
        r3 = sa.check_and_alert()
        assert [f["level"] for f in r3["alerts_fired"]] == [1.0]
        assert len(sent) == 2

    def test_no_alert_below_threshold(self, monkeypatch):
        sa, sent = self._patch(monkeypatch, today=10, mtd=100, state={})
        r = sa.check_and_alert()
        assert r["alerts_fired"] == []
        assert sent == []


class TestRecipientsAndFormat:
    def test_default_recipient_is_support(self, monkeypatch):
        import backend.app.services.spend_alerts as sa
        monkeypatch.delenv("SPEND_ALERT_EMAILS", raising=False)
        assert sa._recipients() == ["support@offerloop.ai"]

    def test_custom_recipients_parsed(self, monkeypatch):
        import backend.app.services.spend_alerts as sa
        monkeypatch.setenv("SPEND_ALERT_EMAILS", "a@x.com, b@y.com ,")
        assert sa._recipients() == ["a@x.com", "b@y.com"]

    def test_format_alert_returns_subject_html_text(self):
        import backend.app.services.spend_alerts as sa
        subject, html, text = sa._format_alert("Today", "2026-06-25", 1.0, 120.0, 100.0,
                                               {"openai": 90.0, "pdl": 30.0})
        assert "100%" in subject and "$120.00" in subject
        assert "<h2>" in html and "openai: $90.00" in html
        assert "openai: $90.00" in text.replace("  - ", "")
