import type { NextApiRequest, NextApiResponse } from 'next';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  checkIsAdmin,
  createServiceRoleClient,
  handleMethodNotAllowed,
  logApiRequest,
  sendApiError,
} from '../../../../../lib/api-auth';

// Deterministic priority for picking which user_roles row to bind to a community.
// Lower index wins. lider_comunidad is last on purpose: that row is structural
// and must never be hijacked once it already points at a community.
const ROLE_PRIORITY = [
  'docente',
  'equipo_directivo',
  'lider_generacion',
  'community_manager',
  'consultor',
  'supervisor_de_red',
  'encargado_licitacion',
  'lider_comunidad',
] as const;

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
  name: string;
  school_id: number | string;
  generation_id: string | null;
  max_teachers: number | null;
}

interface ProfileRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  avatar_url: string | null;
}

function chooseBestRow(rows: RoleRow[]): RoleRow | null {
  for (const role of ROLE_PRIORITY) {
    const found = rows.find((r) => r.role_type === role);
    if (found) return found;
  }
  return null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  logApiRequest(req, 'admin/growth-communities/[id]/members');

  const method = req.method ?? '';
  if (!['GET', 'POST', 'DELETE'].includes(method)) {
    return handleMethodNotAllowed(res, ['GET', 'POST', 'DELETE']);
  }

  const { isAdmin, user, error: authError } = await checkIsAdmin(req, res);
  if (authError) {
    return sendApiError(res, 'Unauthorized', 401, authError.message);
  }
  if (!isAdmin || !user) {
    return sendApiError(res, 'Forbidden', 403);
  }

  const rawId = req.query.id;
  const communityId = Array.isArray(rawId) ? rawId[0] : rawId;
  if (!communityId || typeof communityId !== 'string') {
    return sendApiError(res, 'Invalid community id', 400);
  }

  const supabase = createServiceRoleClient();

  const { data: community, error: communityError } = await supabase
    .from('growth_communities')
    .select('id, name, school_id, generation_id, max_teachers')
    .eq('id', communityId)
    .single<CommunityRow>();

  if (communityError || !community) {
    return sendApiError(res, 'Community not found', 404, communityError?.message);
  }

  if (method === 'GET') return handleGet(res, supabase, community);
  if (method === 'POST') return handlePost(req, res, supabase, community);
  return handleDelete(req, res, supabase, community);
}

async function handleGet(
  res: NextApiResponse,
  supabase: SupabaseClient,
  community: CommunityRow
) {
  const { data: schoolRoles, error: rolesError } = await supabase
    .from('user_roles')
    .select('id, user_id, role_type, school_id, generation_id, community_id, is_active')
    .eq('school_id', community.school_id)
    .eq('is_active', true);

  if (rolesError) {
    return sendApiError(res, 'Failed to load roles', 500, rolesError.message);
  }

  const rows = (schoolRoles ?? []) as RoleRow[];
  const userIds = Array.from(new Set(rows.map((r) => r.user_id)));

  const profilesResult = userIds.length
    ? await supabase
        .from('profiles')
        .select('id, first_name, last_name, email, avatar_url')
        .in('id', userIds)
    : { data: [], error: null };

  if (profilesResult.error) {
    return sendApiError(res, 'Failed to load profiles', 500, profilesResult.error.message);
  }
  const profiles = (profilesResult.data ?? []) as ProfileRow[];
  const profileById = new Map(profiles.map((p) => [p.id, p]));

  const rowsByUser = new Map<string, RoleRow[]>();
  for (const row of rows) {
    const arr = rowsByUser.get(row.user_id);
    if (arr) arr.push(row);
    else rowsByUser.set(row.user_id, [row]);
  }

  const currentMembers: Array<{ user_id: string; profile: ProfileRow | null; role: RoleRow }> = [];
  const unassigned: Array<{ user_id: string; profile: ProfileRow | null; chosen_role: RoleRow }> = [];
  const reassignFrom: Array<{
    user_id: string;
    profile: ProfileRow | null;
    chosen_role: RoleRow;
    from_community_id: string;
    from_community_name: string | null;
  }> = [];
  const otherCommunityIds = new Set<string>();
  let isLeaderCount = 0;
  let generationMismatchCount = 0;

  for (const [userId, userRows] of rowsByUser) {
    const profile = profileById.get(userId) ?? null;

    const memberRow = userRows.find((r) => r.community_id === community.id);
    if (memberRow) {
      currentMembers.push({ user_id: userId, profile, role: memberRow });
      continue;
    }

    const chosen = chooseBestRow(userRows);
    if (!chosen) continue;

    // INVARIANT: never modify a lider_comunidad row whose community_id is set.
    // If that's the only row we could pick, the user can't be added here.
    if (chosen.role_type === 'lider_comunidad' && chosen.community_id) {
      isLeaderCount++;
      continue;
    }

    if (
      community.generation_id &&
      chosen.generation_id &&
      chosen.generation_id !== community.generation_id
    ) {
      generationMismatchCount++;
      continue;
    }

    if (chosen.community_id && chosen.community_id !== community.id) {
      otherCommunityIds.add(chosen.community_id);
      reassignFrom.push({
        user_id: userId,
        profile,
        chosen_role: chosen,
        from_community_id: chosen.community_id,
        from_community_name: null,
      });
    } else {
      unassigned.push({ user_id: userId, profile, chosen_role: chosen });
    }
  }

  if (otherCommunityIds.size > 0) {
    const { data: relatedCommunities, error: relatedError } = await supabase
      .from('growth_communities')
      .select('id, name')
      .in('id', Array.from(otherCommunityIds));
    if (relatedError) {
      return sendApiError(res, 'Failed to load related communities', 500, relatedError.message);
    }
    const nameById = new Map((relatedCommunities ?? []).map((c: { id: string; name: string }) => [c.id, c.name]));
    for (const entry of reassignFrom) {
      entry.from_community_name = nameById.get(entry.from_community_id) ?? null;
    }
  }

  return res.status(200).json({
    community,
    currentMembers,
    eligibleUsers: { unassigned, reassignFrom },
    excludedSummary: {
      is_leader: isLeaderCount,
      generation_mismatch: generationMismatchCount,
    },
  });
}

async function handlePost(
  req: NextApiRequest,
  res: NextApiResponse,
  supabase: SupabaseClient,
  community: CommunityRow
) {
  const body = req.body as { userIds?: unknown } | undefined;
  const userIds = Array.isArray(body?.userIds)
    ? (body!.userIds.filter((u) => typeof u === 'string') as string[])
    : [];
  if (userIds.length === 0) {
    return sendApiError(res, 'userIds must be a non-empty string array', 400);
  }

  // Only consider rows in this community's school. Rows from other schools
  // are intentionally invisible to this endpoint.
  const { data: schoolRoles, error: rolesError } = await supabase
    .from('user_roles')
    .select('id, user_id, role_type, school_id, generation_id, community_id, is_active')
    .eq('school_id', community.school_id)
    .eq('is_active', true)
    .in('user_id', userIds);

  if (rolesError) {
    return sendApiError(res, 'Failed to load roles', 500, rolesError.message);
  }

  const rows = (schoolRoles ?? []) as RoleRow[];
  const rowsByUser = new Map<string, RoleRow[]>();
  for (const row of rows) {
    const arr = rowsByUser.get(row.user_id);
    if (arr) arr.push(row);
    else rowsByUser.set(row.user_id, [row]);
  }

  type SkipReason =
    | 'no_eligible_role'
    | 'already_in_community'
    | 'is_leader'
    | 'generation_mismatch';
  const skipped: Array<{ user_id: string; reason: SkipReason }> = [];
  const chosenRows: Array<{ user_id: string; row: RoleRow }> = [];

  for (const userId of userIds) {
    const userRows = rowsByUser.get(userId) ?? [];
    if (userRows.length === 0) {
      skipped.push({ user_id: userId, reason: 'no_eligible_role' });
      continue;
    }

    if (userRows.some((r) => r.community_id === community.id)) {
      skipped.push({ user_id: userId, reason: 'already_in_community' });
      continue;
    }

    const chosen = chooseBestRow(userRows);
    if (!chosen) {
      skipped.push({ user_id: userId, reason: 'no_eligible_role' });
      continue;
    }

    // INVARIANT: never modify a lider_comunidad row whose community_id is set.
    if (chosen.role_type === 'lider_comunidad' && chosen.community_id) {
      skipped.push({ user_id: userId, reason: 'is_leader' });
      continue;
    }

    if (
      community.generation_id &&
      chosen.generation_id &&
      chosen.generation_id !== community.generation_id
    ) {
      skipped.push({ user_id: userId, reason: 'generation_mismatch' });
      continue;
    }

    chosenRows.push({ user_id: userId, row: chosen });
  }

  // Recompute capacity at write time. Capacity is enforced against the live
  // count of active members in this community plus the batch we'd add.
  if (community.max_teachers != null) {
    const { count, error: countError } = await supabase
      .from('user_roles')
      .select('id', { count: 'exact', head: true })
      .eq('community_id', community.id)
      .eq('is_active', true);

    if (countError) {
      return sendApiError(res, 'Failed to count members', 500, countError.message);
    }

    if ((count ?? 0) + chosenRows.length > community.max_teachers) {
      return res.status(400).json({ error: 'exceeds_max' });
    }
  }

  const idsToBind = chosenRows.map((c) => c.row.id);
  // INVARIANT: only backfill generation_id when chosen row's generation_id is null.
  const idsForGenBackfill = chosenRows
    .filter((c) => c.row.generation_id == null && community.generation_id)
    .map((c) => c.row.id);

  if (idsToBind.length > 0) {
    const { error: updateError } = await supabase
      .from('user_roles')
      .update({ community_id: community.id })
      .in('id', idsToBind);
    if (updateError) {
      return sendApiError(res, 'Failed to update roles', 500, updateError.message);
    }
  }

  if (idsForGenBackfill.length > 0) {
    const { error: backfillError } = await supabase
      .from('user_roles')
      .update({ generation_id: community.generation_id })
      .in('id', idsForGenBackfill);
    if (backfillError) {
      return sendApiError(res, 'Failed to backfill generation', 500, backfillError.message);
    }
  }

  return res.status(200).json({
    added: chosenRows.map((c) => ({
      user_id: c.user_id,
      role_id: c.row.id,
      role_type: c.row.role_type,
    })),
    skipped,
  });
}

async function handleDelete(
  req: NextApiRequest,
  res: NextApiResponse,
  supabase: SupabaseClient,
  community: CommunityRow
) {
  const queryUserId = Array.isArray(req.query.userId) ? req.query.userId[0] : req.query.userId;
  const bodyUserId = (req.body as { userId?: unknown } | undefined)?.userId;
  const userId = typeof queryUserId === 'string' && queryUserId
    ? queryUserId
    : typeof bodyUserId === 'string' && bodyUserId
      ? bodyUserId
      : null;

  if (!userId) {
    return sendApiError(res, 'userId is required', 400);
  }

  const { data: matchingRows, error: fetchError } = await supabase
    .from('user_roles')
    .select('id, role_type')
    .eq('user_id', userId)
    .eq('community_id', community.id)
    .eq('is_active', true);

  if (fetchError) {
    return sendApiError(res, 'Failed to load roles', 500, fetchError.message);
  }

  const matches = (matchingRows ?? []) as Array<{ id: string; role_type: string }>;
  if (matches.length === 0) {
    return res.status(404).json({ error: 'no_membership' });
  }

  // INVARIANT: never modify a lider_comunidad row whose community_id is set.
  // Removing a leader from their community would orphan the community.
  if (matches.some((r) => r.role_type === 'lider_comunidad')) {
    return res.status(400).json({ error: 'is_leader_remove_blocked' });
  }

  const ids = matches.map((r) => r.id);
  const { error: updateError } = await supabase
    .from('user_roles')
    .update({ community_id: null })
    .in('id', ids);

  if (updateError) {
    return sendApiError(res, 'Failed to remove member', 500, updateError.message);
  }

  return res.status(200).json({ removed: ids.length });
}
