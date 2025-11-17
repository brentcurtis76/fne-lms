/**
 * API endpoint to fetch all schools with their current network assignments
 * Used for the improved school assignment modal that shows all schools
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';
import { hasAdminPrivileges } from '../../../../utils/roleUtils';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
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
      return res.status(401).json({ error: 'No autenticado' });
    }

    // Verify environment variables
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error('Missing required environment variables');
      return res.status(500).json({ 
        error: 'Configuración del servidor incompleta',
        details: 'Missing environment variables'
      });
    }

    // Create service role client properly
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    // Check admin privileges
    let isAdmin = false;
    try {
      isAdmin = await hasAdminPrivileges(supabaseAdmin, user.id);
    } catch (adminCheckError) {
      console.error('Error checking admin privileges:', adminCheckError);
      // If the check fails, try a simpler approach
      const { data: roleData } = await supabaseAdmin
        .from('user_roles')
        .select('role_type')
        .eq('user_id', user.id)
        .eq('role_type', 'admin')
        .eq('is_active', true)
        .single();
      
      isAdmin = !!roleData;
    }

    if (!isAdmin) {
      return res.status(403).json({ error: 'Solo administradores pueden gestionar redes' });
    }

    // Debug: Log the query attempt
    console.log('Fetching all schools from database...');

    // First fetch all schools
    const { data: schools, error: schoolsError } = await supabaseAdmin
      .from('schools')
      .select('id, name, has_generations')
      .order('name');

    if (schoolsError) {
      console.error('Error fetching schools:', schoolsError);
      return res.status(500).json({ 
        error: 'Error al obtener escuelas',
        details: schoolsError.message,
        code: schoolsError.code
      });
    }

    // Then fetch all network assignments with network details
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
      // Don't fail if assignments can't be fetched, just continue without them
    }

    console.log(`Found ${schools?.length || 0} schools`);

    // Create a map of school assignments
    const schoolAssignments = new Map();
    if (assignments) {
      assignments.forEach((assignment: any) => {
        const redes = Array.isArray(assignment.redes_de_colegios) ? assignment.redes_de_colegios[0] : assignment.redes_de_colegios;
        if (redes) {
          schoolAssignments.set(assignment.school_id, {
            id: redes.id,
            name: redes.name,
            assigned_at: assignment.assigned_at
          });
        }
      });
    }

    // Combine schools with their network assignments
    const formattedSchools = (schools || []).map(school => ({
      id: school.id,
      name: school.name,
      has_generations: school.has_generations,
      current_network: schoolAssignments.get(school.id) || null
    }));

    return res.status(200).json({
      success: true,
      schools: formattedSchools,
      total: formattedSchools.length
    });

  } catch (error) {
    console.error('Unexpected error in all-schools endpoint:', error);
    return res.status(500).json({ 
      error: 'Error interno del servidor',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}