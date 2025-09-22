import type { NextApiRequest, NextApiResponse } from 'next';
import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ROLE_PRIORITY = ['admin','consultor','equipo_directivo','supervisor_de_red','community_manager','lider_generacion','lider_comunidad','docente'];

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const userId = req.query.userId as string;
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const supabaseClient = createServerSupabaseClient({ req, res });
    const { data: { session }, error: sessionError } = await supabaseClient.auth.getSession();
    if (sessionError || !session) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const supabaseService = createClient(supabaseUrl, supabaseServiceKey);

    const { data: adminCheck } = await supabaseService
      .from('user_roles')
      .select('id')
      .eq('user_id', session.user.id)
      .eq('role_type', 'admin')
      .eq('is_active', true)
      .limit(1);

    if (!adminCheck || adminCheck.length === 0) {
      return res.status(403).json({ error: 'Solo administradores pueden ver roles' });
    }

    const { data: rolesData, error } = await supabaseService
      .from('user_roles')
      .select(`
        *,
        school:schools(*),
        generation:generations(*),
        community:growth_communities(*, school:schools(*), generation:generations(*))
      `)
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('assigned_at', { ascending: false, nullsLast: true })
      .order('role_type', { ascending: true });

    if (error) {
      console.error('[user-roles API] Error fetching roles:', error);
      return res.status(500).json({ error: 'Error al obtener roles' });
    }

    const sortedRoles = (rolesData || []).sort((a, b) => {
      const aIndex = ROLE_PRIORITY.indexOf(a.role_type);
      const bIndex = ROLE_PRIORITY.indexOf(b.role_type);
      return (aIndex === -1 ? 99 : aIndex) - (bIndex === -1 ? 99 : bIndex);
    });

    const highestRole = sortedRoles[0]?.role_type || null;

    return res.status(200).json({
      roles: sortedRoles,
      highestRole,
    });
  } catch (error) {
    console.error('[user-roles API] Unexpected error:', error);
    return res.status(500).json({ error: 'Error inesperado al obtener roles' });
  }
}
