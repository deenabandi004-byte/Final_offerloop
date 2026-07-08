"""Public, anonymous "Find Companies" recommender (lead magnet).

No auth, no credits, no Firestore user lookup. Resume is uploaded each
time, parsed to a structured profile, and fed to GPT-4o-mini which
returns 5 company recommendations matched to the user's
interests/background. No PDL contact lookup, no SERP fallback path,
no paid firm-search service touched.

Modules:
    resume_parser   PDF upload to plain text + GPT-extracted profile
    finder          Orchestrator: profile -> 5 company recommendations
"""
