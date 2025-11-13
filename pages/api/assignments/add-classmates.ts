import { NextApiRequest, NextApiResponse } from 'next';
import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';

/**
 * POST /api/assignments/add-classmates
 *
 * Securely add classmates to a group assignment with comprehensive server-side validation.
 *
 * Body:
 * - assignmentId: string (required)
 * - groupId: string (required)
 * - classmateIds: string[] (required) - array of user IDs to add
 *
 * Security:
 * - Validates user is authenticated
 * - Validates user is a member of the group
 * - Validates group is not consultant-managed
 * - Validates all classmates are from the same school and enrolled in the assignment's course
 * - Validates max group size limit
 * - Validates classmates are not already in groups
 * - Uses service role key for inserts to bypass RLS
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const supabase = createPagesServerClient({ req, res });

  // Check authentication
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  const { assignmentId, groupId, classmateIds } = req.body;

  // Validate input
  if (!assignmentId || !groupId || !Array.isArray(classmateIds) || classmateIds.length === 0) {
    return res.status(400).json({ error: 'assignmentId, groupId y classmateIds son requeridos' });
  }

  try {
    const userId = session.user.id;

    // 1. Validate user is a member of the specified group
    const { data: membership, error: membershipError } = await supabase
      .from('group_assignment_members')
      .select('group_id, assignment_id')
      .eq('group_id', groupId)
      .eq('user_id', userId)
      .eq('assignment_id', assignmentId)
      .single();

    if (membershipError || !membership) {
      return res.status(403).json({ error: 'No eres miembro de este grupo' });
    }

    // 2. Get group details and validate
    const { data: group, error: groupError } = await supabase
      .from('group_assignment_groups')
      .select('is_consultant_managed')
      .eq('id', groupId)
      .single();

    if (groupError || !group) {
      return res.status(404).json({ error: 'Grupo no encontrado' });
    }

    // Validate not consultant-managed
    if (group.is_consultant_managed) {
      return res.status(403).json({
        error: 'No puedes agregar compañeros a un grupo administrado por el consultor'
      });
    }

    // 2b. Get requester's school_id (handle multiple roles)
    const { data: requesterRoles, error: roleError } = await supabase
      .from('user_roles')
      .select('school_id, role_type')
      .eq('user_id', userId)
      .eq('is_active', true);

    if (roleError || !requesterRoles || requesterRoles.length === 0) {
      console.error('[add-classmates] No active roles found for user:', userId, roleError);
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
      console.error('[add-classmates] No role with school_id found for user:', userId);
      return res.status(403).json({ error: 'No tienes una escuela asignada' });
    }

    const requesterSchoolId = selectedRole.school_id;
    console.log('[add-classmates] requester has', requesterRoles.length, 'active roles, selected role:', selectedRole.role_type, 'school_id:', requesterSchoolId);

    // 2c. Get assignment's course_id
    const { data: assignmentBlock, error: blockError } = await supabase
      .from('blocks')
      .select('lesson_id')
      .eq('id', assignmentId)
      .single();

    if (blockError || !assignmentBlock || !assignmentBlock.lesson_id) {
      console.error('[add-classmates] Assignment block not found:', assignmentId, blockError);
      return res.status(404).json({ error: 'Tarea no encontrada' });
    }

    const { data: lesson, error: lessonError } = await supabase
      .from('lessons')
      .select('course_id')
      .eq('id', assignmentBlock.lesson_id)
      .single();

    if (lessonError || !lesson || !lesson.course_id) {
      console.error('[add-classmates] Lesson not found:', assignmentBlock.lesson_id, lessonError);
      return res.status(404).json({ error: 'Curso no encontrado para esta tarea' });
    }

    const courseId = lesson.course_id;

    // 3. Check current member count
    const { count: currentMemberCount, error: countError } = await supabase
      .from('group_assignment_members')
      .select('*', { count: 'exact', head: true })
      .eq('group_id', groupId);

    if (countError) {
      console.error('Error counting members:', countError);
      return res.status(500).json({ error: 'Error al verificar tamaño del grupo' });
    }

    // TODO: max_members column not yet in schema - defaulting to 8
    // When max_members is added to schema, update line 62 to include it in SELECT
    const maxMembers = 8;
    if (currentMemberCount + classmateIds.length > maxMembers) {
      return res.status(400).json({
        error: `El grupo alcanzaría el límite de ${maxMembers} miembros`
      });
    }

    // 4. Validate all classmates are from the same school
    const { data: classmateRoles, error: rolesError } = await supabase
      .from('user_roles')
      .select('user_id, school_id')
      .in('user_id', classmateIds)
      .eq('is_active', true);

    if (rolesError) {
      console.error('[add-classmates] Error validating classmate roles:', rolesError);
      return res.status(500).json({ error: 'Error al validar compañeros' });
    }

    // Ensure all classmates are from the same school
    const invalidClassmates = classmateRoles?.filter(
      role => role.school_id !== requesterSchoolId
    ) || [];

    if (invalidClassmates.length > 0) {
      return res.status(400).json({
        error: 'Algunos compañeros no pertenecen a tu escuela'
      });
    }

    if (classmateRoles?.length !== classmateIds.length) {
      return res.status(400).json({
        error: 'Algunos compañeros no son válidos'
      });
    }

    // 4b. Validate all classmates are enrolled in the assignment's course
    const { data: classmateEnrollments, error: enrollmentError } = await supabase
      .from('course_enrollments')
      .select('user_id')
      .eq('course_id', courseId)
      .in('user_id', classmateIds)
      .eq('status', 'active');

    if (enrollmentError) {
      console.error('[add-classmates] Error validating course enrollments:', enrollmentError);
      return res.status(500).json({ error: 'Error al validar inscripciones' });
    }

    const enrolledUserIds = new Set(classmateEnrollments?.map(e => e.user_id) || []);
    const notEnrolled = classmateIds.filter(id => !enrolledUserIds.has(id));

    if (notEnrolled.length > 0) {
      console.error('[add-classmates] Some classmates not enrolled in course:', notEnrolled);
      return res.status(400).json({
        error: 'Algunos compañeros no están inscritos en el curso de esta tarea'
      });
    }

    // 5. Validate classmates are not already in groups for this assignment
    const { data: existingMembers, error: existingError } = await supabase
      .from('group_assignment_members')
      .select('user_id')
      .eq('assignment_id', assignmentId)
      .in('user_id', classmateIds);

    if (existingError) {
      console.error('Error checking existing members:', existingError);
      return res.status(500).json({ error: 'Error al verificar membresías' });
    }

    if (existingMembers && existingMembers.length > 0) {
      return res.status(400).json({
        error: 'Algunos compañeros ya están en grupos para esta tarea'
      });
    }

    // 6. Insert new members using service role client to bypass RLS
    // All validation has been done above, so this is safe
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

    const members = classmateIds.map(classmateId => ({
      group_id: groupId,
      assignment_id: assignmentId,
      user_id: classmateId,
      role: 'member',
      added_by: userId
    }));

    const { data: insertedMembers, error: insertError } = await supabaseAdmin
      .from('group_assignment_members')
      .insert(members)
      .select();

    if (insertError) {
      console.error('Error inserting members:', insertError);
      return res.status(500).json({ error: 'Error al agregar compañeros al grupo' });
    }

    // 7. Send notifications to added classmates
    try {
      // Get assignment details
      const { data: assignmentBlock } = await supabase
        .from('blocks')
        .select('payload')
        .eq('id', assignmentId)
        .single();

      const assignmentTitle = assignmentBlock?.payload?.title || 'Sin título';

      // Get adder's profile
      const { data: adderProfile } = await supabase
        .from('profiles')
        .select('first_name, last_name')
        .eq('id', userId)
        .single();

      const adderName = adderProfile
        ? `${adderProfile.first_name || ''} ${adderProfile.last_name || ''}`.trim()
        : 'Un compañero';

      // Create notifications
      const notifications = classmateIds.map(classmateId => ({
        user_id: classmateId,
        type: 'group_invitation',
        title: 'Te agregaron a un grupo',
        message: `${adderName} te agregó a su grupo para la tarea "${assignmentTitle}"`,
        data: {
          assignment_id: assignmentId,
          group_id: groupId,
          added_by: userId
        },
        created_at: new Date().toISOString()
      }));

      await supabase
        .from('notifications')
        .insert(notifications);
    } catch (notifError) {
      // Notifications are non-critical, log but don't fail
      console.error('Error sending notifications:', notifError);
    }

    return res.status(200).json({
      success: true,
      members: insertedMembers,
      count: insertedMembers?.length || 0
    });

  } catch (error) {
    console.error('Error in add-classmates endpoint:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}
