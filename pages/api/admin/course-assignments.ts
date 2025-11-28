import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import NotificationService from '../../../lib/notificationService';

import { metadataHasRole } from '../../../utils/roleUtils';

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

    // Check if user is admin using the new user_roles table
    const { data: adminRole } = await supabaseAdmin
      .from('user_roles')
      .select('*')
      .eq('user_id', user.id)
      .eq('role_type', 'admin')
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();

    const isAdminFromMetadata = metadataHasRole(user.user_metadata, 'admin');
    const isAdminFromRoles = adminRole !== null;

    if (!isAdminFromMetadata && !isAdminFromRoles) {
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

      // Ensure course enrollments exist for assigned users so progress tracking works
      try {
        const enrollmentPayload = teacherIds.map(teacherId => ({
          course_id: courseId,
          user_id: teacherId,
          enrollment_type: 'assigned',
          enrolled_by: user.id,
          status: 'active'
        }));

        if (enrollmentPayload.length > 0) {
          const { error: enrollmentError } = await supabaseAdmin
            .from('course_enrollments')
            .upsert(enrollmentPayload, { onConflict: 'course_id,user_id' });

          if (enrollmentError) {
            console.error('Error ensuring course enrollments:', enrollmentError);
          }
        }
      } catch (enrollmentException) {
        console.error('Unexpected error creating course enrollments:', enrollmentException);
      }

      // Get course details for notification
      const { data: courseData } = await supabaseAdmin
        .from('courses')
        .select('title')
        .eq('id', courseId)
        .single();

      // Trigger course assignment notifications for each teacher
      try {
        await NotificationService.triggerNotification('course_assigned', {
          course: {
            id: courseId,
            name: courseData?.title || 'Nuevo curso'
          },
          assigned_users: teacherIds,
          assigned_by: user.id
        });
        console.log(`✅ Course assignment notifications triggered for ${teacherIds.length} teacher(s)`);
      } catch (notificationError) {
        console.error('❌ Failed to trigger course assignment notifications:', notificationError);
        // Don't fail the API call if notifications fail
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
            last_name
          )
        `)
        .eq('course_id', courseId);

      if (error) {
        console.error('Error fetching course assignments:', error);
        return res.status(500).json({ error: 'Failed to fetch course assignments: ' + error.message });
      }

      // Get school names from user_roles for each assigned user
      const teacherIds = (data || []).map(a => a.teacher_id);
      let schoolMap = new Map<string, string>();

      if (teacherIds.length > 0) {
        // Get active user_roles with school_id for these users
        const { data: userRoles } = await supabaseAdmin
          .from('user_roles')
          .select('user_id, school_id')
          .in('user_id', teacherIds)
          .eq('is_active', true)
          .not('school_id', 'is', null);

        if (userRoles && userRoles.length > 0) {
          // Get unique school IDs
          const schoolIds = [...new Set(userRoles.map(r => r.school_id).filter(Boolean))];

          // Fetch school names
          const { data: schools } = await supabaseAdmin
            .from('schools')
            .select('id, name')
            .in('id', schoolIds);

          const schoolNameMap = new Map<number, string>();
          schools?.forEach(s => schoolNameMap.set(s.id, s.name));

          // Map user_id to school name (use first active role with school)
          userRoles.forEach(role => {
            if (!schoolMap.has(role.user_id) && role.school_id) {
              const schoolName = schoolNameMap.get(role.school_id);
              if (schoolName) {
                schoolMap.set(role.user_id, schoolName);
              }
            }
          });
        }
      }

      // Add school name to each assignment
      const assignmentsWithSchool = (data || []).map(a => ({
        ...a,
        profiles: {
          ...a.profiles,
          school: schoolMap.get(a.teacher_id) || null
        }
      }));

      return res.status(200).json({
        success: true,
        assignments: assignmentsWithSchool
      });

    } else {
      return res.status(405).json({ error: 'Method not allowed' });
    }

  } catch (error) {
    console.error('Unexpected error in course-assignments API:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
