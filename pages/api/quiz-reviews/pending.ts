import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

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
      console.error('Error fetching user roles:', rolesError);
      return res.status(500).json({ error: 'Failed to fetch user roles' });
    }

    // Determine highest role
    const roleOrder = ['admin', 'consultor', 'equipo_directivo', 'lider_generacion', 'lider_comunidad', 'supervisor_de_red', 'community_manager', 'docente'];
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

    console.log('[API pending] User:', user.id, 'Role:', userRole);

    // Get all pending reviews
    const { data: allReviews, error: reviewsError } = await supabaseService
      .from('pending_quiz_reviews')
      .select('*')
      .order('submitted_at', { ascending: true });

    if (reviewsError) {
      console.error('Error fetching pending reviews:', reviewsError);
      return res.status(500).json({ error: 'Failed to fetch pending reviews' });
    }

    console.log('[API pending] All reviews count:', allReviews?.length);

    // If admin, return all reviews
    if (userRole === 'admin') {
      return res.status(200).json({ data: allReviews });
    }

    // For consultors, filter by their assigned users
    if (userRole === 'consultor') {
      // Get consultant's assignments using service role (bypasses RLS)
      const { data: assignments, error: assignmentsError } = await supabaseService
        .from('consultant_assignments')
        .select('student_id, school_id, generation_id, community_id, assignment_data')
        .eq('consultant_id', user.id)
        .eq('is_active', true);

      console.log('[API pending] Assignments found:', assignments?.length);

      if (assignmentsError) {
        console.error('Error fetching consultant assignments:', assignmentsError);
        return res.status(500).json({ error: 'Failed to fetch assignments' });
      }

      if (!assignments || assignments.length === 0) {
        return res.status(200).json({ data: [] });
      }

      // Build list of allowed student IDs based on assignment scopes
      const allowedStudentIds = new Set<string>();

      for (const assignment of assignments) {
        const scope = assignment.assignment_data?.assignment_scope || 'individual';
        console.log('[API pending] Processing scope:', scope, 'school_id:', assignment.school_id);

        if (scope === 'individual' && assignment.student_id) {
          allowedStudentIds.add(assignment.student_id);
        } else if (scope === 'school' && assignment.school_id) {
          const { data: schoolUsers } = await supabaseService
            .from('user_roles')
            .select('user_id')
            .eq('school_id', assignment.school_id)
            .eq('is_active', true);
          console.log('[API pending] Users in school:', schoolUsers?.length);
          if (schoolUsers) {
            schoolUsers.forEach(u => allowedStudentIds.add(u.user_id));
          }
        } else if (scope === 'generation' && assignment.generation_id) {
          const { data: genUsers } = await supabaseService
            .from('user_roles')
            .select('user_id')
            .eq('generation_id', assignment.generation_id)
            .eq('is_active', true);
          if (genUsers) {
            genUsers.forEach(u => allowedStudentIds.add(u.user_id));
          }
        } else if (scope === 'community' && assignment.community_id) {
          const { data: communityUsers } = await supabaseService
            .from('user_roles')
            .select('user_id')
            .eq('community_id', assignment.community_id)
            .eq('is_active', true);
          if (communityUsers) {
            communityUsers.forEach(u => allowedStudentIds.add(u.user_id));
          }
        }
      }

      console.log('[API pending] Allowed student IDs:', allowedStudentIds.size);

      // Filter reviews
      const filteredReviews = allReviews?.filter(review =>
        allowedStudentIds.has(review.student_id)
      ) || [];

      console.log('[API pending] Filtered reviews:', filteredReviews.length);
      return res.status(200).json({ data: filteredReviews });
    }

    // For equipo_directivo or other roles, return all for now
    return res.status(200).json({ data: allReviews });

  } catch (error) {
    console.error('Quiz reviews API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
