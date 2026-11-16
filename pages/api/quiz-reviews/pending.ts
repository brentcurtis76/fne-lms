import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { loggableError } from '../../../lib/api-auth';
import { canReviewSubmission } from '../../../lib/quiz-reviews/review-scope';

// Use service role to bypass RLS
const supabaseService = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
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

    // Get user's role from user_roles table
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

    console.log('[API pending] Role:', userRole);

    // Get all pending reviews
    const { data: allReviews, error: reviewsError } = await supabaseService
      .from('pending_quiz_reviews')
      .select('*')
      .order('submitted_at', { ascending: true });

    if (reviewsError) {
      console.error('Error fetching pending reviews:', loggableError(reviewsError));
      return res.status(500).json({ error: 'Failed to fetch pending reviews' });
    }

    console.log('[API pending] All reviews count:', allReviews?.length);

    // Every active role type of the caller: a person with several roles gets the union.
    const activeRoleTypes = (userRoles || []).map(r => r.role_type);

    // If admin, return all reviews
    if (activeRoleTypes.includes('admin')) {
      return res.status(200).json({ data: allReviews });
    }

    // Everyone else: only the reviews whose learner the caller may open (the same rule
    // as GET /api/quiz-reviews/[id] and POST /api/quiz-reviews/submit-review), decided
    // once per learner.
    const allowedByStudent = new Map<string, boolean>();
    try {
      for (const review of (allReviews || [])) {
        const studentId = review.student_id;
        if (allowedByStudent.has(studentId)) continue;
        allowedByStudent.set(studentId, await canReviewSubmission(supabaseService, user.id, activeRoleTypes, studentId));
      }
    } catch {
      return res.status(500).json({ error: 'Failed to verify access' });
    }

    const filteredReviews = (allReviews || []).filter(review => allowedByStudent.get(review.student_id) === true);

    console.log('[API pending] Filtered reviews:', filteredReviews.length);
    return res.status(200).json({ data: filteredReviews });

  } catch (error) {
    console.error('Quiz reviews API error:', loggableError(error));
    return res.status(500).json({ error: 'Internal server error' });
  }
}
