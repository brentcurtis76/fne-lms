/**
 * School scope for the directivo results endpoints
 * (/api/directivo/assessments/school-results and course-results).
 *
 * Before this, both endpoints treated any active consultor exactly like an
 * admin and accepted any `school_id`, then read through the admin client: a
 * consultor could read every school's results. Now:
 * - admin: any school, `school_id` required (unchanged);
 * - consultor (not admin): `school_id` required, and it must be one of the
 *   consultor's ACTIVE consultant_assignments, or a school where the same
 *   person is an active equipo_directivo;
 * - equipo_directivo only: their own school (unchanged).
 * Fails closed on a read error.
 */

export type ResultsSchoolScope =
  | { kind: 'ok'; schoolId: number }
  | { kind: 'error'; status: 400 | 403; message: string };

interface RoleRow {
  role_type: string;
  school_id: number | null;
}

export async function resolveResultsSchoolId(
  adminClient: any,
  userId: string,
  roles: RoleRow[],
  querySchoolId: unknown
): Promise<ResultsSchoolScope> {
  const roleTypes = roles.map((r) => r.role_type);
  const isRealAdmin = roleTypes.includes('admin');
  const isConsultor = roleTypes.includes('consultor');

  if (!isRealAdmin && !isConsultor) {
    const directivoRole = roles.find((r) => r.role_type === 'equipo_directivo');
    if (!directivoRole?.school_id) {
      return { kind: 'error', status: 400, message: 'No se encontró la escuela asociada' };
    }
    return { kind: 'ok', schoolId: directivoRole.school_id };
  }

  if (typeof querySchoolId !== 'string' || !querySchoolId) {
    return { kind: 'error', status: 400, message: 'school_id es requerido para administradores' };
  }
  const schoolId = Number.parseInt(querySchoolId, 10);
  if (!Number.isInteger(schoolId) || schoolId <= 0) {
    return { kind: 'error', status: 400, message: 'school_id inválido' };
  }
  if (isRealAdmin) return { kind: 'ok', schoolId };

  if (roles.some((r) => r.role_type === 'equipo_directivo' && r.school_id === schoolId)) {
    return { kind: 'ok', schoolId };
  }

  const { data, error } = await adminClient
    .from('consultant_assignments')
    .select('school_id')
    .eq('consultant_id', userId)
    .eq('is_active', true)
    .eq('school_id', schoolId);
  if (error || !data || data.length === 0) {
    return { kind: 'error', status: 403, message: 'No tienes acceso a los resultados de esta escuela' };
  }
  return { kind: 'ok', schoolId };
}
