import { NextApiRequest, NextApiResponse } from 'next';
import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';
import { fetchProfileCards, type ProfileCard } from '../../../lib/profile-cards';

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

    // Names through the profile cards (EC-S5): other people's profile rows are
    // not readable with the caller's session. A card carries id, names and
    // picture only — the answer never includes an e-mail.
    const cards = await fetchProfileCards(supabaseServerClient, communityUserIds);
    const wanted = foldForSearch(searchQuery);
    const formattedUsers = communityUserIds
      .map((id) => cards.get(id))
      .filter((card): card is ProfileCard => Boolean(card))
      .map((card) => ({
        id: card.id,
        first_name: card.first_name,
        last_name: card.last_name,
        avatar_url: card.avatar_url,
        display_name: `${card.first_name || ''} ${card.last_name || ''}`.trim(),
      }))
      .filter((user) => !wanted || foldForSearch(user.display_name).includes(wanted))
      .slice(0, 10);

    return res.status(200).json(formattedUsers);
  } catch (error) {
    console.error('Error in search-users API:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}