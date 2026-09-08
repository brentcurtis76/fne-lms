/**
 * Template eligibility policy for automatic assessment assignment.
 *
 * PROC-CONTAIN-01 (A-01): every automatic-assignment entry point (course-level
 * `triggerAutoAssignment`, school-level `createSchoolLevelInstances`) and the
 * assignment preflight consume this single definition so the rule cannot drift
 * between call sites.
 *
 * A template is ELIGIBLE only when:
 *   - status = 'published'
 *   - is_archived = false (explicitly false — an unselected/undefined column
 *     fails closed; archiving keeps status='published' and only flips this flag)
 *
 * An eligible template is USABLE only when it is backed by its current snapshot
 * (assessment_template_snapshots row). An eligible template without a snapshot
 * is a configuration defect and is reported as a structured error, never
 * silently skipped.
 *
 * Pure module: no I/O.
 */

export const ELIGIBLE_TEMPLATE_STATUS = 'published' as const;

export interface EligibilitySnapshotRow {
  id: string;
  version?: string | null;
  created_at?: string | null;
}

export interface EligibilityTemplateRow {
  id: string;
  name: string;
  status?: string | null;
  is_archived?: boolean | null;
  assessment_template_snapshots?: EligibilitySnapshotRow[] | null;
}

export type TemplateIneligibilityReason = 'archived' | 'not_published';

export type TemplateClassification =
  | { kind: 'eligible'; snapshot: EligibilitySnapshotRow }
  | { kind: 'ineligible'; reason: TemplateIneligibilityReason }
  | { kind: 'misconfigured'; reason: 'snapshot_missing' };

/**
 * True only for status = 'published' AND is_archived === false.
 * `is_archived` null/undefined is treated as NOT eligible (fail closed).
 */
export function isEligibleTemplate(
  template: Pick<EligibilityTemplateRow, 'status' | 'is_archived'>
): boolean {
  return template.status === ELIGIBLE_TEMPLATE_STATUS && template.is_archived === false;
}

/**
 * Applies the eligibility predicate to a Supabase/PostgREST query builder.
 * Kept next to `isEligibleTemplate` so the DB-side filter and the in-code
 * re-check are one rule. The in-code re-check still runs on every row the
 * query returns (belt and braces).
 *
 * The builder type is intentionally loose: Supabase's PostgrestFilterBuilder
 * generics are deep enough that a self-referential constraint here trips
 * TS2589. The runtime contract is only `.eq(column, value)` chaining.
 */
export function applyEligibleTemplateFilter<T extends { eq: (...args: any[]) => any }>(query: T): T {
  return query.eq('status', ELIGIBLE_TEMPLATE_STATUS).eq('is_archived', false) as T;
}

/**
 * The current snapshot is the most recently created one. Ties (or missing
 * created_at) keep the earlier array position, so selection is deterministic
 * for a given row order.
 */
export function selectCurrentSnapshot(
  snapshots: EligibilitySnapshotRow[] | null | undefined
): EligibilitySnapshotRow | null {
  if (!snapshots || snapshots.length === 0) return null;

  const toTime = (s: EligibilitySnapshotRow): number => {
    const t = s.created_at ? new Date(s.created_at).getTime() : Number.NaN;
    return Number.isNaN(t) ? Number.NEGATIVE_INFINITY : t;
  };

  let current = snapshots[0];
  for (let i = 1; i < snapshots.length; i++) {
    if (toTime(snapshots[i]) > toTime(current)) {
      current = snapshots[i];
    }
  }
  return current ?? null;
}

/**
 * Classifies a template row for automatic assignment.
 *
 * - archived (is_archived !== false) → ineligible/'archived'
 * - not published → ineligible/'not_published'
 * - published + active but no snapshot → misconfigured/'snapshot_missing'
 * - otherwise → eligible with its current snapshot
 *
 * Archived is checked before status on purpose: an archived template keeps
 * status='published', and 'archived' is the more actionable reason.
 */
export function classifyTemplate(template: EligibilityTemplateRow): TemplateClassification {
  if (template.is_archived !== false) {
    return { kind: 'ineligible', reason: 'archived' };
  }
  if (template.status !== ELIGIBLE_TEMPLATE_STATUS) {
    return { kind: 'ineligible', reason: 'not_published' };
  }
  const snapshot = selectCurrentSnapshot(template.assessment_template_snapshots);
  if (!snapshot) {
    return { kind: 'misconfigured', reason: 'snapshot_missing' };
  }
  return { kind: 'eligible', snapshot };
}
