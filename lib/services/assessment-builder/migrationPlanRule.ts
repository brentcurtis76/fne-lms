/**
 * The generation type a course gets from the Plan de Migración — the rule
 * triggerAutoAssignment applies when it creates a registro
 * (autoAssignmentService.ts, resolveCourseAssignmentPlan):
 * - an always-GT grade (or one whose grade row cannot be read) is GT;
 * - any other grade takes the plan's saved value for that year, and GT when
 *   the plan has no value for it.
 * The Plan de Migración page shows the same values for cells with nothing
 * saved, so the page shows what the system does. Pure; client-safe.
 */
import type { GenerationType } from '@/types/assessment-builder';

export function effectiveGenerationType(
  isAlwaysGt: boolean | null | undefined,
  savedType: GenerationType | null | undefined
): GenerationType {
  if (isAlwaysGt ?? true) return 'GT';
  return savedType ?? 'GT';
}
