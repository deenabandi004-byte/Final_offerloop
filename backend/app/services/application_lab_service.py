"""
Application Lab Service - Dedicated service for application analysis.
Handles job fit analysis, requirement mapping, resume edits, and cover letters.
"""
from __future__ import annotations

import ast
import asyncio
import hashlib
import logging
import os
import re
import tempfile
import uuid
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Callable, Tuple
from io import BytesIO

import httpx
import PyPDF2

from app.services.scout_service import (
    scout_service,
    EnhancedFitAnalysis,
    RequirementMatch,
    ResumeEdit,
    CoverLetter,
    ResumeMatch,
)
from app.services.openai_client import get_async_openai_client

logger = logging.getLogger('application_lab')


def make_resume_trace(
    uid: Optional[str],
    request_id: str,
    phase: str,
    resume_text: Optional[str] = None,
    parsed_resume: Optional[Dict[str, Any]] = None,
    resume_file_name: Optional[str] = None,
    resume_url: Optional[str] = None,
    resume_backfilled_at: Optional[Any] = None,
    source: Optional[str] = None,
    raw_text: Optional[str] = None
) -> Dict[str, Any]:
    """
    Create structured resume trace dict for logging.
    
    Args:
        uid: User ID
        request_id: Request ID for tracing
        phase: Phase name (e.g., 'fetch_resume', 'after_parsing', 'after_normalization')
        resume_text: Resume text string
        parsed_resume: Parsed resume dict
        resume_file_name: Resume filename
        resume_url: Resume URL
        resume_backfilled_at: When resume was backfilled
        source: Resume source (payload, firestore_resumeText, etc.)
        raw_text: Raw text if different from resume_text
        
    Returns:
        Dict with trace information
    """
    trace = {
        'uid_prefix': uid[:8] if uid else 'unknown',
        'request_id': request_id,
        'phase': phase,
        'resume_text_source': source or 'UNKNOWN',
        'resume_text_len': len(resume_text) if resume_text else 0,
        'resume_file_name': resume_file_name or 'unknown',
        'resume_url_present': bool(resume_url),
        'resume_backfilled_at': str(resume_backfilled_at) if resume_backfilled_at else None,
    }
    
    # Add parsed resume keys and counts
    if parsed_resume:
        parsed_keys = list(parsed_resume.keys())
        # Filter out metadata keys
        parsed_keys = [k for k in parsed_keys if not k.startswith('_')]
        trace['parsed_resume_keys'] = parsed_keys
        
        # Count items per section
        section_counts = {}
        for key in ['experience', 'education', 'projects', 'skills', 'achievements', 'summary']:
            if key in parsed_resume:
                value = parsed_resume[key]
                if isinstance(value, list):
                    section_counts[key] = len(value)
                elif isinstance(value, dict):
                    section_counts[key] = len(value)
                elif isinstance(value, str):
                    section_counts[key] = 1
                else:
                    section_counts[key] = 0
        trace['section_counts'] = section_counts
    
    # Add raw text length if available
    if raw_text:
        trace['raw_text_len'] = len(raw_text)
    
    # Add hash fingerprints (first 30 chars of SHA256)
    if resume_text:
        trace['resume_text_hash'] = hashlib.sha256(resume_text.encode()).hexdigest()[:30]
    if raw_text and raw_text != resume_text:
        trace['raw_text_hash'] = hashlib.sha256(raw_text.encode()).hexdigest()[:30]
    
    return trace


def calculate_normalization_confidence(
    parsed_resume: Dict[str, Any],
    raw_text: Optional[str],
    formatted_output: Optional[str],
    input_length: Optional[int] = None,
    edits_applied: bool = False
) -> Dict[str, Any]:
    """
    Calculate normalization confidence score (0-100) based on section presence,
    lengths, and output/input ratio.
    
    Args:
        parsed_resume: Parsed resume dict
        raw_text: Raw resume text
        formatted_output: Formatted output text
        input_length: Input length (if different from raw_text length)
        edits_applied: Whether edits were applied
        
    Returns:
        Dict with score, breakdown, and warnings
    """
    score = 100
    breakdown = {}
    warnings = []
    
    # Section presence check (weighted)
    sections_present = {
        'summary': bool(parsed_resume.get('summary')),
        'education': bool(parsed_resume.get('education')),
        'experience': bool(parsed_resume.get('experience')),
        'projects': bool(parsed_resume.get('projects')),
        'skills': bool(parsed_resume.get('skills')),
    }
    
    # Weight experience and education more heavily
    if not sections_present['experience']:
        score -= 25
        warnings.append("missing_experience_section")
    if not sections_present['education']:
        score -= 15
        warnings.append("missing_education_section")
    if not sections_present['summary']:
        score -= 5
    if not sections_present['projects']:
        score -= 5
    if not sections_present['skills']:
        score -= 5
    
    breakdown['sections_present'] = sections_present
    
    # Section length checks
    if sections_present['experience']:
        exp_data = parsed_resume.get('experience', [])
        if isinstance(exp_data, list):
            exp_text_len = sum(
                len(str(item.get('bullets', []))) if isinstance(item, dict) else len(str(item))
                for item in exp_data
            )
            if exp_text_len < 300:
                score -= 10
                warnings.append(f"experience_too_short ({exp_text_len} chars)")
            breakdown['experience_length'] = exp_text_len
    else:
        breakdown['experience_length'] = 0
    
    if sections_present['education']:
        edu_data = parsed_resume.get('education', [])
        if isinstance(edu_data, list):
            edu_text_len = sum(
                len(str(item.get('details', []))) if isinstance(item, dict) else len(str(item))
                for item in edu_data
            )
            if edu_text_len < 150:
                score -= 5
                warnings.append(f"education_too_short ({edu_text_len} chars)")
            breakdown['education_length'] = edu_text_len
    else:
        breakdown['education_length'] = 0
    
    # Output/input ratio check (only if edits applied)
    if edits_applied and formatted_output and input_length:
        output_len = len(formatted_output)
        ratio = output_len / input_length if input_length > 0 else 0
        breakdown['output_input_ratio'] = round(ratio, 2)
        
        if ratio < 0.6:
            score -= 15
            warnings.append(f"output_too_short (ratio={ratio:.2f})")
    
    # Floor and ceiling
    score = max(0, min(100, score))
    
    return {
        'normalization_score': score,
        'score_breakdown': breakdown,
        'warnings': warnings
    }


class ApplicationLabService:
    """Service for Application Lab - job fit analysis and application strengthening."""
    
    def __init__(self):
        self._openai = None
        self._scout = scout_service
    
    def _ensure_openai(self):
        """Lazy-load OpenAI client."""
        if not self._openai:
            self._openai = get_async_openai_client()
    
    def _is_derived_resume_filename(self, filename: Optional[str]) -> bool:
        """
        Detect if a resume filename indicates a derived/generated resume.
        
        Derived resume patterns:
        - resume-company-position.pdf
        - resume-{company}.pdf
        - {anything}-{company}-{position}.pdf
        - Generated or edited resumes
        
        Args:
            filename: Resume filename to check
            
        Returns:
            True if filename suggests a derived resume, False otherwise
        """
        if not filename:
            return False
        
        filename_lower = filename.lower()
        
        # Patterns that indicate derived resumes
        derived_patterns = [
            r'resume-.*-.*\.pdf',  # resume-company-position.pdf
            r'.*-resume-.*\.pdf',  # anything-resume-company.pdf
            r'resume.*generated.*\.pdf',
            r'resume.*edited.*\.pdf',
            r'resume.*custom.*\.pdf',
        ]
        
        for pattern in derived_patterns:
            if re.search(pattern, filename_lower):
                return True
        
        return False
    
    def _is_derived_resume_url(self, url: Optional[str]) -> bool:
        """
        Detect if a resume URL indicates a derived/generated resume.
        
        Args:
            url: Resume URL to check
            
        Returns:
            True if URL suggests a derived resume, False otherwise
        """
        if not url:
            return False
        
        # Extract filename from URL if possible
        url_lower = url.lower()
        # Check for derived patterns in URL path
        if 'resume-' in url_lower and ('company' in url_lower or 'position' in url_lower):
            return True
        
        return False
    
    def _fetch_canonical_resume_data(self, user_id: str) -> Dict[str, Any]:
        """
        Fetch canonical (original) resume data from Firestore with strict precedence.
        
        Precedence order:
        1. users/{uid}.originalResumeParsed
        2. users/{uid}.resumeParsed (ONLY if marked as original or not derived)
        3. users/{uid}.originalResumeText
        4. users/{uid}.resumeText (ONLY if original)
        5. users/{uid}.originalResumeUrl (for backfilling)
        6. users/{uid}.resumeUrl (ONLY if original)
        
        Args:
            user_id: User ID
            
        Returns:
            Dict with canonical resume data:
            {
                'resumeText': str | None,
                'resumeParsed': dict | None,
                'resumeUrl': str | None,
                'resumeFileName': str | None,
                'source': str  # 'originalResumeParsed', 'originalResumeText', etc.
            }
        """
        try:
            from app.extensions import get_db
            db = get_db()
            if not db:
                logger.warning(f"[ApplicationLab] Database not available for user {user_id[:8]}...")
                return {'source': 'none'}
            
            user_doc = db.collection('users').document(user_id).get()
            if not user_doc.exists:
                logger.warning(f"[ApplicationLab] User document {user_id[:8]}... does not exist")
                return {'source': 'none'}
            
            user_data = user_doc.to_dict()
            result = {
                'resumeText': None,
                'resumeParsed': None,
                'resumeUrl': None,
                'resumeFileName': None,
                'source': 'none'
            }
            
            # Priority 1: originalResumeParsed
            if 'originalResumeParsed' in user_data and user_data['originalResumeParsed']:
                result['resumeParsed'] = user_data['originalResumeParsed']
                result['source'] = 'originalResumeParsed'
                logger.info(f"[ApplicationLab] Using canonical resume source: originalResumeParsed (user_id={user_id[:8]}...)")
                # Also get text if available
                if 'originalResumeText' in user_data:
                    result['resumeText'] = user_data['originalResumeText']
                elif 'resumeText' in user_data:
                    # Check if resumeText is original (not derived)
                    filename = user_data.get('resumeFileName', '')
                    if not self._is_derived_resume_filename(filename):
                        result['resumeText'] = user_data['resumeText']
                return result
            
            # Priority 2: resumeParsed (ONLY if not derived)
            if 'resumeParsed' in user_data and user_data['resumeParsed']:
                filename = user_data.get('resumeFileName', '')
                resume_url = user_data.get('resumeUrl', '')
                # Check if this is a derived resume
                is_derived = (
                    self._is_derived_resume_filename(filename) or
                    self._is_derived_resume_url(resume_url) or
                    user_data.get('resumeSource') == 'derived'
                )
                
                if not is_derived:
                    result['resumeParsed'] = user_data['resumeParsed']
                    result['source'] = 'resumeParsed'
                    logger.info(f"[ApplicationLab] Using canonical resume source: resumeParsed (user_id={user_id[:8]}..., file={filename})")
                    if 'resumeText' in user_data:
                        result['resumeText'] = user_data['resumeText']
                    if 'resumeUrl' in user_data:
                        result['resumeUrl'] = user_data['resumeUrl']
                    if 'resumeFileName' in user_data:
                        result['resumeFileName'] = user_data['resumeFileName']
                    return result
                else:
                    logger.warning(f"[ApplicationLab] Ignoring derived resume for parsing: {filename} (user_id={user_id[:8]}...)")
            
            # Priority 3: originalResumeText
            if 'originalResumeText' in user_data and user_data['originalResumeText']:
                result['resumeText'] = user_data['originalResumeText']
                result['source'] = 'originalResumeText'
                logger.info(f"[ApplicationLab] Using canonical resume source: originalResumeText (user_id={user_id[:8]}...)")
                # Also get URL if available
                if 'originalResumeUrl' in user_data:
                    result['resumeUrl'] = user_data['originalResumeUrl']
                elif 'resumeUrl' in user_data:
                    filename = user_data.get('resumeFileName', '')
                    if not self._is_derived_resume_filename(filename):
                        result['resumeUrl'] = user_data['resumeUrl']
                return result
            
            # Priority 4: resumeText (ONLY if original)
            if 'resumeText' in user_data and user_data['resumeText']:
                filename = user_data.get('resumeFileName', '')
                resume_url = user_data.get('resumeUrl', '')
                is_derived = (
                    self._is_derived_resume_filename(filename) or
                    self._is_derived_resume_url(resume_url) or
                    user_data.get('resumeSource') == 'derived'
                )
                
                if not is_derived:
                    result['resumeText'] = user_data['resumeText']
                    result['source'] = 'resumeText'
                    logger.info(f"[ApplicationLab] Using canonical resume source: resumeText (user_id={user_id[:8]}..., file={filename})")
                    if 'resumeUrl' in user_data:
                        result['resumeUrl'] = user_data['resumeUrl']
                    if 'resumeFileName' in user_data:
                        result['resumeFileName'] = user_data['resumeFileName']
                    return result
                else:
                    logger.warning(f"[ApplicationLab] Ignoring derived resume for parsing: {filename} (user_id={user_id[:8]}...)")
            
            # Priority 5: originalResumeUrl (for backfilling)
            if 'originalResumeUrl' in user_data and user_data['originalResumeUrl']:
                result['resumeUrl'] = user_data['originalResumeUrl']
                result['source'] = 'originalResumeUrl'
                logger.info(f"[ApplicationLab] Using canonical resume source: originalResumeUrl (user_id={user_id[:8]}...)")
                return result
            
            # Priority 6: resumeUrl (ONLY if original)
            if 'resumeUrl' in user_data and user_data['resumeUrl']:
                filename = user_data.get('resumeFileName', '')
                is_derived = (
                    self._is_derived_resume_filename(filename) or
                    self._is_derived_resume_url(user_data['resumeUrl']) or
                    user_data.get('resumeSource') == 'derived'
                )
                
                if not is_derived:
                    result['resumeUrl'] = user_data['resumeUrl']
                    result['source'] = 'resumeUrl'
                    logger.info(f"[ApplicationLab] Using canonical resume source: resumeUrl (user_id={user_id[:8]}..., file={filename})")
                    if 'resumeFileName' in user_data:
                        result['resumeFileName'] = user_data['resumeFileName']
                    return result
                else:
                    logger.warning(f"[ApplicationLab] Ignoring derived resume URL for parsing: {user_data['resumeUrl'][:50]}... (user_id={user_id[:8]}...)")
            
            # No canonical resume found
            logger.warning(f"[ApplicationLab] No canonical resume found for user {user_id[:8]}...")
            return result
            
        except Exception as e:
            logger.error(f"[ApplicationLab] Error fetching canonical resume for {user_id[:8]}...: {e}")
            return {'source': 'error'}
    
    def _fetch_user_doc(self, user_id: str) -> Optional[Dict[str, Any]]:
        """
        Fetch user document from Firestore.
        
        Returns:
            User document data as dict, or None if not found/error
        """
        try:
            from app.extensions import get_db
            db = get_db()
            if not db:
                logger.warning(f"[ApplicationLab] Database not available for user {user_id[:8]}...")
                return None
            
            user_doc = db.collection('users').document(user_id).get()
            if user_doc.exists:
                return user_doc.to_dict()
            else:
                logger.warning(f"[ApplicationLab] User document {user_id[:8]}... does not exist")
                return None
        except Exception as e:
            logger.error(f"[ApplicationLab] Error fetching user doc for {user_id[:8]}...: {e}")
            return None
    
    async def _backfill_resume_text_from_resume_url(
        self,
        user_id: str,
        resume_url: str
    ) -> Tuple[Optional[str], bool]:
        """
        Download PDF from resumeUrl, extract text, and persist to Firestore.
        
        Args:
            user_id: User ID
            resume_url: URL to resume PDF
            
        Returns:
            (resume_text, needs_ocr) tuple
            - resume_text: Extracted text if successful, None if failed
            - needs_ocr: True if text extraction yielded < 500 chars (scanned PDF)
        """
        try:
            logger.info(f"[ApplicationLab] Backfilling resume text from URL for user {user_id[:8]}...")
            
            # Download PDF with timeout
            async with httpx.AsyncClient(timeout=15.0) as client:
                response = await client.get(resume_url)
                response.raise_for_status()
                pdf_bytes = response.content
            
            # Extract text using PyPDF2 (same as resume_parser)
            with tempfile.NamedTemporaryFile(delete=False, suffix='.pdf') as temp_file:
                temp_file.write(pdf_bytes)
                temp_path = temp_file.name
            
            try:
                with open(temp_path, 'rb') as file:
                    pdf_reader = PyPDF2.PdfReader(file)
                    text = ""
                    
                    for page in pdf_reader.pages:
                        page_text = page.extract_text()
                        if page_text:
                            cleaned_text = ''.join(char for char in page_text if char.isprintable() or char.isspace())
                            cleaned_text = cleaned_text.encode('utf-8', errors='ignore').decode('utf-8')
                            text += cleaned_text + "\n"
                
                # Final cleanup
                text = ' '.join(text.split()).strip()
                
                # Check if text is sufficient
                if not text or len(text) < 500:
                    # Scanned PDF - needs OCR
                    logger.warning(f"[ApplicationLab] Extracted text too short ({len(text)} chars) - needs OCR")
                    
                    # Set flag in Firestore
                    from app.extensions import get_db
                    db = get_db()
                    if db:
                        db.collection('users').document(user_id).update({
                            'resumeNeedsOCR': True,
                            'resumeBackfilledAt': datetime.now()
                        })
                    
                    return None, True
                
                # Text is good - persist to Firestore
                from app.extensions import get_db
                db = get_db()
                if db:
                    db.collection('users').document(user_id).update({
                        'resumeText': text,
                        'resumeBackfilledAt': datetime.now(),
                        'resumeNeedsOCR': False
                    })
                    logger.info(f"[ApplicationLab] Backfilled resume text ({len(text)} chars) for user {user_id[:8]}...")
                
                return text, False
                
            finally:
                # Clean up temp file
                try:
                    os.unlink(temp_path)
                except Exception:
                    pass
                    
        except httpx.TimeoutException:
            logger.error(f"[ApplicationLab] Timeout downloading resume from URL for user {user_id[:8]}...")
            return None, False
        except Exception as e:
            logger.error(f"[ApplicationLab] Error backfilling resume text for user {user_id[:8]}...: {e}")
            return None, False
    
    async def _get_resume_text_from_payload_or_firestore(
        self,
        user_resume: Dict[str, Any],
        user_id: Optional[str],
        request_id: Optional[str] = None,
        allow_payload_resume: bool = False
    ) -> Tuple[Optional[str], str, Dict[str, Any]]:
        """
        Get canonical resume text from multiple sources with strict precedence.
        
        Precedence:
        1. user_resume payload (resumeText/rawText/resume_text) - ONLY if allow_payload_resume=True AND not derived
        2. Firestore canonical resume (originalResumeText, resumeText if original)
        3. If missing AND canonical resumeUrl exists: backfill from PDF
        
        Args:
            user_resume: Resume data from request payload
            user_id: User ID for Firestore lookup
            request_id: Request ID for tracing
            allow_payload_resume: If False, payload resume is ignored (enforce canonical only)
            
        Returns:
            (resume_text, source, trace_info) tuple
            - resume_text: Extracted text or None
            - source: "payload", "canonical_firestore", "canonical_backfill", or "none"
            - trace_info: Dict with trace information
        """
        request_id = request_id or str(uuid.uuid4())[:8]
        
        # Priority 1: Check payload (ONLY if explicitly allowed AND not derived)
        resume_text = (
            user_resume.get('resumeText') or 
            user_resume.get('rawText') or 
            user_resume.get('resume_text') or 
            ''
        )
        
        if resume_text and len(resume_text.strip()) >= 500:
            # Check if payload resume is derived
            filename = user_resume.get('resumeFileName', '')
            resume_url = user_resume.get('resumeUrl', '')
            is_derived = (
                self._is_derived_resume_filename(filename) or
                self._is_derived_resume_url(resume_url) or
                user_resume.get('resumeSource') == 'derived'
            )
            
            if allow_payload_resume and not is_derived:
                trace_info = make_resume_trace(
                    uid=user_id,
                    request_id=request_id,
                    phase='fetch_resume',
                    resume_text=resume_text,
                    resume_file_name=filename,
                    resume_url=resume_url,
                    source='payload'
                )
                logger.info(f"[ApplicationLab] RESUME_TRACE {trace_info}")
                return resume_text.strip(), "payload", trace_info
            elif not allow_payload_resume:
                logger.warning(f"[ApplicationLab] Ignoring payload resume (canonical_only mode): {filename} (user_id={user_id[:8] if user_id else 'unknown'}...)")
            else:
                logger.warning(f"[ApplicationLab] Ignoring derived resume in payload: {filename} (user_id={user_id[:8] if user_id else 'unknown'}...)")
        
        # Priority 2: Check Firestore canonical resume
        if user_id:
            canonical_data = self._fetch_canonical_resume_data(user_id)
            resume_text = canonical_data.get('resumeText')
            filename = canonical_data.get('resumeFileName', 'unknown')
            resume_url = canonical_data.get('resumeUrl')
            resume_backfilled_at = canonical_data.get('resumeBackfilledAt')
            
            if resume_text and len(resume_text.strip()) >= 500:
                source_name = canonical_data.get('source', 'canonical_firestore')
                trace_info = make_resume_trace(
                    uid=user_id,
                    request_id=request_id,
                    phase='fetch_resume',
                    resume_text=resume_text,
                    resume_file_name=filename,
                    resume_url=resume_url,
                    resume_backfilled_at=resume_backfilled_at,
                    source=source_name
                )
                logger.info(f"[ApplicationLab] RESUME_TRACE {trace_info}")
                return resume_text.strip(), source_name, trace_info
            
            # Priority 3: Backfill from canonical resumeUrl if available
            if resume_url:
                logger.info(f"[ApplicationLab] user_id={user_id[:8]}... source=canonical_backfill_attempt resume_url={resume_url[:50]}...")
                backfilled_text, needs_ocr = await self._backfill_resume_text_from_resume_url(user_id, resume_url)
                
                if backfilled_text and len(backfilled_text.strip()) >= 500:
                    trace_info = make_resume_trace(
                        uid=user_id,
                        request_id=request_id,
                        phase='fetch_resume',
                        resume_text=backfilled_text,
                        resume_file_name=filename,
                        resume_url=resume_url,
                        source='canonical_backfill'
                    )
                    logger.info(f"[ApplicationLab] RESUME_TRACE {trace_info}")
                    return backfilled_text.strip(), "canonical_backfill", trace_info
                elif needs_ocr:
                    # Scanned PDF - raise error with clear message
                    raise ValueError(
                        "Resume appears to be a scanned PDF (image-based). "
                        "Please upload a text-based PDF in Account Settings. "
                        "OCR support will be added in a future update."
                    )
        
        # No valid canonical resume text found
        trace_info = make_resume_trace(
            uid=user_id,
            request_id=request_id,
            phase='fetch_resume',
            source='none'
        )
        logger.warning(f"[ApplicationLab] RESUME_TRACE {trace_info} (no canonical resume found)")
        return None, "none", trace_info
    
    def _validate_resume_text(self, resume_text: Optional[str]) -> None:
        """
        Validate resume text meets minimum requirements.
        
        Raises:
            ValueError: If resume text is missing or too short, with clear instructions
        """
        if not resume_text or not resume_text.strip():
            raise ValueError(
                "Resume text is missing. Please re-upload your resume in Account Settings. "
                "If you recently deleted your resume, upload it again."
            )
        
        text_len = len(resume_text.strip())
        if text_len < 500:
            raise ValueError(
                f"Resume text is too short ({text_len} characters, minimum 500 required). "
                "Please upload a complete text-based PDF resume in Account Settings. "
                "Scanned PDFs (image-based) are not currently supported."
            )
    
    def _get_resume_hash(self, user_resume: Dict[str, Any]) -> str:
        """Generate hash for resume to use in cache keys."""
        resume_text = user_resume.get('resumeText') or user_resume.get('rawText') or user_resume.get('resume_text') or ''
        return hashlib.md5(resume_text.encode()).hexdigest()[:16]
    
    def _get_analysis_id(self, job: Dict[str, Any], user_resume: Dict[str, Any]) -> str:
        """Generate unique analysis ID for caching."""
        resume_hash = self._get_resume_hash(user_resume)
        job_id = job.get('url') or (job.get('title', '') + job.get('company', ''))
        job_hash = hashlib.md5(job_id.encode()).hexdigest()[:16]
        return f"{resume_hash}_{job_hash}"
    
    async def _get_cached_analysis(
        self,
        user_id: str,
        analysis_id: str
    ) -> Optional[Dict[str, Any]]:
        """Retrieve cached analysis from Firestore."""
        try:
            from app.extensions import get_db
            
            db = get_db()
            if not db:
                return None
            
            analysis_ref = db.collection('users').document(user_id).collection('applicationLabAnalyses').document(analysis_id)
            analysis_doc = analysis_ref.get()
            
            if analysis_doc.exists:
                analysis_data = analysis_doc.to_dict()
                created_at = analysis_data.get('createdAt')
                
                # Check if analysis is less than 1 hour old
                if created_at:
                    from datetime import timezone
                    
                    try:
                        # Get current time (timezone-aware)
                        now = datetime.now(timezone.utc)
                        
                        # Convert created_at to timezone-aware datetime
                        # Handle different timestamp formats from Firestore
                        if isinstance(created_at, datetime):
                            created_dt = created_at
                        elif hasattr(created_at, 'to_datetime'):
                            # Firestore Timestamp object
                            created_dt = created_at.to_datetime()
                        elif hasattr(created_at, 'timestamp'):
                            # Another timestamp format
                            created_dt = datetime.fromtimestamp(created_at.timestamp(), tz=timezone.utc)
                        else:
                            age = timedelta(0)
                            created_dt = None
                        
                        if created_dt:
                            # Make both timezone-aware for comparison
                            if created_dt.tzinfo is None:
                                # Naive datetime - assume UTC
                                created_dt = created_dt.replace(tzinfo=timezone.utc)
                            elif created_dt.tzinfo != timezone.utc:
                                # Convert to UTC
                                created_dt = created_dt.astimezone(timezone.utc)
                            
                            age = now - created_dt
                        else:
                            age = timedelta(0)
                        
                        if age < timedelta(hours=1):
                            logger.info(f"[ApplicationLab] Using cached analysis (id: {analysis_id[:16]}..., age: {age})")
                            return analysis_data.get('analysis')
                    except Exception as dt_error:
                        logger.warning(f"[ApplicationLab] Error comparing datetimes: {dt_error}, skipping cache")
                        # Continue without using cache
            
            return None
        except Exception as e:
            print(f"[ApplicationLab] Error retrieving cached analysis: {e}")
            return None
    
    def _save_analysis_to_firestore(
        self,
        user_id: str,
        analysis_id: str,
        analysis: Dict[str, Any],
        job: Dict[str, Any],
        resume_hash: str
    ) -> None:
        """Save analysis to Firestore cache."""
        try:
            from app.extensions import get_db
            
            db = get_db()
            if not db:
                return
            
            analysis_ref = db.collection('users').document(user_id).collection('applicationLabAnalyses').document(analysis_id)
            analysis_ref.set({
                'analysisId': analysis_id,
                'jobSnapshot': {
                    'title': job.get('title', ''),
                    'company': job.get('company', ''),
                    'location': job.get('location', ''),
                    'url': job.get('url', ''),
                },
                'resumeHash': resume_hash,
                'analysis': analysis,
                'status': 'completed',
                'createdAt': datetime.now(),
            }, merge=True)
            
            print(f"[ApplicationLab] Saved analysis to Firestore (id: {analysis_id[:16]}...)")
        except Exception as e:
            print(f"[ApplicationLab] Error saving analysis to Firestore: {e}")
            # Don't raise - persistence failure shouldn't break the request
    
    async def analyze_job_fit(
        self,
        job: Dict[str, Any],
        user_resume: Dict[str, Any],
        user_id: str,
        progress_callback: Optional[Callable[[int, str], None]] = None
    ) -> Dict[str, Any]:
        """
        Perform comprehensive job fit analysis with requirement mapping and resume suggestions.
        This is the main analysis method - delegates to scout_service for helper methods.
        """
        # MIN_LEN constant
        MIN_LEN = 500
        
        # INVARIANT: If resumeText exists and length >= MIN_LEN, it is the ONLY source of truth
        # FAIL-FAST: Validate and load resume text before any expensive operations
        resume_text, source, _ = await self._get_resume_text_from_payload_or_firestore(user_resume, user_id)
        self._validate_resume_text(resume_text)
        
        resume_text_len = len(resume_text.strip()) if resume_text else 0
        has_valid_resume_text = resume_text and resume_text_len >= MIN_LEN
        
        # HARD GUARD: If resumeText exists and valid, forbid reconstruction path entirely
        if has_valid_resume_text:
            # Ensure resume_text is in user_resume for downstream processing
            if 'resumeText' not in user_resume:
                user_resume['resumeText'] = resume_text
            # DO NOT re-fetch from Firestore - we already have it
        else:
            logger.error("[AppLab] Invalid resume text in analyze_job_fit - resume_len=%d (minimum %d required)", 
                        resume_text_len, MIN_LEN)
            return {"status": "error", "message": f"Resume text is missing or too short ({resume_text_len} chars, minimum {MIN_LEN} required). Please re-upload your resume in Account Settings."}
        
        # Log request entry
        logger.info("application_lab.analyze.request", extra={
            "user_id": user_id[:8] if user_id else None,
            "resume_text_len": resume_text_len,
            "resume_source": source,
            "job_title": job.get('title', '')[:50] if job else None,
            "job_company": job.get('company', '')[:50] if job else None,
        })
        
        self._ensure_openai()
        if not self._openai:
            return {"status": "error", "message": "Analysis unavailable"}
        
        try:
            analysis_id = self._get_analysis_id(job, user_resume)
            resume_hash = self._get_resume_hash(user_resume)
            
            # Check cache first
            cached_analysis = await self._get_cached_analysis(user_id, analysis_id)
            if cached_analysis:
                return {
                    "status": "ok",
                    "analysis": cached_analysis,
                    "analysis_id": analysis_id,
                    "_from_cache": True
                }
            
            # Progress: Start
            if progress_callback:
                progress_callback(5, "Starting analysis...")
            
            # Step 1: Fetch job description and parse resume in parallel
            if progress_callback:
                progress_callback(10, "Fetching job description and parsing resume...")
            
            job_desc_task = asyncio.create_task(
                asyncio.wait_for(
                    self._scout._get_full_job_description(job),
                    timeout=5.0
                )
            )
            resume_parse_task = asyncio.create_task(
                asyncio.wait_for(
                    self._scout._parse_resume_structured_cached(user_resume),
                    timeout=15.0
                )
            )
            
            try:
                job_description, parsed_resume = await asyncio.gather(
                    job_desc_task, resume_parse_task, return_exceptions=True
                )
                
                if isinstance(job_description, Exception):
                    if isinstance(job_description, (asyncio.TimeoutError, asyncio.CancelledError)):
                        job_description = job.get("snippet", "") or ""
                    else:
                        print(f"[ApplicationLab] Job description fetch error: {job_description}")
                        job_description = job.get("snippet", "") or ""
                
                # ISSUE 2 FIX: Enforce minimum job description length (300 chars)
                # Validate immediately after fetching job description
                job_description = job_description or ""
                job_description_stripped = job_description.strip()
                if len(job_description_stripped) < 300:
                    error_msg = "Unable to extract sufficient job description. Please paste the job description manually."
                    print(f"[ApplicationLab] ERROR: Job description too short ({len(job_description_stripped)} chars, minimum 300 required)")
                    print(f"[ApplicationLab] Job description preview: {job_description_stripped[:200] if job_description_stripped else '(empty)'}")
                    print(f"[ApplicationLab] Job URL: {job.get('url', 'N/A')}, Snippet length: {len(job.get('snippet', '') or '')}")
                    return {"status": "error", "message": error_msg}
                
                if isinstance(parsed_resume, Exception):
                    if isinstance(parsed_resume, asyncio.TimeoutError):
                        print("[ApplicationLab] Resume parsing timed out, using fallback")
                        parsed_resume = {
                            'summary': user_resume.get('resumeText', user_resume.get('rawText', ''))[:500] if user_resume else ''
                        }
                    else:
                        print(f"[ApplicationLab] Resume parsing error: {parsed_resume}")
                        parsed_resume = {
                            'summary': user_resume.get('resumeText', user_resume.get('rawText', ''))[:500] if user_resume else ''
                        }
            except Exception as e:
                print(f"[ApplicationLab] Parallel execution error: {e}")
                import traceback
                print(f"[ApplicationLab] Traceback: {traceback.format_exc()}")
                job_description = job.get("snippet", "") or ""
                parsed_resume = {
                    'summary': user_resume.get('resumeText', user_resume.get('rawText', ''))[:500] if user_resume else ''
                }
                
                # ISSUE 2 FIX: Also validate job description after exception handler
                job_description = job_description or ""
                job_description_stripped = job_description.strip()
                if len(job_description_stripped) < 300:
                    error_msg = "Unable to extract sufficient job description. Please paste the job description manually."
                    print(f"[ApplicationLab] ERROR: Job description too short ({len(job_description_stripped)} chars, minimum 300 required)")
                    print(f"[ApplicationLab] Job URL: {job.get('url', 'N/A')}, Snippet length: {len(job.get('snippet', '') or '')}")
                    return {"status": "error", "message": error_msg}
            
            
            # Step 2: Extract requirements
            try:
                if progress_callback:
                    progress_callback(25, "Extracting job requirements...")
                
                requirements = await asyncio.wait_for(
                    self._scout._extract_job_requirements(job, job_description),
                    timeout=20.0
                )
                print(f"[ApplicationLab] Extracted {len(requirements)} requirements")
            except asyncio.TimeoutError:
                print("[ApplicationLab] Requirement extraction timed out")
                requirements = []
            except Exception as e:
                print(f"[ApplicationLab] Requirement extraction failed: {e}")
                import traceback
                print(f"[ApplicationLab] Traceback: {traceback.format_exc()}")
                requirements = []
            
            # Step 3: Match requirements to resume
            requirement_matches = []
            if progress_callback:
                progress_callback(45, "Matching requirements to resume...")
            if len(requirements) > 0:
                requirement_matches = await self._scout._match_requirements_to_resume(
                    requirements, parsed_resume
                )
                # Ensure requirement_matches is never None
                if requirement_matches is None:
                    print("[ApplicationLab] WARNING: _match_requirements_to_resume returned None, using empty list")
                    requirement_matches = []
                print(f"[ApplicationLab] Matched {len(requirement_matches)} requirements")
            
            # Step 4: Generate resume edits
            resume_edits = []
            if progress_callback:
                progress_callback(70, "Generating resume edit suggestions...")
            resume_edits = await self._scout._generate_resume_edits(
                job, requirements, requirement_matches, parsed_resume
            )
            
            # Step 5: Calculate scores and summaries
            score, match_level, score_breakdown = self._scout._calculate_fit_score(requirement_matches if requirement_matches else [])
            strengths, gaps = self._scout._extract_strengths_gaps(requirement_matches if requirement_matches else [])
            
            # Step 6: Generate pitch and talking points
            pitch = await self._scout._generate_pitch(job, strengths, parsed_resume)
            talking_points = await self._scout._generate_talking_points(job, requirement_matches if requirement_matches else [], gaps)
            keywords = self._scout._extract_keywords(requirements, job_description)
            
            # Step 7: Build summaries
            requirements_summary = self._scout._build_requirements_summary(requirement_matches if requirement_matches else [])
            match_breakdown = self._scout._build_match_breakdown(requirement_matches if requirement_matches else [])
            edits_summary = self._scout._build_edits_summary(resume_edits)
            potential_score = self._scout._estimate_score_after_edits(score, resume_edits)
            
            # Step 8: Build EnhancedFitAnalysis object
            if progress_callback:
                progress_callback(95, "Finalizing analysis...")
            
            enhanced_analysis = EnhancedFitAnalysis(
                score=score,
                match_level=match_level,
                strengths=strengths,
                gaps=gaps,
                pitch=pitch,
                talking_points=talking_points,
                keywords_to_use=keywords,
                job_requirements=requirement_matches,
                requirements_summary=requirements_summary,
                match_breakdown=match_breakdown,
                resume_edits=resume_edits,
                edits_summary=edits_summary,
                potential_score_after_edits=potential_score,
                cover_letter=None,  # Generated on demand
                score_breakdown=score_breakdown
            )
            
            analysis_dict = enhanced_analysis.to_dict()
            
            # Save to Firestore
            self._save_analysis_to_firestore(user_id, analysis_id, analysis_dict, job, resume_hash)
            
            return {
                "status": "ok",
                "analysis": analysis_dict,
                "analysis_id": analysis_id
            }
        except Exception as e:
            print(f"[ApplicationLab] Analysis failed: {e}")
            import traceback
            print(f"[ApplicationLab] Traceback: {traceback.format_exc()}")
            return {"status": "error", "message": f"Analysis failed: {str(e)}"}
    
    def get_analysis_sync(
        self,
        user_id: str,
        analysis_id: str
    ) -> Dict[str, Any]:
        """
        Retrieve a saved analysis by ID (synchronous version).
        
        FIX: Made synchronous to prevent blocking Firestore calls in async routes.
        This method performs a simple Firestore read and should return in <300ms.
        """
        try:
            from app.extensions import get_db
            
            db = get_db()
            if not db:
                return {"status": "error", "message": "Database not available"}
            
            analysis_ref = db.collection('users').document(user_id).collection('applicationLabAnalyses').document(analysis_id)
            analysis_doc = analysis_ref.get()
            
            if not analysis_doc.exists:
                return {"status": "error", "message": "Analysis not found"}
            
            analysis_data = analysis_doc.to_dict()
            return {
                "status": "ok",
                "analysis": analysis_data.get('analysis'),
                "job_snapshot": analysis_data.get('jobSnapshot', {})
            }
        except Exception as e:
            logger.error(f"[ApplicationLab] Error retrieving analysis: {e}")
            return {"status": "error", "message": f"Failed to retrieve analysis: {str(e)}"}
    
    async def get_analysis(
        self,
        user_id: str,
        analysis_id: str
    ) -> Dict[str, Any]:
        """
        Retrieve a saved analysis by ID (async wrapper for backward compatibility).
        
        DEPRECATED: Use get_analysis_sync() instead. This wrapper is kept for compatibility.
        """
        # Delegate to synchronous version
        return self.get_analysis_sync(user_id, analysis_id)
    
    async def generate_cover_letter(
        self,
        job: Dict[str, Any],
        user_resume: Dict[str, Any],
        fit_analysis: Optional[Dict[str, Any]] = None,
        tone: str = "conversational",
        length: str = "medium",
        emphasis: List[str] = None
    ) -> CoverLetter:
        """Generate a tailored cover letter."""
        # MIN_LEN constant
        MIN_LEN = 500
        
        # INVARIANT: If resumeText exists and length >= MIN_LEN, it is the ONLY source of truth
        # Validate resume text exists (cover letter generation needs it)
        resume_text = user_resume.get('resumeText') or user_resume.get('rawText') or user_resume.get('resume_text') or ''
        if not resume_text or len(resume_text.strip()) < MIN_LEN:
            # Try to fetch from Firestore if user_id available (would need to be passed, but for now just validate)
            raise ValueError(f"Resume text is missing or too short (minimum {MIN_LEN} chars required). Please re-upload your resume in Account Settings.")
        
        # DO NOT reconstruct text - use what we have
        # Delegate to scout_service for cover letter generation
        return await self._scout.generate_cover_letter(
            job=job,
            user_resume=user_resume,
            fit_analysis=fit_analysis,
            tone=tone,
            length=length,
            emphasis=emphasis or []
        )
    
    async def apply_edits_to_raw_text(self, raw_text: str, resume_edits: List[ResumeEdit]) -> str:
        """
        DEPRECATED: This method should rarely be used.
        Only called when ALL conditions met:
        - resumeText exists AND
        - parsed resume failed (parse_incomplete) AND
        - resume_edits <= 3 AND
        - resumeText length >= 1500
        
        TODO: Consider removing in next cleanup if structured formatting works for all cases.
        
        Apply resume edits directly to raw resume text using LLM.
        Batches edits (max 3 per call) - but should only be called with <= 3 edits now.
        
        Args:
            raw_text: The raw resume text
            resume_edits: List of ResumeEdit objects to apply (should be <= 3)
            
        Returns:
            Edited raw text with all edits applied
            
        Raises:
            ValueError: If edits cannot be applied successfully
        """
        if not raw_text or not raw_text.strip():
            raise ValueError("Raw resume text is empty - cannot apply edits")
        
        if not resume_edits:
            return raw_text
        
        # Ensure edits count is within limit (should be enforced by caller)
        if len(resume_edits) > 3:
            logger.warning(f"[ApplicationLab] WARNING: apply_edits_to_raw_text called with {len(resume_edits)} edits (max 3)")
            # Still batch, but log warning
            edited_text = raw_text
            for i in range(0, len(resume_edits), 3):
                batch = resume_edits[i:i+3]
                logger.info(f"[ApplicationLab] Applying batch {i//3 + 1} ({len(batch)} edits)")
                edited_text = await self._apply_edits_batch(edited_text, batch)
            return edited_text
        else:
            # Single call (edits <= 3)
            return await self._apply_edits_batch(raw_text, resume_edits)
    
    async def _apply_edits_batch(self, raw_text: str, resume_edits: List[ResumeEdit]) -> str:
        """Apply a batch of edits (max 3) to raw text."""
        # Build edit instructions for LLM
        edits_description = []
        for i, edit in enumerate(resume_edits):
            edit_desc = f"Edit {i+1} ({edit.priority} priority):\n"
            edit_desc += f"- Section: {edit.section}"
            if edit.subsection:
                edit_desc += f" ({edit.subsection})"
            edit_desc += f"\n- Type: {edit.edit_type}\n"
            if edit.current_content:
                edit_desc += f"- Current: {edit.current_content}\n"
            edit_desc += f"- Suggested: {edit.suggested_content}\n"
            if edit.rationale:
                edit_desc += f"- Rationale: {edit.rationale}\n"
            edits_description.append(edit_desc)
        
        edits_text = "\n\n".join(edits_description)
        
        # Calculate dynamic timeout based on prompt size (60s base, +10s per 1000 chars)
        prompt_size = len(raw_text[:8000]) + len(edits_text)
        timeout = 60.0 + (prompt_size / 1000) * 10.0
        timeout = min(timeout, 120.0)  # Cap at 120s
        
        # REDUCED max_tokens for faster response and lower cost
        # Since we cap at 3 edits per call, we don't need 2000 tokens
        max_tokens = 1500  # Reduced from 2000
        
        prompt = f"""Apply the following edits to this resume text. Make MINIMAL changes - only apply the specified edits while preserving the original structure and formatting as much as possible.

RESUME TEXT:
{raw_text[:8000]}

EDITS TO APPLY:
{edits_text}

INSTRUCTIONS:
1. Apply ONLY the edits specified above
2. Preserve the original formatting (line breaks, sections, bullets)
3. If current_content is provided, find and replace it with suggested_content
4. If edit_type is "add", insert the suggested_content in the appropriate location
5. If edit_type is "add_keywords", add the keywords naturally to existing content
6. Do NOT rewrite or reorganize the resume - only make the minimal changes needed
7. Maintain professional tone and resume structure

Return the complete edited resume text with all edits applied."""

        try:
            logger.info("application_lab.apply_edits.openai_call", extra={
                "model": "gpt-4o-mini",
                "prompt_chars": len(prompt),
                "max_tokens": max_tokens,
                "num_edits": len(resume_edits),
                "raw_text_len": len(raw_text),
                "timeout": timeout,
            })
            
            import time
            start_time = time.time()
            
            completion = await asyncio.wait_for(
                self._openai.chat.completions.create(
                    model="gpt-4o-mini",
                    messages=[
                        {"role": "system", "content": "You are a resume editor. Apply edits minimally while preserving original structure."},
                        {"role": "user", "content": prompt}
                    ],
                    temperature=0.1,
                    max_tokens=max_tokens
                ),
                timeout=timeout
            )
            
            latency = time.time() - start_time
            tokens_used = completion.usage.total_tokens if hasattr(completion, 'usage') and completion.usage else None
            
            logger.info("application_lab.apply_edits.openai_complete", extra={
                "latency_seconds": latency,
                "tokens_used": tokens_used,
                "success": True,
            })
            
            edited_text = completion.choices[0].message.content.strip()
            if not edited_text:
                raise ValueError("LLM returned empty edited text")
            
            logger.info(f"[ApplicationLab] Successfully applied {len(resume_edits)} edits to raw text using LLM")
            return edited_text
            
        except asyncio.TimeoutError:
            logger.error(f"[ApplicationLab] Timeout applying edits (timeout={timeout}s)")
            raise ValueError("Timeout while applying edits to raw text - operation took too long")
        except Exception as e:
            logger.error(f"[ApplicationLab] Failed to apply edits to raw text: {e}")
            import traceback
            logger.error(f"[ApplicationLab] Traceback: {traceback.format_exc()}")
            raise ValueError(f"Failed to apply edits to raw text: {str(e)}")
    
    async def _get_raw_resume_text(
        self,
        user_resume: Dict[str, Any],
        parsed_resume: Dict[str, Any] = None,
        edited_resume: Dict[str, Any] = None,
        user_id: Optional[str] = None
    ) -> str:
        """
        DEPRECATED: This method should not be used when resumeText exists.
        Only kept for backward compatibility.
        TODO: Delete in next cleanup - use _get_resume_text_from_payload_or_firestore() instead.
        
        Get raw resume text from multiple sources with fallback to database.
        NOTE: Reconstruction path is FORBIDDEN if resumeText exists (see generate_edited_resume invariant).
        """
        MIN_LEN = 500
        
        # Try user_resume first
        raw_text = user_resume.get('resumeText') or user_resume.get('rawText') or user_resume.get('resume_text') or ''
        if raw_text and len(raw_text.strip()) >= MIN_LEN:
            logger.info(f"[ApplicationLab] Found raw text in user_resume ({len(raw_text)} chars)")
            return raw_text
        
        # Try parsed_resume
        if parsed_resume:
            raw_text = parsed_resume.get('raw_text', '')
            if raw_text and len(raw_text.strip()) >= MIN_LEN:
                logger.info(f"[ApplicationLab] Found raw text in parsed_resume ({len(raw_text)} chars)")
                return raw_text
        
        # Try edited_resume
        if edited_resume:
            raw_text = edited_resume.get('raw_text', '')
            if raw_text and len(raw_text.strip()) >= MIN_LEN:
                logger.info(f"[ApplicationLab] Found raw text in edited_resume ({len(raw_text)} chars)")
                return raw_text
        
        # Try to fetch from database if user_id is available
        if user_id:
            try:
                from app.extensions import get_db
                db = get_db()
                if db:
                    user_doc = db.collection('users').document(user_id).get()
                    if user_doc.exists:
                        user_data = user_doc.to_dict()
                        raw_text = user_data.get('resumeText', '') or user_data.get('rawText', '')
                        if raw_text and len(raw_text.strip()) >= MIN_LEN:
                            logger.info(f"[ApplicationLab] Retrieved raw resume text from database for user {user_id[:8]}... ({len(raw_text)} chars)")
                            return raw_text
                        else:
                            logger.warning(f"[ApplicationLab] Database user doc exists but no valid resumeText/rawText found. Keys: {list(user_data.keys())[:10]}")
            except Exception as e:
                logger.error(f"[ApplicationLab] Failed to fetch resume from database: {e}")
                import traceback
                logger.error(f"[ApplicationLab] Database fetch traceback: {traceback.format_exc()}")
        
        # HARD GUARD: Reconstruction path is FORBIDDEN if resumeText should exist
        # This should never be reached if resumeText was properly loaded
        if parsed_resume:
            logger.error("[ApplicationLab] ERROR: Attempted to reconstruct text from structured data - this path should be forbidden")
            logger.error("[ApplicationLab] This indicates a bug - resumeText should have been loaded earlier")
            # Don't reconstruct - return empty and let validation catch it
            return ''
        
        logger.warning(f"[ApplicationLab] WARNING: Could not find raw resume text from any source")
        return ''
    
    def _merge_missing_sections(
        self,
        edited_resume: Dict[str, Any],
        original_resume: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Merge missing sections from original resume into edited resume.
        This prevents data loss when AI output is missing sections.
        
        Args:
            edited_resume: The edited resume (may be missing sections)
            original_resume: The original parsed resume (source of truth for missing sections)
            
        Returns:
            Merged resume with all sections preserved
        """
        import copy
        merged = copy.deepcopy(edited_resume)
        missing_sections = []
        
        # List of sections to check and merge
        sections_to_check = ['education', 'experience', 'projects', 'skills', 'achievements', 'summary']
        
        for section in sections_to_check:
            # Check if section exists in original but not in edited
            original_has_section = bool(original_resume.get(section))
            edited_has_section = bool(merged.get(section))
            
            if original_has_section and not edited_has_section:
                # Section exists in original but missing in edited - merge it
                merged[section] = copy.deepcopy(original_resume[section])
                missing_sections.append(section.capitalize())
        
        if missing_sections:
            logger.warning(
                f"[ApplicationLab] Edited resume missing sections: {missing_sections}. "
                "Re-injecting from original."
            )
        
        return merged
    
    def _assemble_complete_resume(
        self,
        edited_resume: Dict[str, Any],
        original_resume: Dict[str, Any],
        raw_resume_text: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Assemble a complete resume that includes ALL original sections.
        For each section:
        - If edited version exists → use edited version
        - Else → use original section
        - If missing from both but exists in raw text → attempt to extract from raw text
        
        This ensures no sections are dropped during formatting.
        
        Args:
            edited_resume: The resume after edits were applied
            original_resume: The original parsed resume (source of truth)
            raw_resume_text: Optional raw resume text for fallback extraction
            
        Returns:
            Complete resume with all sections preserved
        """
        import copy
        complete_resume = copy.deepcopy(edited_resume)
        
        # Track which sections were edited vs preserved
        edited_sections = []
        preserved_sections = []
        missing_sections = []
        extracted_sections = []
        
        # List of all resume sections to check
        all_sections = ['summary', 'experience', 'education', 'projects', 'skills', 'achievements', 'certifications']
        
        # Debug: Log what sections exist in original and edited
        original_sections = [s for s in all_sections if original_resume.get(s)]
        edited_sections_before = [s for s in all_sections if edited_resume.get(s)]
        logger.debug(
            f"[ApplicationLab] Original resume sections: {original_sections}, "
            f"Edited resume sections before merge: {edited_sections_before}"
        )
        
        for section in all_sections:
            # Check if section exists (even if empty list/string)
            original_has_section = section in original_resume and original_resume.get(section) is not None
            edited_has_section = section in complete_resume and complete_resume.get(section) is not None
            
            if original_has_section:
                if edited_has_section:
                    # Section exists in both - edited version takes precedence
                    edited_sections.append(section.capitalize())
                else:
                    # Section exists in original but not in edited - preserve original
                    complete_resume[section] = copy.deepcopy(original_resume[section])
                    preserved_sections.append(section.capitalize())
                    logger.debug(f"[ApplicationLab] Preserving {section} from original (was missing in edited)")
            elif edited_has_section:
                # Section only in edited (newly added) - keep it
                edited_sections.append(section.capitalize())
            else:
                # Section missing from both - try to extract from raw text if available
                if raw_resume_text:
                    logger.debug(f"[ApplicationLab] Attempting to extract {section} from raw text (length: {len(raw_resume_text)} chars)")
                    extracted = self._extract_section_from_raw_text(raw_resume_text, section)
                    if extracted:
                        complete_resume[section] = extracted
                        extracted_sections.append(section.capitalize())
                        logger.warning(f"[ApplicationLab] ✅ Extracted {section} from raw text (was missing from parsed resume)")
                        # Log what was extracted for debugging
                        if isinstance(extracted, list) and extracted:
                            logger.debug(f"[ApplicationLab] Extracted {section} content: {str(extracted)[:200]}...")
                        elif isinstance(extracted, str):
                            logger.debug(f"[ApplicationLab] Extracted {section} content: {extracted[:200]}...")
                    else:
                        logger.warning(f"[ApplicationLab] ❌ Failed to extract {section} from raw text - section not found or pattern didn't match")
                        missing_sections.append(section.capitalize())
                else:
                    logger.warning(f"[ApplicationLab] Cannot extract {section} - raw_resume_text not available")
                    missing_sections.append(section.capitalize())
        
        # Preserve ALL other fields from original (name, email, phone, location, etc.)
        # This ensures no data is lost
        for key, value in original_resume.items():
            if key not in all_sections and not key.startswith('_'):
                if key not in complete_resume or complete_resume.get(key) is None:
                    complete_resume[key] = copy.deepcopy(value)
                    logger.debug(f"[ApplicationLab] Preserving field '{key}' from original resume")
        
        # FINAL FALLBACK: Synthesize Education section from metadata if still missing
        if not complete_resume.get('education'):
            synthesized_education = self._synthesize_education_from_metadata(complete_resume, original_resume)
            if synthesized_education:
                complete_resume['education'] = synthesized_education
                extracted_sections.append('Education')
                logger.warning("[ApplicationLab] Synthesized Education section from resume metadata")
        
        # Log section assembly with detailed info
        logger.info(
            f"[Scout] Resume assembled with sections: "
            f"edited={edited_sections}, preserved={preserved_sections}"
        )
        if extracted_sections:
            logger.info(
                f"[ApplicationLab] Extracted sections from raw text: {extracted_sections}"
            )
        if missing_sections:
            logger.warning(
                f"[ApplicationLab] Sections missing from both original and edited resume: {missing_sections}. "
                "These sections will not appear in the formatted output."
            )
        
        return complete_resume
    
    def normalize_resume_sections(
        self,
        parsed_resume: Dict[str, Any],
        raw_text: Optional[str] = None
    ) -> Tuple[Dict[str, Any], Dict[str, Any]]:
        """
        Comprehensive resume normalization in one pass.
        Handles skills normalization, inline header stripping, section boundary splits,
        and deduplication, with confidence scoring for debugging.
        
        Args:
            parsed_resume: The parsed resume dict (from Scout enhance or parsing)
            raw_text: Optional raw resume text string (from Firestore/payload)
            
        Returns:
            Tuple of (normalized_resume_dict, debug_dict)
            - normalized_resume_dict: Clean normalized resume
            - debug_dict: Contains confidence, reasons, and metrics
        """
        import copy
        import ast
        
        normalized = copy.deepcopy(parsed_resume)
        confidence = 1.0
        reasons = []
        metrics = {
            "inline_headers_stripped": 0,
            "skills_parsed_from_string": False,
            "mid_string_splits": 0,
            "dedup_removed": {},
            "input_len": len(raw_text) if raw_text else 0,
            "output_len": 0
        }
        
        # Canonical headers for inline stripping
        CANONICAL_HEADERS = [
            "PROJECTS", "PROJECTS AND RESEARCH", "EXPERIENCE", "EDUCATION",
            "SKILLS", "TECHNICAL SKILLS", "EXTRA CURRICULAR", "EXTRACURRICULAR",
            "OBJECTIVE", "PROFESSIONAL SUMMARY", "SUMMARY", "CERTIFICATIONS"
        ]
        
        # Normalize skills first (critical fix)
        if "skills" in normalized:
            skills = normalized["skills"]
            
            # Handle skills as string that looks like Python dict literal
            if isinstance(skills, str):
                skills_str = skills.strip()
                # Check if it looks like a dict literal (contains '{' and "':" or '":')
                if skills_str.startswith("{") and ("':" in skills_str or '":' in skills_str):
                    try:
                        # Strip prefixes like "SKILLS", "Other:", etc.
                        cleaned_str = re.sub(r'^(?:SKILLS|OTHER)\s*:?\s*', '', skills_str, flags=re.IGNORECASE)
                        # Try to parse with ast.literal_eval (safe, not eval)
                        parsed_skills = ast.literal_eval(cleaned_str)
                        if isinstance(parsed_skills, dict):
                            normalized["skills"] = parsed_skills
                            metrics["skills_parsed_from_string"] = True
                            confidence -= 0.15
                            reasons.append("skills_parsed_from_string_literal")
                            skills_was_string = True
                    except (ValueError, SyntaxError) as e:
                        # If parsing fails, try to extract as list or keep as-is
                        logger.warning(f"[ApplicationLab] Failed to parse skills dict string: {e}")
                        # Strip prefixes and try to convert to list
                        cleaned_str = re.sub(r'^(?:SKILLS|OTHER)\s*:?\s*', '', skills_str, flags=re.IGNORECASE)
                        normalized["skills"] = cleaned_str  # Keep as string if parsing fails
                        confidence -= 0.20
                        reasons.append("skills_parse_failed")
            
            # Ensure dict values are lists of strings (run even if we just parsed from string)
            if isinstance(normalized.get("skills"), dict):
                cleaned_dict = {}
                for key, value in normalized["skills"].items():
                    # Strip "Other:" prefix from key, and also strip "SKILLS" prefix
                    cleaned_key = re.sub(r'^(?:OTHER|SKILLS)\s*:?\s*', '', str(key), flags=re.IGNORECASE).strip()
                    if not cleaned_key:
                        cleaned_key = "other"  # Default key if everything was stripped
                    if isinstance(value, list):
                        cleaned_dict[cleaned_key] = [str(v).strip() for v in value if v]
                    elif value:
                        cleaned_dict[cleaned_key] = [str(value).strip()]
                normalized["skills"] = cleaned_dict
            
            # Ensure list is list of strings
            elif isinstance(normalized["skills"], list):
                normalized["skills"] = [str(s).strip() for s in normalized["skills"] if s]
        
        # Normalize summary (string field)
        if "summary" in normalized and isinstance(normalized["summary"], str):
            normalized["summary"] = self._strip_inline_headers_robust(normalized["summary"], CANONICAL_HEADERS)
        
        # Normalize sections: experience, projects, education, achievements, extras
        section_fields = {
            "experience": "bullets",
            "projects": "bullets",
            "education": "details",
            "achievements": None,  # achievements is list of strings
            "extras": None  # extras is list of strings
        }
        
        for section_name, bullet_field in section_fields.items():
            if section_name not in normalized:
                continue
            
            section_data = normalized[section_name]
            if not section_data:
                continue
            
            # Handle list of dicts (experience, projects, education)
            if bullet_field and isinstance(section_data, list):
                dedup_removed_count = 0
                seen_bullets = set()
                cleaned_items = []
                
                for item in section_data:
                    if not isinstance(item, dict):
                        cleaned_items.append(item)
                        continue
                    
                    cleaned_item = copy.deepcopy(item)
                    
                    # Process bullets/details
                    if bullet_field in cleaned_item and isinstance(cleaned_item[bullet_field], list):
                        original_count = len(cleaned_item[bullet_field])
                        cleaned_bullets = []
                        
                        for bullet in cleaned_item[bullet_field]:
                            if not isinstance(bullet, str):
                                cleaned_bullets.append(bullet)
                                continue
                            
                            # Strip inline headers (even before bullet markers)
                            cleaned_bullet = self._strip_inline_headers_robust(bullet, CANONICAL_HEADERS)
                            if cleaned_bullet != bullet:
                                metrics["inline_headers_stripped"] += 1
                            
                            # Handle section boundary splits (e.g., "EXTRA CURRICULAR" appears mid-string)
                            split_result = self._split_at_section_boundary(cleaned_bullet, normalized)
                            if split_result["split_occurred"]:
                                metrics["mid_string_splits"] += 1
                                confidence -= 0.10
                                reasons.append(f"mid_string_split_in_{section_name}")
                            cleaned_bullet = split_result["text"]
                            
                            # Deduplicate
                            normalized_bullet = self._normalize_bullet_for_dedup(cleaned_bullet)
                            if normalized_bullet and normalized_bullet not in seen_bullets and cleaned_bullet.strip():
                                seen_bullets.add(normalized_bullet)
                                cleaned_bullets.append(cleaned_bullet)
                        
                        cleaned_item[bullet_field] = cleaned_bullets
                        removed = original_count - len(cleaned_bullets)
                        dedup_removed_count += removed
                    
                    # Clean other text fields
                    for field in ["title", "company", "name", "context", "degree", "school"]:
                        if field in cleaned_item and isinstance(cleaned_item[field], str):
                            cleaned_item[field] = self._strip_inline_headers_robust(cleaned_item[field], CANONICAL_HEADERS)
                    
                    cleaned_items.append(cleaned_item)
                
                normalized[section_name] = cleaned_items
                if dedup_removed_count > 0:
                    metrics["dedup_removed"][section_name] = dedup_removed_count
            
            # Handle list of strings (achievements, extras)
            elif not bullet_field and isinstance(section_data, list):
                dedup_removed_count = 0
                seen_items = set()
                cleaned_items = []
                original_count = len(section_data)
                
                for item in section_data:
                    if not isinstance(item, str):
                        cleaned_items.append(item)
                        continue
                    
                    # Strip inline headers
                    cleaned_item = self._strip_inline_headers_robust(item, CANONICAL_HEADERS)
                    if cleaned_item != item:
                        metrics["inline_headers_stripped"] += 1
                    
                    # Deduplicate
                    normalized_item = self._normalize_bullet_for_dedup(cleaned_item)
                    if normalized_item and normalized_item not in seen_items and cleaned_item.strip():
                        seen_items.add(normalized_item)
                        cleaned_items.append(cleaned_item)
                
                normalized[section_name] = cleaned_items
                removed = original_count - len(cleaned_items)
                if removed > 0:
                    metrics["dedup_removed"][section_name] = removed
                    dedup_removed_count = removed
        
        # Check if inline headers were stripped (affects confidence)
        if metrics["inline_headers_stripped"] > 0:
            confidence -= 0.10
            reasons.append("inline_headers_stripped")
        
        # Check dedup ratio (if >30% removed, penalize confidence)
        total_bullets_removed = sum(metrics["dedup_removed"].values())
        if total_bullets_removed > 0:
            # Count total bullets after dedup
            total_bullets_after = 0
            for section_name in ["experience", "projects", "education", "achievements", "extras"]:
                section_data = normalized.get(section_name)
                if not section_data:
                    continue
                if isinstance(section_data, list):
                    for item in section_data:
                        if isinstance(item, dict) and "bullets" in item:
                            total_bullets_after += len(item["bullets"])
                        elif isinstance(item, dict) and "details" in item:
                            total_bullets_after += len(item["details"])
                        elif isinstance(item, str):
                            total_bullets_after += 1
            
            # Calculate ratio: removed / (removed + after)
            if total_bullets_after > 0:
                dedup_ratio = total_bullets_removed / (total_bullets_removed + total_bullets_after)
                if dedup_ratio > 0.30:
                    confidence -= 0.10
                    reasons.append("high_dedup_ratio")
        
        # Floor confidence at 0.0
        confidence = max(0.0, confidence)
        
        # Build debug dict
        debug = {
            "confidence": round(confidence, 2),
            "reasons": reasons,
            "metrics": metrics
        }
        
        return normalized, debug
    
    def _normalize_and_deduplicate_resume(self, parsed_resume: Dict[str, Any]) -> Dict[str, Any]:
        """
        DEPRECATED: Legacy normalization function.
        This now delegates to normalize_resume_sections for consistency.
        
        Args:
            parsed_resume: The parsed resume (may have duplicates, messy headers, etc.)
            
        Returns:
            Normalized resume with canonical sections and deduplicated content
        """
        normalized, _ = self.normalize_resume_sections(parsed_resume, None)
        return normalized
        import copy
        normalized = copy.deepcopy(parsed_resume)
        
        # Header normalization map
        HEADER_MAP = {
            "summary": [
                "SUMMARY", "PROFESSIONAL SUMMARY", "OBJECTIVE", "PROFILE", "ABOUT"
            ],
            "experience": [
                "EXPERIENCE", "PROFESSIONAL EXPERIENCE", "WORK EXPERIENCE", 
                "EMPLOYMENT", "WORK HISTORY", "CAREER"
            ],
            "education": [
                "EDUCATION", "EDUCATIONAL BACKGROUND", "ACADEMIC BACKGROUND",
                "ACADEMICS", "ACADEMIC"
            ],
            "projects": [
                "PROJECTS", "PROJECTS AND RESEARCH", "RESEARCH", "RESEARCH PROJECTS",
                "PERSONAL PROJECTS", "TECHNICAL PROJECTS"
            ],
            "skills": [
                "SKILLS", "TECHNICAL SKILLS", "CORE SKILLS", "COMPETENCIES",
                "TECHNICAL COMPETENCIES"
            ],
            "achievements": [
                "ACHIEVEMENTS", "AWARDS", "HONORS", "RECOGNITION"
            ],
            "extracurricular": [
                "EXTRA CURRICULAR", "EXTRACURRICULAR", "ACTIVITIES",
                "LEADERSHIP", "VOLUNTEER"
            ]
        }
        
        # Create reverse map for quick lookup
        header_to_canonical = {}
        for canonical, headers in HEADER_MAP.items():
            for header in headers:
                # Normalize header for matching
                normalized_header = re.sub(r'[^\w\s]', '', header.upper()).strip()
                normalized_header = re.sub(r'\s+', ' ', normalized_header)
                header_to_canonical[normalized_header] = canonical
        
        # Step 1 & 2: Normalize headers and merge duplicate sections
        # Process existing sections - map to canonical keys
        canonical_sections = {}
        
        for key, value in list(normalized.items()):
            if key.startswith('_'):
                continue  # Skip metadata
            
            # Normalize key name for matching
            normalized_key = re.sub(r'[^\w\s]', '', key.upper()).strip()
            normalized_key = re.sub(r'\s+', ' ', normalized_key)
            
            # Map to canonical section
            # First check if key is already canonical
            canonical_key = key.lower() if key.lower() in HEADER_MAP else header_to_canonical.get(normalized_key, key.lower())
            
            # Only process if it maps to a canonical section
            if canonical_key in HEADER_MAP:
                if canonical_key not in canonical_sections:
                    canonical_sections[canonical_key] = []
                
                # Add content to canonical section (for merging duplicates)
                if isinstance(value, list):
                    canonical_sections[canonical_key].extend(value)
                elif value:  # String or other non-empty value
                    canonical_sections[canonical_key].append(value)
                
                # Remove original key if it's different from canonical
                if key != canonical_key:
                    del normalized[key]
        
        # Step 3 & 4: Remove inline headers and deduplicate bullets
        total_bullets_removed = 0
        sections_deduplicated = 0
        
        for canonical_key, content_list in canonical_sections.items():
            if not content_list:
                continue
            
            sections_deduplicated += 1
            deduplicated_content = []
            seen_bullets = set()
            
            for item in content_list:
                if isinstance(item, str):
                    # String content (e.g., summary)
                    cleaned = self._remove_inline_headers(item, HEADER_MAP.get(canonical_key, []))
                    if cleaned and cleaned.strip():
                        if canonical_key == 'summary':
                            normalized[canonical_key] = cleaned
                        else:
                            deduplicated_content.append(cleaned)
                
                elif isinstance(item, dict):
                    # Structured content (experience, projects, education entries)
                    cleaned_item = copy.deepcopy(item)
                    
                    # Clean bullets if present
                    if 'bullets' in cleaned_item and isinstance(cleaned_item['bullets'], list):
                        original_count = len(cleaned_item['bullets'])
                        cleaned_bullets = []
                        
                        for bullet in cleaned_item['bullets']:
                            if isinstance(bullet, str):
                                # Remove inline headers
                                cleaned_bullet = self._remove_inline_headers(
                                    bullet, 
                                    HEADER_MAP.get(canonical_key, [])
                                )
                                
                                # Normalize for deduplication
                                normalized_bullet = self._normalize_bullet_for_dedup(cleaned_bullet)
                                
                                if normalized_bullet not in seen_bullets and cleaned_bullet.strip():
                                    seen_bullets.add(normalized_bullet)
                                    cleaned_bullets.append(cleaned_bullet)
                        
                        cleaned_item['bullets'] = cleaned_bullets
                        removed = original_count - len(cleaned_bullets)
                        total_bullets_removed += removed
                    
                    # Clean other text fields (remove inline headers)
                    for field in ['title', 'company', 'name', 'context', 'degree', 'school', 'summary']:
                        if field in cleaned_item and isinstance(cleaned_item[field], str):
                            cleaned_item[field] = self._remove_inline_headers(
                                cleaned_item[field],
                                HEADER_MAP.get(canonical_key, [])
                            )
                    
                    deduplicated_content.append(cleaned_item)
                
                elif isinstance(item, list):
                    # Nested list - process recursively
                    for subitem in item:
                        if isinstance(subitem, str):
                            cleaned = self._remove_inline_headers(subitem, HEADER_MAP.get(canonical_key, []))
                            if cleaned and cleaned.strip():
                                deduplicated_content.append(cleaned)
                        else:
                            deduplicated_content.append(subitem)
            
            # Update normalized resume with deduplicated content
            if canonical_key == 'summary' and isinstance(normalized.get(canonical_key), str):
                # Summary already set as string above
                pass
            elif deduplicated_content:
                normalized[canonical_key] = deduplicated_content
        
        # Preserve all non-section fields (metadata, name, email, etc.)
        # These are already in normalized dict and weren't processed above
        
        # Step 5: Education synthesis (if still missing after normalization)
        if not normalized.get('education'):
            synthesized = self._synthesize_education_from_metadata(normalized, normalized)
            if synthesized:
                normalized['education'] = synthesized
                logger.warning("[ApplicationLab] Synthesized Education section from metadata")
        
        # Log normalization results
        section_status = {
            'summary': bool(normalized.get('summary')),
            'experience': bool(normalized.get('experience')),
            'education': bool(normalized.get('education')),
            'projects': bool(normalized.get('projects')),
            'skills': bool(normalized.get('skills')),
            'achievements': bool(normalized.get('achievements')),
            'extracurricular': bool(normalized.get('extracurricular'))
        }
        
        logger.info(f"[ApplicationLab] Normalized resume sections: {section_status}")
        
        if total_bullets_removed > 0:
            logger.info(
                f"[ApplicationLab] Deduplicated {total_bullets_removed} bullets across {sections_deduplicated} sections"
            )
        
        return normalized
    
    def _strip_inline_headers_robust(self, text: str, canonical_headers: List[str]) -> str:
        """
        Robust inline header stripping - removes headers even before bullet markers.
        
        Examples:
        - "PROJECTS AND RESEARCH • Wordle Solver..." → "Wordle Solver..."
        - "EXTRA CURRICULAR - Soccer..." → "Soccer..."
        - "PROJECTS PROJECTS AND RESEARCH ..." → "..." (removes duplicate headers)
        
        Args:
            text: Text that may contain inline headers
            canonical_headers: List of canonical header strings to remove
            
        Returns:
            Text with inline headers stripped
        """
        if not text or not canonical_headers:
            return text
        
        cleaned = text
        
        # Build regex pattern for all headers (case-insensitive)
        header_patterns = []
        for header in canonical_headers:
            # Escape special regex chars
            escaped = re.escape(header)
            # Match header at start, or after whitespace, optionally followed by bullet markers
            pattern = rf'(?:^|\s+){escaped}\s*[•\-·*:]\s*'
            header_patterns.append(pattern)
        
        # Apply all patterns
        for pattern in header_patterns:
            cleaned = re.sub(pattern, ' ', cleaned, flags=re.IGNORECASE | re.MULTILINE)
        
        # Remove duplicate header tokens (e.g., "PROJECTS PROJECTS AND RESEARCH")
        for header in canonical_headers:
            # Match repeated header tokens
            pattern = rf'\b{re.escape(header)}\s+(?:{re.escape(header)}\s*)+'
            cleaned = re.sub(pattern, '', cleaned, flags=re.IGNORECASE)
        
        # Clean up extra whitespace
        cleaned = re.sub(r'\s+', ' ', cleaned).strip()
        return cleaned
    
    def _remove_inline_headers(self, text: str, header_variants: List[str]) -> str:
        """
        Remove inline header artifacts from text content.
        DEPRECATED: Use _strip_inline_headers_robust instead.
        
        Example: "PROJECTS AND RESEARCH • Wordle Solver..." → "• Wordle Solver..."
        
        Args:
            text: Text that may contain inline headers
            header_variants: List of header variants to remove
            
        Returns:
            Text with inline headers removed
        """
        # Delegate to robust version
        return self._strip_inline_headers_robust(text, header_variants)
    
    def _split_at_section_boundary(self, text: str, normalized: Dict[str, Any]) -> Dict[str, Any]:
        """
        Split text at section boundary headers (e.g., "EXTRA CURRICULAR" appears mid-string).
        Routes the right portion to the correct section.
        
        Args:
            text: Text that may contain a section boundary
            normalized: The normalized resume dict (to route split content to)
            
        Returns:
            Dict with:
            - "text": The cleaned text (left portion stays in current section)
            - "split_occurred": bool indicating if split happened
            - "routed_section": str name of section where right portion was routed
        """
        result = {
            "text": text,
            "split_occurred": False,
            "routed_section": None
        }
        
        if not text:
            return result
        
        # Section boundary patterns (headers that indicate a new section starts)
        boundary_headers = {
            "EXTRA CURRICULAR": "extras",
            "EXTRACURRICULAR": "extras",
            "EDUCATION": "education",
            "EXPERIENCE": "experience",
            "PROJECTS": "projects",
            "SKILLS": "skills",
            "ACHIEVEMENTS": "achievements"
        }
        
        # Check for boundary headers in the text
        for header, section_name in boundary_headers.items():
            # Look for header pattern (case-insensitive, with optional bullet markers before/after)
            pattern = rf'\s+{re.escape(header)}\s*[•\-·*:]\s*'
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                # Split at the boundary
                left_part = text[:match.start()].strip()
                right_part = text[match.end():].strip()
                
                # Only route if right_part has content
                if right_part:
                    # Route right_part to appropriate section
                    if section_name == "extras":
                        if "extras" not in normalized:
                            normalized["extras"] = []
                        if isinstance(normalized["extras"], list):
                            normalized["extras"].append(right_part)
                    elif section_name == "achievements":
                        if "achievements" not in normalized:
                            normalized["achievements"] = []
                        if isinstance(normalized["achievements"], list):
                            normalized["achievements"].append(right_part)
                    
                    result["text"] = left_part
                    result["split_occurred"] = True
                    result["routed_section"] = section_name
                    break
        
        return result
    
    def _normalize_bullet_for_dedup(self, bullet: str) -> str:
        """
        Normalize a bullet point for deduplication comparison.
        Converts to lowercase, removes punctuation, normalizes whitespace.
        
        Args:
            bullet: Bullet text to normalize
            
        Returns:
            Normalized string for comparison
        """
        if not bullet:
            return ''
        
        # Lowercase
        normalized = bullet.lower()
        
        # Remove bullet markers
        normalized = re.sub(r'^[•\-·*]\s*', '', normalized)
        
        # Remove punctuation (keep alphanumeric and spaces)
        normalized = re.sub(r'[^\w\s]', '', normalized)
        
        # Normalize whitespace
        normalized = re.sub(r'\s+', ' ', normalized).strip()
        
        return normalized
    
    def _synthesize_education_from_metadata(
        self,
        complete_resume: Dict[str, Any],
        original_resume: Dict[str, Any]
    ) -> Optional[List[Dict[str, Any]]]:
        """
        Synthesize an Education section from resume metadata (university, major, year).
        This is a final fallback when parsing didn't extract a structured Education section.
        
        Args:
            complete_resume: The assembled resume (may have metadata fields)
            original_resume: The original parsed resume (may have metadata fields)
            
        Returns:
            List of education entries in structured format, or None if no metadata exists
        """
        # Collect education metadata from both resumes
        university = (
            complete_resume.get('university') or 
            original_resume.get('university') or
            complete_resume.get('school') or
            original_resume.get('school') or
            ''
        )
        
        major = (
            complete_resume.get('major') or
            original_resume.get('major') or
            complete_resume.get('degree') or
            original_resume.get('degree') or
            ''
        )
        
        year = (
            complete_resume.get('year') or
            original_resume.get('year') or
            complete_resume.get('graduationYear') or
            original_resume.get('graduationYear') or
            complete_resume.get('graduation_year') or
            original_resume.get('graduation_year') or
            ''
        )
        
        location = (
            complete_resume.get('location') or
            original_resume.get('location') or
            ''
        )
        
        # Only synthesize if we have at least university or major
        if not university and not major:
            logger.debug("[ApplicationLab] Cannot synthesize Education - no university or major metadata found")
            return None
        
        # Build education entry
        education_entry = {
            'degree': major if major else '',
            'school': university if university else '',
            'dates': '',
            'details': []
        }
        
        # Format school line with location if available
        school_line = university if university else ''
        if location and school_line:
            # Add location to school name
            school_line = f"{school_line}, {location}"
        elif location and not school_line:
            # If only location exists, use it as school
            school_line = location
        
        education_entry['school'] = school_line
        
        # Format degree/major line
        if major:
            degree_line = major
            # Enhance degree format if it's just a major name
            if not any(word in major.lower() for word in ['bachelor', 'master', 'phd', 'degree', 'bs', 'ba', 'ms', 'ma', 'mba']):
                degree_line = f"Bachelor of Science in {major}"  # Default assumption
            education_entry['degree'] = degree_line
        
        # Format dates/graduation year
        if year:
            # Try to format year nicely
            if isinstance(year, (int, float)):
                year_str = str(int(year))
            else:
                year_str = str(year).strip()
            
            # Check if it's a future year (expected graduation) or past (graduated)
            try:
                year_int = int(year_str)
                current_year = datetime.now().year
                if year_int >= current_year:
                    education_entry['dates'] = f"Expected Graduation: {year_str}"
                else:
                    education_entry['dates'] = f"Graduated: {year_str}"
            except (ValueError, TypeError):
                # If year isn't a number, use it as-is
                education_entry['dates'] = year_str
        
        # Add details if we have additional info
        details = []
        if university and major:
            details.append(f"{major} from {university}")
        elif university:
            details.append(university)
        elif major:
            details.append(major)
        
        if year:
            details.append(f"Class of {year}")
        
        education_entry['details'] = details if details else []
        
        logger.info(
            f"[ApplicationLab] Synthesized Education: school={school_line[:50]}, "
            f"degree={education_entry['degree'][:50]}, dates={education_entry['dates']}"
        )
        
        return [education_entry]
    
    def _extract_section_from_raw_text(self, raw_text: str, section: str) -> Optional[Any]:
        """
        Attempt to extract a section from raw resume text using simple pattern matching.
        This is a fallback when parsing didn't extract the section.
        
        Args:
            raw_text: Raw resume text
            section: Section name to extract ('education', 'projects', 'summary', etc.)
            
        Returns:
            Extracted section data or None if not found
        """
        if not raw_text:
            logger.debug(f"[ApplicationLab] Cannot extract {section} - raw_text is empty")
            return None
        
        raw_lower = raw_text.lower()
        logger.debug(f"[ApplicationLab] Extracting {section} from raw text ({len(raw_text)} chars)")
        
        # Section-specific extraction patterns
        # Use non-greedy matching with larger limits to capture full sections
        if section == 'experience':
            # Look for experience section - this is critical
            # Match from "EXPERIENCE" header until next major section or end
            exp_patterns = [
                # Pattern 1: Standard header on its own line (more flexible matching)
                r'(?:^|\n)\s*(?:experience|work\s+experience|employment|professional\s+experience|work\s+history)\s*(?:\n|:)[\s\S]{0,8000}?(?=(?:\n\s*(?:education|projects|skills|achievements|certifications|summary|objective|EDUCATION|PROJECTS|SKILLS)\s*(?:\n|:)|$))',
                # Pattern 2: Header may be uppercase
                r'(?:^|\n)\s*EXPERIENCE\s*(?:\n|:)[\s\S]{0,8000}?(?=(?:\n\s*(?:education|projects|skills|achievements|certifications|summary|objective|EDUCATION|PROJECTS|SKILLS)\s*(?:\n|:)|$))',
                # Pattern 3: More flexible - just look for experience keyword followed by substantial content
                r'(?:experience|work\s+experience)[\s\S]{0,8000}?(?=(?:education|projects|skills|achievements|certifications|summary|objective|EDUCATION|PROJECTS|SKILLS|$))',
            ]
            
            exp_text = None
            matched_pattern = None
            for i, pattern in enumerate(exp_patterns):
                match = re.search(pattern, raw_text, re.IGNORECASE | re.MULTILINE)
                if match:
                    exp_text = raw_text[match.start():match.end()].strip()
                    matched_pattern = i + 1
                    logger.debug(f"[ApplicationLab] Experience pattern {matched_pattern} matched: {match.start()}-{match.end()}, length={len(exp_text)}")
                    break
                    
            if exp_text and len(exp_text) > 100:
                # Remove the section header
                exp_text = re.sub(r'^(?:experience|work\s+experience|employment|professional\s+experience|work\s+history)\s*(?:\n|:)\s*', '', exp_text, flags=re.IGNORECASE)
                
                # Try to extract structured experience entries
                lines = exp_text.split('\n')
                experiences = []
                current_exp = {}
                current_bullets = []
                
                for line in lines:
                    line = line.strip()
                    if not line:
                        if current_exp and current_bullets:
                            # Empty line might separate entries - save current and start new
                            current_exp['bullets'] = current_bullets
                            experiences.append(current_exp)
                            current_exp = {}
                            current_bullets = []
                        continue
                    
                    # Look for job title patterns (lines with "at", company names, dates, or all caps)
                    has_title_markers = any(keyword in line.lower() for keyword in [' at ', ' - ', '|', '•'])
                    is_all_caps_header = len(line) > 5 and line.isupper() and not line.startswith(('•', '-', '·', '*'))
                    has_date = bool(re.search(r'\d{4}', line))
                    is_likely_title = (has_title_markers or is_all_caps_header or has_date) and len(line) < 150
                    
                    if is_likely_title and not line.startswith(('•', '-', '·', '*')):
                        if current_exp and current_bullets:
                            current_exp['bullets'] = current_bullets
                            experiences.append(current_exp)
                        # Start new experience entry
                        current_exp = {'title': line, 'company': '', 'dates': '', 'bullets': []}
                        current_bullets = []
                    elif line.startswith(('•', '-', '·', '*')):
                        # Likely a bullet point
                        bullet_text = line.lstrip('•-·* ').strip()
                        if bullet_text:
                            current_bullets.append(bullet_text)
                    elif current_exp:
                        # Additional info for current experience
                        if not current_exp.get('company') and len(line) < 100 and not line.startswith(('•', '-', '·', '*')):
                            current_exp['company'] = line
                        elif not current_exp.get('dates') and re.search(r'\d{4}', line):
                            current_exp['dates'] = line
                        elif len(line) > 20:
                            # Treat as bullet if it's substantial
                            current_bullets.append(line)
                    elif not current_exp and len(line) > 30:
                        # First experience entry - start it
                        current_exp = {'title': line, 'company': '', 'dates': '', 'bullets': []}
                
                # Don't forget the last entry
                if current_exp:
                    if current_bullets:
                        current_exp['bullets'] = current_bullets
                    else:
                        # If no bullets found, split text into paragraphs as bullets
                        paragraphs = [p.strip() for p in exp_text.split('\n\n') if p.strip() and len(p.strip()) > 20]
                        if paragraphs:
                            current_exp['bullets'] = paragraphs[:10]
                        else:
                            # Last resort: split by lines
                            lines_as_bullets = [l.strip() for l in exp_text.split('\n') if l.strip() and len(l.strip()) > 20]
                            current_exp['bullets'] = lines_as_bullets[:10] if lines_as_bullets else [exp_text[:500]]
                    experiences.append(current_exp)
                
                if experiences:
                    logger.info(f"[ApplicationLab] ✅ Extracted {len(experiences)} experience entries from raw text (pattern {matched_pattern})")
                    return experiences
                else:
                    # Fallback: return as single experience entry with full text as bullets
                    paragraphs = [p.strip() for p in exp_text.split('\n\n') if p.strip() and len(p.strip()) > 20]
                    bullets = paragraphs[:10] if paragraphs else [exp_text[:800]]
                    logger.warning(
                        f"[ApplicationLab] Experience extraction pattern {matched_pattern} matched but failed to parse structure. "
                        f"Raw text length: {len(exp_text)}, Using fallback with {len(bullets)} bullets. "
                        f"First 200 chars: {exp_text[:200]}"
                    )
                    return [{'title': 'Professional Experience', 'company': '', 'dates': '', 'bullets': bullets}]
            else:
                # No pattern matched or text too short - log detailed debug info
                exp_keywords_found = []
                for keyword in ['experience', 'work experience', 'employment', 'professional experience']:
                    if keyword in raw_lower:
                        pos = raw_lower.find(keyword)
                        exp_keywords_found.append(f"{keyword} at position {pos}")
                
                if exp_keywords_found:
                    first_keyword_pos = raw_lower.find('experience')
                    snippet_start = max(0, first_keyword_pos - 100)
                    snippet_end = min(len(raw_text), first_keyword_pos + 300)
                    logger.warning(
                        f"[ApplicationLab] ❌ Experience keywords found in raw text but extraction failed: {exp_keywords_found}. "
                        f"Text length: {len(raw_text)}. "
                        f"Snippet around first keyword ({snippet_start}-{snippet_end}): {raw_text[snippet_start:snippet_end]}"
                    )
                else:
                    logger.debug(f"[ApplicationLab] No experience keywords found in raw text")
                return None
        
        elif section == 'education':
            # Look for education section - capture more content
            # Try multiple patterns to handle different resume formats
            edu_patterns = [
                # Pattern 1: Section header on its own line (with ## for markdown)
                r'(?:^|\n)\s*#*\s*(?:education|university|degree|bachelor|master|phd|college|school)\s*(?:\n|:)[\s\S]{0,2000}?(?=(?:\n\s*#*\s*(?:experience|projects|skills|achievements|certifications|summary|objective)\s*(?:\n|:)|$))',
                # Pattern 2: Education keywords anywhere (more flexible)
                r'(?:education|university|degree|bachelor|master|phd|college|school)[\s\S]{0,2000}?(?=(?:experience|projects|skills|achievements|certifications|summary|objective|$))',
                # Pattern 3: Look for common education phrases
                r'(?:bachelor|master|phd|bs|ba|ms|ma|mba).*?(?:university|college|school|institute)[\s\S]{0,1500}?(?=(?:experience|projects|skills|achievements|certifications|summary|objective|$))',
            ]
            for i, pattern in enumerate(edu_patterns):
                match = re.search(pattern, raw_text, re.IGNORECASE | re.MULTILINE)
                if match:
                    logger.debug(f"[ApplicationLab] Education pattern {i+1} matched: {match.start()}-{match.end()}")
                    edu_text = raw_text[match.start():match.end()].strip()
                    # Remove the section header and markdown formatting
                    edu_text = re.sub(r'^(?:#+\s*)?(?:education|university|degree|bachelor|master|phd|college|school)\s*(?:\n|:)\s*', '', edu_text, flags=re.IGNORECASE)
                    edu_text = re.sub(r'^#+\s*', '', edu_text)  # Remove any remaining markdown headers
                    
                    if len(edu_text) > 50:  # Only return if substantial content
                        # Try to parse into structured format
                        lines = [l.strip() for l in edu_text.split('\n') if l.strip()]
                        details = []
                        degree = ''
                        school = ''
                        dates = ''
                        
                        for line in lines:
                            if not line.startswith(('•', '-', '·', '*')):
                                # Might be degree/school/date line
                                if not degree and len(line) < 100:
                                    degree = line
                                elif not school and len(line) < 100:
                                    school = line
                                elif not dates and re.match(r'.*\d{4}.*', line):
                                    dates = line
                            else:
                                details.append(line.lstrip('•-·* ').strip())
                        
                        if not details:
                            # If no bullet points, use all lines as details
                            details = [l for l in lines if l and len(l) > 10][:5]
                        
                        logger.debug(f"[ApplicationLab] Extracted education: degree={degree[:50]}, school={school[:50]}, details_count={len(details)}")
                        return [{'degree': degree, 'school': school, 'dates': dates, 'details': details if details else [edu_text[:500]]}]
            
            # If no pattern matched, check if education keywords exist in raw text at all
            edu_keywords = ['education', 'university', 'degree', 'bachelor', 'master', 'phd', 'college', 'school']
            has_edu_keywords = any(kw in raw_lower for kw in edu_keywords)
            if has_edu_keywords:
                logger.warning(f"[ApplicationLab] Education keywords found in raw text but extraction patterns didn't match. Raw text snippet: {raw_text[:500]}")
            else:
                logger.debug(f"[ApplicationLab] No education keywords found in raw text")
        
        elif section == 'projects':
            # Look for projects section - capture more content
            proj_patterns = [
                # Pattern 1: Section header on its own line
                r'(?:^|\n)\s*(?:projects?|project)\s*(?:\n|:)[\s\S]{0,3000}?(?=(?:\n\s*(?:education|experience|skills|achievements|certifications|summary|objective)\s*(?:\n|:)|$))',
                # Pattern 2: Projects keyword anywhere (more flexible)
                r'(?:projects?|project)[\s\S]{0,3000}?(?=(?:education|experience|skills|achievements|certifications|summary|objective|$))',
            ]
            for i, pattern in enumerate(proj_patterns):
                match = re.search(pattern, raw_text, re.IGNORECASE | re.MULTILINE)
                if match:
                    logger.debug(f"[ApplicationLab] Projects pattern {i+1} matched: {match.start()}-{match.end()}")
                    proj_text = raw_text[match.start():match.end()].strip()
                    # Remove the section header
                    proj_text = re.sub(r'^(?:projects?|project)\s*(?:\n|:)\s*', '', proj_text, flags=re.IGNORECASE)
                    
                    if len(proj_text) > 50:
                        # Try to parse into structured format
                        lines = [l.strip() for l in proj_text.split('\n') if l.strip()]
                        projects = []
                        current_proj = {}
                        current_bullets = []
                        
                        for line in lines:
                            if not line.startswith(('•', '-', '·', '*')):
                                if current_proj and current_bullets:
                                    current_proj['bullets'] = current_bullets
                                    projects.append(current_proj)
                                current_proj = {'name': line[:100], 'context': '', 'bullets': []}
                                current_bullets = []
                            else:
                                bullet_text = line.lstrip('•-·* ').strip()
                                if bullet_text:
                                    current_bullets.append(bullet_text)
                        
                        if current_proj:
                            if current_bullets:
                                current_proj['bullets'] = current_bullets
                            else:
                                paragraphs = [p.strip() for p in proj_text.split('\n\n') if p.strip() and len(p.strip()) > 20]
                                current_proj['bullets'] = paragraphs[:5] if paragraphs else [proj_text[:400]]
                            projects.append(current_proj)
                        
                        if projects:
                            return projects
                        # Fallback
                        paragraphs = [p.strip() for p in proj_text.split('\n\n') if p.strip() and len(p.strip()) > 20]
                        bullets = paragraphs[:5] if paragraphs else [proj_text[:400]]
                        logger.debug(f"[ApplicationLab] Extracted projects: {len(projects)} projects")
                        return [{'name': 'Project', 'context': '', 'bullets': bullets}]
            
            logger.debug(f"[ApplicationLab] No projects pattern matched in raw text")
        
        elif section == 'summary':
            # Look for summary/objective section (usually at the top) - capture more content
            summary_patterns = [
                # Pattern 1: Section header on its own line
                r'(?:^|\n)\s*(?:summary|objective|profile|about|professional summary)\s*(?:\n|:)[\s\S]{0,1000}?(?=(?:\n\s*(?:experience|education|projects|skills|achievements|certifications)\s*(?:\n|:)|$))',
                # Pattern 2: Summary keywords anywhere (more flexible)
                r'(?:summary|objective|profile|about|professional summary)[\s\S]{0,1000}?(?=(?:experience|education|projects|skills|achievements|certifications|$))',
                # Pattern 3: Text at the very beginning (before first major section)
                r'^([\s\S]{0,1000}?)(?=\n\s*(?:experience|education|projects|skills|achievements|certifications)\s*(?:\n|:))',
            ]
            for i, pattern in enumerate(summary_patterns):
                match = re.search(pattern, raw_text, re.IGNORECASE | re.MULTILINE)
                if match:
                    logger.debug(f"[ApplicationLab] Summary pattern {i+1} matched: {match.start()}-{match.end()}")
                    summary_text = raw_text[match.start():match.end()].strip()
                    # Remove the section header if present
                    summary_text = re.sub(r'^(?:summary|objective|profile|about|professional summary)\s*(?:\n|:)\s*', '', summary_text, flags=re.IGNORECASE)
                    
                    if len(summary_text) > 30:
                        logger.debug(f"[ApplicationLab] Extracted summary: {len(summary_text)} chars")
                        # Return full summary, not truncated
                        return summary_text[:1500]  # Increased limit
            
            logger.debug(f"[ApplicationLab] No summary pattern matched in raw text")
        
        # For other sections, return None (let formatting handle it)
        return None
    
    def _reconstruct_text_from_structured(self, parsed_resume: Dict[str, Any]) -> str:
        """
        DEPRECATED: This method should not be used when resumeText exists.
        Reconstruction path is FORBIDDEN if resumeText exists (see generate_edited_resume invariant).
        TODO: Delete in next cleanup.
        
        Reconstruct a reasonable text representation from structured resume data.
        Used as last resort when raw text is not available.
        """
        # HARD GUARD: Log error if this is called
        logger.error("[ApplicationLab] ERROR: _reconstruct_text_from_structured() called - this path should be forbidden")
        logger.error("[ApplicationLab] This indicates a bug - resumeText should have been loaded and validated earlier")
        lines = []
        
        # Summary
        if parsed_resume.get('summary'):
            lines.append(parsed_resume['summary'])
            lines.append('')
        
        # Experience
        if parsed_resume.get('experience'):
            lines.append('EXPERIENCE')
            for exp in parsed_resume['experience']:
                title = exp.get('title', '')
                company = exp.get('company', '')
                dates = exp.get('dates', '')
                if title or company:
                    header = f"{title} at {company}" if title and company else (title or company)
                    if dates:
                        header += f" ({dates})"
                    lines.append(header)
                for bullet in exp.get('bullets', []):
                    lines.append(f"  • {bullet}")
            lines.append('')
        
        # Projects
        if parsed_resume.get('projects'):
            lines.append('PROJECTS')
            for proj in parsed_resume['projects']:
                name = proj.get('name', '')
                context = proj.get('context', '')
                if name:
                    header = name
                    if context:
                        header += f" ({context})"
                    lines.append(header)
                for bullet in proj.get('bullets', []):
                    lines.append(f"  • {bullet}")
            lines.append('')
        
        # Education
        if parsed_resume.get('education'):
            lines.append('EDUCATION')
            for edu in parsed_resume['education']:
                school = edu.get('school', '')
                degree = edu.get('degree', '')
                dates = edu.get('dates', '')
                if school or degree:
                    header = f"{degree} from {school}" if degree and school else (degree or school)
                    if dates:
                        header += f" ({dates})"
                    lines.append(header)
                for detail in edu.get('details', []):
                    lines.append(f"  • {detail}")
            lines.append('')
        
        # Skills
        if parsed_resume.get('skills'):
            skills = parsed_resume['skills']
            if isinstance(skills, dict):
                all_skills = []
                for category in ['languages', 'frameworks', 'tools', 'other']:
                    all_skills.extend(skills.get(category, []))
                if all_skills:
                    lines.append('SKILLS')
                    lines.append(', '.join(all_skills))
                    lines.append('')
            elif isinstance(skills, list):
                lines.append('SKILLS')
                lines.append(', '.join(skills))
                lines.append('')
        
        # Achievements
        if parsed_resume.get('achievements'):
            lines.append('ACHIEVEMENTS')
            for achievement in parsed_resume['achievements']:
                lines.append(f"  • {achievement}")
            lines.append('')
        
        return '\n'.join(lines)
    
    async def generate_edited_resume(
        self,
        user_resume: Dict[str, Any],
        resume_edits: List[ResumeEdit],
        format_type: str = "plain",
        user_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """Generate a complete edited resume with all edits applied."""
        # MIN_LEN constant
        MIN_LEN = 500
        
        # Generate request ID for tracing
        request_id = str(uuid.uuid4())[:8]
        
        # Check if payload resume is allowed (only via debug flag)
        allow_payload_resume = user_resume.get('_debug_allow_payload_resume', False)
        if not allow_payload_resume:
            # Enforce canonical resume only - ignore payload resume
            logger.info(f"[ApplicationLab] Enforcing canonical resume only (user_id={user_id[:8] if user_id else 'unknown'}..., request_id={request_id})")
        
        # INVARIANT: If resumeText exists and length >= MIN_LEN, it is the ONLY source of truth
        # FAIL-FAST: Validate and load resume text before any expensive operations
        raw_resume_text, source, resume_trace = await self._get_resume_text_from_payload_or_firestore(
            user_resume, user_id, request_id=request_id, allow_payload_resume=allow_payload_resume
        )
        
        # Log initial resume trace
        logger.info(f"[ApplicationLab] RESUME_TRACE_START request_id={request_id} {resume_trace}")
        
        # Validate canonical resume exists
        if not raw_resume_text or len(raw_resume_text.strip()) < MIN_LEN:
            canonical_data = self._fetch_canonical_resume_data(user_id) if user_id else {}
            filename = canonical_data.get('resumeFileName', 'unknown')
            error_msg = (
                f"Canonical resume not found or too short ({len(raw_resume_text) if raw_resume_text else 0} chars, minimum {MIN_LEN} required). "
                f"Please re-upload your original resume in Account Settings. "
                f"Current resume file: {filename}"
            )
            logger.error(f"[ApplicationLab] {error_msg} (request_id={request_id})")
            raise ValueError(error_msg)
        
        self._validate_resume_text(raw_resume_text)
        
        resume_text_len = len(raw_resume_text.strip()) if raw_resume_text else 0
        has_valid_resume_text = raw_resume_text and resume_text_len >= MIN_LEN
        
        # HARD GUARD: If resumeText exists and valid, forbid reconstruction path entirely
        if has_valid_resume_text:
            # Log that we're using resumeText as source of truth
            logger.info("[AppLab] resume_source=%s resume_len=%d edits=%d path=FORMAT", 
                       source, resume_text_len, len(resume_edits))
            
            # Ensure resume_text is in user_resume for parsing
            if 'resumeText' not in user_resume:
                user_resume['resumeText'] = raw_resume_text
        else:
            logger.error("[AppLab] Invalid resume text - resume_len=%d (minimum %d required)", 
                        resume_text_len, MIN_LEN)
            raise ValueError(
                f"Resume text is missing or too short ({resume_text_len} chars, minimum {MIN_LEN} required). "
                "Please re-upload your resume in Account Settings."
            )
        
        # Log request entry
        logger.info("application_lab.generate_edited_resume.request", extra={
            "user_id": user_id[:8] if user_id else None,
            "resume_text_len": resume_text_len,
            "resume_source": source,
            "num_edits": len(resume_edits),
            "format": format_type,
        })
        
        # INVARIANT: Since resumeText exists and is valid, DO NOT reconstruct text
        # DO NOT re-fetch from Firestore - we already have it
        
        # Parse resume for structured editing (but we'll use resumeText for formatting)
        parsed_resume = await self._scout._parse_resume_structured(user_resume)
        
        # Log after parsing
        parse_trace = make_resume_trace(
            uid=user_id,
            request_id=request_id,
            phase='after_parsing',
            resume_text=raw_resume_text,
            parsed_resume=parsed_resume,
            resume_file_name=resume_trace.get('resume_file_name'),
            source=source
        )
        logger.info(f"[ApplicationLab] RESUME_TRACE {parse_trace}")
        
        # Ensure raw_text is preserved in parsed_resume (but don't use it as source - use resumeText)
        # Also ensure resumeText is available for conversion functions
        if raw_resume_text:
            if 'raw_text' not in parsed_resume:
                parsed_resume['raw_text'] = raw_resume_text
            if 'resumeText' not in parsed_resume:
                parsed_resume['resumeText'] = raw_resume_text
            if 'rawText' not in parsed_resume:
                parsed_resume['rawText'] = raw_resume_text
        
        # NORMALIZATION PASS: Clean and deduplicate parsed resume before assembly
        # This runs AFTER parsing and BEFORE edits are applied
        parsed_resume, normalization_debug = self.normalize_resume_sections(parsed_resume, raw_resume_text)
        
        # Log after normalization
        norm_trace = make_resume_trace(
            uid=user_id,
            request_id=request_id,
            phase='after_normalization',
            resume_text=raw_resume_text,
            parsed_resume=parsed_resume,
            resume_file_name=resume_trace.get('resume_file_name'),
            source=source
        )
        logger.info(f"[ApplicationLab] RESUME_TRACE {norm_trace}")
        
        # Log normalization confidence
        user_id_prefix = user_id[:8] if user_id else 'unknown'
        logger.info(
            f"[ApplicationLab] user_id={user_id_prefix}... normalization_confidence={normalization_debug['confidence']} "
            f"reasons={normalization_debug['reasons']} metrics={normalization_debug['metrics']}"
        )
        
        # Check if parsing was marked as incomplete
        parse_incomplete = parsed_resume.get("_parse_incomplete", False)
        
        # REWRITTEN LOGIC: Only allow apply_edits_to_raw_text() if ALL conditions met:
        # a) resumeText exists (already validated above) AND
        # b) parsed resume failed (parse_incomplete) AND
        # c) resume_edits <= 3 AND
        # d) resumeText length >= 1500
        # Otherwise, use deterministic section-based formatting
        can_use_raw_edit = (
            has_valid_resume_text and
            parse_incomplete and
            resume_edits and
            len(resume_edits) <= 3 and
            resume_text_len >= 1500
        )
        
        if can_use_raw_edit:
            # Only path that uses apply_edits_to_raw_text - with strict conditions
            logger.info("[AppLab] resume_source=%s resume_len=%d edits=%d path=RAW_EDIT (parse_incomplete=True, edits<=3, len>=1500)", 
                       source, resume_text_len, len(resume_edits))
            try:
                edited_raw_text = await self.apply_edits_to_raw_text(raw_resume_text, resume_edits)
                # Create minimal normalization debug for raw edit path
                normalization_debug_minimal = {
                    "confidence": 0.85,  # Lower confidence for raw edit path
                    "reasons": ["raw_text_edit_path"],
                    "metrics": {
                        "inline_headers_stripped": 0,
                        "skills_parsed_from_string": False,
                        "mid_string_splits": 0,
                        "dedup_removed": {},
                        "input_len": len(raw_resume_text),
                        "output_len": len(edited_raw_text)
                    }
                }
                result = {
                    "structured": parsed_resume,
                    "format": format_type if format_type != "pdf" else "plain",
                    "formatted_text": edited_raw_text,
                    "_edits_applied": True,
                    "_parse_incomplete": True,
                    "normalization": normalization_debug_minimal
                }
                logger.info(f"[ApplicationLab] Successfully applied {len(resume_edits)} edits to raw text")
                return result
            except Exception as e:
                error_msg = f"Failed to apply edits to raw text: {str(e)}"
                logger.error(f"[ApplicationLab] {error_msg}")
                raise ValueError(error_msg)
        
        # If parsing incomplete but conditions not met for raw edit, use structured formatting
        if parse_incomplete:
            logger.warning(f"[ApplicationLab] Parse incomplete but using structured formatting (edits={len(resume_edits)}, len={resume_text_len})")
            # Continue to structured resume application below
        
        # REWRITTEN: missing_all_critical logic
        # Missing parsed sections ≠ missing resume text
        # If resumeText exists (which it does - validated above), prefer deterministic section-based formatting
        # DO NOT apply edits to raw text based on missing sections alone
        
        # Apply edits to structured resume
        edited_resume = self._scout.apply_resume_edits(parsed_resume, resume_edits)
        
        # STRICT VALIDATION: Block only if output is fundamentally broken
        # Check for empty, null, or malformed output
        if not edited_resume or not isinstance(edited_resume, dict):
            raise ValueError("Invalid resume output: output is empty or not a dictionary")
        
        # Check for extremely short content (less than 100 chars total)
        total_content_length = 0
        for key, value in edited_resume.items():
            if key.startswith('_'):
                continue  # Skip metadata keys
            if isinstance(value, str):
                total_content_length += len(value)
            elif isinstance(value, list):
                for item in value:
                    if isinstance(item, dict):
                        for sub_key, sub_value in item.items():
                            if isinstance(sub_value, str):
                                total_content_length += len(sub_value)
                            elif isinstance(sub_value, list):
                                total_content_length += sum(len(str(v)) for v in sub_value if isinstance(v, str))
                    elif isinstance(item, str):
                        total_content_length += len(item)
        
        if total_content_length < 100:
            raise ValueError(
                f"Invalid resume output: output is too short ({total_content_length} chars, minimum 100 required). "
                "This indicates the AI output is fundamentally broken."
            )
        
        # Mark that edits were applied
        edited_resume["_edits_applied"] = True
        
        # Ensure raw_text is preserved (but we use resumeText, not this)
        if raw_resume_text and 'raw_text' not in edited_resume:
            edited_resume['raw_text'] = raw_resume_text
        
        # Check sections for validation
        has_experience = bool(edited_resume.get("experience"))
        has_education = bool(edited_resume.get("education"))
        has_projects = bool(edited_resume.get("projects"))
        has_summary = bool(edited_resume.get("summary"))
        
        # Log path decision
        logger.info("[AppLab] resume_source=%s resume_len=%d edits=%d path=FORMAT (structured resume with deterministic formatting)", 
                   source, resume_text_len, len(resume_edits))
        
        # REMOVED: The missing_all_critical → apply_edits_to_raw_text path
        # Reason: Missing parsed sections doesn't mean resume text is missing
        # If resumeText exists, we should format it deterministically, not patch via LLM
        
        # Check input for sections to determine if merge is needed
        input_lower = raw_resume_text.lower()
        input_has_education = any(term in input_lower for term in ['education', 'university', 'degree', 'bachelor', 'master', 'phd', 'college', 'school'])
        input_has_experience = any(term in input_lower for term in ['experience', 'work', 'employment', 'intern', 'position', 'role', 'job'])
        
        # NON-DESTRUCTIVE MERGE: If sections are missing, merge from original instead of failing
        if (input_has_education and not has_education) or (input_has_experience and not has_experience):
            # Merge missing sections from original resume
            edited_resume = self._merge_missing_sections(edited_resume, parsed_resume)
            # Re-check after merge
            has_experience = bool(edited_resume.get("experience"))
            has_education = bool(edited_resume.get("education"))
        
        # Log what sections exist before assembly
        original_sections = {s: bool(parsed_resume.get(s)) for s in ['summary', 'experience', 'education', 'projects', 'skills', 'achievements']}
        edited_sections_before = {s: bool(edited_resume.get(s)) for s in ['summary', 'experience', 'education', 'projects', 'skills', 'achievements']}
        logger.warning(
            f"[ApplicationLab] Before assembly - Original sections: {original_sections}, "
            f"Edited sections: {edited_sections_before}"
        )
        
        # Check if critical sections are missing - this is a red flag
        if original_sections.get('experience') and not edited_sections_before.get('experience'):
            logger.error(
                f"[ApplicationLab] CRITICAL: Experience section was in original but missing in edited resume! "
                f"This indicates edits may have dropped the section."
            )
        
        # ASSEMBLE COMPLETE RESUME: Ensure ALL original sections are included
        # This prevents unedited sections from being dropped during formatting
        # Pass raw_resume_text as fallback for extracting missing sections
        complete_resume = self._assemble_complete_resume(edited_resume, parsed_resume, raw_resume_text)
        
        # Log what sections exist after assembly
        complete_sections = {s: bool(complete_resume.get(s)) for s in ['summary', 'experience', 'education', 'projects', 'skills', 'achievements']}
        logger.warning(f"[ApplicationLab] After assembly - Complete sections: {complete_sections}")
        
        # Final check - warn if critical sections are still missing
        if not complete_sections.get('experience') and input_has_experience:
            # DEBUG: Log raw resume text and section headers before the critical error
            debug_info = []
            
            # 1. First 1000 characters of raw resume text
            if raw_resume_text:
                first_1000 = raw_resume_text[:1000]
                debug_info.append(f"First 1000 chars of raw text:\n{first_1000}")
            else:
                debug_info.append("raw_resume_text is None or empty")
            
            # 2. Search for section headers in the text
            if raw_resume_text:
                # Common section header patterns (case-insensitive)
                section_patterns = [
                    r'(?i)^\s*(?:experience|work\s+experience|employment|work\s+history|professional\s+experience|career)',
                    r'(?i)^\s*(?:education|academic|university|school)',
                    r'(?i)^\s*(?:projects|project)',
                    r'(?i)^\s*(?:skills|technical\s+skills|competencies)',
                    r'(?i)^\s*(?:summary|objective|profile)',
                    r'(?i)^\s*(?:achievements|accomplishments)',
                ]
                
                found_headers = []
                lines = raw_resume_text.split('\n')
                for i, line in enumerate(lines[:100]):  # Check first 100 lines
                    line_stripped = line.strip()
                    if not line_stripped:
                        continue
                    
                    # Check if line matches any section pattern
                    for pattern in section_patterns:
                        if re.match(pattern, line_stripped):
                            # Extract the header name
                            header_match = re.search(r'(?i)(experience|work|employment|education|projects|skills|summary|achievements)', line_stripped)
                            if header_match:
                                header_name = header_match.group(1).lower()
                                found_headers.append(f"Line {i+1}: '{line_stripped[:80]}' (matched: {header_name})")
                            else:
                                found_headers.append(f"Line {i+1}: '{line_stripped[:80]}'")
                            break
                
                if found_headers:
                    debug_info.append(f"Found section headers:\n" + "\n".join(found_headers[:20]))  # Limit to first 20
                else:
                    debug_info.append("No section headers found matching common patterns")
            else:
                debug_info.append("Cannot search for section headers - raw_resume_text is None")
            
            # Log all debug info
            logger.debug(
                f"[ApplicationLab] DEBUG before CRITICAL error:\n" + "\n---\n".join(debug_info)
            )
            
            logger.error(
                f"[ApplicationLab] CRITICAL: Experience section is still missing after assembly! "
                f"Raw text has experience keywords but section wasn't extracted or preserved."
            )
        
        # Format resume using standardized template (not preserving original formatting)
        # The template generates a clean, professional, ATS-friendly PDF with consistent structure
        formatted_text = None
        result_pdf_base64 = None
        if format_type == "pdf":
            # Use template-based PDF generation (standardized format, not original formatting)
            pdf_bytes = self._scout.format_resume_pdf(complete_resume)
            if pdf_bytes:
                import base64
                result_pdf_base64 = base64.b64encode(pdf_bytes).decode('utf-8')
                formatted_text = self._scout.format_resume_text(complete_resume, "plain")
            else:
                raise ValueError("Failed to generate PDF")
        else:
            formatted_text = self._scout.format_resume_text(complete_resume, format_type)
        
        # Calculate normalization confidence score (0-100) - must be done after formatting
        confidence_score = calculate_normalization_confidence(
            parsed_resume=complete_resume,
            raw_text=raw_resume_text,
            formatted_output=formatted_text,
            input_length=len(raw_resume_text.strip()) if raw_resume_text else None,
            edits_applied=bool(resume_edits)
        )
        
        # Format based on requested format
        result = {
            "structured": complete_resume,
            "format": format_type,
            "normalization": normalization_debug,  # Include normalization debug info
            "formatted_text": formatted_text
        }
        
        # Add PDF base64 if PDF format was requested
        if format_type == "pdf" and result_pdf_base64:
            result["pdf_base64"] = result_pdf_base64
        
        # Add normalization score to response if DEBUG mode or always (for visibility)
        import os
        if os.getenv('DEBUG_RESUME_TRACE', 'false').lower() == 'true' or True:  # Always include for now
            result["normalization_score"] = confidence_score
        
        result["resume_trace"] = {
            "request_id": request_id,
            "resume_source": source,
            "resume_file_name": resume_trace.get('resume_file_name'),
            "input_length": len(raw_resume_text.strip()) if raw_resume_text else 0,
            "output_length": len(formatted_text.strip()) if formatted_text else 0,
        }
        
        # Update output length in normalization metrics and recalculate confidence if needed
        if formatted_text and raw_resume_text:
            formatted_length = len(formatted_text.strip())
            input_length = len(raw_resume_text.strip())
            normalization_debug["metrics"]["output_len"] = formatted_length
            
            # If formatted output < 60% of input length, penalize confidence
            if formatted_length < (input_length * 0.6):
                normalization_debug["confidence"] = max(0.0, normalization_debug["confidence"] - 0.20)
                normalization_debug["reasons"].append("output_length_too_short")
                normalization_debug["confidence"] = round(normalization_debug["confidence"], 2)
                logger.warning(f"[ApplicationLab] WARNING: Formatted output ({formatted_length} chars) is < 60% of input ({input_length} chars)")
            
            # Log final normalization confidence after formatting
            user_id_prefix = user_id[:8] if user_id else 'unknown'
            logger.info(
                f"[ApplicationLab] user_id={user_id_prefix}... normalization_confidence={normalization_debug['confidence']} "
                f"reasons={normalization_debug['reasons']} metrics={normalization_debug['metrics']}"
            )
            
            # Log normalization score (0-100)
            logger.info(
                f"[ApplicationLab] NORMALIZATION_SCORE request_id={request_id} "
                f"score={confidence_score['normalization_score']} "
                f"warnings={confidence_score['warnings']} "
                f"breakdown={confidence_score['score_breakdown']}"
            )
            
            # Log final trace
            final_trace = make_resume_trace(
                uid=user_id,
                request_id=request_id,
                phase='after_formatting',
                resume_text=raw_resume_text,
                parsed_resume=complete_resume,
                resume_file_name=resume_trace.get('resume_file_name'),
                source=source,
                raw_text=formatted_text
            )
            final_trace['input_length'] = input_length
            final_trace['output_length'] = formatted_length
            final_trace['normalization_score'] = confidence_score['normalization_score']
            logger.info(f"[ApplicationLab] RESUME_TRACE_END {final_trace}")
            
            # Edit Visibility Check - confirm edits appear in output
            if resume_edits:
                edit_keywords = []
                for edit in resume_edits:
                    if edit.suggested_content:
                        # Extract key terms from suggested content (words > 4 chars)
                        keywords = [w for w in edit.suggested_content.split() if len(w) > 4]
                        edit_keywords.extend(keywords[:3])  # Top 3 keywords per edit
                
                # Verify at least some edit keywords appear in output
                if edit_keywords:
                    matches = sum(1 for kw in edit_keywords if kw.lower() in formatted_text.lower())
                    match_ratio = matches / len(edit_keywords) if edit_keywords else 0
                    if match_ratio < 0.3:  # At least 30% of edit keywords should be visible
                        print(f"[ApplicationLab] WARNING: Only {matches}/{len(edit_keywords)} edit keywords found in output (match ratio: {match_ratio:.2f})")
                    else:
                        print(f"[ApplicationLab] Edit visibility check passed: {matches}/{len(edit_keywords)} keywords found")
        
        return result


    def test_normalization(self) -> Dict[str, Any]:
        """
        Dev-only test function to verify normalization works correctly.
        Tests known problematic patterns:
        1) skills = "Other:{'technical': ['Python','Java']}"
        2) projects bullet = "PROJECTS AND RESEARCH • Wordle Solver..."
        3) projects bullet contains "EXTRA CURRICULAR • Soccer..."
        """
        test_cases = []
        
        # Test case 1: Skills as dict string with "Other:" prefix
        test_resume_1 = {
            "skills": "Other:{'technical': ['Python', 'Java']}",
            "projects": [
                {
                    "name": "Test Project",
                    "bullets": ["Normal bullet point"]
                }
            ]
        }
        normalized_1, debug_1 = self.normalize_resume_sections(test_resume_1, None)
        test_cases.append({
            "test": "skills_dict_string_with_other_prefix",
            "input_skills": test_resume_1["skills"],
            "output_skills": normalized_1.get("skills"),
            "confidence": debug_1["confidence"],
            "reasons": debug_1["reasons"],
            "passed": isinstance(normalized_1.get("skills"), dict) and "other" not in str(normalized_1.get("skills", {})).lower()
        })
        
        # Test case 2: Projects bullet with inline header
        test_resume_2 = {
            "projects": [
                {
                    "name": "Wordle Solver",
                    "bullets": ["PROJECTS AND RESEARCH • Wordle Solver implementation using Python"]
                }
            ]
        }
        normalized_2, debug_2 = self.normalize_resume_sections(test_resume_2, None)
        bullets_2 = normalized_2.get("projects", [{}])[0].get("bullets", [])
        test_cases.append({
            "test": "projects_bullet_inline_header",
            "input_bullet": test_resume_2["projects"][0]["bullets"][0],
            "output_bullet": bullets_2[0] if bullets_2 else None,
            "confidence": debug_2["confidence"],
            "reasons": debug_2["reasons"],
            "passed": bullets_2 and "PROJECTS AND RESEARCH" not in bullets_2[0]
        })
        
        # Test case 3: Projects bullet with section boundary
        test_resume_3 = {
            "projects": [
                {
                    "name": "Test Project",
                    "bullets": ["Some project detail. EXTRA CURRICULAR • Soccer team captain"]
                }
            ]
        }
        normalized_3, debug_3 = self.normalize_resume_sections(test_resume_3, None)
        bullets_3 = normalized_3.get("projects", [{}])[0].get("bullets", [])
        extras_3 = normalized_3.get("extras", [])
        test_cases.append({
            "test": "projects_bullet_section_boundary",
            "input_bullet": test_resume_3["projects"][0]["bullets"][0],
            "output_bullet": bullets_3[0] if bullets_3 else None,
            "extras_routed": extras_3,
            "confidence": debug_3["confidence"],
            "reasons": debug_3["reasons"],
            "passed": bullets_3 and "EXTRA CURRICULAR" not in bullets_3[0] and len(extras_3) > 0
        })
        
        return {
            "test_results": test_cases,
            "all_passed": all(tc["passed"] for tc in test_cases)
        }


# Singleton instance
application_lab_service = ApplicationLabService()

