import type { NextApiRequest, NextApiResponse } from 'next';
import { checkIsAdminOrEquipoDirectivo, createServiceRoleClient, isValidSchoolIdInput } from '../../../lib/api-auth';
import { ED_ASSIGNABLE_ROLES, SCHOOL_SCOPED_ROLES_SET } from '../../../utils/roleUtils';
import type { UserRoleType } from '../../../types/roles';

// Mirrors assign-role.ts's canonical role list. Any role outside this set is
// rejected at the API boundary regardless of requester, so junk role strings
// can never reach user_metadata.role or user_roles.role_type.
const VALID_ROLES: readonly UserRoleType[] = [
  'admin',
  'consultor',
  'equipo_directivo',
  'lider_generacion',
  'lider_comunidad',
  'community_manager',
  'docente',
  'supervisor_de_red',
  'encargado_licitacion',
];

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { isAuthorized, role: requesterRole, schoolId: edSchoolId, error: authError } =
      await checkIsAdminOrEquipoDirectivo(req, res);

    if (authError) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!isAuthorized) {
      return res.status(403).json({ error: 'Solo administradores o equipo directivo pueden crear usuarios' });
    }

    if (requesterRole === 'equipo_directivo' && typeof edSchoolId !== 'number') {
      return res.status(403).json({ error: 'School context missing for equipo_directivo' });
    }

    const { email, password, firstName, lastName, role: bodyRole, schoolId: bodySchoolId } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const resolvedRole: string = bodyRole || 'docente';

    // Canonical role allow-list — mirrors assign-role.ts. Runs before
    // requester-specific checks so a junk role like 'superman' is rejected
    // for both admin and ED with a single, actionable 400.
    if (!(VALID_ROLES as readonly string[]).includes(resolvedRole)) {
      return res.status(400).json({ error: 'Rol inválido' });
    }

    // ED role-assignability is checked BEFORE schoolId shape validation so a
    // misdirected request (e.g. role='admin' + schoolId='abc') returns the
    // 403 role error instead of a 400 schoolId error. Mirrors assign-role.ts.
    if (requesterRole === 'equipo_directivo') {
      if (!(ED_ASSIGNABLE_ROLES as readonly string[]).includes(resolvedRole)) {
        return res.status(403).json({ error: 'Role not assignable by equipo_directivo' });
      }
    }

    let effectiveSchoolId: number | null;
    if (bodySchoolId === undefined || bodySchoolId === null) {
      effectiveSchoolId = null;
    } else {
      if (!isValidSchoolIdInput(bodySchoolId)) {
        return res.status(400).json({ error: 'schoolId inválido' });
      }
      effectiveSchoolId = Number(bodySchoolId);
    }

    if (requesterRole === 'equipo_directivo') {
      if (effectiveSchoolId !== null && effectiveSchoolId !== edSchoolId) {
        return res.status(403).json({ error: 'Cannot create user in another school' });
      }
      if (effectiveSchoolId === null) {
        effectiveSchoolId = edSchoolId as number;
      }
    }

    const supabaseAdmin = createServiceRoleClient();

    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        role: resolvedRole
      }
    });

    if (createError) {
      throw createError;
    }

    if (newUser.user) {
      const sid = effectiveSchoolId == null ? null : Number(effectiveSchoolId);

      try {
        const updateData: any = {
          email: email,
          approval_status: 'approved',
          must_change_password: false
        };

        if (firstName) updateData.first_name = firstName;
        if (lastName) updateData.last_name = lastName;
        if (firstName && lastName) updateData.name = `${firstName} ${lastName}`;
        if (sid !== null && Number.isFinite(sid)) {
          updateData.school_id = sid;
        }

        const { error: updateError } = await supabaseAdmin
          .from('profiles')
          .update(updateData)
          .eq('id', newUser.user.id);

        if (updateError) {
          throw updateError;
        }

        const roleInsertData: Record<string, unknown> = {
          user_id: newUser.user.id,
          role_type: resolvedRole
        };
        if (
          SCHOOL_SCOPED_ROLES_SET.has(resolvedRole) &&
          sid !== null &&
          Number.isFinite(sid)
        ) {
          roleInsertData.school_id = sid;
        }

        const { error: roleError } = await supabaseAdmin
          .from('user_roles')
          .insert(roleInsertData);

        if (roleError) {
          throw roleError;
        }

        return res.status(200).json({
          success: true,
          user: {
            id: newUser.user.id,
            email: newUser.user.email,
            firstName,
            lastName,
            role: resolvedRole
          }
        });

      } catch (error: any) {
        console.error('Error during user creation, rolling back:', error);

        try {
          // profiles.id has no FK to auth.users(id) in this schema (verified
          // 2026-05-11: the only profiles FKs are school_id/community_id/
          // generation_id), so auth.admin.deleteUser does NOT cascade.
          // Mirror delete-user.ts's forward-path cleanup: explicitly remove
          // user_roles and profiles before the auth user. Role-insert is the
          // only throwing step after profile update, so user_roles delete is
          // a no-op when role-insert is the failure point — kept for
          // defense-in-depth if future steps land between role-insert and
          // success.
          await supabaseAdmin
            .from('user_roles')
            .delete()
            .eq('user_id', newUser.user.id);
          await supabaseAdmin
            .from('profiles')
            .delete()
            .eq('id', newUser.user.id);
          await supabaseAdmin.auth.admin.deleteUser(newUser.user.id);
          console.log('Rolled back user creation');
        } catch (rollbackError) {
          console.error('Error during rollback:', rollbackError);
        }

        throw error;
      }
    }

    return res.status(500).json({ error: 'Failed to create user' });
  } catch (error: any) {
    console.error('Error creating user:', error);

    if (error.message?.includes('duplicate key') || error.message?.includes('already exists')) {
      return res.status(409).json({ error: 'A user with this email already exists' });
    }

    return res.status(500).json({
      error: error.message || 'Internal server error'
    });
  }
}
