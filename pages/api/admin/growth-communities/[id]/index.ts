import type { NextApiRequest, NextApiResponse } from 'next';
import {
  checkIsAdminOrEquipoDirectivo,
  createServiceRoleClient,
  handleMethodNotAllowed,
  logApiRequest,
  sendApiError,
} from '../../../../../lib/api-auth';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const NAME_MAX = 120;
const DESCRIPTION_MAX = 500;
const MAX_TEACHERS_MIN = 2;
const MAX_TEACHERS_MAX = 16;

const COMMUNITY_FORBIDDEN = 'No tienes permiso para gestionar esta comunidad';

interface CommunityRow {
  id: string;
  school_id: number | string;
  generation_id: string | null;
  name: string;
  max_teachers: number | null;
  description: string | null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  logApiRequest(req, 'admin/growth-communities/[id]');

  const method = req.method ?? '';
  if (!['PATCH', 'DELETE'].includes(method)) {
    return handleMethodNotAllowed(res, ['PATCH', 'DELETE']);
  }

  if (method === 'PATCH') return handlePatch(req, res);
  return handleDelete(req, res);
}

async function handleDelete(req: NextApiRequest, res: NextApiResponse) {
  const { isAuthorized, role, schoolId: edSchoolId, user, error: authError } =
    await checkIsAdminOrEquipoDirectivo(req, res);
  if (authError) {
    return sendApiError(res, 'Unauthorized', 401, authError.message);
  }
  if (!isAuthorized || !user) {
    return res.status(403).json({ error: COMMUNITY_FORBIDDEN });
  }

  const rawId = req.query.id;
  const communityId = Array.isArray(rawId) ? rawId[0] : rawId;
  if (!communityId || typeof communityId !== 'string' || !UUID_REGEX.test(communityId)) {
    return sendApiError(res, 'Invalid community id', 400);
  }

  const supabase = createServiceRoleClient();

  const { data: community, error: communityError } = await supabase
    .from('growth_communities')
    .select('id, school_id, generation_id, name, max_teachers, description')
    .eq('id', communityId)
    .single<CommunityRow>();

  if (communityError || !community) {
    return sendApiError(res, 'Community not found', 404, communityError?.message);
  }

  if (role === 'equipo_directivo') {
    const communitySchoolId =
      typeof community.school_id === 'number'
        ? community.school_id
        : Number(community.school_id);
    if (!Number.isFinite(communitySchoolId) || communitySchoolId !== edSchoolId) {
      return res.status(403).json({ error: COMMUNITY_FORBIDDEN });
    }
  }

  const body = (req.body ?? {}) as { confirm?: unknown };
  const confirm = body.confirm === true;

  const [
    membersOrLeaders,
    sessions,
    consultantAssignments,
    workspaces,
    groupAssignments,
    assignmentInstances,
    submissionShares,
    legacyProfileRefs,
  ] = await Promise.all([
    supabase
      .from('user_roles')
      .select('*', { count: 'exact', head: true })
      .eq('community_id', community.id)
      .eq('is_active', true),
    supabase
      .from('consultor_sessions')
      .select('*', { count: 'exact', head: true })
      .eq('growth_community_id', community.id),
    supabase
      .from('consultant_assignments')
      .select('*', { count: 'exact', head: true })
      .eq('community_id', community.id),
    supabase
      .from('community_workspaces')
      .select('*', { count: 'exact', head: true })
      .eq('community_id', community.id),
    supabase
      .from('group_assignment_groups')
      .select('*', { count: 'exact', head: true })
      .eq('community_id', community.id),
    supabase
      .from('assignment_instances')
      .select('*', { count: 'exact', head: true })
      .eq('community_id', community.id),
    supabase
      .from('assignment_submission_shares')
      .select('*', { count: 'exact', head: true })
      .eq('community_id', community.id),
    supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('community_id', community.id),
  ]);

  const blockerCounts: Array<{ kind: string; count: number }> = [
    { kind: 'members_or_leaders', count: membersOrLeaders.count ?? 0 },
    { kind: 'sessions', count: sessions.count ?? 0 },
    { kind: 'consultant_assignments', count: consultantAssignments.count ?? 0 },
    { kind: 'workspaces', count: workspaces.count ?? 0 },
    { kind: 'group_assignments', count: groupAssignments.count ?? 0 },
    { kind: 'assignment_instances', count: assignmentInstances.count ?? 0 },
    { kind: 'submission_shares', count: submissionShares.count ?? 0 },
    { kind: 'legacy_profile_refs', count: legacyProfileRefs.count ?? 0 },
  ];

  const blockers = blockerCounts.filter((b) => b.count > 0);

  if (blockers.length > 0) {
    return res.status(409).json({ error: 'has_dependencies', blockers });
  }

  if (!confirm) {
    return res.status(200).json({ deletable: true, blockers: [] });
  }

  const { error: deleteError } = await supabase
    .from('growth_communities')
    .delete()
    .eq('id', community.id);

  if (deleteError) {
    return res.status(500).json({ error: 'delete_failed', message: deleteError.message });
  }

  return res.status(200).json({ deleted: true, id: community.id });
}

async function handlePatch(req: NextApiRequest, res: NextApiResponse) {
  const { isAuthorized, role, schoolId: edSchoolId, user, error: authError } =
    await checkIsAdminOrEquipoDirectivo(req, res);
  if (authError) {
    return sendApiError(res, 'Unauthorized', 401, authError.message);
  }
  if (!isAuthorized || !user) {
    return res.status(403).json({ error: COMMUNITY_FORBIDDEN });
  }

  const rawId = req.query.id;
  const communityId = Array.isArray(rawId) ? rawId[0] : rawId;
  if (!communityId || typeof communityId !== 'string' || !UUID_REGEX.test(communityId)) {
    return sendApiError(res, 'Invalid community id', 400);
  }

  const supabase = createServiceRoleClient();

  const { data: community, error: communityError } = await supabase
    .from('growth_communities')
    .select('id, school_id, generation_id, name, max_teachers, description')
    .eq('id', communityId)
    .single<CommunityRow>();

  if (communityError || !community) {
    return sendApiError(res, 'Community not found', 404, communityError?.message);
  }

  if (role === 'equipo_directivo') {
    const communitySchoolId =
      typeof community.school_id === 'number'
        ? community.school_id
        : Number(community.school_id);
    if (!Number.isFinite(communitySchoolId) || communitySchoolId !== edSchoolId) {
      return res.status(403).json({ error: COMMUNITY_FORBIDDEN });
    }
  }

  const body = (req.body ?? {}) as {
    name?: unknown;
    max_teachers?: unknown;
    description?: unknown;
    generation_id?: unknown;
    school_id?: unknown;
  };

  if (body.school_id !== undefined) {
    return res.status(400).json({
      error: 'school_id_immutable',
      message: 'No se puede cambiar el colegio de una comunidad existente.',
    });
  }

  let nameProvided = false;
  let name: string | undefined;
  if (body.name !== undefined) {
    if (typeof body.name !== 'string') {
      return sendApiError(res, 'name must be a string', 400);
    }
    const trimmed = body.name.trim();
    if (trimmed.length < 1 || trimmed.length > NAME_MAX) {
      return sendApiError(res, `name must be 1-${NAME_MAX} characters`, 400);
    }
    name = trimmed;
    nameProvided = true;
  }

  let maxTeachersProvided = false;
  let maxTeachers: number | undefined;
  if (body.max_teachers !== undefined) {
    if (
      typeof body.max_teachers !== 'number' ||
      !Number.isInteger(body.max_teachers) ||
      body.max_teachers < MAX_TEACHERS_MIN ||
      body.max_teachers > MAX_TEACHERS_MAX
    ) {
      return sendApiError(
        res,
        `max_teachers must be an integer between ${MAX_TEACHERS_MIN} and ${MAX_TEACHERS_MAX}`,
        400,
      );
    }
    maxTeachers = body.max_teachers;
    maxTeachersProvided = true;
  }

  let descriptionProvided = false;
  let description: string | null | undefined;
  if (body.description !== undefined) {
    if (body.description === null) {
      description = null;
    } else if (typeof body.description !== 'string') {
      return sendApiError(res, 'description must be a string or null', 400);
    } else if (body.description.length > DESCRIPTION_MAX) {
      return sendApiError(res, `description must be at most ${DESCRIPTION_MAX} characters`, 400);
    } else {
      description = body.description;
    }
    descriptionProvided = true;
  }

  let generationIdProvided = false;
  let generationId: string | null | undefined;
  if (body.generation_id !== undefined) {
    if (body.generation_id === null) {
      generationId = null;
    } else if (typeof body.generation_id !== 'string' || !UUID_REGEX.test(body.generation_id)) {
      return sendApiError(res, 'generation_id must be null or a UUID', 400);
    } else {
      generationId = body.generation_id;
    }
    generationIdProvided = true;
  }

  if (!nameProvided && !maxTeachersProvided && !descriptionProvided && !generationIdProvided) {
    return sendApiError(res, 'At least one updatable field is required', 400);
  }

  if (generationIdProvided) {
    const { data: school, error: schoolError } = await supabase
      .from('schools')
      .select('has_generations')
      .eq('id', community.school_id)
      .single<{ has_generations: boolean | null }>();

    if (schoolError || !school) {
      return sendApiError(res, 'School not found', 404, schoolError?.message);
    }

    if (generationId === null) {
      if (school.has_generations === true) {
        return res.status(400).json({
          error: 'generation_required',
          message: 'Esta escuela utiliza generaciones. Debe seleccionar una generación.',
        });
      }
    } else {
      const { data: gen, error: genError } = await supabase
        .from('generations')
        .select('id')
        .eq('id', generationId)
        .eq('school_id', community.school_id)
        .single();
      if (genError || !gen) {
        return res.status(400).json({
          error: 'generation_invalid',
          message: 'La generación seleccionada no es válida para esta escuela.',
        });
      }
    }

    if (generationId !== community.generation_id) {
      const { data: members, error: membersError } = await supabase
        .from('user_roles')
        .select('generation_id')
        .eq('community_id', community.id)
        .eq('is_active', true);
      if (membersError) {
        return sendApiError(res, 'Failed to load members', 500, membersError.message);
      }

      const conflicting = (members ?? []).filter(
        (m: { generation_id: string | null }) =>
          m.generation_id !== null && m.generation_id !== generationId,
      );
      if (conflicting.length > 0) {
        return res.status(400).json({
          error: 'members_have_other_generation',
          message:
            'Algunos miembros pertenecen a otra generación. No se puede cambiar la generación de la comunidad.',
          conflicting_member_count: conflicting.length,
        });
      }
    }
  }

  const updatePayload: Record<string, unknown> = {};
  if (nameProvided) updatePayload.name = name;
  if (maxTeachersProvided) updatePayload.max_teachers = maxTeachers;
  if (descriptionProvided) updatePayload.description = description;
  if (generationIdProvided) updatePayload.generation_id = generationId;

  const { data: updated, error: updateError } = await supabase
    .from('growth_communities')
    .update(updatePayload)
    .eq('id', community.id)
    .select(
      'id, school_id, generation_id, name, max_teachers, description, created_at, updated_at',
    )
    .single();

  if (updateError) {
    if ((updateError as { code?: string }).code === '23505') {
      return res.status(409).json({
        error: 'duplicate_name',
        message: `Ya existe una comunidad con ese nombre en esta escuela.`,
      });
    }
    return res.status(500).json({ error: 'update_failed', message: updateError.message });
  }

  if (generationIdProvided && generationId !== community.generation_id) {
    // Backfill policy: when the community's generation changes, propagate the
    // new generation to active member rows whose generation_id is NULL or
    // equal to the previous community generation. Rows pinned to a different
    // generation are blocked above by the conflict check and never reach here.
    const oldGen = community.generation_id;
    let backfill = supabase
      .from('user_roles')
      .update({ generation_id: generationId })
      .eq('community_id', community.id)
      .eq('is_active', true);

    if (oldGen === null) {
      backfill = backfill.is('generation_id', null);
    } else {
      backfill = backfill.or(`generation_id.is.null,generation_id.eq.${oldGen}`);
    }

    const { error: backfillError } = await backfill;
    if (backfillError) {
      return sendApiError(
        res,
        'Failed to backfill members generation',
        500,
        backfillError.message,
      );
    }
  }

  return res.status(200).json({ community: updated });
}
