"""Pydantic data contract for the canonical resume renderer."""
from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field


class ContactInfo(BaseModel):
    name: str
    email: str
    phone: Optional[str] = None
    location: Optional[str] = None
    linkedin: Optional[str] = None
    github: Optional[str] = None
    website: Optional[str] = None


class EducationEntry(BaseModel):
    school: str
    degree: str
    location: Optional[str] = None
    graduation: str
    gpa: Optional[str] = None
    honors: list[str] = Field(default_factory=list)
    coursework: list[str] = Field(default_factory=list)


class ExperienceEntry(BaseModel):
    company: str
    role: str
    location: Optional[str] = None
    start: str
    end: str
    bullets: list[str] = Field(default_factory=list)


class ProjectEntry(BaseModel):
    name: str
    tech: list[str] = Field(default_factory=list)
    date: Optional[str] = None
    link: Optional[str] = None
    bullets: list[str] = Field(default_factory=list)


class LeadershipEntry(BaseModel):
    organization: str
    role: str
    location: Optional[str] = None
    start: Optional[str] = None
    end: Optional[str] = None
    bullets: list[str] = Field(default_factory=list)


class SkillsGroup(BaseModel):
    category: str
    items: list[str] = Field(default_factory=list)


class CanonicalResume(BaseModel):
    contact: ContactInfo
    education: list[EducationEntry] = Field(default_factory=list)
    experience: list[ExperienceEntry] = Field(default_factory=list)
    projects: list[ProjectEntry] = Field(default_factory=list)
    leadership: list[LeadershipEntry] = Field(default_factory=list)
    skills: list[SkillsGroup] = Field(default_factory=list)
    interests: Optional[str] = None
