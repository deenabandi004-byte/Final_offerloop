"""Public, anonymous people-search (lead magnet).

No auth, no credits, no Firestore user lookup. Given a company name and
a role, returns up to 5 PDL contacts with name / title / company /
school / LinkedIn. Built deliberately as a slim, isolated path that
does NOT call the heavy paid recruiter_finder pipeline (no Hunter
verification, no metro/locality strategy, no decision-maker scoring).

Modules:
    finder   the orchestrator (PDL /person/search + slim extractor)
"""
