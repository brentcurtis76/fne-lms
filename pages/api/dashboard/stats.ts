import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Schools to exclude from statistics
const EXCLUDED_SCHOOLS = ['Fundación Nueva Educación', 'Los Pellines'];

const ROLE_DISPLAY_MAP: Record<string, string> = {
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

const STATS_LABEL_MAP: Record<string, string> = {
  'admin': 'Estadísticas de la Plataforma',
  'supervisor_de_red': 'Estadísticas de tu Red',
  'lider_generacion': 'Estadísticas de tu Generación',
  'lider_comunidad': 'Estadísticas de tu Comunidad',
  'equipo_directivo': 'Estadísticas de tu Escuela',
  'consultor': 'Estadísticas de tus Estudiantes'
};

interface DashboardStats {
  totalUsers: number;
  statsLabel: string;
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

    // Authenticate the request (required)
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

    const userId = user.id;
    let userRole = '';

    // Get role using service role client
    const { data: roles } = await supabase
      .from('user_roles')
      .select('role_type')
      .eq('user_id', userId)
      .eq('is_active', true);

    if (roles && roles.length > 0) {
      const roleOrder = [
        'admin', 'consultor', 'equipo_directivo', 'lider_generacion',
        'lider_comunidad', 'supervisor_de_red', 'community_manager', 'docente',
        'encargado_licitacion'
      ];
      for (const rt of roleOrder) {
        if (roles.some(r => r.role_type === rt)) { userRole = rt; break; }
      }
      if (!userRole) userRole = roles[0].role_type;
    }

    // Get scoped user IDs based on role
    const scopedUserIds = await getScopedUserIds(supabase, userId, userRole);
    const statsLabel = STATS_LABEL_MAP[userRole] || 'Estadísticas de tu Aprendizaje';

    // Get excluded school IDs
    const { data: excludedSchools } = await supabase
      .from('schools')
      .select('id')
      .in('name', EXCLUDED_SCHOOLS);

    const excludedSchoolIds = excludedSchools?.map(s => s.id) || [];

    // 1. Total users count
    let totalUsers = 0;
    if (scopedUserIds === null) {
      // Global scope (admin) - count all users excluding internal schools
      let totalUsersQuery = supabase
        .from('profiles')
        .select('id', { count: 'exact' });

      if (excludedSchoolIds.length > 0) {
        totalUsersQuery = totalUsersQuery.or(`school_id.is.null,school_id.not.in.(${excludedSchoolIds.join(',')})`);
      }

      const { count } = await totalUsersQuery;
      totalUsers = count || 0;
    } else {
      totalUsers = scopedUserIds.length;
    }

    // 2. Get completions - scoped by user IDs
    let completions: any[] | null = null;

    if (scopedUserIds === null) {
      // Global scope
      const { data } = await supabase
        .from('course_enrollments')
        .select(`
          course_id,
          user_id,
          progress_percentage,
          profiles!course_enrollments_user_id_fkey(school_id)
        `)
        .gte('progress_percentage', 100);
      completions = data;
    } else if (scopedUserIds.length > 0) {
      // Scoped - batch query for large sets
      const batchSize = 50;
      completions = [];
      for (let i = 0; i < scopedUserIds.length; i += batchSize) {
        const batch = scopedUserIds.slice(i, i + batchSize);
        const { data } = await supabase
          .from('course_enrollments')
          .select(`
            course_id,
            user_id,
            progress_percentage,
            profiles!course_enrollments_user_id_fkey(school_id)
          `)
          .in('user_id', batch)
          .gte('progress_percentage', 100);
        if (data) completions.push(...data);
      }
    }

    // Filter excluded schools and count course completions
    const courseCompletionCounts: Record<string, number> = {};
    const userCompletionCounts: Record<string, number> = {};

    if (completions) {
      for (const enrollment of completions) {
        const profile = enrollment.profiles as any;
        const schoolId = profile?.school_id;

        if (schoolId && excludedSchoolIds.includes(schoolId)) continue;

        courseCompletionCounts[enrollment.course_id] = (courseCompletionCounts[enrollment.course_id] || 0) + 1;
        userCompletionCounts[enrollment.user_id] = (userCompletionCounts[enrollment.user_id] || 0) + 1;
      }
    }

    // Find most completed course
    let mostCompletedCourse: DashboardStats['mostCompletedCourse'] = null;
    let mostCompletedCourseId: string | null = null;
    let maxCompletions = 0;

    for (const [courseId, count] of Object.entries(courseCompletionCounts)) {
      if (count > maxCompletions) {
        maxCompletions = count;
        mostCompletedCourseId = courseId;
      }
    }

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

    // Find top learner
    let topLearner: DashboardStats['topLearner'] = null;
    let topLearnerId: string | null = null;
    let maxUserCompletions = 0;

    for (const [uid, count] of Object.entries(userCompletionCounts)) {
      if (count > maxUserCompletions) {
        maxUserCompletions = count;
        topLearnerId = uid;
      }
    }

    if (topLearnerId && maxUserCompletions > 0) {
      const { data: profileData } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, email, avatar_url, school_id')
        .eq('id', topLearnerId)
        .single();

      let schoolName: string | undefined;
      if (profileData?.school_id) {
        const { data: schoolData } = await supabase
          .from('schools')
          .select('name')
          .eq('id', profileData.school_id)
          .single();
        schoolName = schoolData?.name;
      }

      const { data: roleData } = await supabase
        .from('user_roles')
        .select('role_type')
        .eq('user_id', topLearnerId)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (profileData) {
        topLearner = {
          id: profileData.id,
          name: `${profileData.first_name || ''} ${profileData.last_name || ''}`.trim() || 'Usuario',
          email: profileData.email || '',
          avatar_url: profileData.avatar_url,
          completedCourses: maxUserCompletions,
          school_name: schoolName,
          role: roleData?.role_type ? ROLE_DISPLAY_MAP[roleData.role_type] || roleData.role_type : undefined
        };
      }
    }

    const stats: DashboardStats = {
      totalUsers,
      statsLabel,
      mostCompletedCourse,
      topLearner
    };

    return res.status(200).json(stats);
  } catch (error) {
    console.error('[Dashboard Stats API] Error:', error);
    return res.status(200).json({
      totalUsers: 0,
      statsLabel: 'Estadísticas',
      mostCompletedCourse: null,
      topLearner: null
    });
  }
}

/**
 * Get scoped user IDs based on the requester's role.
 * Returns null for global scope (admin), or an array of user IDs for scoped roles.
 */
async function getScopedUserIds(
  supabase: any,
  userId: string,
  userRole: string
): Promise<string[] | null> {
  if (!userRole) return []; // Unknown role gets no data
  if (userRole === 'admin') return null; // Admin gets global scope

  if (userRole === 'supervisor_de_red') {
    const { data: supervisorRole } = await supabase
      .from('user_roles')
      .select('red_id')
      .eq('user_id', userId)
      .eq('role_type', 'supervisor_de_red')
      .eq('is_active', true)
      .maybeSingle();

    if (!supervisorRole?.red_id) return [];

    const { data: networkSchools } = await supabase
      .from('red_escuelas')
      .select('school_id')
      .eq('red_id', supervisorRole.red_id);

    if (!networkSchools || networkSchools.length === 0) return [];

    const schoolIds = networkSchools.map(ns => ns.school_id);
    const { data: networkUsers } = await supabase
      .from('profiles')
      .select('id')
      .in('school_id', schoolIds);

    return networkUsers?.map(u => u.id) || [];
  }

  if (userRole === 'equipo_directivo') {
    const { data: profile } = await supabase
      .from('profiles')
      .select('school_id')
      .eq('id', userId)
      .single();

    if (!profile?.school_id) return [];

    const { data: schoolUsers } = await supabase
      .from('profiles')
      .select('id')
      .eq('school_id', profile.school_id);

    return schoolUsers?.map(u => u.id) || [];
  }

  if (userRole === 'lider_generacion') {
    const { data: profile } = await supabase
      .from('profiles')
      .select('generation_id')
      .eq('id', userId)
      .single();

    if (!profile?.generation_id) return [];

    const { data: genUsers } = await supabase
      .from('profiles')
      .select('id')
      .eq('generation_id', profile.generation_id);

    return genUsers?.map(u => u.id) || [];
  }

  if (userRole === 'lider_comunidad') {
    const { data: requesterRoles } = await supabase
      .from('user_roles')
      .select('community_id')
      .eq('user_id', userId)
      .eq('is_active', true)
      .not('community_id', 'is', null)
      .limit(1)
      .maybeSingle();

    if (!requesterRoles?.community_id) return [];

    const { data: communityUserRoles } = await supabase
      .from('user_roles')
      .select('user_id')
      .eq('community_id', requesterRoles.community_id)
      .eq('is_active', true);

    return [...new Set(communityUserRoles?.map((r: any) => r.user_id) || [])] as string[];
  }

  if (userRole === 'consultor') {
    const { data: assignments } = await supabase
      .from('consultant_assignments')
      .select('student_id')
      .eq('consultant_id', userId)
      .eq('is_active', true);

    return assignments?.map(a => a.student_id) || [];
  }

  // For docente and other roles - just return their own ID
  return [userId];
}
