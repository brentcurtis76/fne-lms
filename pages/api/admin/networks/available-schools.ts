/**
 * API endpoint to get schools available for network assignment
 * Returns schools that are not already assigned to any network
 * 
 * SECURITY: Admin-only access enforced via hasAdminPrivileges
 */

import { NextApiRequest, NextApiResponse } from 'next';
import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';
import { hasAdminPrivileges } from '../../../../utils/roleUtils';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const supabase = createServerSupabaseClient({ req, res });

  try {
    // Only allow GET requests
    if (req.method !== 'GET') {
      res.setHeader('Allow', ['GET']);
      return res.status(405).json({ error: 'Método no permitido' });
    }

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
      return res.status(403).json({ error: 'Solo administradores pueden acceder a esta información' });
    }

    return handleGetAvailableSchools(supabaseAdmin, req.query.excludeNetwork as string, res);
  } catch (error) {
    console.error('Error in available-schools API:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

/**
 * GET /api/admin/networks/available-schools - Get schools not assigned to any network
 * Optional query param: excludeNetwork=networkId to exclude schools from specific network
 */
async function handleGetAvailableSchools(
  supabase: any, 
  excludeNetworkId: string | undefined, 
  res: NextApiResponse
) {
  try {
    // Get all schools with their network assignment status
    const { data: schools, error } = await supabase
      .from('schools')
      .select(`
        id,
        name,
        code,
        has_generations,
        created_at,
        red_escuelas (
          red_id,
          assigned_at,
          redes_de_colegios (
            id,
            name
          )
        )
      `)
      .order('name');

    if (error) {
      console.error('Error fetching schools:', error);
      return res.status(500).json({ error: 'Error al obtener escuelas' });
    }

    // Filter schools based on assignment status
    const availableSchools = schools?.filter((school: any) => {
      const assignments = school.red_escuelas || [];
      
      // If no assignments, school is available
      if (assignments.length === 0) {
        return true;
      }

      // If excludeNetworkId is provided, exclude schools from that network only
      if (excludeNetworkId) {
        const isInExcludedNetwork = assignments.some((assignment: any) => 
          assignment.red_id === excludeNetworkId
        );
        return isInExcludedNetwork;
      }

      // Otherwise, only show schools with no assignments
      return false;
    }) || [];

    // Clean up the response data
    const cleanSchools = availableSchools.map((school: any) => ({
      id: school.id,
      name: school.name,
      code: school.code,
      has_generations: school.has_generations,
      created_at: school.created_at,
      current_network: school.red_escuelas?.[0] ? {
        id: school.red_escuelas[0].red_id,
        name: school.red_escuelas[0].redes_de_colegios?.name,
        assigned_at: school.red_escuelas[0].assigned_at
      } : null
    }));

    // Get summary statistics
    const totalSchools = schools?.length || 0;
    const assignedSchools = schools?.filter((s: any) => s.red_escuelas && s.red_escuelas.length > 0).length || 0;
    const unassignedSchools = totalSchools - assignedSchools;

    return res.status(200).json({
      success: true,
      schools: cleanSchools,
      summary: {
        total_schools: totalSchools,
        assigned_schools: assignedSchools,
        unassigned_schools: unassignedSchools,
        available_for_assignment: cleanSchools.length
      }
    });
  } catch (error) {
    console.error('Error in handleGetAvailableSchools:', error);
    return res.status(500).json({ error: 'Error al obtener escuelas disponibles' });
  }
}