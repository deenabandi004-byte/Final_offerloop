// Constants for resume file uploads
export const ACCEPTED_RESUME_TYPES = {
  extensions: '.pdf,.docx,.doc',
  mimeTypes: [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
  ],
  // Combined for input accept attribute
  accept: '.pdf,.docx,.doc,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword',
};

export const ALLOWED_RESUME_EXTENSIONS = ['pdf', 'docx', 'doc'];

export function isValidResumeFile(file: File): boolean {
  const extension = file.name.split('.').pop()?.toLowerCase();
  return ALLOWED_RESUME_EXTENSIONS.includes(extension || '');
}

export function getResumeFileExtension(file: File): string | null {
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (ALLOWED_RESUME_EXTENSIONS.includes(extension || '')) {
    return extension || null;
  }
  return null;
}

