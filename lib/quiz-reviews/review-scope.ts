import type { SupabaseClient } from '@supabase/supabase-js';
import { loggableError } from '../api-auth';

/**
 * Whether a reviewer may open and save the quiz review of a learner's submission.
 * One rule for GET /api/quiz-reviews/[id] and POST /api/quiz-reviews/submit-review:
 *   - an admin: always;
 *   - a consultor: when one of their active consultant_assignments covers the learner
 *     (individual → student_id; school / generation / community → the active user_roles
 *     of that school / generation / community);
 *   - an equipo_directivo: when the learner has an active user_roles row in a school of
 *     one of the reviewer's active equipo_directivo roles;
 *   - anyone else: never.
 * A database error in any lookup throws; the routes answer 500.
 */
export async function canReviewSubmission(
  serviceClient: SupabaseClient,
  reviewerId: string,
  activeRoleTypes: string[],
  studentId: string
): Promise<boolean> {
  if (activeRoleTypes.includes('admin')) return true;

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

    // Build list of allowed student IDs
    const allowedStudentIds = new Set<string>();

    for (const assignment of (assignments || [])) {
      const scope = assignment.assignment_data?.assignment_scope || 'individual';

      if (scope === 'individual' && assignment.student_id) {
        allowedStudentIds.add(assignment.student_id);
      } else if (scope === 'school' && assignment.school_id) {
        const { data: schoolUsers, error } = await serviceClient
          .from('user_roles')
          .select('user_id')
          .eq('school_id', assignment.school_id)
          .eq('is_active', true);
        if (error) throw new Error('Failed to verify access');
        if (schoolUsers) {
          schoolUsers.forEach(u => allowedStudentIds.add(u.user_id));
        }
      } else if (scope === 'generation' && assignment.generation_id) {
        const { data: genUsers, error } = await serviceClient
          .from('user_roles')
          .select('user_id')
          .eq('generation_id', assignment.generation_id)
          .eq('is_active', true);
        if (error) throw new Error('Failed to verify access');
        if (genUsers) {
          genUsers.forEach(u => allowedStudentIds.add(u.user_id));
        }
      } else if (scope === 'community' && assignment.community_id) {
        const { data: communityUsers, error } = await serviceClient
          .from('user_roles')
          .select('user_id')
          .eq('community_id', assignment.community_id)
          .eq('is_active', true);
        if (error) throw new Error('Failed to verify access');
        if (communityUsers) {
          communityUsers.forEach(u => allowedStudentIds.add(u.user_id));
        }
      }
    }

    if (allowedStudentIds.has(studentId)) return true;
  }

  if (activeRoleTypes.includes('equipo_directivo')) {
    const { data: directivoRoles, error: directivoError } = await serviceClient
      .from('user_roles')
      .select('school_id')
      .eq('user_id', reviewerId)
      .eq('role_type', 'equipo_directivo')
      .eq('is_active', true);
    if (directivoError) throw new Error('Failed to verify access');

    const schoolIds = Array.from(
      new Set((directivoRoles || []).map(r => r.school_id).filter((id): id is number => id !== null && id !== undefined))
    );
    if (schoolIds.length > 0) {
      const { data: learnerRoles, error: learnerError } = await serviceClient
        .from('user_roles')
        .select('school_id')
        .eq('user_id', studentId)
        .eq('is_active', true)
        .in('school_id', schoolIds);
      if (learnerError) throw new Error('Failed to verify access');
      if ((learnerRoles || []).length > 0) return true;
    }
  }

  return false;
}
