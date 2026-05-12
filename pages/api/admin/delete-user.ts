import type { NextApiRequest, NextApiResponse } from 'next';
import { checkIsAdminOrEquipoDirectivo, createServiceRoleClient } from '../../../lib/api-auth';
import {
  ED_FORBIDDEN_TARGET_ROLES_SET,
  SCHOOL_SCOPED_ROLES_SET,
} from '../../../utils/roleUtils';

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

    console.log('Authorization verified. Attempting to delete user:', userId);

    // First, handle foreign key constraints by deleting or reassigning related data
    console.log('Handling foreign key constraints for user:', userId);

    // Delete user's feedback entries
    const { error: feedbackError } = await supabaseAdmin
      .from('platform_feedback')
      .delete()
      .eq('created_by', userId);

    if (feedbackError) {
      console.error('Error deleting feedback:', feedbackError);
    }

    // Delete user's roles
    const { error: rolesError } = await supabaseAdmin
      .from('user_roles')
      .delete()
      .eq('user_id', userId);

    if (rolesError) {
      console.error('Error deleting user roles:', rolesError);
    }

    // Now delete the user's profile
    console.log('Deleting profile for user:', userId);
    const { data: deleteData, error: deleteProfileError } = await supabaseAdmin
      .from('profiles')
      .delete()
      .eq('id', userId)
      .select();

    console.log('Profile deletion result:', { deleteData, deleteProfileError });

    if (deleteProfileError) {
      console.error('Error deleting profile:', deleteProfileError);
      return res.status(500).json({ error: `Failed to delete user profile: ${deleteProfileError.message}` });
    }

    // Delete from auth.users table (requires service role)
    console.log('Deleting auth user:', userId);
    const { error: deleteAuthError } = await supabaseAdmin.auth.admin.deleteUser(userId);

    if (deleteAuthError) {
      console.error('Error deleting auth user:', deleteAuthError);
      // Profile is already deleted, so we can still return partial success
    } else {
      console.log('Auth user deleted successfully');
    }

    return res.status(200).json({
      success: true,
      message: 'User deleted successfully',
      profileDeleted: true,
      authUserDeleted: !deleteAuthError,
      deletedRecords: deleteData?.length || 0,
    });

  } catch (error: any) {
    console.error('Delete user error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
