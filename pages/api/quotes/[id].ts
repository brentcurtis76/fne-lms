import { NextApiRequest, NextApiResponse } from 'next';
import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';
import { requireVerifiedCaller } from '../../../lib/api-auth';

const EDITABLE_QUOTE_FIELDS = [
  'client_name', 'client_email', 'client_phone', 'client_institution',
  'arrival_date', 'departure_date', 'flight_price', 'flight_notes',
  'room_type', 'single_room_price', 'double_room_price', 'num_pasantes',
  'selected_programs', 'apply_early_bird_discount', 'early_bird_payment_date',
  'viaticos_type', 'viaticos_amount', 'viaticos_total', 'viaticos_display_amount',
  'notes', 'internal_notes', 'status', 'valid_until', 'use_groups',
  'grand_total', 'total_per_person',
] as const;

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
    
    // Identity comes from the auth server; the cookie's stored `user` is
    // client-controlled (SM-B015).
    const caller = await requireVerifiedCaller(req, res);
    if (!caller.user) {
      return res.status(caller.status).json(caller.body);
    }
    const userId = caller.user.id;
    console.log('[UPDATE] User ID:', userId);

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
      .eq('user_id', userId)
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
      .select('id, created_by, status')
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
    if (!isAdmin && existingQuote.created_by !== userId) {
      console.error('[UPDATE] User does not own quote and is not admin');
      return res.status(403).json({ 
        error: 'Solo puedes editar tus propias cotizaciones'
      });
    }

    // Travel groups live in pasantias_quote_groups and are not saved by this
    // route. Saying so beats reporting success while dropping the edit (before
    // the field allowlist, such a save failed on the unknown column).
    if (Array.isArray(req.body?.groups)) {
      return res.status(400).json({
        error: 'Por ahora no se pueden editar cotizaciones con grupos de viaje'
      });
    }

    // Status: the editor keeps the current one or publishes the quote
    // ('sent'). 'viewed' is written only by the public GET above; accepted /
    // rejected / expired are never set by hand.
    if (
      req.body?.status !== undefined &&
      req.body.status !== existingQuote.status &&
      req.body.status !== 'sent'
    ) {
      return res.status(400).json({ error: 'Estado de cotización no permitido' });
    }

    // Only the fields the quote editor sends (components/quotes/QuoteFormV2):
    // identity, numbering, attribution and lifecycle timestamps
    // (quote_number, created_by, viewed_at, accepted_at, ...) are never
    // taken from the request.
    const updateData: Record<string, unknown> = {};
    for (const field of EDITABLE_QUOTE_FIELDS) {
      if (req.body && Object.prototype.hasOwnProperty.call(req.body, field)) {
        updateData[field] = req.body[field];
      }
    }
    updateData.updated_by = userId;
    updateData.updated_at = new Date().toISOString();

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
        user_id: userId,
        action: 'update_quote',
        resource_type: 'pasantias_quote',
        resource_id: id,
        details: {
          changes: Object.keys(updateData).filter((k) => k !== 'updated_by' && k !== 'updated_at')
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
    // Identity comes from the auth server; the cookie's stored `user` is
    // client-controlled (SM-B015).
    const caller = await requireVerifiedCaller(req, res);
    if (!caller.user) {
      return res.status(caller.status).json(caller.body);
    }
    const userId = caller.user.id;

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
      .eq('user_id', userId)
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
        
      if (!quote || quote.created_by !== userId) {
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
        user_id: userId,
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