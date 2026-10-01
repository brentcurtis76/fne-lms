import { NextApiRequest, NextApiResponse } from 'next';
import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import { requireVerifiedCaller, createServiceRoleClient } from '../../../../lib/api-auth';

// Columns a caller may set on a travel group. quote_id comes from the URL;
// id, nights and the timestamps are the database's.
const EDITABLE_GROUP_FIELDS = [
  'group_name', 'num_participants', 'arrival_date', 'departure_date',
  'flight_price', 'room_type', 'room_price_per_night', 'accommodation_total',
  'flight_total', 'viaticos_type', 'viaticos_amount', 'viaticos_total',
  'viaticos_display_amount',
] as const;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const supabase = createPagesServerClient({ req, res });
  const { id } = req.query;

  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'ID de cotización inválido' });
  }

  // Identity comes from the auth server; the cookie's stored `user` is
  // client-controlled (SM-B015).
  const caller = await requireVerifiedCaller(req, res);
  if (!caller.user) {
    return res.status(caller.status).json(caller.body);
  }
  const userId = caller.user.id;
  const serviceSupabase = createServiceRoleClient();

  // Check if user has permission
  const { data: userRoles, error: rolesError } = await serviceSupabase
    .from('user_roles')
    .select('role_type')
    .eq('user_id', userId)
    .eq('is_active', true)
    .in('role_type', ['admin', 'consultor', 'community_manager']);

  if (rolesError) {
    return res.status(500).json({ error: 'Error al verificar permisos' });
  }
  if (!userRoles || userRoles.length === 0) {
    return res.status(403).json({ error: 'No tienes permisos para gestionar cotizaciones' });
  }

  // Changing a quote's groups follows the quote's own rule (quotes/[id] PUT):
  // its creator or an admin.
  if (req.method === 'POST' || req.method === 'PUT' || req.method === 'DELETE') {
    const { data: quote, error: quoteError } = await serviceSupabase
      .from('pasantias_quotes')
      .select('id, created_by')
      .eq('id', id)
      .maybeSingle();
    if (quoteError) {
      return res.status(500).json({ error: 'Error al verificar la cotización' });
    }
    if (!quote) {
      return res.status(404).json({ error: 'Cotización no encontrada' });
    }
    const isAdmin = userRoles.some((r: { role_type: string }) => r.role_type === 'admin');
    if (!isAdmin && quote.created_by !== userId) {
      return res.status(403).json({ error: 'Solo puedes editar tus propias cotizaciones' });
    }
  }

  switch (req.method) {
    case 'GET':
      // Get all groups for a quote
      const { data: groups, error: getError } = await supabase
        .from('pasantias_quote_groups')
        .select('*')
        .eq('quote_id', id)
        .order('arrival_date', { ascending: true });

      if (getError) {
        return res.status(500).json({ error: 'Error al obtener los grupos' });
      }

      return res.status(200).json({ groups: groups || [] });

    case 'POST':
      // Add a new group to the quote
      const { data: newGroup, error: createError } = await supabase
        .from('pasantias_quote_groups')
        .insert({
          ...pickEditable(req.body),
          quote_id: id
        })
        .select()
        .single();

      if (createError) {
        return res.status(500).json({ error: 'Error al crear el grupo' });
      }

      // Update the quote to use groups system
      await supabase
        .from('pasantias_quotes')
        .update({ use_groups: true })
        .eq('id', id);

      return res.status(201).json({ group: newGroup });

    case 'PUT':
      // Update multiple groups at once
      const { groups: updatedGroups } = req.body;
      
      if (!Array.isArray(updatedGroups)) {
        return res.status(400).json({ error: 'Invalid groups data' });
      }

      // Update each group
      const updates = updatedGroups.map(group => 
        supabase
          .from('pasantias_quote_groups')
          .update({
            group_name: group.group_name,
            num_participants: group.num_participants,
            arrival_date: group.arrival_date,
            departure_date: group.departure_date,
            flight_price: group.flight_price,
            room_type: group.room_type,
            room_price_per_night: group.room_price_per_night
          })
          .eq('id', group.id)
          .eq('quote_id', id)
      );

      const results = await Promise.all(updates);
      const hasErrors = results.some(r => r.error);

      if (hasErrors) {
        return res.status(500).json({ error: 'Error al actualizar los grupos' });
      }

      return res.status(200).json({ success: true });

    case 'DELETE':
      // Delete a specific group
      const { groupId } = req.body;
      
      if (!groupId) {
        return res.status(400).json({ error: 'ID del grupo requerido' });
      }

      // Check if this is the last group
      const { count } = await supabase
        .from('pasantias_quote_groups')
        .select('*', { count: 'exact', head: true })
        .eq('quote_id', id);

      if (count === 1) {
        return res.status(400).json({ error: 'No se puede eliminar el último grupo' });
      }

      const { error: deleteError } = await supabase
        .from('pasantias_quote_groups')
        .delete()
        .eq('id', groupId)
        .eq('quote_id', id);

      if (deleteError) {
        return res.status(500).json({ error: 'Error al eliminar el grupo' });
      }

      return res.status(200).json({ success: true });

    default:
      return res.status(405).json({ error: 'Método no permitido' });
  }
}
function pickEditable(body: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (body && typeof body === 'object') {
    for (const field of EDITABLE_GROUP_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(body, field)) {
        out[field] = (body as Record<string, unknown>)[field];
      }
    }
  }
  return out;
}
