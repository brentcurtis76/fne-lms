import { NextApiRequest, NextApiResponse } from 'next';
import { getApiUser, createApiSupabaseClient, createServiceRoleClient, sendAuthError, handleMethodNotAllowed } from '@/lib/api-auth';
import { hasDirectivoPermission, hasContextWriteRole } from '@/lib/permissions/directivo';
import type { SaveTransversalContextRequest } from '@/types/assessment-builder';
import { GRADE_LEVEL_SORT_ORDER } from '@/types/assessment-builder';

/** Course letters per grade level; also the hard cap on courses_per_level values. */
const COURSE_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
export const MAX_COURSES_PER_LEVEL = COURSE_LETTERS.length;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Authentication check
  const { user, error: authError } = await getApiUser(req, res);
  if (authError || !user) {
    return sendAuthError(res, 'Autenticación requerida');
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    return handleMethodNotAllowed(res, ['GET', 'POST']);
  }

  const supabaseClient = await createApiSupabaseClient(req, res);

  // Get school_id from query for GET, or from body for POST
  const querySchoolId = req.query.school_id ? parseInt(req.query.school_id as string) : undefined;
  const bodySchoolId = req.body?.school_id ? parseInt(req.body.school_id) : undefined;
  const requestedSchoolId = req.method === 'GET' ? querySchoolId : bodySchoolId;

  // Permission check
  const { hasPermission, schoolId, isAdmin } = await hasDirectivoPermission(
    supabaseClient,
    user.id,
    requestedSchoolId
  );

  if (!hasPermission) {
    return res.status(403).json({
      error: 'Solo directivos y administradores pueden acceder al contexto transversal'
    });
  }

  // R5 — consultor access is DENIED on this whole surface (GET and POST)
  // until the product decision (deny entirely vs. designed read-only) is
  // taken. hasDirectivoPermission admits assigned consultores; they hold no
  // context-write role, so this gate refuses them consistently. Nothing is
  // read with the service role on their behalf.
  const canAccess = isAdmin || (await hasContextWriteRole(supabaseClient, user.id));
  if (!canAccess) {
    return res.status(403).json({
      success: false,
      code: 'consultor_access_pending_decision',
      error: 'El acceso de consultores al contexto transversal está pendiente de definición. Solo el equipo directivo y los administradores pueden acceder.',
    });
  }

  // For non-admin users, we must have a school_id
  if (!isAdmin && !schoolId) {
    return res.status(400).json({
      error: 'No se encontró escuela asociada al usuario'
    });
  }

  // For admin, require school_id in request
  if (isAdmin && !requestedSchoolId) {
    return res.status(400).json({
      error: 'Se requiere school_id para administradores'
    });
  }

  const effectiveSchoolId = isAdmin ? requestedSchoolId : schoolId;

  if (req.method === 'GET') {
    return handleGet(req, res, supabaseClient, effectiveSchoolId!);
  }
  return handlePost(req, res, supabaseClient, effectiveSchoolId!, user.id);
}

// GET /api/school/transversal-context
//
// The context, the course structure and the assignments are read with the
// caller's USER client, so RLS — not this route — decides what is visible.
// Only the docente display names are resolved with the service role, after
// authorisation succeeded, because profiles are self-readable only.
async function handleGet(
  req: NextApiRequest,
  res: NextApiResponse,
  supabaseClient: any,
  schoolId: number
) {
  try {
    // Fetch existing transversal context
    const { data: context, error: contextError } = await supabaseClient
      .from('school_transversal_context')
      .select('*')
      .eq('school_id', schoolId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (contextError) {
      console.error('Error fetching transversal context:', contextError);
      return res.status(500).json({ error: 'Error al obtener el contexto transversal' });
    }

    const { data: rawCourseStructure, error: courseError } = await supabaseClient
      .from('school_course_structure')
      .select(`
        id,
        school_id,
        grade_level,
        course_name,
        created_at,
        school_course_docente_assignments (
          id,
          docente_id,
          is_active,
          assigned_at
        )
      `)
      .eq('school_id', schoolId)
      .order('grade_id', { ascending: true })
      .order('course_name', { ascending: true });

    if (courseError) {
      console.error('Error fetching course structure:', courseError);
      return res.status(500).json({ error: 'Error al obtener la estructura de cursos' });
    }

    // Resolve docente names separately (docente_id FK points to auth.users, not profiles)
    let courseStructure = rawCourseStructure || [];
    if (courseStructure.length > 0) {
      const docenteIds = [...new Set(
        courseStructure.flatMap((c: any) =>
          (c.school_course_docente_assignments || [])
            .filter((a: any) => a.is_active)
            .map((a: any) => a.docente_id)
        )
      )];

      if (docenteIds.length > 0) {
        const profileClient = createServiceRoleClient();
        const { data: docenteProfiles } = await profileClient
          .from('profiles')
          .select('id, name, email')
          .in('id', docenteIds);

        const profilesMap = Object.fromEntries(
          (docenteProfiles || []).map((p: any) => [p.id, p])
        );

        // Attach profiles to assignments
        courseStructure = courseStructure.map((course: any) => ({
          ...course,
          school_course_docente_assignments: (course.school_course_docente_assignments || []).map((a: any) => ({
            ...a,
            profiles: profilesMap[a.docente_id] || null,
          })),
        }));
      }
    }

    return res.status(200).json({
      success: true,
      context: context || null,
      courseStructure: courseStructure || [],
    });
  } catch (err: any) {
    console.error('Unexpected error fetching transversal context:', err);
    return res.status(500).json({ error: err.message || 'Error al obtener contexto transversal' });
  }
}

// ---------------------------------------------------------------------------
// POST — validation + one transactional RPC
// ---------------------------------------------------------------------------

export interface BlockedCourse {
  id: string;
  course_name: string;
  grade_level: string;
  activeAssignments: number;
  inactiveAssignments: number;
  instances: number;
  archivedInstances: number;
}

/** The exact GradeLevel allowlist (mirrors the SQL allowlist in save_transversal_context). */
export const GRADE_LEVEL_ALLOWLIST: readonly string[] = Object.keys(GRADE_LEVEL_SORT_ORDER);

/**
 * Validates the POST body FAIL CLOSED. Returns an es-CL message on the first
 * problem, or the normalised courses_per_level (only the submitted grade
 * levels, each an integer 1..MAX_COURSES_PER_LEVEL, defaulting to 1) when
 * everything is valid. The database RPC re-validates every rule; this layer
 * only turns the common mistakes into a fast 400.
 */
export function validateContextBody(
  body: any
): { ok: false; error: string } | { ok: true; coursesPerLevel: Record<string, number> } {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Cuerpo de la solicitud inválido' };
  }

  if (!Number.isInteger(body.total_students) || body.total_students < 1) {
    return { ok: false, error: 'Se requiere el número total de estudiantes' };
  }

  if (!Array.isArray(body.grade_levels) || body.grade_levels.length === 0) {
    return { ok: false, error: 'Se requiere al menos un nivel educativo' };
  }

  if (!body.grade_levels.every((g: unknown) => typeof g === 'string' && g.length > 0)) {
    return { ok: false, error: 'Los niveles educativos deben ser textos válidos' };
  }

  const unknownLevel = (body.grade_levels as string[]).find(g => !GRADE_LEVEL_ALLOWLIST.includes(g));
  if (unknownLevel !== undefined) {
    return { ok: false, error: 'Uno de los niveles educativos no es un nivel reconocido' };
  }

  if (new Set(body.grade_levels).size !== body.grade_levels.length) {
    return { ok: false, error: 'Los niveles educativos no pueden repetirse' };
  }

  const year = body.implementation_year_2026;
  if (!Number.isInteger(year) || year < 1 || year > 5) {
    return { ok: false, error: 'Se requiere un año de implementación válido (1-5)' };
  }

  if (!body.period_system || !['semestral', 'trimestral'].includes(body.period_system)) {
    return { ok: false, error: 'Se requiere un sistema de períodos válido' };
  }

  const rawCourses = body.courses_per_level ?? {};
  if (typeof rawCourses !== 'object' || rawCourses === null || Array.isArray(rawCourses)) {
    return { ok: false, error: 'La cantidad de cursos por nivel debe ser un objeto por nivel educativo' };
  }

  const coursesPerLevel: Record<string, number> = {};
  for (const level of body.grade_levels as string[]) {
    const value = rawCourses[level];
    if (value === undefined || value === null) {
      coursesPerLevel[level] = 1;
      continue;
    }
    if (!Number.isInteger(value) || value < 1 || value > MAX_COURSES_PER_LEVEL) {
      return {
        ok: false,
        error: `La cantidad de cursos para ${level.replace(/_/g, ' ')} debe ser un número entero entre 1 y ${MAX_COURSES_PER_LEVEL}`,
      };
    }
    coursesPerLevel[level] = value;
  }

  return { ok: true, coursesPerLevel };
}

type SaveRefusal = {
  status: 400 | 403 | 409 | 500;
  code: string;
  error: string;
  blockedCourses?: BlockedCourse[];
};

const DEPENDENCY_MESSAGE =
  'No se guardó el contexto: la nueva configuración eliminaría cursos que tienen docentes asignados o evaluaciones registradas (%NAMES%). ' +
  'El historial de asignaciones y evaluaciones se conserva; mantenga los niveles y cantidades actuales o solicite una resolución administrativa.';

const P0001_MESSAGES: Record<string, { status: 400 | 409; error: string }> = {
  invalid_payload: { status: 400, error: 'Cuerpo de la solicitud inválido' },
  invalid_total_students: { status: 400, error: 'Se requiere el número total de estudiantes' },
  invalid_grade_levels: { status: 400, error: 'Se requiere al menos un nivel educativo válido' },
  invalid_grade_level: { status: 400, error: 'Uno de los niveles educativos no es un nivel reconocido' },
  duplicate_grade_levels: { status: 400, error: 'Los niveles educativos no pueden repetirse' },
  invalid_year: { status: 400, error: 'Se requiere un año de implementación válido (1-5)' },
  invalid_period_system: { status: 400, error: 'Se requiere un sistema de períodos válido' },
  invalid_courses_per_level: { status: 400, error: `La cantidad de cursos por nivel debe ser un número entero entre 1 y ${MAX_COURSES_PER_LEVEL}` },
  invalid_programa_inicia: { status: 400, error: 'Los datos del Programa Inicia no son válidos' },
  grade_mapping_missing: { status: 409, error: 'No existe el nivel en el catálogo de niveles (ab_grades); no se creó ningún curso. Contacte al administrador.' },
  grade_mapping_ambiguous: { status: 409, error: 'El catálogo de niveles (ab_grades) es ambiguo para uno de los niveles; no se creó ningún curso. Contacte al administrador.' },
};

function parseBlockedCourses(detail: unknown): BlockedCourse[] {
  if (typeof detail !== 'string' || detail.length === 0) return [];
  try {
    const parsed = JSON.parse(detail);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((b: any) => b && typeof b === 'object' && typeof b.id === 'string')
      .map((b: any) => ({
        id: String(b.id),
        course_name: String(b.course_name ?? ''),
        grade_level: String(b.grade_level ?? ''),
        activeAssignments: Number(b.activeAssignments ?? 0),
        inactiveAssignments: Number(b.inactiveAssignments ?? 0),
        instances: Number(b.instances ?? 0),
        archivedInstances: Number(b.archivedInstances ?? 0),
      }));
  } catch {
    return [];
  }
}

/** Maps a save_transversal_context refusal to the HTTP contract. Exported for tests. */
export function mapSaveRpcError(error: any): SaveRefusal {
  const pgCode: string = String(error?.code ?? '');
  const message: string = String(error?.message ?? '');

  if (pgCode === '42501') {
    return {
      status: 403,
      code: 'context_write_forbidden',
      error: 'Solo el equipo directivo de la escuela y los administradores pueden guardar el contexto transversal',
    };
  }

  if (pgCode === 'P0001') {
    const token = message.split(':')[0].trim();
    if (token === 'courses_have_dependencies') {
      const blocked = parseBlockedCourses(error?.details);
      const names = blocked.map(b => b.course_name).join(', ');
      return {
        status: 409,
        code: 'courses_have_dependencies',
        error: DEPENDENCY_MESSAGE.replace('%NAMES%', names || 'cursos con historial'),
        blockedCourses: blocked,
      };
    }
    const known = P0001_MESSAGES[token];
    if (known) return { status: known.status, code: token, error: known.error };
  }

  return { status: 500, code: 'context_save_failed', error: 'Error al guardar el contexto transversal' };
}

// POST /api/school/transversal-context
//
// After the handler's auth + write-role gates: validate (fast 400), then ONE
// call to the transactional RPC on the USER client (auth.uid() is the caller;
// the function re-authorises against the same predicate as the table
// policies). Either the context, its history, the completion flag and the
// whole course reconciliation land together, or nothing does. There is no
// partial-success response.
async function handlePost(
  req: NextApiRequest,
  res: NextApiResponse,
  supabaseClient: any,
  schoolId: number,
  _userId: string
) {
  try {
    const body = req.body as SaveTransversalContextRequest;

    const validation = validateContextBody(body);
    if (validation.ok === false) {
      return res.status(400).json({ success: false, code: 'invalid_request', error: validation.error });
    }

    const payload = {
      total_students: body.total_students,
      grade_levels: body.grade_levels,
      courses_per_level: validation.coursesPerLevel,
      implementation_year_2026: body.implementation_year_2026,
      period_system: body.period_system,
      programa_inicia_completed: body.programa_inicia_completed || false,
      programa_inicia_hours: body.programa_inicia_hours ?? null,
      programa_inicia_year: body.programa_inicia_year ?? null,
    };

    const { data, error } = await supabaseClient.rpc('save_transversal_context', {
      p_school_id: schoolId,
      p_payload: payload,
    });

    if (error) {
      const refusal = mapSaveRpcError(error);
      if (refusal.status === 500) {
        console.error('[transversal-context] save failed:', { pgCode: error?.code ?? null });
      } else {
        console.warn('[transversal-context] save refused:', refusal.code);
      }
      return res.status(refusal.status).json({
        success: false,
        code: refusal.code,
        error: refusal.error,
        ...(refusal.blockedCourses ? { blockedCourses: refusal.blockedCourses } : {}),
      });
    }

    const result = (data ?? {}) as {
      context?: any;
      action?: string;
      courses_generated?: number;
      courses_deleted?: number;
      courses_relinked?: number;
      year_changed?: boolean;
    };

    if (!result.context) {
      console.error('[transversal-context] save returned no context');
      return res.status(500).json({ success: false, code: 'context_save_failed', error: 'Error al guardar el contexto transversal' });
    }

    const yearChanged = result.year_changed === true;
    return res.status(200).json({
      success: true,
      context: result.context,
      message: result.action === 'update' ? 'Contexto actualizado exitosamente' : 'Contexto guardado exitosamente',
      coursesGenerated: result.courses_generated ?? 0,
      coursesDeleted: result.courses_deleted ?? 0,
      coursesRelinked: result.courses_relinked ?? 0,
      yearChanged,
      warning: yearChanged
        ? 'El año de transformación cambió. Las evaluaciones ya creadas conservan el año con el que fueron generadas; no se reescriben.'
        : null,
    });
  } catch (err: any) {
    console.error('Unexpected error saving transversal context:', err);
    return res.status(500).json({ success: false, code: 'context_save_failed', error: 'Error al guardar el contexto transversal' });
  }
}
