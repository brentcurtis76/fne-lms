import type { NextApiRequest, NextApiResponse } from 'next';
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
  school?: { name: string | null } | null;
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

function chooseBestByRoleType<T extends { role_type: string }>(rows: T[]): T | null {
  for (const role of ROLE_PRIORITY) {
    const found = rows.find((r) => r.role_type === role);
    if (found) return found;
  }
  return rows[0] ?? null;
}

function profileFields(profile: ProfileRow | null) {
  return {
    first_name: profile?.first_name ?? null,
    last_name: profile?.last_name ?? null,
    email: profile?.email ?? null,
  };
}

function serializeCommunity(community: CommunityRow) {
  return {
    id: community.id,
    name: community.name,
    school_id: community.school_id,
    school_name: community.school?.name ?? null,
    generation_id: community.generation_id,
    max_teachers: community.max_teachers,
  };
}

const COMMUNITY_MEMBERS_FORBIDDEN =
  'Solo administradores pueden gestionar miembros de comunidades';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  logApiRequest(req, 'admin/growth-communities/[id]/members');

  const method = req.method ?? '';
  if (!['GET', 'POST', 'DELETE'].includes(method)) {
    return handleMethodNotAllowed(res, ['GET', 'POST', 'DELETE']);
  }

  if (method === 'GET') return handleGet(req, res);
  if (method === 'POST') return handlePost(req, res);
  return handleDelete(req, res);
}

async function getAdminContext(req: NextApiRequest, res: NextApiResponse) {
  const { isAdmin, user, error: authError } = await checkIsAdmin(req, res);
  if (authError) {
    sendApiError(res, 'Unauthorized', 401, authError.message);
    return null;
  }
  if (!isAdmin || !user) {
    res.status(403).json({ error: COMMUNITY_MEMBERS_FORBIDDEN });
    return null;
  }

  const rawId = req.query.id;
  const communityId = Array.isArray(rawId) ? rawId[0] : rawId;
  if (!communityId || typeof communityId !== 'string') {
    sendApiError(res, 'Invalid community id', 400);
    return null;
  }

  const supabase = createServiceRoleClient();

  const { data: community, error: communityError } = await supabase
    .from('growth_communities')
    .select('id, name, school_id, generation_id, max_teachers, school:schools(name)')
    .eq('id', communityId)
    .single<CommunityRow>();

  if (communityError || !community) {
    sendApiError(res, 'Community not found', 404, communityError?.message);
    return null;
  }

  return { supabase, community };
}

async function handleGet(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const context = await getAdminContext(req, res);
  if (!context) return;
  const { supabase, community } = context;

  // ORDER BY id is the deterministic tie-break when a user has multiple rows
  // of the same role_type at this school. Without it, Postgres returns rows
  // in physical order and chooseBestRow can flip between callers.
  const { data: schoolRoles, error: rolesError } = await supabase
    .from('user_roles')
    .select('id, user_id, role_type, school_id, generation_id, community_id, is_active')
    .eq('school_id', community.school_id)
    .eq('is_active', true)
    .order('id', { ascending: true });

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

  const currentMembers: Array<{
    user_id: string;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    role_type: string;
    user_roles_id: string;
  }> = [];
  const unassigned: Array<{
    user_id: string;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    role_type: string;
  }> = [];
  const reassignFrom: Array<{
    user_id: string;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    role_type: string;
    current_community_id: string;
    current_community_name: string | null;
  }> = [];
  const otherCommunityIds = new Set<string>();
  let isLeaderCount = 0;
  let generationMismatchCount = 0;

  for (const [userId, userRows] of rowsByUser) {
    const profile = profileById.get(userId) ?? null;

    const memberRow = userRows.find((r) => r.community_id === community.id);
    if (memberRow) {
      currentMembers.push({
        user_id: userId,
        ...profileFields(profile),
        role_type: memberRow.role_type,
        user_roles_id: memberRow.id,
      });
      continue;
    }

    const chosen = chooseBestRow(userRows);
    if (!chosen) continue;

    // INVARIANT: never modify a lider_comunidad row, period — regardless of
    // whether community_id is currently set. Even a null-community_id leader
    // row must not be bound here, because doing so would promote the user to
    // leader of the target community via the bulk-add UI. Leadership ties go
    // through the dedicated role-management flow.
    if (chosen.role_type === 'lider_comunidad') {
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
        ...profileFields(profile),
        role_type: chosen.role_type,
        current_community_id: chosen.community_id,
        current_community_name: null,
      });
    } else {
      unassigned.push({
        user_id: userId,
        ...profileFields(profile),
        role_type: chosen.role_type,
      });
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
      entry.current_community_name = nameById.get(entry.current_community_id) ?? null;
    }
  }

  return res.status(200).json({
    community: serializeCommunity(community),
    currentMembers,
    eligibleUsers: { unassigned, reassignFrom },
    excludedSummary: {
      count: isLeaderCount + generationMismatchCount,
      reasons: {
        is_leader: isLeaderCount,
        generation_mismatch: generationMismatchCount,
      },
    },
  });
}

async function handlePost(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const context = await getAdminContext(req, res);
  if (!context) return;
  const { supabase, community } = context;

  const body = req.body as { userIds?: unknown } | undefined;
  const userIds = Array.isArray(body?.userIds)
    ? Array.from(new Set(body!.userIds.filter((u) => typeof u === 'string') as string[]))
    : [];
  if (userIds.length === 0) {
    return sendApiError(res, 'userIds must be a non-empty string array', 400);
  }

  let currentMemberCount = 0;
  // INVARIANT: max_teachers is enforced at POST time, not just on render.
  // This prevents stale pages from bypassing the capacity check.
  if (community.max_teachers != null) {
    const { count, error: countError } = await supabase
      .from('user_roles')
      .select('id', { count: 'exact', head: true })
      .eq('community_id', community.id)
      .eq('is_active', true);

    if (countError) {
      return sendApiError(res, 'Failed to count members', 500, countError.message);
    }

    currentMemberCount = count ?? 0;
    if (currentMemberCount + userIds.length > community.max_teachers) {
      return res.status(400).json({
        error: 'exceeds_max',
        currentMemberCount,
        maxTeachers: community.max_teachers,
      });
    }
  }

  // Only consider rows in this community's school. Rows from other schools
  // are intentionally invisible to this endpoint. ORDER BY id matches the GET
  // path so chooseBestRow picks the same row the admin saw in the UI.
  const { data: schoolRoles, error: rolesError } = await supabase
    .from('user_roles')
    .select('id, user_id, role_type, school_id, generation_id, community_id, is_active')
    .eq('school_id', community.school_id)
    .eq('is_active', true)
    .in('user_id', userIds)
    .order('id', { ascending: true });

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
  const skipped: Array<{ userId: string; reason: SkipReason }> = [];
  const chosenRows: Array<{ user_id: string; row: RoleRow }> = [];

  for (const userId of userIds) {
    const userRows = rowsByUser.get(userId) ?? [];
    if (userRows.length === 0) {
      skipped.push({ userId, reason: 'no_eligible_role' });
      continue;
    }

    if (userRows.some((r) => r.community_id === community.id)) {
      skipped.push({ userId, reason: 'already_in_community' });
      continue;
    }

    const chosen = chooseBestRow(userRows);
    if (!chosen) {
      skipped.push({ userId, reason: 'no_eligible_role' });
      continue;
    }

    // INVARIANT: never modify a lider_comunidad row, period. Even when
    // community_id is null, binding it via this UI would promote the user
    // to leader. Leadership flows live in role-management.
    if (chosen.role_type === 'lider_comunidad') {
      skipped.push({ userId, reason: 'is_leader' });
      continue;
    }

    if (
      community.generation_id &&
      chosen.generation_id &&
      chosen.generation_id !== community.generation_id
    ) {
      skipped.push({ userId, reason: 'generation_mismatch' });
      continue;
    }

    chosenRows.push({ user_id: userId, row: chosen });
  }

  const rowIdsToUpdate = chosenRows.map((c) => c.row.id);
  // INVARIANT: exactly one user_roles row is updated per user. Do not expand
  // this to all rows for a user; the chosen row is the contract.
  if (rowIdsToUpdate.length > 0) {
    const { error: bindError } = await supabase
      .from('user_roles')
      .update({ community_id: community.id })
      .in('id', rowIdsToUpdate);
    if (bindError) {
      return sendApiError(res, 'Failed to update roles', 500, bindError.message);
    }
  }

  const idsNeedingGeneration = chosenRows
    .filter((c) => community.generation_id != null && c.row.generation_id == null)
    .map((c) => c.row.id);
  // INVARIANT: generation_id is filled if NULL, never overwritten.
  if (idsNeedingGeneration.length > 0) {
    const { error: generationError } = await supabase
      .from('user_roles')
      .update({ generation_id: community.generation_id })
      .in('id', idsNeedingGeneration)
      .is('generation_id', null);
    if (generationError) {
      return sendApiError(res, 'Failed to backfill generation', 500, generationError.message);
    }
  }

  return res.status(200).json({
    assigned: rowIdsToUpdate.length,
    skipped,
  });
}

async function handleDelete(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const context = await getAdminContext(req, res);
  if (!context) return;
  const { supabase, community } = context;

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
    return res.status(400).json({
      error: 'is_leader_remove_blocked',
      message: 'Reasigna el liderazgo antes de remover este usuario.',
    });
  }

  const rowToRemove = chooseBestByRoleType(matches);
  if (!rowToRemove) {
    return res.status(404).json({ error: 'no_membership' });
  }

  const { error: updateError } = await supabase
    .from('user_roles')
    .update({ community_id: null })
    .in('id', [rowToRemove.id]);

  if (updateError) {
    return sendApiError(res, 'Failed to remove member', 500, updateError.message);
  }

  return res.status(200).json({ removed: 1 });
}
