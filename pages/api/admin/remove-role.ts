import { NextApiRequest, NextApiResponse } from 'next';
import { checkIsAdminOrEquipoDirectivo, createServiceRoleClient } from '../../../lib/api-auth';
import { ED_ASSIGNABLE_ROLES, SCHOOL_SCOPED_ROLES_SET } from '../../../utils/roleUtils';

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
      return res.status(403).json({ error: 'Solo administradores o equipo directivo pueden remover roles' });
    }

    if (requesterRole === 'equipo_directivo' && typeof edSchoolId !== 'number') {
      return res.status(403).json({ error: 'School context missing for equipo_directivo' });
    }

    const { roleId } = req.body;

    if (!roleId) {
      return res.status(400).json({ error: 'roleId is required' });
    }

    const supabaseService = createServiceRoleClient();

    if (requesterRole === 'equipo_directivo') {
      // Fetch the role row to verify scope, role type, and target user.
      const { data: roleRow, error: roleLookupError } = await supabaseService
        .from('user_roles')
        .select('id, user_id, role_type, school_id, is_active')
        .eq('id', roleId)
        .maybeSingle();

      if (roleLookupError) {
        return res.status(500).json({ error: 'Error verificando rol' });
      }
      if (!roleRow) {
        return res.status(404).json({ error: 'Rol no encontrado' });
      }

      // ED can only remove roles in ED_ASSIGNABLE_ROLES — never strip a
      // global/admin/consultor role from a user, even if that user happens
      // to be in their school.
      if (!(ED_ASSIGNABLE_ROLES as readonly string[]).includes(roleRow.role_type)) {
        return res.status(403).json({ error: 'No autorizado para remover este rol' });
      }

      // Target user must belong to ED's school.
      const { data: targetProfile, error: profileLookupError } = await supabaseService
        .from('profiles')
        .select('school_id')
        .eq('id', roleRow.user_id)
        .maybeSingle();

      if (profileLookupError) {
        return res.status(500).json({ error: 'Error verificando usuario' });
      }
      if (!targetProfile) {
        return res.status(404).json({ error: 'Usuario no encontrado' });
      }
      if (targetProfile.school_id !== edSchoolId) {
        return res.status(403).json({ error: 'No autorizado para remover roles de este usuario' });
      }

      // Defense-in-depth: reject if the target holds any OTHER active role
      // outside SCHOOL_SCOPED_ROLES, or any school-scoped active role tied
      // to a different school. Mirrors the gate used by delete-user/
      // assign-role/update-user.
      const { data: targetRoles, error: rolesLookupError } = await supabaseService
        .from('user_roles')
        .select('id, role_type, school_id')
        .eq('user_id', roleRow.user_id)
        .eq('is_active', true);

      if (rolesLookupError) {
        return res.status(500).json({ error: 'Error verificando roles del usuario' });
      }
      const hasForbiddenRole = (targetRoles ?? []).some(
        (r: { id: string; role_type: string; school_id: number | null }) => {
          if (r.id === roleRow.id) return false;
          if (!SCHOOL_SCOPED_ROLES_SET.has(r.role_type)) return true;
          return r.school_id !== null && r.school_id !== edSchoolId;
        },
      );
      if (hasForbiddenRole) {
        return res.status(403).json({ error: 'No autorizado para remover roles de este usuario' });
      }
    }

    // Deactivate the role (soft delete)
    const { data: roleData, error: roleError } = await supabaseService
      .from('user_roles')
      .update({ is_active: false })
      .eq('id', roleId)
      .select()
      .single();

    if (roleError) {
      console.error('Error removing role:', roleError);
      return res.status(500).json({ error: 'Error al remover rol' });
    }

    return res.status(200).json({
      success: true,
      role: roleData
    });

  } catch (error) {
    console.error('Unexpected error in remove-role API:', error);
    return res.status(500).json({ error: 'Error inesperado al remover rol' });
  }
}
