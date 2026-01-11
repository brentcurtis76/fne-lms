import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

// Use service role to bypass RLS
const supabaseService = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Verify authentication
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'No authorization header' });
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const { data: { user }, error: authError } = await supabaseService.auth.getUser(token);

    if (authError || !user) {
      return res.status(401).json({ error: 'Invalid authentication' });
    }

    // Get user's roles
    const { data: userRoles, error: rolesError } = await supabaseService
      .from('user_roles')
      .select('role_type')
      .eq('user_id', user.id)
      .eq('is_active', true);

    if (rolesError) {
      return res.status(500).json({ error: 'Failed to fetch user roles' });
    }

    // Check if user has permission
    const allowedRoles = ['admin', 'consultor', 'equipo_directivo'];
    const hasPermission = userRoles?.some(r => allowedRoles.includes(r.role_type));

    if (!hasPermission) {
      return res.status(403).json({ error: 'No permission to review quizzes' });
    }

    const {
      submissionId,
      reviewStatus,
      generalFeedback,
      questionFeedback
    } = req.body;

    if (!submissionId) {
      return res.status(400).json({ error: 'Submission ID required' });
    }

    if (!reviewStatus || !['pass', 'needs_review'].includes(reviewStatus)) {
      return res.status(400).json({ error: 'Valid review status required (pass or needs_review)' });
    }

    console.log('[API submit-review] User:', user.id, 'Submission:', submissionId, 'Status:', reviewStatus);

    // Get the submission to verify it exists and get student info
    const { data: submission, error: subError } = await supabaseService
      .from('quiz_submissions')
      .select('id, student_id, course_id, lesson_id, review_status')
      .eq('id', submissionId)
      .single();

    if (subError || !submission) {
      return res.status(404).json({ error: 'Submission not found' });
    }

    // Update the quiz submission directly instead of using RPC
    // Note: question_feedback column does not exist in the table, only general_feedback
    const { error: updateError } = await supabaseService
      .from('quiz_submissions')
      .update({
        review_status: reviewStatus,
        general_feedback: generalFeedback || null,
        graded_by: user.id,
        graded_at: new Date().toISOString()
      })
      .eq('id', submissionId);

    if (updateError) {
      console.error('Error updating submission:', updateError);
      return res.status(500).json({ error: 'Failed to save review', details: updateError.message });
    }

    // Send notification to student
    const notificationMessage = reviewStatus === 'pass'
      ? 'Tu quiz ha sido revisado y aprobado. ¡Buen trabajo!'
      : 'Tu quiz ha sido revisado. Por favor revisa la retroalimentación del instructor.';

    const { error: notifError } = await supabaseService
      .from('notifications')
      .insert({
        user_id: submission.student_id,
        type: 'quiz_reviewed',
        title: 'Quiz revisado',
        message: notificationMessage,
        data: {
          submission_id: submission.id,
          course_id: submission.course_id,
          lesson_id: submission.lesson_id,
          review_status: reviewStatus
        }
      });

    if (notifError) {
      console.error('Error creating notification:', notifError);
      // Don't fail the whole request just because notification failed
    }

    return res.status(200).json({ success: true });

  } catch (error) {
    console.error('Submit review API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
