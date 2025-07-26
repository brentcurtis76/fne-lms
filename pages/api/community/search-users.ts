import { NextApiRequest, NextApiResponse } from 'next';
import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';

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

    // Now get the actual user profiles
    let usersQuery = supabaseServerClient
      .from('profiles')
      .select('id, first_name, last_name, email, avatar_url')
      .in('id', communityUserIds)
      .eq('approval_status', 'approved')

    // Apply search filter if query is provided
    if (searchQuery) {
      usersQuery = usersQuery.or(
        `first_name.ilike.%${searchQuery}%,last_name.ilike.%${searchQuery}%,email.ilike.%${searchQuery}%`
      );
    }

    // Limit results
    usersQuery = usersQuery.limit(10);

    const { data: users, error: usersError } = await usersQuery;

    if (usersError) {
      console.error('Error fetching users:', usersError);
      return res.status(500).json({ error: 'Failed to fetch users' });
    }

    // Format the response
    const formattedUsers = (users || []).map(user => ({
      id: user.id,
      display_name: `${user.first_name || ''} ${user.last_name || ''}`.trim(),
      avatar_url: user.avatar_url,
      email: user.email,
    }));

    return res.status(200).json(formattedUsers);
  } catch (error) {
    console.error('Error in search-users API:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}