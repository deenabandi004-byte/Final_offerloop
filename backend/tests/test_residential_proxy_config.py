"""
Unit tests for build_residential_proxy_config — the Decodo proxy helper
the auto-apply form-fillers use to route Browserless egress through a
residential IP pool.

The helper is the credential-presence gate for Plan A: empty Decodo creds
mean the fillers fall through to the unproxied path with identical
behavior to before the wiring. These tests pin both branches of that gate
so the framework cannot silently regress.

No network, no Playwright — pure unit tests.
"""
from unittest.mock import patch

from app.services.auto_apply.browserless_client import build_residential_proxy_config


def test_returns_none_when_username_empty():
    with patch("app.config.DECODO_USERNAME", ""), \
         patch("app.config.DECODO_PASSWORD", "secret"):
        assert build_residential_proxy_config(session_id="job-123") is None


def test_returns_none_when_password_empty():
    with patch("app.config.DECODO_USERNAME", "spXXXXXXXX"), \
         patch("app.config.DECODO_PASSWORD", ""):
        assert build_residential_proxy_config(session_id="job-123") is None


def test_returns_none_when_both_empty():
    with patch("app.config.DECODO_USERNAME", ""), \
         patch("app.config.DECODO_PASSWORD", ""):
        assert build_residential_proxy_config(session_id="job-123") is None


def test_returns_config_with_creds_and_session_id():
    with patch("app.config.DECODO_USERNAME", "spXXXXXXXX"), \
         patch("app.config.DECODO_PASSWORD", "supersecret"):
        cfg = build_residential_proxy_config(session_id="job-abc-123")

    assert cfg is not None
    assert cfg["server"] == "http://gate.decodo.com:7000"
    assert cfg["password"] == "supersecret"
    # Sticky-session username format Decodo expects:
    #   user-{BASE}-country-us-session-{SID}-sessionduration-10
    assert cfg["username"] == (
        "user-spXXXXXXXX-country-us-session-job-abc-123-sessionduration-10"
    )


def test_username_targets_us_and_10_min_stickiness():
    """The format string drives both reCAPTCHA's geo-reputation read (US IPs)
    and the same-job retry guarantee (10-minute sticky). If either changes
    accidentally, Plan A's success-rate assumptions collapse."""
    with patch("app.config.DECODO_USERNAME", "base"), \
         patch("app.config.DECODO_PASSWORD", "pw"):
        cfg = build_residential_proxy_config(session_id="sid")
    assert "-country-us-" in cfg["username"]
    assert cfg["username"].endswith("-sessionduration-10")


def test_falls_back_to_random_session_id_when_missing():
    with patch("app.config.DECODO_USERNAME", "base"), \
         patch("app.config.DECODO_PASSWORD", "pw"):
        cfg_a = build_residential_proxy_config(session_id=None)
        cfg_b = build_residential_proxy_config(session_id=None)
    # Two distinct calls should produce two distinct sticky sessions so
    # different jobs cannot accidentally correlate to the same residential IP.
    assert cfg_a["username"] != cfg_b["username"]
    assert "-session-" in cfg_a["username"]
