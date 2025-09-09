/**
 * API endpoint for managing school assignments to networks - TYPED VERSION
 * Handles adding/removing schools from redes_de_colegios
 * 
 * SECURITY: Admin-only access enforced via hasAdminPrivileges
 * TYPES: Using types/database.generated.ts for type safety
 */

import { NextApiRequest, NextApiResponse } from 'next';
import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';
import { hasAdminPrivileges } from '../../../../utils/roleUtils';
import type { Database } from '../../../../types/database.generated';

type Schools = Database['public']['Tables']['schools']['Row'];
type RedEscuelas = Database['public']['Tables']['red_escuelas']['Row'];
type RedesDeColegios = Database['public']['Tables']['redes_de_colegios']['Row'];
type UserRoles = Database['public']['Tables']['user_roles']['Row'];
type Profiles = Database['public']['Tables']['profiles']['Row'];

interface AssignSchoolRequest {
  networkId: string;
  schoolId: number; // Explicitly number type for schools.id
}

interface RemoveSchoolRequest {
  networkId: string;
  schoolId: number; // Explicitly number type for schools.id
}

interface BulkAssignSchoolsRequest {
  networkId: string;
  schoolIds: number[]; // Array of numbers for schools.id
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
 * Using explicit column selections for type safety
 */
async function handleGetAvailableSchools(supabase: any, res: NextApiResponse) {
  try {
    // Fetch all schools with explicit columns
    const { data: schools, error: schoolsError } = await supabase
      .from('schools')
      .select('id, name, has_generations')
      .order('name')
      .returns<Pick<Schools, 'id' | 'name' | 'has_generations'>[]>();

    if (schoolsError) {
      console.error('Error fetching schools:', schoolsError);
      return res.status(500).json({ 
        error: 'Error al obtener escuelas',
        details: schoolsError.message
      });
    }

    // Fetch all network assignments with explicit columns
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
      `)
      .returns<(Pick<RedEscuelas, 'school_id' | 'red_id' | 'fecha_agregada'> & {
        redes_de_colegios: Pick<RedesDeColegios, 'id' | 'nombre'> | null
      })[]>();

    if (assignmentsError) {
      console.error('Error fetching assignments:', assignmentsError);
      // Continue without assignments if there's an error
    }

    // Create assignment map - schoolId is a number
    const schoolAssignments = new Map<number, {
      id: string;
      name: string;
      assigned_at: string;
    }>();
    
    if (assignments) {
      assignments.forEach((assignment) => {
        if (assignment.redes_de_colegios) {
          // school_id is number type
          schoolAssignments.set(assignment.school_id as number, {
            id: assignment.redes_de_colegios.id,
            name: assignment.redes_de_colegios.nombre,
            assigned_at: assignment.fecha_agregada
          });
        }
      });
    }

    // Combine data - school.id is number type
    const schoolsWithNetworks = (schools || []).map((school) => {
      const networkAssignment = schoolAssignments.get(school.id);
      return {
        id: school.id as number, // Explicitly treat as number
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
        assigned: schoolsWithNetworks.filter((s) => s.is_assigned).length,
        unassigned: schoolsWithNetworks.filter((s) => !s.is_assigned).length
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

    // Validate input - schoolId is number
    if (!networkId || !schoolId || typeof schoolId !== 'number') {
      return res.status(400).json({ error: 'Network ID y School ID (number) son requeridos' });
    }

    // Verify network exists
    const { data: network } = await supabase
      .from('redes_de_colegios')
      .select('id, nombre')
      .eq('id', networkId)
      .single()
      .returns<Pick<RedesDeColegios, 'id' | 'nombre'>>();

    if (!network) {
      return res.status(404).json({ error: 'Red no encontrada' });
    }

    // Verify school exists - schoolId is number
    const { data: school } = await supabase
      .from('schools')
      .select('id, name')
      .eq('id', schoolId)
      .single()
      .returns<Pick<Schools, 'id' | 'name'>>();

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
        error: `La escuela "${school.name}" ya está asignada a la red "${network.nombre}"` 
      });
    }

    // Check if school is already assigned to another network
    const { data: otherNetworkAssignment } = await supabase
      .from('red_escuelas')
      .select(`
        red_id,
        redes_de_colegios (
          nombre
        )
      `)
      .eq('school_id', schoolId)
      .single()
      .returns<Pick<RedEscuelas, 'red_id'> & {
        redes_de_colegios: Pick<RedesDeColegios, 'nombre'> | null
      }>();

    if (otherNetworkAssignment) {
      return res.status(409).json({ 
        error: `La escuela "${school.name}" ya está asignada a la red "${otherNetworkAssignment.redes_de_colegios?.nombre}"` 
      });
    }

    // Create assignment with proper typing
    const { error: assignError } = await supabase
      .from('red_escuelas')
      .insert({
        red_id: networkId,
        school_id: schoolId,
        agregado_por: adminId,
        fecha_agregada: new Date().toISOString()
      } as Database['public']['Tables']['red_escuelas']['Insert']);

    if (assignError) {
      console.error('Error assigning school to network:', assignError);
      return res.status(500).json({ error: 'Error al asignar escuela a la red' });
    }

    return res.status(201).json({
      success: true,
      message: `Escuela "${school.name}" asignada exitosamente a la red "${network.nombre}"`
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

    // Validate input - schoolId is number
    if (!networkId || !schoolId || typeof schoolId !== 'number') {
      return res.status(400).json({ error: 'Network ID y School ID (number) son requeridos' });
    }

    // Verify assignment exists with explicit types
    const { data: assignment } = await supabase
      .from('red_escuelas')
      .select(`
        red_id,
        school_id,
        redes_de_colegios (
          nombre
        ),
        schools (
          name
        )
      `)
      .eq('red_id', networkId)
      .eq('school_id', schoolId)
      .single()
      .returns<Pick<RedEscuelas, 'red_id' | 'school_id'> & {
        redes_de_colegios: Pick<RedesDeColegios, 'nombre'> | null,
        schools: Pick<Schools, 'name'> | null
      }>();

    if (!assignment) {
      return res.status(404).json({ error: 'Asignación no encontrada' });
    }

    // Check if there are active supervisors for this network
    const { data: activeSupervisors } = await supabase
      .from('user_roles')
      .select('id, profiles(email, first_name, last_name)')
      .eq('red_id', networkId)
      .eq('role_type', 'supervisor_de_red')
      .eq('is_active', true)
      .returns<(Pick<UserRoles, 'id'> & {
        profiles: Pick<Profiles, 'email' | 'first_name' | 'last_name'> | null
      })[]>();

    if (activeSupervisors && activeSupervisors.length > 0) {
      const supervisorNames = activeSupervisors.map((s) => 
        `${s.profiles?.first_name} ${s.profiles?.last_name} (${s.profiles?.email})`
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
      message: `Escuela "${assignment.schools?.name}" removida exitosamente de la red "${assignment.redes_de_colegios?.nombre}"`
    });
  } catch (error) {
    console.error('Error in handleRemoveSchool:', error);
    return res.status(500).json({ error: 'Error al remover escuela' });
  }
}

/**
 * PUT /api/admin/networks/schools - Smart bulk assign multiple schools to network
 * Handles partial assignments intelligently with transaction safety
 */
async function handleBulkAssignSchools(
  supabase: any, 
  body: BulkAssignSchoolsRequest, 
  adminId: string, 
  res: NextApiResponse
) {
  try {
    const { networkId, schoolIds } = body;

    // Validate input - schoolIds are numbers
    if (!networkId || !Array.isArray(schoolIds) || schoolIds.length === 0) {
      return res.status(400).json({ error: 'Network ID y lista de School IDs son requeridos' });
    }

    // Validate all schoolIds are numbers
    if (!schoolIds.every(id => typeof id === 'number')) {
      return res.status(400).json({ error: 'Todos los School IDs deben ser números' });
    }

    // Limit batch size for scalability
    const MAX_BATCH_SIZE = 100;
    if (schoolIds.length > MAX_BATCH_SIZE) {
      return res.status(400).json({ 
        error: `Máximo ${MAX_BATCH_SIZE} escuelas permitidas por operación` 
      });
    }

    console.log(`🔄 Processing bulk assignment: ${schoolIds.length} schools to network ${networkId}`);

    // Step 1: Verify network exists
    const { data: network } = await supabase
      .from('redes_de_colegios')
      .select('id, nombre')
      .eq('id', networkId)
      .single()
      .returns<Pick<RedesDeColegios, 'id' | 'nombre'>>();

    if (!network) {
      return res.status(404).json({ error: 'Red no encontrada' });
    }

    // Step 2: Get all relevant data in parallel for efficiency
    const [schoolsResult, assignmentsResult] = await Promise.all([
      supabase
        .from('schools')
        .select('id, name')
        .in('id', schoolIds)
        .returns<Pick<Schools, 'id' | 'name'>[]>(),
      supabase
        .from('red_escuelas')
        .select('school_id, red_id, redes_de_colegios(id, nombre)')
        .in('school_id', schoolIds)
        .returns<(Pick<RedEscuelas, 'school_id' | 'red_id'> & {
          redes_de_colegios: Pick<RedesDeColegios, 'id' | 'nombre'> | null
        })[]>()
    ]);

    const { data: schools, error: schoolsError } = schoolsResult;
    const { data: existingAssignments, error: assignmentsError } = assignmentsResult;

    if (schoolsError) {
      console.error('Error fetching schools:', schoolsError);
      return res.status(500).json({ error: 'Error al verificar escuelas' });
    }

    if (assignmentsError) {
      console.error('Error fetching assignments:', assignmentsError);
      return res.status(500).json({ error: 'Error al verificar asignaciones existentes' });
    }

    // Step 3: Validate all schools exist
    if (!schools || schools.length !== schoolIds.length) {
      const foundIds = schools?.map((s) => s.id) || [];
      const missingIds = schoolIds.filter(id => !foundIds.includes(id));
      return res.status(404).json({ 
        error: `Escuelas no encontradas con IDs: ${missingIds.join(', ')}` 
      });
    }

    // Step 4: Smart conflict analysis - school.id is number
    const schoolMap = new Map<number, Pick<Schools, 'id' | 'name'>>(
      schools.map((s) => [s.id, s])
    );
    const assignmentMap = new Map<number, {
      red_id: string;
      red_nombre: string;
    }>();
    
    // Build assignment map for quick lookup - school_id is number
    if (existingAssignments) {
      existingAssignments.forEach((assignment) => {
        assignmentMap.set(assignment.school_id as number, {
          red_id: assignment.red_id,
          red_nombre: assignment.redes_de_colegios?.nombre || 'Unknown'
        });
      });
    }

    // Categorize schools based on current assignments
    const assignableSchools: number[] = [];
    const alreadyAssignedToTarget: any[] = [];
    const assignedToOtherNetworks: any[] = [];

    schoolIds.forEach(schoolId => {
      const school = schoolMap.get(schoolId);
      const existingAssignment = assignmentMap.get(schoolId);

      if (!existingAssignment) {
        // School not assigned to any network - can assign
        assignableSchools.push(schoolId);
      } else if (existingAssignment.red_id === networkId) {
        // Already assigned to target network - skip
        alreadyAssignedToTarget.push({
          id: schoolId,
          name: school?.name || 'Unknown',
          network: existingAssignment.red_nombre
        });
      } else {
        // Assigned to different network - skip (could be enhanced to allow reassignment)
        assignedToOtherNetworks.push({
          id: schoolId,
          name: school?.name || 'Unknown',
          network: existingAssignment.red_nombre
        });
      }
    });

    console.log(`📊 Assignment analysis:`, {
      assignable: assignableSchools.length,
      alreadyAssigned: alreadyAssignedToTarget.length,
      conflicts: assignedToOtherNetworks.length
    });

    // Step 5: Process assignable schools with transaction safety
    let assignedCount = 0;
    if (assignableSchools.length > 0) {
      const assignmentData: Database['public']['Tables']['red_escuelas']['Insert'][] = 
        assignableSchools.map(schoolId => ({
          red_id: networkId,
          school_id: schoolId,
          agregado_por: adminId,
          fecha_agregada: new Date().toISOString()
        }));

      const { data: insertResult, error: bulkInsertError } = await supabase
        .from('red_escuelas')
        .insert(assignmentData)
        .select('school_id');

      if (bulkInsertError) {
        console.error('Error bulk assigning schools:', bulkInsertError);
        return res.status(500).json({ 
          error: 'Error al asignar escuelas en lote',
          details: bulkInsertError.message 
        });
      }

      assignedCount = insertResult?.length || 0;
      console.log(`✅ Successfully assigned ${assignedCount} schools to network ${network.nombre}`);
    }

    // Step 6: Build comprehensive response
    const response: any = {
      success: true,
      network_name: network.nombre,
      summary: {
        total_processed: schoolIds.length,
        newly_assigned: assignedCount,
        already_assigned: alreadyAssignedToTarget.length,
        conflicts: assignedToOtherNetworks.length
      }
    };

    // Add detailed breakdown if requested
    if (assignableSchools.length > 0) {
      const assignedSchoolNames = assignableSchools
        .map(id => schoolMap.get(id)?.name || 'Unknown')
        .filter(name => name !== 'Unknown');
      response.assigned_schools = assignedSchoolNames;
    }

    if (alreadyAssignedToTarget.length > 0) {
      response.already_assigned_schools = alreadyAssignedToTarget.map(s => s.name);
    }

    if (assignedToOtherNetworks.length > 0) {
      response.conflicted_schools = assignedToOtherNetworks.map(s => ({
        name: s.name,
        current_network: s.network
      }));
    }

    // Step 7: Generate user-friendly message
    const messages: string[] = [];
    
    if (assignedCount > 0) {
      messages.push(`✅ ${assignedCount} escuela${assignedCount !== 1 ? 's' : ''} asignada${assignedCount !== 1 ? 's' : ''} exitosamente`);
    }

    if (alreadyAssignedToTarget.length > 0) {
      messages.push(`ℹ️ ${alreadyAssignedToTarget.length} escuela${alreadyAssignedToTarget.length !== 1 ? 's' : ''} ya estaba${alreadyAssignedToTarget.length !== 1 ? 'n' : ''} asignada${alreadyAssignedToTarget.length !== 1 ? 's' : ''} a esta red`);
    }

    if (assignedToOtherNetworks.length > 0) {
      messages.push(`⚠️ ${assignedToOtherNetworks.length} escuela${assignedToOtherNetworks.length !== 1 ? 's' : ''} omitida${assignedToOtherNetworks.length !== 1 ? 's' : ''} (asignada${assignedToOtherNetworks.length !== 1 ? 's' : ''} a otra${assignedToOtherNetworks.length !== 1 ? 's' : ''} red${assignedToOtherNetworks.length !== 1 ? 'es' : ''})`);
    }

    response.message = messages.join(', ') || 'Operación completada';

    // Return appropriate status code
    if (assignedCount > 0) {
      return res.status(200).json(response); // Partial or full success
    } else if (alreadyAssignedToTarget.length > 0) {
      return res.status(200).json(response); // All schools already assigned (OK)
    } else {
      return res.status(409).json({
        ...response,
        success: false,
        error: 'No se pudieron asignar escuelas debido a conflictos existentes'
      });
    }

  } catch (error) {
    console.error('Error in handleBulkAssignSchools:', error);
    return res.status(500).json({ 
      error: 'Error interno al procesar asignación en lote',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}