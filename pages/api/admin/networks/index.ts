/**
 * API endpoint for network management
 * Handles CRUD operations for redes_de_colegios
 *
 * SECURITY (B2a): auth → role check → logic, per the repo API pattern.
 * The caller is authenticated and verified as an ACTIVE admin via
 * `checkIsAdmin()`; privileged queries then run on `createServiceRoleClient()`,
 * a server-only client that carries the service-role key and never the caller's
 * JWT. The previous implementation passed `supabaseKey` to the auth-helpers
 * client, which kept sending the CALLER's session JWT as the bearer — PostgREST
 * resolved `authenticated`, not `service_role`, so RLS on `user_roles` (which
 * has no admin-read policy) silently emptied every supervisor read.
 */

import { NextApiRequest, NextApiResponse } from 'next';
import { checkIsAdmin, createServiceRoleClient } from '../../../../lib/api-auth';

interface CreateNetworkRequest {
  name: string;
  description?: string;
}

interface UpdateNetworkRequest {
  id: string;
  name?: string;
  description?: string;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { isAdmin, user } = await checkIsAdmin(req, res);

    if (!user) {
      return res.status(401).json({ error: 'No autorizado' });
    }

    if (!isAdmin) {
      console.error('User is not admin:', user.id);
      return res.status(403).json({ error: 'Solo administradores pueden gestionar redes' });
    }

    const supabaseAdmin = createServiceRoleClient();

    switch (req.method) {
      case 'GET':
        return handleGetNetworks(supabaseAdmin, res);
      case 'POST':
        return handleCreateNetwork(supabaseAdmin, req.body as CreateNetworkRequest, user.id, res);
      case 'PUT':
        return handleUpdateNetwork(supabaseAdmin, req.body as UpdateNetworkRequest, user.id, res);
      case 'DELETE':
        return handleDeleteNetwork(supabaseAdmin, req.query.id as string, res);
      default:
        res.setHeader('Allow', ['GET', 'POST', 'PUT', 'DELETE']);
        return res.status(405).json({ error: 'Método no permitido' });
    }
  } catch (error) {
    console.error('Error in networks API:', error);
    console.error('Error details:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });
    return res.status(500).json({
      error: 'Error interno del servidor',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * GET /api/admin/networks - List all networks with statistics
 */
async function handleGetNetworks(supabase: any, res: NextApiResponse) {
  try {
    // Get networks with school counts first
    const { data: networks, error } = await supabase
      .from('redes_de_colegios')
      .select(`
        *,
        red_escuelas (
          school_id,
          fecha_agregada,
          agregado_por,
          schools (
            id,
            name
          )
        )
      `)
      .order('nombre');

    if (error) {
      console.error('Error fetching networks:', error);
      console.error('Fetch networks error details:', {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint
      });

      // Check for missing table error
      if (error.code === '42P01') {
        return res.status(500).json({
          error: 'Las tablas de red no existen',
          details: 'relation "public.redes_de_colegios" does not exist',
          migration_required: true
        });
      }

      return res.status(500).json({
        error: 'Error al obtener redes',
        details: error.message || 'Unknown database error'
      });
    }

    // One batched query for every network's active supervisors, with its error
    // CHECKED. The per-network loop this replaces discarded `error`, so any
    // failed lookup became supervisors: [] / supervisor_count: 0 —
    // indistinguishable from "no supervisor assigned". A failed lookup must be
    // a failed response, never fake-empty data.
    //
    // `user_roles` has two FKs into `profiles` (user_id, assigned_by), so the
    // embed names its relationship; a bare `profiles(...)` is ambiguous
    // (PGRST201).
    const networkIds = (networks || []).map((network: any) => network.id);
    let supervisorRows: any[] = [];
    if (networkIds.length > 0) {
      const { data: supervisorData, error: supervisorsError } = await supabase
        .from('user_roles')
        .select(`
          user_id,
          red_id,
          created_at,
          profiles:user_id (
            id,
            email,
            first_name,
            last_name
          )
        `)
        .in('red_id', networkIds)
        .eq('role_type', 'supervisor_de_red')
        .eq('is_active', true);

      if (supervisorsError) {
        console.error('Error fetching network supervisors:', {
          code: supervisorsError.code,
          message: supervisorsError.message,
          details: supervisorsError.details,
          hint: supervisorsError.hint
        });
        return res.status(500).json({
          error: 'Error al obtener los supervisores de las redes',
          details: supervisorsError.message || 'Unknown database error'
        });
      }

      supervisorRows = supervisorData || [];
    }

    const supervisorsByNetwork = new Map<string, any[]>();
    for (const row of supervisorRows) {
      const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
      const list = supervisorsByNetwork.get(row.red_id) || [];
      list.push({
        user_id: row.user_id,
        email: profile?.email,
        first_name: profile?.first_name,
        last_name: profile?.last_name,
        assigned_at: row.created_at
      });
      supervisorsByNetwork.set(row.red_id, list);
    }

    const networksWithStats = (networks || []).map((network: any) => {
      // supervisor_count is DERIVED from the returned list, so the two can
      // never disagree.
      const supervisors = supervisorsByNetwork.get(network.id) || [];
      return {
        id: network.id,
        name: network.nombre,
        description: network.descripcion,
        created_by: network.created_by,
        last_updated_by: network.last_updated_by,
        created_at: network.created_at,
        updated_at: network.updated_at,
        school_count: network.red_escuelas?.length || 0,
        supervisor_count: supervisors.length,
        schools: network.red_escuelas?.map((re: any) => ({
          id: re.school_id,
          name: re.schools?.name,
          assigned_at: re.fecha_agregada,
          assigned_by: re.agregado_por
        })) || [],
        supervisors
      };
    });

    return res.status(200).json({
      success: true,
      networks: networksWithStats
    });
  } catch (error) {
    console.error('Error in handleGetNetworks:', error);
    return res.status(500).json({ error: 'Error al obtener redes' });
  }
}

/**
 * POST /api/admin/networks - Create new network
 */
async function handleCreateNetwork(
  supabase: any,
  body: CreateNetworkRequest,
  adminId: string,
  res: NextApiResponse
) {
  try {
    const { name, description } = body;

    // Validate required fields
    if (!name?.trim()) {
      return res.status(400).json({ error: 'El nombre de la red es requerido' });
    }

    // Check if network name already exists
    const { data: existingNetwork } = await supabase
      .from('redes_de_colegios')
      .select('id')
      .eq('nombre', name.trim())
      .single();

    if (existingNetwork) {
      return res.status(409).json({ error: 'Ya existe una red con ese nombre' });
    }

    // Create network
    const { data: newNetwork, error } = await supabase
      .from('redes_de_colegios')
      .insert({
        nombre: name.trim(),
        descripcion: description?.trim() || null,
        created_by: adminId,
        last_updated_by: adminId
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating network:', error);
      console.error('Create network error details:', {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint
      });

      // Check for common errors
      if (error.code === '42P01') {
        return res.status(500).json({
          error: 'La tabla de redes no existe. Por favor aplique la migración de base de datos.',
          details: 'Run database/add-supervisor-de-red-role.sql migration'
        });
      }

      return res.status(500).json({
        error: 'Error al crear la red',
        details: error.message || 'Unknown database error'
      });
    }

    return res.status(201).json({
      success: true,
      network: newNetwork,
      message: 'Red creada exitosamente'
    });
  } catch (error) {
    console.error('Error in handleCreateNetwork:', error);
    return res.status(500).json({ error: 'Error al crear la red' });
  }
}

/**
 * PUT /api/admin/networks - Update existing network
 */
async function handleUpdateNetwork(
  supabase: any,
  body: UpdateNetworkRequest,
  adminId: string,
  res: NextApiResponse
) {
  try {
    const { id, name, description } = body;

    if (!id) {
      return res.status(400).json({ error: 'ID de red es requerido' });
    }

    // Check if network exists
    const { data: existingNetwork } = await supabase
      .from('redes_de_colegios')
      .select('id, nombre')
      .eq('id', id)
      .single();

    if (!existingNetwork) {
      return res.status(404).json({ error: 'Red no encontrada' });
    }

    // Check if new name conflicts with another network
    if (name && name.trim() !== existingNetwork.nombre) {
      const { data: nameConflict } = await supabase
        .from('redes_de_colegios')
        .select('id')
        .eq('nombre', name.trim())
        .neq('id', id)
        .single();

      if (nameConflict) {
        return res.status(409).json({ error: 'Ya existe una red con ese nombre' });
      }
    }

    // Prepare update data
    const updateData: any = {
      last_updated_by: adminId,
      updated_at: new Date().toISOString()
    };

    if (name?.trim()) {
      updateData.nombre = name.trim();
    }

    if (description !== undefined) {
      updateData.descripcion = description?.trim() || null;
    }

    // Update network
    const { data: updatedNetwork, error } = await supabase
      .from('redes_de_colegios')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating network:', error);
      return res.status(500).json({ error: 'Error al actualizar la red' });
    }

    return res.status(200).json({
      success: true,
      network: updatedNetwork,
      message: 'Red actualizada exitosamente'
    });
  } catch (error) {
    console.error('Error in handleUpdateNetwork:', error);
    return res.status(500).json({ error: 'Error al actualizar la red' });
  }
}

/**
 * DELETE /api/admin/networks?id=xxx - Delete network
 */
async function handleDeleteNetwork(supabase: any, networkId: string, res: NextApiResponse) {
  try {
    if (!networkId) {
      return res.status(400).json({ error: 'ID de red es requerido' });
    }

    // Check if network exists
    const { data: existingNetwork } = await supabase
      .from('redes_de_colegios')
      .select('id, nombre')
      .eq('id', networkId)
      .single();

    if (!existingNetwork) {
      return res.status(404).json({ error: 'Red no encontrada' });
    }

    // Check if network has active supervisors
    const { data: activeSupervisors } = await supabase
      .from('user_roles')
      .select('id')
      .eq('red_id', networkId)
      .eq('role_type', 'supervisor_de_red')
      .eq('is_active', true);

    if (activeSupervisors && activeSupervisors.length > 0) {
      return res.status(409).json({
        error: 'No se puede eliminar la red porque tiene supervisores activos asignados'
      });
    }

    // Delete network (will cascade to red_escuelas due to ON DELETE CASCADE)
    const { error } = await supabase
      .from('redes_de_colegios')
      .delete()
      .eq('id', networkId);

    if (error) {
      console.error('Error deleting network:', error);
      return res.status(500).json({ error: 'Error al eliminar la red' });
    }

    return res.status(200).json({
      success: true,
      message: `Red "${existingNetwork.nombre}" eliminada exitosamente`
    });
  } catch (error) {
    console.error('Error in handleDeleteNetwork:', error);
    return res.status(500).json({ error: 'Error al eliminar la red' });
  }
}
