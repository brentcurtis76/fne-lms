import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Get user's primary role using the service role client (bypasses RLS)
async function getServiceRolePrimaryRole(userId: string): Promise<string> {
  try {
    const { data, error } = await supabase
      .from('user_roles')
      .select('role_type')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('created_at', { ascending: true });

    if (error || !data || data.length === 0) return '';

    const roleOrder = [
      'admin', 'consultor', 'equipo_directivo', 'lider_generacion',
      'lider_comunidad', 'supervisor_de_red', 'community_manager', 'docente',
      'encargado_licitacion'
    ];

    for (const roleType of roleOrder) {
      if (data.some(r => r.role_type === roleType)) return roleType;
    }

    return data[0].role_type || '';
  } catch {
    return '';
  }
}

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

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return res.status(401).json({ error: 'Invalid authentication' });
    }

    // Get user role using service role client (bypasses RLS)
    const userRole = await getServiceRolePrimaryRole(user.id);

    // Check if user has access to reports
    const allowedRoles = ['admin', 'consultor', 'equipo_directivo', 'lider_generacion', 'lider_comunidad', 'supervisor_de_red'];
    if (!userRole || !allowedRoles.includes(userRole)) {
      return res.status(403).json({ error: 'Report access required' });
    }

    const warnings: string[] = [];

    // Get reportable users based on role and assignments
    let reportableUsers: string[] = [];
    try {
      reportableUsers = await getReportableUsers(user.id, userRole);
    } catch (error) {
      console.error('[Reports] getReportableUsers failed:', error);
      warnings.push('No se pudo determinar el alcance de usuarios');
    }

    const emptyResponse = {
      summary: {
        total_users: 0,
        active_users: 0,
        total_courses: 0,
        avg_completion_rate: 0,
        total_time_spent: 0
      },
      users: [],
      communities: [],
      recent_activity: [],
      warnings
    };

    if (reportableUsers.length === 0) {
      return res.status(200).json(emptyResponse);
    }

    // Get user profile data with organizational information
    const { data: userProfiles, error: profileError } = await supabase
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
      .in('id', reportableUsers);

    if (profileError) {
      console.error('Profile fetch error:', profileError.message);
      warnings.push('No se pudieron cargar perfiles de usuarios');
      return res.status(200).json(emptyResponse);
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
    const schoolsMap = new Map(schoolsData.data?.map(s => [s.id, s] as [string, any]) || []);
    const generationsMap = new Map(generationsData.data?.map(g => [g.id, g] as [string, any]) || []);
    const communitiesMap = new Map(communitiesData.data?.map(c => [c.id, c] as [string, any]) || []);

    // Combine profile data with organizational info
    const enrichedProfiles = userProfiles?.map(profile => ({
      ...profile,
      schools: profile.school_id ? schoolsMap.get(profile.school_id) : null,
      generations: profile.generation_id ? generationsMap.get(profile.generation_id) : null,
      communities: profile.community_id ? communitiesMap.get(profile.community_id) : null
    })) || [];

    // Get user roles for the reportable users
    const { data: userRoles, error: rolesError } = await supabase
      .from('user_roles')
      .select('user_id, role_type')
      .in('user_id', reportableUsers)
      .eq('is_active', true);

    if (rolesError) {
      console.error('Roles fetch error:', rolesError.message);
    }

    // Get learning path summary data for these users (paginated to avoid URL limits)
    let learningPathData = [];
    let pathError = null;
    
    const batchSize = 50;
    for (let i = 0; i < reportableUsers.length; i += batchSize) {
      const userBatch = reportableUsers.slice(i, i + batchSize);
      
      try {
        const { data: batchData, error: batchError } = await supabase
          .from('user_learning_path_summary')
          .select(`
            user_id,
            path_id,
            status,
            overall_progress_percentage,
            total_courses,
            completed_courses,
            total_time_spent_minutes,
            last_session_date,
            is_at_risk
          `)
          .in('user_id', userBatch);

        if (batchError) {
          pathError = batchError;
          break;
        }

        if (batchData) {
          learningPathData.push(...batchData);
        }
      } catch (error) {
        console.error('Learning path data not available for batch:', error);
      }
    }

    if (pathError) {
      console.error('[Reports] Learning path data error:', pathError.message);
    }

    // Get course enrollment data for additional metrics (paginated to avoid URL limits)
    let courseData = [];
    let courseError = null;
    
    for (let i = 0; i < reportableUsers.length; i += batchSize) {
      const userBatch = reportableUsers.slice(i, i + batchSize);
      
      try {
        const { data: batchData, error: batchError } = await supabase
          .from('course_enrollments')
          .select(`
            user_id,
            course_id,
            progress_percentage,
            completed_at,
            updated_at
          `)
          .in('user_id', userBatch);

        if (batchError) {
          courseError = batchError;
          break;
        }

        if (batchData) {
          courseData.push(...batchData);
        }
      } catch (error) {
        console.error('Course enrollment data not available for batch:', error);
      }
    }

    if (courseError) {
      console.error('[Reports] Course data error:', courseError.message);
    }

    // Get consultant assignments for the consultant info (paginated to avoid URL limits)
    let consultantData = [];
    let consultantError = null;
    
    for (let i = 0; i < reportableUsers.length; i += batchSize) {
      const userBatch = reportableUsers.slice(i, i + batchSize);
      
      try {
        const { data: batchData, error: batchError } = await supabase
          .from('consultant_assignments')
          .select(`
            student_id,
            consultant_id,
            assignment_type,
            is_active,
            profiles!consultant_assignments_consultant_id_fkey(first_name, last_name)
          `)
          .in('student_id', userBatch)
          .eq('is_active', true);

        if (batchError) {
          consultantError = batchError;
          break;
        }

        if (batchData) {
          consultantData.push(...batchData);
        }
      } catch (error) {
        console.error('Consultant assignment data not available for batch:', error);
      }
    }

    if (consultantError) {
      console.error('[Reports] Consultant data error:', consultantError.message);
    }

    if (pathError) {
      warnings.push('No se pudieron cargar datos de rutas de aprendizaje');
    }
    if (courseError) {
      warnings.push('No se pudieron cargar datos de inscripciones de cursos');
    }
    if (consultantError) {
      warnings.push('No se pudieron cargar datos de asignaciones de consultores');
    }

    // Format data for dashboard UI
    const formattedData = formatOverviewData(
      enrichedProfiles || [],
      userRoles || [],
      learningPathData || [],
      courseData || [],
      consultantData || []
    );

    return res.status(200).json({ ...formattedData, warnings });

  } catch (error) {
    console.error('Overview reports API error:', error);
    return res.status(200).json({
      summary: {
        total_users: 0,
        active_users: 0,
        total_courses: 0,
        avg_completion_rate: 0,
        total_time_spent: 0
      },
      users: [],
      communities: [],
      recent_activity: [],
      warnings: ['Error interno del servidor al cargar reportes']
    });
  }
}

async function getReportableUsers(userId: string, userRole: string): Promise<string[]> {
  try {
    if (userRole === 'admin') {
      // Admins can see all users with student/teacher roles
      const { data: userRoles } = await supabase
        .from('user_roles')
        .select('user_id')
        .in('role_type', ['docente', 'teacher', 'estudiante', 'student'])
        .eq('is_active', true);
      
      return userRoles?.map(ur => ur.user_id) || [];
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
      // Use user_roles as source of truth for community assignments (matches detailed.ts)
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

function formatOverviewData(
  userProfiles: any[], 
  userRoles: any[], 
  learningPathData: any[], 
  courseData: any[], 
  consultantData: any[]
): any {
  const totalUsers = userProfiles.length;

  // Create role mapping for quick lookup
  const roleMap = new Map();
  userRoles.forEach(role => {
    roleMap.set(role.user_id, role.role_type);
  });

  // Create consultant mapping for quick lookup
  const consultantMap = new Map();
  consultantData.forEach(assignment => {
    consultantMap.set(assignment.student_id, {
      has_consultant: true,
      consultant_name: assignment.profiles ? 
        `${assignment.profiles.first_name} ${assignment.profiles.last_name}` : 'Sin nombre',
      assignment_type: assignment.assignment_type,
      is_active: assignment.is_active
    });
  });

  // Calculate course metrics per user
  const userCourseMetrics = new Map();
  courseData.forEach(enrollment => {
    if (!userCourseMetrics.has(enrollment.user_id)) {
      userCourseMetrics.set(enrollment.user_id, {
        totalCourses: 0,
        completedCourses: 0,
        totalTimeSpent: 0,
        lastActivity: null
      });
    }
    
    const metrics = userCourseMetrics.get(enrollment.user_id);
    metrics.totalCourses++;
    
    if (enrollment.progress_percentage === 100) {
      metrics.completedCourses++;
    }
    
    // Update last activity if this is more recent
    const activityDate = enrollment.completed_at || enrollment.updated_at;
    if (activityDate && (!metrics.lastActivity || new Date(activityDate) > new Date(metrics.lastActivity))) {
      metrics.lastActivity = activityDate;
    }
  });

  // Calculate learning path metrics per user
  const userPathMetrics = new Map();
  learningPathData.forEach(pathData => {
    if (!userPathMetrics.has(pathData.user_id)) {
      userPathMetrics.set(pathData.user_id, {
        totalPaths: 0,
        completedPaths: 0,
        totalPathTime: 0,
        lastSessionDate: null,
        isAtRisk: false
      });
    }
    
    const metrics = userPathMetrics.get(pathData.user_id);
    metrics.totalPaths++;
    
    if (pathData.status === 'completed') {
      metrics.completedPaths++;
    }
    
    metrics.totalPathTime += pathData.total_time_spent_minutes || 0;
    
    if (pathData.last_session_date && (!metrics.lastSessionDate || 
        new Date(pathData.last_session_date) > new Date(metrics.lastSessionDate))) {
      metrics.lastSessionDate = pathData.last_session_date;
    }
    
    if (pathData.is_at_risk) {
      metrics.isAtRisk = true;
    }
  });

  // Determine active users (activity in last 30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  let activeUsers = 0;
  let totalCourses = 0;
  let totalCompletedCourses = 0;
  let totalTimeSpentMinutes = 0;

  // Build users array with complete data
  const users = userProfiles.map(profile => {
    const courseMetrics = userCourseMetrics.get(profile.id) || {
      totalCourses: 0,
      completedCourses: 0,
      totalTimeSpent: 0,
      lastActivity: null
    };
    
    const pathMetrics = userPathMetrics.get(profile.id) || {
      totalPaths: 0,
      completedPaths: 0,
      totalPathTime: 0,
      lastSessionDate: null,
      isAtRisk: false
    };

    // Determine most recent activity
    const lastActivity = [courseMetrics.lastActivity, pathMetrics.lastSessionDate]
      .filter(date => date)
      .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];

    // Check if user is active (has activity in last 30 days)
    const isActive = lastActivity && new Date(lastActivity) > thirtyDaysAgo;
    if (isActive) activeUsers++;

    // Calculate completion rate
    const totalUserCourses = courseMetrics.totalCourses;
    const completedUserCourses = courseMetrics.completedCourses;
    const completionRate = totalUserCourses > 0 ? 
      Math.round((completedUserCourses / totalUserCourses) * 100) : 0;

    // Add to totals
    totalCourses += totalUserCourses;
    totalCompletedCourses += completedUserCourses;
    totalTimeSpentMinutes += pathMetrics.totalPathTime;

    return {
      id: profile.id,
      first_name: profile.first_name,
      last_name: profile.last_name,
      email: profile.email,
      role: roleMap.get(profile.id) || 'Sin rol',
      school_id: profile.school_id,
      generation_id: profile.generation_id,
      community_id: profile.community_id,
      last_activity: lastActivity,
      total_courses: totalUserCourses,
      completed_courses: completedUserCourses,
      completion_rate: completionRate,
      total_time_spent: Math.round(pathMetrics.totalPathTime), // in minutes
      consultant_info: consultantMap.get(profile.id) || {
        has_consultant: false,
        consultant_name: null,
        assignment_type: null,
        is_active: false
      }
    };
  });

  // Calculate average completion rate
  const avgCompletionRate = totalUsers > 0 ? 
    Math.round((totalCompletedCourses / Math.max(totalCourses, 1)) * 100 * 100) / 100 : 0;

  // Group by communities for community breakdown
  const communityBreakdown = new Map();
  users.forEach(user => {
    const profile = userProfiles.find(p => p.id === user.id);
    const communityName = profile?.communities?.name || 'Sin comunidad';
    const communityId = profile?.community_id || 'no-community';
    
    if (!communityBreakdown.has(communityId)) {
      communityBreakdown.set(communityId, {
        id: communityId,
        name: communityName,
        user_count: 0,
        total_courses: 0,
        completed_courses: 0,
        avg_completion_rate: 0
      });
    }
    
    const community = communityBreakdown.get(communityId);
    community.user_count++;
    community.total_courses += user.total_courses || 0;
    community.completed_courses += user.completed_courses || 0;
    community.avg_completion_rate = community.total_courses > 0 ? 
      Math.round((community.completed_courses / community.total_courses) * 100 * 100) / 100 : 0;
  });

  // Create recent activity entries (simplified)
  const recentActivity = users
    .filter(user => user.last_activity && new Date(user.last_activity) > thirtyDaysAgo)
    .slice(0, 10) // Limit to 10 most recent
    .map(user => ({
      user_id: user.id,
      user_name: `${user.first_name} ${user.last_name}`,
      activity_type: 'lesson_completion',
      created_at: user.last_activity
    }));

  return {
    summary: {
      total_users: totalUsers,
      active_users: activeUsers,
      total_courses: totalCourses,
      avg_completion_rate: avgCompletionRate,
      total_time_spent: Math.round(totalTimeSpentMinutes) // in minutes
    },
    users: users,
    communities: Array.from(communityBreakdown.values()),
    recent_activity: recentActivity
  };
}