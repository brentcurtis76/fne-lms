import type { NextApiRequest, NextApiResponse } from 'next';
import { requireVerifiedCaller } from '@/lib/api-auth';
import { createClient } from '@supabase/supabase-js';
import { rolePriorityIndex } from '../../../utils/roleUtils';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/**
 * API endpoint for authenticated users to fetch their own roles
 * Uses service role key to bypass RLS restrictions
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Cookie or Bearer, verified with the auth server, plus the
    // forced-password gate (this route is behind it). The cookie's stored
    // `user` is client-controlled and never used (SM-B015).
    const caller = await requireVerifiedCaller(req, res);
    if (!caller.user) {
      return res.status(caller.status).json(caller.body);
    }
    const userId = caller.user.id;

    // Use service role to bypass RLS
    const supabaseService = createClient(supabaseUrl, supabaseServiceKey);

    const { data: rolesData, error } = await supabaseService
      .from('user_roles')
      .select(`
        *,
        school:schools(*),
        generation:generations(*),
        community:growth_communities(*)
      `)
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('role_type');

    if (error) {
      console.error('[my-roles API] Error fetching roles:', error);
      return res.status(500).json({ error: 'Error al obtener roles' });
    }

    // Sort by role priority (shared canonical precedence from roleUtils)
    const sortedRoles = (rolesData || []).sort(
      (a, b) => rolePriorityIndex(a.role_type) - rolePriorityIndex(b.role_type)
    );

    const highestRole = sortedRoles[0]?.role_type || null;

    console.log('[my-roles API] Returning roles:', {
      userId,
      roleCount: sortedRoles.length,
      roles: sortedRoles.map(r => r.role_type),
      highestRole
    });

    return res.status(200).json({
      roles: sortedRoles,
      highestRole,
      userId
    });
  } catch (error) {
    console.error('[my-roles API] Unexpected error:', error);
    return res.status(500).json({ error: 'Error inesperado' });
  }
}
