import { NextApiRequest, NextApiResponse } from 'next';
import { getApiUser, createApiSupabaseClient, sendAuthError, handleMethodNotAllowed } from '../../../../lib/api-auth';

// Source types for the 4-state model
type AssignmentSource = 'asignacion_directa' | 'ruta' | 'directa_y_ruta' | 'inscripcion_otro';

interface UserAssignment {
  id: string;
  type: 'course' | 'learning_path';
  contentId: string;
  contentTitle: string;
  contentDescription?: string;
  contentThumbnail?: string;
  assignedBy: string | null;
  assignedByName: string | null;
  assignedAt: string | null;
  source: AssignmentSource;
  sourceLPIds: string[];
  sourceLPNames: string[];
  // For courses
  progress?: number;
  lessonsCompleted?: number;
  totalLessons?: number;
  // For LPs
  courseCount?: number;
  coursesCompleted?: number;
}

interface UserAssignmentsResponse {
  user: {
    id: string;
    name: string;
    email: string;
    roles: string[];
  };
  assignments: UserAssignment[];
  stats: {
    totalCourses: number;
    totalLPs: number;
    overlappingCourses: number;
  };
}

// Check if user has admin/consultor permission
async function hasViewPermission(supabaseClient: any, userId: string): Promise<boolean> {
  const { data: roles } = await supabaseClient
    .from('user_roles')
    .select('role_type')
    .eq('user_id', userId)
    .eq('is_active', true);

  if (!roles || roles.length === 0) return false;

  const userRoles = roles.map((r: any) => r.role_type);
  return userRoles.includes('admin') || userRoles.includes('consultor');
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Only allow GET method
  if (req.method !== 'GET') {
    return handleMethodNotAllowed(res, ['GET']);
  }

  // Authenticate user
  const { user, error } = await getApiUser(req, res);

  if (error || !user) {
    return sendAuthError(res, 'Authentication required');
  }

  // Create authenticated Supabase client
  const supabaseClient = await createApiSupabaseClient(req, res);

  try {
    // Check permission
    const hasPermission = await hasViewPermission(supabaseClient, user.id);
    if (!hasPermission) {
      return res.status(403).json({
        error: 'No tienes permiso para ver asignaciones'
      });
    }

    // Get userId from query
    const { userId } = req.query;
    if (!userId || typeof userId !== 'string') {
      return res.status(400).json({
        error: 'userId es requerido'
      });
    }

    // Fetch target user info
    const { data: targetUser, error: userError } = await supabaseClient
      .from('profiles')
      .select('id, first_name, last_name, email')
      .eq('id', userId)
      .single();

    if (userError || !targetUser) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    // Build full name from first_name and last_name
    const targetUserFullName = [targetUser.first_name, targetUser.last_name]
      .filter(Boolean)
      .join(' ') || targetUser.email;

    // Get user's roles
    const { data: userRoles } = await supabaseClient
      .from('user_roles')
      .select('role_type')
      .eq('user_id', userId)
      .eq('is_active', true);

    const roles = userRoles?.map((r: any) => r.role_type) || [];

    // 1. Get all course enrollments for user
    const { data: enrollments, error: enrollmentsError } = await supabaseClient
      .from('course_enrollments')
      .select(`
        id,
        course_id,
        enrolled_by,
        enrolled_at,
        status,
        lessons_completed,
        total_lessons,
        courses (
          id,
          title,
          description,
          thumbnail_url
        )
      `)
      .eq('user_id', userId);

    if (enrollmentsError) {
      console.error('Error fetching enrollments:', enrollmentsError);
      throw new Error('Error al obtener inscripciones');
    }

    // 2. Get all direct course assignments for user
    const { data: directAssignments, error: directError } = await supabaseClient
      .from('course_assignments')
      .select(`
        id,
        course_id,
        assigned_by,
        assigned_at
      `)
      .eq('teacher_id', userId);

    if (directError) {
      console.error('Error fetching direct assignments:', directError);
      throw new Error('Error al obtener asignaciones directas');
    }

    // Fetch assigner profiles separately (assigned_by references auth.users, not profiles directly)
    const directAssignerIds = [...new Set(
      (directAssignments || [])
        .map((da: any) => da.assigned_by)
        .filter(Boolean)
    )];

    let directAssignerMap: Record<string, string> = {};
    if (directAssignerIds.length > 0) {
      const { data: assignerProfiles } = await supabaseClient
        .from('profiles')
        .select('id, first_name, last_name')
        .in('id', directAssignerIds);

      (assignerProfiles || []).forEach((p: any) => {
        const fullName = [p.first_name, p.last_name].filter(Boolean).join(' ');
        directAssignerMap[p.id] = fullName || 'Usuario desconocido';
      });
    }

    // 3. Get all LP assignments for user
    const { data: lpAssignments, error: lpError } = await supabaseClient
      .from('learning_path_assignments')
      .select(`
        id,
        path_id,
        assigned_by,
        assigned_at,
        learning_paths (
          id,
          name,
          description
        )
      `)
      .eq('user_id', userId);

    if (lpError) {
      console.error('Error fetching LP assignments:', lpError);
      throw new Error('Error al obtener asignaciones de rutas');
    }

    // Fetch LP assigner profiles separately (assigned_by references auth.users)
    const lpAssignerIds = [...new Set(
      (lpAssignments || [])
        .map((lpa: any) => lpa.assigned_by)
        .filter(Boolean)
    )];

    let lpAssignerMap: Record<string, string> = {};
    if (lpAssignerIds.length > 0) {
      const { data: lpAssignerProfiles } = await supabaseClient
        .from('profiles')
        .select('id, first_name, last_name')
        .in('id', lpAssignerIds);

      (lpAssignerProfiles || []).forEach((p: any) => {
        const fullName = [p.first_name, p.last_name].filter(Boolean).join(' ');
        lpAssignerMap[p.id] = fullName || 'Usuario desconocido';
      });
    }

    // 4. Get courses in each assigned LP
    const assignedLPIds = lpAssignments?.map((lp: any) => lp.path_id) || [];
    let lpCourseMap: Record<string, { lpId: string; lpTitle: string }[]> = {};

    // Build LP name map from already-fetched lpAssignments
    const lpNameMap: Record<string, string> = {};
    (lpAssignments || []).forEach((lpa: any) => {
      if (lpa.learning_paths) {
        lpNameMap[lpa.path_id] = lpa.learning_paths.name || 'Ruta sin título';
      }
    });

    if (assignedLPIds.length > 0) {
      const { data: lpCourses, error: lpCoursesError } = await supabaseClient
        .from('learning_path_courses')
        .select(`
          learning_path_id,
          course_id
        `)
        .in('learning_path_id', assignedLPIds);

      if (lpCoursesError) {
        console.error('Error fetching LP courses:', lpCoursesError);
      } else if (lpCourses) {
        // Build map: courseId -> [{ lpId, lpTitle }]
        lpCourses.forEach((lpc: any) => {
          const courseId = lpc.course_id;
          if (!lpCourseMap[courseId]) {
            lpCourseMap[courseId] = [];
          }
          lpCourseMap[courseId].push({
            lpId: lpc.learning_path_id,
            lpTitle: lpNameMap[lpc.learning_path_id] || 'Ruta sin título'
          });
        });
      }
    }

    // Build direct assignment lookup: courseId -> assignment info
    const directAssignmentMap: Record<string, {
      assignedBy: string | null;
      assignedByName: string | null;
      assignedAt: string | null;
    }> = {};

    directAssignments?.forEach((da: any) => {
      directAssignmentMap[da.course_id] = {
        assignedBy: da.assigned_by,
        assignedByName: da.assigned_by ? directAssignerMap[da.assigned_by] || null : null,
        assignedAt: da.assigned_at
      };
    });

    // Build assignments list
    const assignments: UserAssignment[] = [];
    let overlappingCourses = 0;

    // Process course enrollments
    enrollments?.forEach((enrollment: any) => {
      const courseId = enrollment.course_id;
      const course = enrollment.courses;
      if (!course) return;

      const hasDirect = !!directAssignmentMap[courseId];
      const lpSources = lpCourseMap[courseId] || [];
      const hasLP = lpSources.length > 0;

      // Determine source type
      let source: AssignmentSource;
      if (hasDirect && hasLP) {
        source = 'directa_y_ruta';
        overlappingCourses++;
      } else if (hasDirect) {
        source = 'asignacion_directa';
      } else if (hasLP) {
        source = 'ruta';
      } else {
        source = 'inscripcion_otro';
      }

      // Get assignment metadata
      let assignedBy: string | null = null;
      let assignedByName: string | null = null;
      let assignedAt: string | null = null;

      if (hasDirect) {
        const direct = directAssignmentMap[courseId];
        assignedBy = direct.assignedBy;
        assignedByName = direct.assignedByName;
        assignedAt = direct.assignedAt;
      } else if (hasLP && lpAssignments && lpAssignments.length > 0) {
        // Use the first LP assignment info
        const firstLP = lpAssignments.find((lp: any) =>
          lpSources.some(s => s.lpId === lp.path_id)
        );
        if (firstLP) {
          assignedBy = firstLP.assigned_by;
          assignedByName = firstLP.assigned_by ? lpAssignerMap[firstLP.assigned_by] || null : null;
          assignedAt = firstLP.assigned_at;
        }
      }

      // Calculate progress
      const totalLessons = enrollment.total_lessons || 0;
      const lessonsCompleted = enrollment.lessons_completed || 0;
      const progress = totalLessons > 0
        ? Math.round((lessonsCompleted / totalLessons) * 100)
        : 0;

      assignments.push({
        id: enrollment.id,
        type: 'course',
        contentId: courseId,
        contentTitle: course.title,
        contentDescription: course.description,
        contentThumbnail: course.thumbnail_url,
        assignedBy,
        assignedByName,
        assignedAt,
        source,
        sourceLPIds: lpSources.map(s => s.lpId),
        sourceLPNames: lpSources.map(s => s.lpTitle),
        progress,
        lessonsCompleted,
        totalLessons
      });
    });

    // Process LP assignments as separate items
    lpAssignments?.forEach((lpa: any) => {
      const lp = lpa.learning_paths;
      if (!lp) return;

      // Count courses in this LP that user has completed
      const lpCourseIds = Object.entries(lpCourseMap)
        .filter(([_, sources]) => sources.some(s => s.lpId === lpa.path_id))
        .map(([courseId]) => courseId);

      const enrolledInLP = enrollments?.filter((e: any) =>
        lpCourseIds.includes(e.course_id)
      ) || [];

      const courseCount = lpCourseIds.length;
      const coursesCompleted = enrolledInLP.filter((e: any) => {
        const total = e.total_lessons || 0;
        const completed = e.lessons_completed || 0;
        return total > 0 && completed >= total;
      }).length;

      // Get assigner name from map
      const lpaAssignerName = lpa.assigned_by ? lpAssignerMap[lpa.assigned_by] || null : null;

      assignments.push({
        id: lpa.id,
        type: 'learning_path',
        contentId: lpa.path_id,
        contentTitle: lp.name || 'Ruta sin título',
        contentDescription: lp.description,
        assignedBy: lpa.assigned_by,
        assignedByName: lpaAssignerName,
        assignedAt: lpa.assigned_at,
        source: 'ruta',
        sourceLPIds: [lpa.path_id],
        sourceLPNames: [lp.name || 'Ruta sin título'],
        courseCount,
        coursesCompleted
      });
    });

    // Build response
    const response: UserAssignmentsResponse = {
      user: {
        id: targetUser.id,
        name: targetUserFullName,
        email: targetUser.email,
        roles
      },
      assignments,
      stats: {
        totalCourses: assignments.filter(a => a.type === 'course').length,
        totalLPs: assignments.filter(a => a.type === 'learning_path').length,
        overlappingCourses
      }
    };

    return res.status(200).json(response);

  } catch (error: any) {
    console.error('User assignments error:', error);
    return res.status(500).json({
      error: error.message || 'Error al obtener asignaciones del usuario'
    });
  }
}
