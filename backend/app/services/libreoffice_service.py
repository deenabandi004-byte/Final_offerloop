"""
PDF/DOCX conversion service
Uses pdf2docx for PDF→DOCX (cross-platform, no system deps)
Uses LibreOffice for DOCX→PDF (more reliable for formatting)
"""
import os
import subprocess
import shutil
from pathlib import Path
from typing import Optional

# Try to import pdf2docx
try:
    from pdf2docx import Converter
    PDF2DOCX_AVAILABLE = True
except ImportError:
    PDF2DOCX_AVAILABLE = False
    print("[Warning] pdf2docx not installed. PDF to DOCX conversion may fail.")


def check_libreoffice_installed() -> bool:
    """Check if LibreOffice is available (needed for DOCX→PDF)."""
    libreoffice_path = shutil.which('libreoffice')
    soffice_path = shutil.which('soffice')
    
    if libreoffice_path:
        print(f"[LibreOffice] Found libreoffice at: {libreoffice_path}")
        return True
    elif soffice_path:
        print(f"[LibreOffice] Found soffice at: {soffice_path}")
        return True
    else:
        print("[LibreOffice] ❌ LibreOffice not found in PATH")
        print("[LibreOffice] Checked for: 'libreoffice' and 'soffice'")
        return False


def get_libreoffice_command() -> Optional[str]:
    """Get the LibreOffice command (libreoffice or soffice)."""
    if shutil.which('libreoffice'):
        return 'libreoffice'
    elif shutil.which('soffice'):
        return 'soffice'
    else:
        return None


def convert_pdf_to_docx(pdf_path: str, output_dir: Optional[str] = None) -> Optional[str]:
    """
    Convert PDF to DOCX.
    
    Uses pdf2docx library (cross-platform, no system dependencies).
    Falls back to LibreOffice if pdf2docx fails.
    
    Args:
        pdf_path: Path to input PDF file
        output_dir: Directory for output (defaults to same directory as PDF)
    
    Returns:
        Path to generated DOCX file, or None if conversion failed
    """
    try:
        if output_dir is None:
            output_dir = os.path.dirname(pdf_path)
        
        # Ensure output directory exists
        os.makedirs(output_dir, exist_ok=True)
        
        pdf_name = Path(pdf_path).stem
        docx_path = os.path.join(output_dir, f"{pdf_name}.docx")
        
        # Method 1: Use pdf2docx (preferred - cross-platform)
        if PDF2DOCX_AVAILABLE:
            print(f"[PDF2DOCX] Converting {pdf_path} to DOCX...")
            try:
                cv = Converter(pdf_path)
                cv.convert(docx_path, start=0, end=None)
                cv.close()
                
                if os.path.exists(docx_path):
                    file_size = os.path.getsize(docx_path)
                    print(f"[PDF2DOCX] ✅ Success: {docx_path} ({file_size} bytes)")
                    return docx_path
                else:
                    print(f"[PDF2DOCX] ❌ Output file not created")
            except Exception as e:
                print(f"[PDF2DOCX] ❌ Error: {e}")
                import traceback
                traceback.print_exc()
        
        # Method 2: Fallback to LibreOffice (may not work on macOS)
        print("[PDF2DOCX] Falling back to LibreOffice...")
        return _convert_pdf_to_docx_libreoffice(pdf_path, output_dir)
        
    except Exception as e:
        print(f"[Converter] Error converting PDF to DOCX: {e}")
        import traceback
        traceback.print_exc()
        return None


def _convert_pdf_to_docx_libreoffice(pdf_path: str, output_dir: str) -> Optional[str]:
    """
    Convert PDF to DOCX using LibreOffice (fallback method).
    
    Note: Requires LibreOffice with PDF import filter installed.
    May not work on all systems (especially macOS default install).
    """
    try:
        soffice_cmd = get_libreoffice_command()
        if not soffice_cmd:
            print("[LibreOffice] Not found for PDF to DOCX conversion")
            return None
        
        pdf_name = Path(pdf_path).stem
        docx_path = os.path.join(output_dir, f"{pdf_name}.docx")
        
        # Try with infilter for PDF import
        cmd = [
            soffice_cmd,
            '--headless',
            '--infilter=writer_pdf_import',
            '--convert-to', 'docx',
            '--outdir', output_dir,
            pdf_path
        ]
        
        print(f"[LibreOffice] Command: {' '.join(cmd)}")
        
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=60
        )
        
        print(f"[LibreOffice] Return code: {result.returncode}")
        if result.stderr:
            print(f"[LibreOffice] stderr: {result.stderr}")
        
        if result.returncode != 0:
            print(f"[LibreOffice] ❌ Conversion failed")
            return None
        
        if os.path.exists(docx_path):
            print(f"[LibreOffice] ✅ Success: {docx_path}")
            return docx_path
        
        print(f"[LibreOffice] ❌ Output not found: {docx_path}")
        return None
        
    except subprocess.TimeoutExpired:
        print("[LibreOffice] Timeout")
        return None
    except Exception as e:
        print(f"[LibreOffice] Error: {e}")
        import traceback
        traceback.print_exc()
        return None


def convert_docx_to_pdf(docx_path: str, output_dir: Optional[str] = None) -> Optional[str]:
    """
    Convert DOCX to PDF using LibreOffice.
    
    LibreOffice is reliable for DOCX→PDF conversion on all platforms.
    
    Args:
        docx_path: Path to input DOCX file
        output_dir: Directory for output (defaults to same directory as DOCX)
    
    Returns:
        Path to generated PDF file, or None if conversion failed
    """
    try:
        if not check_libreoffice_installed():
            print("[LibreOffice] Not installed for DOCX to PDF conversion")
            return None
        
        if output_dir is None:
            output_dir = os.path.dirname(docx_path)
        
        # Ensure output directory exists
        os.makedirs(output_dir, exist_ok=True)
        
        # Get LibreOffice command
        libreoffice_cmd = get_libreoffice_command()
        if not libreoffice_cmd:
            print("[LibreOffice] Command not found")
            return None
        
        docx_name = Path(docx_path).stem
        pdf_path = os.path.join(output_dir, f"{docx_name}.pdf")
        
        # LibreOffice command
        cmd = [
            libreoffice_cmd,
            '--headless',
            '--convert-to', 'pdf',
            '--outdir', output_dir,
            docx_path
        ]
        
        print(f"[LibreOffice] Converting DOCX to PDF: {docx_path}")
        print(f"[LibreOffice] Command: {' '.join(cmd)}")
        
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=60
        )
        
        print(f"[LibreOffice] Return code: {result.returncode}")
        if result.stderr:
            print(f"[LibreOffice] stderr: {result.stderr}")
        
        if result.returncode != 0:
            print(f"[LibreOffice] ❌ Conversion failed")
            return None
        
        if os.path.exists(pdf_path):
            file_size = os.path.getsize(pdf_path)
            print(f"[LibreOffice] ✅ PDF created: {pdf_path} ({file_size} bytes)")
            return pdf_path
        
        print(f"[LibreOffice] ❌ PDF not found: {pdf_path}")
        return None
        
    except subprocess.TimeoutExpired:
        print("[LibreOffice] Conversion timed out")
        return None
    except Exception as e:
        print(f"[LibreOffice] Error converting DOCX to PDF: {e}")
        import traceback
        traceback.print_exc()
        return None
