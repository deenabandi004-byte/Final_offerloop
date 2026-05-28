"""Public (no-auth) Find Hiring Manager service.

Mirrors the lead-magnet pattern used by cover_letter_public and
interview_prep_public: pasted job-posting URL -> Firecrawl extraction ->
PDL hiring-manager discovery (reusing recruiter_finder.find_hiring_manager).

The authenticated paid flow in routes/job_board.py and the
recruiter_finder service are completely untouched.
"""

from .finder import find_hiring_managers_from_url

__all__ = ["find_hiring_managers_from_url"]
