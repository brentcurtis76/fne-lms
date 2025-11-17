import { NextApiRequest, NextApiResponse } from 'next';
import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const supabase = createPagesServerClient({ req, res });

  try {
    // Check authentication
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
      return res.status(401).json({ error: 'No autorizado' });
    }

    // Check if user has permission to view quotes
    const { data: userRole } = await supabase
      .from('user_roles')
      .select('role_type')
      .eq('user_id', session.user.id)
      .eq('is_active', true)
      .in('role_type', ['admin', 'consultor', 'community_manager'])
      .single();

    if (!userRole) {
      return res.status(403).json({ error: 'No tienes permisos para ver cotizaciones' });
    }

    // Get filter parameters
    const { status, search, from_date, to_date, sort_by, sort_order } = req.query;

    // Build query
    let query = supabase
      .from('pasantias_quotes')
      .select(`
        *,
        created_by:profiles!pasantias_quotes_created_by_fkey(
          id,
          first_name,
          last_name,
          email
        )
      `);

    // Apply filters
    if (status && status !== 'all') {
      query = query.eq('status', status);
    }

    if (search) {
      query = query.or(`
        client_name.ilike.%${search}%,
        client_email.ilike.%${search}%,
        client_institution.ilike.%${search}%
      `);
    }

    if (from_date) {
      query = query.gte('created_at', from_date);
    }

    if (to_date) {
      query = query.lte('created_at', to_date);
    }

    // Apply sorting
    const sortColumn = (sort_by || 'created_at') as string;
    const sortDirection = sort_order === 'asc';
    query = query.order(sortColumn, { ascending: sortDirection });

    const { data: quotes, error } = await query;

    if (error) {
      console.error('Error fetching quotes:', error);
      return res.status(500).json({ 
        error: 'Error al obtener las cotizaciones',
        details: error.message 
      });
    }

    // Get summary statistics
    const stats = {
      total: quotes?.length || 0,
      draft: quotes?.filter(q => q.status === 'draft').length || 0,
      sent: quotes?.filter(q => q.status === 'sent').length || 0,
      viewed: quotes?.filter(q => q.status === 'viewed').length || 0,
      accepted: quotes?.filter(q => q.status === 'accepted').length || 0,
      rejected: quotes?.filter(q => q.status === 'rejected').length || 0,
      expired: quotes?.filter(q => q.status === 'expired').length || 0,
      total_value: quotes?.reduce((sum, q) => sum + (q.grand_total || 0), 0) || 0
    };

    return res.status(200).json({ 
      quotes: quotes || [],
      stats
    });

  } catch (error) {
    console.error('Error in list quotes API:', error);
    return res.status(500).json({ 
      error: 'Error interno del servidor',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}