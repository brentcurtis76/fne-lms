import type { NextApiRequest, NextApiResponse } from 'next';
import { checkIsAdminOrEquipoDirectivo, createServiceRoleClient } from '../../../lib/api-auth';
import {
  ED_FORBIDDEN_TARGET_ROLES_SET,
  SCHOOL_SCOPED_ROLES_SET,
} from '../../../utils/roleUtils';
import { teardownPlatformUser } from '../../../lib/userTeardown';
import { logDataAccessEvent } from '../../../lib/securityAuditLog';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
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
      return res.status(403).json({ error: 'Solo administradores o equipo directivo pueden eliminar usuarios' });
    }

    if (requesterRole === 'equipo_directivo' && typeof edSchoolId !== 'number') {
      return res.status(403).json({ error: 'School context missing for equipo_directivo' });
    }

    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    if (userId === requestingUser.id) {
      return res.status(400).json({ error: 'No puedes eliminar tu propia cuenta' });
    }

    const supabaseAdmin = createServiceRoleClient();

    if (requesterRole === 'equipo_directivo') {
      const { data: targetProfile, error: profileLookupError } = await supabaseAdmin
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
        return res.status(403).json({ error: 'No autorizado para eliminar este usuario' });
      }

      // Note: this is a TOCTOU read. Concurrent role grants between this
      // check and the cascade/write below could let a global-role escalation
      // slip through. Both admin and equipo_directivo can reach this code
      // path, widening the exposure beyond admin-only tooling. Tracked in
      // PR #19 follow-ups as "TOCTOU residual risk hardening (Postgres
      // function or partial unique index)".
      // Defense-in-depth: reject if the target holds any active role either
      // (a) in ED_FORBIDDEN_TARGET_ROLES (admin/consultor/community_manager/
      // supervisor_de_red) or (b) school-scoped but tied to a different
      // school. Two conceptually distinct gates: forbidden-role membership
      // vs. cross-school scope. The profile check above only covers
      // profiles.school_id; a target may still hold a stale or cross-school
      // role row whose school_id does not match the ED's school.
      const { data: targetRoles, error: rolesLookupError } = await supabaseAdmin
        .from('user_roles')
        .select('role_type, school_id')
        .eq('user_id', userId)
        .eq('is_active', true);

      if (rolesLookupError) {
        return res.status(500).json({ error: 'Error verificando roles del usuario' });
      }
      const hasForbiddenRole = (targetRoles ?? []).some(
        (r: { role_type: string }) => ED_FORBIDDEN_TARGET_ROLES_SET.has(r.role_type),
      );
      const hasCrossSchoolRole = (targetRoles ?? []).some(
        (r: { role_type: string; school_id: number | null }) =>
          SCHOOL_SCOPED_ROLES_SET.has(r.role_type) &&
          r.school_id !== null &&
          r.school_id !== edSchoolId,
      );
      if (hasForbiddenRole || hasCrossSchoolRole) {
        return res.status(403).json({ error: 'No autorizado para eliminar este usuario' });
      }
    }

    console.log('Authorization verified. Deleting user:', userId);

    // Shared teardown: platform_feedback -> user_roles -> profiles -> auth.users.
    // Throws only if the profile delete fails (mirrors prior behavior).
    let teardown;
    try {
      teardown = await teardownPlatformUser(supabaseAdmin, userId);
    } catch (teardownError: any) {
      console.error('Error deleting profile:', teardownError);
      return res.status(500).json({ error: teardownError?.message || 'Failed to delete user profile' });
    }

    // Hygiene (see remove-role.ts): the teardown removed this user's
    // `user_roles` rows, so drop them from the materialized view too rather
    // than leaving them to be served on getUserRoles()' degraded path.
    const { error: cacheRefreshError } = await supabaseAdmin.rpc('refresh_user_roles_cache');
    if (cacheRefreshError) {
      console.error('[delete-user API] Failed to refresh user_roles_cache:', cacheRefreshError);
    }

    logDataAccessEvent('USER_DELETED', {
      userId: requestingUser.id,
      targetUserId: userId,
      req,
      details: {
        rolesDeleted: teardown.rolesDeleted,
        authUserDeleted: teardown.authUserDeleted,
        via: 'admin/delete-user',
      },
    });

    return res.status(200).json({
      success: true,
      message: 'User deleted successfully',
      profileDeleted: teardown.profileDeleted,
      authUserDeleted: teardown.authUserDeleted,
      deletedRecords: teardown.profileRowsDeleted,
    });

  } catch (error: any) {
    console.error('Delete user error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
