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

    // Get requesting user's profile and permissions
    const { data: requestingUserProfile } = await supabase
      .from('profiles')
      .select('role, school_id, generation_id, community_id')
      .eq('id', user.id)
      .single();

    if (!requestingUserProfile) {
      return res.status(403).json({ error: 'Access denied' });
    }

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
    const hasAccess = checkUserAccess(requestingUserProfile, targetUserProfile);
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

function checkUserAccess(requestingUser: any, targetUser: any): boolean {
  const { role, school_id, generation_id, community_id } = requestingUser;

  // Admin can see everyone
  if (role === 'admin') return true;

  // Users can see their own details
  if (requestingUser.id === targetUser.id) return true;

  // Check consultant assignments
  // This would need to query consultant_assignments table
  // For now, we'll implement basic role-based access

  switch (role) {
    case 'equipo_directivo':
      return targetUser.school_id === school_id;
    
    case 'lider_generacion':
      return targetUser.school_id === school_id && targetUser.generation_id === generation_id;
    
    case 'lider_comunidad':
      return targetUser.community_id === community_id;
    
    case 'consultor':
      // Would need to check consultant_assignments table
      return true; // Simplified for now
    
    case 'supervisor_de_red':
      // Supervisor de red can see users from schools in their assigned network
      // Would need to check red_escuelas table to verify school is in their network
      return true; // Simplified for now - actual implementation should check network assignment
    
    default:
      return false;
  }
}

async function getUserBasicInfo(userId: string) {
  // Get basic user profile
  const { data: profile } = await supabase
    .from('profiles')
    .select(`
      id, first_name, last_name, email, role, phone, avatar_url,
      created_at, last_login, school_id, generation_id, community_id
    `)
    .eq('id', userId)
    .single();

  if (!profile) return null;

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
    schools: schoolData.data,
    generations: generationData.data,
    growth_communities: communityData.data
  };
}

async function getCourseProgress(userId: string) {
  // Get course enrollments
  const { data: enrollments } = await supabase
    .from('course_enrollments')
    .select(`
      id, enrolled_at, completion_rate, last_accessed, course_id
    `)
    .eq('user_id', userId)
    .order('enrolled_at', { ascending: false });

  if (!enrollments?.length) return [];

  // Get course details separately
  const courseIds = enrollments.map(e => e.course_id);
  const { data: courses } = await supabase
    .from('courses')
    .select('id, title, description, category')
    .in('id', courseIds);

  const courseMap = new Map(courses?.map(c => [c.id, c]) || []);

  // Combine enrollment and course data
  return enrollments.map(enrollment => ({
    ...enrollment,
    courses: courseMap.get(enrollment.course_id) || null
  }));
}

async function getLessonCompletions(userId: string) {
  // Get user progress data
  const { data: progressData } = await supabase
    .from('user_progress')
    .select(`
      id, completed_at, time_spent_minutes, lesson_id
    `)
    .eq('user_id', userId)
    .eq('completed', true)
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
  // Get quiz attempts data
  const { data: quizData } = await supabase
    .from('quiz_attempts')
    .select(`
      id, score, max_score, percentage_score, attempted_at, lesson_id
    `)
    .eq('user_id', userId)
    .order('attempted_at', { ascending: false })
    .limit(20);

  if (!quizData?.length) return [];

  // Get lesson, module, and course data separately
  const lessonIds = quizData.map(q => q.lesson_id);
  const { data: lessons } = await supabase
    .from('lessons')
    .select('id, title, module_id')
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
  return quizData.map(quiz => {
    const lesson = lessonMap.get(quiz.lesson_id);
    const module = lesson ? moduleMap.get(lesson.module_id) : null;
    const course = module ? courseMap.get(module.course_id) : null;

    return {
      ...quiz,
      lessons: lesson ? {
        ...lesson,
        modules: module ? {
          title: module.title,
          courses: course ? { title: course.title } : null
        } : null
      } : null
    };
  });
}

async function getTimeSpent(userId: string) {
  // Get time spent data
  const { data: timeData } = await supabase
    .from('user_progress')
    .select(`
      time_spent_minutes, lesson_id
    `)
    .eq('user_id', userId)
    .not('time_spent_minutes', 'is', null);

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
      ...time,
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
  // Get recent lesson completions and quiz attempts separately
  const [lessonProgress, quizAttempts] = await Promise.all([
    supabase
      .from('user_progress')
      .select(`
        id, completed_at, time_spent_minutes, lesson_id, user_id
      `)
      .eq('user_id', userId)
      .eq('completed', true)
      .order('completed_at', { ascending: false })
      .limit(10),
    
    supabase
      .from('quiz_attempts')
      .select(`
        id, attempted_at, score, lesson_id, user_id
      `)
      .eq('user_id', userId)
      .order('attempted_at', { ascending: false })
      .limit(10)
  ]);

  // Get lesson titles separately
  const allLessonIds = [
    ...(lessonProgress.data?.map(l => l.lesson_id) || []),
    ...(quizAttempts.data?.map(q => q.lesson_id) || [])
  ];
  
  const uniqueLessonIds = [...new Set(allLessonIds)];
  const { data: lessons } = uniqueLessonIds.length > 0 ? await supabase
    .from('lessons')
    .select('id, title')
    .in('id', uniqueLessonIds) : { data: [] };

  const lessonMap = new Map(lessons?.map(l => [l.id, l]) || []);

  const activities = [
    ...(lessonProgress.data || []).map((item: any) => {
      const lesson = lessonMap.get(item.lesson_id);
      return {
        id: item.id,
        completed_at: item.completed_at,
        time_spent: item.time_spent_minutes,
        lesson_id: item.lesson_id,
        user_id: item.user_id,
        lessons: lesson,
        activity_type: 'lesson_completion',
        description: `Completó la lección: ${lesson?.title || 'Lección desconocida'}`
      };
    }),
    ...(quizAttempts.data || []).map((item: any) => {
      const lesson = lessonMap.get(item.lesson_id);
      return {
        id: item.id,
        completed_at: item.attempted_at,
        score: item.score,
        lesson_id: item.lesson_id,
        user_id: item.user_id,
        lessons: lesson,
        activity_type: 'quiz_attempt',
        description: `Realizó quiz en: ${lesson?.title || 'Lección desconocida'}`
      };
    })
  ].sort((a, b) => new Date(b.completed_at || 0).getTime() - new Date(a.completed_at || 0).getTime());

  return activities.slice(0, 15);
}