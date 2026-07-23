import email
from email import policy

from app.services.eml_builder import build_eml, eml_filename


def _parse(raw: bytes):
    return email.message_from_bytes(raw, policy=policy.default)


def test_build_eml_basic_headers_and_unsent_flag():
    raw = build_eml("jane@company.com", "Quick question", "Hi Jane,\n\nBody here.")
    msg = _parse(raw)
    assert msg["To"] == "jane@company.com"
    assert msg["Subject"] == "Quick question"
    # X-Unsent: 1 makes Outlook desktop / Apple Mail open the file as an editable draft
    assert msg["X-Unsent"] == "1"
    assert "Body here." in msg.get_body(preferencelist=("plain",)).get_content()


def test_build_eml_html_alternative():
    raw = build_eml("a@b.com", "S", "plain text", body_html="<p>rich text</p>")
    msg = _parse(raw)
    assert "rich text" in msg.get_body(preferencelist=("html",)).get_content()
    assert "plain text" in msg.get_body(preferencelist=("plain",)).get_content()


def test_build_eml_attaches_resume():
    pdf = b"%PDF-1.4 fake"
    raw = build_eml(
        "a@b.com", "S", "body",
        resume_bytes=pdf, resume_filename="MyResume.pdf", resume_ctype="application/pdf",
    )
    msg = _parse(raw)
    atts = list(msg.iter_attachments())
    assert len(atts) == 1
    assert atts[0].get_filename() == "MyResume.pdf"
    assert atts[0].get_content_type() == "application/pdf"
    assert atts[0].get_payload(decode=True) == pdf


def test_build_eml_no_resume_no_attachment():
    msg = _parse(build_eml("a@b.com", "S", "body"))
    assert list(msg.iter_attachments()) == []


def test_eml_filename_sanitizes():
    assert eml_filename("Jane", "Goldman Sachs") == "Jane-Goldman-Sachs.eml"
    assert eml_filename(None, None) == "Outreach.eml"
    # path separators and weird chars must not survive into a download filename
    assert "/" not in eml_filename("a/b", "c\\d")
