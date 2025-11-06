"""
Directory search service - wrapper around PDL search
"""
from app.services.pdl_client import search_contacts_with_pdl_optimized


def search_contacts_with_pdl(job_title, company, location, max_contacts=8):
    """Wrapper function - redirect to optimized version for backward compatibility"""
    return search_contacts_with_pdl_optimized(job_title, company, location, max_contacts)

