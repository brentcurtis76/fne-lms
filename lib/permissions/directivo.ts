/**
 * How a directivo-level permission was granted. `via` is the role that
 * admitted the caller (admin > equipo_directivo > consultor precedence). The
 * consultor-scoped surfaces (change history, completion status) read it to
 * restrict an admitted consultor to the migration-plan feature only; every
 * other value of `via`, including a missing one, is treated as consultor
 * scope on those surfaces (fail closed).
 */
export type DirectivoPermissionVia = 'admin' | 'equipo_directivo' | 'consultor';

export interface DirectivoPermission {
  hasPermission: boolean;
  schoolId: number | null;
  isAdmin: boolean;
  via: DirectivoPermissionVia | null;
}

const DENIED: DirectivoPermission = { hasPermission: false, schoolId: null, isAdmin: false, via: null };

/**
 * Shared permission check for directivo-level endpoints.
 * Grants access to: equipo_directivo (own school), consultor (assigned schools), admin (any school).
 */
export async function hasDirectivoPermission(
  supabaseClient: any,
  userId: string,
  schoolId?: number
): Promise<DirectivoPermission> {
  const { data: roles } = await supabaseClient
    .from('user_roles')
    .select('role_type, school_id')
    .eq('user_id', userId)
    .eq('is_active', true);

  if (!roles || roles.length === 0) {
    return DENIED;
  }

  const isActualAdmin = roles.some((r: any) => r.role_type === 'admin');

  if (isActualAdmin) {
    return { hasPermission: true, schoolId: schoolId || null, isAdmin: true, via: 'admin' };
  }

  // Check directivo FIRST (before consultor) to avoid shadowing
  const directivoRole = roles.find((r: any) => r.role_type === 'equipo_directivo');
  if (directivoRole) {
    if (schoolId && directivoRole.school_id !== schoolId) {
      return DENIED;
    }
    return { hasPermission: true, schoolId: directivoRole.school_id, isAdmin: false, via: 'equipo_directivo' };
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
      return DENIED;
    }

    const assignedSchoolIds = assignments.map((a: any) => a.school_id);

    if (schoolId && !assignedSchoolIds.includes(schoolId)) {
      return DENIED;
    }

    return { hasPermission: true, schoolId: schoolId || assignments[0].school_id, isAdmin: false, via: 'consultor' };
  }

  return DENIED;
}

/**
 * True when the permission was granted through a full directivo-level role
 * (admin or equipo_directivo). A consultor admission — or any permission
 * object that does not name a full role — is NOT full scope. Used by the
 * surfaces that keep the documented migration-plan-only consultor access.
 */
export function isFullDirectivoScope(permission: Pick<DirectivoPermission, 'isAdmin' | 'via'>): boolean {
  return permission.isAdmin === true || permission.via === 'equipo_directivo';
}

/** The one feature an admitted consultor may read on the scoped surfaces. */
export const CONSULTOR_READABLE_FEATURE = 'migration_plan' as const;

/** Roles allowed to WRITE the transversal context and to assign/revoke docentes. */
export const CONTEXT_WRITE_ROLES = ['admin', 'equipo_directivo'] as const;

/**
 * True when the user holds an active admin or equipo_directivo role.
 * `hasDirectivoPermission` admits assigned consultores for READ surfaces; the
 * write surfaces (context save, docente assignment) call this afterwards to
 * refuse them. Fails closed on any read error.
 */
export async function hasContextWriteRole(
  supabaseClient: any,
  userId: string
): Promise<boolean> {
  const { data: roles, error } = await supabaseClient
    .from('user_roles')
    .select('role_type')
    .eq('user_id', userId)
    .eq('is_active', true);

  if (error || !roles) return false;
  return roles.some((r: any) => (CONTEXT_WRITE_ROLES as readonly string[]).includes(r.role_type));
}
