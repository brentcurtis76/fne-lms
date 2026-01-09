/**
 * API endpoint for managing supervisor assignments to networks
 * Handles assigning/removing supervisor_de_red roles
 * 
 * SECURITY: Admin-only access enforced via hasAdminPrivileges
 */

import { NextApiRequest, NextApiResponse } from 'next';
import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';
import { hasAdminPrivileges, assignSupervisorRole } from '../../../../utils/roleUtils';

interface AssignSupervisorRequest {
  networkId: string;
  userId: string;
}

interface RemoveSupervisorRequest {
  networkId: string;
  userId: string;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const supabase = createServerSupabaseClient({ req, res });

  try {
    // Get current user session
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session?.user) {
      return res.status(401).json({ error: 'No autorizado' });
    }

    // SECURITY: Verify admin privileges using service role client
    const supabaseAdmin = createServerSupabaseClient({ req, res }, {
      supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY
    });
    
    const isAdmin = await hasAdminPrivileges(supabaseAdmin, session.user.id);
    if (!isAdmin) {
      return res.status(403).json({ error: 'Solo administradores pueden gestionar supervisores' });
    }

    switch (req.method) {
      case 'POST':
        return handleAssignSupervisor(supabaseAdmin, req.body as AssignSupervisorRequest, session.user.id, res);
      case 'DELETE':
        return handleRemoveSupervisor(supabaseAdmin, req.body as RemoveSupervisorRequest, res);
      case 'GET':
        return handleGetAvailableUsers(supabaseAdmin, req.query.networkId as string, res);
      default:
        res.setHeader('Allow', ['POST', 'DELETE', 'GET']);
        return res.status(405).json({ error: 'Método no permitido' });
    }
  } catch (error) {
    console.error('Error in networks/supervisors API:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

/**
 * POST /api/admin/networks/supervisors - Assign supervisor to network
 */
async function handleAssignSupervisor(
  supabase: any, 
  body: AssignSupervisorRequest, 
  adminId: string, 
  res: NextApiResponse
) {
  try {
    const { networkId, userId } = body;

    // Validate input
    if (!networkId || !userId) {
      return res.status(400).json({ error: 'Network ID y User ID son requeridos' });
    }

    // Verify network exists
    const { data: network } = await supabase
      .from('redes_de_colegios')
      .select('id, name')
      .eq('id', networkId)
      .single();

    if (!network) {
      return res.status(404).json({ error: 'Red no encontrada' });
    }

    // Verify user exists
    const { data: user } = await supabase
      .from('profiles')
      .select('id, email, first_name, last_name')
      .eq('id', userId)
      .single();

    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    // Check if user already has supervisor role for this network
    const { data: existingRole } = await supabase
      .from('user_roles')
      .select('id')
      .eq('user_id', userId)
      .eq('role_type', 'supervisor_de_red')
      .eq('red_id', networkId)
      .eq('is_active', true)
      .single();

    if (existingRole) {
      return res.status(409).json({ 
        error: `El usuario ${user.first_name} ${user.last_name} ya es supervisor de la red "${network.name}"` 
      });
    }

    // Check if user already has supervisor role for another network
    const { data: otherNetworkRole } = await supabase
      .from('user_roles')
      .select(`
        id,
        red_id,
        redes_de_colegios (
          name
        )
      `)
      .eq('user_id', userId)
      .eq('role_type', 'supervisor_de_red')
      .eq('is_active', true)
      .single();

    if (otherNetworkRole) {
      return res.status(409).json({ 
        error: `El usuario ya es supervisor de otra red: "${otherNetworkRole.redes_de_colegios.name}". Un usuario solo puede supervisar una red a la vez.` 
      });
    }

    // Use the roleUtils function to assign supervisor role
    const result = await assignSupervisorRole(supabase, userId, networkId, adminId);
    
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    return res.status(201).json({
      success: true,
      message: `${user.first_name} ${user.last_name} asignado exitosamente como supervisor de la red "${network.name}"`
    });
  } catch (error) {
    console.error('Error in handleAssignSupervisor:', error);
    return res.status(500).json({ error: 'Error al asignar supervisor' });
  }
}

/**
 * DELETE /api/admin/networks/supervisors - Remove supervisor from network
 */
async function handleRemoveSupervisor(supabase: any, body: RemoveSupervisorRequest, res: NextApiResponse) {
  try {
    const { networkId, userId } = body;

    // Validate input
    if (!networkId || !userId) {
      return res.status(400).json({ error: 'Network ID y User ID son requeridos' });
    }

    // Find existing supervisor role
    const { data: supervisorRole } = await supabase
      .from('user_roles')
      .select(`
        id,
        redes_de_colegios (
          name
        ),
        profiles (
          first_name,
          last_name,
          email
        )
      `)
      .eq('user_id', userId)
      .eq('role_type', 'supervisor_de_red')
      .eq('red_id', networkId)
      .eq('is_active', true)
      .single();

    if (!supervisorRole) {
      return res.status(404).json({ error: 'Asignación de supervisor no encontrada' });
    }

    // Deactivate the role (don't delete to maintain audit trail)
    const { error: deactivateError } = await supabase
      .from('user_roles')
      .update({ 
        is_active: false,
        updated_at: new Date().toISOString()
      })
      .eq('id', supervisorRole.id);

    if (deactivateError) {
      console.error('Error removing supervisor role:', deactivateError);
      return res.status(500).json({ error: 'Error al remover supervisor' });
    }

    return res.status(200).json({
      success: true,
      message: `${supervisorRole.profiles.first_name} ${supervisorRole.profiles.last_name} removido exitosamente como supervisor de la red "${supervisorRole.redes_de_colegios.name}"`
    });
  } catch (error) {
    console.error('Error in handleRemoveSupervisor:', error);
    return res.status(500).json({ error: 'Error al remover supervisor' });
  }
}

/**
 * GET /api/admin/networks/supervisors?networkId=xxx - Get available users for supervisor assignment
 */
async function handleGetAvailableUsers(supabase: any, networkId: string, res: NextApiResponse) {
  try {
    if (!networkId) {
      return res.status(400).json({ error: 'Network ID es requerido' });
    }

    // Get users who are not already supervisors of any network
    const { data: availableUsers, error } = await supabase
      .from('profiles')
      .select(`
        id,
        email,
        first_name,
        last_name,
        created_at,
        user_roles!left (
          role_type,
          is_active,
          red_id
        )
      `)
      .is('user_roles.role_type', null)
      .or('user_roles.role_type.neq.supervisor_de_red,user_roles.is_active.eq.false', { foreignTable: 'user_roles' })
      .order('first_name, last_name');

    if (error) {
      console.error('Error fetching available users:', error);
      return res.status(500).json({ error: 'Error al obtener usuarios disponibles' });
    }

    // Filter out users who already have active supervisor roles
    const filteredUsers = availableUsers?.filter((user: any) => {
      const hasSupervisorRole = user.user_roles?.some((role: any) => 
        role.role_type === 'supervisor_de_red' && role.is_active === true
      );
      return !hasSupervisorRole;
    }) || [];

    // Clean up the response
    const cleanUsers = filteredUsers.map((user: any) => ({
      id: user.id,
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      full_name: `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email,
      created_at: user.created_at
    }));

    return res.status(200).json({
      success: true,
      users: cleanUsers
    });
  } catch (error) {
    console.error('Error in handleGetAvailableUsers:', error);
    return res.status(500).json({ error: 'Error al obtener usuarios disponibles' });
  }
}