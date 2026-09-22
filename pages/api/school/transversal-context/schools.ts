import type { NextApiRequest, NextApiResponse } from 'next';
import { getApiUser, createServiceRoleClient, sendAuthError, handleMethodNotAllowed } from '@/lib/api-auth';

/**
 * GET /api/school/transversal-context/schools
 *
 * School picker for the transversal-context and migration-plan pages.
 *   active admin or consultor -> every registered school (not narrowed by
 *                                consultant_assignments)
 *   others                    -> 403
 * Response shape: { schools: [{ id, name }] } (consumed by
 * pages/school/transversal-context/index.tsx and pages/school/migration-plan/index.tsx).
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
    // Service-role client bypasses RLS, so the role read must stay scoped to
    // the caller's own ACTIVE rows via the explicit filters below.
    const serviceClient = createServiceRoleClient();

    const { data: userRoles, error: rolesError } = await serviceClient
      .from('user_roles')
      .select('role_type')
      .eq('user_id', user.id)
      .eq('is_active', true);

    if (rolesError) {
      console.error('Error fetching user roles:', rolesError);
      return res.status(500).json({ error: 'No se pudieron verificar los permisos' });
    }

    const roleTypes = new Set((userRoles || []).map((r: any) => r.role_type as string));
    const isAdmin = roleTypes.has('admin');
    const isConsultor = roleTypes.has('consultor');

    if (!isAdmin && !isConsultor) {
      return res.status(403).json({ error: 'Solo administradores y consultores pueden listar escuelas' });
    }

    const { data: schools, error: schoolsError } = await serviceClient
      .from('schools')
      .select('id, name')
      .order('name', { ascending: true });

    if (schoolsError) {
      console.error('Error fetching schools:', schoolsError);
      return res.status(500).json({ error: 'No se pudieron obtener las escuelas' });
    }

    return res.status(200).json({ schools: schools || [] });
  } catch (error) {
    console.error('Unexpected error in schools API:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}
