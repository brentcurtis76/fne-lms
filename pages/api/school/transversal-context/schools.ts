import type { NextApiRequest, NextApiResponse } from 'next';
import { getApiUser, createServiceRoleClient, sendAuthError, handleMethodNotAllowed } from '@/lib/api-auth';

/**
 * GET /api/school/transversal-context/schools
 *
 * School picker for the transversal-context and migration-plan pages.
 *   admin     -> every school
 *   consultor -> only the schools in their ACTIVE consultant_assignments
 *   others    -> 403
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
    // Service-role client: user_roles RLS only exposes the caller's own rows
    // anyway, and consultant_assignments is admin-managed.
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

    let assignedSchoolIds: number[] | null = null;

    if (!isAdmin) {
      const { data: assignments, error: assignmentsError } = await serviceClient
        .from('consultant_assignments')
        .select('school_id')
        .eq('consultant_id', user.id)
        .eq('is_active', true);

      if (assignmentsError) {
        console.error('Error fetching consultant assignments:', assignmentsError);
        return res.status(500).json({ error: 'No se pudieron verificar las escuelas asignadas' });
      }

      const schoolIds = [...new Set(
        (assignments || [])
          .map((a: any) => a.school_id)
          .filter((id: unknown): id is number => typeof id === 'number')
      )];

      if (schoolIds.length === 0) {
        return res.status(200).json({ schools: [] });
      }
      assignedSchoolIds = schoolIds;
    }

    let query = serviceClient
      .from('schools')
      .select('id, name')
      .order('name', { ascending: true });
    if (assignedSchoolIds) {
      query = query.in('id', assignedSchoolIds);
    }

    const { data: schools, error: schoolsError } = await query;

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
