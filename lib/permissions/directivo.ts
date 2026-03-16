/**
 * Shared permission check for directivo-level endpoints.
 * Grants access to: equipo_directivo (own school), consultor (assigned schools), admin (any school).
 */
export async function hasDirectivoPermission(
  supabaseClient: any,
  userId: string,
  schoolId?: number
): Promise<{ hasPermission: boolean; schoolId: number | null; isAdmin: boolean }> {
  const { data: roles } = await supabaseClient
    .from('user_roles')
    .select('role_type, school_id')
    .eq('user_id', userId)
    .eq('is_active', true);

  if (!roles || roles.length === 0) {
    return { hasPermission: false, schoolId: null, isAdmin: false };
  }

  const isActualAdmin = roles.some((r: any) => r.role_type === 'admin');

  if (isActualAdmin) {
    return { hasPermission: true, schoolId: schoolId || null, isAdmin: true };
  }

  // Check directivo FIRST (before consultor) to avoid shadowing
  const directivoRole = roles.find((r: any) => r.role_type === 'equipo_directivo');
  if (directivoRole) {
    if (schoolId && directivoRole.school_id !== schoolId) {
      return { hasPermission: false, schoolId: null, isAdmin: false };
    }
    return { hasPermission: true, schoolId: directivoRole.school_id, isAdmin: false };
  }

  // Consultor: must validate against consultant_assignments
  const isConsultor = roles.some((r: any) => r.role_type === 'consultor');
  if (isConsultor) {
    const { data: assignments } = await supabaseClient
      .from('consultant_assignments')
      .select('school_id')
      .eq('consultant_id', userId)
      .eq('is_active', true);

    if (!assignments || assignments.length === 0) {
      return { hasPermission: false, schoolId: null, isAdmin: false };
    }

    const assignedSchoolIds = assignments.map((a: any) => a.school_id);

    if (schoolId && !assignedSchoolIds.includes(schoolId)) {
      return { hasPermission: false, schoolId: null, isAdmin: false };
    }

    return { hasPermission: true, schoolId: schoolId || assignments[0].school_id, isAdmin: false };
  }

  return { hasPermission: false, schoolId: null, isAdmin: false };
}
