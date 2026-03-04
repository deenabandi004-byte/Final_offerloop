/**
 * Apply ALE resume edits to structured resume data.
 * Heuristic: map section/subsection to resume fields and apply suggested_content.
 */
import type { ParsedResume } from '@/types/resume';
import type { ResumeEdit } from '@/types/scout';

export function applyResumeEdits(parsed: ParsedResume, edits: ResumeEdit[]): ParsedResume {
  const result: ParsedResume = JSON.parse(JSON.stringify(parsed));
  if (!result.experience?.length) result.experience = [{ company: '', title: '', dates: '', location: '', bullets: [] }];

  for (const edit of edits) {
    const content = edit.before_after_preview?.after ?? edit.suggested_content;
    if (!content?.trim()) continue;

    const section = (edit.section || '').toLowerCase();
    const subsection = (edit.subsection || '').toLowerCase();

    if (section.includes('summary') || section.includes('objective')) {
      result.objective = content.trim();
      continue;
    }
    if (section.includes('experience') || section.includes('work')) {
      const exp = result.experience[0];
      if (exp && !exp.bullets.includes(content.trim())) {
        exp.bullets = [...(exp.bullets || []), content.trim()];
      }
      continue;
    }
    if (section.includes('education')) {
      if (!result.education?.length) result.education = [{ university: '', degree: '', major: '', graduation: '', gpa: '', location: '' }];
      const edu = result.education[0];
      if (subsection.includes('major')) edu.major = content.trim();
      else if (subsection.includes('degree')) edu.degree = content.trim();
      else if (subsection.includes('university')) edu.university = content.trim();
      else edu.major = edu.major || content.trim();
      continue;
    }
    if (section.includes('skill')) {
      const key = 'core_skills';
      if (!result.skills[key]) result.skills[key] = [];
      if (!result.skills[key].includes(content.trim())) result.skills[key].push(content.trim());
      continue;
    }
    if (section.includes('project')) {
      result.projects = result.projects || [];
      result.projects.push({ name: edit.subsection || 'Project', description: content.trim(), technologies: '', date: '', link: '' });
      continue;
    }
    // Default: append as experience bullet
    const exp = result.experience[0];
    if (exp && !exp.bullets.includes(content.trim())) {
      exp.bullets = [...(exp.bullets || []), content.trim()];
    }
  }

  return result;
}
