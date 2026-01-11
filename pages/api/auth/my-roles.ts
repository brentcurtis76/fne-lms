import type { NextApiRequest, NextApiResponse } from 'next';
import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const ROLE_PRIORITY = [
  'admin',
  'consultor',
  'equipo_directivo',
  'lider_generacion',
  'lider_comunidad',
  'supervisor_de_red',
  'community_manager',
  'docente'
];

/**
 * API endpoint for authenticated users to fetch their own roles
 * Uses service role key to bypass RLS restrictions
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    let userId: string;

    // Check for Bearer token in Authorization header first
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.replace('Bearer ', '');
      const supabaseService = createClient(supabaseUrl, supabaseServiceKey);
      const { data: { user }, error } = await supabaseService.auth.getUser(token);

      if (error || !user) {
        console.log('[my-roles API] Bearer token auth failed:', error?.message);
        return res.status(401).json({ error: 'No autorizado' });
      }

      userId = user.id;
      console.log('[my-roles API] User authenticated via Bearer:', { userId, email: user.email });
    } else {
      // Fall back to session-based auth
      const supabaseClient = createPagesServerClient({ req, res });
      const { data: { session }, error: sessionError } = await supabaseClient.auth.getSession();

      if (sessionError || !session) {
        console.log('[my-roles API] Session check failed:', {
          error: sessionError?.message,
          hasSession: !!session
        });
        return res.status(401).json({ error: 'No autorizado' });
      }

      userId = session.user.id;
      console.log('[my-roles API] User authenticated via session:', { userId, email: session.user.email });
    }

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

    // Sort by role priority
    const sortedRoles = (rolesData || []).sort((a, b) => {
      const aIndex = ROLE_PRIORITY.indexOf(a.role_type);
      const bIndex = ROLE_PRIORITY.indexOf(b.role_type);
      return (aIndex === -1 ? 99 : aIndex) - (bIndex === -1 ? 99 : bIndex);
    });

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
