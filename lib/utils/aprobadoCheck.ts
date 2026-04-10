/**
 * Two-tier completion logic.
 *
 * - "completado"  → user finished all lessons (progressPercentage === 100).
 * - "aprobado"    → completado AND all assignments submitted + received feedback.
 * - "in_progress" → not yet completado.
 *
 * Edge case: courses with 0 assignments are auto-aprobado
 * the moment they reach completado status.
 */

export type CompletionStatus = 'in_progress' | 'completado' | 'aprobado';

export interface AprobadoCheckInput {
  progressPercentage: number;
  assignmentsTotal: number;
  assignmentsSubmitted: number;
  assignmentsWithFeedback: number;
}

export function getCompletionStatus(input: AprobadoCheckInput): CompletionStatus {
  if (input.progressPercentage < 100) return 'in_progress';
  if (input.assignmentsTotal === 0) return 'aprobado';
  if (input.assignmentsSubmitted >= input.assignmentsTotal &&
      input.assignmentsWithFeedback >= input.assignmentsTotal) {
    return 'aprobado';
  }
  return 'completado';
}

export function checkAprobadoEligibility(input: AprobadoCheckInput): boolean {
  return getCompletionStatus(input) === 'aprobado';
}
