"""
Unit tests for pdf_patcher module.
"""
import pytest
import fitz

from app.services.pdf_patcher import (
    build_text_index,
    find_match,
    apply_patch,
    patch_pdf,
    get_font_info,
    preserve_bullet_prefix,
    normalize_text,
    TextUnit,
    SpanInfo,
    FontInfo,
)


def _make_test_doc():
    """Create a minimal PDF with resume-like content."""
    doc = fitz.open()
    page = doc.new_page(width=612, height=792)
    x, y = 72, 72
    page.insert_text((x, y), "Jane Doe", fontname="helvetica", fontsize=18)
    y += 24
    page.insert_text((x, y), "EXPERIENCE", fontname="helvetica-bold", fontsize=12)
    y += 16
    page.insert_text((x, y), "Software Engineer at Acme Corp", fontname="helvetica", fontsize=11)
    y += 14
    bullet = "Built scalable APIs serving 1M+ requests daily."
    page.insert_text((x + 12, y), "• " + bullet, fontname="helvetica", fontsize=10)
    y += 14
    bullet2 = "Led migration from monolith to microservices."
    page.insert_text((x + 12, y), "• " + bullet2, fontname="helvetica", fontsize=10)
    y += 20
    page.insert_text((x, y), "SKILLS", fontname="helvetica-bold", fontsize=12)
    y += 14
    skills_line = "Languages: Python, JavaScript, SQL"
    page.insert_text((x, y), skills_line, fontname="helvetica", fontsize=10)
    return doc


class TestNormalizeText:
    def test_ligatures(self):
        assert normalize_text("ﬁle") == "file"
        assert normalize_text("ﬂow") == "flow"

    def test_whitespace(self):
        assert normalize_text("  hello   world  ") == "hello world"

    def test_quotes(self):
        assert normalize_text("'hello'") == "'hello'"
        assert normalize_text("\u2018hi\u2019") == "'hi'"


class TestPreserveBulletPrefix:
    def test_preserves_bullet(self):
        orig = "• Original bullet text"
        repl = "Replacement text"
        result = preserve_bullet_prefix(orig, repl)
        assert result.startswith("• ")

    def test_no_double_bullet(self):
        orig = "• Original"
        repl = "• Replacement"
        result = preserve_bullet_prefix(orig, repl)
        assert result == "• Replacement"


class TestBuildTextIndex:
    def test_build_index(self):
        doc = _make_test_doc()
        units = build_text_index(doc)
        doc.close()
        assert len(units) >= 5
        texts = [u.full_text for u in units]
        assert any("EXPERIENCE" in t for t in texts)
        assert any("SKILLS" in t for t in texts)
        assert any("Python" in t for t in texts)


class TestFindMatch:
    def test_exact_match(self):
        doc = _make_test_doc()
        units = build_text_index(doc)
        doc.close()
        target = "Languages: Python, JavaScript, SQL"
        match, _ = find_match(target, units)
        assert match is not None
        assert "Python" in match.full_text

    def test_substring_match(self):
        doc = _make_test_doc()
        units = build_text_index(doc)
        doc.close()
        match, _ = find_match("Python, JavaScript", units)
        assert match is not None

    def test_no_match(self):
        doc = _make_test_doc()
        units = build_text_index(doc)
        doc.close()
        match, _ = find_match("Nonexistent text xyz123", units)
        assert match is None


class TestApplyPatch:
    def test_bullet_rewrite(self):
        doc = _make_test_doc()
        units = build_text_index(doc)
        bullet_unit = next(u for u in units if "Built scalable" in u.full_text)
        font_info = get_font_info(bullet_unit.spans)
        result, doc = apply_patch(
            doc,
            bullet_unit.page_num,
            bullet_unit,
            "• Rewritten bullet with new content.",
            font_info,
            preserve_bullet=True,
        )
        doc.close()
        assert result.fit_success
        assert result.status == "applied"

    def test_skill_append(self):
        doc = _make_test_doc()
        units = build_text_index(doc)
        skills_unit = next(u for u in units if "Languages:" in u.full_text)
        font_info = get_font_info(skills_unit.spans)
        # Use shorter replacement so it fits in the test PDF's narrow bbox
        result, doc = apply_patch(
            doc,
            skills_unit.page_num,
            skills_unit,
            "Languages: Python, JS, SQL",
            font_info,
            preserve_bullet=False,
        )
        doc.close()
        assert result.fit_success


class TestPatchPdf:
    def test_patch_pdf_success(self):
        doc = _make_test_doc()
        pdf_bytes = doc.write()
        doc.close()

        patches = [
            {
                "type": "bullet_rewrite",
                "original_text": "Built scalable APIs serving 1M+ requests daily.",
                "replacement_text": "• Built scalable APIs serving 2M+ requests daily.",
            }
        ]
        out = patch_pdf(pdf_bytes, patches)
        assert out["all_safe"]
        assert out["patched_pdf_bytes"] is not None
        assert len(out["patch_log"]) == 1
        assert out["patch_log"][0]["status"] == "applied"

    def test_patch_pdf_not_found(self):
        doc = _make_test_doc()
        pdf_bytes = doc.write()
        doc.close()

        patches = [
            {
                "type": "bullet_rewrite",
                "original_text": "Nonexistent bullet xyz789",
                "replacement_text": "Replacement",
            }
        ]
        out = patch_pdf(pdf_bytes, patches)
        assert not out["all_safe"]
        assert out["patch_log"][0]["status"] == "not_found"
