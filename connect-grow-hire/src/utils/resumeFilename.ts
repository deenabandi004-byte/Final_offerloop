import type { ParsedResume } from '@/types/resume';

/**
 * Clean a string for use in a filename: replace spaces with underscores, remove special characters,
 * collapse multiple underscores.
 */
const cleanFilename = (name: string): string =>
  name.replace(/[^a-zA-Z0-9_\-]/g, '_').replace(/_+/g, '_');

/**
 * Build a descriptive PDF filename: {FirstName}_{LastName}_Resume_{Company}.pdf
 * or {FirstName}_{LastName}_Resume.pdf when company is empty.
 * Pulls name from resumeParsed.contact.name (or resumeParsed.name), company from tailor job context.
 */
export function getResumePdfFilename(
  resumeData: ParsedResume | null,
  company?: string | null
): string {
  const contactName =
    (resumeData as { contact?: { name?: string } })?.contact?.name?.trim() ||
    resumeData?.name?.trim() ||
    'Resume';
  const nameParts = contactName.trim().split(/\s+/).filter(Boolean);
  const firstName = nameParts[0] || '';
  const lastName = nameParts[nameParts.length - 1] || '';
  const companyPart = company ? company.split(/\s+/).slice(0, 2).join('_') : '';

  const base = companyPart
    ? `${firstName}_${lastName}_Resume_${companyPart}`
    : `${firstName}_${lastName}_Resume`;
  const cleaned = cleanFilename(base).replace(/^_|_$/g, '') || 'Resume';
  return cleaned + '.pdf';
}
