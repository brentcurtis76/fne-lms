import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

// Create admin client with service role
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

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get the authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'No authorization token provided' });
    }

    // Verify the user is an admin
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    
    if (authError || !user) {
      return res.status(401).json({ error: 'Invalid authorization token' });
    }

    // Check if user is admin
    const { data: userRoles } = await supabaseAdmin
      .from('user_roles')
      .select('role_type')
      .eq('user_id', user.id)
      .eq('role_type', 'admin');

    if (!userRoles || userRoles.length === 0) {
      return res.status(403).json({ error: 'Unauthorized. Only admins can access this.' });
    }

    // BYPASS THE BROKEN API - Query auth.users directly via SQL
    const { data: allUsers, error: queryError } = await supabaseAdmin.rpc('get_all_auth_users', {});
    
    if (queryError) {
      // Fallback to direct query if RPC doesn't exist
      const { data: users, error: directError } = await supabaseAdmin
        .from('profiles')
        .select(`
          id,
          email,
          first_name,
          last_name,
          name,
          school_id,
          approval_status,
          created_at,
          schools!school_id (
            id,
            name
          )
        `)
        .order('created_at', { ascending: false });

      if (directError) {
        throw directError;
      }

      // Get auth user data for these profiles
      const { data: authResponse } = await supabaseAdmin.auth.admin.listUsers();
      const authUsersMap = new Map(authResponse.users.map(u => [u.id, u]));

      // Merge profile and auth data
      const mergedUsers = users.map(profile => {
        const authUser = authUsersMap.get(profile.id);
        return {
          ...profile,
          email_confirmed: authUser?.email_confirmed_at ? true : false,
          last_sign_in: authUser?.last_sign_in_at,
          created_at: authUser?.created_at || profile.created_at
        };
      });

      return res.status(200).json({
        users: mergedUsers,
        total: mergedUsers.length,
        source: 'profiles_table'
      });
    }

    return res.status(200).json({
      users: allUsers,
      total: allUsers.length,
      source: 'direct_auth_query'
    });

  } catch (error: any) {
    console.error('Error fetching users directly:', error);
    return res.status(500).json({ 
      error: error.message || 'Failed to fetch users'
    });
  }
}