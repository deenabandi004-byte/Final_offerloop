"""Builds downloadable .eml draft files for users without a connected inbox.

The X-Unsent: 1 header tells Outlook desktop and Apple Mail to open the file
as an editable draft (compose window) instead of a received message.
"""
import re
from email import encoders
from email.mime.base import MIMEBase
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText


def build_eml(to_addr, subject, body_text, body_html=None,
              resume_bytes=None, resume_filename=None, resume_ctype=None):
    """Return complete RFC 5322 message bytes for a draft email.

    Mirrors the MIME structure used by the Gmail draft path in
    routes/emails.py (multipart/mixed > multipart/alternative > plain+html,
    resume as base64 attachment) so the two delivery modes produce the
    same email.
    """
    msg = MIMEMultipart("mixed")
    msg["To"] = to_addr
    msg["Subject"] = subject or ""
    msg["X-Unsent"] = "1"

    alt = MIMEMultipart("alternative")
    alt.attach(MIMEText(body_text or "", "plain", "utf-8"))
    if body_html:
        alt.attach(MIMEText(body_html, "html", "utf-8"))
    msg.attach(alt)

    if resume_bytes:
        ctype = (resume_ctype or "application/pdf").split(";", 1)[0].strip()
        main, sub = ctype.split("/", 1) if "/" in ctype else ("application", "pdf")
        part = MIMEBase(main, sub)
        part.set_payload(resume_bytes)
        encoders.encode_base64(part)
        filename = resume_filename or "Resume.pdf"
        part.add_header("Content-Disposition", f'attachment; filename="{filename}"')
        msg.attach(part)

    return msg.as_bytes()


def eml_filename(first_name, company):
    """Safe download filename: letters/digits/dashes only, .eml extension."""
    parts = [p for p in (first_name, company) if p and str(p).strip()]
    stem = "-".join(str(p).strip() for p in parts) or "Outreach"
    stem = re.sub(r"[^A-Za-z0-9-]+", "-", stem).strip("-") or "Outreach"
    return f"{stem}.eml"
