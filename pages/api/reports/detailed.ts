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
    console.log('[detailed-api] Step 1: Starting handler');
    const sessionClient = createPagesServerClient({ req, res });
    const { data: { session } } = await sessionClient.auth.getSession();

    if (!session) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    console.log('[detailed-api] Step 2: Session obtained, user:', session.user.id);

    // Get user roles using the modern role system
    const userRoles = await getUserRoles(supabase, session.user.id);
    console.log('[detailed-api] Step 3: Got user roles:', userRoles.length);
    const highestRole = getHighestRole(userRoles);
    console.log('[detailed-api] Step 4: Highest role:', highestRole);
    
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
      .maybeSingle();

    if (userProfileError) {
        console.error('Error fetching user profile:', userProfileError);
        return res.status(404).json({ error: 'User profile not found.' });
    }

    if (!userProfile) {
        return res.status(404).json({ error: 'User profile not found.' });
    }
    console.log('[detailed-api] Step 5: Got user profile');

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

    console.log('[detailed-api] Step 6: About to get reportable users');
    // Get reportable users based on role and assignments
    const reportableUsers = await getReportableUsers(session.user.id, highestRole);
    console.log('[detailed-api] Step 7: Got reportable users:', reportableUsers.length);
    
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
      const hasCommunityFilter = filters.community_id && filters.community_id !== 'all';

      if (hasCommunityFilter) {
        // Community filter takes precedence: show everyone in the selected community
        // regardless of school/generation assignments. Communities span multiple orgs,
        // and role permissions are already enforced by getReportableUsers.
        const { data: communityRoles } = await supabase
          .from('user_roles')
          .select('user_id')
          .eq('community_id', filters.community_id)
          .eq('is_active', true);

        const { data: communityProfiles } = await supabase
          .from('profiles')
          .select('id')
          .eq('community_id', filters.community_id);

        const communityUserIds = new Set([
          ...(communityRoles?.map(r => r.user_id) || []),
          ...(communityProfiles?.map(p => p.id) || [])
        ]);

        userIds = userIds.filter(id => communityUserIds.has(id));
      } else {
        if (filters.school_id && filters.school_id !== 'all') {
          const { data: schoolRoles } = await supabase
            .from('user_roles')
            .select('user_id')
            .eq('school_id', filters.school_id)
            .eq('is_active', true);

          const { data: schoolProfiles } = await supabase
            .from('profiles')
            .select('id')
            .eq('school_id', filters.school_id);

          const schoolUserIds = new Set([
            ...(schoolRoles?.map(r => r.user_id) || []),
            ...(schoolProfiles?.map(p => p.id) || [])
          ]);

          userIds = userIds.filter(id => schoolUserIds.has(id));
        }

        if (filters.generation_id && filters.generation_id !== 'all') {
          const { data: generationRoles } = await supabase
            .from('user_roles')
            .select('user_id')
            .eq('generation_id', filters.generation_id)
            .eq('is_active', true);

          const { data: generationProfiles } = await supabase
            .from('profiles')
            .select('id')
            .eq('generation_id', filters.generation_id);

          const generationUserIds = new Set([
            ...(generationRoles?.map(r => r.user_id) || []),
            ...(generationProfiles?.map(p => p.id) || [])
          ]);

          userIds = userIds.filter(id => generationUserIds.has(id));
        }
      }
    }

    // Get user profile data for display
    // Chunk the query to avoid Supabase URL length limits (max ~300 UUIDs per request)
    const CHUNK_SIZE = 200;
    console.log('[detailed-api] Step 8: About to query profiles for', userIds.length, 'users in chunks of', CHUNK_SIZE);

    let userProfiles: any[] = [];
    const searchTerm = filters?.search?.trim() ? `%${filters.search.trim()}%` : null;

    for (let i = 0; i < userIds.length; i += CHUNK_SIZE) {
      const chunk = userIds.slice(i, i + CHUNK_SIZE);
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
        .in('id', chunk);

      // Apply search filter on profiles (names/email)
      if (searchTerm) {
        profileQuery = profileQuery.or(`first_name.ilike.${searchTerm},last_name.ilike.${searchTerm},email.ilike.${searchTerm}`);
      }

      const { data: chunkProfiles, error: profilesError } = await profileQuery;

      if (profilesError) {
        console.error('[detailed-api] Profiles query error for chunk:', profilesError);
        throw profilesError;
      }

      if (chunkProfiles) {
        userProfiles = userProfiles.concat(chunkProfiles);
      }
    }
    console.log('[detailed-api] Step 9: Got profiles:', userProfiles?.length);

    // Get organizational data separately to avoid relationship issues
    const schoolIds = [...new Set(userProfiles?.map(p => p.school_id).filter(Boolean) || [])];
    const generationIds = [...new Set(userProfiles?.map(p => p.generation_id).filter(Boolean) || [])];
    const communityIds = [...new Set(userProfiles?.map(p => p.community_id).filter(Boolean) || [])];

    console.log('[detailed-api] Step 10: Fetching org data - schools:', schoolIds.length, 'generations:', generationIds.length, 'communities:', communityIds.length);
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
    console.log('[detailed-api] Step 11: Got org data');

    // Create lookup maps
    const schoolsMap = new Map(schoolsData.data?.map(s => [s.id, s] as [string, any]) || []);
    const generationsMap = new Map(generationsData.data?.map(g => [g.id, g] as [string, any]) || []);
    const communitiesMap = new Map(communitiesData.data?.map(c => [c.id, c] as [string, any]) || []);

    // Get course assignment data (actual table used in the system)
    // Use chunked queries to avoid URL length limits
    console.log('[detailed-api] Step 12: Fetching course assignments for', userIds.length, 'users');
    let courseData: any[] = [];
    for (let i = 0; i < userIds.length; i += CHUNK_SIZE) {
      const chunk = userIds.slice(i, i + CHUNK_SIZE);
      const { data: chunkCourseData, error: courseError } = await supabase
        .from('course_assignments')
        .select(`
          teacher_id,
          course_id,
          progress_percentage,
          assigned_at,
          status
        `)
        .in('teacher_id', chunk);

      if (courseError) {
        console.error('Course data error:', courseError.message);
      }
      if (chunkCourseData) {
        courseData = courseData.concat(chunkCourseData);
      }
    }

    // Get lesson progress data (actual lesson completions)
    console.log('[detailed-api] Step 13: Fetching lesson progress for', userIds.length, 'users');
    let lessonProgressData: any[] = [];
    for (let i = 0; i < userIds.length; i += CHUNK_SIZE) {
      const chunk = userIds.slice(i, i + CHUNK_SIZE);
      const { data: chunkLessonData, error: lessonProgressError } = await supabase
        .from('lesson_progress')
        .select(`
          user_id,
          lesson_id,
          completed_at,
          time_spent,
          completion_data
        `)
        .in('user_id', chunk);

      if (lessonProgressError) {
        console.error('Lesson progress data error:', lessonProgressError.message);
      }
      if (chunkLessonData) {
        lessonProgressData = lessonProgressData.concat(chunkLessonData);
      }
    }

    // Get user roles for the reportable users (including organizational assignments)
    console.log('[detailed-api] Step 14: Fetching user roles for', userIds.length, 'users');
    let reportableUserRoles: any[] = [];
    for (let i = 0; i < userIds.length; i += CHUNK_SIZE) {
      const chunk = userIds.slice(i, i + CHUNK_SIZE);
      const { data: chunkRoles, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id, role_type, school_id, generation_id, community_id')
        .in('user_id', chunk)
        .eq('is_active', true);

      if (rolesError) {
        console.error('Roles fetch error:', rolesError.message);
      }
      if (chunkRoles) {
        reportableUserRoles = reportableUserRoles.concat(chunkRoles);
      }
    }
    console.log('[detailed-api] Step 15: All data fetched, building response');

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
        const completedBlocks = userLessons.filter(l => l.completed_at);

        // Count UNIQUE lessons (not blocks) - lesson_progress is block-level
        const uniqueCompletedLessons = new Set(completedBlocks.map(l => l.lesson_id));
        const uniqueLessonCount = uniqueCompletedLessons.size;

        // Calculate completion percentage based on unique lesson completions
        // This is a rough estimate - ideally we'd know total lessons per course
        const completion_percentage = uniqueLessonCount > 0 ?
          Math.min(Math.round((uniqueLessonCount / Math.max(total_courses_enrolled * 5, 1)) * 100), 100) : 0;
        
        // Calculate actual lesson progress data
        // NOTE: lesson_progress is block-level, so count unique lessons not blocks
        // (reusing uniqueCompletedLessons from completion_percentage calculation above)
        const total_lessons_completed = uniqueCompletedLessons.size;

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
        // REBALANCED WEIGHTS: lessons (60%), time (12%), recent activity (20%), course enrollments (8%)
        // Lesson completions now heavily dominate to prevent idle time from outweighing real progress
        const lessonScore = Math.min(total_lessons_completed * 60, 600); // Max 600 points for lessons (60%)

        // Time uses diminishing returns (sqrt curve) to cap its influence
        // Examples: 25min=40pts, 100min=80pts, 225min=120pts (max)
        // This prevents users from gaming the system by leaving pages open
        const timeScore = Math.min(Math.round(Math.sqrt(total_time_spent_minutes) * 8), 120); // Max 120 points for time (12%)

        const recentActivityScore = lastActivity ?
          Math.max(200 - Math.floor((Date.now() - new Date(lastActivity).getTime()) / (1000 * 60 * 60 * 24 * 7)), 0) : 0; // 200 points max (20%), decreases weekly
        const courseScore = Math.min(total_courses_enrolled * 10, 80); // Max 80 points for courses (8%)

        const activity_score = Math.round(lessonScore + timeScore + recentActivityScore + courseScore);

        // Calculate engagement quality indicator
        const engagement_quality = (() => {
          // RED FLAG: Lots of time but no completion
          if (total_time_spent_minutes > 120 && total_lessons_completed === 0) {
            return 'passive';
          }

          // HIGH: Good completion rate
          if (completion_percentage > 50 && total_lessons_completed > 10) {
            return 'high';
          }

          // MEDIUM: Some progress
          if (total_lessons_completed > 5 || completion_percentage > 20) {
            return 'medium';
          }

          return 'low';
        })();

        // Score breakdown for transparency
        const score_breakdown = {
          lessons: Math.round(lessonScore),
          time: Math.round(timeScore),
          recency: Math.round(recentActivityScore),
          courses: Math.round(courseScore)
        };

        // HYBRID APPROACH: Use user_roles as primary source, fallback to profiles
        // This safely handles both old schools (profiles only) and new schools (user_roles)
        const userRoleOrg = userRoleOrgMap.get(profile.id);
        const effectiveSchoolId = userRoleOrg?.school_id ?? profile.school_id;
        const effectiveGenerationId = userRoleOrg?.generation_id ?? profile.generation_id;
        const effectiveCommunityId = userRoleOrg?.community_id ?? profile.community_id;

        return {
            user_id: profile.id,
            user_name: `${profile.first_name || ''} ${profile.last_name || ''}`.trim(),
            user_email: profile.email,
            user_role: roleMap.get(profile.id) || 'Sin rol',
            school_name: (schoolsMap.get(effectiveSchoolId) as any)?.name,
            generation_name: (generationsMap.get(effectiveGenerationId) as any)?.name,
            community_name: (communitiesMap.get(effectiveCommunityId) as any)?.name,
            total_courses_enrolled,
            completed_courses,
            courses_in_progress: total_courses_enrolled - completed_courses,
            completion_percentage,
            total_time_spent_minutes,
            last_activity_date: lastActivity,
            total_lessons_completed,
            average_quiz_score: 0, // Not available in current schema
            activity_score, // Add activity score for smart sorting
            engagement_quality, // Quality indicator (high/medium/low/passive)
            score_breakdown, // Breakdown of score components
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
    console.error('Error in detailed report API:', {
      message: error?.message,
      code: error?.code,
      details: error?.details,
      hint: error?.hint,
      stack: error?.stack
    });
    res.status(500).json({ error: 'Internal Server Error' });
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
      // Consultors can see users based on their assignment scope:
      // - individual: specific student_id
      // - school: all users in assigned school(s)
      // - generation: all users in assigned generation(s)
      // - community: all users in assigned community/communities
      const { data: assignments } = await supabase
        .from('consultant_assignments')
        .select('student_id, school_id, generation_id, community_id, assignment_data')
        .eq('consultant_id', userId)
        .eq('is_active', true);

      console.log('[getReportableUsers] Consultant assignments:', assignments?.length);

      if (!assignments || assignments.length === 0) {
        return [];
      }

      const userIds = new Set<string>();

      // Process assignments based on scope stored in assignment_data
      for (const assignment of assignments) {
        const scope = (assignment.assignment_data as any)?.assignment_scope || 'individual';
        console.log('[getReportableUsers] Processing assignment with scope:', scope);

        if (scope === 'individual' && assignment.student_id) {
          userIds.add(assignment.student_id);
        } else if (scope === 'school' && assignment.school_id) {
          const { data: schoolUsers } = await supabase
            .from('user_roles')
            .select('user_id')
            .eq('school_id', assignment.school_id)
            .eq('is_active', true);
          console.log('[getReportableUsers] School users found:', schoolUsers?.length);
          schoolUsers?.forEach(u => userIds.add(u.user_id));
        } else if (scope === 'generation' && assignment.generation_id) {
          const { data: generationUsers } = await supabase
            .from('user_roles')
            .select('user_id')
            .eq('generation_id', assignment.generation_id)
            .eq('is_active', true);
          console.log('[getReportableUsers] Generation users found:', generationUsers?.length);
          generationUsers?.forEach(u => userIds.add(u.user_id));
        } else if (scope === 'community' && assignment.community_id) {
          const { data: communityUsers } = await supabase
            .from('user_roles')
            .select('user_id')
            .eq('community_id', assignment.community_id)
            .eq('is_active', true);
          console.log('[getReportableUsers] Community users found:', communityUsers?.length);
          communityUsers?.forEach(u => userIds.add(u.user_id));
        }
      }

      console.log('[getReportableUsers] Total unique users:', userIds.size);
      return Array.from(userIds);
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
        .maybeSingle();

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
        .maybeSingle();

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
        .maybeSingle();

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
      // Step 1: Get supervisor's network ID from user_roles
      const { data: supervisorRole } = await supabase
        .from('user_roles')
        .select('red_id')
        .eq('user_id', userId)
        .eq('role_type', 'supervisor_de_red')
        .eq('is_active', true)
        .maybeSingle();

      if (!supervisorRole?.red_id) {
        return [];
      }

      // Step 2: Get schools in that network
      const { data: networkSchools } = await supabase
        .from('red_escuelas')
        .select('school_id')
        .eq('red_id', supervisorRole.red_id);

      if (networkSchools && networkSchools.length > 0) {
        const schoolIds = networkSchools.map(ns => ns.school_id);
        // Step 3: Get users from those schools
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
