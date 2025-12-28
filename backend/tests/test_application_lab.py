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
    
    with patch('app.services.application_lab_service.get_db') as mock_get_db:
        mock_get_db.return_value = None
        
        with pytest.raises(ValueError) as exc_info:
            await application_lab_service.generate_edited_resume(
                user_resume=user_resume,
                resume_edits=resume_edits,
                user_id="test_user"
            )
        
        assert "resume text is missing" in str(exc_info.value).lower()
        # Verify no OpenAI call was made (should fail before reaching that point)
        assert not hasattr(application_lab_service, '_openai') or application_lab_service._openai is None


@pytest.mark.asyncio
async def test_generate_edited_resume_resume_text_too_short():
    """Test that resumeText < 500 chars returns 400 error (no LLM call)."""
    user_resume = {
        "resumeText": "Short text",  # < 500 chars
        "resumeParsed": {"summary": "Test"}
    }
    resume_edits = sample_resume_edits
    
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
    """Test successful resume generation with valid resumeText."""
    user_resume = {
        "resumeText": "John Doe\nSoftware Engineer\n5 years experience\nPython, JavaScript\n" * 20,  # > 500 chars
        "resumeParsed": {
            "summary": "Experienced software engineer",
            "experience": [{"title": "Engineer", "company": "Tech Co", "bullets": ["Built apps"]}]
        }
    }
    resume_edits = sample_resume_edits
    
    # Mock OpenAI response
    mock_completion = AsyncMock()
    mock_completion.choices = [Mock(message=Mock(content="Edited resume text"))]
    mock_completion.usage = Mock(total_tokens=100)
    
    with patch('app.services.application_lab_service.get_async_openai_client') as mock_openai:
        mock_client = AsyncMock()
        mock_client.chat.completions.create = AsyncMock(return_value=mock_completion)
        mock_openai.return_value = mock_client
        
        # Mock scout service parse
        with patch.object(application_lab_service._scout, '_parse_resume_structured') as mock_parse:
            mock_parse.return_value = {
                "summary": "Test",
                "experience": [{"title": "Engineer", "company": "Tech Co", "bullets": ["Built apps"]}],
                "_parse_incomplete": False
            }
            
            # Mock apply_resume_edits
            with patch.object(application_lab_service._scout, 'apply_resume_edits') as mock_apply:
                mock_apply.return_value = {
                    "summary": "Test",
                    "experience": [{"title": "Engineer", "company": "Tech Co", "bullets": ["Built apps", "New bullet point"]}]
                }
                
                # Mock format_resume_text
                with patch.object(application_lab_service._scout, 'format_resume_text') as mock_format:
                    mock_format.return_value = "Formatted resume text"
                    
                    result = await application_lab_service.generate_edited_resume(
                        user_resume=user_resume,
                        resume_edits=resume_edits,
                        format_type="plain",
                        user_id="test_user"
                    )
                    
                    assert "formatted_text" in result
                    assert result["formatted_text"] == "Formatted resume text"


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
        
        # Mock PyPDF2
        with patch('PyPDF2.PdfReader') as mock_pdf_reader:
            mock_reader = Mock()
            mock_page = Mock()
            mock_page.extract_text.return_value = "Extracted resume text with sufficient length " * 20  # > 500 chars
            mock_reader.pages = [mock_page]
            mock_pdf_reader.return_value = mock_reader
            
            # Mock Firestore update
            with patch('app.services.application_lab_service.get_db') as mock_get_db:
                mock_db = Mock()
                mock_get_db.return_value = mock_db
                
                resume_text, needs_ocr = await application_lab_service._backfill_resume_text_from_resume_url(
                    user_id, resume_url
                )
                
                assert resume_text is not None
                assert len(resume_text) >= 500
                assert needs_ocr is False
                # Verify Firestore update was called
                mock_db.collection.return_value.document.return_value.update.assert_called_once()


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
        
        # Mock PyPDF2 - return empty text (scanned PDF)
        with patch('PyPDF2.PdfReader') as mock_pdf_reader:
            mock_reader = Mock()
            mock_page = Mock()
            mock_page.extract_text.return_value = ""  # Empty - scanned PDF
            mock_reader.pages = [mock_page]
            mock_pdf_reader.return_value = mock_reader
            
            # Mock Firestore update
            with patch('app.services.application_lab_service.get_db') as mock_get_db:
                mock_db = Mock()
                mock_get_db.return_value = mock_db
                
                resume_text, needs_ocr = await application_lab_service._backfill_resume_text_from_resume_url(
                    user_id, resume_url
                )
                
                assert resume_text is None
                assert needs_ocr is True
                # Verify resumeNeedsOCR was set
                update_call = mock_db.collection.return_value.document.return_value.update
                update_call.assert_called_once()
                call_args = update_call.call_args[0][0]
                assert call_args.get('resumeNeedsOCR') is True


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
    mock_completion = AsyncMock()
    mock_completion.choices = [Mock(message=Mock(content="Edited resume text"))]
    mock_completion.usage = Mock(total_tokens=100)
    
    with patch('app.services.application_lab_service.get_async_openai_client') as mock_openai:
        mock_client = AsyncMock()
        mock_client.chat.completions.create = AsyncMock(return_value=mock_completion)
        mock_openai.return_value = mock_client
        
        result = await application_lab_service.apply_edits_to_raw_text(raw_text, resume_edits)
        
        # Should have called OpenAI twice (3 edits + 2 edits)
        assert mock_client.chat.completions.create.call_count == 2
        assert result == "Edited resume text"  # Second call result


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
    
    with patch('app.services.application_lab_service.get_db') as mock_get_db:
        mock_get_db.return_value = None
        
        result = await application_lab_service.analyze_job_fit(
            job=job,
            user_resume=user_resume,
            user_id="test_user"
        )
        
        assert result["status"] == "error"
        assert "resume text" in result["message"].lower()


if __name__ == "__main__":
    pytest.main([__file__, "-v"])

