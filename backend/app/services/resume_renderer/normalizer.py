"""Normalize `users/{uid}.resumeParsed` into `CanonicalResume`."""
from __future__ import annotations

import re
from typing import Any, Optional

from .contract import (
    CanonicalResume,
    ContactInfo,
    EducationEntry,
    ExperienceEntry,
    LeadershipEntry,
    ProjectEntry,
    SkillsGroup,
)


DATE_SPLITTERS = [" – ", " — ", " to ", " - ", "–", "—"]


def _split_dates(dates: str) -> tuple[str, str]:
    if not dates:
        return "", ""
    s = str(dates).strip()
    for delim in DATE_SPLITTERS:
        if delim in s:
            parts = s.split(delim, 1)
            return parts[0].strip(), parts[1].strip()
    return s, ""


def _combine_degree(degree: Optional[str], major: Optional[str], minor: Optional[str]) -> str:
    parts = []
    d = (degree or "").strip()
    m = (major or "").strip()
    mi = (minor or "").strip()

    if d and m:
        parts.append(f"{d} in {m}")
    elif d:
        parts.append(d)
    elif m:
        parts.append(m)

    if mi:
        parts.append(f"Minor in {mi}")

    return ", ".join(parts) if parts else ""


def _clean(v: Any) -> Optional[str]:
    if v is None:
        return None
    s = str(v).strip()
    if not s or s.lower() in {"null", "none", "n/a"}:
        return None
    return s


def _list_of_strings(v: Any) -> list[str]:
    if not v:
        return []
    if isinstance(v, list):
        return [str(x).strip() for x in v if x and str(x).strip()]
    if isinstance(v, str):
        cleaned = v.strip()
        return [cleaned] if cleaned else []
    return []


def _normalize_contact(parsed: dict) -> ContactInfo:
    name = _clean(parsed.get("name")) or ""
    raw_contact = parsed.get("contact") or {}
    return ContactInfo(
        name=name,
        email=_clean(raw_contact.get("email")) or "",
        phone=_clean(raw_contact.get("phone")),
        location=_clean(raw_contact.get("location")),
        linkedin=_clean(raw_contact.get("linkedin")),
        github=_clean(raw_contact.get("github")),
        website=_clean(raw_contact.get("website")),
    )


def _normalize_education(parsed: dict) -> list[EducationEntry]:
    raw = parsed.get("education")
    if not raw:
        return []

    raw_list = raw if isinstance(raw, list) else [raw]

    entries: list[EducationEntry] = []
    for item in raw_list:
        if not isinstance(item, dict):
            continue
        school = _clean(item.get("university") or item.get("school"))
        if not school:
            continue
        degree = _combine_degree(
            _clean(item.get("degree")),
            _clean(item.get("major")),
            _clean(item.get("minor")),
        )
        graduation = _clean(item.get("graduation") or item.get("graduationDate")) or ""
        entries.append(
            EducationEntry(
                school=school,
                degree=degree,
                location=_clean(item.get("location")),
                graduation=graduation,
                gpa=_clean(item.get("gpa")),
                honors=_list_of_strings(item.get("honors")),
                coursework=_list_of_strings(item.get("coursework")),
            )
        )
    return entries


def _normalize_experience(parsed: dict) -> list[ExperienceEntry]:
    entries: list[ExperienceEntry] = []
    for item in parsed.get("experience") or []:
        if not isinstance(item, dict):
            continue
        company = _clean(item.get("company"))
        role = _clean(item.get("title") or item.get("role"))
        if not company or not role:
            continue
        start, end = _split_dates(item.get("dates") or item.get("date") or "")
        if _clean(item.get("start")):
            start = _clean(item.get("start")) or start
        if _clean(item.get("end")):
            end = _clean(item.get("end")) or end
        entries.append(
            ExperienceEntry(
                company=company,
                role=role,
                location=_clean(item.get("location")),
                start=start,
                end=end,
                bullets=_list_of_strings(item.get("bullets")),
            )
        )
    return entries


def _normalize_projects(parsed: dict) -> list[ProjectEntry]:
    entries: list[ProjectEntry] = []
    for item in parsed.get("projects") or []:
        if not isinstance(item, dict):
            continue
        name = _clean(item.get("name"))
        if not name:
            continue
        bullets = _list_of_strings(item.get("bullets"))
        if not bullets:
            desc = _clean(item.get("description"))
            if desc:
                bullets = [desc]
        entries.append(
            ProjectEntry(
                name=name,
                tech=_list_of_strings(item.get("technologies") or item.get("tech")),
                date=_clean(item.get("date")),
                link=_clean(item.get("link")),
                bullets=bullets,
            )
        )
    return entries


def _normalize_leadership(parsed: dict) -> list[LeadershipEntry]:
    entries: list[LeadershipEntry] = []
    for item in parsed.get("extracurriculars") or parsed.get("leadership") or []:
        if not isinstance(item, dict):
            continue
        organization = _clean(item.get("organization") or item.get("activity"))
        role = _clean(item.get("role")) or _clean(item.get("title")) or ""
        if not organization:
            continue
        start, end = _split_dates(item.get("dates") or item.get("date") or "")
        bullets = _list_of_strings(item.get("bullets"))
        if not bullets:
            desc = _clean(item.get("description"))
            if desc:
                bullets = [desc]
        entries.append(
            LeadershipEntry(
                organization=organization,
                role=role,
                location=_clean(item.get("location")),
                start=start or None,
                end=end or None,
                bullets=bullets,
            )
        )
    return entries


_SKILLS_CATEGORY_ORDER = [
    ("programming_languages", "Languages"),
    ("tools_frameworks", "Frameworks & Tools"),
    ("databases", "Databases"),
    ("cloud_devops", "Cloud & DevOps"),
    ("core_skills", "Skills"),
    ("languages", "Languages (spoken)"),
]


def _normalize_skills(parsed: dict) -> list[SkillsGroup]:
    raw = parsed.get("skills")
    groups: list[SkillsGroup] = []

    if isinstance(raw, dict):
        for key, label in _SKILLS_CATEGORY_ORDER:
            items = _list_of_strings(raw.get(key))
            if items:
                groups.append(SkillsGroup(category=label, items=items))
    elif isinstance(raw, list):
        for item in raw:
            if isinstance(item, dict) and item.get("category") and item.get("items"):
                groups.append(
                    SkillsGroup(
                        category=str(item["category"]).strip(),
                        items=_list_of_strings(item["items"]),
                    )
                )
        if not groups:
            flat = _list_of_strings(raw)
            if flat:
                groups.append(SkillsGroup(category="Skills", items=flat))

    certs = []
    for cert in parsed.get("certifications") or []:
        if not isinstance(cert, dict):
            continue
        name = _clean(cert.get("name"))
        if not name:
            continue
        issuer = _clean(cert.get("issuer"))
        certs.append(f"{name} ({issuer})" if issuer else name)
    if certs:
        groups.append(SkillsGroup(category="Certifications", items=certs))

    return groups


def from_resume_parsed(parsed: dict) -> CanonicalResume:
    if not isinstance(parsed, dict):
        parsed = {}

    return CanonicalResume(
        contact=_normalize_contact(parsed),
        education=_normalize_education(parsed),
        experience=_normalize_experience(parsed),
        projects=_normalize_projects(parsed),
        leadership=_normalize_leadership(parsed),
        skills=_normalize_skills(parsed),
        interests=None,
    )
