import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Who may read a vías de transformación assessment — the rule of
 * GET /api/vias-transformacion/[id], in one place for the routes that expose
 * an assessment's data (its collaborators, or which colleagues already
 * collaborate on it): an active admin, a consultor assigned to the
 * assessment's school, an active member of that school, its creator, or one
 * of its collaborators.
 *
 * `userId` must be the verified caller (requireVerifiedCaller), and `service`
 * the service-role client, so the answer never depends on what row security
 * shows the caller. A failed lookup throws; callers answer 500 (fail closed).
 */
export interface ViasAssessmentRef {
  id: string;
  school_id: number | null;
  created_by: string | null;
}

/**
 * Staff scope on vías de transformación: an active admin acts on every
 * school; a consultor (not admin) only on the schools of their ACTIVE
 * consultant_assignments. Before this, any active consultor was treated as an
 * admin everywhere. `roles` are the caller's active user_roles rows. A failed
 * assignment read throws (fail closed).
 */
export interface ViasStaffScope {
  isAdmin: boolean;
  consultorSchoolIds: number[];
}

export async function loadViasStaffScope(
  service: SupabaseClient,
  userId: string,
  roles: Array<{ role_type: string }> | null | undefined
): Promise<ViasStaffScope> {
  const rows = roles ?? [];
  if (rows.some((r) => r.role_type === 'admin')) return { isAdmin: true, consultorSchoolIds: [] };
  if (!rows.some((r) => r.role_type === 'consultor')) return { isAdmin: false, consultorSchoolIds: [] };
  const { data, error } = await service
    .from('consultant_assignments')
    .select('school_id')
    .eq('consultant_id', userId)
    .eq('is_active', true);
  if (error) throw new Error(`consultant assignment lookup failed: ${error.message}`);
  const ids = ((data ?? []) as Array<{ school_id: unknown }>)
    .map((a) => Number(a.school_id))
    .filter((id) => Number.isSafeInteger(id) && id > 0);
  return { isAdmin: false, consultorSchoolIds: [...new Set(ids)] };
}

/** True when the scope acts as staff (admin-like) on `schoolId`. */
export function isViasStaffFor(scope: ViasStaffScope, schoolId: unknown): boolean {
  if (scope.isAdmin) return true;
  if (schoolId === null || schoolId === undefined || schoolId === '') return false;
  const id = Number(schoolId);
  return Number.isSafeInteger(id) && scope.consultorSchoolIds.includes(id);
}

export async function loadViasAssessment(
  service: SupabaseClient,
  assessmentId: string
): Promise<ViasAssessmentRef | null> {
  const { data, error } = await service
    .from('transformation_assessments')
    .select('id, school_id, created_by')
    .eq('id', assessmentId)
    .maybeSingle();
  if (error) throw new Error(`assessment lookup failed: ${error.message}`);
  return (data as ViasAssessmentRef | null) ?? null;
}

export async function canReadViasAssessment(
  service: SupabaseClient,
  userId: string,
  assessment: ViasAssessmentRef
): Promise<boolean> {
  if (assessment.created_by === userId) return true;

  const { data: roles, error: rolesError } = await service
    .from('user_roles')
    .select('role_type, school_id')
    .eq('user_id', userId)
    .eq('is_active', true);
  if (rolesError) throw new Error(`role lookup failed: ${rolesError.message}`);
  const rows = (roles ?? []) as Array<{ role_type: string; school_id: number | null }>;
  if (isViasStaffFor(await loadViasStaffScope(service, userId, rows), assessment.school_id)) return true;
  if (assessment.school_id !== null && rows.some((r) => r.school_id === assessment.school_id)) return true;

  const { data: collaborator, error: collabError } = await service
    .from('transformation_assessment_collaborators')
    .select('user_id')
    .eq('assessment_id', assessment.id)
    .eq('user_id', userId)
    .maybeSingle();
  if (collabError) throw new Error(`collaborator lookup failed: ${collabError.message}`);
  return !!collaborator;
}
