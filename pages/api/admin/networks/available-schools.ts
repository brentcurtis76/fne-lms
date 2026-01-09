/**
 * API endpoint to get ALL schools with their network assignment status
 * Returns all schools regardless of assignment, with network information
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

    return handleGetAllSchoolsWithStatus(supabaseAdmin, res);
  } catch (error) {
    console.error('Error in available-schools API:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

/**
 * GET /api/admin/networks/available-schools - Get ALL schools with network assignment status
 */
async function handleGetAllSchoolsWithStatus(
  supabase: any, 
  res: NextApiResponse
) {
  try {
    // Get all schools with their network assignment status using LEFT JOIN
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

    // Format the response with the required structure
    const formattedSchools = (schools || []).map((school: any) => {
      const assignment = school.red_escuelas?.[0];
      const isAssigned = !!assignment;
      
      return {
        id: school.id,
        name: school.name,
        is_assigned: isAssigned,
        assigned_network_id: assignment?.red_id || null,
        assigned_network_name: assignment?.redes_de_colegios?.name || null
      };
    });

    // Get summary statistics
    const totalSchools = schools?.length || 0;
    const assignedSchools = schools?.filter((s: any) => s.red_escuelas && s.red_escuelas.length > 0).length || 0;
    const unassignedSchools = totalSchools - assignedSchools;

    return res.status(200).json({
      success: true,
      schools: formattedSchools,
      summary: {
        total_schools: totalSchools,
        assigned_schools: assignedSchools,
        unassigned_schools: unassignedSchools
      }
    });
  } catch (error) {
    console.error('Error in handleGetAllSchoolsWithStatus:', error);
    return res.status(500).json({ error: 'Error al obtener escuelas' });
  }
}