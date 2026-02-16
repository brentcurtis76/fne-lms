import { NextApiRequest, NextApiResponse } from 'next';
import {
  checkIsAdmin,
  createServiceRoleClient,
  sendAuthError,
  sendApiResponse,
  logApiRequest,
  handleMethodNotAllowed,
} from '../../../lib/api-auth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  logApiRequest(req, 'admin-consultants');

  if (req.method !== 'GET') {
    return handleMethodNotAllowed(res, ['GET']);
  }

  const { isAdmin, user, error: authError } = await checkIsAdmin(req, res);

  if (!isAdmin) {
    return sendAuthError(res, 'Solo administradores pueden consultar facilitadores', 403);
  }

  const { school_id } = req.query;

  // Validate school_id if provided
  if (school_id !== undefined) {
    const schoolIdNum = Number(school_id);
    if (Number.isNaN(schoolIdNum)) {
      return sendAuthError(res, 'school_id debe ser un número válido', 400);
    }
  }

  try {
    const serviceClient = createServiceRoleClient();
    const seenUserIds = new Set<string>();

    // Source 1: Users with consultor role assignment
    let roleQuery = serviceClient
      .from('user_roles')
      .select('user_id, profiles(id, first_name, last_name, email)')
      .eq('role_type', 'consultor')
      .eq('is_active', true);

    if (school_id !== undefined) {
      roleQuery = roleQuery.eq('school_id', Number(school_id));
    }

    const { data: roleData, error: roleError } = await roleQuery;

    if (roleError) {
      console.error('Error fetching consultants by role:', roleError);
      return sendAuthError(res, 'Error al consultar facilitadores', 500, roleError.message);
    }

    const consultants: { id: string; first_name: string; last_name: string; email: string }[] = [];

    // Add role-based consultants (Source 1: ONLY source of truth)
    for (const item of roleData || []) {
      const profile = (item as any).profiles;
      if (!profile || !item.user_id) continue;
      if (seenUserIds.has(item.user_id)) continue;
      seenUserIds.add(item.user_id);
      consultants.push({
        id: profile.id,
        first_name: profile.first_name || '',
        last_name: profile.last_name || '',
        email: profile.email || '',
      });
    }

    // Stable alphabetical ordering: last name, then first name
    consultants.sort((a, b) => {
      const lastCmp = a.last_name.localeCompare(b.last_name, 'es');
      if (lastCmp !== 0) return lastCmp;
      return a.first_name.localeCompare(b.first_name, 'es');
    });

    return sendApiResponse(res, { consultants });
  } catch (error: any) {
    console.error('Admin consultants error:', error);
    return sendAuthError(res, 'Error inesperado', 500, error.message);
  }
}
