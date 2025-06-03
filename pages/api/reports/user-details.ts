import { NextApiRequest, NextApiResponse } from 'next';
import { supabase } from '../../../lib/supabase';

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
        last_activity: recentActivity[0]?.created_at || null
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
    
    default:
      return false;
  }
}

async function getUserBasicInfo(userId: string) {
  const { data } = await supabase
    .from('profiles')
    .select(`
      id, first_name, last_name, email, role, phone, avatar_url,
      created_at, last_login,
      schools!inner(name),
      generations(name),
      growth_communities(name)
    `)
    .eq('id', userId)
    .single();

  return data;
}

async function getCourseProgress(userId: string) {
  const { data } = await supabase
    .from('course_enrollments')
    .select(`
      id, enrolled_at, completion_rate, last_accessed,
      courses!inner(id, title, description, category)
    `)
    .eq('user_id', userId)
    .order('enrolled_at', { ascending: false });

  return data || [];
}

async function getLessonCompletions(userId: string) {
  const { data } = await supabase
    .from('user_progress')
    .select(`
      id, completed_at, time_spent_minutes,
      lessons!inner(id, title, order_index,
        modules!inner(id, title,
          courses!inner(id, title)
        )
      )
    `)
    .eq('user_id', userId)
    .eq('completed', true)
    .order('completed_at', { ascending: false })
    .limit(20);

  return data || [];
}

async function getQuizResults(userId: string) {
  const { data } = await supabase
    .from('quiz_attempts')
    .select(`
      id, score, max_score, percentage_score, attempted_at,
      lessons!inner(id, title,
        modules!inner(title,
          courses!inner(title)
        )
      )
    `)
    .eq('user_id', userId)
    .order('attempted_at', { ascending: false })
    .limit(20);

  return data || [];
}

async function getTimeSpent(userId: string) {
  const { data } = await supabase
    .from('user_progress')
    .select(`
      time_spent_minutes,
      lessons!inner(
        modules!inner(
          courses!inner(title)
        )
      )
    `)
    .eq('user_id', userId)
    .not('time_spent_minutes', 'is', null);

  return data || [];
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
  // This would typically come from an activity log table
  // For now, we'll get recent lesson completions and quiz attempts
  const [lessons, quizzes] = await Promise.all([
    supabase
      .from('user_progress')
      .select(`
        completed_at as created_at,
        lessons!inner(title)
      `)
      .eq('user_id', userId)
      .eq('completed', true)
      .order('completed_at', { ascending: false })
      .limit(10),
    
    supabase
      .from('quiz_attempts')
      .select(`
        attempted_at as created_at,
        lessons!inner(title)
      `)
      .eq('user_id', userId)
      .order('attempted_at', { ascending: false })
      .limit(10)
  ]);

  const activities = [
    ...(lessons.data || []).map(item => ({
      ...item,
      activity_type: 'lesson_completion',
      description: `Completó la lección: ${item.lessons.title}`
    })),
    ...(quizzes.data || []).map(item => ({
      ...item,
      activity_type: 'quiz_attempt',
      description: `Realizó quiz en: ${item.lessons.title}`
    }))
  ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  return activities.slice(0, 15);
}