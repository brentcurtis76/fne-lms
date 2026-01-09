import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Schools to exclude from statistics
const EXCLUDED_SCHOOLS = ['Fundación Nueva Educación', 'Los Pellines'];

interface DashboardStats {
  totalUsers: number;
  mostCompletedCourse: {
    id: string;
    title: string;
    completionCount: number;
    thumbnail_url?: string;
    instructor_name?: string;
    description?: string;
  } | null;
  topLearner: {
    id: string;
    name: string;
    email: string;
    avatar_url?: string;
    completedCourses: number;
    school_name?: string;
    role?: string;
  } | null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get excluded school IDs
    const { data: excludedSchools } = await supabase
      .from('schools')
      .select('id')
      .in('name', EXCLUDED_SCHOOLS);

    const excludedSchoolIds = excludedSchools?.map(s => s.id) || [];

    // 1. Get total users (excluding internal schools)
    let totalUsersQuery = supabase
      .from('profiles')
      .select('id', { count: 'exact' });

    if (excludedSchoolIds.length > 0) {
      // Get users NOT in excluded schools (or with no school)
      totalUsersQuery = totalUsersQuery.or(`school_id.is.null,school_id.not.in.(${excludedSchoolIds.join(',')})`);
    }

    const { count: totalUsers } = await totalUsersQuery;

    // 2. Get most completed course
    // First get all completions (progress_percentage >= 100 means completed)
    // Note: Using the correct relationship via user_id foreign key
    const { data: completions, error: completionsError } = await supabase
      .from('course_enrollments')
      .select(`
        course_id,
        user_id,
        progress_percentage,
        profiles!course_enrollments_user_id_fkey(school_id)
      `)
      .gte('progress_percentage', 100);

    console.log('[Dashboard Stats] Completions found:', completions?.length, 'Error:', completionsError);

    // Filter out excluded schools and count completions per course
    const courseCompletionCounts: Record<string, number> = {};

    if (completions) {
      for (const enrollment of completions) {
        const profile = enrollment.profiles as any;
        const schoolId = profile?.school_id;

        // Skip if user belongs to excluded school
        if (schoolId && excludedSchoolIds.includes(schoolId)) {
          continue;
        }

        const courseId = enrollment.course_id;
        courseCompletionCounts[courseId] = (courseCompletionCounts[courseId] || 0) + 1;
      }
    }

    // Find course with most completions
    let mostCompletedCourseId: string | null = null;
    let maxCompletions = 0;

    for (const [courseId, count] of Object.entries(courseCompletionCounts)) {
      if (count > maxCompletions) {
        maxCompletions = count;
        mostCompletedCourseId = courseId;
      }
    }

    let mostCompletedCourse: DashboardStats['mostCompletedCourse'] = null;

    if (mostCompletedCourseId) {
      const { data: courseData } = await supabase
        .from('courses')
        .select(`
          id,
          title,
          thumbnail_url,
          description,
          instructor:instructors(full_name)
        `)
        .eq('id', mostCompletedCourseId)
        .single();

      if (courseData) {
        const instructor = courseData.instructor as any;
        mostCompletedCourse = {
          id: courseData.id,
          title: courseData.title,
          completionCount: maxCompletions,
          thumbnail_url: courseData.thumbnail_url,
          instructor_name: instructor?.full_name || undefined,
          description: courseData.description || undefined
        };
      }
    }

    // 3. Get user with most completed courses (excluding internal schools)
    const userCompletionCounts: Record<string, { count: number; profile: any }> = {};

    if (completions) {
      for (const enrollment of completions) {
        const profile = enrollment.profiles as any;
        const schoolId = profile?.school_id;

        // Skip if user belongs to excluded school
        if (schoolId && excludedSchoolIds.includes(schoolId)) {
          continue;
        }

        const userId = enrollment.user_id;
        if (!userCompletionCounts[userId]) {
          userCompletionCounts[userId] = { count: 0, profile: null };
        }
        userCompletionCounts[userId].count += 1;
      }
    }

    // Find user with most completions
    let topLearnerId: string | null = null;
    let maxUserCompletions = 0;

    for (const [userId, data] of Object.entries(userCompletionCounts)) {
      if (data.count > maxUserCompletions) {
        maxUserCompletions = data.count;
        topLearnerId = userId;
      }
    }

    let topLearner: DashboardStats['topLearner'] = null;

    if (topLearnerId && maxUserCompletions > 0) {
      const { data: profileData } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, email, avatar_url, school_id')
        .eq('id', topLearnerId)
        .single();

      // Get school name if available
      let schoolName: string | undefined;
      if (profileData?.school_id) {
        const { data: schoolData } = await supabase
          .from('schools')
          .select('name')
          .eq('id', profileData.school_id)
          .single();
        schoolName = schoolData?.name;
      }

      // Get user role
      const { data: roleData } = await supabase
        .from('user_roles')
        .select('role_type')
        .eq('user_id', topLearnerId)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      // Map role to Spanish display name
      const roleDisplayMap: Record<string, string> = {
        'docente': 'Docente',
        'directivo': 'Directivo',
        'estudiante': 'Estudiante',
        'admin': 'Administrador',
        'consultor': 'Consultor',
        'community_manager': 'Community Manager',
        'supervisor_de_red': 'Supervisor de Red',
        'lider_comunidad': 'Líder de Comunidad',
        'lider_generacion': 'Líder de Generación',
        'equipo_directivo': 'Equipo Directivo'
      };

      if (profileData) {
        topLearner = {
          id: profileData.id,
          name: `${profileData.first_name || ''} ${profileData.last_name || ''}`.trim() || 'Usuario',
          email: profileData.email || '',
          avatar_url: profileData.avatar_url,
          completedCourses: maxUserCompletions,
          school_name: schoolName,
          role: roleData?.role_type ? roleDisplayMap[roleData.role_type] || roleData.role_type : undefined
        };
      }
    }

    const stats: DashboardStats = {
      totalUsers: totalUsers || 0,
      mostCompletedCourse,
      topLearner
    };

    return res.status(200).json(stats);
  } catch (error) {
    console.error('[Dashboard Stats API] Error:', error);
    return res.status(500).json({ error: 'Server error' });
  }
}
