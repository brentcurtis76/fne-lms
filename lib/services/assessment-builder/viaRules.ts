/**
 * Vía assignment rules (migration 20261008120000_via_assignment_rules.sql).
 *
 * Every vía (assessment_templates.area) has exactly one rule:
 * - 'course_docente': one registro per course, for the docente assigned to the
 *   course in Contexto Transversal (triggerAutoAssignment).
 * - 'school_responsible': one registro per school, for the Equipo Directivo
 *   person picked for that vía (schoolViaAssignmentService).
 *
 * Rules change only through a reviewed migration (set_via_assignment_rule);
 * Crecimiento ('personalizacion') is fixed to 'course_docente'. A missing rule
 * or a failed read is never treated as 'course_docente': callers fail closed.
 */

import type { TransformationArea } from '@/types/assessment-builder';

export type ViaAssignmentTarget = 'course_docente' | 'school_responsible';

export const VIA_TARGET_LABELS: Record<ViaAssignmentTarget, string> = {
  course_docente: 'Docente del curso',
  school_responsible: 'Responsable del equipo directivo',
};

export type ViaRules = ReadonlyMap<string, ViaAssignmentTarget>;

export type ViaRulesLoad =
  | { kind: 'ok'; rules: ViaRules }
  | { kind: 'error'; message: string };

/** Never carries a database message: callers may show it to users. */
const RULES_UNAVAILABLE = 'No se pudieron leer las reglas de asignación por vía. Intente nuevamente.';

function isTarget(value: unknown): value is ViaAssignmentTarget {
  return value === 'course_docente' || value === 'school_responsible';
}

/**
 * Reads every rule. Any read error, or a row with an unknown target, fails the
 * whole load: a partial rule set must never be used to decide assignments.
 */
export async function loadViaRules(client: any): Promise<ViaRulesLoad> {
  try {
    const { data, error } = await client.from('ab_via_assignment_rules').select('area, target');
    if (error) {
      console.error('[viaRules] read failed:', error.message);
      return { kind: 'error', message: RULES_UNAVAILABLE };
    }
    const rules = new Map<string, ViaAssignmentTarget>();
    for (const row of (data ?? []) as { area?: unknown; target?: unknown }[]) {
      if (typeof row.area !== 'string' || !isTarget(row.target)) {
        return { kind: 'error', message: 'Las reglas de asignación por vía tienen un valor no reconocido.' };
      }
      rules.set(row.area, row.target);
    }
    if (rules.size === 0) {
      return { kind: 'error', message: 'No hay reglas de asignación por vía configuradas.' };
    }
    return { kind: 'ok', rules };
  } catch (err: any) {
    console.error('[viaRules] read failed:', err?.message);
    return { kind: 'error', message: RULES_UNAVAILABLE };
  }
}

/** The vías whose rule is `target`, in rule-table order. */
export function viasWithTarget(rules: ViaRules, target: ViaAssignmentTarget): TransformationArea[] {
  return [...rules.entries()].filter(([, t]) => t === target).map(([area]) => area as TransformationArea);
}

/** A template of this vía must (true) / must not (false) carry a grade; null when the vía has no rule. */
export function viaRequiresGrade(rules: ViaRules, area: string): boolean | null {
  const target = rules.get(area);
  if (!target) return null;
  return target === 'course_docente';
}
