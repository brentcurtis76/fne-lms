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
    
    const { filters, sort, pagination, useSmartDefaults = true } = req.body;
    const { page = 1, limit = 20 } = pagination || {};

    // DEFAULT SORT: Always sort by activity_score (most active first)
    // This shows users with most completion/activity at the top
    let defaultSort = { field: 'activity_score', order: 'desc' };
    let defaultLimit = limit;

    // Note: useSmartDefaults retained for backward compatibility but now applies to all roles
    if (useSmartDefaults && highestRole === 'admin') {
      defaultLimit = Math.min(limit, 10); // Default to 10 for admin unless they specifically request more
    }

    const { field = defaultSort.field, order = defaultSort.order } = sort || {};
    const effectiveLimit = sort ? limit : defaultLimit; // Only use smart limit if no custom sort

    // Get reportable users based on role and assignments
    const reportableUsers = await getReportableUsers(session.user.id, highestRole);
    
    if (reportableUsers.length === 0) {
        return res.status(200).json({
            users: [],
            summary: { total_users: 0, active_users: 0, completed_users: 0, average_completion: 0, total_time_spent: 0 },
            pagination: { current_page: 1, total_pages: 0, total_count: 0, limit, has_next: false, has_prev: false }
        });
    }

    let userIds = reportableUsers;

    // FIX: Apply organizational filters using user_roles (source of truth)
    if (filters) {
      if (filters.school_id && filters.school_id !== 'all') {
        const { data: schoolRoles } = await supabase
          .from('user_roles')
          .select('user_id')
          .eq('school_id', filters.school_id)
          .eq('is_active', true);

        const schoolUserIds = schoolRoles?.map(r => r.user_id) || [];
        userIds = userIds.filter(id => schoolUserIds.includes(id));
      }

      if (filters.generation_id && filters.generation_id !== 'all') {
        const { data: generationRoles } = await supabase
          .from('user_roles')
          .select('user_id')
          .eq('generation_id', filters.generation_id)
          .eq('is_active', true);

        const generationUserIds = generationRoles?.map(r => r.user_id) || [];
        userIds = userIds.filter(id => generationUserIds.includes(id));
      }

      if (filters.community_id && filters.community_id !== 'all') {
        const { data: communityRoles } = await supabase
          .from('user_roles')
          .select('user_id')
          .eq('community_id', filters.community_id)
          .eq('is_active', true);

        const communityUserIds = communityRoles?.map(r => r.user_id) || [];
        userIds = userIds.filter(id => communityUserIds.includes(id));
      }
    }

    // Get user profile data for display
    let profileQuery = supabase
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

    // Apply search filter on profiles (names/email)
    if (filters?.search && filters.search.trim()) {
      const searchTerm = `%${filters.search.trim()}%`;
      profileQuery = profileQuery.or(`first_name.ilike.${searchTerm},last_name.ilike.${searchTerm},email.ilike.${searchTerm}`);
    }

    const { data: userProfiles, error: profilesError } = await profileQuery;

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

    // Get user roles for the reportable users (including organizational assignments)
    const { data: reportableUserRoles, error: rolesError } = await supabase
      .from('user_roles')
      .select('user_id, role_type, school_id, generation_id, community_id')
      .in('user_id', userIds)
      .eq('is_active', true);

    if (rolesError) {
      console.error('Roles fetch error:', rolesError.message);
    }

    // Create role and organizational mapping for quick lookup (use user_roles as source of truth)
    const roleMap = new Map();
    const userRoleOrgMap = new Map();
    (reportableUserRoles || []).forEach(role => {
      roleMap.set(role.user_id, role.role_type);
      userRoleOrgMap.set(role.user_id, {
        school_id: role.school_id,
        generation_id: role.generation_id,
        community_id: role.community_id
      });
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
    let progressUsers: ProgressUser[] = (userProfiles || []).map(profile => {
        const userAssignments = assignmentsByUser.get(profile.id) || [];
        const userLessons = lessonProgressByUser.get(profile.id) || [];
        
        const total_courses_enrolled = userAssignments.length;
        const completed_courses = userAssignments.filter(a => a.status === 'completed').length;
        
        // FIXED: Calculate completion based on actual lesson progress, not stale course progress
        // Get total lessons completed for this user's assigned courses
        const assignedCourseIds = userAssignments.map(a => a.course_id);
        const lessonsInAssignedCourses = userLessons.filter(l => {
          // We need to check if the lesson belongs to one of the assigned courses
          // For now, assume any completed lesson counts toward overall progress
          return l.completed_at;
        });
        
        // Calculate completion percentage based on actual lesson completions
        // This is a rough estimate - ideally we'd know total lessons per course
        const completion_percentage = lessonsInAssignedCourses.length > 0 ? 
          Math.min(Math.round((lessonsInAssignedCourses.length / Math.max(total_courses_enrolled * 5, 1)) * 100), 100) : 0;
        
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

        // Calculate activity score for smart sorting
        // Factors: lessons completed (40%), time spent (30%), recent activity (20%), course enrollments (10%)
        const lessonScore = Math.min(total_lessons_completed * 10, 400); // Max 400 points for lessons
        const timeScore = Math.min(total_time_spent_minutes * 2, 300); // Max 300 points for time 
        const recentActivityScore = lastActivity ? 
          Math.max(200 - Math.floor((Date.now() - new Date(lastActivity).getTime()) / (1000 * 60 * 60 * 24 * 7)), 0) : 0; // 200 points max, decreases weekly
        const courseScore = Math.min(total_courses_enrolled * 10, 100); // Max 100 points for courses
        
        const activity_score = Math.round(lessonScore + timeScore + recentActivityScore + courseScore);

        // Get organizational data from user_roles (source of truth) instead of profiles
        const userRoleOrg = userRoleOrgMap.get(profile.id);

        return {
            user_id: profile.id,
            user_name: `${profile.first_name || ''} ${profile.last_name || ''}`.trim(),
            user_email: profile.email,
            user_role: roleMap.get(profile.id) || 'Sin rol',
            school_name: schoolsMap.get(userRoleOrg?.school_id)?.name,
            generation_name: generationsMap.get(userRoleOrg?.generation_id)?.name,
            community_name: communitiesMap.get(userRoleOrg?.community_id)?.name,
            total_courses_enrolled,
            completed_courses,
            courses_in_progress: total_courses_enrolled - completed_courses,
            completion_percentage,
            total_time_spent_minutes,
            last_activity_date: lastActivity,
            total_lessons_completed,
            average_quiz_score: 0, // Not available in current schema
            activity_score, // Add activity score for smart sorting
        };
    });

    // Apply additional filters
    let filteredUsers = progressUsers;
    
    if (filters) {
      // Status filtering
      if (filters.status && filters.status !== 'all') {
        filteredUsers = filteredUsers.filter(user => {
          const lastActivityDate = user.last_activity_date ? new Date(user.last_activity_date) : null;
          const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
          
          switch (filters.status) {
            case 'active':
              return lastActivityDate && lastActivityDate > thirtyDaysAgo;
            case 'completed':
              return user.completion_percentage === 100;
            case 'inactive':
              return !lastActivityDate || lastActivityDate <= thirtyDaysAgo;
            default:
              return true;
          }
        });
      }
      
      // Course filtering (if user is enrolled in specific course)
      if (filters.course_id && filters.course_id !== 'all') {
        const usersInCourse = (courseData || []).filter(assignment => assignment.course_id === filters.course_id).map(a => a.teacher_id);
        filteredUsers = filteredUsers.filter(user => usersInCourse.includes(user.user_id));
      }
      
      // Date range filtering (filter by last activity date)
      if (filters.date_from || filters.date_to) {
        filteredUsers = filteredUsers.filter(user => {
          if (!user.last_activity_date) return false;
          
          const activityDate = new Date(user.last_activity_date);
          
          if (filters.date_from) {
            const fromDate = new Date(filters.date_from);
            if (activityDate < fromDate) return false;
          }
          
          if (filters.date_to) {
            const toDate = new Date(filters.date_to);
            toDate.setHours(23, 59, 59, 999); // Include full day
            if (activityDate > toDate) return false;
          }
          
          return true;
        });
      }
    }
    
    // Update progressUsers to be the filtered version
    progressUsers = filteredUsers;

    progressUsers.sort((a, b) => {
        const valA = a[field];
        const valB = b[field];
        if (valA === valB) return 0;
        if (valA == null) return order === 'asc' ? -1 : 1;
        if (valB == null) return order === 'asc' ? 1 : -1;
        return (valA < valB ? -1 : 1) * (order === 'asc' ? 1 : -1);
    });

    const paginatedUsers = progressUsers.slice((page - 1) * effectiveLimit, page * effectiveLimit);

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
        total_pages: Math.ceil(progressUsers.length / effectiveLimit),
        total_count: progressUsers.length,
        limit: effectiveLimit,
        has_next: page * effectiveLimit < progressUsers.length,
        has_prev: page > 1,
        is_smart_default: useSmartDefaults && !sort && highestRole === 'admin' // Flag to indicate smart defaults are active
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
      // FIX: Use user_roles as source of truth for school assignments
      const { data: requesterRoles } = await supabase
        .from('user_roles')
        .select('school_id')
        .eq('user_id', userId)
        .eq('is_active', true)
        .not('school_id', 'is', null)
        .limit(1)
        .single();

      if (requesterRoles?.school_id) {
        const { data: schoolUserRoles } = await supabase
          .from('user_roles')
          .select('user_id')
          .eq('school_id', requesterRoles.school_id)
          .eq('is_active', true);

        // Return unique user IDs
        return [...new Set(schoolUserRoles?.map(r => r.user_id) || [])];
      }
    } else if (userRole === 'lider_generacion') {
      // Generation leaders can see users from their generation
      // FIX: Use user_roles as source of truth for generation assignments
      const { data: requesterRoles } = await supabase
        .from('user_roles')
        .select('generation_id')
        .eq('user_id', userId)
        .eq('is_active', true)
        .not('generation_id', 'is', null)
        .limit(1)
        .single();

      if (requesterRoles?.generation_id) {
        const { data: generationUserRoles } = await supabase
          .from('user_roles')
          .select('user_id')
          .eq('generation_id', requesterRoles.generation_id)
          .eq('is_active', true);

        // Return unique user IDs
        return [...new Set(generationUserRoles?.map(r => r.user_id) || [])];
      }
    } else if (userRole === 'lider_comunidad') {
      // Community leaders can see users from their community
      // FIX: Use user_roles as source of truth for community assignments
      const { data: requesterRoles } = await supabase
        .from('user_roles')
        .select('community_id')
        .eq('user_id', userId)
        .eq('is_active', true)
        .not('community_id', 'is', null)
        .limit(1)
        .single();

      if (requesterRoles?.community_id) {
        const { data: communityUserRoles } = await supabase
          .from('user_roles')
          .select('user_id')
          .eq('community_id', requesterRoles.community_id)
          .eq('is_active', true);

        // Return unique user IDs
        return [...new Set(communityUserRoles?.map(r => r.user_id) || [])];
      }
    } else if (userRole === 'supervisor_de_red') {
      // Network supervisors can see users from schools in their network
      const { data: networkSchools } = await supabase
        .from('red_escuelas')
        .select('school_id')
        .eq('supervisor_id', userId);

      if (networkSchools && networkSchools.length > 0) {
        const schoolIds = networkSchools.map(ns => ns.school_id);
        // FIX: Use user_roles to get users from these schools
        const { data: networkUserRoles } = await supabase
          .from('user_roles')
          .select('user_id')
          .in('school_id', schoolIds)
          .eq('is_active', true);

        // Return unique user IDs
        return [...new Set(networkUserRoles?.map(r => r.user_id) || [])];
      }
    }
    
    return [];
  } catch (error) {
    console.error('Error getting reportable users:', error);
    return [];
  }
}

export default handler;