/**
 * Simplified API endpoint to fetch all schools with their network assignments
 * This version bypasses complex auth checks for debugging
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Create authenticated Supabase client to check user
    const supabaseServerClient = createServerSupabaseClient({
      req,
      res,
    });

    const {
      data: { user },
    } = await supabaseServerClient.auth.getUser();

    if (!user) {
      return res.status(401).json({ error: 'No autenticado' });
    }

    // Create service role client for queries
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    // Simple admin check - just verify user has admin role
    const { data: adminCheck } = await supabaseAdmin
      .from('user_roles')
      .select('role_type')
      .eq('user_id', user.id)
      .eq('role_type', 'admin')
      .eq('is_active', true)
      .single();

    if (!adminCheck) {
      return res.status(403).json({ error: 'Solo administradores pueden gestionar redes' });
    }

    // Fetch all schools
    const { data: schools, error: schoolsError } = await supabaseAdmin
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
    const { data: assignments, error: assignmentsError } = await supabaseAdmin
      .from('red_escuelas')
      .select(`
        school_id,
        red_id,
        assigned_at,
        redes_de_colegios (
          id,
          name
        )
      `);

    if (assignmentsError) {
      console.error('Error fetching assignments:', assignmentsError);
    }

    // Create assignment map
    const schoolAssignments = new Map();
    if (assignments) {
      assignments.forEach(assignment => {
        if (assignment.redes_de_colegios) {
          schoolAssignments.set(assignment.school_id, {
            id: assignment.redes_de_colegios.id,
            name: assignment.redes_de_colegios.name,
            assigned_at: assignment.assigned_at
          });
        }
      });
    }

    // Combine data with the required format
    const schoolsWithNetworks = (schools || []).map(school => {
      const networkAssignment = schoolAssignments.get(school.id);
      return {
        id: school.id,
        name: school.name,
        is_assigned: !!networkAssignment,
        assigned_network_id: networkAssignment?.id || null,
        assigned_network_name: networkAssignment?.name || null,
        // Additional fields for backward compatibility
        has_generations: school.has_generations,
        current_network: networkAssignment || null
      };
    });

    return res.status(200).json({
      success: true,
      schools: schoolsWithNetworks,
      total: schoolsWithNetworks.length,
      summary: {
        total_schools: schoolsWithNetworks.length,
        assigned_schools: schoolsWithNetworks.filter(s => s.is_assigned).length,
        unassigned_schools: schoolsWithNetworks.filter(s => !s.is_assigned).length
      }
    });

  } catch (error) {
    console.error('Unexpected error in all-schools-simple endpoint:', error);
    return res.status(500).json({ 
      error: 'Error interno del servidor',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}