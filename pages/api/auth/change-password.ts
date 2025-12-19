import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import {
  createApiSupabaseClient,
  createServiceRoleClient,
  sendAuthError,
  sendApiResponse,
  validateRequestBody,
  logApiRequest
} from '../../../lib/api-auth';
import { ApiError, ApiSuccess } from '../../../lib/types/api-auth.types';
import { rateLimit, RATE_LIMITS } from '../../../lib/rateLimit';
import { logAuthEvent, logSecurityIncident } from '../../../lib/securityAuditLog';

// Rate limiter for password change (auth-level: 10 req/min)
const rateLimitCheck = rateLimit(RATE_LIMITS.auth, 'change-password');

// Password validation function (matches client-side)
function validatePassword(password: string): string | null {
  if (password.length < 8) {
    return 'La contraseña debe tener al menos 8 caracteres';
  }
  if (!/[A-Z]/.test(password)) {
    return 'La contraseña debe contener al menos una letra mayúscula';
  }
  if (!/[a-z]/.test(password)) {
    return 'La contraseña debe contener al menos una letra minúscula';
  }
  if (!/[0-9]/.test(password)) {
    return 'La contraseña debe contener al menos un número';
  }
  return null;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiSuccess<any> | ApiError>
) {
  logApiRequest(req, 'change-password');

  if (req.method !== 'POST') {
    return sendAuthError(res, 'Método no permitido', 405);
  }

  // Apply rate limiting
  const allowed = await rateLimitCheck(req, res);
  if (!allowed) return;

  try {
    // Get the authenticated user's session
    const supabase = await createApiSupabaseClient(req, res);
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();

    if (sessionError || !session?.user) {
      console.error('[Change Password API] No authenticated session:', sessionError);
      return sendAuthError(res, 'No autorizado', 401);
    }

    const user = session.user;
    console.log('[Change Password API] User requesting password change:', {
      userId: user.id,
      email: user.email?.split('@')[0] + '@***'
    });

    // Validate request body
    const { currentPassword, newPassword } = req.body;

    const validation = validateRequestBody<{ currentPassword: string; newPassword: string }>(
      req.body,
      ['currentPassword', 'newPassword']
    );

    if (!validation.valid) {
      return sendAuthError(
        res,
        `Campos requeridos faltantes: ${validation.missing.join(', ')}`,
        400
      );
    }

    // Validate new password meets requirements
    const passwordError = validatePassword(newPassword);
    if (passwordError) {
      return sendAuthError(res, passwordError, 400);
    }

    // Verify current password by attempting to sign in
    // Create a separate client for verification to not affect current session
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

    const verifyClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    const { error: verifyError } = await verifyClient.auth.signInWithPassword({
      email: user.email!,
      password: currentPassword
    });

    if (verifyError) {
      console.log('[Change Password API] Current password verification failed');
      // Use generic error message for security
      return sendAuthError(res, 'La contraseña actual es incorrecta', 400);
    }

    // Current password verified - now update to new password
    const supabaseAdmin = createServiceRoleClient();

    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      user.id,
      { password: newPassword }
    );

    if (updateError) {
      console.error('[Change Password API] Password update failed:', updateError);

      // Check for same password error
      if (updateError.message?.includes('same_password') ||
          updateError.message?.includes('different from the old password')) {
        return sendAuthError(res, 'La nueva contraseña debe ser diferente a la actual', 400);
      }

      return sendAuthError(res, 'Error al actualizar la contraseña', 500);
    }

    // Log the password change to audit_logs (database)
    const { error: logError } = await supabaseAdmin
      .from('audit_logs')
      .insert({
        user_id: user.id,
        action: 'password_change_voluntary',
        details: {
          change_type: 'user_initiated',
          ip_address: req.headers['x-forwarded-for'] || req.socket?.remoteAddress,
          user_agent: req.headers['user-agent']?.substring(0, 100),
          timestamp: new Date().toISOString()
        }
      });

    if (logError) {
      console.error('[Change Password API] Audit log failed:', logError);
      // Continue anyway - password was changed successfully
    }

    // Log to security audit (console/external service)
    logAuthEvent('PASSWORD_CHANGE', {
      userId: user.id,
      req,
      details: { change_type: 'user_initiated' }
    });

    console.log('[Change Password API] Password changed successfully for user:', user.id);

    return sendApiResponse(res, {
      success: true,
      message: 'Contraseña actualizada exitosamente'
    });

  } catch (error: any) {
    console.error('[Change Password API] Unexpected error:', {
      message: error.message,
      stack: error.stack
    });
    return sendAuthError(
      res,
      'Error interno del servidor',
      500
    );
  }
}
