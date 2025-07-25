import { NextApiRequest, NextApiResponse } from 'next';
import { supabase } from '../../../lib/supabase-wrapper';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid authorization header' });
    }

    const token = authHeader.split(' ')[1];
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    const { userId } = req.query;
    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    // Get requesting user's roles using modern role system
    const { data: userRoles } = await supabase
      .from('user_roles')
      .select('role_type, school_id, generation_id, community_id')
      .eq('user_id', user.id)
      .eq('is_active', true);

    if (!userRoles?.length) {
      return res.status(403).json({ error: 'Access denied - no active roles' });
    }

    // Get highest role
    const roleHierarchy = ['admin', 'supervisor_de_red', 'equipo_directivo', 'lider_generacion', 'lider_comunidad', 'consultor', 'docente'];
    const highestRole = roleHierarchy.find(role => userRoles.some(r => r.role_type === role)) || 'docente';

    // Check if requesting user can access this user's details
    const { data: targetUserProfile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (!targetUserProfile) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Permission check based on roles
    const hasAccess = checkUserAccessModern(user.id, highestRole, userRoles, targetUserProfile);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied to view this user' });
    }

    // Get comprehensive user details
    const [
      userBasicInfo,
      courseProgress,
      lessonCompletions,
      quizResults,
      timeSpent,
      consultantAssignments,
      recentActivity
    ] = await Promise.all([
      getUserBasicInfo(userId as string),
      getCourseProgress(userId as string),
      getLessonCompletions(userId as string),
      getQuizResults(userId as string),
      getTimeSpent(userId as string),
      getConsultantAssignments(userId as string),
      getRecentActivity(userId as string)
    ]);

    const userDetails = {
      basic_info: userBasicInfo,
      course_progress: courseProgress,
      lesson_completions: lessonCompletions,
      quiz_results: quizResults,
      time_spent: timeSpent,
      consultant_assignments: consultantAssignments,
      recent_activity: recentActivity,
      summary: {
        total_courses: courseProgress.length,
        completed_courses: courseProgress.filter(c => c.completion_rate >= 100).length,
        avg_completion_rate: courseProgress.length > 0 
          ? courseProgress.reduce((sum, c) => sum + (c.completion_rate || 0), 0) / courseProgress.length 
          : 0,
        total_lessons_completed: lessonCompletions.length,
        avg_quiz_score: quizResults.length > 0 
          ? quizResults.reduce((sum, q) => sum + (q.percentage_score || 0), 0) / quizResults.length 
          : 0,
        total_time_minutes: timeSpent.reduce((sum, t) => sum + (t.time_spent_minutes || 0), 0),
        last_activity: recentActivity[0]?.completed_at || null
      }
    };

    res.status(200).json(userDetails);

  } catch (error) {
    console.error('Error fetching user details:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

function checkUserAccessModern(requestingUserId: string, highestRole: string, userRoles: any[], targetUser: any): boolean {
  // Admin can see everyone
  if (highestRole === 'admin') return true;

  // Users can see their own details
  if (requestingUserId === targetUser.id) return true;

  // Check role-based access
  switch (highestRole) {
    case 'equipo_directivo':
      const directivoRole = userRoles.find(r => r.role_type === 'equipo_directivo');
      return directivoRole && targetUser.school_id === directivoRole.school_id;
    
    case 'lider_generacion':
      const generationRole = userRoles.find(r => r.role_type === 'lider_generacion');
      return generationRole && 
             targetUser.school_id === generationRole.school_id && 
             targetUser.generation_id === generationRole.generation_id;
    
    case 'lider_comunidad':
      const communityRole = userRoles.find(r => r.role_type === 'lider_comunidad');
      return communityRole && targetUser.community_id === communityRole.community_id;
    
    case 'consultor':
      // Simplified for now - consultors can see assigned users
      return true;
    
    case 'supervisor_de_red':
      // Simplified for now - supervisors can see users in their network
      return true;
    
    default:
      return false;
  }
}

async function getUserBasicInfo(userId: string) {
  // Get basic user profile
  const { data: profile } = await supabase
    .from('profiles')
    .select(`
      id, first_name, last_name, email, phone, avatar_url,
      created_at, last_login, school_id, generation_id, community_id
    `)
    .eq('id', userId)
    .single();

  if (!profile) return null;

  // Get user's role from modern role system
  const { data: userRoles } = await supabase
    .from('user_roles')
    .select('role_type')
    .eq('user_id', userId)
    .eq('is_active', true);

  const roleHierarchy = ['admin', 'supervisor_de_red', 'equipo_directivo', 'lider_generacion', 'lider_comunidad', 'consultor', 'docente'];
  const highestRole = roleHierarchy.find(role => userRoles?.some(r => r.role_type === role)) || 'docente';

  // Get related data separately to avoid relationship issues
  const [schoolData, generationData, communityData] = await Promise.all([
    profile.school_id ? supabase
      .from('schools')
      .select('name')
      .eq('id', profile.school_id)
      .single() : Promise.resolve({ data: null }),
    
    profile.generation_id ? supabase
      .from('generations')
      .select('name')
      .eq('id', profile.generation_id)
      .single() : Promise.resolve({ data: null }),
    
    profile.community_id ? supabase
      .from('growth_communities')
      .select('name')
      .eq('id', profile.community_id)
      .single() : Promise.resolve({ data: null })
  ]);

  return {
    ...profile,
    role: highestRole, // Use role from modern system
    schools: schoolData.data,
    generations: generationData.data,
    growth_communities: communityData.data
  };
}

async function getCourseProgress(userId: string) {
  // Get course assignments (current table name)
  const { data: assignments } = await supabase
    .from('course_assignments')
    .select(`
      id, assigned_at, progress_percentage, status, course_id
    `)
    .eq('teacher_id', userId)
    .order('assigned_at', { ascending: false });

  if (!assignments?.length) return [];

  // Get course details separately
  const courseIds = assignments.map(a => a.course_id);
  const { data: courses } = await supabase
    .from('courses')
    .select('id, title, description, category')
    .in('id', courseIds);

  const courseMap = new Map(courses?.map(c => [c.id, c]) || []);

  // Combine assignment and course data
  return assignments.map(assignment => ({
    id: assignment.id,
    enrolled_at: assignment.assigned_at,
    completion_rate: assignment.progress_percentage || 0,
    last_accessed: assignment.assigned_at, // Use assigned_at as placeholder
    courses: courseMap.get(assignment.course_id) || null
  }));
}

async function getLessonCompletions(userId: string) {
  // Get lesson progress data (current table name)
  const { data: progressData } = await supabase
    .from('lesson_progress')
    .select(`
      id, completed_at, time_spent, lesson_id
    `)
    .eq('user_id', userId)
    .not('completed_at', 'is', null)
    .order('completed_at', { ascending: false })
    .limit(20);

  if (!progressData?.length) return [];

  // Get lesson, module, and course data separately
  const lessonIds = progressData.map(p => p.lesson_id);
  const { data: lessons } = await supabase
    .from('lessons')
    .select('id, title, order_index, module_id')
    .in('id', lessonIds);

  const moduleIds = lessons?.map(l => l.module_id) || [];
  const { data: modules } = moduleIds.length > 0 ? await supabase
    .from('modules')
    .select('id, title, course_id')
    .in('id', moduleIds) : { data: [] };

  const courseIds = modules?.map(m => m.course_id) || [];
  const { data: courses } = courseIds.length > 0 ? await supabase
    .from('courses')
    .select('id, title')
    .in('id', courseIds) : { data: [] };

  // Create lookup maps
  const lessonMap = new Map(lessons?.map(l => [l.id, l]) || []);
  const moduleMap = new Map(modules?.map(m => [m.id, m]) || []);
  const courseMap = new Map(courses?.map(c => [c.id, c]) || []);

  // Combine data
  return progressData.map(progress => {
    const lesson = lessonMap.get(progress.lesson_id);
    const module = lesson ? moduleMap.get(lesson.module_id) : null;
    const course = module ? courseMap.get(module.course_id) : null;

    return {
      ...progress,
      time_spent_minutes: Math.round((progress.time_spent || 0) / 60), // Convert seconds to minutes
      lessons: lesson ? {
        ...lesson,
        modules: module ? {
          ...module,
          courses: course
        } : null
      } : null
    };
  });
}

async function getQuizResults(userId: string) {
  // Quiz functionality not available in current schema
  // Return empty array for now
  return [];
}

async function getTimeSpent(userId: string) {
  // Get time spent data from lesson_progress
  const { data: timeData } = await supabase
    .from('lesson_progress')
    .select(`
      time_spent, lesson_id
    `)
    .eq('user_id', userId)
    .not('time_spent', 'is', null);

  if (!timeData?.length) return [];

  // Get lesson, module, and course data separately
  const lessonIds = timeData.map(t => t.lesson_id);
  const { data: lessons } = await supabase
    .from('lessons')
    .select('id, module_id')
    .in('id', lessonIds);

  const moduleIds = lessons?.map(l => l.module_id) || [];
  const { data: modules } = moduleIds.length > 0 ? await supabase
    .from('modules')
    .select('id, course_id')
    .in('id', moduleIds) : { data: [] };

  const courseIds = modules?.map(m => m.course_id) || [];
  const { data: courses } = courseIds.length > 0 ? await supabase
    .from('courses')
    .select('id, title')
    .in('id', courseIds) : { data: [] };

  // Create lookup maps
  const lessonMap = new Map(lessons?.map(l => [l.id, l]) || []);
  const moduleMap = new Map(modules?.map(m => [m.id, m]) || []);
  const courseMap = new Map(courses?.map(c => [c.id, c]) || []);

  // Combine data
  return timeData.map(time => {
    const lesson = lessonMap.get(time.lesson_id);
    const module = lesson ? moduleMap.get(lesson.module_id) : null;
    const course = module ? courseMap.get(module.course_id) : null;

    return {
      time_spent_minutes: Math.round((time.time_spent || 0) / 60), // Convert seconds to minutes
      lessons: lesson ? {
        modules: module ? {
          courses: course || null
        } : null
      } : null
    };
  });
}

async function getConsultantAssignments(userId: string) {
  const { data } = await supabase
    .from('consultant_assignments')
    .select(`
      id, assignment_type, start_date, end_date, is_active,
      permissions, notes,
      consultant:profiles!consultant_id(first_name, last_name, email)
    `)
    .eq('assigned_user_id', userId)
    .order('created_at', { ascending: false });

  return data || [];
}

async function getRecentActivity(userId: string) {
  // Get recent lesson completions from lesson_progress
  const { data: lessonProgress } = await supabase
    .from('lesson_progress')
    .select(`
      id, completed_at, time_spent, lesson_id, user_id
    `)
    .eq('user_id', userId)
    .not('completed_at', 'is', null)
    .order('completed_at', { ascending: false })
    .limit(15);

  if (!lessonProgress?.length) return [];

  // Get lesson titles separately
  const lessonIds = lessonProgress.map(l => l.lesson_id);
  const { data: lessons } = await supabase
    .from('lessons')
    .select('id, title')
    .in('id', lessonIds);

  const lessonMap = new Map(lessons?.map(l => [l.id, l]) || []);

  const activities = lessonProgress.map((item: any) => {
    const lesson = lessonMap.get(item.lesson_id);
    return {
      id: item.id,
      completed_at: item.completed_at,
      time_spent: Math.round((item.time_spent || 0) / 60), // Convert seconds to minutes
      lesson_id: item.lesson_id,
      user_id: item.user_id,
      lessons: lesson,
      activity_type: 'lesson_completion',
      description: `Completó la lección: ${lesson?.title || 'Lección desconocida'}`
    };
  });

  return activities;
}