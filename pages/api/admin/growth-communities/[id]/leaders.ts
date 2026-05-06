import type { NextApiRequest, NextApiResponse } from 'next';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  checkIsAdminOrEquipoDirectivo,
  createServiceRoleClient,
  handleMethodNotAllowed,
  logApiRequest,
  sendApiError,
} from '../../../../../lib/api-auth';

// Non-leader role priority. lider_comunidad is intentionally absent — promotion
// to leader inserts a fresh row, demotion picks an existing non-leader row to
// rebind. This file never resolves a user "back" to their own leader row.
const NON_LEADER_PRIORITY = [
  'docente',
  'equipo_directivo',
  'lider_generacion',
  'community_manager',
  'consultor',
  'supervisor_de_red',
  'encargado_licitacion',
] as const;

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface RoleRow {
  id: string;
  user_id: string;
  role_type: string;
  school_id: number | string | null;
  generation_id: string | null;
  community_id: string | null;
  is_active: boolean;
}

interface CommunityRow {
  id: string;
  school_id: number | string;
  generation_id: string | null;
}

const COMMUNITY_LEADERS_FORBIDDEN =
  'No tienes permiso para gestionar líderes de esta comunidad';

function chooseBestNonLeaderRow(rows: RoleRow[]): RoleRow | null {
  for (const role of NON_LEADER_PRIORITY) {
    const found = rows.find((r) => r.role_type === role);
    if (found) return found;
  }
  return null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  logApiRequest(req, 'admin/growth-communities/[id]/leaders');

  const method = req.method ?? '';
  if (!['POST', 'DELETE'].includes(method)) {
    return handleMethodNotAllowed(res, ['POST', 'DELETE']);
  }

  if (method === 'POST') return handlePost(req, res);
  return handleDelete(req, res);
}

async function getAuthContext(req: NextApiRequest, res: NextApiResponse) {
  const { isAuthorized, role, schoolId, user, error: authError } =
    await checkIsAdminOrEquipoDirectivo(req, res);
  if (authError) {
    sendApiError(res, 'Unauthorized', 401, authError.message);
    return null;
  }
  if (!isAuthorized || !user) {
    res.status(403).json({ error: COMMUNITY_LEADERS_FORBIDDEN });
    return null;
  }

  const rawId = req.query.id;
  const communityId = Array.isArray(rawId) ? rawId[0] : rawId;
  if (!communityId || typeof communityId !== 'string' || !UUID_REGEX.test(communityId)) {
    sendApiError(res, 'Invalid community id', 400);
    return null;
  }

  const supabase = createServiceRoleClient();

  const { data: community, error: communityError } = await supabase
    .from('growth_communities')
    .select('id, school_id, generation_id')
    .eq('id', communityId)
    .single<CommunityRow>();

  if (communityError || !community) {
    sendApiError(res, 'Community not found', 404, communityError?.message);
    return null;
  }

  if (role === 'equipo_directivo') {
    const communitySchoolId =
      typeof community.school_id === 'number'
        ? community.school_id
        : Number(community.school_id);
    if (!Number.isFinite(communitySchoolId) || communitySchoolId !== schoolId) {
      res.status(403).json({ error: COMMUNITY_LEADERS_FORBIDDEN });
      return null;
    }
  }

  return { supabase, community, authUserId: user.id };
}

async function refreshCache(supabase: SupabaseClient) {
  const { error } = await supabase.rpc('refresh_user_roles_cache');
  if (error) {
    console.error('[leaders API] refresh_user_roles_cache failed:', error);
  }
}

async function reactivateLeaderRow(
  supabase: SupabaseClient,
  leaderRowId: string,
): Promise<boolean> {
  const { error } = await supabase
    .from('user_roles')
    .update({ is_active: true })
    .eq('id', leaderRowId);
  if (error) {
    console.error(
      '[leaders.compensation] failed to re-activate leader row:',
      { leaderRowId, error },
    );
    return false;
  }
  return true;
}

function readUserId(req: NextApiRequest): string | null {
  const body = req.body as { userId?: unknown } | undefined;
  const userId = body?.userId;
  if (typeof userId !== 'string' || !userId || !UUID_REGEX.test(userId)) {
    return null;
  }
  return userId;
}

async function handlePost(req: NextApiRequest, res: NextApiResponse) {
  const context = await getAuthContext(req, res);
  if (!context) return;
  const { supabase, community, authUserId } = context;

  const userId = readUserId(req);
  if (!userId) {
    return sendApiError(res, 'userId is required and must be a UUID', 400);
  }

  // FIXME: race-prone — F4
  const { data: existingLeader, error: existingError } = await supabase
    .from('user_roles')
    .select('id')
    .eq('user_id', userId)
    .eq('community_id', community.id)
    .eq('role_type', 'lider_comunidad')
    .eq('is_active', true)
    .limit(1);
  if (existingError) {
    return sendApiError(res, 'Failed to check leadership', 500, existingError.message);
  }
  if ((existingLeader ?? []).length > 0) {
    return res.status(409).json({
      error: 'already_leader',
      message: 'Este usuario ya es líder de esta comunidad.',
    });
  }

  const { data: schoolRoles, error: rolesError } = await supabase
    .from('user_roles')
    .select('id, user_id, role_type, school_id, generation_id, community_id, is_active')
    .eq('school_id', community.school_id)
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('id', { ascending: true });
  if (rolesError) {
    return sendApiError(res, 'Failed to load roles', 500, rolesError.message);
  }

  const eligibleRows = ((schoolRoles ?? []) as RoleRow[]).filter((r) =>
    (NON_LEADER_PRIORITY as readonly string[]).includes(r.role_type),
  );
  const chosen = chooseBestNonLeaderRow(eligibleRows);
  if (!chosen) {
    return res.status(400).json({
      error: 'no_eligible_role_in_school',
      message: 'El usuario no tiene un rol activo en este colegio.',
    });
  }

  if (chosen.generation_id !== null && chosen.generation_id !== community.generation_id) {
    return res.status(400).json({
      error: 'generation_mismatch',
      message: 'El usuario pertenece a una generación distinta.',
    });
  }

  const { data: inserted, error: insertError } = await supabase
    .from('user_roles')
    .insert({
      user_id: userId,
      role_type: 'lider_comunidad',
      school_id: community.school_id,
      generation_id: community.generation_id ?? null,
      community_id: community.id,
      is_active: true,
      assigned_by: authUserId,
      assigned_at: new Date().toISOString(),
    })
    .select('id')
    .single();
  if (insertError) {
    if ((insertError as { code?: string }).code === '23505') {
      return res.status(409).json({
        error: 'already_leader',
        message: 'Este usuario ya es líder de esta comunidad.',
      });
    }
    return sendApiError(res, 'Failed to assign leader', 500, insertError.message);
  }

  await refreshCache(supabase);

  return res.status(200).json({ assigned: 1, leader_user_roles_id: inserted.id });
}

async function handleDelete(req: NextApiRequest, res: NextApiResponse) {
  const context = await getAuthContext(req, res);
  if (!context) return;
  const { supabase, community } = context;

  const userId = readUserId(req);
  if (!userId) {
    return sendApiError(res, 'userId is required and must be a UUID', 400);
  }

  const mode = (req.body as { mode?: unknown } | undefined)?.mode;
  if (mode !== 'demote_to_member' && mode !== 'remove_from_community') {
    return sendApiError(
      res,
      'mode must be "demote_to_member" or "remove_from_community"',
      400,
    );
  }

  const { data: leaderRows, error: leaderError } = await supabase
    .from('user_roles')
    .select('id, user_id, role_type, school_id, generation_id, community_id, is_active')
    .eq('user_id', userId)
    .eq('community_id', community.id)
    .eq('role_type', 'lider_comunidad')
    .eq('is_active', true)
    .limit(1);
  if (leaderError) {
    return sendApiError(res, 'Failed to load leader', 500, leaderError.message);
  }
  const leaderRow = (leaderRows ?? [])[0] as RoleRow | undefined;
  if (!leaderRow) {
    return res.status(404).json({ error: 'not_a_leader' });
  }

  const { error: deactivateError } = await supabase
    .from('user_roles')
    .update({ is_active: false })
    .eq('id', leaderRow.id);
  if (deactivateError) {
    return sendApiError(res, 'Failed to deactivate leader', 500, deactivateError.message);
  }

  if (mode === 'remove_from_community') {
    const { error: nullError } = await supabase
      .from('user_roles')
      .update({ community_id: null })
      .eq('user_id', userId)
      .eq('school_id', community.school_id)
      .eq('community_id', community.id)
      .eq('is_active', true);
    if (nullError) {
      const compensated = await reactivateLeaderRow(supabase, leaderRow.id);
      if (!compensated) {
        return res.status(500).json({
          error: 'compensation_failed',
          message:
            'No se pudo deshacer la desactivación del líder; se requiere intervención manual.',
        });
      }
      return sendApiError(res, 'Failed to remove from community', 500, nullError.message);
    }

    await refreshCache(supabase);
    return res.status(200).json({ demoted: 1, mode: 'remove_from_community' });
  }

  const { data: schoolRoles, error: rolesError } = await supabase
    .from('user_roles')
    .select('id, user_id, role_type, school_id, generation_id, community_id, is_active')
    .eq('user_id', userId)
    .eq('school_id', community.school_id)
    .eq('is_active', true)
    .order('id', { ascending: true });
  if (rolesError) {
    await reactivateLeaderRow(supabase, leaderRow.id);
    return sendApiError(res, 'Failed to load roles', 500, rolesError.message);
  }

  const eligibleRows = ((schoolRoles ?? []) as RoleRow[]).filter((r) =>
    (NON_LEADER_PRIORITY as readonly string[]).includes(r.role_type),
  );
  const chosen = chooseBestNonLeaderRow(eligibleRows);

  if (!chosen) {
    await reactivateLeaderRow(supabase, leaderRow.id);
    return res.status(409).json({
      error: 'no_eligible_role_to_demote_to',
      message:
        'El usuario no tiene otro rol en este colegio. Usa "remove_from_community" en su lugar.',
    });
  }

  if (chosen.generation_id !== null && chosen.generation_id !== community.generation_id) {
    await reactivateLeaderRow(supabase, leaderRow.id);
    return res.status(409).json({
      error: 'generation_mismatch_on_demote',
      message:
        'El usuario pertenece a otra generación; no se puede mantener como miembro.',
    });
  }

  if (chosen.community_id !== null && chosen.community_id !== community.id) {
    await reactivateLeaderRow(supabase, leaderRow.id);
    return res.status(409).json({
      error: 'chosen_row_in_other_community',
      message:
        'El otro rol del usuario ya pertenece a otra comunidad; no se puede degradar a miembro aquí.',
    });
  }

  if (chosen.community_id === null) {
    const updatePayload: Record<string, unknown> = { community_id: community.id };
    if (chosen.generation_id === null) {
      updatePayload.generation_id = community.generation_id ?? null;
    }
    const { error: bindError } = await supabase
      .from('user_roles')
      .update(updatePayload)
      .eq('id', chosen.id);
    if (bindError) {
      await reactivateLeaderRow(supabase, leaderRow.id);
      return sendApiError(res, 'Failed to demote leader', 500, bindError.message);
    }
  }

  await refreshCache(supabase);
  return res.status(200).json({ demoted: 1, mode: 'demote_to_member' });
}
