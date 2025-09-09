import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

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
  if (req.method !== 'POST') {
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

    // 1. Show the issues first
    const { data: issueCount } = await supabaseAdmin
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .like('email', '%@colegiosantamartavaldivia.cl')
      .or('school_id.is.null,school_id.eq.0');

    console.log(`Users without school assignment: ${issueCount || 0}`);

    // 2. Fix: Assign all Santa Marta emails to Santa Marta school (ID: 3)
    const { error: updateError } = await supabaseAdmin
      .from('profiles')
      .update({ school_id: 3 })
      .like('email', '%@colegiosantamartavaldivia.cl')
      .or('school_id.is.null,school_id.eq.0');

    if (updateError) {
      console.error('Error updating school assignments:', updateError);
      throw updateError;
    }

    // 3. Check for duplicate role entries
    const { data: duplicateRoles } = await supabaseAdmin.rpc('get_duplicate_santa_marta_roles');

    // 4. Remove duplicate roles if any exist
    if (duplicateRoles && duplicateRoles.length > 0) {
      // For each user with duplicates, keep only one role
      for (const dup of duplicateRoles) {
        // Get all roles for this user
        const { data: userRoleEntries } = await supabaseAdmin
          .from('user_roles')
          .select('id')
          .eq('user_id', dup.user_id)
          .order('created_at', { ascending: true });

        if (userRoleEntries && userRoleEntries.length > 1) {
          // Keep the first one, delete the rest
          const idsToDelete = userRoleEntries.slice(1).map(r => r.id);
          
          const { error: deleteError } = await supabaseAdmin
            .from('user_roles')
            .delete()
            .in('id', idsToDelete);

          if (deleteError) {
            console.error(`Error deleting duplicate roles for user ${dup.user_id}:`, deleteError);
          }
        }
      }
    }

    // 5. Get final count of unique Santa Marta users
    const { data: finalUsers } = await supabaseAdmin.rpc('get_all_auth_users');
    const santaMartaUsers = finalUsers?.filter((u: any) => 
      u.email?.includes('@colegiosantamartavaldivia.cl')
    ) || [];

    return res.status(200).json({
      success: true,
      message: `Santa Marta data fixed successfully`,
      stats: {
        usersWithoutSchool: issueCount || 0,
        duplicateRolesFound: duplicateRoles?.length || 0,
        totalSantaMartaUsers: santaMartaUsers.length,
        santaMartaUsersWithSchool: santaMartaUsers.filter((u: any) => u.school_id === 3).length
      }
    });

  } catch (error: any) {
    console.error('Error fixing Santa Marta data:', error);
    return res.status(500).json({ 
      error: error.message || 'Failed to fix Santa Marta data'
    });
  }
}