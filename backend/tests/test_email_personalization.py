"""Tests for email personalization: warmth-tier prompt variants, subject lines, opener rules."""
import pytest
import os
import json
from unittest.mock import patch, MagicMock

os.environ.setdefault("FLASK_ENV", "testing")
os.environ.setdefault("GOOGLE_APPLICATION_CREDENTIALS", "test-credentials.json")

from app.services.reply_generation import batch_generate_emails


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_mock_openai_client(contact_count):
    """Create a mock OpenAI client that returns valid email JSON."""
    emails = {}
    for i in range(contact_count):
        emails[str(i)] = {
            "subject": f"Quick question about your role at Company {i}",
            "body": f"Hi Contact{i},\n\nYour background is impressive.\n\nBest,\nTest User",
        }
    content = json.dumps(emails)

    mock_msg = MagicMock()
    mock_msg.content = content

    mock_choice = MagicMock()
    mock_choice.message = mock_msg

    mock_resp = MagicMock()
    mock_resp.choices = [mock_choice]

    mock_client = MagicMock()
    # Handle client.with_options(...).chat.completions.create(...)
    mock_client.with_options.return_value = mock_client
    mock_client.chat.completions.create.return_value = mock_resp

    return mock_client


def _extract_prompt_text(mock_client):
    """Extract the full prompt text from a mock OpenAI client's call args."""
    call_args = mock_client.chat.completions.create.call_args
    if call_args is None:
        return ""
    kwargs = call_args[1] if call_args[1] else {}
    messages = kwargs.get("messages", [])
    return " ".join(m.get("content", "") for m in messages if isinstance(m, dict))


@pytest.fixture
def base_contacts():
    return [
        {"FirstName": "Jane", "LastName": "Doe", "company": "Goldman Sachs", "title": "Analyst", "headline": "Analyst at Goldman Sachs"},
        {"FirstName": "Bob", "LastName": "Smith", "company": "Google", "title": "Engineer", "headline": "Engineer at Google"},
    ]


@pytest.fixture
def user_profile():
    return {
        "academics": {"university": "USC", "major": "Finance"},
        "goals": {"careerTrack": "investment banking"},
    }


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

@patch("app.services.reply_generation.get_anthropic_client", return_value=None)
@patch("app.services.reply_generation.get_openai_client")
def test_warm_tier_prompt_includes_conversational_tone(mock_client_fn, mock_anthropic, base_contacts, user_profile):
    """When warmth_data marks contacts as warm, prompt should include warm tone guidance."""
    mock_client = _make_mock_openai_client(2)
    mock_client_fn.return_value = mock_client

    warmth_data = {
        0: {"tier": "warm", "score": 65, "signals": [{"signal": "same_university", "points": 20}]},
        1: {"tier": "warm", "score": 55, "signals": [{"signal": "same_major", "points": 10}]},
    }

    batch_generate_emails(
        base_contacts, "Resume text", user_profile, ["investment banking"],
        warmth_data=warmth_data,
    )

    prompt_text = _extract_prompt_text(mock_client)
    assert "WARM" in prompt_text or "warm" in prompt_text
    assert "Conversational" in prompt_text or "conversational" in prompt_text or "friendly" in prompt_text


@patch("app.services.reply_generation.get_anthropic_client", return_value=None)
@patch("app.services.reply_generation.get_openai_client")
def test_cold_tier_prompt_includes_concise_guidance(mock_client_fn, mock_anthropic, base_contacts, user_profile):
    """When warmth_data marks contacts as cold, prompt should include cold/concise tone guidance."""
    mock_client = _make_mock_openai_client(2)
    mock_client_fn.return_value = mock_client

    warmth_data = {
        0: {"tier": "cold", "score": 10, "signals": []},
        1: {"tier": "cold", "score": 5, "signals": []},
    }

    batch_generate_emails(
        base_contacts, "Resume text", user_profile, ["tech"],
        warmth_data=warmth_data,
    )

    prompt_text = _extract_prompt_text(mock_client)
    assert "COLD" in prompt_text or "cold" in prompt_text or "Concise" in prompt_text or "concise" in prompt_text


@patch("app.services.reply_generation.get_anthropic_client", return_value=None)
@patch("app.services.reply_generation.get_openai_client")
def test_no_forced_opener_in_prompt(mock_client_fn, mock_anthropic, base_contacts, user_profile):
    """Prompt must explicitly forbid 'I came across' pattern."""
    mock_client = _make_mock_openai_client(2)
    mock_client_fn.return_value = mock_client

    batch_generate_emails(
        base_contacts, "Resume text", user_profile, ["consulting"],
    )

    prompt_text = _extract_prompt_text(mock_client)
    # The prompt should ban forced opener patterns
    assert "I came across" in prompt_text  # referenced as what NOT to do
    assert "Do NOT" in prompt_text or "do NOT" in prompt_text or "Never" in prompt_text


@patch("app.services.reply_generation.get_anthropic_client", return_value=None)
@patch("app.services.reply_generation.get_openai_client")
def test_subject_line_personalization_in_prompt(mock_client_fn, mock_anthropic, base_contacts, user_profile):
    """When no subject_line override, prompt should instruct personalized subject lines."""
    mock_client = _make_mock_openai_client(2)
    mock_client_fn.return_value = mock_client

    batch_generate_emails(
        base_contacts, "Resume text", user_profile, ["finance"],
    )

    prompt_text = _extract_prompt_text(mock_client)
    assert "subject" in prompt_text.lower()
    assert "Personalize" in prompt_text or "personalize" in prompt_text


@patch("app.services.reply_generation.get_anthropic_client", return_value=None)
@patch("app.services.reply_generation.get_openai_client")
def test_subject_line_fallback_when_provided(mock_client_fn, mock_anthropic, base_contacts, user_profile):
    """When subject_line is provided, prompt should use that pattern."""
    mock_client = _make_mock_openai_client(2)
    mock_client_fn.return_value = mock_client

    batch_generate_emails(
        base_contacts, "Resume text", user_profile, ["finance"],
        subject_line="Networking: USC Finance Student",
    )

    prompt_text = _extract_prompt_text(mock_client)
    assert "Networking: USC Finance Student" in prompt_text


@patch("app.services.reply_generation.get_anthropic_client", return_value=None)
@patch("app.services.reply_generation.get_openai_client")
def test_warmth_data_none_still_generates(mock_client_fn, mock_anthropic, base_contacts, user_profile):
    """When warmth_data is None (fallback), emails should still generate without error."""
    mock_client = _make_mock_openai_client(2)
    mock_client_fn.return_value = mock_client

    result = batch_generate_emails(
        base_contacts, "Resume text", user_profile, ["tech"],
        warmth_data=None,
    )

    assert result is not None
    mock_client.chat.completions.create.assert_called_once()
