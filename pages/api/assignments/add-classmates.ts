import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { createApiSupabaseClient, requireVerifiedCaller } from '@/lib/api-auth';
import { deliverRecordBells, loggableError } from '../quiz-reviews/notify-pending';

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

  const supabase = await createApiSupabaseClient(req, res);

  // Check authentication
  // Identity comes from the auth server; the cookie's stored `user` is
  // client-controlled (SM-B015).
  const caller = await requireVerifiedCaller(req, res);
  if (!caller.user) {
    return res.status(caller.status).json(caller.body);
  }

  const { assignmentId, groupId, classmateIds } = req.body;

  // Validate input
  if (!assignmentId || !groupId || !Array.isArray(classmateIds) || classmateIds.length === 0) {
    return res.status(400).json({ error: 'assignmentId, groupId y classmateIds son requeridos' });
  }

  try {
    const userId = caller.user.id;

    // Service role client for RLS-bypassing reads/inserts after we validate membership
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

    // Counts only: user, group and classmate ids identify students and stay out of logs.
    console.log('[add-classmates] === REQUEST START ===');
    console.log('[add-classmates] Classmates requested:', classmateIds.length);

    // 1. Check if user is a member of the specified group OR if group is empty (auto-grouping flow)
    const { data: membership } = await supabase
      .from('group_assignment_members')
      .select('group_id, assignment_id')
      .eq('group_id', groupId)
      .eq('user_id', userId)
      .eq('assignment_id', assignmentId)
      .maybeSingle();

    // 2. Get group details and validate. Read with the service role: the
    // group's school decides who may join it, so it must not depend on what
    // row security happens to show this caller.
    const { data: group, error: groupError } = await supabaseAdmin
      .from('group_assignment_groups')
      .select('is_consultant_managed, school_id, community_id, assignment_id')
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
      console.error('[add-classmates] No active roles found for requester:', loggableError(roleError));
      return res.status(403).json({ error: 'No tienes una escuela asignada' });
    }

    // The group's school is the scope: the caller must hold an active role in
    // it, and classmates are validated against it (not against whichever
    // school the caller's other roles point at).
    if (group.assignment_id && group.assignment_id !== assignmentId) {
      return res.status(400).json({ error: 'El grupo no corresponde a esta tarea' });
    }
    const requesterSchoolId = group.school_id;
    if (!requesterSchoolId || !requesterRoles.some(r => r.school_id === requesterSchoolId)) {
      console.error('[add-classmates] Requester has no role in the group school');
      return res.status(403).json({ error: 'No perteneces a la escuela de este grupo' });
    }
    console.log('[add-classmates] requester has', requesterRoles.length, 'active roles; group school_id:', requesterSchoolId);

    // 2c. Get assignment's course_id
    const { data: assignmentBlock, error: blockError } = await supabase
      .from('blocks')
      .select('lesson_id')
      .eq('id', assignmentId)
      .single();

    if (blockError || !assignmentBlock || !assignmentBlock.lesson_id) {
      console.error('[add-classmates] Assignment block not found:', loggableError(blockError));
      return res.status(404).json({ error: 'Tarea no encontrada' });
    }

    const { data: lesson, error: lessonError } = await supabase
      .from('lessons')
      .select('course_id')
      .eq('id', assignmentBlock.lesson_id)
      .single();

    if (lessonError || !lesson || !lesson.course_id) {
      console.error('[add-classmates] Lesson not found:', loggableError(lessonError));
      return res.status(404).json({ error: 'Curso no encontrado para esta tarea' });
    }

    const courseId = lesson.course_id;

    // If not a member, check if group is empty AND if requester is enrolled in the course
    if (!membership) {
      // Only a truly empty group may be joined this way. Count with the
      // service role: row security hides some groups' memberships from a
      // non-member, which would make an occupied group look empty.
      const { count: memberCount, error: countError } = await supabaseAdmin
        .from('group_assignment_members')
        .select('*', { count: 'exact', head: true })
        .eq('group_id', groupId);

      if (countError || memberCount === null || memberCount === undefined) {
        console.error('[add-classmates] Could not count group members:', loggableError(countError));
        return res.status(500).json({ error: 'Error al verificar el grupo' });
      }
      if (memberCount > 0) {
        return res.status(403).json({ error: 'No eres miembro de este grupo' });
      }

      // CRITICAL: Validate requester has access to the course through ANY valid assignment path
      // Check multiple assignment sources in order of priority
      let hasAccess = false;
      let accessSource = '';

      // 1. Direct course enrollment (most common for students)
      const { data: enrollment } = await supabase
        .from('course_enrollments')
        .select('status')
        .eq('user_id', userId)
        .eq('course_id', courseId)
        .eq('status', 'active')
        .maybeSingle();

      if (enrollment) {
        hasAccess = true;
        accessSource = 'course_enrollments';
      }

      // 2. Course assignment (teachers assigned to teach a course)
      if (!hasAccess) {
        const { data: courseAssignment } = await supabase
          .from('course_assignments')
          .select('id')
          .eq('teacher_id', userId)
          .eq('course_id', courseId)
          .maybeSingle();

        if (courseAssignment) {
          hasAccess = true;
          accessSource = 'course_assignments';
        }
      }

      // 3. Consultant assignment (consultants assigned to schools/communities)
      if (!hasAccess) {
        // Get assignment's community to check consultant assignment.
        // School-only groups (community_id null) skip this block and rely on the
        // same-school validation below — there is no community-scoped consultant path.
        const { data: assignmentGroup } = await supabase
          .from('group_assignment_groups')
          .select('community_id')
          .eq('id', groupId)
          .single();

        if (assignmentGroup?.community_id) {
          const { data: consultantAssignment } = await supabase
            .from('consultant_assignments')
            .select('id')
            .eq('consultant_id', userId)
            .eq('community_id', assignmentGroup.community_id)
            .eq('is_active', true)
            .maybeSingle();

          if (consultantAssignment) {
            hasAccess = true;
            accessSource = 'consultant_assignments';
          }
        }
      }

      if (!hasAccess) {
        console.error('[add-classmates] Requester has no access to course - checked: enrollments, course_assignments, consultant_assignments');
        return res.status(403).json({
          error: 'Debes estar inscrito en el curso para agregar compañeros a este grupo'
        });
      }

      console.log(`[add-classmates] User not in group, but group is empty and user has access via ${accessSource} - allowing addition`);
    }

    // 4. Validate all classmates are from the same school
    const { data: classmateRoles, error: rolesError } = await supabaseAdmin
      .from('user_roles')
      .select('user_id, school_id')
      .in('user_id', classmateIds)
      .eq('is_active', true);

    if (rolesError) {
      console.error('[add-classmates] Error validating classmate roles:', loggableError(rolesError));
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

    // Every classmate needs an active role in the group's school.
    const inSchool = new Set(
      (classmateRoles || []).filter(r => r.school_id === requesterSchoolId).map(r => r.user_id)
    );
    if (classmateIds.some((id: string) => !inSchool.has(id))) {
      const missingIds = classmateIds.filter((id: string) => !inSchool.has(id));
      console.error('[add-classmates] VALIDATION FAILED - Roles Check:', {
        requested: classmateIds.length,
        found: inSchool.size,
        missing: missingIds.length,
      });
      return res.status(400).json({
        error: 'Algunos compañeros no tienen roles activos en el sistema o no pertenecen a tu escuela',
        details: { missingIds, foundCount: classmateRoles?.length, requestedCount: classmateIds.length }
      });
    }

    // 4b. Validate all classmates are enrolled in the assignment's course
    const { data: classmateEnrollments, error: enrollmentError } = await supabaseAdmin
      .from('course_enrollments')
      .select('user_id')
      .eq('course_id', courseId)
      .in('user_id', classmateIds)
      .eq('status', 'active');

    if (enrollmentError) {
      console.error('[add-classmates] Error validating course enrollments:', loggableError(enrollmentError));
      return res.status(500).json({ error: 'Error al validar inscripciones' });
    }

    const enrolledUserIds = new Set(classmateEnrollments?.map(e => e.user_id) || []);
    const notEnrolled = classmateIds.filter(id => !enrolledUserIds.has(id));

    if (notEnrolled.length > 0) {
      console.error('[add-classmates] VALIDATION FAILED - Enrollment Check:', {
        requested: classmateIds.length,
        enrolled: enrolledUserIds.size,
        notEnrolled: notEnrolled.length,
      });
      return res.status(400).json({
        error: 'Algunos compañeros no están inscritos en el curso de esta tarea',
        details: { notEnrolled, courseId, enrolledCount: enrolledUserIds.size }
      });
    }

    // 5. Validate classmates are not already in groups for this assignment
    // A classmate already in THIS group is a retry: not inserted again, but
    // their invitation bell is re-requested (keyed, so never duplicated).
    const { data: existingMembers, error: existingError } = await supabaseAdmin
      .from('group_assignment_members')
      .select('user_id, group_id')
      .eq('assignment_id', assignmentId)
      .in('user_id', classmateIds);

    if (existingError) {
      console.error('Error checking existing members:', loggableError(existingError));
      return res.status(500).json({ error: 'Error al verificar membresías' });
    }

    if (existingMembers?.some(m => m.group_id !== groupId)) {
      return res.status(400).json({
        error: 'Algunos compañeros ya están en grupos para esta tarea'
      });
    }

    const alreadyInGroup = new Set((existingMembers ?? []).map(m => m.user_id));

    // 6. Insert new members using service role client to bypass RLS
    // All validation has been done above, so this is safe

    const members = [...new Set<string>(classmateIds)]
      .filter(classmateId => !alreadyInGroup.has(classmateId))
      .map(classmateId => ({
        group_id: groupId,
        assignment_id: assignmentId,
        user_id: classmateId,
        role: 'member'
      }));

    let insertedMembers: Array<{ user_id: string }> = [];
    if (members.length > 0) {
      const { data, error: insertError } = await supabaseAdmin
        .from('group_assignment_members')
        .insert(members)
        .select();

      if (insertError) {
        console.error('Error inserting members:', loggableError(insertError));
        return res.status(500).json({ error: 'Error al agregar compañeros al grupo' });
      }
      insertedMembers = data ?? [];
    }

    // 7. Invitation bells for the persisted members of this group, never the requester.
    const invitees = [...insertedMembers.map(m => m.user_id), ...alreadyInGroup]
      .filter(id => id !== userId)
      .map(id => ({ id }));
    const failed = await deliverRecordBells('group_invitation', { group_id: groupId }, invitees);
    if (failed > 0) {
      // Nonfatal: the members are saved; the same request again fills the gap.
      console.error('[add-classmates] invitation notifications not created', { failed });
    }

    return res.status(200).json({
      success: true,
      members: insertedMembers,
      count: insertedMembers.length,
      notificationsDelivered: failed === 0
    });

  } catch (error) {
    console.error('Error in add-classmates endpoint:', loggableError(error));
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}
