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
import { logAuthEvent } from '../../../lib/securityAuditLog';
import { firstPasswordPolicyError } from '../../../lib/auth/password-policy';
import {
  completePasswordChange,
  isCompletionFailure,
} from '../../../lib/auth/password-completion';

// Rate limiter for password change (auth-level: 10 req/min)
const rateLimitCheck = rateLimit(RATE_LIMITS.auth, 'change-password');

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
    // F3: `auth.getUser()`, not `auth.getSession()`. getSession decodes the
    // session cookie and hands back whatever it contains; getUser validates the
    // token with the auth server and returns the account it actually belongs to.
    // This handler is about to change a password — the identity it acts on must
    // come from the authority, not from the caller's own cookie.
    const supabase = await createApiSupabaseClient(req, res);
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user?.id || !user.email) {
      console.error('[Change Password API] No authenticated user:', userError);
      return sendAuthError(res, 'No autorizado', 401);
    }
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
    const passwordError = firstPasswordPolicyError(newPassword);
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
      email: user.email,
      password: currentPassword
    });

    if (verifyError) {
      console.log('[Change Password API] Current password verification failed');
      // Use generic error message for security
      return sendAuthError(res, 'La contraseña actual es incorrecta', 400);
    }

    // Current password verified — the write itself goes through the one trusted
    // path every completion shares (lib/auth/password-completion.ts), which
    // re-checks the shared policy, writes only the proved account, and records
    // `password_change_voluntary`. `clearFlag: false`: a voluntary change is
    // made by somebody who is NOT under the forced-change regime, so there is
    // nothing to clear — and clearing it here would let this endpoint release an
    // account the gate is deliberately holding.
    const supabaseAdmin = createServiceRoleClient();

    const result = await completePasswordChange(supabaseAdmin, {
      userId: user.id,
      newPassword,
      auditAction: 'password_change_voluntary',
      auditMetadata: { change_type: 'user_initiated' },
      clearFlag: false,
      logPrefix: '[Change Password API]',
    });

    if (isCompletionFailure(result)) {
      return sendAuthError(res, result.message, result.status);
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
      message: result.message,
      audited: result.audited,
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
