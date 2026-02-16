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

    // Step 1: Query user_roles to fetch active consultor user IDs
    // Include global scope (school_id IS NULL) to match validation logic
    let roleQuery = serviceClient
      .from('user_roles')
      .select('user_id')
      .eq('role_type', 'consultor')
      .eq('is_active', true);

    if (school_id !== undefined) {
      const schoolIdNum = Number(school_id);
      // Include both school-scoped AND globally-scoped consultants
      roleQuery = roleQuery.or(`school_id.eq.${schoolIdNum},school_id.is.null`);
    }

    const { data: roleData, error: roleError } = await roleQuery;

    if (roleError) {
      console.error('Error fetching consultor user IDs from user_roles:', roleError);
      return sendAuthError(res, 'Error al consultar facilitadores', 500, roleError.message);
    }

    if (!roleData || roleData.length === 0) {
      // No consultants found, return empty list
      return sendApiResponse(res, { consultants: [] });
    }

    // Extract unique user IDs from role data
    const userIds = Array.from(new Set((roleData as any[]).map((row) => row.user_id)));

    // Step 2: Query profiles to hydrate user details
    const { data: profileData, error: profileError } = await serviceClient
      .from('profiles')
      .select('id, first_name, last_name, email')
      .in('id', userIds);

    if (profileError) {
      console.error('Error fetching profiles for consultants:', profileError);
      return sendAuthError(res, 'Error al consultar facilitadores', 500, profileError.message);
    }

    // Build consultant list with profile data
    const consultants: { id: string; first_name: string; last_name: string; email: string }[] = [];

    for (const profile of profileData || []) {
      if (!profile.id) continue;
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
