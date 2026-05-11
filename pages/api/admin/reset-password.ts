import { NextApiRequest, NextApiResponse } from 'next';
import {
  checkIsAdminOrEquipoDirectivo,
  createServiceRoleClient,
  sendAuthError,
  sendApiResponse,
  validateRequestBody,
  logApiRequest
} from '../../../lib/api-auth';
import { ApiError, ApiSuccess } from '../../../lib/types/api-auth.types';
import { rateLimit, RATE_LIMITS } from '../../../lib/rateLimit';
import { SCHOOL_SCOPED_ROLES_SET } from '../../../utils/roleUtils';

// Rate limiter for password reset (auth-level: 10 req/min)
const rateLimitCheck = rateLimit(RATE_LIMITS.auth, 'admin-reset-password');

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiSuccess<any> | ApiError>
) {
  // Log the request
  logApiRequest(req, 'reset-password');

  if (req.method !== 'POST') {
    return sendAuthError(res, 'Method not allowed', 405);
  }

  // Apply rate limiting
  const allowed = await rateLimitCheck(req, res);
  if (!allowed) return;

  try {
    // Verify admin or equipo_directivo access using the centralized auth utility
    const {
      isAuthorized,
      role: requesterRole,
      schoolId: edSchoolId,
      user,
      error,
    } = await checkIsAdminOrEquipoDirectivo(req, res);

    console.log('[Reset Password API] Auth check result:', {
      isAuthorized,
      role: requesterRole,
      userId: user?.id,
      error: error?.message,
    });

    if (error || !user) {
      console.error('[Reset Password API] Authentication failed:', error);
      return sendAuthError(res, 'Authentication required', 401);
    }

    if (!isAuthorized) {
      console.error(
        '[Reset Password API] Solo administradores o equipo directivo pueden restablecer contraseñas:',
        user.id,
      );
      return sendAuthError(
        res,
        'Solo administradores o equipo directivo pueden restablecer contraseñas',
        403,
      );
    }

    if (requesterRole === 'equipo_directivo' && typeof edSchoolId !== 'number') {
      return sendAuthError(res, 'School context missing for equipo_directivo', 403);
    }

    // Create service role client for admin operations
    const supabaseAdmin = createServiceRoleClient();

    const { userId, temporaryPassword } = req.body;

    // Validate required fields
    const validation = validateRequestBody<{ userId: string; temporaryPassword: string }>(
      req.body,
      ['userId', 'temporaryPassword']
    );

    if (!validation.valid) {
      return sendAuthError(
        res,
        `Missing required fields: ${validation.missing.join(', ')}`,
        400
      );
    }

    if (userId === user.id) {
      return sendAuthError(
        res,
        'No puedes restablecer tu propia contraseña — usa el flujo normal de recuperación',
        400,
      );
    }

    // For equipo_directivo, verify the target user belongs to the same school
    // before performing any password reset work.
    if (requesterRole === 'equipo_directivo') {
      const { data: targetProfile, error: profileLookupError } = await supabaseAdmin
        .from('profiles')
        .select('school_id')
        .eq('id', userId)
        .maybeSingle();

      if (profileLookupError) {
        return sendAuthError(res, 'Error verificando usuario', 500);
      }
      if (!targetProfile) {
        return sendAuthError(res, 'Usuario no encontrado', 404);
      }
      if (targetProfile.school_id !== edSchoolId) {
        return sendAuthError(
          res,
          'No autorizado para restablecer la contraseña de este usuario',
          403,
        );
      }

      // TOCTOU: this user_roles read is a point-in-time check. A concurrent
      // role grant landing between this gate and the password write below
      // could allow a global-role escalation to slip through. The practical
      // mitigation is that role assignment is restricted to admin tooling.
      // Defense-in-depth: reject if the target holds any active role outside
      // SCHOOL_SCOPED_ROLES (admin/consultor/supervisor_de_red/community_manager).
      const { data: targetRoles, error: rolesLookupError } = await supabaseAdmin
        .from('user_roles')
        .select('role_type')
        .eq('user_id', userId)
        .eq('is_active', true);

      if (rolesLookupError) {
        return sendAuthError(res, 'Error verificando roles del usuario', 500);
      }
      const hasGlobalRole = (targetRoles ?? []).some(
        (r: { role_type: string }) => !SCHOOL_SCOPED_ROLES_SET.has(r.role_type),
      );
      if (hasGlobalRole) {
        return sendAuthError(
          res,
          'No autorizado para restablecer la contraseña de este usuario',
          403,
        );
      }
    }

    // Log the userId we're trying to update
    console.log('[Reset Password API] Attempting to reset password for userId:', userId);

    // Update the user's password
    const { data: updateData, error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      userId,
      { 
        password: temporaryPassword,
        user_metadata: { 
          password_change_required: true,
          password_reset_by_admin: true,
          password_reset_at: new Date().toISOString()
        }
      }
    );

    if (updateError) {
      console.error('Error updating password:', updateError);
      return sendAuthError(res, 'Failed to reset password', 500, updateError.message);
    }

    // Update the profile to indicate password change is required
    const { error: profileUpdateError } = await supabaseAdmin
      .from('profiles')
      .update({ 
        password_change_required: true,
        updated_at: new Date().toISOString()
      })
      .eq('id', userId);

    if (profileUpdateError) {
      console.error('Error updating profile:', profileUpdateError);
      // Continue anyway as the password was already reset
    }

    // Log the password reset action. `requester_role` distinguishes
    // admin-initiated resets from ED-initiated resets — important because
    // password reset is one half of ED's account-takeover capability inside
    // their school scope (the other half is the email-change path in
    // update-user.ts).
    const { error: logError } = await supabaseAdmin
      .from('audit_logs')
      .insert({
        user_id: user.id,  // Use the authenticated user from checkIsAdmin
        action: 'password_reset',
        details: {
          target_user_id: userId,
          requester_role: requesterRole,
          requester_user_id: user.id,
          timestamp: new Date().toISOString()
        }
      });

    if (logError) {
      console.error('Error logging password reset:', logError);
      // Continue anyway as this is not critical
    }

    // Return success response using standardized format
    return sendApiResponse(res, {
      success: true,
      message: 'Password reset successfully',
      user: updateData.user
    });

  } catch (error: any) {
    console.error('[Reset Password API] Unexpected error:', {
      message: error.message,
      stack: error.stack,
      code: error.code,
      details: error
    });
    return sendAuthError(
      res, 
      'Internal server error', 
      500, 
      error.message || 'An unexpected error occurred'
    );
  }
}