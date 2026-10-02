import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { createApiSupabaseClient, requireVerifiedCaller } from '@/lib/api-auth';
import { TEACHING_ELIGIBLE_ROLES } from '@/utils/roleUtils';
import type { UserRoleType } from '@/types/roles';
import { loggableError } from '@/lib/api-auth';

/**
 * GET /api/assignments/eligible-classmates
 *
 * Securely fetch eligible classmates for an assignment with server-side validation.
 *
 * Query params:
 * - assignmentId: string (required)
 * - groupId: string (optional) - if provided, validates user is member of this group
 *
 * Security:
 * - Validates user is authenticated
 * - If groupId provided: validates user is a member of the specified group
 * - Only returns classmates from the same school who are enrolled in the assignment's course
 * - Excludes students already in groups for this assignment
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
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

  const { assignmentId, groupId } = req.query;

  if (!assignmentId) {
    return res.status(400).json({ error: 'assignmentId es requerido' });
  }

  try {
    const userId = caller.user.id;
    // Logs keep labels, counts, booleans and error codes: no id, e-mail or classmate row.
    console.log('[eligible-classmates] REQUEST:', { group: !!groupId });

    // 1. Validate user is a member of the specified group (only if groupId is provided)
    if (groupId) {
      const { data: membership, error: membershipError } = await supabase
        .from('group_assignment_members')
        .select('group_id, assignment_id')
        .eq('group_id', groupId as string)
        .eq('user_id', userId)
        .eq('assignment_id', assignmentId as string)
        .single();

      console.log('[eligible-classmates] STEP 1 - Membership check:', { found: !!membership, ...loggableError(membershipError) });

      if (membershipError || !membership) {
        console.error('[eligible-classmates] ABORT - User not member:', loggableError(membershipError));
        return res.status(403).json({ error: 'No eres miembro de este grupo' });
      }
    } else {
      console.log('[eligible-classmates] STEP 1 - No groupId provided, skipping membership check (initial group creation)');
    }

    // Initialize admin client for RLS bypass
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

    // 2. Get group details and verify it's not consultant-managed (only if groupId is provided)
    if (groupId) {
      const { data: group, error: groupError } = await supabaseAdmin
        .from('group_assignment_groups')
        .select('is_consultant_managed')
        .eq('id', groupId as string)
        .single();

      if (groupError || !group) {
        console.error('[eligible-classmates] ABORT - Group not found:', loggableError(groupError));
        return res.status(404).json({ error: 'Grupo no encontrado' });
      }

      if (group.is_consultant_managed) {
        return res.status(403).json({
          error: 'No puedes invitar compañeros a un grupo administrado por el consultor'
        });
      }
    }

    // 3. Get requester's school_id from active user_roles (handle multiple roles)
    // Use supabaseAdmin to bypass RLS
    const { data: requesterRoles, error: roleError } = await supabaseAdmin
      .from('user_roles')
      .select('school_id, role_type, community_id')
      .eq('user_id', userId)
      .eq('is_active', true);

    if (roleError || !requesterRoles || requesterRoles.length === 0) {
      console.error('[eligible-classmates] No active roles found for requester:', loggableError(roleError));
      return res.status(403).json({ error: 'No tienes una escuela asignada' });
    }

    // Select school_id deterministically: prefer any teaching-eligible role
    // (docente or an inheriting leadership role) > estudiante > first with school_id
    let selectedRole = requesterRoles.find(
      r => TEACHING_ELIGIBLE_ROLES.includes(r.role_type as UserRoleType) && r.school_id
    );
    if (!selectedRole) {
      selectedRole = requesterRoles.find(r => r.role_type === 'estudiante' && r.school_id);
    }
    if (!selectedRole) {
      selectedRole = requesterRoles.find(r => r.school_id);
    }

    if (!selectedRole || !selectedRole.school_id) {
      console.error('[eligible-classmates] No role with school_id found for requester');
      return res.status(403).json({ error: 'No tienes una escuela asignada' });
    }

    const requesterSchoolId = selectedRole.school_id;
    console.log('[eligible-classmates] requester has', requesterRoles.length, 'active roles, selected role:', selectedRole.role_type);

    // Resolve requester's effective community: active role with community_id,
    // otherwise profiles.community_id, otherwise null.
    let requesterCommunityId: string | number | null =
      requesterRoles.find(r => r.community_id)?.community_id ?? null;

    if (!requesterCommunityId) {
      const { data: requesterProfile } = await supabaseAdmin
        .from('profiles')
        .select('community_id')
        .eq('id', userId)
        .maybeSingle();
      requesterCommunityId = requesterProfile?.community_id ?? null;
    }
    console.log('[eligible-classmates] requester effective community resolved:', { community: !!requesterCommunityId });

    // 4. Get assignment's course_id by traversing blocks → lessons
    // Use supabaseAdmin to bypass RLS (blocks table may have restrictive policies)
    const { data: assignmentBlock, error: blockError } = await supabaseAdmin
      .from('blocks')
      .select('lesson_id')
      .eq('id', assignmentId as string)
      .single();

    if (blockError || !assignmentBlock || !assignmentBlock.lesson_id) {
      console.error('[eligible-classmates] Assignment block not found or has no lesson:', loggableError(blockError));
      return res.status(404).json({ error: 'Tarea no encontrada' });
    }

    // Get lesson to find course_id (separate query, no FK join)
    const { data: lesson, error: lessonError } = await supabaseAdmin
      .from('lessons')
      .select('course_id, module_id')
      .eq('id', assignmentBlock.lesson_id)
      .single();

    if (lessonError || !lesson) {
      console.error('[eligible-classmates] Lesson not found:', loggableError(lessonError));
      return res.status(404).json({ error: 'Curso no encontrado para esta tarea' });
    }

    console.log('[eligible-classmates] STEP 4a - Lesson data:', { course: !!lesson.course_id, module: !!lesson.module_id });

    // course_id can be on lesson directly OR on the module — query module separately if needed
    let courseId = lesson.course_id;

    if (!courseId && lesson.module_id) {
      const { data: moduleData, error: moduleError } = await supabaseAdmin
        .from('modules')
        .select('course_id')
        .eq('id', lesson.module_id)
        .single();

      if (moduleError) {
        console.error('[eligible-classmates] Error fetching module:', loggableError(moduleError));
      }

      console.log('[eligible-classmates] STEP 4b - Module data:', { course: !!moduleData?.course_id });
      courseId = moduleData?.course_id || null;
    }

    if (!courseId) {
      console.error('[eligible-classmates] No course_id found on lesson or module');
      return res.status(404).json({ error: 'Curso no encontrado para esta tarea' });
    }
    console.log('[eligible-classmates] STEP 4 - Resolved course');

    // 5. Get all students enrolled in this course (no FK join — just user_id)
    // Use supabaseAdmin to bypass RLS (safe: already validated user is group member)
    const { data: enrolledClassmates, error: enrollmentError } = await supabaseAdmin
      .from('course_enrollments')
      .select('user_id')
      .eq('course_id', courseId)
      .eq('status', 'active')
      .neq('user_id', userId); // Exclude self

    if (enrollmentError) {
      console.error('[eligible-classmates] Error fetching course enrollments:', loggableError(enrollmentError));
      return res.status(500).json({ error: 'Error al obtener compañeros' });
    }

    console.log('[eligible-classmates] STEP 5 - Total course enrollments (excluding self):', enrolledClassmates?.length || 0);

    if (!enrolledClassmates || enrolledClassmates.length === 0) {
      console.log('[eligible-classmates] No enrolled classmates found for course');
      return res.status(200).json({ classmates: [] });
    }

    // 6. Filter to only include classmates from the same school
    // Use supabaseAdmin to bypass RLS (safe: already filtered to course enrollments)
    const { data: classmateRoles, error: classmateRolesError } = await supabaseAdmin
      .from('user_roles')
      .select('user_id, school_id, community_id')
      .in('user_id', enrolledClassmates.map(e => e.user_id))
      .eq('school_id', requesterSchoolId)
      .eq('is_active', true);

    if (classmateRolesError) {
      console.error('[eligible-classmates] Error fetching classmate roles:', loggableError(classmateRolesError));
      return res.status(500).json({ error: 'Error al verificar compañeros' });
    }

    // Build a per-peer map of community_id from any active role in the same school.
    const peerRoleCommunity = new Map<string, string | number | null>();
    (classmateRoles || []).forEach(r => {
      if (!peerRoleCommunity.has(r.user_id) && r.community_id) {
        peerRoleCommunity.set(r.user_id, r.community_id);
      }
    });

    const sameSchoolUserIds = new Set(classmateRoles?.map(r => r.user_id) || []);
    const sameSchoolClassmates = enrolledClassmates.filter(c => sameSchoolUserIds.has(c.user_id));

    console.log('[eligible-classmates] STEP 6 - Classmate roles in same school:', classmateRoles?.length || 0);
    console.log('[eligible-classmates] STEP 6 - Same school classmates after filter:', sameSchoolClassmates.length);

    if (sameSchoolClassmates.length === 0) {
      console.log('[eligible-classmates] No classmates from the requester school');
      return res.status(200).json({ classmates: [] });
    }

    // 7. Get students already in ANY group for this assignment
    // Use supabaseAdmin to bypass RLS (safe: already filtered to same school)
    const { data: groupMembers, error: groupMembersError } = await supabaseAdmin
      .from('group_assignment_members')
      .select('user_id')
      .eq('assignment_id', assignmentId as string);

    if (groupMembersError) {
      console.error('[eligible-classmates] Error fetching group members:', loggableError(groupMembersError));
      return res.status(500).json({ error: 'Error al verificar grupos' });
    }

    const assignedUserIds = groupMembers?.map(m => m.user_id) || [];
    console.log('[eligible-classmates] STEP 7 - Already assigned users:', assignedUserIds.length);

    // 8. Filter out already-assigned students, then fetch profiles separately
    const eligibleUserIds = sameSchoolClassmates
      .filter(member => !assignedUserIds.includes(member.user_id))
      .map(member => member.user_id);

    console.log('[eligible-classmates] STEP 8 - Eligible classmates after filtering:', eligibleUserIds.length);

    if (eligibleUserIds.length === 0) {
      console.log('[eligible-classmates] No eligible classmates after filtering assigned users');
      return res.status(200).json({ classmates: [] });
    }

    // Fetch profiles separately (no FK join), including community_id for affinity fallback.
    const { data: profiles, error: profilesError } = await supabaseAdmin
      .from('profiles')
      .select('id, first_name, last_name, email, avatar_url, community_id')
      .in('id', eligibleUserIds);

    if (profilesError) {
      console.error('[eligible-classmates] STEP 8 - Error fetching profiles:', loggableError(profilesError));
      return res.status(500).json({ error: 'Error al obtener perfiles de compañeros' });
    }

    console.log('[eligible-classmates] STEP 8 - Profiles fetched:', profiles?.length || 0);

    // Build a lookup map from profiles
    const profileMap = new Map(
      (profiles || []).map(p => [p.id, p])
    );

    // Build response by joining profile data in application code
    const eligibleClassmates = eligibleUserIds.map(uid => {
      const profile = profileMap.get(uid);

      // Effective community for the peer: roles first, profiles fallback.
      const peerCommunityId =
        peerRoleCommunity.get(uid) ?? profile?.community_id ?? null;

      const affinity: 'community' | 'school' =
        requesterCommunityId && peerCommunityId && peerCommunityId === requesterCommunityId
          ? 'community'
          : 'school';

      return {
        id: uid,
        first_name: profile?.first_name,
        last_name: profile?.last_name,
        full_name: profile
          ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'Usuario desconocido'
          : 'Usuario desconocido',
        email: profile?.email,
        avatar_url: profile?.avatar_url,
        affinity
      };
    });

    console.log('[eligible-classmates] eligible', eligibleClassmates.length, '(filtered from', sameSchoolClassmates.length, 'same-school enrolled classmates)');
    return res.status(200).json({ classmates: eligibleClassmates });

  } catch (error) {
    console.error('Error in eligible-classmates endpoint:', loggableError(error));
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}
