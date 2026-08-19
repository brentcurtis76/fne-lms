import type { NextApiRequest, NextApiResponse } from 'next';
import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';
import { firstPasswordPolicyError } from '../../../lib/auth/password-policy';
import { recordSecurityAudit } from '../../../lib/security/audit';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get the user's session
    const supabase = createPagesServerClient({ req, res });
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();

    if (sessionError || !session) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { newPassword } = req.body;

    if (!newPassword) {
      return res.status(400).json({ error: 'New password is required' });
    }

    // S5: one shared policy, and the messages are the es-CL ones the user sees
    // — this endpoint used to answer in English while the form it backs spoke
    // Spanish, so a rejected password produced an untranslated toast.
    const passwordError = firstPasswordPolicyError(newPassword);
    if (passwordError) {
      return res.status(400).json({ error: passwordError });
    }

    // Check if user actually needs to change password
    const { data: profile, error: profileCheckError } = await supabase
      .from('profiles')
      .select('must_change_password')
      .eq('id', session.user.id)
      .single();

    if (profileCheckError || !profile?.must_change_password) {
      return res.status(403).json({ error: 'Password change not required for this user' });
    }

    // Use admin client to update the password (bypasses secure password change requirement)
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      session.user.id,
      { password: newPassword }
    );

    if (updateError) {
      console.error('Admin password update error:', updateError);
      throw updateError;
    }

    // Clear the forced-change flag. Unlike the password write above this one
    // CANNOT be shrugged off: leaving it true after a successful change loops
    // the user straight back into /change-password on their next request, now
    // that S4 enforces the flag centrally instead of merely suggesting it.
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .update({
        must_change_password: false
      })
      .eq('id', session.user.id);

    if (profileError) {
      console.error('[force-password-change] could not clear must_change_password:', profileError);
      await recordSecurityAudit(supabaseAdmin, {
        action: 'password_change_forced',
        outcome: 'partial_failure',
        actorUserId: session.user.id,
        targetUserId: session.user.id,
        metadata: { stage: 'clear_flag', reason: 'profile_update_failed' },
      });
      return res.status(500).json({
        error:
          'Tu contraseña se actualizó, pero no pudimos completar el proceso. ' +
          'Vuelve a iniciar sesión; si el problema persiste, contacta al administrador.',
        code: 'FLAG_NOT_CLEARED',
      });
    }

    // Clear any admin reset metadata
    await supabaseAdmin.auth.admin.updateUserById(
      session.user.id,
      {
        user_metadata: {
          password_reset_by_admin: null,
          password_reset_at: null
        }
      }
    );

    // S3: fail-open and visible — the password is already changed.
    const audit = await recordSecurityAudit(supabaseAdmin, {
      action: 'password_change_forced',
      outcome: 'success',
      actorUserId: session.user.id,
      targetUserId: session.user.id,
      metadata: { change_type: 'forced_first_login' },
    });

    return res.status(200).json({ success: true, audited: audit.recorded });
  } catch (error: any) {
    console.error('Force password change error:', error);
    return res.status(500).json({ 
      error: 'Failed to update password',
      details: error.message 
    });
  }
}