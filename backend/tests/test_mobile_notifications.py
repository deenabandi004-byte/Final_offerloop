"""
Tests for the mobile notification mapping helpers (app/routes/mobile.py).

Pure functions only — no Firestore. Verifies reply vs loop-run items map to the
mobile NotificationItem shape and that relative time labels bucket correctly.
"""
from datetime import datetime, timedelta, timezone

from app.routes import mobile


class TestMapNotificationItem:
    def test_reply_item(self):
        item = {
            "contactId": "c123",
            "contactName": "Jeff Hammer",
            "company": "Lazard",
            "snippet": "Happy to chat Thursday",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "read": False,
            "messageId": "msg-1",
        }
        out = mobile._map_notification_item(item)
        assert out["id"] == "msg-1"
        assert out["kind"] == "reply"
        assert out["text"] == "Jeff Hammer replied: Happy to chat Thursday"
        assert out["outreachId"] == "c123"
        assert out["read"] is False

    def test_reply_item_no_snippet(self):
        out = mobile._map_notification_item({"contactName": "Ada", "contactId": "c9"})
        assert out["text"] == "Ada replied"
        assert out["kind"] == "reply"

    def test_loop_item(self):
        item = {
            "kind": "loop_run",
            "loopId": "loop7",
            "loopName": "Goldman SA",
            "cycleId": "cyc-42",
            "snippet": "Found 3 contacts, 2 jobs.",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "read": True,
        }
        out = mobile._map_notification_item(item)
        assert out["id"] == "cyc-42"
        assert out["kind"] == "loop"
        assert out["text"] == "Goldman SA: Found 3 contacts, 2 jobs."
        assert "outreachId" not in out  # loop items are informational
        assert out["read"] is True

    def test_reply_id_falls_back_to_contact_and_ts(self):
        out = mobile._map_notification_item({"contactId": "c5", "timestamp": "2026-06-16T00:00:00+00:00"})
        assert out["id"] == "c5:2026-06-16T00:00:00+00:00"


class TestRelativeLabel:
    def test_buckets(self):
        now = datetime.now(timezone.utc)
        assert mobile._relative_label(now.isoformat()) == "Just now"
        assert mobile._relative_label((now - timedelta(minutes=5)).isoformat()) == "5m"
        assert mobile._relative_label((now - timedelta(hours=3)).isoformat()) == "3h"
        assert mobile._relative_label((now - timedelta(days=2)).isoformat()) == "2d"
        assert mobile._relative_label((now - timedelta(days=10)).isoformat()) == "1w"

    def test_empty_and_garbage(self):
        assert mobile._relative_label("") == ""
        assert mobile._relative_label("not-a-date") == ""

    def test_naive_timestamp_treated_as_utc(self):
        # No tzinfo -> assumed UTC, should not raise
        recent = datetime.now(timezone.utc).replace(tzinfo=None).isoformat()
        assert mobile._relative_label(recent) in {"Just now", "1m"}


class TestMapResumeExperiences:
    def test_maps_real_experience_entries(self):
        parsed = {
            "experience": [
                {
                    "company": "Goldman Sachs",
                    "title": "Summer Analyst",
                    "dates": "Jun 2025 – Aug 2025",
                    "location": "New York, NY",
                    "bullets": ["Built DCF models", "Pitched 3 deals", "  "],
                },
                {"company": "", "title": "", "bullets": []},  # skipped: no role/org
            ]
        }
        out = mobile._map_resume_experiences(parsed)
        assert len(out) == 1
        exp = out[0]
        assert exp["id"] == "exp-0"
        assert exp["role"] == "Summer Analyst"
        assert exp["org"] == "Goldman Sachs"
        assert exp["dates"] == "Jun 2025 – Aug 2025"
        assert exp["location"] == "New York, NY"
        # blank bullet stripped
        assert exp["bullets"] == ["Built DCF models", "Pitched 3 deals"]

    def test_empty_or_missing_returns_empty_list(self):
        assert mobile._map_resume_experiences({}) == []
        assert mobile._map_resume_experiences({"experience": None}) == []
        assert mobile._map_resume_experiences({"experience": []}) == []

    def test_location_falls_back_to_none(self):
        out = mobile._map_resume_experiences(
            {"experience": [{"company": "Acme", "title": "Intern", "bullets": []}]}
        )
        assert out[0]["location"] is None


class TestGradYear:
    def test_explicit_wins(self):
        u = {"gradYear": "2026", "resumeParsed": {"education": {"graduation": "May 2024"}}}
        assert mobile._grad_year(u, {}, {"gradYear": "2027"}) == "2027"

    def test_extracts_from_resume_graduation(self):
        u = {"resumeParsed": {"education": {"graduation": "May 2025"}}}
        assert mobile._grad_year(u, {}, {}) == "2025"

    def test_empty_when_nothing(self):
        assert mobile._grad_year({}, {}, {}) == ""


class TestLinkedinHighlights:
    def test_composes_objective_skills_extracurriculars(self):
        u = {
            "linkedinResumeParsed": {
                "objective": "Aspiring investment banker.",
                "skills": {"technical": ["Excel", "Python"], "tools": ["Bloomberg"]},
                "extracurriculars": [{"role": "Treasurer", "organization": "Investment Club"}],
            }
        }
        out = mobile._linkedin_highlights(u)
        assert out[0] == "Aspiring investment banker."
        assert out[1] == "Skills: Excel, Python, Bloomberg"
        assert out[2] == "Treasurer — Investment Club"

    def test_empty_when_not_enriched(self):
        assert mobile._linkedin_highlights({}) == []
        assert mobile._linkedin_highlights({"linkedinResumeParsed": None}) == []


class TestCompanyHelpers:
    def test_slug(self):
        assert mobile._company_slug("Goldman Sachs & Co.") == "goldman-sachs-co"
        assert mobile._company_slug("  Roblox  ") == "roblox"

    def test_employee_label(self):
        assert mobile._employee_label(2300) == "2300 employees"
        assert mobile._employee_label("1001-5000") == "1001-5000 employees"
        assert mobile._employee_label("5,000 employees") == "5,000 employees"
        assert mobile._employee_label(None) == ""
        assert mobile._employee_label("") == ""

    def test_first_industry(self):
        assert mobile._first_industry(["Gaming", "Tech"]) == "Gaming"
        assert mobile._first_industry([" ", "Finance"]) == "Finance"
        assert mobile._first_industry([]) == ""
        assert mobile._first_industry("Consulting") == "Consulting"

    def test_map_company_profile_maps_firecrawl_fields(self):
        out = mobile._map_company_profile(
            "Roblox",
            {
                "description": "A gaming platform.",
                "industries": ["Gaming"],
                "employee_count": 2300,
                "headquarters": "San Mateo, CA",
                "recent_news": ["ignored in v1"],
            },
        )
        assert out == {
            "name": "Roblox",
            "about": "A gaming platform.",
            "industry": "Gaming",
            "size": "2300 employees",
            "hq": "San Mateo, CA",
            "news": [],
        }

    def test_map_company_profile_empty_firecrawl(self):
        out = mobile._map_company_profile("Nowhere Inc", {})
        assert out["about"] == "" and out["industry"] == "" and out["news"] == []
