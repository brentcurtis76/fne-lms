import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import NotificationService from '../../../lib/notificationService';
import { awardBadgeAndPost } from '../../../lib/services/badgeAndPost';
import { checkAprobadoEligibility } from '../../../lib/utils/aprobadoCheck';

// Create admin client with service role key for elevated permissions
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

// Regular client for auth verification
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Only allow POST method
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    // Get auth header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid authorization header' });
    }

    // Verify the user is authenticated
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return res.status(401).json({ error: 'Invalid authentication token' });
    }

    // Check if user has permission to provide feedback (admin or instructor)
    const { data: profileData } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!profileData || !['admin', 'docente'].includes(profileData.role)) {
      return res.status(403).json({ error: 'Insufficient permissions to provide feedback' });
    }

    const { assignment_id, student_id, feedback_text, grade, status } = req.body;
    
    if (!assignment_id || !student_id || !feedback_text) {
      return res.status(400).json({ error: 'Missing required fields: assignment_id, student_id, feedback_text' });
    }

    // Create or update assignment feedback
    const feedbackData = {
      assignment_id,
      student_id,
      instructor_id: user.id,
      feedback_text,
      grade: grade || null,
      status: status || 'reviewed',
      provided_at: new Date().toISOString()
    };

    const { data: feedbackResult, error: feedbackError } = await supabaseAdmin
      .from('assignment_feedback')
      .upsert(feedbackData, { 
        onConflict: 'assignment_id,student_id',
        ignoreDuplicates: false 
      })
      .select()
      .single();

    if (feedbackError) {
      console.error('Error creating/updating feedback:', feedbackError);
      return res.status(500).json({ error: 'Failed to save feedback: ' + feedbackError.message });
    }

    // Get assignment and course details for notification
    const { data: assignmentData } = await supabaseAdmin
      .from('lesson_assignments')
      .select(`
        title,
        course_id,
        courses!inner (title)
      `)
      .eq('id', assignment_id)
      .single();

    // Trigger feedback notification
    try {
      await NotificationService.triggerNotification('assignment_feedback', {
        assignment_id,
        course_id: assignmentData?.course_id,
        student_id,
        assignment_name: assignmentData?.title || 'Tarea',
        course_name: (assignmentData?.courses as any)?.title || 'Curso',
        feedback_text: feedback_text.substring(0, 100),
        grade,
        instructor_id: user.id
      });

      console.log(`✅ Feedback notification triggered for student ${student_id}`);
    } catch (notificationError) {
      console.error('❌ Failed to trigger feedback notification:', notificationError);
      // Don't fail the API call if notifications fail
    }

    // --- Aprobado eligibility check ---
    try {
      const courseId = assignmentData?.course_id;
      const courseName = (assignmentData?.courses as any)?.title || 'Curso';

      if (courseId) {
        // Guard: skip if 'aprobado' record already exists
        const { data: existingAprobado } = await supabaseAdmin
          .from('course_completions')
          .select('id')
          .eq('user_id', student_id)
          .eq('course_id', courseId)
          .eq('completion_type', 'aprobado')
          .maybeSingle();

        if (!existingAprobado) {
          // Total assignments for the course
          const { count: totalAssignments } = await supabaseAdmin
            .from('lesson_assignments')
            .select('id', { count: 'exact', head: true })
            .eq('course_id', courseId)
            .eq('is_published', true);

          if ((totalAssignments ?? 0) > 0) {
            let passedAssignments = 0;

            // Individual submissions
            const { count: indivCount } = await supabaseAdmin
              .from('lesson_assignment_submissions')
              .select('id', { count: 'exact', head: true })
              .eq('student_id', student_id)
              .in('status', ['submitted', 'graded', 'reviewed']);

            passedAssignments += indivCount ?? 0;

            // Group submissions (CRITICAL: use user_id, NOT submitted_by)
            const { count: groupCount } = await supabaseAdmin
              .from('group_assignment_submissions')
              .select('id', { count: 'exact', head: true })
              .eq('user_id', student_id);

            passedAssignments += groupCount ?? 0;

            // Feedback count
            const { count: feedbackTotal } = await supabaseAdmin
              .from('assignment_feedback')
              .select('id', { count: 'exact', head: true })
              .eq('student_id', student_id);

            passedAssignments += feedbackTotal ?? 0;

            // Verify 'completado' record exists (completion_type = 'course')
            const { data: completadoRecord } = await supabaseAdmin
              .from('course_completions')
              .select('id')
              .eq('user_id', student_id)
              .eq('course_id', courseId)
              .eq('completion_type', 'course')
              .maybeSingle();

            if (checkAprobadoEligibility({
              allLessonsComplete: !!completadoRecord,
              totalAssignments: totalAssignments ?? 0,
              passedAssignments,
            })) {
              // UPSERT prevents race conditions
              await supabaseAdmin
                .from('course_completions')
                .upsert({
                  user_id: student_id,
                  course_id: courseId,
                  completion_type: 'aprobado',
                  completed_at: new Date().toISOString(),
                  completion_notification_sent: false,
                }, {
                  onConflict: 'user_id,course_id,completion_type',
                });

              await awardBadgeAndPost(student_id, courseId, courseName);
              console.log(`Aprobado recorded for student ${student_id} in course ${courseId}`);
            }
          }
        }
      }
    } catch (aprobadoError) {
      console.error('Aprobado eligibility check failed:', aprobadoError);
      // Don't fail the API call if aprobado check fails
    }

    return res.status(200).json({
      success: true,
      message: 'Feedback provided successfully',
      feedbackId: feedbackResult.id
    });

  } catch (error) {
    console.error('Unexpected error in feedback API:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}