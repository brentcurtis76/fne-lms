import type { NextApiRequest, NextApiResponse } from 'next';
import { checkIsAdminOrEquipoDirectivo, createServiceRoleClient, isValidSchoolIdInput } from '../../../lib/api-auth';
import { Validators } from '../../../lib/types/api-auth.types';
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

    // Normalize email up front so every downstream branch sees the same value.
    // Presence is keyed off `req.body.email !== undefined` so null and empty
    // string are treated as intent-to-set (and then rejected), not omission.
    const hasEmail = req.body.email !== undefined;
    let trimmedEmail = '';
    if (hasEmail) {
      trimmedEmail = typeof email === 'string' ? email.trim() : '';
      if (trimmedEmail === '') {
        return res.status(400).json({ error: 'Email no puede estar vacío' });
      }
      if (!Validators.isEmail(trimmedEmail)) {
        return res.status(400).json({ error: 'Email inválido' });
      }
    }

    const supabaseAdmin = createServiceRoleClient();

    // Server-fetched prior profile — the only safe source for rollback/audit.
    // Never trust req.body.* echoes: a client could omit them or send junk
    // and corrupt profile fields if the auth-side update fails. We need ALL
    // mutable fields (not just email) so the rollback on auth-email failure
    // fully restores the row to its pre-update state.
    let currentEmail: string | null | undefined;
    let previousProfile: {
      email: string | null;
      first_name: string | null;
      last_name: string | null;
      school: string | null;
      external_school_affiliation: string | null;
    } | null = null;

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
        .select('school_id, email, first_name, last_name, school, external_school_affiliation')
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
      previousProfile = {
        email: targetProfile.email ?? null,
        first_name: targetProfile.first_name ?? null,
        last_name: targetProfile.last_name ?? null,
        school: targetProfile.school ?? null,
        external_school_affiliation: targetProfile.external_school_affiliation ?? null,
      };

      // Note: this is a TOCTOU read. Concurrent role grants between this
      // check and the update write below could let a global-role escalation
      // slip through. Both admin and equipo_directivo can reach this code
      // path, widening the exposure beyond admin-only tooling. Tracked in
      // PR #19 follow-ups as "TOCTOU residual risk hardening (Postgres
      // function or partial unique index)".
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

    if (requesterRole === 'admin' && hasEmail) {
      const { data: targetProfile, error: profileLookupError } = await supabaseAdmin
        .from('profiles')
        .select('email, first_name, last_name, school, external_school_affiliation')
        .eq('id', userId)
        .maybeSingle();

      if (profileLookupError) {
        return res.status(500).json({ error: 'Error verificando usuario' });
      }
      if (!targetProfile) {
        return res.status(404).json({ error: 'Usuario no encontrado' });
      }

      currentEmail = targetProfile.email;
      previousProfile = {
        email: targetProfile.email ?? null,
        first_name: targetProfile.first_name ?? null,
        last_name: targetProfile.last_name ?? null,
        school: targetProfile.school ?? null,
        external_school_affiliation: targetProfile.external_school_affiliation ?? null,
      };
    }

    // Build conditionally so callers can update a subset of fields without
    // accidentally nulling the others. A field is only written when its key
    // is present in the body — for name/school fields explicit `''` still
    // nulls (intentional clear), but omission preserves the existing value.
    // Email is the exception: presence is validated above, so by here
    // `trimmedEmail` is always a non-empty, well-formed address.
    const updateData: Record<string, unknown> = {};
    if (first_name !== undefined) updateData.first_name = first_name?.trim() || null;
    if (last_name !== undefined) updateData.last_name = last_name?.trim() || null;
    if (hasEmail) updateData.email = trimmedEmail;
    if (external_school_affiliation !== undefined) {
      updateData.external_school_affiliation = external_school_affiliation || null;
    }
    if (requesterRole === 'admin' && school !== undefined) {
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

    // Intentional policy: ED is permitted to update a target user's email
    // (both profiles.email and auth.users.email) for same-school targets
    // that have only school-scoped roles. The school + target-role gates
    // above (school_id match, no global roles) enforce that scope. See
    // `__tests__/api/admin/update-user.test.ts` — test "ED: can update
    // email of a same-school target with no global roles" — and the
    // user-management plan at
    // `.claude/plans/i-want-you-to-precious-riddle.md`. Be aware this is
    // an account-takeover capability inside the school scope (combined
    // with reset-password). Tightening requires product approval.
    if (hasEmail) {
      const { error: authUpdateError } = await supabaseAdmin.auth.admin.updateUserById(
        userId,
        { email: trimmedEmail }
      );

      if (authUpdateError) {
        console.error('Error updating auth email:', authUpdateError);
        // Rollback only the fields the forward path actually mutated, to the
        // server-fetched prior values. Mirrors the conditional updateData
        // shape so an unchanged column is never touched.
        if (previousProfile) {
          const rollbackUpdate: Record<string, unknown> = {};
          if ('email' in updateData) rollbackUpdate.email = previousProfile.email;
          if ('first_name' in updateData) rollbackUpdate.first_name = previousProfile.first_name;
          if ('last_name' in updateData) rollbackUpdate.last_name = previousProfile.last_name;
          if ('external_school_affiliation' in updateData) {
            rollbackUpdate.external_school_affiliation = previousProfile.external_school_affiliation;
          }
          if ('school' in updateData) rollbackUpdate.school = previousProfile.school;
          if (Object.keys(rollbackUpdate).length > 0) {
            await supabaseAdmin
              .from('profiles')
              .update(rollbackUpdate)
              .eq('id', userId);
          }
        } else {
          await supabaseAdmin
            .from('profiles')
            .update({ email: currentEmail })
            .eq('id', userId);
        }

        return res.status(500).json({ error: 'Error al actualizar el email: ' + authUpdateError.message });
      }
    }

    // Log the update in audit_logs. `requester_role` distinguishes
    // admin-initiated changes from ED-initiated changes — important because
    // ED can perform account-takeover operations (email + password reset)
    // within their school scope. Only fields actually mutated by this
    // request are recorded; omitted body keys do not appear in the audit.
    const updatedFields: Record<string, unknown> = {};
    if ('email' in updateData && trimmedEmail !== currentEmail) {
      updatedFields.email = { from: currentEmail, to: trimmedEmail };
    }
    if ('first_name' in updateData) updatedFields.first_name = first_name;
    if ('last_name' in updateData) updatedFields.last_name = last_name;
    if ('school' in updateData) updatedFields.school = school;
    if ('external_school_affiliation' in updateData) {
      updatedFields.external_school_affiliation = external_school_affiliation;
    }

    await supabaseAdmin
      .from('audit_logs')
      .insert({
        user_id: requestingUser.id,
        action: 'update_user',
        table_name: 'profiles',
        record_id: userId,
        details: {
          requester_role: requesterRole,
          requester_user_id: requestingUser.id,
          updated_fields: updatedFields,
        },
      });

    return res.status(200).json({ success: true, message: 'Usuario actualizado exitosamente' });

  } catch (error) {
    console.error('Error in update-user:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}
