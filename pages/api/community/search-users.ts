import { NextApiRequest, NextApiResponse } from 'next';
import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';
import { createServiceRoleClient } from '../../../lib/api-auth';
import { fetchAssignedSchoolIds } from '../../../lib/consultor-assigned-schools';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Lower case without accents, so «nunez» finds «Núñez»; hyphens and dots are kept. */
function foldForSearch(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Create authenticated Supabase Client
    const supabaseServerClient = createServerSupabaseClient({
      req,
      res,
    });

    // Check if we have a session
    const {
      data: { user },
    } = await supabaseServerClient.auth.getUser();

    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { q: query = '' } = req.query;
    const searchQuery = String(query).toLowerCase().trim();

    // F12e N97: the composer names the workspace it is in; answer for THAT
    // community only. Without workspace_id: the path below, as before.
    if (req.query.workspace_id !== undefined) {
      return await searchInWorkspace(req, res, supabaseServerClient, user.id, searchQuery);
    }

    // Get the user's active community roles
    const { data: userRoles, error: rolesError } = await supabaseServerClient
      .from('user_roles')
      .select('community_id')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .not('community_id', 'is', null);

    if (rolesError || !userRoles || userRoles.length === 0) {
      return res.status(400).json({ error: 'User not assigned to a community' });
    }

    // Get all community IDs the user belongs to
    const userCommunityIds = userRoles.map(role => role.community_id);

    // Search for users in the same communities
    // First get user IDs from user_roles in the same communities
    const { data: communityUsers, error: communityUsersError } = await supabaseServerClient
      .from('user_roles')
      .select('user_id')
      .in('community_id', userCommunityIds)
      .eq('is_active', true)
      .neq('user_id', user.id);

    if (communityUsersError) {
      console.error('Error fetching community users:', communityUsersError);
      return res.status(500).json({ error: 'Failed to fetch community users' });
    }

    const communityUserIds = [...new Set(communityUsers?.map(cu => cu.user_id) || [])];

    if (communityUserIds.length === 0) {
      return res.status(200).json([]);
    }

    // Who may be offered is decided here, on the server: co-members whose
    // profile is approved, as before EC-S5 (send-back 1, 5). Other people's
    // profile rows are not readable with the caller's session, so the lookup
    // uses the service client and asks only for the columns returned — never
    // an e-mail or the approval status.
    const { data: approved, error: approvedError } = await createServiceRoleClient()
      .from('profiles')
      .select('id, first_name, last_name, avatar_url')
      .in('id', communityUserIds)
      .eq('approval_status', 'approved');

    if (approvedError) {
      console.error('Error fetching users');
      return res.status(500).json({ error: 'Failed to fetch users' });
    }

    const byId = new Map(
      ((approved || []) as Array<{ id: string; first_name: string | null; last_name: string | null; avatar_url: string | null }>)
        .map((person) => [person.id, person])
    );
    const wanted = foldForSearch(searchQuery);
    const formattedUsers = communityUserIds
      .map((id) => byId.get(id))
      .filter((person): person is NonNullable<typeof person> => Boolean(person))
      .map((person) => ({
        id: person.id,
        first_name: person.first_name,
        last_name: person.last_name,
        avatar_url: person.avatar_url,
        display_name: `${person.first_name || ''} ${person.last_name || ''}`.trim(),
      }))
      .filter((user) => !wanted || foldForSearch(user.display_name).includes(wanted))
      .slice(0, 10);

    return res.status(200).json(formattedUsers);
  } catch (error) {
    console.error('Error in search-users API:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
/**
 * F12e N97: search within the community of one workspace. Accepted: an admin,
 * a person with an active role row in that community, or a consultor currently
 * assigned to the community's school (asked with the caller's own session).
 * The people are listed exactly as the path above lists them (active role in
 * the community, approved profile, not the caller, the same fields, no e-mail,
 * the same text filter and limit). A member reads the community's role rows
 * with their own session, as above; an admin or an assigned consultor is not a
 * co-member, so for them those rows are read with the service client.
 */
async function searchInWorkspace(
  req: NextApiRequest,
  res: NextApiResponse,
  supabaseServerClient: ReturnType<typeof createServerSupabaseClient>,
  userId: string,
  searchQuery: string
) {
  const rawWorkspaceId = req.query.workspace_id;
  const workspaceId = typeof rawWorkspaceId === 'string' ? rawWorkspaceId : '';
  if (!UUID_RE.test(workspaceId)) {
    return res.status(400).json({ error: 'Invalid workspace_id' });
  }

  const serviceClient = createServiceRoleClient();

  const { data: workspace, error: workspaceError } = await serviceClient
    .from('community_workspaces')
    .select('id, community_id')
    .eq('id', workspaceId)
    .maybeSingle();
  if (workspaceError) {
    console.error('Error fetching workspace');
    return res.status(500).json({ error: 'Failed to fetch workspace' });
  }
  const communityId = (workspace as { community_id?: string | null } | null)?.community_id;
  if (!communityId) {
    return res.status(404).json({ error: 'Workspace not found' });
  }

  const { data: callerRoles, error: callerRolesError } = await serviceClient
    .from('user_roles')
    .select('role_type, community_id')
    .eq('user_id', userId)
    .eq('is_active', true);
  if (callerRolesError) {
    console.error('Error fetching caller roles');
    return res.status(500).json({ error: 'Failed to verify permissions' });
  }
  const roles = (callerRoles || []) as Array<{ role_type: string; community_id: string | null }>;
  const isAdmin = roles.some((r) => r.role_type === 'admin');
  const isMember = roles.some((r) => r.community_id === communityId);

  let isAssignedConsultor = false;
  if (!isAdmin && !isMember && roles.some((r) => r.role_type === 'consultor')) {
    const { data: community } = await serviceClient
      .from('growth_communities')
      .select('school_id')
      .eq('id', communityId)
      .maybeSingle();
    const schoolId = (community as { school_id?: number | string | null } | null)?.school_id;
    if (schoolId !== null && schoolId !== undefined) {
      const assigned = await fetchAssignedSchoolIds(supabaseServerClient);
      isAssignedConsultor = assigned.includes(Number(schoolId));
    }
  }

  if (!isAdmin && !isMember && !isAssignedConsultor) {
    return res.status(403).json({ error: 'No access to this community' });
  }

  const rolesReader = isMember ? supabaseServerClient : serviceClient;
  const { data: communityUsers, error: communityUsersError } = await rolesReader
    .from('user_roles')
    .select('user_id')
    .eq('community_id', communityId)
    .eq('is_active', true)
    .neq('user_id', userId);

  if (communityUsersError) {
    console.error('Error fetching community users');
    return res.status(500).json({ error: 'Failed to fetch community users' });
  }

  const communityUserIds = [...new Set((communityUsers || []).map((cu: { user_id: string }) => cu.user_id))];
  if (communityUserIds.length === 0) {
    return res.status(200).json([]);
  }

  const { data: approved, error: approvedError } = await serviceClient
    .from('profiles')
    .select('id, first_name, last_name, avatar_url')
    .in('id', communityUserIds)
    .eq('approval_status', 'approved');

  if (approvedError) {
    console.error('Error fetching users');
    return res.status(500).json({ error: 'Failed to fetch users' });
  }

  const byId = new Map(
    ((approved || []) as Array<{ id: string; first_name: string | null; last_name: string | null; avatar_url: string | null }>)
      .map((person) => [person.id, person])
  );
  const wanted = foldForSearch(searchQuery);
  const formattedUsers = communityUserIds
    .map((id) => byId.get(id))
    .filter((person): person is NonNullable<typeof person> => Boolean(person))
    .map((person) => ({
      id: person.id,
      first_name: person.first_name,
      last_name: person.last_name,
      avatar_url: person.avatar_url,
      display_name: `${person.first_name || ''} ${person.last_name || ''}`.trim(),
    }))
    .filter((found) => !wanted || foldForSearch(found.display_name).includes(wanted))
    .slice(0, 10);

  return res.status(200).json(formattedUsers);
}
