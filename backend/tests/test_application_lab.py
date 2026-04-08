"""
Tests for Application Lab service - worst case scenarios
"""
import pytest
from unittest.mock import Mock, patch, AsyncMock, MagicMock
from app.services.application_lab_service import application_lab_service
from app.services.scout_service import ResumeEdit


@pytest.fixture
def mock_firestore_db():
    """Mock Firestore database."""
    db = Mock()
    user_doc = Mock()
    user_doc.exists = True
    user_doc.to_dict.return_value = {
        "resumeText": "Test resume text with sufficient length to pass validation. " * 20,  # ~500 chars
        "resumeUrl": "https://storage.example.com/resume.pdf",
        "resumeParsed": {"summary": "Test summary"}
    }
    db.collection.return_value.document.return_value.get.return_value = user_doc
    return db


@pytest.fixture
def sample_resume_edits():
    """Sample resume edits for testing."""
    return [
        ResumeEdit(
            id="1",
            section="Experience",
            edit_type="add",
            priority="high",
            impact="Addresses requirement",
            suggested_content="New bullet point",
            rationale="Matches job requirements",
            requirements_addressed=["Python experience"],
            keywords_added=["Python"]
        )
    ]


@pytest.mark.asyncio
async def test_generate_edited_resume_missing_resume_text():
    """Test that missing resumeText returns clear 400 error (no LLM call)."""
    user_resume = {
        "resumeText": None,
        "rawText": None,
        "resumeParsed": {"summary": "Test"}
    }
    resume_edits = [
        ResumeEdit(
            id="1",
            section="Experience",
            edit_type="add",
            priority="high",
            impact="Test",
            suggested_content="New content",
            rationale="Test",
            requirements_addressed=[],
            keywords_added=[]
        )
    ]

    with pytest.raises(ValueError) as exc_info:
        await application_lab_service.generate_edited_resume(
            user_resume=user_resume,
            resume_edits=resume_edits,
            user_id="test_user"
        )

    err = str(exc_info.value).lower()
    assert "resume" in err and ("missing" in err or "not found" in err or "too short" in err)


@pytest.mark.asyncio
async def test_generate_edited_resume_resume_text_too_short():
    """Test that resumeText < 500 chars returns 400 error (no LLM call)."""
    user_resume = {
        "resumeText": "Short text",  # < 500 chars
        "resumeParsed": {"summary": "Test"}
    }
    resume_edits = [
        ResumeEdit(
            id="1",
            section="Experience",
            edit_type="add",
            priority="high",
            impact="Test",
            suggested_content="New content",
            rationale="Test",
            requirements_addressed=[],
            keywords_added=[]
        )
    ]

    with pytest.raises(ValueError) as exc_info:
        await application_lab_service.generate_edited_resume(
            user_resume=user_resume,
            resume_edits=resume_edits,
            user_id="test_user"
        )

    assert "too short" in str(exc_info.value).lower()
    assert "500" in str(exc_info.value)


@pytest.mark.asyncio
async def test_generate_edited_resume_success():
    """Test successful resume generation returns edited text."""
    raw_text = "John Doe\nSoftware Engineer\n5 years experience\nPython, JavaScript\n" * 20  # > 500 chars
    user_resume = {
        "resumeText": raw_text,
        "resumeParsed": {
            "summary": "Experienced software engineer",
            "experience": [{"title": "Engineer", "company": "Tech Co", "bullets": ["Built apps"]}]
        }
    }
    resume_edits = [
        ResumeEdit(
            id="1",
            section="Experience",
            edit_type="add",
            priority="high",
            impact="Test",
            suggested_content="New content",
            rationale="Test",
            requirements_addressed=[],
            keywords_added=[]
        )
    ]

    # Mock the async OpenAI client used by _apply_edits_batch
    mock_completion = MagicMock()
    mock_completion.choices = [MagicMock(message=MagicMock(content="Edited resume text with improvements applied"))]
    mock_completion.usage = MagicMock(total_tokens=100)

    mock_client = AsyncMock()
    mock_client.chat.completions.create = AsyncMock(return_value=mock_completion)

    # Set the mock client directly on the service instance
    original_openai = application_lab_service._openai
    application_lab_service._openai = mock_client

    try:
        result = await application_lab_service.apply_edits_to_raw_text(raw_text, resume_edits)

        assert result is not None
        assert isinstance(result, str)
        assert len(result) > 0
    finally:
        application_lab_service._openai = original_openai


@pytest.mark.asyncio
async def test_backfill_resume_text_from_url_success():
    """Test backfilling resume text from resumeUrl."""
    user_id = "test_user"
    resume_url = "https://storage.example.com/resume.pdf"

    # Mock PDF download
    pdf_content = b"%PDF-1.4\nTest PDF content"

    with patch('httpx.AsyncClient') as mock_client_class:
        mock_response = Mock()
        mock_response.content = pdf_content
        mock_response.raise_for_status = Mock()

        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client.get = AsyncMock(return_value=mock_response)
        mock_client_class.return_value = mock_client

        # Mock pdfplumber
        with patch('pdfplumber.open') as mock_pdf_open:
            mock_page = Mock()
            mock_page.extract_text.return_value = "Extracted resume text with sufficient length " * 20  # > 500 chars
            mock_pdf = Mock()
            mock_pdf.pages = [mock_page]
            mock_pdf.__enter__ = Mock(return_value=mock_pdf)
            mock_pdf.__exit__ = Mock(return_value=False)
            mock_pdf_open.return_value = mock_pdf

            # Mock Firestore update via the lazy import path
            with patch('app.extensions.get_db') as mock_get_db:
                mock_db = Mock()
                mock_get_db.return_value = mock_db

                resume_text, needs_ocr = await application_lab_service._backfill_resume_text_from_resume_url(
                    user_id, resume_url
                )

                assert resume_text is not None
                assert len(resume_text) >= 500
                assert needs_ocr is False


@pytest.mark.asyncio
async def test_backfill_resume_text_scanned_pdf():
    """Test that scanned PDF (empty text) sets needs_ocr flag."""
    user_id = "test_user"
    resume_url = "https://storage.example.com/resume.pdf"

    # Mock PDF download
    pdf_content = b"%PDF-1.4\nScanned PDF"

    with patch('httpx.AsyncClient') as mock_client_class:
        mock_response = Mock()
        mock_response.content = pdf_content
        mock_response.raise_for_status = Mock()

        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client.get = AsyncMock(return_value=mock_response)
        mock_client_class.return_value = mock_client

        # Mock pdfplumber - return empty text (scanned PDF)
        with patch('pdfplumber.open') as mock_pdf_open:
            mock_page = Mock()
            mock_page.extract_text.return_value = ""  # Empty - scanned PDF
            mock_pdf = Mock()
            mock_pdf.pages = [mock_page]
            mock_pdf.__enter__ = Mock(return_value=mock_pdf)
            mock_pdf.__exit__ = Mock(return_value=False)
            mock_pdf_open.return_value = mock_pdf

            # Mock Firestore update via the lazy import path
            with patch('app.extensions.get_db') as mock_get_db:
                mock_db = Mock()
                mock_get_db.return_value = mock_db

                resume_text, needs_ocr = await application_lab_service._backfill_resume_text_from_resume_url(
                    user_id, resume_url
                )

                assert resume_text is None
                assert needs_ocr is True


@pytest.mark.asyncio
async def test_apply_edits_to_raw_text_batching():
    """Test that apply_edits_to_raw_text batches edits (max 3 per call)."""
    raw_text = "Resume text " * 200  # Long enough

    # Create 5 edits (should be batched into 2 calls)
    resume_edits = [
        ResumeEdit(
            id=str(i),
            section="Experience",
            edit_type="add",
            priority="high",
            impact="Test",
            suggested_content=f"Edit {i}",
            rationale="Test",
            requirements_addressed=[],
            keywords_added=[]
        )
        for i in range(5)
    ]

    # Mock OpenAI responses
    mock_completion = MagicMock()
    mock_completion.choices = [MagicMock(message=MagicMock(content="Edited resume text"))]
    mock_completion.usage = MagicMock(total_tokens=100)

    mock_client = AsyncMock()
    mock_client.chat.completions.create = AsyncMock(return_value=mock_completion)

    # Set the mock client directly on the service instance
    original_openai = application_lab_service._openai
    application_lab_service._openai = mock_client

    try:
        result = await application_lab_service.apply_edits_to_raw_text(raw_text, resume_edits)

        # Should have called OpenAI twice (3 edits + 2 edits)
        assert mock_client.chat.completions.create.call_count == 2
        assert result == "Edited resume text"  # Second call result
    finally:
        application_lab_service._openai = original_openai


@pytest.mark.asyncio
async def test_analyze_job_fit_missing_resume_text():
    """Test that analyze_job_fit fails fast if resumeText missing."""
    job = {
        "title": "Software Engineer",
        "company": "Tech Co",
        "url": "https://example.com/job"
    }
    user_resume = {
        "resumeText": None,
        "rawText": None
    }

    with pytest.raises(ValueError) as exc_info:
        await application_lab_service.analyze_job_fit(
            job=job,
            user_resume=user_resume,
            user_id="test_user"
        )

    err = str(exc_info.value).lower()
    assert "resume" in err


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
