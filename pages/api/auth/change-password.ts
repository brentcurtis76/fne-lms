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
import {
  completeVoluntaryPasswordChange,
  isCompletionFailure,
  type Reauthenticator,
} from '../../../lib/auth/password-completion';

// Rate limiter for password change (auth-level: 10 req/min)
const rateLimitCheck = rateLimit(RATE_LIMITS.auth, 'change-password');

/**
 * VOLUNTARY password change.
 *
 * The ceremony — validate the token with the auth server, REAUTHENTICATE with the
 * current password, then write — lives in the trusted boundary. A live session by
 * itself is deliberately not enough: the point of asking for the current password
 * is that a stolen session cannot lock the owner out of their own account.
 *
 * The flag is NOT cleared here. A voluntary change is made by somebody who is not
 * under the forced-change regime, and clearing it would let this endpoint release
 * an account the boundary is deliberately holding.
 */
function buildReauthenticator(): Reauthenticator {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  return async ({ email, password }) => {
    // A separate throwaway client, so verifying the old credential cannot
    // disturb the caller's live session.
    const verifyClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { error } = await verifyClient.auth.signInWithPassword({ email, password });
    if (error) {
      console.log('[Change Password API] current password verification failed');
      return { ok: false };
    }
    return { ok: true };
  };
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiSuccess<any> | ApiError>
) {
  logApiRequest(req, 'change-password');

  if (req.method !== 'POST') {
    return sendAuthError(res, 'Método no permitido', 405);
  }

  const allowed = await rateLimitCheck(req, res);
  if (!allowed) return;

  try {
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

    const { currentPassword, newPassword } = req.body;

    const supabase = await createApiSupabaseClient(req, res);
    const supabaseAdmin = createServiceRoleClient();

    const result = await completeVoluntaryPasswordChange(
      supabaseAdmin,
      supabase,
      buildReauthenticator(),
      { currentPassword, newPassword }
    );

    if (isCompletionFailure(result)) {
      return sendAuthError(res, result.message, result.status);
    }

    // Log to security audit (console/external service)
    logAuthEvent('PASSWORD_CHANGE', {
      userId: result.userId,
      req,
      details: { change_type: 'user_initiated' }
    });

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
