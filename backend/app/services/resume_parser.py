"""
Resume parser service - extract text from PDF, DOCX, and DOC files
"""
import os
import tempfile
import pdfplumber
from app.services.docx_service import extract_text_from_docx


def extract_text_from_pdf(pdf_file):
    """Extract text from PDF using pdfplumber with improved encoding handling"""
    try:
        print("Extracting text from PDF...")

        with tempfile.NamedTemporaryFile(delete=False, suffix='.pdf') as temp_file:
            pdf_file.save(temp_file.name)

            text = ""
            with pdfplumber.open(temp_file.name) as pdf:
                for page in pdf.pages:
                    page_text = page.extract_text()
                    # Clean and encode the text properly
                    if page_text:
                        # Remove non-printable characters and fix encoding issues
                        cleaned_text = ''.join(char for char in page_text if char.isprintable() or char.isspace())
                        # Normalize unicode characters
                        cleaned_text = cleaned_text.encode('utf-8', errors='ignore').decode('utf-8')
                        text += cleaned_text + "\n"

            os.unlink(temp_file.name)

            # Final cleanup - remove extra whitespace and normalize
            text = ' '.join(text.split())

            print(f"Extracted {len(text)} characters from PDF")
            return text.strip() if text.strip() else None

    except Exception as e:
        print(f"PDF text extraction failed: {e}")
        return None


def extract_text_from_file(file, file_type: str):
    """
    Extract text from resume file (PDF, DOCX, or DOC).

    Args:
        file: File object from Flask request
        file_type: File extension ('pdf', 'docx', or 'doc')

    Returns:
        Extracted text or None if extraction failed
    """
    try:
        if file_type == 'pdf':
            return extract_text_from_pdf(file)

        elif file_type == 'docx':
            print("Extracting text from DOCX...")
            with tempfile.NamedTemporaryFile(delete=False, suffix='.docx') as temp_file:
                file.save(temp_file.name)
                text = extract_text_from_docx(temp_file.name)
                os.unlink(temp_file.name)

                if text:
                    # Final cleanup - remove extra whitespace and normalize
                    text = ' '.join(text.split())
                    print(f"Extracted {len(text)} characters from DOCX")
                    return text.strip() if text.strip() else None
                return None

        elif file_type == 'doc':
            # DOC files (old Word format) need conversion to DOCX first
            # For now, return an error message - conversion can be added later
            print("⚠️  DOC files require conversion. Please convert to DOCX first.")
            return None

        else:
            print(f"Unsupported file type: {file_type}")
            return None

    except Exception as e:
        print(f"Text extraction failed for {file_type}: {e}")
        import traceback
        traceback.print_exc()
        return None
