"""Tests for the onboarding resume builder service + routes."""
import pytest
from unittest.mock import MagicMock, patch

from app.services.resume_renderer import (
    CanonicalResume,
    ContactInfo,
    EducationEntry,
    ExperienceEntry,
    SkillsGroup,
)


def _sample_resume() -> CanonicalResume:
    return CanonicalResume(
        contact=ContactInfo(name="Jane Trojan", email="jane@usc.edu", phone="213-555-0100"),
        education=[
            EducationEntry(
                school="University of Southern California",
                degree="B.S. in Business Administration",
                graduation="May 2027",
                gpa="3.8",
            )
        ],
        experience=[
            ExperienceEntry(
                company="Acme Consulting Club",
                role="Analyst",
                start="Sep 2025",
                end="Present",
                bullets=["Led a 4-person case team"],
            )
        ],
        skills=[SkillsGroup(category="Technical", items=["Excel", "SQL"])],
    )


class TestCanonicalToParsedInfo:
    def test_maps_contact_and_name(self):
        from app.services.resume_builder_service import canonical_to_parsed_info
        parsed = canonical_to_parsed_info(_sample_resume())
        assert parsed["name"] == "Jane Trojan"
        assert parsed["contact"]["email"] == "jane@usc.edu"
        assert parsed["contact"]["phone"] == "213-555-0100"

    def test_education_is_single_object_with_university_and_graduation(self):
        from app.services.resume_builder_service import canonical_to_parsed_info
        edu = canonical_to_parsed_info(_sample_resume())["education"]
        assert edu["university"] == "University of Southern California"
        assert edu["graduation"] == "May 2027"
        assert edu["degree"] == "B.S. in Business Administration"
        assert edu["gpa"] == "3.8"

    def test_experience_round_trips_through_normalizer(self):
        """The parsed dict must normalize back into an equivalent CanonicalResume."""
        from app.services.resume_builder_service import canonical_to_parsed_info
        from app.services.resume_renderer import from_resume_parsed
        parsed = canonical_to_parsed_info(_sample_resume())
        back = from_resume_parsed(parsed)
        assert back.experience[0].company == "Acme Consulting Club"
        assert back.experience[0].bullets == ["Led a 4-person case team"]
        assert back.skills[0].items == ["Excel", "SQL"]


class TestCanonicalToText:
    def test_contains_all_sections(self):
        from app.services.resume_builder_service import canonical_to_text
        text = canonical_to_text(_sample_resume())
        for fragment in [
            "Jane Trojan",
            "University of Southern California",
            "Acme Consulting Club",
            "Led a 4-person case team",
            "Excel",
        ]:
            assert fragment in text


class TestGenerateCanonicalResume:
    def test_returns_validated_resume_from_tool_use(self):
        from app.services import resume_builder_service as svc
        tool_block = MagicMock()
        tool_block.type = "tool_use"
        tool_block.input = _sample_resume().model_dump()
        client = MagicMock()
        client.messages.create.return_value = MagicMock(content=[tool_block])
        with patch.object(svc, "get_anthropic_client", return_value=client):
            result = svc.generate_canonical_resume("I go to USC, class of 2027...", None)
        assert result.contact.name == "Jane Trojan"

    def test_raises_when_client_missing(self):
        from app.services import resume_builder_service as svc
        with patch.object(svc, "get_anthropic_client", return_value=None):
            with pytest.raises(svc.ResumeBuilderError):
                svc.generate_canonical_resume("anything", None)

    def test_previous_resume_is_included_in_user_message(self):
        from app.services import resume_builder_service as svc
        tool_block = MagicMock()
        tool_block.type = "tool_use"
        tool_block.input = _sample_resume().model_dump()
        client = MagicMock()
        client.messages.create.return_value = MagicMock(content=[tool_block])
        with patch.object(svc, "get_anthropic_client", return_value=client):
            svc.generate_canonical_resume("add my SQL project", _sample_resume().model_dump())
        sent = client.messages.create.call_args.kwargs["messages"][0]["content"]
        assert "Acme Consulting Club" in sent
