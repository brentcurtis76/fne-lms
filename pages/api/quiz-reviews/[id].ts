import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { loggableError } from '@/lib/api-auth';
import { canReviewSubmission } from '@/lib/quiz-reviews/review-scope';

// Use service role to bypass RLS
const supabaseService = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id } = req.query;

  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Submission ID required' });
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

    // Get user's roles from user_roles table
    const { data: userRoles, error: rolesError } = await supabaseService
      .from('user_roles')
      .select('role_type')
      .eq('user_id', user.id)
      .eq('is_active', true);

    if (rolesError) {
      console.error('Error fetching user roles:', loggableError(rolesError));
      return res.status(500).json({ error: 'Failed to fetch user roles' });
    }

    // Determine highest role
    const roleOrder = ['admin', 'consultor', 'equipo_directivo', 'lider_generacion', 'lider_comunidad', 'supervisor_de_red', 'community_manager', 'docente', 'encargado_licitacion'];
    let userRole: string | null = null;
    for (const role of roleOrder) {
      if (userRoles?.some(r => r.role_type === role)) {
        userRole = role;
        break;
      }
    }

    // Check if user has permission to access quiz reviews
    if (!['admin', 'consultor', 'equipo_directivo'].includes(userRole || '')) {
      return res.status(403).json({ error: 'No permission to access quiz reviews' });
    }

    // Logs keep the reviewer's role and error codes: no id, student or answer.
    console.log('[API quiz-review] Role:', userRole);

    // Get the quiz submission with related data
    const { data: submission, error: submissionError } = await supabaseService
      .from('quiz_submissions')
      .select(`
        *,
        student:profiles!student_id(id, name, email, first_name, last_name),
        grader:profiles!graded_by(id, name, first_name, last_name),
        course:courses!course_id(id, title),
        lesson:lessons!lesson_id(id, title)
      `)
      .eq('id', id)
      .single();

    if (submissionError) {
      console.error('Error fetching quiz submission:', loggableError(submissionError));
      return res.status(500).json({ error: 'Failed to fetch quiz submission' });
    }

    if (!submission) {
      return res.status(404).json({ error: 'Quiz submission not found' });
    }

    // An admin, a consultor whose active assignments cover the learner, or a
    // directivo of a school the learner belongs to (lib/quiz-reviews/review-scope.ts).
    let canReview: boolean;
    try {
      canReview = await canReviewSubmission(
        supabaseService,
        user.id,
        (userRoles || []).map(r => r.role_type),
        submission.student_id
      );
    } catch {
      return res.status(500).json({ error: 'Failed to verify access' });
    }
    if (!canReview) {
      return res.status(403).json({ error: 'No tienes acceso a este quiz' });
    }

    // Set the graded_by to current user
    submission.graded_by = user.id;

    return res.status(200).json({
      data: submission,
      userRole,
      isAdmin: userRole === 'admin'
    });

  } catch (error) {
    console.error('Quiz review API error:', loggableError(error));
    return res.status(500).json({ error: 'Internal server error' });
  }
}
