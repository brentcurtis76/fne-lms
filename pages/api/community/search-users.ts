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

    // Get the user's community/workspace
    // First, get the user's community
    const { data: userProfile, error: profileError } = await supabaseServerClient
      .from('profiles')
      .select('community_id')
      .eq('id', user.id)
      .single();

    if (profileError || !userProfile?.community_id) {
      return res.status(400).json({ error: 'User not assigned to a community' });
    }

    // Search for users in the same community
    let usersQuery = supabaseServerClient
      .from('profiles')
      .select('id, first_name, last_name, email, avatar_url, role')
      .eq('community_id', userProfile.community_id)
      .eq('is_active', true)
      .neq('id', user.id); // Don't include the current user

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
      display_name: `${user.first_name} ${user.last_name}`.trim(),
      avatar_url: user.avatar_url,
      role: user.role,
      email: user.email,
    }));

    return res.status(200).json(formattedUsers);
  } catch (error) {
    console.error('Error in search-users API:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}