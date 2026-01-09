import { NextApiRequest, NextApiResponse } from 'next';
import { getApiUser, createApiSupabaseClient, sendAuthError, handleMethodNotAllowed } from '@/lib/api-auth';

// Check if user has directivo permission for a specific school
async function hasDirectivoPermission(
  supabaseClient: any,
  userId: string,
  schoolId?: number
): Promise<{ hasPermission: boolean; schoolId: number | null; isAdmin: boolean }> {
  // Check for admin/consultor first
  const { data: roles } = await supabaseClient
    .from('user_roles')
    .select('role_type, school_id')
    .eq('user_id', userId)
    .eq('is_active', true);

  if (!roles || roles.length === 0) {
    return { hasPermission: false, schoolId: null, isAdmin: false };
  }

  const isAdmin = roles.some((r: any) => ['admin', 'consultor'].includes(r.role_type));

  if (isAdmin) {
    return { hasPermission: true, schoolId: schoolId || null, isAdmin: true };
  }

  // Check for directivo role
  const directivoRole = roles.find((r: any) => r.role_type === 'equipo_directivo');
  if (directivoRole) {
    if (schoolId && directivoRole.school_id !== schoolId) {
      return { hasPermission: false, schoolId: null, isAdmin: false };
    }
    return { hasPermission: true, schoolId: directivoRole.school_id, isAdmin: false };
  }

  return { hasPermission: false, schoolId: null, isAdmin: false };
}

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

  // Get school_id from query
  const querySchoolId = req.query.school_id ? parseInt(req.query.school_id as string) : undefined;

  // Permission check
  const { hasPermission, schoolId, isAdmin } = await hasDirectivoPermission(
    supabaseClient,
    user.id,
    querySchoolId
  );

  if (!hasPermission) {
    return res.status(403).json({
      error: 'Solo directivos y administradores pueden acceder a esta información'
    });
  }

  // For non-admin users, we must have a school_id
  if (!isAdmin && !schoolId) {
    return res.status(400).json({
      error: 'No se encontró escuela asociada al usuario'
    });
  }

  // For admin, require school_id in request
  if (isAdmin && !querySchoolId) {
    return res.status(400).json({
      error: 'Se requiere school_id para administradores'
    });
  }

  const effectiveSchoolId = isAdmin ? querySchoolId : schoolId;

  try {
    // Fetch docentes from this school
    // First get user_ids with docente role at this school
    const { data: docenteRoles, error: rolesError } = await supabaseClient
      .from('user_roles')
      .select('user_id')
      .eq('school_id', effectiveSchoolId)
      .eq('role_type', 'docente')
      .eq('is_active', true);

    if (rolesError) {
      console.error('Error fetching docente roles:', rolesError);
      return res.status(500).json({ error: 'Error al obtener docentes' });
    }

    if (!docenteRoles || docenteRoles.length === 0) {
      return res.status(200).json({ docentes: [] });
    }

    // Get profile info for these users
    const userIds = docenteRoles.map((r: any) => r.user_id);
    const { data: profiles, error: profilesError } = await supabaseClient
      .from('profiles')
      .select('id, full_name, first_name, last_name, email')
      .in('id', userIds);

    if (profilesError) {
      console.error('Error fetching profiles:', profilesError);
      return res.status(500).json({ error: 'Error al obtener perfiles de docentes' });
    }

    // Format response
    const docentes = (profiles || []).map((p: any) => ({
      id: p.id,
      full_name: p.full_name || `${p.first_name || ''} ${p.last_name || ''}`.trim() || p.email,
      email: p.email,
    }));

    return res.status(200).json({ docentes });
  } catch (err: any) {
    console.error('Unexpected error fetching docentes:', err);
    return res.status(500).json({ error: err.message || 'Error al obtener docentes' });
  }
}
