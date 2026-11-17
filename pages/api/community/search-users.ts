import { NextApiRequest, NextApiResponse } from 'next';
import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';
import { createServiceRoleClient } from '../../../lib/api-auth';

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