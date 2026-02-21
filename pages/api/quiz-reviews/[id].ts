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
      console.error('Error fetching user roles:', rolesError);
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

    console.log('[API quiz-review] User:', user.id, 'Role:', userRole, 'Submission:', id);

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
      console.error('Error fetching quiz submission:', submissionError);
      return res.status(500).json({ error: 'Failed to fetch quiz submission' });
    }

    if (!submission) {
      return res.status(404).json({ error: 'Quiz submission not found' });
    }

    // For consultors, verify they have access to this student
    if (userRole === 'consultor') {
      const { data: assignments, error: assignmentsError } = await supabaseService
        .from('consultant_assignments')
        .select('student_id, school_id, generation_id, community_id, assignment_data')
        .eq('consultant_id', user.id)
        .eq('is_active', true);

      if (assignmentsError) {
        console.error('Error fetching consultant assignments:', assignmentsError);
        return res.status(500).json({ error: 'Failed to verify access' });
      }

      // Build list of allowed student IDs
      const allowedStudentIds = new Set<string>();

      for (const assignment of (assignments || [])) {
        const scope = assignment.assignment_data?.assignment_scope || 'individual';

        if (scope === 'individual' && assignment.student_id) {
          allowedStudentIds.add(assignment.student_id);
        } else if (scope === 'school' && assignment.school_id) {
          const { data: schoolUsers } = await supabaseService
            .from('user_roles')
            .select('user_id')
            .eq('school_id', assignment.school_id)
            .eq('is_active', true);
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

      if (!allowedStudentIds.has(submission.student_id)) {
        return res.status(403).json({ error: 'No tienes acceso a este quiz' });
      }
    }

    // Set the graded_by to current user
    submission.graded_by = user.id;

    return res.status(200).json({
      data: submission,
      userRole,
      isAdmin: userRole === 'admin'
    });

  } catch (error) {
    console.error('Quiz review API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
