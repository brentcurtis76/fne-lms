/**
 * Simplified API endpoint for getting available supervisor users
 */

import { NextApiRequest, NextApiResponse } from 'next';
import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Create authenticated Supabase client
    const supabaseServerClient = createServerSupabaseClient({
      req,
      res,
    });

    const {
      data: { user },
    } = await supabaseServerClient.auth.getUser();

    if (!user) {
      return res.status(401).json({ error: 'No autorizado' });
    }

    // Create service role client
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Simple admin check
    const { data: adminCheck } = await supabaseAdmin
      .from('user_roles')
      .select('role_type')
      .eq('user_id', user.id)
      .eq('role_type', 'admin')
      .eq('is_active', true)
      .single();

    if (!adminCheck) {
      return res.status(403).json({ error: 'Solo administradores pueden gestionar supervisores' });
    }

    const { networkId } = req.query;
    if (!networkId) {
      return res.status(400).json({ error: 'Network ID es requerido' });
    }

    // First get all users
    const { data: allUsers, error: usersError } = await supabaseAdmin
      .from('profiles')
      .select('id, email, first_name, last_name')
      .order('first_name, last_name');

    if (usersError) {
      console.error('Error fetching users:', usersError);
      return res.status(500).json({ 
        error: 'Error al obtener usuarios',
        details: usersError.message
      });
    }

    // Get users who already have supervisor roles
    const { data: supervisorRoles, error: rolesError } = await supabaseAdmin
      .from('user_roles')
      .select('user_id, red_id')
      .eq('role_type', 'supervisor_de_red')
      .eq('is_active', true);

    if (rolesError) {
      console.error('Error fetching supervisor roles:', rolesError);
      // Continue without supervisor filtering
    }

    // Create a set of user IDs who are already supervisors
    const supervisorUserIds = new Set(supervisorRoles?.map(role => role.user_id) || []);

    // Filter out users who are already supervisors
    const availableUsers = (allUsers || []).filter(user => !supervisorUserIds.has(user.id));

    // Format the response
    const formattedUsers = availableUsers.map(user => ({
      id: user.id,
      email: user.email,
      first_name: user.first_name || '',
      last_name: user.last_name || '',
      full_name: `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email
    }));

    return res.status(200).json({
      success: true,
      users: formattedUsers,
      total: formattedUsers.length
    });

  } catch (error) {
    console.error('Unexpected error in supervisors-simple endpoint:', error);
    return res.status(500).json({ 
      error: 'Error interno del servidor',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}