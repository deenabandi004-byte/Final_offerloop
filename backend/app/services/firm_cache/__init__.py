"""firm_cache — person-level cache of PDL search results.

The cache complements pdl_search_cache (query-level) at the person level:
one Firestore doc per LinkedIn profile, upserted from PDL responses as a
side effect ("just-in-time" writes). Read path (reader.py, Phase 3) queries
by indexed fields — company / schools[] / title_level / office_location —
so different queries that share people can hit the cache without PDL.

Read order in runs.py becomes:
    pdl_search_cache (query hash hit) -> firm_employees (person hit) -> PDL

Package layout:
    schema.py  — Firestore doc shape + normalizers from raw PDL person dict
    writer.py  — batch upsert into firm_employees/{linkedin_id} (Phase 2)
    reader.py  — search_firm_cache(parsed, max_contacts, exclude_keys) (Phase 3)
"""
from app.services.firm_cache.schema import (
    firm_employee_doc_from_pdl_person,
    firm_employee_doc_from_app_contact,
    canonicalize_linkedin_url,
    slugify_company,
    slugify_school,
    derive_title_level,
    FIRM_EMPLOYEES_COLLECTION,
    TITLE_LEVELS,
)
from app.services.firm_cache.writer import cache_pdl_contacts
from app.services.firm_cache.reader import search_firm_cache, firm_employee_doc_to_app_contact

__all__ = [
    "cache_pdl_contacts",
    "search_firm_cache",
    "firm_employee_doc_to_app_contact",
    "firm_employee_doc_from_pdl_person",
    "firm_employee_doc_from_app_contact",
    "canonicalize_linkedin_url",
    "slugify_company",
    "slugify_school",
    "derive_title_level",
    "FIRM_EMPLOYEES_COLLECTION",
    "TITLE_LEVELS",
]
