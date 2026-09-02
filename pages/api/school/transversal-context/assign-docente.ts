import { NextApiRequest, NextApiResponse } from 'next';
import { getApiUser, createApiSupabaseClient, createServiceRoleClient, sendAuthError, handleMethodNotAllowed } from '@/lib/api-auth';
import { hasDirectivoPermission } from '@/lib/permissions/directivo';
import { Validators } from '@/lib/types/api-auth.types';
import { TEACHING_ELIGIBLE_ROLES } from '@/utils/roleUtils';
import {
  preflightAutoAssignment,
  triggerAutoAssignment,
  type AutoAssignmentResult,
  type CourseAssignmentPlan,
} from '@/lib/services/assessment-builder/autoAssignmentService';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!['POST', 'DELETE'].includes(req.method || '')) {
    return handleMethodNotAllowed(res, ['POST', 'DELETE']);
  }

  // Authentication check
  const { user, error: authError } = await getApiUser(req, res);
  if (authError || !user) {
    return sendAuthError(res, 'Autenticación requerida');
  }

  const supabaseClient = await createApiSupabaseClient(req, res);
  const serviceClient = createServiceRoleClient();

  // Permission check
  const { hasPermission, schoolId, isAdmin } = await hasDirectivoPermission(
    serviceClient,
    user.id
  );

  if (!hasPermission) {
    return res.status(403).json({
      error: 'Solo directivos y administradores pueden asignar docentes'
    });
  }

  const { course_structure_id, docente_id } = req.body;

  if (!course_structure_id || !docente_id) {
    return res.status(400).json({ error: 'Se requiere course_structure_id y docente_id' });
  }

  // Get course structure to verify school ownership
  const { data: course, error: courseError } = await supabaseClient
    .from('school_course_structure')
    .select('id, school_id')
    .eq('id', course_structure_id)
    .single();

  if (courseError || !course) {
    return res.status(404).json({ error: 'Curso no encontrado' });
  }

  // Verify school access for non-admins
  if (!isAdmin && course.school_id !== schoolId) {
    return res.status(403).json({ error: 'No tiene permiso para este curso' });
  }

  const effectiveSchoolId = course.school_id;

  if (req.method === 'POST') {
    return handlePost(res, supabaseClient, serviceClient, course_structure_id, docente_id, effectiveSchoolId, user.id);
  } else if (req.method === 'DELETE') {
    return handleDelete(res, supabaseClient, serviceClient, course_structure_id, docente_id);
  }
}

interface AssignmentOutcome {
  /** A new school_course_docente_assignments row was inserted. */
  created: boolean;
  /** An inactive row for this docente was reactivated. */
  reactivated: boolean;
  /** The docente was already active on this course; nothing was written. */
  alreadyActive: boolean;
  /** created || reactivated */
  mutated: boolean;
}

/** Legacy `autoAssignment` block kept for existing consumers; its `success` is the truthful one. */
function legacyAutoAssignment(result: AutoAssignmentResult) {
  return {
    instancesCreated: result.instancesCreated,
    instancesSkipped: result.instancesSkipped,
    errors: result.errors,
    warnings: result.warnings,
    success: result.success,
  };
}

function joinedWarning(errors: string[], warnings: string[]): string | undefined {
  const parts = [...errors, ...warnings];
  return parts.length > 0 ? parts.join('; ') : undefined;
}

// ── C-01 refusals ───────────────────────────────────────────────────────────
//
// Stable codes for the decisions introduced by PROC-COURSE-OWNER-01 (C-01).
// Every refusal answers the same minimal shape and a safe es-CL message. It
// never carries the current or requested docente's id, name, email or role,
// nor any database message.
type RefusalCode =
  | 'assignment_invariant_violation' // more than one active docente on the course
  | 'course_already_assigned'        // exactly one active docente, and it is not the requested one
  | 'assignment_state_unavailable'   // the active-assignment read failed
  | 'docente_not_eligible_for_school' // target is malformed, unknown, inactive, excluded-role or other-school-only
  | 'docente_eligibility_unavailable'; // the eligibility read failed

const REFUSAL_STATUS: Record<RefusalCode, 409 | 422 | 500> = {
  assignment_invariant_violation: 409,
  course_already_assigned: 409,
  assignment_state_unavailable: 500,
  docente_not_eligible_for_school: 422,
  docente_eligibility_unavailable: 500,
};

const REFUSAL_MESSAGE: Record<RefusalCode, string> = {
  assignment_invariant_violation:
    'Este curso registra más de una asignación activa de docente, lo que no es válido. ' +
    'Se requiere una resolución administrativa controlada antes de poder asignar o cambiar el docente de este curso.',
  course_already_assigned:
    'Este curso ya tiene un docente activo asignado. ' +
    'El reemplazo de docente requiere un proceso controlado; no es posible asignar otro docente desde aquí.',
  assignment_state_unavailable:
    'No se pudo verificar el estado de asignación del curso. Intente nuevamente más tarde.',
  docente_not_eligible_for_school:
    'La persona seleccionada no está habilitada como docente activo en esta escuela.',
  docente_eligibility_unavailable:
    'No se pudo verificar la habilitación del docente en esta escuela. Intente nuevamente más tarde.',
};

function refuse(res: NextApiResponse, code: RefusalCode) {
  const message = REFUSAL_MESSAGE[code];
  // Code only: no identities and no database details reach the log line.
  console.warn('[assign-docente] refused:', code);
  return res.status(REFUSAL_STATUS[code]).json({
    success: false,
    code,
    error: message,
    message,
    assignment: { created: false, reactivated: false, alreadyActive: false, mutated: false },
  });
}

type ActiveAssignmentState =
  | { kind: 'none' }        // zero active rows on the course
  | { kind: 'same' }        // exactly one active row, for the requested docente
  | { kind: 'other' }       // exactly one active row, for a different docente
  | { kind: 'multiple' }    // more than one active row (invariant already violated)
  | { kind: 'unavailable' }; // the read failed — fail closed

/**
 * C-01 course-wide active guard. Uses the caller's user-scoped client (RLS
 * already limited the course to the caller's school) and reads at most two
 * rows: that is enough to distinguish none / one / more-than-one without
 * loading or choosing among the rows. Never single/maybeSingle.
 */
async function readActiveAssignmentState(
  supabaseClient: any,
  courseStructureId: string,
  docenteId: string
): Promise<ActiveAssignmentState> {
  const { data, error } = await supabaseClient
    .from('school_course_docente_assignments')
    .select('id, docente_id')
    .eq('course_structure_id', courseStructureId)
    .eq('is_active', true)
    .limit(2);

  if (error || !Array.isArray(data)) {
    console.error('[assign-docente] active-assignment read failed:', { pgCode: error?.code ?? null });
    return { kind: 'unavailable' };
  }
  if (data.length > 1) return { kind: 'multiple' };
  if (data.length === 1) {
    const active = String(data[0]?.docente_id ?? '').toLowerCase();
    return active === String(docenteId).toLowerCase() ? { kind: 'same' } : { kind: 'other' };
  }
  return { kind: 'none' };
}

type TargetEligibility = 'eligible' | 'ineligible' | 'unavailable';

/**
 * C-01 target eligibility. Runs only after the caller passed course/school
 * authorization and the active guard, and only for requests that could
 * proceed or repair. A non-UUID target is ineligible without touching the
 * database. The role read is exact-school, active, and restricted to
 * TEACHING_ELIGIBLE_ROLES; it selects `user_id` only, uses limit(1) with array
 * semantics (one person may hold several eligible roles at the school), and
 * returns no role row or identity detail to the caller.
 */
async function readTargetEligibility(
  serviceClient: any,
  docenteId: unknown,
  schoolId: number
): Promise<TargetEligibility> {
  if (typeof docenteId !== 'string' || !Validators.isUUID(docenteId)) {
    return 'ineligible';
  }

  const { data, error } = await serviceClient
    .from('user_roles')
    .select('user_id')
    .eq('user_id', docenteId)
    .eq('school_id', schoolId)
    .eq('is_active', true)
    .in('role_type', TEACHING_ELIGIBLE_ROLES)
    .limit(1);

  if (error || !Array.isArray(data)) {
    console.error('[assign-docente] eligibility read failed:', { pgCode: error?.code ?? null });
    return 'unavailable';
  }
  return data.length > 0 ? 'eligible' : 'ineligible';
}

// POST - Assign docente to course
//
// Order after the authorization block above (PROC-COURSE-OWNER-01 C-01 on top
// of PROC-CONTAIN-01 A-02):
// 1. Course-wide ACTIVE guard (user-scoped): more than one active docente →
//    409 assignment_invariant_violation; one active docente that is not the
//    requested one → 409 course_already_assigned. Both refuse before any target
//    inspection, preflight, mutation, cleanup or automatic assignment, and
//    disclose nothing about the current docente.
// 2. Target eligibility (service role, after authorization): the requested
//    docente must be a UUID with an active teaching-eligible role at the
//    course's exact school → otherwise 422 docente_not_eligible_for_school.
// 3. PREFLIGHT (A-02) the eligible templates and current snapshots for the
//    course's grade. If nothing usable exists answer 422 and write nothing.
// 4. Course-docente assignment: the requested docente already active → retain
//    (no read or write of that row); zero active → reactivate the inactive
//    same-pair row or insert a new one. Inactive rows of other docentes never
//    block.
// 5. Auto-assignment (A-02, re-resolves eligibility at write time) with
//    explicit counts. `success` is true only when at least one assessment was
//    created, attached, or confirmed as already existing and no error occurred.
//
// This is an application-layer check only. Two concurrent requests for
// different docentes can both pass step 1 until the one-active-per-course
// database constraint (D-01) lands; nothing here locks, retries or cleans up.
async function handlePost(
  res: NextApiResponse,
  supabaseClient: any,
  serviceClient: any,
  courseStructureId: string,
  docenteId: string,
  schoolId: number,
  assignedBy: string
) {
  try {
    // ── 1. Course-wide active guard (C-01) ───────────────────────────────
    const activeState = await readActiveAssignmentState(supabaseClient, courseStructureId, docenteId);
    if (activeState.kind === 'unavailable') return refuse(res, 'assignment_state_unavailable');
    if (activeState.kind === 'multiple') return refuse(res, 'assignment_invariant_violation');
    if (activeState.kind === 'other') return refuse(res, 'course_already_assigned');

    // ── 2. Target eligibility (C-01) ─────────────────────────────────────
    const eligibility = await readTargetEligibility(serviceClient, docenteId, schoolId);
    if (eligibility === 'unavailable') return refuse(res, 'docente_eligibility_unavailable');
    if (eligibility === 'ineligible') return refuse(res, 'docente_not_eligible_for_school');

    // ── 3. Preflight (read-only) ─────────────────────────────────────────
    const plan: CourseAssignmentPlan = await preflightAutoAssignment(courseStructureId, schoolId);

    if (!plan.ok) {
      const blocking = plan.blockingError ?? {
        code: 'query_error' as const,
        message: 'No se pudo verificar la configuración de evaluaciones para este curso.',
      };
      console.warn('[assign-docente] preflight blocked:', blocking.code, blocking.message);

      return res.status(422).json({
        success: false,
        code: blocking.code,
        error: blocking.message,
        message: blocking.message,
        grade: {
          id: blocking.gradeId ?? plan.gradeId,
          name: blocking.gradeName ?? plan.gradeName,
          level: blocking.gradeLevel ?? plan.gradeLevel,
        },
        templates: blocking.templates,
        assignment: { created: false, reactivated: false, alreadyActive: false, mutated: false },
        assessments: {
          created: 0,
          attached: 0,
          alreadyExisting: 0,
          skipped: plan.skipped.length,
          warnings: plan.warnings,
          errors: [blocking.message],
          details: plan.skipped,
        },
        warnings: plan.warnings,
        autoAssignment: {
          instancesCreated: 0,
          instancesSkipped: plan.skipped.length,
          errors: [blocking.message],
          warnings: plan.warnings,
          success: false,
        },
        warning: joinedWarning([blocking.message], plan.warnings),
      });
    }

    // ── 4. Course-docente assignment ─────────────────────────────────────
    const assignment: AssignmentOutcome = {
      created: false,
      reactivated: false,
      alreadyActive: false,
      mutated: false,
    };

    if (activeState.kind === 'same') {
      // The requested docente is the course's one active docente: retain the
      // row untouched and proceed to the idempotent reconciliation (A-02).
      assignment.alreadyActive = true;
    } else {
      // Zero active rows: only the SAME pair's inactive row may be reactivated;
      // inactive rows of other docentes are irrelevant to this request.
      const { data: existing, error: existingError } = await supabaseClient
        .from('school_course_docente_assignments')
        .select('id, is_active')
        .eq('course_structure_id', courseStructureId)
        .eq('docente_id', docenteId)
        .maybeSingle();

      if (existingError) {
        console.error('Error checking existing assignment:', existingError);
        return res.status(500).json({ error: 'Error al verificar la asignación existente' });
      }

      if (existing?.is_active) {
        // Became active between the guard and this read (same docente): retain, write nothing.
        assignment.alreadyActive = true;
      } else if (existing) {
        // Reactivate existing assignment
        const { error: updateError } = await supabaseClient
          .from('school_course_docente_assignments')
          .update({ is_active: true })
          .eq('id', existing.id);

        if (updateError) {
          console.error('Error reactivating assignment:', updateError);
          return res.status(500).json({ error: 'Error al asignar docente' });
        }
        assignment.reactivated = true;
        assignment.mutated = true;
      } else {
        // Create new assignment
        const { error: insertError } = await supabaseClient
          .from('school_course_docente_assignments')
          .insert({
            course_structure_id: courseStructureId,
            docente_id: docenteId,
            is_active: true,
          });

        if (insertError) {
          console.error('Error creating assignment:', insertError);
          return res.status(500).json({ error: 'Error al asignar docente' });
        }
        assignment.created = true;
        assignment.mutated = true;
      }
    }

    // ── 5. Create / reconcile assessment instances (idempotent) ──────────
    let result: AutoAssignmentResult;
    try {
      result = await triggerAutoAssignment(
        null, // supabase param unused — service uses supabaseAdmin internally
        docenteId,
        courseStructureId,
        schoolId,
        assignedBy
      );
    } catch (autoErr: any) {
      console.error('Error in auto-assignment:', autoErr);
      const message = autoErr?.message || 'Error en asignación automática de evaluaciones';
      result = {
        success: false,
        instancesCreated: 0,
        instancesSkipped: 0,
        counts: { created: 0, attached: 0, alreadyExisting: 0, skipped: 0, errors: 1 },
        errors: [message],
        warnings: [],
        details: [],
      };
    }

    if (result.errors.length > 0) {
      console.error('Auto-assignment errors:', result.errors);
    }
    if (result.warnings.length > 0) {
      console.warn('Auto-assignment warnings:', result.warnings);
    }

    const { created, attached, alreadyExisting, skipped } = result.counts;
    const confirmed = created + attached + alreadyExisting;
    const isBlocking = !result.success || result.errors.length > 0 || confirmed === 0;

    let message: string;
    if (isBlocking) {
      const reason = result.blockingError?.message ?? result.errors[0] ?? 'No se confirmó ninguna evaluación.';
      message = assignment.alreadyActive
        ? `El docente ya estaba asignado al curso, pero no se pudo confirmar ninguna evaluación: ${reason}`
        : `Docente asignado al curso, pero no se pudo confirmar ninguna evaluación: ${reason}`;
    } else if (assignment.alreadyActive && created === 0 && attached === 0) {
      message = `El docente ya estaba asignado y sus evaluaciones están al día (${alreadyExisting} ya existente(s)).`;
    } else {
      message =
        `Docente asignado correctamente. Evaluaciones: ${created} creada(s), ` +
        `${attached} vinculada(s), ${alreadyExisting} ya existente(s).`;
    }

    return res.status(isBlocking ? 207 : 200).json({
      success: !isBlocking,
      code: isBlocking ? (result.blockingError?.code ?? 'assessments_not_confirmed') : undefined,
      error: isBlocking ? message : undefined,
      message,
      assignment,
      assessments: {
        created,
        attached,
        alreadyExisting,
        skipped,
        warnings: result.warnings,
        errors: result.errors,
        details: result.details,
      },
      warnings: result.warnings,
      autoAssignment: legacyAutoAssignment(result),
      warning: isBlocking || result.warnings.length > 0
        ? joinedWarning(result.errors, result.warnings)
        : undefined,
    });
  } catch (err: any) {
    console.error('Unexpected error assigning docente:', err);
    return res.status(500).json({ error: err.message || 'Error al asignar docente' });
  }
}

// DELETE - Unassign docente from course and revoke assessment access
async function handleDelete(
  res: NextApiResponse,
  supabaseClient: any,
  serviceClient: any,
  courseStructureId: string,
  docenteId: string
) {
  try {
    // Soft-delete the course assignment
    const { error } = await supabaseClient
      .from('school_course_docente_assignments')
      .update({ is_active: false })
      .eq('course_structure_id', courseStructureId)
      .eq('docente_id', docenteId);

    if (error) {
      console.error('Error unassigning docente:', error);
      return res.status(500).json({ error: 'Error al desasignar docente' });
    }

    // Revoke assessment access: delete assignee rows for this docente
    // on all instances linked to this course
    let assigneesRevoked = 0;
    let revokeWarning: string | null = null;
    try {
      const { data: instances, error: instancesError } = await serviceClient
        .from('assessment_instances')
        .select('id')
        .eq('course_structure_id', courseStructureId);

      if (instancesError) {
        console.error('Error fetching instances for revocation:', instancesError);
        revokeWarning = 'El docente fue desasignado del curso, pero no se pudo revocar el acceso a las evaluaciones. Contacte al administrador.';
      } else if (instances && instances.length > 0) {
        const instanceIds = instances.map((i: any) => i.id);
        const { data: deleted, error: revokeError } = await serviceClient
          .from('assessment_instance_assignees')
          .delete()
          .in('instance_id', instanceIds)
          .eq('user_id', docenteId)
          .select('id');

        if (revokeError) {
          console.error('Error revoking assessment assignees:', revokeError);
          revokeWarning = 'El docente fue desasignado del curso, pero no se pudo revocar el acceso a las evaluaciones. Contacte al administrador.';
        } else {
          assigneesRevoked = deleted?.length || 0;
        }
      }
    } catch (revokeErr) {
      console.error('Error revoking assessment access:', revokeErr);
      revokeWarning = 'El docente fue desasignado del curso, pero no se pudo revocar el acceso a las evaluaciones. Contacte al administrador.';
    }

    return res.status(revokeWarning ? 207 : 200).json({
      success: !revokeWarning,
      message: revokeWarning || 'Docente desasignado correctamente',
      assigneesRevoked,
      warning: revokeWarning || undefined,
    });
  } catch (err: any) {
    console.error('Unexpected error unassigning docente:', err);
    return res.status(500).json({ error: err.message || 'Error al desasignar docente' });
  }
}
