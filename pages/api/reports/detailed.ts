import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { getUserRoles, getHighestRole } from '../../../utils/roleUtils';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Define interfaces for our data structures
interface ProgressUser {
  user_id: string;
  user_name: string;
  user_email: string;
  user_role: string;
  school_name?: string;
  generation_name?: string;
  community_name?: string;
  total_courses_enrolled: number;
  completed_courses: number;
  courses_in_progress: number;
  total_lessons_completed: number;
  completion_percentage: number;
  total_time_spent_minutes: number;
  average_quiz_score?: number;
  last_activity_date?: string;
}

interface Summary {
  total_users: number;
  active_users: number;
  completed_users: number;
  average_completion: number;
  total_time_spent: number;
  average_quiz_score?: number;
}

interface ApiResponse {
  users: ProgressUser[];
  summary: Summary;
  pagination: any;
}

const handler = async (req: NextApiRequest, res: NextApiResponse<ApiResponse | { error: string }>) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end('Method Not Allowed');
  }

  try {
    const sessionClient = createPagesServerClient({ req, res });
    const { data: { session } } = await sessionClient.auth.getSession();

    if (!session) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Get user roles using the modern role system
    const userRoles = await getUserRoles(supabase, session.user.id);
    const highestRole = getHighestRole(userRoles);
    
    // Check if user has access to reports
    const allowedRoles = ['admin', 'consultor', 'equipo_directivo', 'lider_generacion', 'lider_comunidad', 'supervisor_de_red'];
    if (!highestRole || !allowedRoles.includes(highestRole)) {
      return res.status(403).json({ error: 'You do not have permission to view this report.' });
    }

    // Get user profile data
    const { data: userProfile, error: userProfileError } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, school_id, generation_id, community_id')
      .eq('id', session.user.id)
      .single();

    if (userProfileError || !userProfile) {
        return res.status(404).json({ error: 'User profile not found.' });
    }
    
    const { filters, sort, pagination } = req.body;
    const { page = 1, limit = 20 } = pagination || {};
    const { field = 'last_activity_date', order = 'desc' } = sort || {};

    // Get reportable users based on role and assignments
    const reportableUsers = await getReportableUsers(session.user.id, highestRole);
    
    if (reportableUsers.length === 0) {
        return res.status(200).json({
            users: [],
            summary: { total_users: 0, active_users: 0, completed_users: 0, average_completion: 0, total_time_spent: 0 },
            pagination: { current_page: 1, total_pages: 0, total_count: 0, limit, has_next: false, has_prev: false }
        });
    }

    const userIds = reportableUsers;

    // Get user profile data with organizational info
    const { data: userProfiles, error: profilesError } = await supabase
      .from('profiles')
      .select(`
        id,
        first_name,
        last_name,
        email,
        school_id,
        generation_id,
        community_id
      `)
      .in('id', userIds);

    if (profilesError) {
      throw profilesError;
    }

    // Get organizational data separately to avoid relationship issues
    const schoolIds = [...new Set(userProfiles?.map(p => p.school_id).filter(Boolean) || [])];
    const generationIds = [...new Set(userProfiles?.map(p => p.generation_id).filter(Boolean) || [])];
    const communityIds = [...new Set(userProfiles?.map(p => p.community_id).filter(Boolean) || [])];

    const [schoolsData, generationsData, communitiesData] = await Promise.all([
      schoolIds.length > 0 ? supabase
        .from('schools')
        .select('id, name')
        .in('id', schoolIds) : Promise.resolve({ data: [] }),
      
      generationIds.length > 0 ? supabase
        .from('generations')
        .select('id, name')
        .in('id', generationIds) : Promise.resolve({ data: [] }),
      
      communityIds.length > 0 ? supabase
        .from('growth_communities')
        .select('id, name')
        .in('id', communityIds) : Promise.resolve({ data: [] })
    ]);

    // Create lookup maps
    const schoolsMap = new Map(schoolsData.data?.map(s => [s.id, s]) || []);
    const generationsMap = new Map(generationsData.data?.map(g => [g.id, g]) || []);
    const communitiesMap = new Map(communitiesData.data?.map(c => [c.id, c]) || []);

    // Get course assignment data (actual table used in the system)
    const { data: courseData, error: courseError } = await supabase
      .from('course_assignments')
      .select(`
        teacher_id,
        course_id,
        progress_percentage,
        assigned_at,
        status
      `)
      .in('teacher_id', userIds);

    if (courseError) {
      console.error('Course data error:', courseError.message);
    }

    // Get lesson progress data (actual lesson completions)
    const { data: lessonProgressData, error: lessonProgressError } = await supabase
      .from('lesson_progress')
      .select(`
        user_id,
        lesson_id,
        completed_at,
        time_spent,
        completion_data
      `)
      .in('user_id', userIds);

    if (lessonProgressError) {
      console.error('Lesson progress data error:', lessonProgressError.message);
    }

    // Get user roles for the reportable users
    const { data: reportableUserRoles, error: rolesError } = await supabase
      .from('user_roles')
      .select('user_id, role_type')
      .in('user_id', userIds)
      .eq('is_active', true);

    if (rolesError) {
      console.error('Roles fetch error:', rolesError.message);
    }

    // Create role mapping for quick lookup
    const roleMap = new Map();
    (reportableUserRoles || []).forEach(role => {
      roleMap.set(role.user_id, role.role_type);
    });

    // Process course assignment data
    const assignmentsByUser = new Map();
    (courseData || []).forEach(assignment => {
      if (!assignmentsByUser.has(assignment.teacher_id)) {
        assignmentsByUser.set(assignment.teacher_id, []);
      }
      assignmentsByUser.get(assignment.teacher_id).push(assignment);
    });

    // Process lesson progress data
    const lessonProgressByUser = new Map();
    (lessonProgressData || []).forEach(progress => {
      if (!lessonProgressByUser.has(progress.user_id)) {
        lessonProgressByUser.set(progress.user_id, []);
      }
      lessonProgressByUser.get(progress.user_id).push(progress);
    });

    // Build the progress users array
    const progressUsers: ProgressUser[] = (userProfiles || []).map(profile => {
        const userAssignments = assignmentsByUser.get(profile.id) || [];
        const userLessons = lessonProgressByUser.get(profile.id) || [];
        
        const total_courses_enrolled = userAssignments.length;
        const completed_courses = userAssignments.filter(a => a.status === 'completed').length;
        const completion_percentage = total_courses_enrolled > 0 ? 
          Math.round(userAssignments.reduce((sum, a) => sum + (a.progress_percentage || 0), 0) / total_courses_enrolled) : 0;
        
        // Calculate actual lesson progress data
        const total_lessons_completed = userLessons.filter(l => l.completed_at).length;
        const total_time_spent_minutes = Math.round(
          userLessons.reduce((sum, l) => sum + (l.time_spent || 0), 0) / 60
        ); // Convert seconds to minutes
        
        // Determine most recent activity from lesson progress or course assignments
        const lessonActivities = userLessons.map(l => l.completed_at).filter(Boolean);
        const courseActivities = userAssignments.map(a => a.assigned_at).filter(Boolean);
        const allActivities = [...lessonActivities, ...courseActivities];
        const lastActivity = allActivities.length > 0 ? 
          allActivities.sort().reverse()[0] : null;

        return {
            user_id: profile.id,
            user_name: `${profile.first_name || ''} ${profile.last_name || ''}`.trim(),
            user_email: profile.email,
            user_role: roleMap.get(profile.id) || 'Sin rol',
            school_name: schoolsMap.get(profile.school_id)?.name,
            generation_name: generationsMap.get(profile.generation_id)?.name,
            community_name: communitiesMap.get(profile.community_id)?.name,
            total_courses_enrolled,
            completed_courses,
            courses_in_progress: total_courses_enrolled - completed_courses,
            completion_percentage,
            total_time_spent_minutes,
            last_activity_date: lastActivity,
            total_lessons_completed,
            average_quiz_score: 0, // Not available in current schema
        };
    });

    progressUsers.sort((a, b) => {
        const valA = a[field];
        const valB = b[field];
        if (valA === valB) return 0;
        if (valA == null) return order === 'asc' ? -1 : 1;
        if (valB == null) return order === 'asc' ? 1 : -1;
        return (valA < valB ? -1 : 1) * (order === 'asc' ? 1 : -1);
    });

    const paginatedUsers = progressUsers.slice((page - 1) * limit, page * limit);

    const summary: Summary = {
        total_users: progressUsers.length,
        active_users: progressUsers.filter(u => u.last_activity_date && new Date(u.last_activity_date) > new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)).length,
        completed_users: progressUsers.filter(u => u.completion_percentage === 100).length,
        average_completion: Math.round(progressUsers.reduce((sum, u) => sum + u.completion_percentage, 0) / (progressUsers.length || 1)),
        total_time_spent: progressUsers.reduce((sum, u) => sum + u.total_time_spent_minutes, 0),
    };

    res.status(200).json({
      users: paginatedUsers,
      summary: summary,
      pagination: {
        current_page: page,
        total_pages: Math.ceil(progressUsers.length / limit),
        total_count: progressUsers.length,
        limit,
        has_next: page * limit < progressUsers.length,
        has_prev: page > 1
      },
    });

  } catch (error: any) {
    console.error('Error in detailed report API:', error);
    res.status(500).json({ error: 'Internal Server Error', details: error.message });
  }
};

async function getReportableUsers(userId: string, userRole: string): Promise<string[]> {
  try {
    if (userRole === 'admin') {
      // Admins can see all users (profiles) - not limited by roles
      const { data: allProfiles } = await supabase
        .from('profiles')
        .select('id');
      
      return allProfiles?.map(p => p.id) || [];
    } else if (userRole === 'consultor') {
      // Consultors can only see their assigned students
      const { data: assignments } = await supabase
        .from('consultant_assignments')
        .select('student_id')
        .eq('consultant_id', userId)
        .eq('is_active', true);
      
      return assignments?.map(a => a.student_id) || [];
    } else if (userRole === 'equipo_directivo') {
      // School leadership can see users from their school
      const { data: requesterProfile } = await supabase
        .from('profiles')
        .select('school_id')
        .eq('id', userId)
        .single();
      
      if (requesterProfile?.school_id) {
        const { data: schoolUsers } = await supabase
          .from('profiles')
          .select('id')
          .eq('school_id', requesterProfile.school_id);
        
        return schoolUsers?.map(u => u.id) || [];
      }
    } else if (userRole === 'lider_generacion') {
      // Generation leaders can see users from their generation
      const { data: requesterProfile } = await supabase
        .from('profiles')
        .select('generation_id')
        .eq('id', userId)
        .single();
      
      if (requesterProfile?.generation_id) {
        const { data: generationUsers } = await supabase
          .from('profiles')
          .select('id')
          .eq('generation_id', requesterProfile.generation_id);
        
        return generationUsers?.map(u => u.id) || [];
      }
    } else if (userRole === 'lider_comunidad') {
      // Community leaders can see users from their community
      const { data: requesterProfile } = await supabase
        .from('profiles')
        .select('community_id')
        .eq('id', userId)
        .single();
      
      if (requesterProfile?.community_id) {
        const { data: communityUsers } = await supabase
          .from('profiles')
          .select('id')
          .eq('community_id', requesterProfile.community_id);
        
        return communityUsers?.map(u => u.id) || [];
      }
    } else if (userRole === 'supervisor_de_red') {
      // Network supervisors can see users from schools in their network
      const { data: networkSchools } = await supabase
        .from('red_escuelas')
        .select('school_id')
        .eq('supervisor_id', userId);
      
      if (networkSchools && networkSchools.length > 0) {
        const schoolIds = networkSchools.map(ns => ns.school_id);
        const { data: networkUsers } = await supabase
          .from('profiles')
          .select('id')
          .in('school_id', schoolIds);
        
        return networkUsers?.map(u => u.id) || [];
      }
    }
    
    return [];
  } catch (error) {
    console.error('Error getting reportable users:', error);
    return [];
  }
}

export default handler;