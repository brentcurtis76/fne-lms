import type { NextApiRequest, NextApiResponse } from 'next';
import { checkIsAdminOrEquipoDirectivo, createServiceRoleClient, isValidSchoolIdInput } from '../../../lib/api-auth';
import { SCHOOL_SCOPED_ROLES_SET } from '../../../utils/roleUtils';

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
      return res.status(403).json({ error: 'Solo administradores o equipo directivo pueden editar usuarios' });
    }

    if (requesterRole === 'equipo_directivo' && typeof edSchoolId !== 'number') {
      return res.status(403).json({ error: 'School context missing for equipo_directivo' });
    }

    const { userId, email, first_name, last_name, school, external_school_affiliation } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'ID de usuario requerido' });
    }

    const supabaseAdmin = createServiceRoleClient();

    // Server-fetched prior email — the only safe source for rollback/audit.
    // Never trust req.body.originalEmail: a client could omit it or send junk
    // and corrupt profiles.email if the auth-side update fails.
    let currentEmail: string | null | undefined;

    if (requesterRole === 'equipo_directivo') {
      if (req.body.school !== undefined && req.body.school !== null && req.body.school !== '') {
        return res.status(400).json({ error: 'No se puede modificar el colegio' });
      }
      if (req.body.school_id !== undefined && req.body.school_id !== null) {
        if (!isValidSchoolIdInput(req.body.school_id)) {
          return res.status(400).json({ error: 'school_id inválido' });
        }
        const coercedSchoolId = Number(req.body.school_id);
        if (coercedSchoolId !== edSchoolId) {
          return res.status(400).json({ error: 'No se puede modificar el colegio' });
        }
      }

      const { data: targetProfile, error: profileLookupError } = await supabaseAdmin
        .from('profiles')
        .select('school_id, email')
        .eq('id', userId)
        .maybeSingle();

      if (profileLookupError) {
        return res.status(500).json({ error: 'Error verificando usuario' });
      }
      if (!targetProfile) {
        return res.status(404).json({ error: 'Usuario no encontrado' });
      }

      if (targetProfile.school_id !== edSchoolId) {
        return res.status(403).json({ error: 'No autorizado para editar este usuario' });
      }

      currentEmail = targetProfile.email;

      // TOCTOU: this user_roles read is a point-in-time check. A concurrent
      // role grant landing between this gate and the update write below could
      // allow a global-role escalation to slip through. The practical
      // mitigation is that role assignment is restricted to admin tooling.
      // Defense-in-depth: reject if the target holds any active role outside
      // SCHOOL_SCOPED_ROLES (admin/consultor/supervisor_de_red/community_manager).
      const { data: targetRoles, error: rolesLookupError } = await supabaseAdmin
        .from('user_roles')
        .select('role_type')
        .eq('user_id', userId)
        .eq('is_active', true);

      if (rolesLookupError) {
        return res.status(500).json({ error: 'Error verificando roles del usuario' });
      }
      const hasGlobalRole = (targetRoles ?? []).some(
        (r: { role_type: string }) => !SCHOOL_SCOPED_ROLES_SET.has(r.role_type),
      );
      if (hasGlobalRole) {
        return res.status(403).json({ error: 'No autorizado para editar este usuario' });
      }
    }

    if (requesterRole === 'admin' && email) {
      const { data: targetProfile, error: profileLookupError } = await supabaseAdmin
        .from('profiles')
        .select('email')
        .eq('id', userId)
        .maybeSingle();

      if (profileLookupError) {
        return res.status(500).json({ error: 'Error verificando usuario' });
      }
      if (!targetProfile) {
        return res.status(404).json({ error: 'Usuario no encontrado' });
      }

      currentEmail = targetProfile.email;
    }

    const updateData: Record<string, unknown> = {
      first_name: first_name?.trim() || null,
      last_name: last_name?.trim() || null,
      email: email?.trim(),
      external_school_affiliation: external_school_affiliation || null,
    };
    if (requesterRole === 'admin') {
      updateData.school = school?.trim() || null;
    }

    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .update(updateData)
      .eq('id', userId);

    if (profileError) {
      console.error('Error updating profile:', profileError);
      return res.status(500).json({ error: 'Error al actualizar el perfil' });
    }

    // ED is intentionally allowed to update a target user's email/name per the
    // user-management plan; school and role changes are gated separately above.
    if (email) {
      const { error: authUpdateError } = await supabaseAdmin.auth.admin.updateUserById(
        userId,
        { email: email.trim() }
      );

      if (authUpdateError) {
        console.error('Error updating auth email:', authUpdateError);
        // Rollback to the server-fetched prior email, never to client input.
        await supabaseAdmin
          .from('profiles')
          .update({ email: currentEmail })
          .eq('id', userId);

        return res.status(500).json({ error: 'Error al actualizar el email: ' + authUpdateError.message });
      }
    }

    // Log the update in audit_logs
    await supabaseAdmin
      .from('audit_logs')
      .insert({
        user_id: requestingUser.id,
        action: 'update_user',
        table_name: 'profiles',
        record_id: userId,
        details: {
          updated_fields: {
            email: email && email !== currentEmail ? { from: currentEmail, to: email } : undefined,
            first_name,
            last_name,
            school: requesterRole === 'admin' ? school : undefined,
            external_school_affiliation,
          },
        },
      });

    return res.status(200).json({ success: true, message: 'Usuario actualizado exitosamente' });

  } catch (error) {
    console.error('Error in update-user:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}
