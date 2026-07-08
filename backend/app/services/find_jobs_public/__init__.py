"""Public, anonymous job-recommendation (lead magnet).

No auth, no credits, no Firestore user-doc lookup. The resume is uploaded
each request, parsed to a structured profile, used to build Perplexity
job-search queries, and scored against the resume text.

Modules:
    matcher    Orchestrator: PDF bytes -> top recommended jobs
"""
from .matcher import find_matching_jobs

__all__ = ["find_matching_jobs"]
