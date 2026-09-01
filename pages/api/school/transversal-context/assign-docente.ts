import { NextApiRequest, NextApiResponse } from 'next';
import { getApiUser, createApiSupabaseClient, createServiceRoleClient, sendAuthError, handleMethodNotAllowed } from '@/lib/api-auth';
import { hasDirectivoPermission } from '@/lib/permissions/directivo';
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
    return handlePost(res, supabaseClient, course_structure_id, docente_id, effectiveSchoolId, user.id);
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

// POST - Assign docente to course
//
// PROC-CONTAIN-01 (A-02):
// 1. After auth + course/school authorization (above), PREFLIGHT the eligible
//    templates and current snapshots for the course's grade. If nothing usable
//    exists (or configuration is missing) answer 422 and write nothing.
// 2. Create / reactivate the course-docente assignment. A docente that is
//    already active does NOT return early: the request proceeds to the
//    idempotent reconciliation so a missing instance or assignee link is repaired.
// 3. Run the auto-assignment (re-resolves eligibility at write time) and report
//    explicit counts. `success` is true only when at least one assessment was
//    created, attached, or confirmed as already existing and no error occurred.
async function handlePost(
  res: NextApiResponse,
  supabaseClient: any,
  courseStructureId: string,
  docenteId: string,
  schoolId: number,
  assignedBy: string
) {
  try {
    // ── 1. Preflight (read-only) ─────────────────────────────────────────
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

    // ── 2. Course-docente assignment ─────────────────────────────────────
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

    const assignment: AssignmentOutcome = {
      created: false,
      reactivated: false,
      alreadyActive: false,
      mutated: false,
    };

    if (existing?.is_active) {
      // Same docente already active: no early return — reconcile below.
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

    // ── 3. Create / reconcile assessment instances (idempotent) ──────────
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
