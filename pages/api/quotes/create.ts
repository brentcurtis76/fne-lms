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
      arrival_date,
      departure_date,
      flight_price,
      flight_notes,
      room_type,
      single_room_price,
      double_room_price,
      num_pasantes,
      selected_programs,
      notes,
      internal_notes,
      status,
      valid_until
    } = req.body;

    // Validate required fields
    if (!client_name || !arrival_date || !departure_date || !room_type || !num_pasantes) {
      return res.status(400).json({ 
        error: 'Faltan campos requeridos',
        details: 'Nombre del cliente, fechas de viaje, tipo de habitación y número de pasantes son obligatorios'
      });
    }

    // Validate dates
    const arrivalDate = new Date(arrival_date);
    const departureDate = new Date(departure_date);
    
    if (departureDate <= arrivalDate) {
      return res.status(400).json({ 
        error: 'La fecha de salida debe ser posterior a la fecha de llegada' 
      });
    }

    // Create the quote
    const { data: quote, error } = await supabase
      .from('pasantias_quotes')
      .insert({
        client_name,
        client_email,
        client_phone,
        client_institution,
        arrival_date,
        departure_date,
        flight_price: flight_price || 0,
        flight_notes,
        room_type,
        single_room_price: single_room_price || 0,
        double_room_price: double_room_price || 0,
        num_pasantes,
        selected_programs: selected_programs || [],
        notes,
        internal_notes,
        status: status || 'draft',
        valid_until,
        created_by: session.user.id,
        updated_by: session.user.id
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating quote:', error);
      return res.status(500).json({ 
        error: 'Error al crear la cotización',
        details: error.message 
      });
    }

    // Log activity
    await supabase
      .from('activity_logs')
      .insert({
        user_id: session.user.id,
        action: 'create_quote',
        resource_type: 'pasantias_quote',
        resource_id: quote.id,
        details: {
          client_name,
          num_pasantes,
          grand_total: quote.grand_total
        }
      });

    return res.status(200).json({ 
      success: true,
      quote,
      share_url: `/quote/${quote.id}`
    });

  } catch (error) {
    console.error('Error in create quote API:', error);
    return res.status(500).json({ 
      error: 'Error interno del servidor',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}