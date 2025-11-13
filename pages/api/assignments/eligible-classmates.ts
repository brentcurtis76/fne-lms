import { NextApiRequest, NextApiResponse } from 'next';
import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';

/**
 * GET /api/assignments/eligible-classmates
 *
 * Securely fetch eligible classmates for an assignment with server-side validation.
 *
 * Query params:
 * - assignmentId: string (required)
 * - groupId: string (required) - validates user is member of this group
 *
 * Security:
 * - Validates user is authenticated
 * - Validates user is a member of the specified group
 * - Only returns classmates from the same school who are enrolled in the assignment's course
 * - Excludes students already in groups for this assignment
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const supabase = createPagesServerClient({ req, res });

  // Check authentication
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  const { assignmentId, groupId } = req.query;

  if (!assignmentId || !groupId) {
    return res.status(400).json({ error: 'assignmentId y groupId son requeridos' });
  }

  try {
    const userId = session.user.id;
    console.log('[eligible-classmates] REQUEST - userId:', userId, 'assignmentId:', assignmentId, 'groupId:', groupId);

    // 1. Validate user is a member of the specified group
    const { data: membership, error: membershipError } = await supabase
      .from('group_assignment_members')
      .select('group_id, assignment_id')
      .eq('group_id', groupId as string)
      .eq('user_id', userId)
      .eq('assignment_id', assignmentId as string)
      .single();

    console.log('[eligible-classmates] STEP 1 - Membership check:', {
      found: !!membership,
      error: membershipError?.message,
      code: membershipError?.code,
      data: membership
    });

    if (membershipError || !membership) {
      console.error('[eligible-classmates] ABORT - User not member:', userId, 'group:', groupId, 'error:', membershipError);
      return res.status(403).json({ error: 'No eres miembro de este grupo' });
    }

    // 2. Get group details and verify it's not consultant-managed
    // Use service role client to bypass RLS since we've already validated membership
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    const { data: group, error: groupError } = await supabaseAdmin
      .from('group_assignment_groups')
      .select('is_consultant_managed, max_members')
      .eq('id', groupId as string)
      .single();

    console.log('[eligible-classmates] STEP 2 - Group query:', {
      found: !!group,
      error: groupError?.message,
      code: groupError?.code,
      groupId: groupId,
      data: group
    });

    if (groupError || !group) {
      console.error('[eligible-classmates] ABORT - Group not found:', groupId, 'error:', groupError);
      return res.status(404).json({ error: 'Grupo no encontrado' });
    }

    if (group.is_consultant_managed) {
      return res.status(403).json({
        error: 'No puedes invitar compañeros a un grupo administrado por el consultor'
      });
    }

    // 3. Get requester's school_id from active user_roles (handle multiple roles)
    const { data: requesterRoles, error: roleError } = await supabase
      .from('user_roles')
      .select('school_id, role_type')
      .eq('user_id', userId)
      .eq('is_active', true);

    if (roleError || !requesterRoles || requesterRoles.length === 0) {
      console.error('[eligible-classmates] No active roles found for user:', userId, roleError);
      return res.status(403).json({ error: 'No tienes una escuela asignada' });
    }

    // Select school_id deterministically: prefer docente > estudiante > first with school_id
    let selectedRole = requesterRoles.find(r => r.role_type === 'docente' && r.school_id);
    if (!selectedRole) {
      selectedRole = requesterRoles.find(r => r.role_type === 'estudiante' && r.school_id);
    }
    if (!selectedRole) {
      selectedRole = requesterRoles.find(r => r.school_id);
    }

    if (!selectedRole || !selectedRole.school_id) {
      console.error('[eligible-classmates] No role with school_id found for user:', userId);
      return res.status(403).json({ error: 'No tienes una escuela asignada' });
    }

    const requesterSchoolId = selectedRole.school_id;
    console.log('[eligible-classmates] requester has', requesterRoles.length, 'active roles, selected role:', selectedRole.role_type, 'school_id:', requesterSchoolId);

    // 4. Get assignment's course_id by traversing blocks → lessons
    const { data: assignmentBlock, error: blockError } = await supabase
      .from('blocks')
      .select('lesson_id')
      .eq('id', assignmentId as string)
      .single();

    if (blockError || !assignmentBlock || !assignmentBlock.lesson_id) {
      console.error('[eligible-classmates] Assignment block not found or has no lesson:', assignmentId, blockError);
      return res.status(404).json({ error: 'Tarea no encontrada' });
    }

    const { data: lesson, error: lessonError } = await supabase
      .from('lessons')
      .select('course_id')
      .eq('id', assignmentBlock.lesson_id)
      .single();

    if (lessonError || !lesson || !lesson.course_id) {
      console.error('[eligible-classmates] Lesson not found or has no course:', assignmentBlock.lesson_id, lessonError);
      return res.status(404).json({ error: 'Curso no encontrado para esta tarea' });
    }

    const courseId = lesson.course_id;
    console.log('[eligible-classmates] assignment course_id:', courseId);

    // 5. Get all students from the SAME school who are enrolled in this course
    const { data: enrolledClassmates, error: enrollmentError } = await supabase
      .from('course_enrollments')
      .select(`
        user_id,
        user:profiles(
          id,
          first_name,
          last_name,
          email,
          avatar_url
        )
      `)
      .eq('course_id', courseId)
      .eq('status', 'active')
      .neq('user_id', userId); // Exclude self

    if (enrollmentError) {
      console.error('[eligible-classmates] Error fetching course enrollments:', enrollmentError);
      return res.status(500).json({ error: 'Error al obtener compañeros' });
    }

    console.log('[eligible-classmates] total course enrollments (excluding self):', enrolledClassmates?.length || 0);

    if (!enrolledClassmates || enrolledClassmates.length === 0) {
      console.log('[eligible-classmates] No enrolled classmates found for course:', courseId);
      return res.status(200).json({ classmates: [] });
    }

    // 6. Filter to only include classmates from the same school
    const { data: classmateRoles, error: classmateRolesError } = await supabase
      .from('user_roles')
      .select('user_id, school_id')
      .in('user_id', enrolledClassmates.map(e => e.user_id))
      .eq('school_id', requesterSchoolId)
      .eq('is_active', true);

    if (classmateRolesError) {
      console.error('[eligible-classmates] Error fetching classmate roles:', classmateRolesError);
      return res.status(500).json({ error: 'Error al verificar compañeros' });
    }

    const sameSchoolUserIds = new Set(classmateRoles?.map(r => r.user_id) || []);
    const sameSchoolClassmates = enrolledClassmates.filter(c => sameSchoolUserIds.has(c.user_id));

    console.log('[eligible-classmates] same school classmates:', sameSchoolClassmates.length);

    if (sameSchoolClassmates.length === 0) {
      console.log('[eligible-classmates] No classmates from school_id:', requesterSchoolId);
      return res.status(200).json({ classmates: [] });
    }

    // 7. Get students already in ANY group for this assignment
    const { data: groupMembers, error: groupMembersError } = await supabase
      .from('group_assignment_members')
      .select('user_id')
      .eq('assignment_id', assignmentId as string);

    if (groupMembersError) {
      console.error('[eligible-classmates] Error fetching group members:', groupMembersError);
      return res.status(500).json({ error: 'Error al verificar grupos' });
    }

    const assignedUserIds = groupMembers?.map(m => m.user_id) || [];
    console.log('[eligible-classmates] already assigned user count:', assignedUserIds.length);

    // 8. Filter out already-assigned students
    const eligibleClassmates = sameSchoolClassmates
      .filter(member => !assignedUserIds.includes(member.user_id))
      .map(member => ({
        id: member.user?.id || member.user_id,
        first_name: member.user?.first_name,
        last_name: member.user?.last_name,
        full_name: member.user
          ? `${member.user.first_name || ''} ${member.user.last_name || ''}`.trim() || 'Usuario desconocido'
          : 'Usuario desconocido',
        email: member.user?.email,
        avatar_url: member.user?.avatar_url
      }));

    console.log('[eligible-classmates] user', userId, 'assignment', assignmentId, 'group', groupId, 'school_id', requesterSchoolId, 'course_id', courseId, 'eligible', eligibleClassmates.length, '(filtered from', sameSchoolClassmates.length, 'same-school enrolled classmates)');
    return res.status(200).json({ classmates: eligibleClassmates });

  } catch (error) {
    console.error('Error in eligible-classmates endpoint:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}
