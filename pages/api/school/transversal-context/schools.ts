import { NextApiRequest, NextApiResponse } from 'next';
import { getApiUser, sendAuthError, handleMethodNotAllowed } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

/**
 * GET /api/school/transversal-context/schools
 *
 * Returns list of schools for the transversal context page.
 * - Admin/Consultor: Returns all active schools
 * - Directivo: Returns only their school
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return handleMethodNotAllowed(res, ['GET']);
  }

  const { user, error: authError } = await getApiUser(req, res);
  if (authError || !user) {
    return sendAuthError(res, 'Autenticación requerida');
  }

  try {
    // Get user roles (bypass RLS with admin client)
    const { data: roles, error: rolesError } = await supabaseAdmin
      .from('user_roles')
      .select('role_type, school_id')
      .eq('user_id', user.id)
      .eq('is_active', true);

    if (rolesError) {
      console.error('Error fetching roles:', rolesError);
      return res.status(500).json({ error: 'Error al verificar permisos' });
    }

    const isAdmin = roles?.some(r => ['admin', 'consultor'].includes(r.role_type)) || false;
    const directivoRole = roles?.find(r => r.role_type === 'equipo_directivo');

    if (!isAdmin && !directivoRole) {
      return res.status(403).json({ error: 'No tienes permiso para acceder a esta información' });
    }

    let schools: any[] = [];

    if (isAdmin) {
      // Admin/Consultor: Get all schools
      const { data, error } = await supabaseAdmin
        .from('schools')
        .select('id, name')
        .order('name');

      if (error) {
        console.error('Error fetching schools:', error);
        return res.status(500).json({ error: 'Error al cargar escuelas' });
      }

      schools = data || [];
    } else if (directivoRole?.school_id) {
      // Directivo: Get only their school
      const { data, error } = await supabaseAdmin
        .from('schools')
        .select('id, name')
        .eq('id', directivoRole.school_id)
        .single();

      if (error) {
        console.error('Error fetching school:', error);
        return res.status(500).json({ error: 'Error al cargar escuela' });
      }

      if (data) {
        schools = [data];
      }
    }

    return res.status(200).json({
      success: true,
      schools,
      isAdmin,
    });
  } catch (err: any) {
    console.error('Unexpected error:', err);
    return res.status(500).json({ error: err.message || 'Error interno del servidor' });
  }
}
