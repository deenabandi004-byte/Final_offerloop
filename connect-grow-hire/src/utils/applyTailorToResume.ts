/**
 * Apply Tailor (Resume Workshop) section suggestions to ParsedResume.
 * Produces a modified ParsedResume with summary, experience bullets, and skills updated.
 */
import type { ParsedResume } from '@/types/resume';
import type { TailorResult } from '@/services/resumeWorkshop';

export function applyTailorToParsedResume(
  parsed: ParsedResume,
  tailor: TailorResult
): ParsedResume {
  const result: ParsedResume = JSON.parse(JSON.stringify(parsed));

  console.log('[Apply] Original resume experience:', JSON.stringify(parsed.experience, null, 2));

  if (tailor.sections?.summary?.suggested) {
    result.objective = tailor.sections.summary.suggested.trim();
  }

  if (tailor.sections?.experience?.length && result.experience?.length) {
    tailor.sections.experience.forEach((expSugg, i) => {
      const exp = result.experience![i];
      if (!exp) return;
      const originalBullets = exp.bullets || [];
      console.log('[Apply] Processing:', expSugg.role ?? exp.title, '@', expSugg.company ?? exp.company, 'original bullets:', originalBullets.length, 'tailor bullets:', expSugg.bullets?.length ?? 0);
      if (expSugg.bullets?.length) {
        // Preserve all original bullets: use suggested only where provided, else keep original
        exp.bullets = originalBullets.map((orig, j) => {
          const b = expSugg.bullets![j];
          const match = !!b;
          const text = (b ? (b.suggested || b.current || orig) : orig) || '';
          console.log('[Apply] Bullet', j, (orig || '').slice(0, 50) + (orig && orig.length > 50 ? '...' : ''), '→ matched:', match, '→', (text || '').slice(0, 50) + (text.length > 50 ? '...' : ''));
          if (b) return (b.suggested || b.current || orig || '').trim();
          return (orig || '').trim();
        }).filter(Boolean);
        // If tailor returned more bullets than original (shouldn't happen), append the rest
        if (expSugg.bullets.length > originalBullets.length) {
          exp.bullets = exp.bullets.concat(
            expSugg.bullets.slice(originalBullets.length).map((b) => (b.suggested || b.current || '').trim()).filter(Boolean)
          );
        }
      }
    });
  }

  console.log('[Apply] Final resume experience:', JSON.stringify(result.experience, null, 2));

  if (tailor.sections?.skills) {
    console.log('[Apply] Existing skills before add:', JSON.stringify(result.skills));
    const core = result.skills?.core_skills || [];
    const coreList = Array.isArray(core) ? [...core] : [];
    const existingSkillsLower = new Set<string>();
    for (const key of Object.keys(result.skills || {})) {
      const arr = result.skills![key];
      if (Array.isArray(arr)) arr.forEach((s) => existingSkillsLower.add(String(s).trim().toLowerCase()));
    }
    const newSkills = (tailor.sections.skills.add || []).map((s) => s.skill?.trim()).filter(Boolean);
    console.log('[Apply] Skills being added:', newSkills);
    tailor.sections.skills.add?.forEach((s) => {
      const trimmed = s.skill?.trim();
      if (trimmed && !existingSkillsLower.has(trimmed.toLowerCase())) {
        coreList.push(trimmed);
        existingSkillsLower.add(trimmed.toLowerCase());
      }
    });
    tailor.sections.skills.remove?.forEach((s) => {
      const trimmed = s.skill?.trim();
      if (trimmed) {
        for (const key of Object.keys(result.skills || {})) {
          const arr = result.skills![key];
          if (Array.isArray(arr)) {
            result.skills![key] = arr.filter((v) => String(v).trim().toLowerCase() !== trimmed.toLowerCase());
          }
        }
      }
    });
    result.skills = result.skills || {};
    result.skills.core_skills = coreList;
    console.log('[Apply] Final skills:', JSON.stringify(result.skills));
  }

  if (tailor.sections?.keywords?.length) {
    const kwList = tailor.sections.keywords.map((k) => k.keyword.trim()).filter(Boolean);
    if (kwList.length) {
      result.skills = result.skills || {};
      const existing = result.skills.keywords || [];
      const combined = Array.isArray(existing) ? [...existing] : [];
      kwList.forEach((kw) => {
        if (!combined.includes(kw)) combined.push(kw);
      });
      result.skills.keywords = combined;
    }
  }

  if (tailor.sections?.projects && Array.isArray(tailor.sections.projects) && result.projects?.length) {
    for (const projSuggestion of tailor.sections.projects) {
      const name = projSuggestion.name?.trim();
      if (!name) continue;
      const matchIndex = result.projects.findIndex((p) => (p.name || '').toLowerCase() === name.toLowerCase());
      if (matchIndex >= 0 && projSuggestion.suggested != null) {
        result.projects[matchIndex].description = projSuggestion.suggested.trim();
      }
    }
  }

  return result;
}
