import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { deliverRecordBells, loggableError } from './notify-pending';

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

    console.log('[API submit-review] Saving review');

    // Get the submission to verify it exists and get student info
    const { data: submission, error: subError } = await supabaseService
      .from('quiz_submissions')
      .select('id, student_id, course_id, lesson_id, review_status, general_feedback, graded_by, graded_at')
      .eq('id', submissionId)
      .single();

    if (subError || !submission) {
      return res.status(404).json({ error: 'Submission not found' });
    }

    // Saving the same review again keeps its graded_at and is the same notification
    // occurrence; any other review, including a return to an earlier status, is new.
    const feedback = generalFeedback || null;
    const isRetry =
      !!submission.graded_at &&
      submission.review_status === reviewStatus &&
      submission.general_feedback === feedback &&
      submission.graded_by === user.id;
    // A new review is later than the saved graded_at even with a frozen or backward clock.
    const gradedAt = isRetry
      ? new Date(submission.graded_at).toISOString()
      : new Date(Math.max(Date.now(), submission.graded_at ? Date.parse(submission.graded_at) + 1 : 0)).toISOString();

    if (!isRetry) {
      // Update the quiz submission directly instead of using RPC
      // Note: question_feedback column does not exist in the table, only general_feedback
      // Compare-and-set on the graded_at read above: an overlapping review saved first
      // has moved it on, and this one is refused rather than sharing its occurrence.
      const update = supabaseService
        .from('quiz_submissions')
        .update({
          review_status: reviewStatus,
          general_feedback: feedback,
          graded_by: user.id,
          graded_at: gradedAt
        })
        .eq('id', submissionId);
      const { data: updated, error: updateError } = await (submission.graded_at
        ? update.eq('graded_at', submission.graded_at)
        : update.is('graded_at', null)
      ).select('id');

      if (updateError) {
        console.error('Error updating submission:', loggableError(updateError));
        // Fixed body: the database message can carry ids, feedback or SQL.
        return res.status(500).json({ error: 'No se pudo guardar la revisión' });
      }
      if (!updated || updated.length === 0) {
        return res.status(409).json({ error: 'La revisión cambió mientras se guardaba; recarga e inténtalo de nuevo' });
      }
    }

    // The student's bell; nonfatal for the saved review, and a retry fills it.
    let notificationsDelivered = true;
    if (submission.student_id !== user.id) {
      notificationsDelivered =
        (await deliverRecordBells(
          'quiz_reviewed',
          { submission_id: submission.id, graded_at: gradedAt, lesson_id: submission.lesson_id },
          [{ id: submission.student_id }]
        )) === 0;
      if (!notificationsDelivered) console.error('[API submit-review] review notification not created');
    }

    return res.status(200).json({ success: true, notificationsDelivered });

  } catch (error) {
    console.error('Submit review API error:', loggableError(error));
    return res.status(500).json({ error: 'Internal server error' });
  }
}
