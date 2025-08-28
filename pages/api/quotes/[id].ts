import { NextApiRequest, NextApiResponse } from 'next';
import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';

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
    // Check authentication
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
      return res.status(401).json({ error: 'No autorizado' });
    }

    // Check if user has permission
    const { data: userRole } = await supabase
      .from('user_roles')
      .select('role_type')
      .eq('user_id', session.user.id)
      .eq('is_active', true)
      .in('role_type', ['admin', 'consultor'])
      .single();

    if (!userRole) {
      return res.status(403).json({ error: 'No tienes permisos para editar cotizaciones' });
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

    const { data: quote, error } = await supabase
      .from('pasantias_quotes')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating quote:', error);
      return res.status(500).json({ 
        error: 'Error al actualizar la cotización',
        details: error.message 
      });
    }

    // Log activity
    await supabase
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

    // Check if user is admin
    const { data: userRole } = await supabase
      .from('user_roles')
      .select('role_type')
      .eq('user_id', session.user.id)
      .eq('is_active', true)
      .eq('role_type', 'admin')
      .single();

    if (!userRole) {
      return res.status(403).json({ error: 'Solo los administradores pueden eliminar cotizaciones' });
    }

    const { error } = await supabase
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

    // Log activity
    await supabase
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