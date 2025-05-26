import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

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
    // Get auth header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid authorization header' });
    }

    // Verify the user is authenticated and is admin
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return res.status(401).json({ error: 'Invalid authentication token' });
    }

    // Check if user is admin
    const { data: profileData } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    const isAdminFromMetadata = user.user_metadata?.role === 'admin';
    const isAdminFromProfile = profileData?.role === 'admin';

    if (!isAdminFromMetadata && !isAdminFromProfile) {
      return res.status(403).json({ error: 'Insufficient permissions. Admin access required.' });
    }

    if (req.method === 'POST') {
      // Create course assignments
      const { courseId, teacherIds } = req.body;
      
      if (!courseId || !teacherIds || !Array.isArray(teacherIds)) {
        return res.status(400).json({ error: 'Missing courseId or teacherIds array' });
      }

      // Create assignments
      const assignments = teacherIds.map(teacherId => ({
        course_id: courseId,
        teacher_id: teacherId,
        assigned_by: user.id
      }));

      const { data, error } = await supabaseAdmin
        .from('course_assignments')
        .insert(assignments)
        .select();

      if (error) {
        console.error('Error creating course assignments:', error);
        return res.status(500).json({ error: 'Failed to create course assignments: ' + error.message });
      }

      return res.status(200).json({ 
        success: true, 
        message: `Course assigned to ${teacherIds.length} teacher(s)`,
        assignments: data 
      });

    } else if (req.method === 'DELETE') {
      // Remove course assignment
      const { courseId, teacherId } = req.body;
      
      if (!courseId || !teacherId) {
        return res.status(400).json({ error: 'Missing courseId or teacherId' });
      }

      const { error } = await supabaseAdmin
        .from('course_assignments')
        .delete()
        .eq('course_id', courseId)
        .eq('teacher_id', teacherId);

      if (error) {
        console.error('Error removing course assignment:', error);
        return res.status(500).json({ error: 'Failed to remove course assignment: ' + error.message });
      }

      return res.status(200).json({ 
        success: true, 
        message: 'Course assignment removed successfully'
      });

    } else if (req.method === 'GET') {
      // Get course assignments
      const { courseId } = req.query;
      
      if (!courseId) {
        return res.status(400).json({ error: 'Missing courseId parameter' });
      }

      const { data, error } = await supabaseAdmin
        .from('course_assignments')
        .select(`
          teacher_id,
          assigned_at,
          profiles:teacher_id (
            id,
            email,
            first_name,
            last_name,
            school
          )
        `)
        .eq('course_id', courseId);

      if (error) {
        console.error('Error fetching course assignments:', error);
        return res.status(500).json({ error: 'Failed to fetch course assignments: ' + error.message });
      }

      return res.status(200).json({ 
        success: true, 
        assignments: data 
      });

    } else {
      return res.status(405).json({ error: 'Method not allowed' });
    }

  } catch (error) {
    console.error('Unexpected error in course-assignments API:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}