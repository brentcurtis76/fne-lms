import { NextApiRequest, NextApiResponse } from 'next';
import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const supabase = createPagesServerClient({ req, res });
  const { id } = req.query;

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
    .in('role_type', ['admin', 'consultor', 'community_manager'])
    .single();

  if (!userRole) {
    return res.status(403).json({ error: 'No tienes permisos para gestionar cotizaciones' });
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
          quote_id: id,
          ...req.body
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