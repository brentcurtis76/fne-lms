import { NextApiRequest, NextApiResponse } from 'next';
import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const supabase = createPagesServerClient({ req, res });
  const { id } = req.query;

  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'ID de cotización inválido' });
  }

  switch (req.method) {
    case 'GET':
      return handleGet(supabase, id, req, res);
    case 'PUT':
      return handleUpdate(supabase, id, req, res);
    case 'DELETE':
      return handleDelete(supabase, id, req, res);
    default:
      return res.status(405).json({ error: 'Método no permitido' });
  }
}

async function handleGet(supabase: any, id: string, req: NextApiRequest, res: NextApiResponse) {
  try {
    // Get the quote with program details
    const { data: quote, error } = await supabase
      .from('pasantias_quotes')
      .select(`
        *,
        created_by:profiles!pasantias_quotes_created_by_fkey(
          id,
          first_name,
          last_name,
          email
        )
      `)
      .eq('id', id)
      .single();

    if (error || !quote) {
      return res.status(404).json({ error: 'Cotización no encontrada' });
    }

    // Get program details for selected programs
    let programs = [];
    if (quote.selected_programs && quote.selected_programs.length > 0) {
      const { data: programData } = await supabase
        .from('pasantias_programs')
        .select('*')
        .in('id', quote.selected_programs)
        .eq('is_active', true)
        .order('display_order');
      
      programs = programData || [];
    }

    // Get travel groups if using groups system
    let groups = [];
    if (quote.use_groups) {
      const { data: groupsData } = await supabase
        .from('pasantias_quote_groups')
        .select('*')
        .eq('quote_id', id)
        .order('arrival_date', { ascending: true });
      
      groups = groupsData || [];
    }

    // Mark as viewed if it's the first time (for public views)
    if (quote.status === 'sent' && !quote.viewed_at) {
      await supabase
        .from('pasantias_quotes')
        .update({ 
          viewed_at: new Date().toISOString(),
          status: 'viewed'
        })
        .eq('id', id);
    }

    return res.status(200).json({ 
      quote: {
        ...quote,
        programs,
        groups
      }
    });

  } catch (error) {
    console.error('Error fetching quote:', error);
    return res.status(500).json({ 
      error: 'Error al obtener la cotización',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

async function handleUpdate(supabase: any, id: string, req: NextApiRequest, res: NextApiResponse) {
  try {
    console.log('[UPDATE] Starting quote update for ID:', id);
    
    // Check authentication
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
      console.log('[UPDATE] No session found');
      return res.status(401).json({ error: 'No autorizado' });
    }
    
    console.log('[UPDATE] User ID:', session.user.id);

    // Create service role client to bypass RLS
    const serviceSupabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    // Check if user has permission using service role to bypass RLS
    const { data: userRoles, error: rolesError } = await serviceSupabase
      .from('user_roles')
      .select('role_type')
      .eq('user_id', session.user.id)
      .eq('is_active', true)
      .in('role_type', ['admin', 'consultor', 'community_manager']);

    console.log('[UPDATE] User roles:', userRoles);
    console.log('[UPDATE] Roles error:', rolesError);

    if (!userRoles || userRoles.length === 0) {
      console.log('[UPDATE] No valid roles found');
      return res.status(403).json({ error: 'No tienes permisos para editar cotizaciones' });
    }

    // Check if the quote exists and user can access it using service role
    const { data: existingQuote, error: checkError } = await serviceSupabase
      .from('pasantias_quotes')
      .select('id, created_by')
      .eq('id', id)
      .single();
    
    if (checkError || !existingQuote) {
      console.error('[UPDATE] Quote not found:', checkError);
      return res.status(404).json({ 
        error: 'Cotización no encontrada'
      });
    }
    
    // Check if user owns the quote or is admin
    const isAdmin = userRoles.some((r: any) => r.role_type === 'admin');
    if (!isAdmin && existingQuote.created_by !== session.user.id) {
      console.error('[UPDATE] User does not own quote and is not admin');
      return res.status(403).json({ 
        error: 'Solo puedes editar tus propias cotizaciones'
      });
    }

    const updateData = {
      ...req.body,
      updated_by: session.user.id,
      updated_at: new Date().toISOString()
    };

    // Remove fields that shouldn't be updated directly
    delete updateData.id;
    delete updateData.created_at;
    delete updateData.created_by;

    console.log('[UPDATE] Updating with data keys:', Object.keys(updateData));
    
    // Update the quote using service role to bypass RLS
    const { data: quote, error } = await serviceSupabase
      .from('pasantias_quotes')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[UPDATE] Error updating quote:', error);
      console.error('[UPDATE] Error details:', {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint
      });
      return res.status(500).json({ 
        error: 'Error al actualizar la cotización',
        details: error.message 
      });
    }
    
    if (!quote) {
      console.error('[UPDATE] No quote was updated');
      return res.status(404).json({ 
        error: 'No se pudo actualizar la cotización'
      });
    }
    
    console.log('[UPDATE] Quote updated successfully');

    // Log activity using service role
    await serviceSupabase
      .from('activity_logs')
      .insert({
        user_id: session.user.id,
        action: 'update_quote',
        resource_type: 'pasantias_quote',
        resource_id: id,
        details: {
          changes: Object.keys(req.body)
        }
      });

    return res.status(200).json({ 
      success: true,
      quote 
    });

  } catch (error) {
    console.error('Error updating quote:', error);
    return res.status(500).json({ 
      error: 'Error interno del servidor',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

async function handleDelete(supabase: any, id: string, req: NextApiRequest, res: NextApiResponse) {
  try {
    // Check authentication
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
      return res.status(401).json({ error: 'No autorizado' });
    }

    // Create service role client to bypass RLS
    const serviceSupabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    // Check if user can delete quotes using service role
    const { data: userRole } = await serviceSupabase
      .from('user_roles')
      .select('role_type')
      .eq('user_id', session.user.id)
      .eq('is_active', true)
      .in('role_type', ['admin', 'consultor', 'community_manager']);

    if (!userRole || userRole.length === 0) {
      return res.status(403).json({ error: 'No tienes permisos para eliminar cotizaciones' });
    }
    
    // Check if the user owns the quote or is an admin using service role
    const isAdmin = userRole.some((r: any) => r.role_type === 'admin');
    if (!isAdmin) {
      const { data: quote } = await serviceSupabase
        .from('pasantias_quotes')
        .select('created_by')
        .eq('id', id)
        .single();
        
      if (!quote || quote.created_by !== session.user.id) {
        return res.status(403).json({ error: 'Solo puedes eliminar tus propias cotizaciones' });
      }
    }

    // Delete using service role to bypass RLS
    const { error } = await serviceSupabase
      .from('pasantias_quotes')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting quote:', error);
      return res.status(500).json({ 
        error: 'Error al eliminar la cotización',
        details: error.message 
      });
    }

    // Log activity using service role
    await serviceSupabase
      .from('activity_logs')
      .insert({
        user_id: session.user.id,
        action: 'delete_quote',
        resource_type: 'pasantias_quote',
        resource_id: id
      });

    return res.status(200).json({ 
      success: true,
      message: 'Cotización eliminada correctamente'
    });

  } catch (error) {
    console.error('Error deleting quote:', error);
    return res.status(500).json({ 
      error: 'Error interno del servidor',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}