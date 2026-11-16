import type { SupabaseClient } from '@supabase/supabase-js';
import { loggableError } from '../api-auth';

/**
 * Whether a reviewer may open and save the quiz review of a learner's submission.
 * One rule for GET /api/quiz-reviews/[id] and POST /api/quiz-reviews/submit-review:
 *   - an admin: always;
 *   - a consultor: when one of their active consultant_assignments covers the learner
 *     (individual → student_id; school / generation / community → the learner has an
 *     active user_roles row in that school / generation / community);
 *   - an equipo_directivo: when the learner has an active user_roles row in a school of
 *     one of the reviewer's active equipo_directivo roles;
 *   - anyone else: never.
 * Decided by reading the learner's own active user_roles rows once, never by listing
 * everyone a reviewer covers (the database service cuts lists at 1,000 rows).
 * A database error in any lookup throws; the routes answer 500.
 */
export async function canReviewSubmission(
  serviceClient: SupabaseClient,
  reviewerId: string,
  activeRoleTypes: string[],
  studentId: string
): Promise<boolean> {
  if (activeRoleTypes.includes('admin')) return true;

  // The learner's own active role rows: the scope is decided by looking the learner up,
  // never by listing everyone a reviewer covers (lists are cut at 1,000 rows).
  const { data: learnerRows, error: learnerError } = await serviceClient
    .from('user_roles')
    .select('school_id, generation_id, community_id')
    .eq('user_id', studentId)
    .eq('is_active', true);
  if (learnerError) throw new Error('Failed to verify access');
  const learner = learnerRows || [];
  const learnerHas = (column: 'school_id' | 'generation_id' | 'community_id', id: unknown) =>
    id !== null && id !== undefined && learner.some(r => r[column] !== null && r[column] !== undefined && String(r[column]) === String(id));

  if (activeRoleTypes.includes('consultor')) {
    const { data: assignments, error: assignmentsError } = await serviceClient
      .from('consultant_assignments')
      .select('student_id, school_id, generation_id, community_id, assignment_data')
      .eq('consultant_id', reviewerId)
      .eq('is_active', true);

    if (assignmentsError) {
      console.error('Error fetching consultant assignments:', loggableError(assignmentsError));
      throw new Error('Failed to verify access');
    }

    for (const assignment of (assignments || [])) {
      const scope = assignment.assignment_data?.assignment_scope || 'individual';

      if (scope === 'individual' && assignment.student_id && String(assignment.student_id) === String(studentId)) return true;
      if (scope === 'school' && learnerHas('school_id', assignment.school_id)) return true;
      if (scope === 'generation' && learnerHas('generation_id', assignment.generation_id)) return true;
      if (scope === 'community' && learnerHas('community_id', assignment.community_id)) return true;
    }
  }

  if (activeRoleTypes.includes('equipo_directivo')) {
    const { data: directivoRoles, error: directivoError } = await serviceClient
      .from('user_roles')
      .select('school_id')
      .eq('user_id', reviewerId)
      .eq('role_type', 'equipo_directivo')
      .eq('is_active', true);
    if (directivoError) throw new Error('Failed to verify access');

    if ((directivoRoles || []).some(r => learnerHas('school_id', r.school_id))) return true;
  }

  return false;
}
