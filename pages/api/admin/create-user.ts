import type { NextApiRequest, NextApiResponse } from 'next';
import { checkIsAdminOrEquipoDirectivo, createServiceRoleClient } from '../../../lib/api-auth';
import { ED_ASSIGNABLE_ROLES } from '../../../utils/roleUtils';

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
      return res.status(403).json({ error: 'Unauthorized. Only admins can create users.' });
    }

    if (requesterRole === 'equipo_directivo' && typeof edSchoolId !== 'number') {
      return res.status(403).json({ error: 'School context missing for equipo_directivo' });
    }

    const { email, password, firstName, lastName, role, schoolId } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    let effectiveSchoolId = schoolId;
    if (requesterRole === 'equipo_directivo') {
      if (schoolId !== undefined && schoolId !== null && Number(schoolId) !== edSchoolId) {
        return res.status(403).json({ error: 'Cannot create user in another school' });
      }
      if (schoolId === undefined || schoolId === null) {
        effectiveSchoolId = edSchoolId;
      }

      if (role !== undefined && role !== null && !(ED_ASSIGNABLE_ROLES as readonly string[]).includes(role)) {
        return res.status(403).json({ error: 'Role not assignable by equipo_directivo' });
      }
    }

    const supabaseAdmin = createServiceRoleClient();

    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        role: role || 'docente'
      }
    });

    if (createError) {
      throw createError;
    }

    if (newUser.user) {
      let profileCreated = false;
      let roleCreated = false;

      try {
        const updateData: any = {
          email: email,
          approval_status: 'approved',
          must_change_password: false
        };

        if (firstName) updateData.first_name = firstName;
        if (lastName) updateData.last_name = lastName;
        if (firstName && lastName) updateData.name = `${firstName} ${lastName}`;
        if (effectiveSchoolId) updateData.school_id = effectiveSchoolId;

        const { error: updateError } = await supabaseAdmin
          .from('profiles')
          .update(updateData)
          .eq('id', newUser.user.id);

        if (updateError) {
          throw updateError;
        }
        profileCreated = true;

        const roleInsertData: Record<string, unknown> = {
          user_id: newUser.user.id,
          role_type: role || 'docente'
        };
        if (requesterRole === 'equipo_directivo') {
          roleInsertData.school_id = edSchoolId;
        }

        const { error: roleError } = await supabaseAdmin
          .from('user_roles')
          .insert(roleInsertData);

        if (roleError) {
          console.error('Error creating user role:', roleError);
        } else {
          roleCreated = true;
        }

        return res.status(200).json({
          success: true,
          user: {
            id: newUser.user.id,
            email: newUser.user.email,
            firstName,
            lastName,
            role: role || 'docente'
          }
        });

      } catch (error: any) {
        console.error('Error during user creation, rolling back:', error);

        try {
          await supabaseAdmin.auth.admin.deleteUser(newUser.user.id);
          console.log('Rolled back auth user creation');

          if (profileCreated) {
            await supabaseAdmin
              .from('profiles')
              .delete()
              .eq('id', newUser.user.id);
            console.log('Rolled back profile creation');
          }

          if (roleCreated) {
            await supabaseAdmin
              .from('user_roles')
              .delete()
              .eq('user_id', newUser.user.id);
            console.log('Rolled back role creation');
          }
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
