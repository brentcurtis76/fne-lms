import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { createApiSupabaseClient, requireVerifiedCaller } from '@/lib/api-auth';
import { hasAdminPrivileges } from '@/utils/roleUtils';

// Service role client to bypass RLS
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Verify the requesting user is authenticated
    const sessionClient = await createApiSupabaseClient(req, res);
    // Identity comes from the auth server; the cookie's stored `user` is
    // client-controlled (SM-B015).
    const caller = await requireVerifiedCaller(req, res);
    if (!caller.user) {
      return res.status(caller.status).json(caller.body);
    }

    const { userId } = req.query;
    if (!userId || typeof userId !== 'string') {
      return res.status(400).json({ error: 'User ID is required' });
    }

    // Only the person themself or an active admin learns a person's school.
    // Anyone else gets the answer an unknown id gets, before any read of the
    // person's school (F11 send-back 3, X2).
    if (caller.user.id !== userId && !(await hasAdminPrivileges(supabaseAdmin, caller.user.id))) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    // Get user's school from user_roles (authoritative source)
    const { data: userRoles, error: rolesError } = await supabaseAdmin
      .from('user_roles')
      .select('school_id')
      .eq('user_id', userId)
      .eq('is_active', true)
      .not('school_id', 'is', null)
      .limit(1);

    if (rolesError) {
      console.error('Error fetching user roles:', rolesError);
      return res.status(500).json({ error: 'Failed to fetch user roles' });
    }

    if (!userRoles || userRoles.length === 0 || !userRoles[0].school_id) {
      return res.status(200).json({ school_name: null });
    }

    // Get school name
    const { data: school, error: schoolError } = await supabaseAdmin
      .from('schools')
      .select('name')
      .eq('id', userRoles[0].school_id)
      .single();

    if (schoolError) {
      console.error('Error fetching school:', schoolError);
      return res.status(500).json({ error: 'Failed to fetch school' });
    }

    return res.status(200).json({ school_name: school?.name || null });

  } catch (error) {
    console.error('Error in user school API:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
