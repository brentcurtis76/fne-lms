/**
 * API Route: Get Shareable Members
 * Returns members eligible for collaborative submission and excludes users
 * who have already submitted the assignment.
 *
 * Two access modes:
 *   1. groupId provided — validates group membership and dispatches by group
 *      scope: community-scoped when group.community_id is set, school-scoped
 *      (same-course classmates) when community_id is null.
 *   2. communityId provided (legacy) — validates the requester belongs to the
 *      community and returns community members.
 */

import { NextApiRequest, NextApiResponse } from 'next';
import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';
import { userAssignmentsService } from '@/lib/services/userAssignments';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  try {
    const supabase = createPagesServerClient({ req, res });

    const {
      data: { session }
    } = await supabase.auth.getSession();

    if (!session) {
      return res.status(401).json({ error: 'No autorizado' });
    }

    const { assignmentId, communityId, groupId } = req.query;

    if (!assignmentId) {
      return res.status(400).json({ error: 'Se requiere assignmentId' });
    }

    if (!groupId && !communityId) {
      return res.status(400).json({
        error: 'Se requiere groupId o communityId'
      });
    }

    const userId = session.user.id;

    // Group-scoped path: dispatch on group.community_id, falling back to
    // school scope when null. Mirrors validation in eligible-classmates.
    if (groupId) {
      const { data: membership, error: membershipError } = await supabase
        .from('group_assignment_members')
        .select('group_id, assignment_id')
        .eq('group_id', groupId as string)
        .eq('user_id', userId)
        .eq('assignment_id', assignmentId as string)
        .single();

      if (membershipError || !membership) {
        return res.status(403).json({ error: 'No eres miembro de este grupo' });
      }

      const supabaseAdmin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        {
          auth: { autoRefreshToken: false, persistSession: false }
        }
      );

      const { data: group, error: groupError } = await supabaseAdmin
        .from('group_assignment_groups')
        .select('community_id, school_id, is_consultant_managed')
        .eq('id', groupId as string)
        .single();

      if (groupError || !group) {
        return res.status(404).json({ error: 'Grupo no encontrado' });
      }

      if (group.is_consultant_managed) {
        return res.status(403).json({
          error: 'No puedes invitar compañeros a un grupo administrado por el consultor'
        });
      }

      if (group.community_id) {
        const members = await userAssignmentsService.getShareableMembers(
          supabase,
          assignmentId as string,
          group.community_id as string,
          userId
        );
        return res.status(200).json({ success: true, members });
      }

      if (!group.school_id) {
        return res
          .status(400)
          .json({ error: 'El grupo no tiene escuela asignada' });
      }

      // Resolve assignment's course_id via blocks → lessons (→ modules).
      const { data: assignmentBlock, error: blockError } = await supabaseAdmin
        .from('blocks')
        .select('lesson_id')
        .eq('id', assignmentId as string)
        .single();

      if (blockError || !assignmentBlock?.lesson_id) {
        return res.status(404).json({ error: 'Tarea no encontrada' });
      }

      const { data: lesson, error: lessonError } = await supabaseAdmin
        .from('lessons')
        .select('course_id, module_id')
        .eq('id', assignmentBlock.lesson_id)
        .single();

      if (lessonError || !lesson) {
        return res.status(404).json({ error: 'Curso no encontrado para esta tarea' });
      }

      let courseId = lesson.course_id;
      if (!courseId && lesson.module_id) {
        const { data: moduleData } = await supabaseAdmin
          .from('modules')
          .select('course_id')
          .eq('id', lesson.module_id)
          .single();
        courseId = moduleData?.course_id || null;
      }

      if (!courseId) {
        return res.status(404).json({ error: 'Curso no encontrado para esta tarea' });
      }

      const members = await userAssignmentsService.getShareableMembersBySchool(
        supabaseAdmin,
        assignmentId as string,
        group.school_id,
        courseId,
        userId
      );

      return res.status(200).json({ success: true, members });
    }

    // Legacy community-only path: requester must belong to the community.
    const { data: userRole, error: roleError } = await supabase
      .from('user_roles')
      .select('id')
      .eq('user_id', userId)
      .eq('community_id', communityId as string)
      .eq('is_active', true)
      .single();

    if (roleError || !userRole) {
      return res.status(403).json({ error: 'No perteneces a esta comunidad' });
    }

    const members = await userAssignmentsService.getShareableMembers(
      supabase,
      assignmentId as string,
      communityId as string,
      userId
    );

    return res.status(200).json({ success: true, members });
  } catch (error) {
    console.error('Error fetching shareable members:', error);
    return res.status(500).json({
      error: 'Error al obtener los miembros',
      details: error instanceof Error ? error.message : 'Error desconocido'
    });
  }
}
