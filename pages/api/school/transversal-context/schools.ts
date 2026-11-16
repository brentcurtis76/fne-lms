import type { NextApiRequest, NextApiResponse } from 'next';
import { getApiUser, createServiceRoleClient, sendAuthError, handleMethodNotAllowed } from '@/lib/api-auth';

/**
 * GET /api/school/transversal-context/schools
 *
 * School picker for the transversal-context and migration-plan pages and the
 * results panel.
 *   active admin or consultor -> every registered school (not narrowed by
 *                                consultant_assignments)
 *   others                    -> 403
 * With ?scope=assigned (Plan de Migración, Panel de Resultados; N8/GC-7) a
 * consultor who is not an admin gets only the schools those surfaces let them
 * open: their ACTIVE consultant_assignments and any school where they are an
 * active equipo_directivo (the scope of lib/permissions/resultsSchoolScope.ts).
 * An admin still gets every school.
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
      .select('role_type, school_id')
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
    if (req.query.scope === 'assigned' && !isAdmin) {
      const { data: assignments, error: assignmentsError } = await serviceClient
        .from('consultant_assignments')
        .select('school_id')
        .eq('consultant_id', user.id)
        .eq('is_active', true);
      if (assignmentsError) {
        console.error('Error fetching consultant assignments:', assignmentsError);
        return res.status(500).json({ error: 'No se pudieron obtener las escuelas' });
      }
      const ids = new Set<number>();
      for (const a of assignments || []) if (typeof a.school_id === 'number') ids.add(a.school_id);
      for (const r of userRoles || []) {
        if (r.role_type === 'equipo_directivo' && typeof r.school_id === 'number') ids.add(r.school_id);
      }
      assignedSchoolIds = [...ids];
      if (assignedSchoolIds.length === 0) {
        return res.status(200).json({ schools: [] });
      }
    }

    let schoolsQuery = serviceClient.from('schools').select('id, name');
    if (assignedSchoolIds) schoolsQuery = schoolsQuery.in('id', assignedSchoolIds);
    const { data: schools, error: schoolsError } = await schoolsQuery.order('name', { ascending: true });

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
