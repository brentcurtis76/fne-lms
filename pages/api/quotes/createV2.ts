import { NextApiRequest, NextApiResponse } from 'next';
import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const supabase = createPagesServerClient({ req, res });

  try {
    // Check authentication
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
      return res.status(401).json({ error: 'No autorizado' });
    }

    // Check if user is admin or consultor
    const { data: userRole } = await supabase
      .from('user_roles')
      .select('role_type')
      .eq('user_id', session.user.id)
      .eq('is_active', true)
      .in('role_type', ['admin', 'consultor'])
      .single();

    if (!userRole) {
      return res.status(403).json({ error: 'No tienes permisos para crear cotizaciones' });
    }

    const {
      client_name,
      client_email,
      client_phone,
      client_institution,
      selected_programs,
      notes,
      internal_notes,
      status,
      valid_until,
      use_groups,
      groups,
      // Legacy single group fields
      arrival_date,
      departure_date,
      flight_price,
      flight_notes,
      room_type,
      single_room_price,
      double_room_price,
      num_pasantes
    } = req.body;

    // Validate required fields
    if (!client_name) {
      return res.status(400).json({ 
        error: 'Faltan campos requeridos',
        details: 'Nombre del cliente es obligatorio'
      });
    }

    // If using groups, validate at least one group exists
    if (use_groups && (!groups || groups.length === 0)) {
      return res.status(400).json({ 
        error: 'Debe incluir al menos un grupo de viaje'
      });
    }

    // If not using groups, validate legacy fields
    if (!use_groups && (!arrival_date || !departure_date || !room_type || !num_pasantes)) {
      return res.status(400).json({ 
        error: 'Faltan campos requeridos',
        details: 'Fechas de viaje, tipo de habitación y número de pasantes son obligatorios'
      });
    }

    // Start a transaction-like operation
    let quoteId;

    // Create the quote first
    const quoteData: any = {
      client_name,
      client_email,
      client_phone,
      client_institution,
      selected_programs: selected_programs || [],
      notes,
      internal_notes,
      status: status || 'draft',
      valid_until,
      use_groups: use_groups || false,
      created_by: session.user.id,
      updated_by: session.user.id
    };

    // If not using groups, include legacy fields
    if (!use_groups) {
      quoteData.arrival_date = arrival_date;
      quoteData.departure_date = departure_date;
      quoteData.flight_price = flight_price || 0;
      quoteData.flight_notes = flight_notes;
      quoteData.room_type = room_type;
      quoteData.single_room_price = single_room_price || 0;
      quoteData.double_room_price = double_room_price || 0;
      quoteData.num_pasantes = num_pasantes;
    } else {
      // Set room prices for reference
      quoteData.single_room_price = single_room_price || 150000;
      quoteData.double_room_price = double_room_price || 100000;
    }

    const { data: quote, error } = await supabase
      .from('pasantias_quotes')
      .insert(quoteData)
      .select()
      .single();

    if (error) {
      console.error('Error creating quote:', error);
      return res.status(500).json({ 
        error: 'Error al crear la cotización',
        details: error.message 
      });
    }

    quoteId = quote.id;

    // If using groups, create the group records
    if (use_groups && groups && groups.length > 0) {
      const groupsToInsert = groups.map((group: any) => ({
        quote_id: quoteId,
        group_name: group.group_name || `Grupo ${groups.indexOf(group) + 1}`,
        num_participants: group.num_participants,
        arrival_date: group.arrival_date,
        departure_date: group.departure_date,
        flight_price: group.flight_price || 0,
        room_type: group.room_type,
        room_price_per_night: group.room_price_per_night
      }));

      const { error: groupsError } = await supabase
        .from('pasantias_quote_groups')
        .insert(groupsToInsert);

      if (groupsError) {
        console.error('Error creating groups:', groupsError);
        // If groups fail, delete the quote to maintain consistency
        await supabase
          .from('pasantias_quotes')
          .delete()
          .eq('id', quoteId);
          
        return res.status(500).json({ 
          error: 'Error al crear los grupos de viaje',
          details: groupsError.message 
        });
      }

      // Force recalculation of totals
      await supabase
        .from('pasantias_quotes')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', quoteId);
    }

    // Get the updated quote with calculated totals
    const { data: finalQuote } = await supabase
      .from('pasantias_quotes')
      .select('*')
      .eq('id', quoteId)
      .single();

    // Log activity
    await supabase
      .from('activity_logs')
      .insert({
        user_id: session.user.id,
        action: 'create_quote',
        resource_type: 'pasantias_quote',
        resource_id: quoteId,
        details: {
          client_name,
          use_groups,
          groups_count: groups?.length || 1,
          grand_total: finalQuote?.grand_total
        }
      });

    return res.status(200).json({ 
      success: true,
      quote: finalQuote || quote,
      share_url: `/quote/${quoteId}`
    });

  } catch (error) {
    console.error('Error in create quote API:', error);
    return res.status(500).json({ 
      error: 'Error interno del servidor',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}