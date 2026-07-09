"""Voice-overhaul Phase 1: the intent classifier's vocabulary + repair
contract (steady-forging-popcorn plan, 2026-07-08).

Guards three things a regression would silently break:
  1. The system prompt carries the firm vocabulary + phonetic-repair rule.
  2. `repaired` is always a bool on every output path.
  3. The cache key is salted (v1 entries poisoned by the no-vocab prompt
     must never be served).
"""
import hashlib
import json
from unittest.mock import MagicMock, patch

import pytest

from app.services import scout_intent
from app.services.firm_vocabulary import (
    CANONICAL_FIRMS,
    classifier_vocab_block,
    transcription_prompt,
)


pytestmark = pytest.mark.unit


def _llm_response(payload: dict):
    resp = MagicMock()
    resp.choices[0].message.tool_calls[0].function.arguments = json.dumps(payload)
    return resp


def _classification(**overrides):
    base = {
        "intent": "draft_outreach", "cleaned_ask": "Draft 2 analysts at Moelis",
        "role": "analysts", "company": "Moelis", "location": "", "count": 2,
        "hiring_manager": False, "wants_send": False, "job_query": "",
        "repaired": True,
    }
    base.update(overrides)
    return base


class TestVocabularyPrompt:
    def test_system_prompt_contains_fragile_firms(self):
        for firm in ("Moelis", "Evercore", "Lazard", "Centerview", "PJT Partners"):
            assert firm in scout_intent._SYSTEM

    def test_system_prompt_contains_repair_instruction(self):
        assert "repaired=true" in scout_intent._SYSTEM
        assert "phonetically" in scout_intent._SYSTEM
        # The never-invent guardrail must survive prompt edits.
        assert "NEVER" in scout_intent._SYSTEM

    def test_tool_schema_requires_repaired(self):
        params = scout_intent._TOOL["function"]["parameters"]
        assert params["properties"]["repaired"]["type"] == "boolean"
        assert "repaired" in params["required"]

    def test_vocab_block_is_all_canonical_firms(self):
        block = classifier_vocab_block()
        assert all(f in block for f in CANONICAL_FIRMS)

    def test_transcription_prompt_budget_and_priority(self):
        p = transcription_prompt(["Handlebar Coffee", "Moelis"])
        # User hints lead, dedupe holds, and the prompt stays under the
        # whisper truncation ceiling (~224 tokens ≈ 900 chars is generous).
        assert p.index("Handlebar Coffee") < p.index("Evercore")
        assert p.count("Moelis") == 1
        assert len(p) < 900
        assert "Google" not in p  # FAANG never makes the biasing cut


class TestRepairedCoercion:
    def _run(self, payload, ask="Draft 2 analysts at Molly's"):
        with patch.object(scout_intent, "get_openai_client") as gc:
            gc.return_value.chat.completions.create.return_value = _llm_response(payload)
            scout_intent._mem_cache.clear()
            return scout_intent.classify_scout_ask(None, ask)

    def test_repaired_true_passes_through(self):
        # Ask is the garbled form; company is the repair — flag survives.
        assert self._run(_classification(repaired=True))["repaired"] is True

    def test_verbatim_company_forces_repaired_false(self):
        # Deterministic guard: company said verbatim can't be "repaired",
        # whatever the model claims — no needless confirm cards.
        out = self._run(
            _classification(company="Goldman Sachs", repaired=True),
            ask="Draft 3 IB analysts at Goldman Sachs",
        )
        assert out["repaired"] is False

    def test_missing_repaired_coerces_false(self):
        payload = _classification()
        del payload["repaired"]
        assert self._run(payload)["repaired"] is False

    def test_error_path_carries_repaired_false(self):
        with patch.object(scout_intent, "get_openai_client", return_value=None):
            scout_intent._mem_cache.clear()
            out = scout_intent.classify_scout_ask(None, "anything")
        assert out["repaired"] is False and out["error"] == "no_llm"


class TestCacheSalt:
    def test_key_is_salted_v2(self):
        ask = "find me two analysts at Molly's"
        v1_key = hashlib.md5(ask.lower().strip().encode()).hexdigest()
        v2_key = hashlib.md5(("v2|" + ask.lower().strip()).encode()).hexdigest()
        assert v1_key != v2_key

        db = MagicMock()
        snap = MagicMock()
        snap.exists = False
        db.collection.return_value.document.return_value.get.return_value = snap
        with patch.object(scout_intent, "get_openai_client") as gc:
            gc.return_value.chat.completions.create.return_value = _llm_response(_classification())
            scout_intent._mem_cache.clear()
            scout_intent.classify_scout_ask(db, ask)
        # Both the read and the write must use the salted key.
        db.collection.return_value.document.assert_any_call(v2_key)
        written_keys = [c.args[0] for c in db.collection.return_value.document.call_args_list]
        assert v1_key not in written_keys
