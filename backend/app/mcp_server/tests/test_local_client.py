"""
End-to-end tests against the MCP server, driven via Flask's test_client.

These exercise the same JSON-RPC surface a real MCP client (Claude
Desktop, Cursor, etc.) would hit, but without launching gunicorn or
making real API calls. Paid APIs are mocked via conftest.py fixtures.
"""
from __future__ import annotations

import json

import pytest


JSONRPC_VERSION = "2.0"


# ── Helpers ──────────────────────────────────────────────────────────────────


def _rpc(client, method: str, params: dict | None = None, *, request_id: int = 1):
    body = {
        "jsonrpc": JSONRPC_VERSION,
        "id": request_id,
        "method": method,
        "params": params or {},
    }
    resp = client.post("/mcp", data=json.dumps(body), content_type="application/json")
    assert resp.status_code == 200, resp.get_data(as_text=True)
    return resp.get_json()


def _call_tool(client, name: str, args: dict, *, request_id: int = 1):
    return _rpc(client, "tools/call", {"name": name, "arguments": args}, request_id=request_id)


def _structured(envelope: dict) -> dict:
    assert envelope.get("jsonrpc") == JSONRPC_VERSION
    assert "result" in envelope, envelope
    return envelope["result"].get("structuredContent") or {}


# ── 1. Tool discovery ────────────────────────────────────────────────────────


def test_initialize_returns_server_info(client):
    env = _rpc(client, "initialize", {"protocolVersion": "2025-06-18"})
    result = env["result"]
    assert result["serverInfo"]["name"] == "offerloop"
    assert result["serverInfo"]["version"]
    assert "tools" in result["capabilities"]


def test_tools_list_returns_three_tools(client):
    env = _rpc(client, "tools/list")
    tools = env["result"]["tools"]
    names = sorted(t["name"] for t in tools)
    assert names == ["draft_outreach", "find_contacts", "get_company_intel"]
    for t in tools:
        assert t["description"]
        assert "inputSchema" in t
        assert t["inputSchema"]["type"] == "object"


# ── 2. find_contacts golden path ─────────────────────────────────────────────


def test_find_contacts_returns_personalization_hooks(
    client, mock_pdl, mock_warmth, call_counter
):
    env = _call_tool(client, "find_contacts", {
        "company": "Goldman Sachs",
        "school": "University of Southern California",
        "role": "Investment Banking Analyst",
    })
    result = _structured(env)
    assert result["company"] == "Goldman Sachs"
    assert result["cached"] is False
    assert len(result["contacts"]) == 5
    for c in result["contacts"]:
        assert c["name"]
        assert "personalization_hook" in c
        assert "warmth" in c
    # Alumni signal should fire for USC-tagged contacts
    rel_types = [c.get("relationship_type") for c in result["contacts"]]
    assert "alumni" in rel_types
    assert call_counter.pdl == 1


# ── 3. Cache hit on repeat ───────────────────────────────────────────────────


def test_find_contacts_caches_repeat_call(
    client, mock_pdl, mock_warmth, call_counter
):
    args = {"company": "Goldman Sachs", "school": "USC", "role": "Analyst"}
    first = _structured(_call_tool(client, "find_contacts", args, request_id=1))
    second = _structured(_call_tool(client, "find_contacts", args, request_id=2))
    assert first["cached"] is False
    assert second["cached"] is True
    assert call_counter.pdl == 1  # PDL hit once total


# ── 3b. Cache normalization across whitespace + case ────────────────────────


def test_find_contacts_cache_normalizes_string_args(
    client, mock_pdl, mock_warmth, call_counter
):
    _structured(_call_tool(client, "find_contacts", {
        "company": "Goldman Sachs", "school": "USC",
    }, request_id=1))
    out = _structured(_call_tool(client, "find_contacts", {
        "company": "  goldman   sachs ", "school": "usc",
    }, request_id=2))
    assert out["cached"] is True
    assert call_counter.pdl == 1


# ── 4. find_contacts per-hour rate limit ─────────────────────────────────────


def test_find_contacts_hour_cap_returns_paywall(
    client, mock_pdl, mock_warmth, call_counter
):
    # Vary args each call so we miss cache and exercise the limiter.
    last = None
    for i in range(11):
        args = {"company": f"Firm {i}", "school": "USC"}
        last = _structured(_call_tool(client, "find_contacts", args, request_id=i))
    # 11th call should be paywalled
    assert last.get("paywall") is not None
    assert last["paywall"]["claim_url"].startswith("http")
    assert "token=" in last["paywall"]["claim_url"]


# ── 5. find_contacts per-day cap fires before hour cap ───────────────────────


def test_find_contacts_day_cap_blocks_after_three(
    client, mock_pdl, mock_warmth, call_counter
):
    paywalled = None
    for i in range(4):
        args = {"company": f"Daily Firm {i}", "school": "USC"}
        out = _structured(_call_tool(client, "find_contacts", args, request_id=i))
        if out.get("paywall") is not None:
            paywalled = out
            break
    assert paywalled is not None
    assert paywalled["paywall"]["hit_cap_type"] in ("day", "hour")
    assert call_counter.pdl == 3  # PDL hit only for the 3 allowed queries


# ── 6. get_company_intel golden path ─────────────────────────────────────────


def test_get_company_intel_returns_full_bundle(
    client, mock_perplexity, mock_school_affinity, call_counter
):
    env = _call_tool(client, "get_company_intel", {
        "company": "Goldman Sachs",
        "user_school": "USC",
        "career_field": "investment banking",
    })
    result = _structured(env)
    assert result["company"] == "Goldman Sachs"
    assert result["overview"]["description"]
    assert result["recent_news"]
    assert result["recruiting_signals"]["hiring_momentum"]
    alumni = result["alumni_at_your_school"]
    assert alumni is not None
    assert alumni["school"] == "USC"
    assert alumni["count"] == 47  # from mock fixture


# ── 7. get_company_intel cache (two-tier TTL) ────────────────────────────────


def test_get_company_intel_cache_hits_second_call(
    client, mock_perplexity, mock_school_affinity, call_counter
):
    """When both stable + fresh buckets are warm, second call is a full cache hit."""
    args = {"company": "Jane Street", "user_school": "USC"}
    _structured(_call_tool(client, "get_company_intel", args, request_id=1))
    out = _structured(_call_tool(client, "get_company_intel", args, request_id=2))
    assert out["cached"] is True
    assert call_counter.perplexity_profile == 1
    assert call_counter.perplexity_news == 1
    assert call_counter.perplexity_market == 1
    assert call_counter.school_affinity == 1


def test_get_company_intel_fresh_bucket_refresh_keeps_stable(
    client, fake_db, mock_perplexity, mock_school_affinity, call_counter
):
    """When the 7-day fresh bucket expires but the 30-day stable bucket is
    still warm, only Perplexity news + market are re-fetched. The 30-day
    profile + school_affinity calls are NOT repeated."""
    from app.mcp_server.cache import COLLECTION as CACHE_COL, _key as cache_key
    from app.mcp_server.schemas import GetCompanyIntelInput

    args = {"company": "Jane Street", "user_school": "USC"}
    _structured(_call_tool(client, "get_company_intel", args, request_id=1))
    assert call_counter.perplexity_profile == 1
    assert call_counter.perplexity_news == 1
    assert call_counter.school_affinity == 1

    # Cache args mirror what the tool used: parsed.model_dump() includes
    # all schema fields with their defaults (career_field=None, etc.).
    cache_args = GetCompanyIntelInput.model_validate(args).model_dump()

    # Expire the fresh bucket by forcing its expires_at into the past.
    fresh_doc_id = cache_key("get_company_intel:fresh", cache_args)
    ref = fake_db.collection(CACHE_COL).document(fresh_doc_id)
    snap = ref.get()
    assert snap.exists
    data = snap.to_dict()
    data["expires_at"] = 1.0  # epoch ~1970
    ref.set(data)

    _structured(_call_tool(client, "get_company_intel", args, request_id=2))

    # Fresh bucket refetched (news + market both bumped):
    assert call_counter.perplexity_news == 2
    assert call_counter.perplexity_market == 2
    # Stable bucket reused (profile + school_affinity unchanged):
    assert call_counter.perplexity_profile == 1
    assert call_counter.school_affinity == 1


# ── 8. draft_outreach golden path ────────────────────────────────────────────


def test_draft_outreach_returns_subject_and_body(
    client, mock_llm, call_counter
):
    env = _call_tool(client, "draft_outreach", {
        "contact": {
            "name": "Maya Patel",
            "title": "IB Analyst",
            "company": "Goldman Sachs",
            "education": "USC",
        },
        "user_school": "USC",
        "user_major": "Finance",
        "user_year": "Junior",
        "user_career_track": "investment banking",
        "intent": "coffee_chat",
    })
    result = _structured(env)
    assert result["subject"]
    assert result["body"]
    assert "Maya" in result["body"]
    # Anti-hallucination smoke check: no em dashes
    assert "—" not in result["subject"]
    assert "—" not in result["body"]
    assert call_counter.llm == 1


# ── 9. draft_outreach per-day cap (2/day) ────────────────────────────────────


def test_draft_outreach_day_cap_kicks_in(client, mock_llm, call_counter):
    payload = lambda i: {
        "contact": {"name": f"Person {i}", "title": "Analyst", "company": "Firm"},
        "user_school": "USC",
    }
    paywalled = None
    for i in range(3):
        out = _structured(_call_tool(client, "draft_outreach", payload(i), request_id=i))
        if out.get("paywall") is not None:
            paywalled = out
            break
    assert paywalled is not None
    assert paywalled["paywall"]["claim_url"].startswith("http")


# ── 10. Budget exhaustion returns cached-only fallback ───────────────────────


def test_find_contacts_budget_exhaustion_returns_cta(
    client, fake_db, mock_pdl, mock_warmth, call_counter
):
    from datetime import datetime, timezone
    from app.mcp_server.budget import COLLECTION as BUDGET_COL
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    fake_db.collection(BUDGET_COL).document(today).set({
        "credits": 200,
        "spent_usd": 100.0,
        "day": today,
    })
    out = _structured(_call_tool(client, "find_contacts", {
        "company": "Fresh Firm", "school": "USC",
    }))
    assert out.get("paywall") is not None
    assert out["paywall"]["hit_cap_type"] == "budget"
    assert call_counter.pdl == 0  # never reached PDL


# ── 11. Attribution token roundtrip ──────────────────────────────────────────


def test_paywall_token_decodes_to_origin_tool_and_ip(
    client, mock_pdl, mock_warmth
):
    # Burn the daily quota to trigger a paywall.
    paywalled = None
    for i in range(4):
        out = _structured(_call_tool(client, "find_contacts", {
            "company": f"Token Firm {i}", "school": "USC",
        }, request_id=i))
        if out.get("paywall") is not None:
            paywalled = out
            break
    assert paywalled is not None
    url = paywalled["paywall"]["claim_url"]
    token = url.split("token=", 1)[1]
    from app.mcp_server.attribution import verify_claim_token
    decoded = verify_claim_token(token)
    assert decoded is not None
    assert decoded["tool"] == "find_contacts"
    assert len(decoded["ip_hash"]) == 16


# ── 12. /api/mcp/health smoke ────────────────────────────────────────────────


def test_health_endpoint(client):
    resp = client.get("/api/mcp/health")
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["status"] == "ok"
    assert "budget" in data
    assert "limits" in data


# ── 13. Prod-Firestore guard ─────────────────────────────────────────────────


def test_prod_guard_raises_when_pointed_at_prod_in_dev(monkeypatch):
    """When the active Firebase project is offerloop-native and FLASK_ENV
    is not 'production', register_mcp_blueprint must raise so the app
    refuses to boot rather than silently writing to prod."""
    from flask import Flask
    from app.mcp_server import flask_mount

    class _FakeApp:
        project_id = "offerloop-native"

    monkeypatch.setattr(flask_mount.firebase_admin, "get_app", lambda: _FakeApp())
    monkeypatch.setenv("FLASK_ENV", "development")

    app = Flask(__name__)
    with pytest.raises(RuntimeError, match="Refusing to mount MCP server"):
        flask_mount.register_mcp_blueprint(app)


def test_prod_guard_allows_when_flask_env_is_production(monkeypatch):
    from flask import Flask
    from app.mcp_server import flask_mount

    class _FakeApp:
        project_id = "offerloop-native"

    monkeypatch.setattr(flask_mount.firebase_admin, "get_app", lambda: _FakeApp())
    monkeypatch.setenv("FLASK_ENV", "production")

    app = Flask(__name__)
    flask_mount.register_mcp_blueprint(app)
    assert "mcp" in app.blueprints


def test_prod_guard_allows_when_pointed_at_non_prod_project(monkeypatch):
    from flask import Flask
    from app.mcp_server import flask_mount

    class _FakeApp:
        project_id = "offerloop-dev"

    monkeypatch.setattr(flask_mount.firebase_admin, "get_app", lambda: _FakeApp())
    monkeypatch.setenv("FLASK_ENV", "development")

    app = Flask(__name__)
    flask_mount.register_mcp_blueprint(app)
    assert "mcp" in app.blueprints
