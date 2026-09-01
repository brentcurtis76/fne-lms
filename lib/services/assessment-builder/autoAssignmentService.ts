/**
 * Auto-Assignment Service for Assessment Builder
 *
 * When a docente is assigned to a course, this service automatically creates
 * assessment instances for every ELIGIBLE template of the course's grade
 * (one per vía de transformación) and links the docente as assignee.
 *
 * PROC-CONTAIN-01 (A-01 / A-02) invariants:
 * - Eligibility is defined once in templateEligibility.ts: status = 'published'
 *   AND is_archived = false, backed by a current snapshot. An archived template
 *   never creates or attaches an instance on any automatic path.
 * - A published, active template without a snapshot is a configuration defect
 *   and produces a structured, grade-identifiable blocking error.
 * - Zero eligible templates is a blocking failure, never a warning-only success.
 * - `preflightAutoAssignment` resolves the same plan read-only so callers can
 *   refuse to write a course assignment that would be unusable.
 * - `triggerAutoAssignment` is idempotent: re-running it repairs a missing
 *   instance or assignee link and reports already-existing work truthfully.
 * - `success` is true only when at least one assessment was created, attached,
 *   or confirmed as already existing, and no error occurred.
 *
 * The grade-blind `upgradeExistingAssignments` path (area-only matching across
 * all templates) was removed in A-01 and must not be reintroduced without a
 * grade-aware, previewed design.
 *
 * Key features:
 * - Matches templates to courses by grade (school_course_structure.grade_id -> ab_grades.id)
 * - Determines GT/GI generation type from Migration Plan (ab_migration_plan)
 * - Stores generation_type on assessment instances for proper expectation matching
 *
 * NOTE: This service uses supabaseAdmin to bypass RLS restrictions.
 * RLS policies block inserts to assessment_instances and assessment_instance_assignees
 * from regular authenticated users.
 */

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import type { GenerationType } from '@/types/assessment-builder';
import { categoryScopedColumns } from '@/lib/services/assessment-builder/indicatorCategoryColumns';
import {
  applyEligibleTemplateFilter,
  classifyTemplate,
  type EligibilitySnapshotRow,
  type EligibilityTemplateRow,
} from '@/lib/services/assessment-builder/templateEligibility';

export type AutoAssignmentDetailStatus =
  | 'created'            // new instance created and docente linked
  | 'assignee_attached'  // instance already existed; the missing docente link was repaired
  | 'already_exists'     // instance and docente link both already existed (no-op)
  | 'skipped'            // row returned by the query failed the in-code eligibility re-check
  | 'error';

export interface AutoAssignmentDetail {
  templateId: string;
  templateName: string;
  area: string;
  gradeId?: number;
  gradeName?: string;
  generationType?: GenerationType;
  instanceId?: string;
  status: AutoAssignmentDetailStatus;
  /** Why a row was skipped (e.g. 'archived', 'not_published'). */
  reason?: string;
  error?: string;
}

export type AutoAssignmentErrorCode =
  | 'context_missing'        // school_transversal_context row not found
  | 'course_missing'         // school_course_structure row not found
  | 'grade_missing'          // course has no grade_id
  | 'no_eligible_templates'  // zero published + active templates for the grade
  | 'snapshot_missing'       // an eligible template has no current snapshot
  | 'query_error';           // a lookup failed

export interface AutoAssignmentBlockingError {
  code: AutoAssignmentErrorCode;
  /** es-CL, actionable, safe to show to a directivo. */
  message: string;
  gradeId?: number | null;
  gradeName?: string | null;
  gradeLevel?: string | null;
  templates?: { id: string; name: string }[];
}

export interface AutoAssignmentCounts {
  created: number;
  attached: number;
  alreadyExisting: number;
  skipped: number;
  errors: number;
}

export interface AutoAssignmentResult {
  /**
   * True only when no blocking error occurred, no per-template error occurred,
   * and at least one assessment was created, attached, or confirmed existing.
   */
  success: boolean;
  /** Legacy aggregate kept for callers: created + attached. */
  instancesCreated: number;
  /** Legacy aggregate kept for callers: alreadyExisting + skipped. */
  instancesSkipped: number;
  counts: AutoAssignmentCounts;
  blockingError?: AutoAssignmentBlockingError;
  errors: string[];
  warnings: string[];
  details: AutoAssignmentDetail[];
}

export interface EligibleTemplatePlan {
  id: string;
  name: string;
  area: string;
  gradeId: number | null;
  gradeName: string | null;
  snapshotId: string;
  snapshotVersion: string | null;
}

/**
 * Read-only resolution of what an assignment would do. `ok` is true only when
 * at least one eligible, snapshot-backed template exists for the course grade
 * and no configuration defect was found.
 */
export interface CourseAssignmentPlan {
  ok: boolean;
  blockingError?: AutoAssignmentBlockingError;
  warnings: string[];
  /** Rows the query returned that failed the in-code eligibility re-check. */
  skipped: AutoAssignmentDetail[];
  gradeId: number | null;
  gradeName: string | null;
  gradeLevel: string | null;
  transformationYear: 1 | 2 | 3 | 4 | 5 | null;
  generationType: GenerationType | null;
  eligibleTemplates: EligibleTemplatePlan[];
}

// ----------------------------------------------------------------------------
// Internal helpers
// ----------------------------------------------------------------------------

interface TemplateRow extends EligibilityTemplateRow {
  area: string;
  grade_id?: number | null;
  grade?: { id: number; name: string; is_always_gt?: boolean } | null;
}

interface ClassifiedTemplates {
  eligible: { row: TemplateRow; snapshot: EligibilitySnapshotRow }[];
  skipped: AutoAssignmentDetail[];
  misconfigured: TemplateRow[];
}

const COURSE_TEMPLATE_SELECT = `
  id,
  name,
  area,
  status,
  is_archived,
  grade_id,
  grade:ab_grades (
    id,
    name,
    is_always_gt
  ),
  assessment_template_snapshots (
    id,
    version,
    created_at
  )
`;

const SCHOOL_TEMPLATE_SELECT = `
  id,
  name,
  area,
  status,
  is_archived,
  assessment_template_snapshots (
    id,
    version,
    created_at
  )
`;

function emptyResult(): AutoAssignmentResult {
  return {
    success: false,
    instancesCreated: 0,
    instancesSkipped: 0,
    counts: { created: 0, attached: 0, alreadyExisting: 0, skipped: 0, errors: 0 },
    errors: [],
    warnings: [],
    details: [],
  };
}

/**
 * Derives the aggregate fields and the truthful `success` flag. Zero confirmed
 * assessments (created + attached + alreadyExisting) is never a success.
 */
function finalizeResult(result: AutoAssignmentResult): AutoAssignmentResult {
  result.counts.errors = result.errors.length;
  result.instancesCreated = result.counts.created + result.counts.attached;
  result.instancesSkipped = result.counts.alreadyExisting + result.counts.skipped;
  const confirmed = result.counts.created + result.counts.attached + result.counts.alreadyExisting;
  result.success = !result.blockingError && result.errors.length === 0 && confirmed > 0;
  return result;
}

function blocked(result: AutoAssignmentResult, error: AutoAssignmentBlockingError): AutoAssignmentResult {
  result.blockingError = error;
  result.errors.push(error.message);
  return finalizeResult(result);
}

function emptyPlan(): CourseAssignmentPlan {
  return {
    ok: false,
    warnings: [],
    skipped: [],
    gradeId: null,
    gradeName: null,
    gradeLevel: null,
    transformationYear: null,
    generationType: null,
    eligibleTemplates: [],
  };
}

function blockPlan(plan: CourseAssignmentPlan, error: AutoAssignmentBlockingError): CourseAssignmentPlan {
  plan.ok = false;
  plan.blockingError = {
    gradeId: plan.gradeId,
    gradeName: plan.gradeName,
    gradeLevel: plan.gradeLevel,
    ...error,
  };
  plan.eligibleTemplates = [];
  return plan;
}

function gradeLabel(plan: Pick<CourseAssignmentPlan, 'gradeId' | 'gradeName' | 'gradeLevel'>): string {
  return plan.gradeName ?? plan.gradeLevel ?? (plan.gradeId != null ? `grade_id ${plan.gradeId}` : 'sin nivel');
}

/** PostgREST "no rows" for .single()/.maybeSingle(); treated as not-found, never as a failure. */
function isNotFound(error: { code?: string } | null | undefined): boolean {
  return error?.code === 'PGRST116';
}

/** Postgres unique_violation — a concurrent writer already linked the same row. */
function isUniqueViolation(error: { code?: string } | null | undefined): boolean {
  return error?.code === '23505';
}

function templateNames(rows: { name: string }[]): string {
  return rows.map(r => `"${r.name}"`).join(', ');
}

function snapshotMissingError(
  rows: TemplateRow[],
  grade: Pick<CourseAssignmentPlan, 'gradeId' | 'gradeName' | 'gradeLevel'> | null
): AutoAssignmentBlockingError {
  const scope = grade ? ` para el nivel "${gradeLabel(grade)}"` : '';
  const target = grade ? ' a este nivel' : '';
  return {
    code: 'snapshot_missing',
    message:
      `Configuración incompleta${scope}: ${rows.length} template(s) publicado(s) sin snapshot vigente (${templateNames(rows)}). ` +
      `Un administrador debe archivarlos y publicar una versión con snapshot antes de asignar docentes${target}.`,
    gradeId: grade?.gradeId ?? null,
    gradeName: grade?.gradeName ?? null,
    gradeLevel: grade?.gradeLevel ?? null,
    templates: rows.map(r => ({ id: r.id, name: r.name })),
  };
}

/**
 * Applies the single eligibility policy to every row the query returned.
 * The DB query already filters status/is_archived; this re-check guarantees an
 * archived or unpublished row can never proceed even if a query drifts.
 */
function classifyTemplates(rows: TemplateRow[], planGradeName: string | null): ClassifiedTemplates {
  const out: ClassifiedTemplates = { eligible: [], skipped: [], misconfigured: [] };
  for (const row of rows) {
    const classification = classifyTemplate(row);
    if (classification.kind === 'eligible') {
      out.eligible.push({ row, snapshot: classification.snapshot });
    } else if (classification.kind === 'misconfigured') {
      out.misconfigured.push(row);
    } else {
      out.skipped.push({
        templateId: row.id,
        templateName: row.name,
        area: row.area,
        gradeId: row.grade_id ?? undefined,
        gradeName: row.grade?.name ?? planGradeName ?? undefined,
        status: 'skipped',
        reason: classification.reason,
      });
    }
  }
  return out;
}

/**
 * Resolves the course's grade, transformation year, generation type and the
 * eligible template set. Read-only. Shared by the preflight and the executor
 * so both see the same policy; the executor re-resolves at write time.
 */
async function resolveCourseAssignmentPlan(
  courseStructureId: string,
  schoolId: number
): Promise<CourseAssignmentPlan> {
  const plan = emptyPlan();

  // Get school context to determine transformation year
  const { data: schoolContext, error: contextError } = await supabaseAdmin
    .from('school_transversal_context')
    .select('implementation_year_2026')
    .eq('school_id', schoolId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (contextError || !schoolContext) {
    return blockPlan(plan, {
      code: 'context_missing',
      message:
        'No se encontró el contexto transversal de la escuela. Complete el cuestionario de contexto antes de asignar docentes.',
    });
  }

  plan.transformationYear = schoolContext.implementation_year_2026 as 1 | 2 | 3 | 4 | 5;

  // Get the course structure with grade_id FK (set at course generation time)
  const { data: courseStructure, error: courseError } = await supabaseAdmin
    .from('school_course_structure')
    .select('id, grade_level, grade_id')
    .eq('id', courseStructureId)
    .single();

  if (courseError || !courseStructure) {
    return blockPlan(plan, {
      code: 'course_missing',
      message: 'No se encontró la estructura del curso.',
    });
  }

  plan.gradeLevel = courseStructure.grade_level ?? null;
  plan.gradeId = courseStructure.grade_id ?? null;

  if (plan.gradeId == null) {
    return blockPlan(plan, {
      code: 'grade_missing',
      message:
        `El curso "${courseStructure.grade_level}" no tiene nivel (grade_id) asignado. ` +
        'Un administrador debe corregir la estructura de cursos antes de asignar docentes.',
    });
  }

  const courseGradeId = plan.gradeId;

  // Fetch grade info for the label and the is_always_gt check
  const { data: gradeData } = await supabaseAdmin
    .from('ab_grades')
    .select('name, is_always_gt')
    .eq('id', courseGradeId)
    .single();

  plan.gradeName = gradeData?.name ?? null;
  const isAlwaysGT = gradeData?.is_always_gt ?? true;

  // Determine generation_type from Migration Plan (only if grade is not always_gt)
  let generationType: GenerationType = 'GT';

  if (!isAlwaysGT) {
    const { data: migrationPlanEntry, error: mpError } = await supabaseAdmin
      .from('ab_migration_plan')
      .select('generation_type')
      .eq('school_id', schoolId)
      .eq('year_number', plan.transformationYear)
      .eq('grade_id', courseGradeId)
      .single();

    if (mpError || !migrationPlanEntry) {
      // No migration plan entry - default to GT and warn (non-blocking, must stay visible)
      plan.warnings.push(
        `No se encontró plan de migración para el nivel "${gradeLabel(plan)}" (grade_id ${courseGradeId}) ` +
        `en el año ${plan.transformationYear}. Se usará GT por defecto.`
      );
    } else {
      generationType = migrationPlanEntry.generation_type as GenerationType;
    }
  }

  plan.generationType = generationType;

  // Eligible templates for the course's grade: status = published AND is_archived = false.
  // `any` on purpose: the typed builder's select-string parser is deep enough to trip
  // TS2589 through the shared filter helper; every row is re-validated by classifyTemplates.
  const courseTemplatesQuery: any = supabaseAdmin
    .from('assessment_templates')
    .select(COURSE_TEMPLATE_SELECT);
  const { data: templateRows, error: templatesError } = await applyEligibleTemplateFilter(courseTemplatesQuery)
    .eq('grade_id', courseGradeId)
    .order('area');

  if (templatesError) {
    return blockPlan(plan, {
      code: 'query_error',
      message: `Error al consultar templates de evaluación: ${templatesError.message}`,
    });
  }

  const classified = classifyTemplates((templateRows ?? []) as unknown as TemplateRow[], plan.gradeName);
  plan.skipped = classified.skipped;

  if (classified.misconfigured.length > 0) {
    return blockPlan(plan, snapshotMissingError(classified.misconfigured, plan));
  }

  if (classified.eligible.length === 0) {
    return blockPlan(plan, {
      code: 'no_eligible_templates',
      message:
        `No hay evaluaciones publicadas y vigentes para el nivel "${gradeLabel(plan)}" (grade_id ${courseGradeId}). ` +
        'Publique un template para este nivel antes de asignar docentes.',
    });
  }

  plan.eligibleTemplates = classified.eligible.map(({ row, snapshot }) => ({
    id: row.id,
    name: row.name,
    area: row.area,
    gradeId: row.grade_id ?? courseGradeId,
    gradeName: row.grade?.name ?? plan.gradeName,
    snapshotId: snapshot.id,
    snapshotVersion: snapshot.version ?? null,
  }));
  plan.ok = true;
  return plan;
}

// ----------------------------------------------------------------------------
// Public API
// ----------------------------------------------------------------------------

/**
 * Read-only preflight for a course-docente assignment (A-02).
 *
 * Callers must run this AFTER authentication/authorization and BEFORE creating
 * or reactivating the course-docente assignment. When `ok` is false the caller
 * must not mutate the assignment; `blockingError` carries the structured,
 * grade-identifiable reason.
 *
 * Never throws: unexpected failures are reported as a 'query_error' plan.
 */
export async function preflightAutoAssignment(
  courseStructureId: string,
  schoolId: number
): Promise<CourseAssignmentPlan> {
  try {
    return await resolveCourseAssignmentPlan(courseStructureId, schoolId);
  } catch (err: any) {
    return blockPlan(emptyPlan(), {
      code: 'query_error',
      message: `Error inesperado al verificar la configuración de evaluaciones: ${err?.message ?? 'desconocido'}`,
    });
  }
}

/**
 * Triggers auto-assignment of assessment instances when a docente is assigned to a course.
 *
 * For each ELIGIBLE template matching the course's grade (see templateEligibility.ts):
 * 1. Resolve the plan (grade, year, GT/GI, eligible templates + current snapshots)
 * 2. If an instance already exists for this course + snapshot, reconcile the
 *    docente's assignee link (attach it if missing, no-op if present)
 * 3. Otherwise create the instance with generation_type and link the docente
 *
 * Idempotent: a retry after a partial failure repairs whatever is missing and
 * reports already-existing work under `counts.alreadyExisting`.
 *
 * NOTE: Uses supabaseAdmin internally to bypass RLS restrictions.
 * The supabase parameter is kept for backwards compatibility but ignored.
 */
export async function triggerAutoAssignment(
  _supabase: any, // Kept for backwards compatibility, uses supabaseAdmin instead
  docenteId: string,
  courseStructureId: string,
  schoolId: number,
  assignedBy: string
): Promise<AutoAssignmentResult> {
  const result = emptyResult();

  try {
    // Re-resolve at write time so a template archived between a caller's
    // preflight and this call can never be used.
    const plan = await resolveCourseAssignmentPlan(courseStructureId, schoolId);
    result.warnings.push(...plan.warnings);
    result.details.push(...plan.skipped);
    result.counts.skipped = plan.skipped.length;

    if (!plan.ok) {
      return blocked(result, plan.blockingError ?? {
        code: 'query_error',
        message: 'No se pudo determinar el plan de asignación de evaluaciones.',
      });
    }

    const generationType = plan.generationType ?? 'GT';

    // Process each eligible template
    for (const template of plan.eligibleTemplates) {
      const templateDetail: AutoAssignmentDetail = {
        templateId: template.id,
        templateName: template.name,
        area: template.area,
        gradeId: template.gradeId ?? undefined,
        gradeName: template.gradeName ?? undefined,
        generationType,
        status: 'created',
      };

      try {
        // Check if an instance already exists for this course structure + current snapshot.
        // Deterministic under duplicates: oldest row wins.
        const { data: existingInstance, error: existingInstanceError } = await supabaseAdmin
          .from('assessment_instances')
          .select('id')
          .eq('course_structure_id', courseStructureId)
          .eq('template_snapshot_id', template.snapshotId)
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle();

        if (existingInstanceError && !isNotFound(existingInstanceError)) {
          templateDetail.status = 'error';
          templateDetail.error = `No se pudo verificar la evaluación existente: ${existingInstanceError.message}`;
          result.errors.push(`Template ${template.name}: ${templateDetail.error}`);
          result.details.push(templateDetail);
          continue;
        }

        if (existingInstance) {
          templateDetail.instanceId = existingInstance.id;

          // Instance already exists - reconcile the docente's assignee link
          const { data: existingAssignee, error: assigneeLookupError } = await supabaseAdmin
            .from('assessment_instance_assignees')
            .select('id')
            .eq('instance_id', existingInstance.id)
            .eq('user_id', docenteId)
            .limit(1)
            .maybeSingle();

          if (assigneeLookupError && !isNotFound(assigneeLookupError)) {
            templateDetail.status = 'error';
            templateDetail.error = `No se pudo verificar la asignación existente: ${assigneeLookupError.message}`;
            result.errors.push(`Template ${template.name}: ${templateDetail.error}`);
            result.details.push(templateDetail);
            continue;
          }

          if (existingAssignee) {
            templateDetail.status = 'already_exists';
            result.counts.alreadyExisting++;
          } else {
            // Repair: add docente as assignee to the existing instance
            const { error: addAssigneeError } = await supabaseAdmin
              .from('assessment_instance_assignees')
              .insert({
                instance_id: existingInstance.id,
                user_id: docenteId,
                can_edit: true,
                can_submit: true,
                assigned_by: assignedBy,
              });

            if (addAssigneeError && isUniqueViolation(addAssigneeError)) {
              // A concurrent request linked the docente first — same end state.
              templateDetail.status = 'already_exists';
              result.counts.alreadyExisting++;
            } else if (addAssigneeError) {
              templateDetail.status = 'error';
              templateDetail.error = `Instance exists but assignee insert failed: ${addAssigneeError.message}`;
              result.errors.push(`Template ${template.name}: ${templateDetail.error}`);
            } else {
              templateDetail.status = 'assignee_attached';
              result.counts.attached++;
            }
          }
        } else {
          // Create new instance with generation_type
          const { data: newInstance, error: instanceError } = await supabaseAdmin
            .from('assessment_instances')
            .insert({
              template_snapshot_id: template.snapshotId,
              school_id: schoolId,
              course_structure_id: courseStructureId,
              transformation_year: plan.transformationYear,
              generation_type: generationType,
              status: 'pending',
              assigned_by: assignedBy,
            })
            .select()
            .single();

          if (instanceError || !newInstance) {
            templateDetail.status = 'error';
            templateDetail.error = instanceError?.message || 'Failed to create instance';
            result.errors.push(`Template ${template.name}: ${templateDetail.error}`);
            result.details.push(templateDetail);
            continue;
          }

          templateDetail.instanceId = newInstance.id;

          // Create assignee record
          const { error: assigneeError } = await supabaseAdmin
            .from('assessment_instance_assignees')
            .insert({
              instance_id: newInstance.id,
              user_id: docenteId,
              can_edit: true,
              can_submit: true,
              assigned_by: assignedBy,
            });

          if (assigneeError && !isUniqueViolation(assigneeError)) {
            templateDetail.status = 'error';
            templateDetail.error = `Instance created but assignee failed: ${assigneeError.message}`;
            result.errors.push(`Template ${template.name}: ${templateDetail.error}`);
          } else {
            templateDetail.status = 'created';
            result.counts.created++;
          }
        }
      } catch (err: any) {
        templateDetail.status = 'error';
        templateDetail.error = err.message;
        result.errors.push(`Template ${template.name}: ${err.message}`);
      }

      result.details.push(templateDetail);
    }

    return finalizeResult(result);
  } catch (err: any) {
    result.errors.push(`Unexpected error: ${err.message}`);
    return finalizeResult(result);
  }
}

/**
 * Creates assessment instances for a school when context is completed.
 * Unlike triggerAutoAssignment, this creates instances at the school level,
 * not the course level (for directivo-only assessments).
 *
 * Applies the same eligibility policy (published + not archived + current
 * snapshot). Zero eligible templates or a snapshot-less eligible template is a
 * blocking failure, never a silent success.
 *
 * For school-level instances, we default to GT since they are not tied to a
 * specific course/grade. Scoring will use GT expectations.
 *
 * NOTE: Uses supabaseAdmin internally to bypass RLS restrictions.
 */
export async function createSchoolLevelInstances(
  _supabase: any, // Kept for backwards compatibility, uses supabaseAdmin instead
  schoolId: number,
  transformationYear: 1 | 2 | 3 | 4 | 5,
  createdBy: string
): Promise<AutoAssignmentResult> {
  const result = emptyResult();

  try {
    // Eligible templates: status = published AND is_archived = false.
    // `any` for the same TS2589 reason as the course-level query above.
    const schoolTemplatesQuery: any = supabaseAdmin
      .from('assessment_templates')
      .select(SCHOOL_TEMPLATE_SELECT);
    const { data: templateRows, error: templatesError } = await applyEligibleTemplateFilter(schoolTemplatesQuery)
      .order('area');

    if (templatesError || !templateRows) {
      return blocked(result, {
        code: 'query_error',
        message: `Error al consultar templates de evaluación: ${templatesError?.message ?? 'sin datos'}`,
      });
    }

    const classified = classifyTemplates(templateRows as unknown as TemplateRow[], null);
    result.details.push(...classified.skipped);
    result.counts.skipped = classified.skipped.length;

    if (classified.misconfigured.length > 0) {
      return blocked(result, snapshotMissingError(classified.misconfigured, null));
    }

    if (classified.eligible.length === 0) {
      return blocked(result, {
        code: 'no_eligible_templates',
        message: 'No hay templates publicados y vigentes para crear evaluaciones a nivel de escuela.',
      });
    }

    for (const { row: template, snapshot } of classified.eligible) {
      const templateDetail: AutoAssignmentDetail = {
        templateId: template.id,
        templateName: template.name,
        area: template.area,
        status: 'created',
      };

      try {
        // Check if a school-level instance exists (deterministic under duplicates)
        const { data: existingInstance, error: existingInstanceError } = await supabaseAdmin
          .from('assessment_instances')
          .select('id')
          .eq('school_id', schoolId)
          .eq('template_snapshot_id', snapshot.id)
          .is('course_structure_id', null)
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle();

        if (existingInstanceError && !isNotFound(existingInstanceError)) {
          templateDetail.status = 'error';
          templateDetail.error = `No se pudo verificar la evaluación existente: ${existingInstanceError.message}`;
          result.errors.push(`Template ${template.name}: ${templateDetail.error}`);
          result.details.push(templateDetail);
          continue;
        }

        if (existingInstance) {
          templateDetail.status = 'already_exists';
          templateDetail.instanceId = existingInstance.id;
          result.counts.alreadyExisting++;
        } else {
          // School-level instances default to GT
          const { data: newInstance, error: instanceError } = await supabaseAdmin
            .from('assessment_instances')
            .insert({
              template_snapshot_id: snapshot.id,
              school_id: schoolId,
              transformation_year: transformationYear,
              generation_type: 'GT',
              status: 'pending',
              assigned_by: createdBy,
            })
            .select()
            .single();

          if (instanceError || !newInstance) {
            templateDetail.status = 'error';
            templateDetail.error = instanceError?.message || 'Failed to create instance';
            result.errors.push(`Template ${template.name}: ${templateDetail.error}`);
          } else {
            templateDetail.instanceId = newInstance.id;
            result.counts.created++;
          }
        }
      } catch (err: any) {
        templateDetail.status = 'error';
        templateDetail.error = err.message;
        result.errors.push(`Template ${template.name}: ${err.message}`);
      }

      result.details.push(templateDetail);
    }

    return finalizeResult(result);
  } catch (err: any) {
    result.errors.push(`Unexpected error: ${err.message}`);
    return finalizeResult(result);
  }
}

/**
 * Updates the snapshot for a published template when it's edited.
 * This ensures docentes see the updated data immediately.
 *
 * Called when editing a published template's:
 * - Template info (name, description)
 * - Modules
 * - Indicators
 * - Expectations
 *
 * @param templateId - The template being edited
 * @param updatedBy - User ID who made the edit
 * @returns Object with success status and updated snapshot info
 */
export async function updatePublishedTemplateSnapshot(
  templateId: string,
  updatedBy: string
): Promise<{ success: boolean; error?: string; snapshotId?: string; version?: string }> {
  try {
    // Get the template
    const { data: template, error: templateError } = await supabaseAdmin
      .from('assessment_templates')
      .select('*')
      .eq('id', templateId)
      .single();

    if (templateError || !template) {
      return { success: false, error: 'Template not found' };
    }

    // Only update snapshots for published templates
    if (template.status !== 'published') {
      return { success: true }; // No-op for non-published templates
    }

    // Get the most recent snapshot for this template
    const { data: existingSnapshot, error: snapshotError } = await supabaseAdmin
      .from('assessment_template_snapshots')
      .select('id, version')
      .eq('template_id', templateId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (snapshotError || !existingSnapshot) {
      console.error('No snapshot found for published template:', templateId);
      return { success: false, error: 'No snapshot found for published template' };
    }

    // Get all objectives for this template
    const { data: objectives, error: objectivesError } = await supabaseAdmin
      .from('assessment_objectives')
      .select('*')
      .eq('template_id', templateId)
      .order('display_order', { ascending: true });

    if (objectivesError) {
      return { success: false, error: 'Error loading objectives' };
    }

    // Get all modules for this template
    const { data: modules, error: modulesError } = await supabaseAdmin
      .from('assessment_modules')
      .select('*')
      .eq('template_id', templateId)
      .order('display_order', { ascending: true });

    if (modulesError) {
      return { success: false, error: 'Error loading modules' };
    }

    // Get all indicators for all modules
    const moduleIds = (modules || []).map(m => m.id);
    let allIndicators: any[] = [];

    if (moduleIds.length > 0) {
      const { data: indicators, error: indicatorsError } = await supabaseAdmin
        .from('assessment_indicators')
        .select('*')
        .in('module_id', moduleIds)
        .order('display_order', { ascending: true });

      if (indicatorsError) {
        return { success: false, error: 'Error loading indicators' };
      }
      allIndicators = indicators || [];
    }

    // Get all year expectations for this template
    const { data: expectations } = await supabaseAdmin
      .from('assessment_year_expectations')
      .select('*')
      .eq('template_id', templateId);

    // Build expectations map by indicator ID
    const expectationsMap = new Map<string, any>();
    (expectations || []).forEach((exp: any) => {
      expectationsMap.set(exp.indicator_id, {
        year_1_expected: exp.year_1_expected,
        year_1_expected_unit: exp.year_1_expected_unit,
        year_2_expected: exp.year_2_expected,
        year_2_expected_unit: exp.year_2_expected_unit,
        year_3_expected: exp.year_3_expected,
        year_3_expected_unit: exp.year_3_expected_unit,
        year_4_expected: exp.year_4_expected,
        year_4_expected_unit: exp.year_4_expected_unit,
        year_5_expected: exp.year_5_expected,
        year_5_expected_unit: exp.year_5_expected_unit,
        tolerance: exp.tolerance,
      });
    });

    // Helper to build indicator snapshot data.
    // Category-specific columns are projected through categoryScopedColumns so
    // off-category data preserved on a category change is never emitted into the
    // snapshot (which the LLM report consumes).
    const buildIndicatorSnapshot = (indicator: any) => ({
      id: indicator.id,
      code: indicator.code,
      name: indicator.name,
      description: indicator.description,
      category: indicator.category,
      ...categoryScopedColumns(indicator),
      display_order: indicator.display_order,
      weight: indicator.weight,
      sub_questions: indicator.sub_questions,
      expectations: expectationsMap.get(indicator.id) || null,
    });

    // Helper to build module snapshot data
    const buildModuleSnapshot = (module: any) => ({
      id: module.id,
      name: module.name,
      description: module.description,
      instructions: module.instructions,
      display_order: module.display_order,
      weight: module.weight,
      objective_id: module.objective_id || null,
      indicators: allIndicators
        .filter(ind => ind.module_id === module.id)
        .map(buildIndicatorSnapshot),
    });

    // Build objectives hierarchy (new format)
    const objectivesSnapshot = (objectives || []).map((objective: any) => ({
      id: objective.id,
      name: objective.name,
      description: objective.description,
      display_order: objective.display_order,
      weight: objective.weight,
      modules: (modules || [])
        .filter((m: any) => m.objective_id === objective.id)
        .map(buildModuleSnapshot),
    }));

    // Build the updated snapshot data structure
    const snapshotData = {
      template: {
        id: template.id,
        name: template.name,
        description: template.description,
        area: template.area,
        scoring_config: template.scoring_config,
        created_at: template.created_at,
      },
      // New hierarchy: objectives → modules → indicators
      objectives: objectivesSnapshot,
      // Legacy flat list for backward compatibility
      modules: (modules || []).map(buildModuleSnapshot),
      published_at: new Date().toISOString(),
      published_by: updatedBy,
      last_updated_at: new Date().toISOString(),
      last_updated_by: updatedBy,
    };

    // Update the existing snapshot
    const { error: updateError } = await supabaseAdmin
      .from('assessment_template_snapshots')
      .update({
        snapshot_data: snapshotData,
        version: template.version,
      })
      .eq('id', existingSnapshot.id);

    if (updateError) {
      console.error('Error updating snapshot:', updateError);
      return { success: false, error: 'Error updating snapshot' };
    }

    console.log(`Updated snapshot ${existingSnapshot.id} for template ${templateId}`);
    return {
      success: true,
      snapshotId: existingSnapshot.id,
      version: template.version,
    };
  } catch (err: any) {
    console.error('Unexpected error updating snapshot:', err);
    return { success: false, error: err.message };
  }
}
