"""
Tests for resume workshop tailor logic and validation rules.
"""
import pytest


def _current_has_metric_phrase(current: str, phrase: str) -> bool:
    """Return True if current bullet contains the metric phrase (case-insensitive)."""
    if not current or not phrase:
        return False
    return phrase.lower() in current.lower()


def validate_no_fabricated_metrics_in_bullets(sections: dict, banned_phrases: list[str] | None = None) -> list[str]:
    """
    Validate that suggested experience bullets don't introduce fabricated metrics
    that weren't in the original. Returns list of violation messages.
    """
    banned_phrases = banned_phrases or ["over 100 students", "100+ students", "over 100"]
    violations = []
    experience = sections.get("experience") or []
    for role_idx, exp in enumerate(experience):
        for bullet_idx, bullet in enumerate(exp.get("bullets") or []):
            current = (bullet.get("current") or "").strip()
            suggested = (bullet.get("suggested") or "").strip()
            for phrase in banned_phrases:
                if _current_has_metric_phrase(current, phrase):
                    continue
                if _current_has_metric_phrase(suggested, phrase):
                    violations.append(
                        f"Role {role_idx} bullet {bullet_idx}: suggested adds '{phrase}' but current didn't have it"
                    )
    return violations


class TestTailorBulletValidation:
    """Validation that tailor suggestions don't fabricate metrics."""

    def test_suggested_must_not_add_over_100_students_when_current_lacks_it(self):
        sections = {
            "experience": [
                {
                    "role": "Tutor",
                    "company": "ITS",
                    "bullets": [
                        {
                            "current": "Tutored students in math and science.",
                            "suggested": "Tutored over 100 students in math and science.",
                            "why": "Added quantification",
                            "priority": "high",
                        }
                    ],
                }
            ]
        }
        violations = validate_no_fabricated_metrics_in_bullets(sections)
        assert len(violations) >= 1
        assert any("over 100 students" in v for v in violations)

    def test_suggested_may_keep_100_students_when_current_has_it(self):
        sections = {
            "experience": [
                {
                    "role": "Tutor",
                    "company": "ITS",
                    "bullets": [
                        {
                            "current": "Tutored over 100 students in math and science.",
                            "suggested": "Tutored over 100 students in math and science with focus on exam prep.",
                            "why": "Added context",
                            "priority": "medium",
                        }
                    ],
                }
            ]
        }
        violations = validate_no_fabricated_metrics_in_bullets(sections)
        assert len(violations) == 0

    def test_no_violations_when_suggested_unchanged(self):
        sections = {
            "experience": [
                {
                    "role": "Offerloop",
                    "company": "Offerloop",
                    "bullets": [
                        {
                            "current": "Designed a system that compresses hours of work into minutes.",
                            "suggested": "Designed a system that compresses hours of manual recruiting work into minutes through automation.",
                            "why": "Added specificity",
                            "priority": "high",
                        }
                    ],
                }
            ]
        }
        violations = validate_no_fabricated_metrics_in_bullets(sections)
        assert len(violations) == 0
