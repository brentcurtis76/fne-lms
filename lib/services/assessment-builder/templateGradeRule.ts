/**
 * Template grade vs. vía rule, and version numbering for both kinds of
 * template (migration 20261008120000_via_assignment_rules.sql).
 *
 * - A template of a 'course_docente' vía carries a grade (nivel); a template of
 *   a 'school_responsible' vía carries none. The database enforces this for
 *   live templates (assessment_template_via_rule_guard); the builder API checks
 *   it for drafts too, through `checkTemplateGrade`.
 * - Versions are unique per (area, grade) for graded templates (existing key)
 *   and per (area, trimmed name) for grade-less ones
 *   (assessment_templates_gradeless_version_key). `nextTemplateVersion` scans
 *   the whole scope (no row cap) and returns the next patch version.
 */

import { loadViaRules } from './viaRules';

export type TemplateGradeCheck =
  | { kind: 'ok'; requiresGrade: boolean }
  | { kind: 'error'; status: 400 | 500; message: string };

export async function checkTemplateGrade(
  client: any,
  area: string,
  gradeId: number | null | undefined
): Promise<TemplateGradeCheck> {
  const rules = await loadViaRules(client);
  if (rules.kind === 'error') return { kind: 'error', status: 500, message: rules.message };
  const target = rules.rules.get(area);
  if (!target) return { kind: 'error', status: 400, message: 'Esta vía no tiene regla de asignación.' };
  const requiresGrade = target === 'course_docente';
  const hasGrade = gradeId !== null && gradeId !== undefined;
  if (requiresGrade && !hasGrade) {
    return { kind: 'error', status: 400, message: 'El nivel es requerido: esta vía se asigna al docente de cada curso.' };
  }
  if (!requiresGrade && hasGrade) {
    return {
      kind: 'error',
      status: 400,
      message: 'Esta vía se asigna a un responsable del equipo directivo: el template no lleva nivel.',
    };
  }
  return { kind: 'ok', requiresGrade };
}

/** Builder-facing messages for the database refusals of the template guard. */
export const TEMPLATE_GUARD_MESSAGES: Record<string, string> = {
  template_grade_required: 'El nivel es requerido: esta vía se asigna al docente de cada curso.',
  template_grade_not_allowed: 'Esta vía se asigna a un responsable del equipo directivo: el template no lleva nivel.',
  via_rule_missing: 'Esta vía no tiene regla de asignación.',
};

/** Maps a write error to a builder response when it is a guard refusal or a version collision. */
export function templateWriteConflict(error: { code?: string; message?: string } | null | undefined): string | null {
  if (!error) return null;
  const guard = TEMPLATE_GUARD_MESSAGES[String(error.message ?? '').trim()];
  if (guard) return guard;
  if (error.code === '23505') {
    return 'Ya existe un template con la misma vía, nivel (o nombre, si no lleva nivel) y versión.';
  }
  return null;
}

function parseSemver(version: string | null | undefined): [number, number, number] | null {
  const parts = String(version ?? '').split('.').map(Number);
  if (parts.length < 3 || parts.slice(0, 3).some((p) => !Number.isFinite(p))) return null;
  return [parts[0], parts[1], parts[2]];
}

/** Next patch version in the template's uniqueness scope; '1.0.0' for an empty scope. */
export async function nextTemplateVersion(
  client: any,
  area: string,
  gradeId: number | null,
  name: string
): Promise<string> {
  let query = client.from('assessment_templates').select('version, name').eq('area', area);
  query = gradeId === null ? query.is('grade_id', null) : query.eq('grade_id', gradeId);
  const { data } = await query;

  const trimmed = name.trim();
  let max: [number, number, number] | null = null;
  for (const row of (data ?? []) as { version?: string; name?: string }[]) {
    if (gradeId === null && String(row.name ?? '').trim() !== trimmed) continue;
    const v = parseSemver(row.version);
    if (!v) continue;
    if (!max || v[0] > max[0] || (v[0] === max[0] && (v[1] > max[1] || (v[1] === max[1] && v[2] > max[2])))) {
      max = v;
    }
  }
  return max ? `${max[0]}.${max[1]}.${max[2] + 1}` : '1.0.0';
}
