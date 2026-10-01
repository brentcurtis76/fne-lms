import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Who may read a vías de transformación assessment — the rule of
 * GET /api/vias-transformacion/[id], in one place for the routes that expose
 * an assessment's data (its collaborators, or which colleagues already
 * collaborate on it): an active admin or consultor, an active member of the
 * assessment's school, its creator, or one of its collaborators.
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
  if (rows.some((r) => r.role_type === 'admin' || r.role_type === 'consultor')) return true;
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
