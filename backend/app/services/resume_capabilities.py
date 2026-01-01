"""
Resume capability detection and metadata management.
Determines what operations are possible based on file type.
"""

from typing import Dict, Any
from datetime import datetime


# Supported file extensions and their capabilities
FILE_CAPABILITIES = {
    'docx': {
        'canOptimizeWithFormatting': True,
        'canEditDirectly': True,
        'requiresConversion': False,
        'supportsTemplateRebuild': True,
        'recommendedMode': 'direct_edit',
    },
    'doc': {
        'canOptimizeWithFormatting': True,
        'canEditDirectly': False,
        'requiresConversion': True,
        'supportsTemplateRebuild': True,
        'recommendedMode': 'direct_edit',
    },
    'pdf': {
        'canOptimizeWithFormatting': False,
        'canEditDirectly': False,
        'requiresConversion': True,
        'supportsTemplateRebuild': True,
        'recommendedMode': 'suggestions',
    },
}

ALLOWED_EXTENSIONS = set(FILE_CAPABILITIES.keys())
ALLOWED_MIMETYPES = {
    'application/pdf': 'pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/msword': 'doc',
}


def get_file_extension(filename: str, mimetype: str = None) -> str:
    """Extract and validate file extension."""
    if '.' in filename:
        ext = filename.rsplit('.', 1)[-1].lower()
        if ext in ALLOWED_EXTENSIONS:
            return ext
    
    if mimetype and mimetype in ALLOWED_MIMETYPES:
        return ALLOWED_MIMETYPES[mimetype]
    
    return None


def get_capabilities(extension: str) -> Dict[str, Any]:
    """Get capabilities for a file extension."""
    return FILE_CAPABILITIES.get(extension, {
        'canOptimizeWithFormatting': False,
        'canEditDirectly': False,
        'requiresConversion': True,
        'supportsTemplateRebuild': True,
        'recommendedMode': 'suggestions',
    })


def build_resume_metadata(url: str, filename: str, extension: str) -> Dict[str, Any]:
    """
    Build complete resume metadata for Firestore storage.
    
    Frontend uses these capabilities to instantly determine what UX to show.
    """
    capabilities = get_capabilities(extension)
    
    return {
        'resumeUrl': url,
        'resumeFileName': filename,
        'resumeFileType': extension,
        'resumeUploadedAt': datetime.utcnow().isoformat(),
        'resumeCapabilities': {
            **capabilities,
            'availableModes': _get_available_modes(extension),
        }
    }


def _get_available_modes(extension: str) -> list:
    """Get list of available optimization modes for this file type."""
    modes = []
    
    if extension == 'docx':
        modes.append({
            'id': 'direct_edit',
            'name': 'Format-Preserving Optimization',
            'description': 'Optimize content while keeping your exact formatting, fonts, and layout.',
            'recommended': True,
            'preservesFormatting': True,
        })
    
    if extension in ['pdf', 'doc']:
        modes.append({
            'id': 'suggestions',
            'name': 'Suggestions Mode',
            'description': 'Get specific ATS improvements to apply yourself. Your original formatting stays intact.',
            'recommended': extension == 'pdf',
            'preservesFormatting': True,
        })
    
    modes.append({
        'id': 'template_rebuild',
        'name': 'Template Rebuild',
        'description': 'Rebuild your resume in a clean, ATS-optimized template with fully optimized content.',
        'recommended': False,
        'preservesFormatting': False,
    })
    
    return modes


def is_valid_resume_file(filename: str, mimetype: str = None) -> bool:
    """Check if file is a valid resume format."""
    return get_file_extension(filename, mimetype) is not None

