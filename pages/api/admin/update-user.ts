import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { hasAdminPrivileges } from '../../../utils/roleUtils';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get user token from authorization header
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ error: 'No autorizado' });
    }

    // Verify the user making the request
    const { data: { user: requestingUser }, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError || !requestingUser) {
      return res.status(401).json({ error: 'Token inválido' });
    }

    // Check if requesting user is admin
    // Pass the service role client to bypass RLS
    const isAdmin = await hasAdminPrivileges(supabaseAdmin, requestingUser.id);
    if (!isAdmin) {
      return res.status(403).json({ error: 'Solo los administradores pueden editar usuarios' });
    }

    const { userId, email, first_name, last_name, school } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'ID de usuario requerido' });
    }

    // Update profile data
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .update({
        first_name: first_name?.trim() || null,
        last_name: last_name?.trim() || null,
        school: school?.trim() || null,
        email: email?.trim() // Update email in profiles as well
      })
      .eq('id', userId);

    if (profileError) {
      console.error('Error updating profile:', profileError);
      return res.status(500).json({ error: 'Error al actualizar el perfil' });
    }

    // If email is being changed, update auth email
    if (email) {
      const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(
        userId,
        { email: email.trim() }
      );

      if (authError) {
        console.error('Error updating auth email:', authError);
        // Try to rollback profile email change
        await supabaseAdmin
          .from('profiles')
          .update({ email: req.body.originalEmail })
          .eq('id', userId);
        
        return res.status(500).json({ error: 'Error al actualizar el email: ' + authError.message });
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
            school
          }
        }
      });

    return res.status(200).json({ success: true, message: 'Usuario actualizado exitosamente' });

  } catch (error) {
    console.error('Error in update-user:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}