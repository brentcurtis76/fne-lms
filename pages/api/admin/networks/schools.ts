/**
 * API endpoint for managing school assignments to networks
 * Handles adding/removing schools from redes_de_colegios
 * 
 * SECURITY: Admin-only access enforced via hasAdminPrivileges
 */

import { NextApiRequest, NextApiResponse } from 'next';
import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';
import { hasAdminPrivileges } from '../../../../utils/roleUtils';

interface AssignSchoolRequest {
  networkId: string;
  schoolId: number;
}

interface RemoveSchoolRequest {
  networkId: string;
  schoolId: number;
}

interface BulkAssignSchoolsRequest {
  networkId: string;
  schoolIds: number[];
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
      return res.status(403).json({ error: 'Solo administradores pueden gestionar asignaciones de escuelas' });
    }

    switch (req.method) {
      case 'GET':
        return handleGetAvailableSchools(supabaseAdmin, res);
      case 'POST':
        return handleAssignSchool(supabaseAdmin, req.body as AssignSchoolRequest, session.user.id, res);
      case 'DELETE':
        return handleRemoveSchool(supabaseAdmin, req.body as RemoveSchoolRequest, res);
      case 'PUT':
        return handleBulkAssignSchools(supabaseAdmin, req.body as BulkAssignSchoolsRequest, session.user.id, res);
      default:
        res.setHeader('Allow', ['GET', 'POST', 'DELETE', 'PUT']);
        return res.status(405).json({ error: 'Método no permitido' });
    }
  } catch (error) {
    console.error('Error in networks/schools API:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

/**
 * GET /api/admin/networks/schools - List all schools with their current network assignments
 * Updated: 2025-01-23 - Force deployment
 */
async function handleGetAvailableSchools(supabase: any, res: NextApiResponse) {
  try {
    // Fetch all schools
    const { data: schools, error: schoolsError } = await supabase
      .from('schools')
      .select('id, name, has_generations')
      .order('name');

    if (schoolsError) {
      console.error('Error fetching schools:', schoolsError);
      return res.status(500).json({ 
        error: 'Error al obtener escuelas',
        details: schoolsError.message
      });
    }

    // Fetch all network assignments
    const { data: assignments, error: assignmentsError } = await supabase
      .from('red_escuelas')
      .select(`
        school_id,
        red_id,
        fecha_agregada,
        redes_de_colegios (
          id,
          nombre
        )
      `);

    if (assignmentsError) {
      console.error('Error fetching assignments:', assignmentsError);
      // Continue without assignments if there's an error
    }

    // Create assignment map
    const schoolAssignments = new Map();
    if (assignments) {
      assignments.forEach(assignment => {
        if (assignment.redes_de_colegios) {
          schoolAssignments.set(assignment.school_id, {
            id: assignment.redes_de_colegios.id,
            name: assignment.redes_de_colegios.nombre,
            assigned_at: assignment.fecha_agregada
          });
        }
      });
    }

    // Combine data
    const schoolsWithNetworks = (schools || []).map(school => {
      const networkAssignment = schoolAssignments.get(school.id);
      return {
        id: school.id,
        name: school.name,
        has_generations: school.has_generations,
        is_assigned: !!networkAssignment,
        assigned_network_id: networkAssignment?.id || null,
        assigned_network_name: networkAssignment?.name || null,
        assigned_at: networkAssignment?.assigned_at || null
      };
    });

    return res.status(200).json({
      success: true,
      schools: schoolsWithNetworks,
      summary: {
        total: schoolsWithNetworks.length,
        assigned: schoolsWithNetworks.filter(s => s.is_assigned).length,
        unassigned: schoolsWithNetworks.filter(s => !s.is_assigned).length
      }
    });
  } catch (error) {
    console.error('Error in handleGetAvailableSchools:', error);
    return res.status(500).json({ error: 'Error al obtener escuelas disponibles' });
  }
}

/**
 * POST /api/admin/networks/schools - Assign single school to network
 */
async function handleAssignSchool(
  supabase: any, 
  body: AssignSchoolRequest, 
  adminId: string, 
  res: NextApiResponse
) {
  try {
    const { networkId, schoolId } = body;

    // Validate input
    if (!networkId || !schoolId) {
      return res.status(400).json({ error: 'Network ID y School ID son requeridos' });
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

    // Verify school exists
    const { data: school } = await supabase
      .from('schools')
      .select('id, name')
      .eq('id', schoolId)
      .single();

    if (!school) {
      return res.status(404).json({ error: 'Escuela no encontrada' });
    }

    // Check if assignment already exists
    const { data: existingAssignment } = await supabase
      .from('red_escuelas')
      .select('red_id, school_id')
      .eq('red_id', networkId)
      .eq('school_id', schoolId)
      .single();

    if (existingAssignment) {
      return res.status(409).json({ 
        error: `La escuela "${school.name}" ya está asignada a la red "${network.name}"` 
      });
    }

    // Check if school is already assigned to another network
    const { data: otherNetworkAssignment } = await supabase
      .from('red_escuelas')
      .select(`
        red_id,
        redes_de_colegios (
          name
        )
      `)
      .eq('school_id', schoolId)
      .single();

    if (otherNetworkAssignment) {
      return res.status(409).json({ 
        error: `La escuela "${school.name}" ya está asignada a la red "${otherNetworkAssignment.redes_de_colegios.name}"` 
      });
    }

    // Create assignment
    const { error: assignError } = await supabase
      .from('red_escuelas')
      .insert({
        red_id: networkId,
        school_id: schoolId,
        assigned_by: adminId,
        assigned_at: new Date().toISOString()
      });

    if (assignError) {
      console.error('Error assigning school to network:', assignError);
      return res.status(500).json({ error: 'Error al asignar escuela a la red' });
    }

    return res.status(201).json({
      success: true,
      message: `Escuela "${school.name}" asignada exitosamente a la red "${network.name}"`
    });
  } catch (error) {
    console.error('Error in handleAssignSchool:', error);
    return res.status(500).json({ error: 'Error al asignar escuela' });
  }
}

/**
 * DELETE /api/admin/networks/schools - Remove school from network
 */
async function handleRemoveSchool(supabase: any, body: RemoveSchoolRequest, res: NextApiResponse) {
  try {
    const { networkId, schoolId } = body;

    // Validate input
    if (!networkId || !schoolId) {
      return res.status(400).json({ error: 'Network ID y School ID son requeridos' });
    }

    // Verify assignment exists
    const { data: assignment } = await supabase
      .from('red_escuelas')
      .select(`
        red_id,
        school_id,
        redes_de_colegios (
          name
        ),
        schools (
          name
        )
      `)
      .eq('red_id', networkId)
      .eq('school_id', schoolId)
      .single();

    if (!assignment) {
      return res.status(404).json({ error: 'Asignación no encontrada' });
    }

    // Check if there are active supervisors for this network
    const { data: activeSupervisors } = await supabase
      .from('user_roles')
      .select('id, profiles(email, first_name, last_name)')
      .eq('red_id', networkId)
      .eq('role_type', 'supervisor_de_red')
      .eq('is_active', true);

    if (activeSupervisors && activeSupervisors.length > 0) {
      const supervisorNames = activeSupervisors.map((s: any) => 
        `${s.profiles.first_name} ${s.profiles.last_name} (${s.profiles.email})`
      ).join(', ');
      
      return res.status(409).json({ 
        error: `No se puede remover la escuela porque hay supervisores activos asignados a esta red: ${supervisorNames}` 
      });
    }

    // Remove assignment
    const { error: removeError } = await supabase
      .from('red_escuelas')
      .delete()
      .eq('red_id', networkId)
      .eq('school_id', schoolId);

    if (removeError) {
      console.error('Error removing school from network:', removeError);
      return res.status(500).json({ error: 'Error al remover escuela de la red' });
    }

    return res.status(200).json({
      success: true,
      message: `Escuela "${assignment.schools.name}" removida exitosamente de la red "${assignment.redes_de_colegios.name}"`
    });
  } catch (error) {
    console.error('Error in handleRemoveSchool:', error);
    return res.status(500).json({ error: 'Error al remover escuela' });
  }
}

/**
 * PUT /api/admin/networks/schools - Bulk assign multiple schools to network
 */
async function handleBulkAssignSchools(
  supabase: any, 
  body: BulkAssignSchoolsRequest, 
  adminId: string, 
  res: NextApiResponse
) {
  try {
    const { networkId, schoolIds } = body;

    // Validate input
    if (!networkId || !Array.isArray(schoolIds) || schoolIds.length === 0) {
      return res.status(400).json({ error: 'Network ID y lista de School IDs son requeridos' });
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

    // Verify all schools exist
    const { data: schools } = await supabase
      .from('schools')
      .select('id, name')
      .in('id', schoolIds);

    if (!schools || schools.length !== schoolIds.length) {
      const foundIds = schools?.map(s => s.id) || [];
      const missingIds = schoolIds.filter(id => !foundIds.includes(id));
      return res.status(404).json({ 
        error: `Escuelas no encontradas con IDs: ${missingIds.join(', ')}` 
      });
    }

    // Check for existing assignments
    const { data: existingAssignments } = await supabase
      .from('red_escuelas')
      .select('school_id, red_id, redes_de_colegios(name)')
      .in('school_id', schoolIds);

    if (existingAssignments && existingAssignments.length > 0) {
      const conflicts = existingAssignments.map((assignment: any) => {
        const school = schools.find(s => s.id === assignment.school_id);
        return `"${school?.name}" ya asignada a "${assignment.redes_de_colegios.name}"`;
      });
      
      return res.status(409).json({ 
        error: `Conflictos de asignación: ${conflicts.join(', ')}` 
      });
    }

    // Prepare bulk insert data
    const assignmentData = schoolIds.map(schoolId => ({
      red_id: networkId,
      school_id: schoolId,
      assigned_by: adminId,
      assigned_at: new Date().toISOString()
    }));

    // Bulk insert assignments
    const { error: bulkInsertError } = await supabase
      .from('red_escuelas')
      .insert(assignmentData);

    if (bulkInsertError) {
      console.error('Error bulk assigning schools:', bulkInsertError);
      return res.status(500).json({ error: 'Error al asignar escuelas en lote' });
    }

    const schoolNames = schools.map(s => s.name).join(', ');
    
    return res.status(201).json({
      success: true,
      message: `${schoolIds.length} escuelas asignadas exitosamente a la red "${network.name}": ${schoolNames}`
    });
  } catch (error) {
    console.error('Error in handleBulkAssignSchools:', error);
    return res.status(500).json({ error: 'Error al asignar escuelas en lote' });
  }
}