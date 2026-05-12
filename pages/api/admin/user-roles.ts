import type { NextApiRequest, NextApiResponse } from 'next';
import { checkIsAdminOrEquipoDirectivo, createServiceRoleClient } from '../../../lib/api-auth';
import { SCHOOL_SCOPED_ROLES_SET } from '../../../utils/roleUtils';

const ROLE_PRIORITY = ['admin','consultor','equipo_directivo','supervisor_de_red','community_manager','lider_generacion','lider_comunidad','docente','encargado_licitacion'];

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const userId = req.query.userId as string;
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const {
      isAuthorized,
      role: requesterRole,
      schoolId: edSchoolId,
      user: requestingUser,
      error: authError,
    } = await checkIsAdminOrEquipoDirectivo(req, res);

    if (authError || !requestingUser) {
      return res.status(401).json({ error: 'No autorizado' });
    }

    if (!isAuthorized) {
      return res.status(403).json({ error: 'Solo administradores o equipo directivo pueden ver roles' });
    }

    if (requesterRole === 'equipo_directivo' && typeof edSchoolId !== 'number') {
      return res.status(403).json({ error: 'School context missing for equipo_directivo' });
    }

    const supabaseService = createServiceRoleClient();

    if (requesterRole === 'equipo_directivo') {
      // Target must be a user in ED's school. Mirrors delete-user.ts pattern.
      const { data: targetProfile, error: profileLookupError } = await supabaseService
        .from('profiles')
        .select('school_id')
        .eq('id', userId)
        .maybeSingle();

      if (profileLookupError) {
        return res.status(500).json({ error: 'Error verificando usuario' });
      }
      if (!targetProfile) {
        return res.status(404).json({ error: 'Usuario no encontrado' });
      }
      if (targetProfile.school_id !== edSchoolId) {
        return res.status(403).json({ error: 'No autorizado para ver roles de este usuario' });
      }
    }

    const { data: rolesData, error } = await supabaseService
      .from('user_roles')
      .select(`
        *,
        school:schools(*),
        generation:generations(*),
        community:growth_communities(*, school:schools(*), generation:generations(*))
      `)
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('assigned_at', { ascending: false, nullsFirst: false })
      .order('role_type', { ascending: true });

    if (error) {
      console.error('[user-roles API] Error fetching roles:', error);
      return res.status(500).json({ error: 'Error al obtener roles' });
    }

    // Defense-in-depth: ED users only see school-scoped roles tied to their
    // own school. The read-path filter at users.ts already excludes targets
    // with global/cross-school roles, but this protects direct URL access too.
    //
    // Strict equality on school_id: orphan rows (a school-scoped role_type
    // with school_id IS NULL) are filtered out here. A docente with no
    // school_id isn't actually scoped to any school, so no ED should see
    // it through the single-user roles view. The legacy null-row case is
    // handled by the list-page filter in users.ts (which surfaces them
    // during backfill) — the single-user roles view is intentionally
    // stricter.
    const filteredRoles =
      requesterRole === 'equipo_directivo'
        ? (rolesData || []).filter((r: { role_type: string; school_id: number | null }) => {
            return SCHOOL_SCOPED_ROLES_SET.has(r.role_type) && r.school_id === edSchoolId;
          })
        : rolesData || [];

    const sortedRoles = filteredRoles.sort((a: any, b: any) => {
      const aIndex = ROLE_PRIORITY.indexOf(a.role_type);
      const bIndex = ROLE_PRIORITY.indexOf(b.role_type);
      return (aIndex === -1 ? 99 : aIndex) - (bIndex === -1 ? 99 : bIndex);
    });

    const highestRole = sortedRoles[0]?.role_type || null;

    return res.status(200).json({
      roles: sortedRoles,
      highestRole,
    });
  } catch (error) {
    console.error('[user-roles API] Unexpected error:', error);
    return res.status(500).json({ error: 'Error inesperado al obtener roles' });
  }
}
