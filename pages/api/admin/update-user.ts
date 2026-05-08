import type { NextApiRequest, NextApiResponse } from 'next';
import { checkIsAdminOrEquipoDirectivo, createServiceRoleClient } from '../../../lib/api-auth';

function isValidSchoolIdInput(v: unknown): v is number | string {
  if (typeof v === 'number') return Number.isFinite(v);
  if (typeof v === 'string') return /^-?\d+$/.test(v.trim());
  return false;
}

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
      return res.status(403).json({ error: 'Solo los administradores pueden editar usuarios' });
    }

    if (requesterRole === 'equipo_directivo' && typeof edSchoolId !== 'number') {
      return res.status(403).json({ error: 'School context missing for equipo_directivo' });
    }

    const { userId, email, first_name, last_name, school, external_school_affiliation } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'ID de usuario requerido' });
    }

    const supabaseAdmin = createServiceRoleClient();

    if (requesterRole === 'equipo_directivo') {
      if (req.body.school !== undefined) {
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
        return res.status(403).json({ error: 'No autorizado para editar este usuario' });
      }
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

    // If email is being changed, update auth email
    if (email) {
      const { error: authUpdateError } = await supabaseAdmin.auth.admin.updateUserById(
        userId,
        { email: email.trim() }
      );

      if (authUpdateError) {
        console.error('Error updating auth email:', authUpdateError);
        // Try to rollback profile email change
        await supabaseAdmin
          .from('profiles')
          .update({ email: req.body.originalEmail })
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
            email: email !== req.body.originalEmail ? { from: req.body.originalEmail, to: email } : undefined,
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
