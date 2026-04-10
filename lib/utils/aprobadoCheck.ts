/**
 * Two-tier completion logic.
 *
 * - "completado"  → user finished all required lessons / modules.
 * - "aprobado"    → completado AND meets the assignment-score threshold.
 * - "in_progress" → not yet completado.
 *
 * Edge case: courses with 0 graded assignments are auto-aprobado
 * the moment they reach completado status.
 */

export type CompletionStatus = 'in_progress' | 'completado' | 'aprobado';

export interface CompletionInput {
  /** Whether every required lesson / module is marked complete. */
  allLessonsComplete: boolean;
  /** Number of graded assignments in the course. */
  totalAssignments: number;
  /** Number of assignments the student has passed (score >= threshold). */
  passedAssignments: number;
  /** Minimum ratio of passed/total to qualify as aprobado (0-1). Default 0.6 */
  passingRatio?: number;
}

/**
 * Returns the overall completion status for a student in a course.
 */
export function getCompletionStatus(input: CompletionInput): CompletionStatus {
  if (!input.allLessonsComplete) {
    return 'in_progress';
  }

  // Completado at minimum — check for aprobado
  if (checkAprobadoEligibility(input)) {
    return 'aprobado';
  }

  return 'completado';
}

/**
 * Determines whether a student qualifies for "aprobado" status.
 *
 * Auto-aprobado: if the course has 0 graded assignments and the
 * student has completed all lessons, they are automatically aprobado.
 */
export function checkAprobadoEligibility(input: CompletionInput): boolean {
  if (!input.allLessonsComplete) {
    return false;
  }

  // 0 assignments → auto-aprobado once lessons are done
  if (input.totalAssignments === 0) {
    return true;
  }

  const ratio = input.passingRatio ?? 0.6;
  return input.passedAssignments / input.totalAssignments >= ratio;
}
