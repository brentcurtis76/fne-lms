import { NextApiRequest, NextApiResponse } from 'next';
import { getApiUser, createApiSupabaseClient, sendAuthError, handleMethodNotAllowed } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

/**
 * GET /api/school/transversal-context/docentes?school_id=X
 * Returns list of docentes for a school (for assignment dropdown)
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return handleMethodNotAllowed(res, ['GET']);
  }

  // Authentication check
  const { user, error: authError } = await getApiUser(req, res);
  if (authError || !user) {
    return sendAuthError(res, 'Autenticación requerida');
  }

  const supabaseClient = await createApiSupabaseClient(req, res);

  const schoolId = req.query.school_id ? parseInt(req.query.school_id as string) : null;
  if (!schoolId) {
    return res.status(400).json({ error: 'school_id es requerido' });
  }

  // Check if user has permission (admin, consultor, or directivo of this school)
  // Use admin client to check user's own roles (bypasses RLS)
  const { data: roles } = await supabaseAdmin
    .from('user_roles')
    .select('role_type, school_id')
    .eq('user_id', user.id)
    .eq('is_active', true);

  const isAdmin = roles?.some((r: any) => ['admin', 'consultor'].includes(r.role_type));
  const isSchoolDirectivo = roles?.some((r: any) =>
    r.role_type === 'equipo_directivo' && r.school_id === schoolId
  );

  if (!isAdmin && !isSchoolDirectivo) {
    return res.status(403).json({ error: 'No tienes permiso para ver docentes de esta escuela' });
  }

  try {
    // Get all docentes for this school using admin client (bypasses RLS)
    const { data: docenteRoles, error: rolesError } = await supabaseAdmin
      .from('user_roles')
      .select('user_id')
      .eq('role_type', 'docente')
      .eq('school_id', schoolId)
      .eq('is_active', true);

    if (rolesError) {
      console.error('Error fetching docente roles:', rolesError);
      return res.status(500).json({ error: 'Error al cargar docentes' });
    }

    console.log(`[API Docentes] Found ${docenteRoles?.length || 0} docente roles for school ${schoolId}`);

    if (!docenteRoles || docenteRoles.length === 0) {
      return res.status(200).json({ success: true, docentes: [] });
    }

    // Get profile info for these docentes
    const userIds = docenteRoles.map((r: any) => r.user_id);
    const { data: profiles, error: profilesError } = await supabaseAdmin
      .from('profiles')
      .select('id, first_name, last_name, email')
      .in('id', userIds);

    if (profilesError) {
      console.error('Error fetching profiles:', profilesError);
      return res.status(500).json({ error: 'Error al cargar perfiles' });
    }

    const docentes = (profiles || []).map((p: any) => ({
      id: p.id,
      full_name: [p.first_name, p.last_name].filter(Boolean).join(' ') || p.email,
      email: p.email,
    }));

    console.log(`[API Docentes] Returning ${docentes.length} docentes for school ${schoolId}`);

    return res.status(200).json({ success: true, docentes });
  } catch (err: any) {
    console.error('Unexpected error fetching docentes:', err);
    return res.status(500).json({ error: err.message || 'Error al cargar docentes' });
  }
}
