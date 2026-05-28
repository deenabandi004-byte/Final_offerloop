"""Resume parsing for the public Find Companies widget.

Re-exports the two pure (no-Firebase) helpers from
`app.services.interview_prep.resume_parser` so the public route never
imports a Firebase-coupled symbol. `get_user_resume_text` and
`get_user_profile` in that module DO touch Firebase Storage and
Firestore, but we don't import them here.
"""
from __future__ import annotations

from app.services.interview_prep.resume_parser import (
    extract_text_from_pdf_bytes,
    parse_resume_to_profile,
)

__all__ = ["extract_text_from_pdf_bytes", "parse_resume_to_profile"]
