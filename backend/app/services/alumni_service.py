"""
Alumni service — Phase 1 read-cache only.

Phase 1 ships ONLY the read path against the `alumniCounts` cache. Full
sourcing (PDL → SerpAPI → Bright Data fallback chain) and the
`alumniByUser` graph land in Phase 6. This file is the seam — Phase 6
extends it; Phase 1 just adds the cache lookup.

Top-level collection layout (per §2.2):
    alumniCounts/{schoolId}__{companyId}__{office?}
        - count: number
        - lastFetched: timestamp
        - source: 'pdl' | 'serpapi' | 'brightdata'
        - schoolId, companyId, office (denormalized for queries)

The cache key uses double-underscore separators so we can split safely
even when school/company slugs themselves contain hyphens.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Literal, Optional

from app.extensions import get_db
from app.models.users import normalize_company, normalize_school

CACHE_TTL = timedelta(days=7)
KEY_SEPARATOR = '__'
AlumniSource = Literal['pdl', 'serpapi', 'brightdata']


@dataclass(frozen=True)
class AlumniCountData:
    """Read-side projection of an alumniCounts/* document."""
    count: int
    school_id: str
    company_id: str
    office: Optional[str]
    source: AlumniSource
    last_fetched: Optional[str]
    is_stale: bool

    def to_dict(self) -> Dict[str, Any]:
        return {
            'count': self.count,
            'schoolId': self.school_id,
            'companyId': self.company_id,
            'office': self.office,
            'source': self.source,
            'lastFetched': self.last_fetched,
            'isStale': self.is_stale,
        }


def make_cache_key(school_id: str, company_id: str, office: Optional[str] = None) -> str:
    """Build the canonical cache key. Office is optional but always reserved."""
    if not school_id or not company_id:
        raise ValueError('school_id and company_id are required')
    if office:
        return f'{school_id}{KEY_SEPARATOR}{company_id}{KEY_SEPARATOR}{office}'
    return f'{school_id}{KEY_SEPARATOR}{company_id}'


def _is_stale(last_fetched: Optional[str]) -> bool:
    if not last_fetched:
        return True
    try:
        # Firestore returns either a string or a datetime depending on driver
        if isinstance(last_fetched, datetime):
            ts = last_fetched
        else:
            ts = datetime.fromisoformat(str(last_fetched).replace('Z', '+00:00'))
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        return datetime.now(timezone.utc) - ts > CACHE_TTL
    except Exception:
        return True


def get_alumni_count(
    school: str,
    company: str,
    office: Optional[str] = None,
) -> Optional[AlumniCountData]:
    """Read the cached alumni count for (school, company[, office]).

    Phase 1 callers (e.g. ContactCard via `/api/alumni/count`) hit this.
    A miss returns None; in Phase 1 we DO NOT trigger PDL — that's Phase 6.
    Surfacing happens at the caller: contact card shows nothing on miss.

    Args:
        school: Display name or slug (normalized internally).
        company: Display name or slug (normalized internally).
        office: Optional office filter ("nyc", "sf", etc.).

    Returns:
        AlumniCountData on cache hit (even if stale; caller can ignore stale
        counts but Phase 1 just shows the cached number with `is_stale=True`),
        or None if no cache entry exists.
    """
    school_id = normalize_school(school)
    company_id = normalize_company(company)
    if not school_id or not company_id:
        return None

    cache_key = make_cache_key(school_id, company_id, office)
    db = get_db()
    doc = db.collection('alumniCounts').document(cache_key).get()
    if not doc.exists:
        return None

    data = doc.to_dict() or {}
    count = data.get('count')
    if count is None:
        return None

    return AlumniCountData(
        count=int(count),
        school_id=school_id,
        company_id=company_id,
        office=office,
        source=data.get('source', 'pdl'),
        last_fetched=str(data.get('lastFetched')) if data.get('lastFetched') else None,
        is_stale=_is_stale(data.get('lastFetched')),
    )


def write_alumni_count(
    school: str,
    company: str,
    count: int,
    office: Optional[str] = None,
    source: AlumniSource = 'pdl',
) -> AlumniCountData:
    """Cache writer. Phase 6 sourcing pipeline calls this; Phase 1 backfill
    can also pre-warm if a previous integration already has counts."""
    school_id = normalize_school(school)
    company_id = normalize_company(company)
    if not school_id or not company_id:
        raise ValueError(f'cannot normalize school={school!r} company={company!r}')

    cache_key = make_cache_key(school_id, company_id, office)
    now_iso = datetime.now(timezone.utc).isoformat()
    payload = {
        'count': int(count),
        'schoolId': school_id,
        'companyId': company_id,
        'office': office,
        'source': source,
        'lastFetched': now_iso,
    }
    db = get_db()
    db.collection('alumniCounts').document(cache_key).set(payload, merge=True)
    return AlumniCountData(
        count=int(count),
        school_id=school_id,
        company_id=company_id,
        office=office,
        source=source,
        last_fetched=now_iso,
        is_stale=False,
    )
