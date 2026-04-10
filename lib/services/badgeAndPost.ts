import { supabaseAdmin } from '../supabaseAdmin';

/**
 * Awards a course-completion badge and creates a congratulatory
 * community post for the user. Failures are logged as warnings
 * and never propagate — callers can fire-and-forget.
 */
export async function awardBadgeAndPost(
  userId: string,
  courseId: string,
  courseName: string
): Promise<void> {
  // --- Badge ---
  try {
    const { data: badgeResult, error: badgeError } = await supabaseAdmin
      .rpc('award_course_completion_badge', {
        p_user_id: userId,
        p_course_id: courseId,
        p_course_name: courseName,
      });

    if (badgeError) {
      console.warn('Badge award warning:', badgeError.message);
    } else {
      console.log(
        `Badge awarded for user ${userId}:`,
        badgeResult ? 'new badge' : 'already exists'
      );
    }
  } catch (err) {
    console.warn('Badge award failed:', err);
  }

  // --- Community post ---
  try {
    const { data: userRole } = await supabaseAdmin
      .from('user_roles')
      .select('community_id')
      .eq('user_id', userId)
      .eq('is_active', true)
      .not('community_id', 'is', null)
      .limit(1)
      .maybeSingle();

    if (!userRole?.community_id) return;

    const { data: workspace } = await supabaseAdmin
      .from('community_workspaces')
      .select('id')
      .eq('community_id', userRole.community_id)
      .eq('is_active', true)
      .maybeSingle();

    if (!workspace?.id) return;

    const congratsContent = {
      text: `¡Ha ganado la insignia "Curso Completado" por completar el curso "${courseName}"!`,
      formatted: `<p>¡Ha ganado la insignia <strong>"Curso Completado"</strong> por completar el curso <strong>"${courseName}"</strong>!</p>`,
    };

    const { error: postError } = await supabaseAdmin
      .from('community_posts')
      .insert({
        workspace_id: workspace.id,
        author_id: userId,
        type: 'text',
        content: congratsContent,
        visibility: 'community',
      });

    if (postError) {
      console.warn('Community post warning:', postError.message);
    } else {
      console.log(`Congratulatory post created for user ${userId}`);
    }
  } catch (err) {
    console.warn('Community post failed:', err);
  }
}
